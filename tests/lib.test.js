const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib.js');

const CHANNEL = 'UCV6zcRug6Hqp1UX_FdyUeBg';
const VIDEO = 'dQw4w9WgXcQ';
const OTHER_CHANNEL = 'UCBR8-60-B28hp2BmDPdntcQ';

test('parseSource: bare channel and video IDs', () => {
    assert.deepEqual(M.parseSource(CHANNEL), { type: 'channel', id: CHANNEL });
    assert.deepEqual(M.parseSource(`  ${VIDEO}  `), { type: 'video', id: VIDEO });
});

test('parseSource: YouTube URL variants', () => {
    const videoUrls = [
        `https://www.youtube.com/watch?v=${VIDEO}`,
        `https://m.youtube.com/watch?v=${VIDEO}&t=10s`,
        `youtube.com/watch?v=${VIDEO}`,
        `https://youtu.be/${VIDEO}?si=abc`,
        `https://www.youtube.com/live/${VIDEO}?feature=share`,
        `https://www.youtube.com/embed/${VIDEO}`,
        `https://www.youtube-nocookie.com/embed/${VIDEO}`,
        `https://www.youtube.com/shorts/${VIDEO}`
    ];
    for (const url of videoUrls) {
        assert.deepEqual(M.parseSource(url), { type: 'video', id: VIDEO }, url);
    }

    const channelUrls = [
        `https://www.youtube.com/channel/${CHANNEL}`,
        `https://www.youtube.com/channel/${CHANNEL}/live`,
        `https://www.youtube.com/embed/live_stream?channel=${CHANNEL}`
    ];
    for (const url of channelUrls) {
        assert.deepEqual(M.parseSource(url), { type: 'channel', id: CHANNEL }, url);
    }
});

test('parseSource: rejects invalid input', () => {
    const invalid = [
        '',
        '   ',
        null,
        undefined,
        'abc',
        'https://vimeo.com/12345',
        `https://evil.com/watch?v=${VIDEO}`,
        'https://www.youtube.com/@cnnturk',
        'https://www.youtube.com/watch?v=short',
        'UCtooShort',
        'javascript:alert(1)'
    ];
    for (const value of invalid) {
        assert.equal(M.parseSource(value), null, String(value));
    }
});

test('parseSource: M3U8 stream URLs', () => {
    const urls = [
        'https://cdn.example.com/live/stream.m3u8',
        'http://cdn.example.com/live/playlist.m3u8?token=abc&exp=123',
        'https://cdn.example.com/hls/index.M3U8',
        'https://cdn.example.com/list.m3u',
        'https://cdn.example.com/play?file=channel.m3u8&token=x'
    ];
    for (const url of urls) {
        const parsed = M.parseSource(url);
        assert.equal(parsed && parsed.type, 'hls', url);
        assert.equal(parsed.url, new URL(url).href);
    }

    assert.equal(M.parseSource('cdn.example.com/stream.m3u8'), null, 'scheme is required');
    assert.equal(M.parseSource('ftp://cdn.example.com/stream.m3u8'), null);
    assert.equal(M.parseSource('https://cdn.example.com/stream.m3u8x'), null);
    assert.equal(M.parseSource('https://cdn.example.com/video.mp4'), null);
});

test('autoReferer uses the stream origin', () => {
    assert.equal(M.autoReferer('https://cdn.example.com:8443/live/a.m3u8?x=1'), 'https://cdn.example.com:8443/');
    assert.equal(M.autoReferer('not a url'), '');
});

test('proxy spec round-trips through the URL, including non-ASCII text', () => {
    const spec = M.proxySpec({ referer: 'https://site.com/canlı-yayın', userAgent: 'safari-iphone' });
    assert.deepEqual(spec, { r: 'https://site.com/canlı-yayın', u: 'safari-iphone' });
    const encoded = M.encodeProxySpec(spec);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(M.decodeProxySpec(encoded), spec);

    assert.deepEqual(M.proxySpec({ referer: 'javascript:alert(1)' }), {});
    assert.deepEqual(M.decodeProxySpec(''), {});
    assert.deepEqual(M.decodeProxySpec('%%%'), {});
    assert.deepEqual(M.decodeProxySpec(M.encodeProxySpec([1, 2])), {});
});

test('proxyUrl builds absolute and root-relative URLs', () => {
    const stream = 'https://cdn.example.com/a.m3u8?x=1&y=2';
    const relative = M.proxyUrl('', stream, {});
    assert.ok(relative.startsWith('/proxy?url='));
    const absolute = new URL(M.proxyUrl('http://127.0.0.1:8080/', stream, { r: 'https://site.com/' }));
    assert.equal(absolute.origin + absolute.pathname, 'http://127.0.0.1:8080/proxy');
    assert.equal(absolute.searchParams.get('url'), stream);
    assert.deepEqual(M.decodeProxySpec(absolute.searchParams.get('h')), { r: 'https://site.com/' });
});

test('upstreamHeaders imitate a real browser', () => {
    const chrome = M.upstreamHeaders({ r: 'https://site.com/watch/1', u: 'chrome-windows' });
    assert.match(chrome['user-agent'], /Chrome\/\d+/);
    assert.equal(chrome.referer, 'https://site.com/watch/1');
    assert.equal(chrome.origin, 'https://site.com');
    assert.equal(chrome['sec-ch-ua-platform'], '"Windows"');
    assert.equal(chrome['sec-fetch-site'], 'cross-site');
    assert.ok(chrome['accept-language']);

    const safari = M.upstreamHeaders({ u: 'safari-iphone' });
    assert.match(safari['user-agent'], /iPhone/);
    assert.equal(safari['sec-ch-ua'], undefined, 'Safari does not send client hints');
    assert.equal(safari.referer, undefined);
    assert.equal(safari.origin, undefined);

    assert.equal(M.upstreamHeaders({}).referer, undefined);
    assert.equal(M.upstreamHeaders({})['user-agent'], M.USER_AGENTS[M.DEFAULT_USER_AGENT].ua);
    assert.equal(M.upstreamHeaders({ u: 'MyPlayer/1.0\r\nX-Evil: 1' })['user-agent'], 'MyPlayer/1.0X-Evil: 1');
    assert.equal(M.upstreamHeaders({ u: 'constructor' })['user-agent'], 'constructor');
});

test('rewritePlaylist proxies every URI in a playlist', () => {
    const playlist = [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin?k=1",IV=0x1',
        '#EXT-X-MAP:URI="/init.mp4"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="TR",URI="audio/tr.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000',
        '720p/index.m3u8',
        '#EXTINF:6.0,',
        'https://other.cdn.com/seg-1.ts',
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://fairplay-key"',
        ''
    ].join('\r\n');

    const out = M.rewritePlaylist(playlist, 'https://cdn.example.com/live/master.m3u8?t=1', (u) => 'P(' + u + ')').split('\n');

    assert.equal(out[0], '#EXTM3U');
    assert.equal(out[1], '#EXT-X-VERSION:6');
    assert.equal(out[2], '#EXT-X-KEY:METHOD=AES-128,URI="P(https://cdn.example.com/live/key.bin?k=1)",IV=0x1');
    assert.equal(out[3], '#EXT-X-MAP:URI="P(https://cdn.example.com/init.mp4)"');
    assert.equal(out[4], '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="TR",URI="P(https://cdn.example.com/live/audio/tr.m3u8)"');
    assert.equal(out[6], 'P(https://cdn.example.com/live/720p/index.m3u8)');
    assert.equal(out[8], 'P(https://other.cdn.com/seg-1.ts)');
    assert.equal(out[9], '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://fairplay-key"', 'non-http URIs are left alone');
});

test('isPrivateHost blocks local and private networks', () => {
    for (const host of ['localhost', 'app.localhost', 'printer.local', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '[::1]', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '']) {
        assert.equal(M.isPrivateHost(host), true, host);
    }
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1', '2606:4700::1111']) {
        assert.equal(M.isPrivateHost(host), false, host);
    }
});

test('normalizeChannel adds stream options only to M3U8 channels', () => {
    assert.deepEqual(M.normalizeChannel({ name: 'YT', source: OTHER_CHANNEL, referer: 'https://x.com/' }), { name: 'YT', source: OTHER_CHANNEL });

    assert.deepEqual(M.normalizeChannel({ name: 'Live', source: 'https://cdn.example.com/a.m3u8' }), {
        name: 'Live',
        source: 'https://cdn.example.com/a.m3u8',
        referer: '',
        userAgent: M.DEFAULT_USER_AGENT,
        proxy: true
    });

    assert.deepEqual(
        M.normalizeChannel({ source: 'https://cdn.example.com/a.m3u8', referer: 'nope', userAgent: ' Custom/1 ', proxy: false }),
        { name: '', source: 'https://cdn.example.com/a.m3u8', referer: '', userAgent: 'Custom/1', proxy: false }
    );
    assert.equal(M.normalizeChannel({ source: 'bad' }), null);
});

test('normalizeSettings validates the proxy URL', () => {
    assert.equal(M.normalizeSettings({ proxyUrl: 'https://proxy.example.com///' }).proxyUrl, 'https://proxy.example.com');
    assert.equal(M.normalizeSettings({ proxyUrl: 'javascript:alert(1)' }).proxyUrl, '');
    assert.equal(M.normalizeSettings({}).proxyUrl, '');
});

test('isHandle detects @handle input', () => {
    assert.equal(M.isHandle('@cnnturk'), true);
    assert.equal(M.isHandle('https://www.youtube.com/@cnnturk/live'), true);
    assert.equal(M.isHandle(CHANNEL), false);
});

test('embedUrl: channel uses live_stream endpoint', () => {
    const url = new URL(M.embedUrl({ type: 'channel', id: CHANNEL }, { origin: 'https://example.com' }));
    assert.equal(url.origin + url.pathname, 'https://www.youtube.com/embed/live_stream');
    assert.equal(url.searchParams.get('channel'), CHANNEL);
    assert.equal(url.searchParams.get('autoplay'), '1');
    assert.equal(url.searchParams.get('mute'), '1');
    assert.equal(url.searchParams.get('enablejsapi'), '1');
    assert.equal(url.searchParams.get('playsinline'), '1');
    assert.equal(url.searchParams.get('origin'), 'https://example.com');
});

test('embedUrl: video embed and options', () => {
    const url = new URL(M.embedUrl({ type: 'video', id: VIDEO }, { autoplay: false, mute: false, origin: 'null' }));
    assert.equal(url.pathname, `/embed/${VIDEO}`);
    assert.equal(url.searchParams.get('channel'), null);
    assert.equal(url.searchParams.get('autoplay'), '0');
    assert.equal(url.searchParams.get('mute'), '0');
    assert.equal(url.searchParams.get('origin'), null);
});

test('gridLayout on a 16:9 screen', () => {
    const cases = {
        1: [1, 1],
        2: [2, 1],
        3: [2, 2],
        4: [2, 2],
        5: [3, 2],
        6: [3, 2],
        8: [3, 3],
        9: [3, 3],
        12: [4, 3],
        16: [4, 4],
        25: [5, 5]
    };
    for (const [count, [cols, rows]] of Object.entries(cases)) {
        assert.deepEqual(M.gridLayout(Number(count), 1920, 1080), { cols, rows }, `count=${count}`);
    }
});

test('gridLayout always fits every tile', () => {
    for (let n = 1; n <= M.MAX_CHANNELS; n++) {
        for (const [w, h] of [[1920, 1080], [390, 844], [1080, 1080], [3440, 1440]]) {
            const { cols, rows } = M.gridLayout(n, w, h);
            assert.ok(cols * rows >= n, `n=${n} ${w}x${h}`);
            assert.ok(cols * rows - n < Math.max(cols, rows), `too many empty cells n=${n} ${w}x${h}`);
        }
    }
});

test('gridLayout stacks vertically on a portrait phone', () => {
    assert.deepEqual(M.gridLayout(6, 390, 844), { cols: 1, rows: 6 });
});

test('gridLayout tolerates bad input', () => {
    assert.deepEqual(M.gridLayout(0), { cols: 1, rows: 1 });
    assert.deepEqual(M.gridLayout(NaN, 0, 0), { cols: 1, rows: 1 });
});

test('default channels are the six news channels with a live video and a fallback channel ID', () => {
    assert.deepEqual(
        M.DEFAULT_CHANNELS.map((c) => [c.name, M.parseSource(c.source).id]),
        [
            ['A Haber', '5I8f2p4lxOo'],
            ['Habertürk', 'RNVNlJSUFoE'],
            ['Sözcü TV', 'ztmY_cCtUl0'],
            ['CNN Türk', 'ntfhNLiZIVI'],
            ['tv100', '4WSvLRk83-c'],
            ['Haber Global', 'EqoCJ8BPxtE']
        ]
    );
    for (const channel of M.defaultChannels()) {
        assert.equal(M.parseSource(channel.source).type, 'video', channel.name);
        assert.equal(M.parseSource(channel.channelId).type, 'channel', channel.name);
        assert.deepEqual(M.normalizeChannel(channel), channel, 'defaults survive normalization');
        assert.equal(channel.legacyChannelIds, undefined);
    }
    assert.equal(new Set(M.DEFAULT_CHANNELS.map((c) => c.channelId)).size, M.DEFAULT_CHANNELS.length);
});

test('settings saved with default channel IDs are migrated to the live videos', () => {
    const s = M.normalizeSettings({ channels: [{ name: '', source: 'UCV6zcRug6Hqp1UX_FdyUeBg' }, { name: 'My CNN', source: 'https://www.youtube.com/channel/UCV6zcRug6Hqp1UX_FdyUeBg' }] });
    assert.deepEqual(s.channels[0], { name: 'CNN Türk', source: 'https://www.youtube.com/watch?v=ntfhNLiZIVI', channelId: 'UCV6zcRug6Hqp1UX_FdyUeBg' });
    assert.equal(s.channels[1].name, 'My CNN');

    const other = 'UC' + 'a'.repeat(22);
    assert.deepEqual(M.normalizeChannel({ name: 'X', source: other }), { name: 'X', source: other });
});

test('default videos always get the current fallback channel ID', () => {
    const saved = { name: 'Habertürk', source: 'https://www.youtube.com/watch?v=RNVNlJSUFoE', channelId: 'UClGZC_r-sUcBdElAtDSrQ5g' };
    assert.equal(M.normalizeChannel(saved).channelId, 'UCn6dNfiRE_Xunu7iMyvD7AA');
    assert.equal(M.normalizeChannel({ source: 'RNVNlJSUFoE' }).channelId, 'UCn6dNfiRE_Xunu7iMyvD7AA');
});

test('Habertürk plays its own M3U8 stream when the proxy is available', () => {
    const haberturk = M.defaultChannels().find((c) => c.name === 'Habertürk');
    assert.ok(M.parseSource(haberturk.hlsAlt.url).type === 'hls');

    const withProxy = M.resolvePlayback(haberturk, true);
    assert.deepEqual(withProxy.source, { type: 'hls', url: haberturk.hlsAlt.url });
    assert.deepEqual(withProxy.stream, { referer: 'https://www.haberturk.com/', userAgent: M.DEFAULT_USER_AGENT, proxy: true });

    const withoutProxy = M.resolvePlayback(haberturk, false);
    assert.deepEqual(withoutProxy, { source: { type: 'video', id: 'RNVNlJSUFoE' }, stream: null });

    assert.deepEqual(M.normalizeChannel({ name: 'H', source: 'RNVNlJSUFoE' }).hlsAlt, haberturk.hlsAlt, 'saved settings get the alternative too');
    assert.deepEqual(M.normalizeChannel({ name: 'Habertürk', source: 'UClGZC_r-sUcBdElAtDSrQ5g' }), haberturk, 'the wrong channel ID from the first version is migrated');
    assert.equal(M.normalizeChannel({ source: VIDEO, hlsAlt: { url: 'https://evil.com/a.m3u8' } }).hlsAlt, undefined, 'only presets carry an alternative');
});

test('resolvePlayback for regular channels', () => {
    assert.deepEqual(M.resolvePlayback({ source: OTHER_CHANNEL }, true), { source: { type: 'channel', id: OTHER_CHANNEL }, stream: null });
    assert.deepEqual(
        M.resolvePlayback({ source: 'https://cdn.example.com/a.m3u8', referer: 'https://x.com/', userAgent: 'safari-mac', proxy: false }, true),
        { source: { type: 'hls', url: 'https://cdn.example.com/a.m3u8' }, stream: { referer: 'https://x.com/', userAgent: 'safari-mac', proxy: false } }
    );
    assert.equal(M.resolvePlayback({ source: 'bad' }, true), null);
});

test('fallback channel ID is kept only for valid YouTube videos', () => {
    assert.equal(M.normalizeChannel({ source: VIDEO, channelId: CHANNEL }).channelId, CHANNEL);
    assert.equal(M.normalizeChannel({ source: VIDEO, channelId: 'bad' }).channelId, undefined);
    assert.equal(M.normalizeChannel({ source: 'https://cdn.example.com/a.m3u8', channelId: CHANNEL }).channelId, undefined);
});

test('normalizeSettings falls back to defaults', () => {
    for (const raw of [null, undefined, 'x', 42, {}, { channels: [] }, { channels: [{ source: 'bad' }] }]) {
        const s = M.normalizeSettings(raw);
        assert.equal(s.lang, 'tr');
        assert.equal(s.autoplay, true);
        assert.deepEqual(s.channels, M.defaultChannels());
    }
});

test('normalizeSettings keeps valid data and drops the rest', () => {
    const many = Array.from({ length: 30 }, () => ({ name: 'x', source: VIDEO }));
    const s = M.normalizeSettings({
        lang: 'en',
        autoplay: false,
        channels: [{ name: '  Kanal  ', source: ` ${OTHER_CHANNEL} ` }, { name: 'Bad', source: 'nope' }, null, ...many]
    });
    assert.equal(s.lang, 'en');
    assert.equal(s.autoplay, false);
    assert.equal(s.channels.length, M.MAX_CHANNELS);
    assert.deepEqual(s.channels[0], { name: 'Kanal', source: OTHER_CHANNEL });
    assert.equal(M.normalizeSettings({ lang: 'fr' }).lang, 'tr');
});

test('normalizeSettings does not share default channel objects', () => {
    const a = M.normalizeSettings(null);
    a.channels[0].name = 'changed';
    assert.equal(M.normalizeSettings(null).channels[0].name, 'A Haber');
});

test('detectLanguage follows the browser language', () => {
    assert.equal(M.detectLanguage(['tr-TR', 'en-US']), 'tr');
    assert.equal(M.detectLanguage(['de-DE', 'en-GB']), 'en');
    assert.equal(M.detectLanguage(['TR']), 'tr');
    assert.equal(M.detectLanguage(['fr-FR']), 'en');
    assert.equal(M.detectLanguage([]), 'en');
    assert.equal(M.detectLanguage(undefined), 'en');
});

test('a saved language wins over the browser language', () => {
    assert.equal(M.normalizeSettings(null, 'en').lang, 'en');
    assert.equal(M.normalizeSettings({ lang: 'tr' }, 'en').lang, 'tr');
    assert.equal(M.normalizeSettings({ lang: 'xx' }, 'en').lang, 'en');
});

test('translations have identical keys in every language', () => {
    const keys = Object.keys(M.TRANSLATIONS.tr).sort();
    for (const lang of M.LANGUAGES) {
        assert.deepEqual(Object.keys(M.TRANSLATIONS[lang]).sort(), keys, lang);
    }
    assert.equal(M.t('en', 'settings'), 'Settings');
    assert.equal(M.t('xx', 'settings'), 'Ayarlar');
});

test('every data-i18n key in index.html exists', () => {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 5);
    for (const key of keys) {
        assert.ok(key in M.TRANSLATIONS.tr, key);
    }
});
