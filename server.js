#!/usr/bin/env node
/**
 * Multi TV server: serves the app and proxies M3U8 streams with custom
 * Referer / Origin / User-Agent headers that browsers are not allowed to set.
 *
 *   PORT=8080 HOST=127.0.0.1 node server.js
 *   ALLOW_PRIVATE=1   also allow streams on localhost / private networks
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const M = require('./lib.js');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';
const TIMEOUT_MS = 20000;
const MAX_PLAYLIST_BYTES = 5 * 1024 * 1024;

const STATIC_FILES = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
    '/lib.js': ['lib.js', 'text/javascript; charset=utf-8']
};

const CORS_HEADERS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': 'Range',
    'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges'
};

const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'expires', 'last-modified', 'etag'];

function send(res, status, body, headers) {
    res.writeHead(status, Object.assign({ 'content-type': 'text/plain; charset=utf-8' }, CORS_HEADERS, headers || {}));
    res.end(body);
}

function serveStatic(req, res, pathname) {
    const entry = STATIC_FILES[pathname];
    if (!entry) {
        return send(res, 404, 'Not found');
    }
    fs.readFile(path.join(__dirname, entry[0]), (err, data) => {
        if (err) {
            return send(res, 500, 'Could not read file');
        }
        res.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
    });
}

function looksLikePlaylist(contentType, url) {
    return /mpegurl/i.test(contentType) || (/\.m3u8?$/i.test(new URL(url).pathname) && !/^(video|audio|image)\//i.test(contentType));
}

async function readLimited(body, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of body) {
        size += chunk.length;
        if (size > limit) {
            throw new Error('Playlist too large');
        }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function handleProxy(req, res, query) {
    let target;
    try {
        target = new URL(query.get('url') || '');
    } catch (e) {
        return send(res, 400, 'Invalid url parameter');
    }
    if (!/^https?:$/.test(target.protocol)) {
        return send(res, 400, 'Only http and https URLs are supported');
    }
    if (!ALLOW_PRIVATE && M.isPrivateHost(target.hostname)) {
        return send(res, 403, 'Private network addresses are blocked (set ALLOW_PRIVATE=1 to allow)');
    }

    const encodedSpec = query.get('h') || '';
    const spec = M.decodeProxySpec(encodedSpec);
    const headers = M.upstreamHeaders(spec);
    if (req.headers.range) {
        headers.range = req.headers.range;
    }

    let upstream;
    try {
        upstream = await fetch(target.href, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (e) {
        return send(res, 502, 'Upstream request failed: ' + (e.cause && e.cause.code ? e.cause.code : e.message));
    }

    const contentType = upstream.headers.get('content-type') || '';
    const finalUrl = upstream.url || target.href;

    if (upstream.ok && req.method !== 'HEAD' && upstream.body && looksLikePlaylist(contentType, finalUrl)) {
        let buffer;
        try {
            buffer = await readLimited(upstream.body, MAX_PLAYLIST_BYTES);
        } catch (e) {
            return send(res, 502, e.message);
        }

        const text = buffer.toString('utf8');
        if (text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')) {
            const rewritten = M.rewritePlaylist(text, finalUrl, (url) => '/proxy?url=' + encodeURIComponent(url) + '&h=' + encodedSpec);
            return send(res, 200, rewritten, {
                'content-type': 'application/vnd.apple.mpegurl',
                'cache-control': 'no-cache'
            });
        }

        const out = { 'cache-control': 'no-cache' };
        if (contentType) {
            out['content-type'] = contentType;
        }
        return send(res, upstream.status, buffer, out);
    }

    const out = Object.assign({}, CORS_HEADERS);
    PASSTHROUGH_HEADERS.forEach((name) => {
        const value = upstream.headers.get(name);
        if (value) {
            out[name] = value;
        }
    });
    if (out['content-length'] && upstream.headers.get('content-encoding')) {
        delete out['content-length'];
    }
    res.writeHead(upstream.status, out);

    if (!upstream.body || req.method === 'HEAD') {
        return res.end();
    }

    const stream = Readable.fromWeb(upstream.body);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
}

function createServer() {
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'OPTIONS') {
            res.writeHead(204, CORS_HEADERS);
            return res.end();
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return send(res, 405, 'Method not allowed');
        }
        if (url.pathname === '/proxy/health') {
            return send(res, 200, JSON.stringify({ ok: true, app: 'multi-tv' }), { 'content-type': 'application/json', 'cache-control': 'no-store' });
        }
        if (url.pathname === '/proxy') {
            return handleProxy(req, res, url.searchParams).catch((e) => {
                if (!res.headersSent) {
                    send(res, 500, 'Proxy error: ' + e.message);
                } else {
                    res.destroy();
                }
            });
        }
        return serveStatic(req, res, url.pathname);
    });
}

if (require.main === module) {
    createServer().listen(PORT, HOST, () => {
        console.log(`Multi TV is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    });
}

module.exports = { createServer };
