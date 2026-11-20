(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MultiTV = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_CHANNELS = 25;
    const STORAGE_KEY = 'multiTv.v2';
    const LANGUAGES = ['tr', 'en'];
    const DEFAULT_USER_AGENT = 'chrome-windows';

    const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
    const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

    // Live video IDs change when a broadcast restarts; the player then falls back to the channel's current live stream.
    const DEFAULT_CHANNELS = [
        { name: 'A Haber', source: 'https://www.youtube.com/watch?v=5I8f2p4lxOo', channelId: 'UCKQhfw-lzz0uKnE1fY1PsAA' },
        {
            name: 'Habertürk',
            source: 'https://www.youtube.com/watch?v=RNVNlJSUFoE',
            channelId: 'UCn6dNfiRE_Xunu7iMyvD7AA',
            legacyChannelIds: ['UClGZC_r-sUcBdElAtDSrQ5g'],
            // The YouTube stream refuses to play on other sites; the broadcaster's own stream needs the proxy (no CORS).
            hlsAlt: {
                url: 'https://ciner.daioncdn.net/haberturktv/haberturktv.m3u8?app=c98ab0b0-50cc-495b-bb37-778e91f5ff5b&ce=3',
                referer: 'https://www.haberturk.com/'
            }
        },
        { name: 'Sözcü TV', source: 'https://www.youtube.com/watch?v=ztmY_cCtUl0', channelId: 'UCOulx_rep5O4i9y6AyDqVvw' },
        { name: 'CNN Türk', source: 'https://www.youtube.com/watch?v=ntfhNLiZIVI', channelId: 'UCV6zcRug6Hqp1UX_FdyUeBg' },
        { name: 'tv100', source: 'https://www.youtube.com/watch?v=4WSvLRk83-c', channelId: 'UCndsdUW_oPLqpQJY9J8oIRg' },
        { name: 'Haber Global', source: 'https://www.youtube.com/watch?v=EqoCJ8BPxtE', channelId: 'UCtc-a9ZUIg0_5HpsPxEO7Qg' }
    ];

    const CHROME_BRANDS = '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"';

    const USER_AGENTS = {
        'chrome-windows': {
            label: 'Chrome · Windows',
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            hints: { 'sec-ch-ua': CHROME_BRANDS, 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' }
        },
        'chrome-mac': {
            label: 'Chrome · macOS',
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            hints: { 'sec-ch-ua': CHROME_BRANDS, 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"' }
        },
        'chrome-android': {
            label: 'Chrome · Android',
            ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
            hints: { 'sec-ch-ua': CHROME_BRANDS, 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' }
        },
        'safari-mac': {
            label: 'Safari · macOS',
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
        },
        'safari-iphone': {
            label: 'Safari · iPhone',
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
        },
        'firefox-windows': {
            label: 'Firefox · Windows',
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0'
        }
    };

    const TRANSLATIONS = {
        tr: {
            title: 'Multi TV',
            pageTitle: 'Multi TV | Canlı Yayınlar',
            channelCount: '{n} kanal',
            channelCountOne: '1 kanal',
            subtitle: 'YouTube canlı yayınlarını ve M3U8 akışlarını aynı ekranda izleyin.',
            language: 'Dil',
            channels: 'Kanallar',
            channelsHelp: 'YouTube kanal ID\'si (UC…), kanal veya video adresi ya da bir M3U8 (HLS) akış adresi girebilirsiniz. Kanal ID\'si girilirse her zaman kanalın güncel canlı yayını açılır.',
            namePlaceholder: 'Kanal adı',
            sourcePlaceholder: 'YouTube kanal ID\'si, adresi veya .m3u8 linki',
            addChannel: 'Kanal ekle',
            resetDefaults: 'Varsayılan kanallar',
            autoplay: 'Sayfa açılınca yayınları otomatik başlat',
            saveAndWatch: 'Kaydet ve izle',
            settings: 'Ayarlar',
            fullscreen: 'Tam ekran',
            exitFullscreen: 'Tam ekrandan çık',
            mute: 'Sesi kapat',
            unmute: 'Sesi aç',
            remove: 'Kaldır',
            invalidSource: 'Geçersiz kaynak. YouTube kanal ID\'si (UC…), YouTube adresi veya .m3u8 linki girin.',
            handleNotSupported: '@kullanıcıadı adresleri desteklenmiyor. Kanalın "UC…" ile başlayan ID\'sini girin.',
            invalidReferer: 'Referer, http:// veya https:// ile başlayan geçerli bir adres olmalı.',
            invalidProxy: 'Proxy adresi, http:// veya https:// ile başlayan geçerli bir adres olmalı.',
            atLeastOne: 'En az bir geçerli kanal girmelisiniz.',
            maxReached: 'En fazla 25 kanal ekleyebilirsiniz.',
            channelFallback: 'Kanal',
            fileProtocol: 'Sayfayı doğrudan dosyadan açtınız. Yayınlar için uygulamayı "npm start" ile veya bir web sunucusu üzerinden açın.',
            empty: 'Gösterilecek kanal kalmadı.',
            footer: 'Multi TV',
            typeYoutube: 'YouTube',
            typeHls: 'M3U8',
            referer: 'Referer',
            refererPlaceholder: 'https://site.com/',
            autoReferer: 'Otomatik',
            browserIdentity: 'Tarayıcı kimliği',
            customUserAgent: 'Özel User-Agent…',
            customUserAgentPlaceholder: 'Mozilla/5.0 (…)',
            useProxy: 'Proxy üzerinden oynat (Referer, tarayıcı kimliği ve CORS için)',
            proxy: 'Proxy',
            proxyHelp: 'Tarayıcılar Referer ve User-Agent başlıklarının değiştirilmesine izin vermez. M3U8 akışları bu başlıklarla proxy üzerinden istenir. Boş bırakılırsa uygulamanın kendi sunucusu (npm start) kullanılır.',
            proxyUrlPlaceholder: 'Boş: bu sunucu (ör. http://127.0.0.1:8080)',
            proxyActive: 'Proxy aktif',
            proxyMissing: 'Proxy bulunamadı — M3U8 akışları doğrudan oynatılır, Referer ve tarayıcı kimliği uygulanmaz.',
            proxyMissingShort: 'Proxy yok',
            streamError: 'Yayın açılamadı',
            retry: 'Tekrar dene',
            hlsUnsupported: 'Bu tarayıcı M3U8 oynatmayı desteklemiyor.'
        },
        en: {
            title: 'Multi TV',
            pageTitle: 'Multi TV | Live Streams',
            channelCount: '{n} channels',
            channelCountOne: '1 channel',
            subtitle: 'Watch YouTube live streams and M3U8 streams on one screen.',
            language: 'Language',
            channels: 'Channels',
            channelsHelp: 'Enter a YouTube channel ID (UC…), a channel or video URL, or an M3U8 (HLS) stream URL. With a channel ID the channel\'s current live stream is always shown.',
            namePlaceholder: 'Channel name',
            sourcePlaceholder: 'YouTube channel ID, URL or .m3u8 link',
            addChannel: 'Add channel',
            resetDefaults: 'Default channels',
            autoplay: 'Start streams automatically on page load',
            saveAndWatch: 'Save and watch',
            settings: 'Settings',
            fullscreen: 'Fullscreen',
            exitFullscreen: 'Exit fullscreen',
            mute: 'Mute',
            unmute: 'Unmute',
            remove: 'Remove',
            invalidSource: 'Invalid source. Enter a YouTube channel ID (UC…), a YouTube URL or an .m3u8 link.',
            handleNotSupported: '@handle URLs are not supported. Enter the channel ID starting with "UC…".',
            invalidReferer: 'Referer must be a valid URL starting with http:// or https://.',
            invalidProxy: 'Proxy address must be a valid URL starting with http:// or https://.',
            atLeastOne: 'You must enter at least one valid channel.',
            maxReached: 'You can add up to 25 channels.',
            channelFallback: 'Channel',
            fileProtocol: 'You opened the page directly from a file. Run the app with "npm start" or serve it from a web server.',
            empty: 'No channels left to show.',
            footer: 'Multi TV',
            typeYoutube: 'YouTube',
            typeHls: 'M3U8',
            referer: 'Referer',
            refererPlaceholder: 'https://site.com/',
            autoReferer: 'Auto',
            browserIdentity: 'Browser identity',
            customUserAgent: 'Custom User-Agent…',
            customUserAgentPlaceholder: 'Mozilla/5.0 (…)',
            useProxy: 'Play through the proxy (for Referer, browser identity and CORS)',
            proxy: 'Proxy',
            proxyHelp: 'Browsers don\'t allow changing the Referer and User-Agent headers. M3U8 streams are requested through the proxy with these headers. Leave empty to use the app\'s own server (npm start).',
            proxyUrlPlaceholder: 'Empty: this server (e.g. http://127.0.0.1:8080)',
            proxyActive: 'Proxy active',
            proxyMissing: 'Proxy not found — M3U8 streams play directly, without Referer or browser identity.',
            proxyMissingShort: 'No proxy',
            streamError: 'Stream could not be loaded',
            retry: 'Retry',
            hlsUnsupported: 'This browser can\'t play M3U8 streams.'
        }
    };

    /**
     * Parses user input into a playable source.
     * @param {string} input YouTube channel ID, video ID, YouTube URL or M3U8 URL.
     * @returns {{type: 'channel'|'video', id: string}|{type: 'hls', url: string}|null}
     */
    function parseSource(input) {
        const value = String(input == null ? '' : input).trim();

        if (!value) {
            return null;
        }
        if (CHANNEL_ID.test(value)) {
            return { type: 'channel', id: value };
        }
        if (VIDEO_ID.test(value)) {
            return { type: 'video', id: value };
        }

        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
        let url;
        try {
            url = new URL(hasScheme ? value : 'https://' + value);
        } catch (e) {
            return null;
        }

        if (hasScheme && /^https?:$/.test(url.protocol) && /\.m3u8?(?=$|[?#&/])/i.test(url.pathname + url.search)) {
            return { type: 'hls', url: url.href };
        }

        const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
        const parts = url.pathname.split('/').filter(Boolean);

        if (host === 'youtu.be') {
            return VIDEO_ID.test(parts[0] || '') ? { type: 'video', id: parts[0] } : null;
        }

        if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
            return null;
        }

        const channelParam = url.searchParams.get('channel');
        if (channelParam && CHANNEL_ID.test(channelParam)) {
            return { type: 'channel', id: channelParam };
        }

        const videoParam = url.searchParams.get('v');
        if (videoParam && VIDEO_ID.test(videoParam)) {
            return { type: 'video', id: videoParam };
        }

        if (parts[0] === 'channel' && CHANNEL_ID.test(parts[1] || '')) {
            return { type: 'channel', id: parts[1] };
        }

        if (['live', 'embed', 'shorts', 'v'].indexOf(parts[0]) !== -1 && VIDEO_ID.test(parts[1] || '')) {
            return { type: 'video', id: parts[1] };
        }

        return null;
    }

    function isHandle(input) {
        return /(^|\/)@[\w.-]+/.test(String(input == null ? '' : input).trim());
    }

    function isHttpUrl(value) {
        try {
            return /^https?:$/.test(new URL(String(value)).protocol);
        } catch (e) {
            return false;
        }
    }

    /**
     * Referer a browser would send when the stream is embedded on its own site.
     * @param {string} streamUrl
     * @returns {string}
     */
    function autoReferer(streamUrl) {
        try {
            return new URL(streamUrl).origin + '/';
        } catch (e) {
            return '';
        }
    }

    /**
     * Builds the YouTube embed URL for a parsed source.
     * @param {{type: string, id: string}} source
     * @param {{autoplay?: boolean, mute?: boolean, origin?: string}} [options]
     * @returns {string}
     */
    function embedUrl(source, options) {
        const opts = options || {};
        const params = new URLSearchParams();

        if (source.type === 'channel') {
            params.set('channel', source.id);
        }
        params.set('autoplay', opts.autoplay === false ? '0' : '1');
        params.set('mute', opts.mute === false ? '0' : '1');
        params.set('playsinline', '1');
        params.set('enablejsapi', '1');
        params.set('rel', '0');
        if (opts.origin && /^https?:\/\//.test(opts.origin)) {
            params.set('origin', opts.origin);
        }

        const path = source.type === 'channel' ? 'live_stream' : source.id;

        return 'https://www.youtube.com/embed/' + path + '?' + params.toString();
    }

    /* ---------- Proxy ---------- */

    function base64UrlEncode(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach(function (b) {
            binary += String.fromCharCode(b);
        });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function base64UrlDecode(text) {
        const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(b64 + '==='.slice((b64.length + 3) % 4));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    /**
     * Compact description of the request headers the proxy should send upstream.
     * @param {{referer?: string, userAgent?: string}} channel
     * @returns {{r?: string, u?: string}}
     */
    function proxySpec(channel) {
        const spec = {};
        if (channel.referer && isHttpUrl(channel.referer)) {
            spec.r = channel.referer;
        }
        if (channel.userAgent) {
            spec.u = channel.userAgent;
        }
        return spec;
    }

    function encodeProxySpec(spec) {
        return base64UrlEncode(JSON.stringify(spec || {}));
    }

    function decodeProxySpec(encoded) {
        if (!encoded) {
            return {};
        }
        try {
            const spec = JSON.parse(base64UrlDecode(encoded));
            return spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * @param {string} base Proxy origin, or '' for a root-relative URL.
     * @param {string} url Upstream URL.
     * @param {object} spec Proxy spec from proxySpec().
     * @returns {string}
     */
    function proxyUrl(base, url, spec) {
        const prefix = String(base || '').replace(/\/+$/, '');
        return prefix + '/proxy?url=' + encodeURIComponent(url) + '&h=' + encodeProxySpec(spec);
    }

    /**
     * Headers that make an upstream request look like it came from a real browser
     * playing the stream on the referring site.
     * @param {{r?: string, u?: string}} spec
     * @returns {Object<string, string>}
     */
    function upstreamHeaders(spec) {
        const s = spec || {};
        const key = s.u ? String(s.u) : DEFAULT_USER_AGENT;
        const preset = Object.prototype.hasOwnProperty.call(USER_AGENTS, key) ? USER_AGENTS[key] : null;
        const headers = {
            'user-agent': preset ? preset.ua : key.replace(/[^\x20-\x7e]/g, '').slice(0, 512),
            accept: '*/*',
            'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors'
        };

        if (preset && preset.hints) {
            Object.keys(preset.hints).forEach(function (key) {
                headers[key] = preset.hints[key];
            });
        }

        if (s.r && isHttpUrl(s.r)) {
            headers.referer = s.r;
            headers.origin = new URL(s.r).origin;
            headers['sec-fetch-site'] = 'cross-site';
        } else {
            headers['sec-fetch-site'] = 'none';
        }

        return headers;
    }

    /**
     * Rewrites every URI in an HLS playlist (segments, variants, keys, maps, renditions).
     * @param {string} text Playlist body.
     * @param {string} playlistUrl Final URL of the playlist, used to resolve relative URIs.
     * @param {function(string): string} transform Maps an absolute URL to its proxied URL.
     * @returns {string}
     */
    function rewritePlaylist(text, playlistUrl, transform) {
        function rewrite(uri) {
            let absolute;
            try {
                absolute = new URL(uri, playlistUrl).href;
            } catch (e) {
                return uri;
            }
            return isHttpUrl(absolute) ? transform(absolute) : uri;
        }

        return String(text)
            .split(/\r?\n/)
            .map(function (line) {
                const trimmed = line.trim();
                if (!trimmed) {
                    return line;
                }
                if (trimmed[0] === '#') {
                    return line.replace(/URI="([^"]+)"/g, function (match, uri) {
                        return 'URI="' + rewrite(uri) + '"';
                    });
                }
                return rewrite(trimmed);
            })
            .join('\n');
    }

    /**
     * Hosts the proxy must not reach unless explicitly allowed (SSRF protection).
     * @param {string} hostname
     * @returns {boolean}
     */
    function isPrivateHost(hostname) {
        const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

        if (!host || host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) {
            return true;
        }

        const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (v4) {
            const a = Number(v4[1]);
            const b = Number(v4[2]);
            return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
                (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
        }

        if (host.indexOf(':') !== -1) {
            return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || /^::ffff:/.test(host);
        }

        return false;
    }

    /* ---------- Layout ---------- */

    /**
     * Picks the column/row count that shows 16:9 tiles as large as possible.
     * @param {number} count Number of tiles.
     * @param {number} [width] Container width.
     * @param {number} [height] Container height.
     * @returns {{cols: number, rows: number}}
     */
    function gridLayout(count, width, height) {
        const n = Math.max(1, Math.floor(count) || 1);
        const w = width > 0 ? width : 16;
        const h = height > 0 ? height : 9;
        let best = null;

        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.ceil(n / cols);
            const scale = Math.min(w / cols / 16, h / rows / 9);
            const empty = cols * rows - n;
            const candidate = { cols: cols, rows: rows, scale: scale, empty: empty };

            if (
                !best ||
                scale > best.scale + 1e-9 ||
                (Math.abs(scale - best.scale) <= 1e-9 &&
                    (empty < best.empty || (empty === best.empty && cols >= rows && best.cols < best.rows)))
            ) {
                best = candidate;
            }
        }

        return { cols: best.cols, rows: best.rows };
    }

    /* ---------- Settings ---------- */

    function presetExtras(preset, channel) {
        channel.channelId = preset.channelId;
        if (preset.hlsAlt) {
            channel.hlsAlt = { url: preset.hlsAlt.url, referer: preset.hlsAlt.referer };
        }
        return channel;
    }

    function defaultChannels() {
        return DEFAULT_CHANNELS.map(function (c) {
            return presetExtras(c, { name: c.name, source: c.source });
        });
    }

    /**
     * Decides what a channel actually plays: a default channel's own M3U8 stream when
     * the proxy is available, otherwise its source.
     * @param {object} channel Normalized channel.
     * @param {boolean} proxyAvailable
     * @returns {{source: object, stream: {referer: string, userAgent: string, proxy: boolean}|null}|null}
     */
    function resolvePlayback(channel, proxyAvailable) {
        if (channel.hlsAlt && proxyAvailable) {
            return {
                source: { type: 'hls', url: channel.hlsAlt.url },
                stream: { referer: channel.hlsAlt.referer, userAgent: DEFAULT_USER_AGENT, proxy: true }
            };
        }

        const source = parseSource(channel.source);
        if (!source) {
            return null;
        }

        return {
            source: source,
            stream: source.type === 'hls'
                ? { referer: channel.referer || '', userAgent: channel.userAgent || DEFAULT_USER_AGENT, proxy: channel.proxy !== false }
                : null
        };
    }

    /**
     * Cleans a single channel; returns null when its source is unusable.
     * @param {*} raw
     * @returns {{name: string, source: string, referer?: string, userAgent?: string, proxy?: boolean}|null}
     */
    function normalizeChannel(raw) {
        if (!raw || typeof raw.source !== 'string') {
            return null;
        }
        const parsed = parseSource(raw.source);
        if (!parsed) {
            return null;
        }

        const channel = { name: String(raw.name || '').trim().slice(0, 40), source: raw.source.trim() };

        // Settings saved by earlier versions stored the default channels by channel ID.
        if (parsed.type === 'channel') {
            const preset = DEFAULT_CHANNELS.filter(function (d) {
                return d.channelId === parsed.id || (d.legacyChannelIds || []).indexOf(parsed.id) !== -1;
            })[0];
            if (preset) {
                return presetExtras(preset, { name: channel.name || preset.name, source: preset.source });
            }
        }

        if (parsed.type === 'video') {
            const presetVideo = DEFAULT_CHANNELS.filter(function (d) {
                return parseSource(d.source).id === parsed.id;
            })[0];
            if (presetVideo) {
                presetExtras(presetVideo, channel);
            } else if (typeof raw.channelId === 'string' && CHANNEL_ID.test(raw.channelId)) {
                channel.channelId = raw.channelId;
            }
        }

        if (parsed.type === 'hls') {
            const referer = typeof raw.referer === 'string' ? raw.referer.trim() : '';
            channel.referer = isHttpUrl(referer) ? referer : '';
            channel.userAgent = typeof raw.userAgent === 'string' && raw.userAgent.trim()
                ? raw.userAgent.trim().slice(0, 512)
                : DEFAULT_USER_AGENT;
            channel.proxy = raw.proxy !== false;
        }

        return channel;
    }

    /**
     * Picks the interface language from the browser's preferred languages.
     * @param {string[]} preferred e.g. navigator.languages
     * @returns {string}
     */
    function detectLanguage(preferred) {
        const list = Array.isArray(preferred) ? preferred : [];
        for (let i = 0; i < list.length; i++) {
            const code = String(list[i] || '').toLowerCase().split('-')[0];
            if (LANGUAGES.indexOf(code) !== -1) {
                return code;
            }
        }
        return 'en';
    }

    /**
     * Validates settings loaded from storage, falling back to defaults.
     * @param {*} raw
     * @param {string} [defaultLang] Language used when none is saved.
     * @returns {{lang: string, autoplay: boolean, proxyUrl: string, channels: Array<object>}}
     */
    function normalizeSettings(raw, defaultLang) {
        const s = raw && typeof raw === 'object' ? raw : {};
        let channels = Array.isArray(s.channels)
            ? s.channels.map(normalizeChannel).filter(Boolean).slice(0, MAX_CHANNELS)
            : [];

        if (!channels.length) {
            channels = defaultChannels();
        }

        return {
            lang: LANGUAGES.indexOf(s.lang) !== -1 ? s.lang : LANGUAGES.indexOf(defaultLang) !== -1 ? defaultLang : 'tr',
            autoplay: s.autoplay !== false,
            proxyUrl: typeof s.proxyUrl === 'string' && isHttpUrl(s.proxyUrl.trim()) ? s.proxyUrl.trim().replace(/\/+$/, '') : '',
            channels: channels
        };
    }

    function t(lang, key) {
        const dict = TRANSLATIONS[lang] || TRANSLATIONS.tr;
        return key in dict ? dict[key] : TRANSLATIONS.tr[key] || key;
    }

    return {
        MAX_CHANNELS: MAX_CHANNELS,
        STORAGE_KEY: STORAGE_KEY,
        LANGUAGES: LANGUAGES,
        DEFAULT_CHANNELS: DEFAULT_CHANNELS,
        DEFAULT_USER_AGENT: DEFAULT_USER_AGENT,
        USER_AGENTS: USER_AGENTS,
        TRANSLATIONS: TRANSLATIONS,
        parseSource: parseSource,
        isHandle: isHandle,
        isHttpUrl: isHttpUrl,
        autoReferer: autoReferer,
        embedUrl: embedUrl,
        proxySpec: proxySpec,
        encodeProxySpec: encodeProxySpec,
        decodeProxySpec: decodeProxySpec,
        proxyUrl: proxyUrl,
        upstreamHeaders: upstreamHeaders,
        rewritePlaylist: rewritePlaylist,
        isPrivateHost: isPrivateHost,
        gridLayout: gridLayout,
        defaultChannels: defaultChannels,
        resolvePlayback: resolvePlayback,
        normalizeChannel: normalizeChannel,
        normalizeSettings: normalizeSettings,
        detectLanguage: detectLanguage,
        t: t
    };
});
