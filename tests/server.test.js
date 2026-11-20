const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.ALLOW_PRIVATE = '1';
const { createServer } = require('../server.js');
const M = require('../lib.js');

function listen(server) {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
}

let upstreamBase;
let proxyBase;
let lastHeaders;
const servers = [];

const SEGMENT = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');

test.before(async () => {
    const upstream = http.createServer((req, res) => {
        lastHeaders = req.headers;
        const url = new URL(req.url, 'http://x');

        if (url.pathname === '/protected/master.m3u8') {
            if (req.headers.referer !== 'https://tv.example.com/') {
                res.writeHead(403);
                return res.end('forbidden');
            }
            res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
            return res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p/index.m3u8\n');
        }
        if (url.pathname === '/protected/720p/index.m3u8') {
            res.writeHead(200, { 'content-type': 'text/plain' });
            return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key.bin"\n#EXTINF:6,\nseg1.ts\n');
        }
        if (url.pathname === '/redirect.m3u8') {
            res.writeHead(302, { location: '/protected/720p/index.m3u8' });
            return res.end();
        }
        if (url.pathname === '/protected/720p/seg1.ts') {
            const range = req.headers.range && req.headers.range.match(/bytes=(\d+)-(\d+)/);
            if (range) {
                const [start, end] = [Number(range[1]), Number(range[2])];
                res.writeHead(206, {
                    'content-type': 'video/mp2t',
                    'content-range': `bytes ${start}-${end}/${SEGMENT.length}`,
                    'content-length': end - start + 1
                });
                return res.end(SEGMENT.subarray(start, end + 1));
            }
            res.writeHead(200, { 'content-type': 'video/mp2t', 'content-length': SEGMENT.length });
            return res.end(SEGMENT);
        }
        res.writeHead(404);
        res.end();
    });
    servers.push(upstream);
    upstreamBase = await listen(upstream);

    const proxy = createServer();
    servers.push(proxy);
    proxyBase = await listen(proxy);
});

test.after(() => {
    servers.forEach((s) => s.close());
});

const spec = { r: 'https://tv.example.com/', u: 'chrome-mac' };

test('serves the app and health endpoint', async () => {
    const index = await fetch(proxyBase + '/');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<title>Multi TV/);

    const health = await fetch(proxyBase + '/proxy/health');
    assert.deepEqual(await health.json(), { ok: true, app: 'multi-tv' });
});

test('does not expose files outside the app', async () => {
    for (const path of ['/server.js', '/package.json', '/../package.json', '/tests/server.test.js', '/.git/config']) {
        assert.equal((await fetch(proxyBase + path)).status, 404, path);
    }
});

test('sends Referer, Origin and browser headers upstream', async () => {
    const res = await fetch(M.proxyUrl(proxyBase, upstreamBase + '/protected/master.m3u8', spec));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('content-type'), 'application/vnd.apple.mpegurl');

    assert.equal(lastHeaders.referer, 'https://tv.example.com/');
    assert.equal(lastHeaders.origin, 'https://tv.example.com');
    assert.equal(lastHeaders['user-agent'], M.USER_AGENTS['chrome-mac'].ua);
    assert.equal(lastHeaders['sec-ch-ua-platform'], '"macOS"');
    assert.equal(lastHeaders['sec-fetch-mode'], 'cors');
});

test('without the right Referer the upstream refuses the stream', async () => {
    const res = await fetch(M.proxyUrl(proxyBase, upstreamBase + '/protected/master.m3u8', { u: 'chrome-mac' }));
    assert.equal(res.status, 403);
});

test('playlists are rewritten so every request goes through the proxy with the same headers', async () => {
    const master = await (await fetch(M.proxyUrl(proxyBase, upstreamBase + '/protected/master.m3u8', spec))).text();
    const variantPath = master.split('\n')[2];
    assert.ok(variantPath.startsWith('/proxy?url='), variantPath);

    const variantUrl = new URL(variantPath, proxyBase);
    assert.equal(variantUrl.searchParams.get('url'), upstreamBase + '/protected/720p/index.m3u8');
    assert.deepEqual(M.decodeProxySpec(variantUrl.searchParams.get('h')), spec);

    // text/plain playlists are detected by their #EXTM3U header
    const variant = await (await fetch(variantUrl)).text();
    const lines = variant.split('\n');
    assert.match(lines[1], /^#EXT-X-KEY:METHOD=AES-128,URI="\/proxy\?url=/);
    assert.equal(new URL(lines[1].match(/URI="([^"]+)"/)[1], proxyBase).searchParams.get('url'), upstreamBase + '/protected/key.bin');

    const segment = await fetch(new URL(lines[3], proxyBase));
    assert.equal(segment.status, 200);
    assert.equal(segment.headers.get('content-type'), 'video/mp2t');
    assert.deepEqual(Buffer.from(await segment.arrayBuffer()), SEGMENT);
    assert.equal(lastHeaders.referer, 'https://tv.example.com/');
});

test('relative URIs resolve against the final URL after redirects', async () => {
    const text = await (await fetch(M.proxyUrl(proxyBase, upstreamBase + '/redirect.m3u8', spec))).text();
    const segment = new URL(text.split('\n')[3], proxyBase);
    assert.equal(segment.searchParams.get('url'), upstreamBase + '/protected/720p/seg1.ts');
});

test('forwards Range requests', async () => {
    const res = await fetch(M.proxyUrl(proxyBase, upstreamBase + '/protected/720p/seg1.ts', spec), { headers: { range: 'bytes=2-5' } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-range'), `bytes 2-5/${SEGMENT.length}`);
    assert.equal(await res.text(), '2345');
});

test('answers CORS preflight', async () => {
    const res = await fetch(proxyBase + '/proxy?url=x', { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-headers'), /Range/);
});

test('rejects bad targets', async () => {
    assert.equal((await fetch(proxyBase + '/proxy')).status, 400);
    assert.equal((await fetch(proxyBase + '/proxy?url=' + encodeURIComponent('file:///etc/passwd'))).status, 400);
    assert.equal((await fetch(proxyBase + '/proxy?url=' + encodeURIComponent('http://127.0.0.1:1/x.m3u8'))).status, 502);
    assert.equal((await fetch(proxyBase + '/proxy', { method: 'POST' })).status, 405);
});
