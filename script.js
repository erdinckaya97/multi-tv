(function () {
    'use strict';

    const M = window.MultiTV;
    const YT_ORIGIN = 'https://www.youtube.com';
    const HLS_SCRIPT = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

    const settingsPage = document.getElementById('settings-page');
    const playerPage = document.getElementById('player-page');
    const channelList = document.getElementById('channel-list');
    const channelCounter = document.getElementById('channel-counter');
    const rowTemplate = document.getElementById('channel-row-template');
    const formError = document.getElementById('form-error');
    const autoStartCheckbox = document.getElementById('auto-start');
    const proxyInput = document.getElementById('proxy-url');
    const proxyStatus = document.getElementById('proxy-status');
    const languageButtons = document.querySelectorAll('button[data-lang]');
    const videoGrid = document.getElementById('video-grid');
    const emptyState = document.getElementById('empty-state');
    const fullscreenToggle = document.getElementById('fullscreen-toggle');
    const settingsButton = document.getElementById('back-to-settings');
    const channelCount = document.getElementById('channel-count');

    const isServed = /^https?:$/.test(location.protocol);

    let settings = M.normalizeSettings(loadSettings(), M.detectLanguage(navigator.languages || [navigator.language]));
    let draft = [];
    let hlsPromise = null;
    const proxy = { base: '', ok: false, checking: false };

    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(M.STORAGE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(M.STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn('Multi TV: settings could not be saved.', e);
        }
    }

    function t(key) {
        return M.t(settings.lang, key);
    }

    function translateTree(root) {
        root.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
    }

    function applyLanguage() {
        document.documentElement.lang = settings.lang;
        document.title = t('pageTitle');
        translateTree(document);
        languageButtons.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === settings.lang);
        });
        settingsButton.title = t('settings');
        updateFullscreenLabel();
        updateTileLabels();
        updateChannelCount();
        renderProxyStatus();
        if (!settingsPage.classList.contains('hidden')) {
            renderChannelRows();
        }
    }

    /* ---------- Proxy ---------- */

    async function detectProxy(url) {
        const base = (url || (isServed ? location.origin : '')).replace(/\/+$/, '');
        proxy.base = base;
        proxy.ok = false;

        if (base) {
            proxy.checking = true;
            renderProxyStatus();
            try {
                const res = await fetch(base + '/proxy/health', { cache: 'no-store', signal: AbortSignal.timeout(800) });
                const data = res.ok ? await res.json() : null;
                proxy.ok = !!(data && data.ok);
            } catch (e) {
                proxy.ok = false;
            }
            proxy.checking = false;
        }

        renderProxyStatus();
        return proxy.ok;
    }

    function renderProxyStatus() {
        if (proxy.checking) {
            proxyStatus.className = 'proxy-status is-checking';
            proxyStatus.textContent = '…';
            proxyStatus.title = '';
            return;
        }
        proxyStatus.className = 'proxy-status ' + (proxy.ok ? 'is-ok' : 'is-missing');
        proxyStatus.textContent = proxy.ok ? t('proxyActive') : t('proxyMissingShort');
        proxyStatus.title = proxy.ok ? proxy.base : t('proxyMissing');
    }

    proxyInput.addEventListener('change', function () {
        const value = proxyInput.value.trim();
        proxyInput.classList.toggle('invalid', !!value && !M.isHttpUrl(value));
        if (!value || M.isHttpUrl(value)) {
            detectProxy(value);
        }
    });

    /* ---------- Settings page ---------- */

    function cloneChannel(c) {
        return Object.assign({}, c);
    }

    function showSettings() {
        clearGrid();
        draft = settings.channels.map(cloneChannel);
        autoStartCheckbox.checked = settings.autoplay;
        proxyInput.value = settings.proxyUrl;
        proxyInput.classList.remove('invalid');
        hideError();
        renderChannelRows();
        playerPage.classList.add('hidden');
        settingsPage.classList.remove('hidden');
    }

    function fillUserAgentSelect(select) {
        Object.keys(M.USER_AGENTS).forEach(function (key) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = M.USER_AGENTS[key].label;
            select.appendChild(option);
        });
        const custom = document.createElement('option');
        custom.value = 'custom';
        custom.textContent = t('customUserAgent');
        select.appendChild(custom);
    }

    function renderChannelRows() {
        channelList.innerHTML = '';

        draft.forEach(function (channel, index) {
            const row = rowTemplate.content.firstElementChild.cloneNode(true);
            const $ = function (selector) {
                return row.querySelector(selector);
            };
            const nameInput = $('.channel-name');
            const sourceInput = $('.channel-source');
            const typeBadge = $('.channel-type');
            const advanced = $('.channel-advanced');
            const refererInput = $('.channel-referer');
            const uaSelect = $('.channel-ua');
            const uaCustom = $('.channel-ua-custom');
            const proxyCheckbox = $('.channel-proxy');
            const removeBtn = $('.channel-remove');

            translateTree(row);
            fillUserAgentSelect(uaSelect);

            $('.channel-index').textContent = index + 1;
            nameInput.placeholder = t('namePlaceholder');
            nameInput.value = channel.name || '';
            sourceInput.placeholder = t('sourcePlaceholder');
            sourceInput.value = channel.source || '';
            removeBtn.setAttribute('aria-label', t('remove'));
            removeBtn.title = t('remove');

            function syncAdvanced() {
                const parsed = M.parseSource(channel.source);
                const isHls = !!parsed && parsed.type === 'hls';

                typeBadge.textContent = parsed ? t(isHls ? 'typeHls' : 'typeYoutube') : '';
                typeBadge.className = 'channel-type' + (parsed ? ' is-' + (isHls ? 'hls' : 'youtube') : '');
                advanced.classList.toggle('hidden', !isHls);

                if (!isHls) {
                    return;
                }

                if (channel.userAgent === undefined) {
                    channel.userAgent = M.DEFAULT_USER_AGENT;
                }
                if (channel.proxy === undefined) {
                    channel.proxy = true;
                }

                // Keep the Referer following the stream URL until the user edits it by hand.
                const auto = M.autoReferer(parsed.url);
                if (!channel.referer || channel.referer === channel._autoReferer) {
                    channel.referer = auto;
                }
                channel._autoReferer = auto;

                refererInput.value = channel.referer;
                const isPreset = Object.prototype.hasOwnProperty.call(M.USER_AGENTS, channel.userAgent);
                uaSelect.value = isPreset ? channel.userAgent : 'custom';
                uaCustom.classList.toggle('hidden', isPreset);
                if (!isPreset && document.activeElement !== uaCustom) {
                    uaCustom.value = channel.userAgent === 'custom' ? '' : channel.userAgent;
                }
                proxyCheckbox.checked = channel.proxy;
                advanced.classList.toggle('is-direct', !channel.proxy);
            }

            nameInput.addEventListener('input', function () {
                channel.name = nameInput.value;
            });
            sourceInput.addEventListener('input', function () {
                channel.source = sourceInput.value;
                delete channel.channelId;
                delete channel.hlsAlt;
                row.classList.remove('invalid');
                syncAdvanced();
            });
            refererInput.addEventListener('input', function () {
                channel.referer = refererInput.value.trim();
                row.classList.remove('invalid');
            });
            $('.channel-auto-referer').addEventListener('click', function () {
                channel.referer = '';
                syncAdvanced();
            });
            uaSelect.addEventListener('change', function () {
                channel.userAgent = uaSelect.value === 'custom' ? uaCustom.value.trim() || 'custom' : uaSelect.value;
                syncAdvanced();
                if (uaSelect.value === 'custom') {
                    uaCustom.focus();
                }
            });
            uaCustom.addEventListener('input', function () {
                channel.userAgent = uaCustom.value.trim() || 'custom';
            });
            proxyCheckbox.addEventListener('change', function () {
                channel.proxy = proxyCheckbox.checked;
                syncAdvanced();
            });
            removeBtn.addEventListener('click', function () {
                draft.splice(draft.indexOf(channel), 1);
                renderChannelRows();
            });

            syncAdvanced();
            channelList.appendChild(row);
        });

        channelCounter.textContent = draft.length + ' / ' + M.MAX_CHANNELS;
    }

    function showError(message) {
        formError.textContent = message;
        formError.classList.remove('hidden');
    }

    function hideError() {
        formError.classList.add('hidden');
    }

    document.getElementById('add-channel').addEventListener('click', function () {
        if (draft.length >= M.MAX_CHANNELS) {
            showError(t('maxReached'));
            return;
        }
        hideError();
        draft.push({ name: '', source: '' });
        renderChannelRows();
        const inputs = channelList.querySelectorAll('.channel-source');
        inputs[inputs.length - 1].focus();
    });

    document.getElementById('reset-defaults').addEventListener('click', function () {
        draft = M.defaultChannels();
        hideError();
        renderChannelRows();
    });

    languageButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            settings.lang = btn.getAttribute('data-lang');
            saveSettings();
            applyLanguage();
        });
    });

    document.getElementById('save-settings').addEventListener('click', async function () {
        const rows = channelList.querySelectorAll('.channel-row');
        const channels = [];
        let firstError = null;

        draft.forEach(function (channel, index) {
            const source = (channel.source || '').trim();
            if (!source) {
                return;
            }
            const parsed = M.parseSource(source);
            if (!parsed) {
                rows[index].classList.add('invalid');
                firstError = firstError || (M.isHandle(source) ? t('handleNotSupported') : t('invalidSource'));
                return;
            }
            if (parsed.type === 'hls' && channel.referer && !M.isHttpUrl(channel.referer)) {
                rows[index].classList.add('invalid');
                firstError = firstError || t('invalidReferer');
                return;
            }
            channels.push(M.normalizeChannel({
                name: channel.name,
                source: source,
                channelId: channel.channelId,
                referer: channel.referer,
                userAgent: channel.userAgent === 'custom' ? '' : channel.userAgent,
                proxy: channel.proxy
            }));
        });

        const proxyUrl = proxyInput.value.trim();
        if (proxyUrl && !M.isHttpUrl(proxyUrl)) {
            proxyInput.classList.add('invalid');
            firstError = firstError || t('invalidProxy');
        }

        if (firstError) {
            showError(firstError);
            return;
        }
        if (!channels.length) {
            showError(t('atLeastOne'));
            return;
        }

        settings.channels = channels;
        settings.autoplay = autoStartCheckbox.checked;
        settings.proxyUrl = proxyUrl.replace(/\/+$/, '');
        saveSettings();

        if (proxy.base !== (settings.proxyUrl || (isServed ? location.origin : ''))) {
            await detectProxy(settings.proxyUrl);
        }
        showPlayer();
    });

    /* ---------- Player page ---------- */

    function showPlayer() {
        settingsPage.classList.add('hidden');
        playerPage.classList.remove('hidden');
        renderGrid();
    }

    function tiles() {
        return Array.prototype.slice.call(videoGrid.querySelectorAll('.tile'));
    }

    function clearGrid() {
        tiles().forEach(function (tile) {
            if (tile._player) {
                tile._player.destroy();
            }
        });
        videoGrid.innerHTML = '';
    }

    function channelLabel(channel, index) {
        return channel.name || t('channelFallback') + ' ' + (index + 1);
    }

    function renderGrid() {
        clearGrid();

        settings.channels.forEach(function (channel, index) {
            const playback = M.resolvePlayback(channel, proxy.ok);
            if (!playback) {
                return;
            }
            const source = playback.source;

            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.dataset.muted = 'true';
            tile._channel = channel;

            const bar = document.createElement('div');
            bar.className = 'tile-bar';

            tile._index = index;

            const label = document.createElement('span');
            label.className = 'tile-label';
            const labelName = document.createElement('span');
            labelName.className = 'tile-name';
            label.appendChild(labelName);

            const controls = document.createElement('div');
            controls.className = 'tile-controls';
            controls.appendChild(tileButton('mute', function () {
                setMuted(tile, tile.dataset.muted !== 'true');
            }));
            controls.appendChild(tileButton('fullscreen', function () {
                requestFullscreen(tile);
            }));
            controls.appendChild(tileButton('remove', function () {
                removeTile(tile);
            }));

            bar.appendChild(label);
            bar.appendChild(controls);

            if (source.type === 'hls') {
                tile.classList.add('tile-hls');
                if (playback.stream.proxy && !proxy.ok) {
                    const badge = document.createElement('span');
                    badge.className = 'tile-badge';
                    label.appendChild(badge);
                }
                tile._player = createHlsPlayer(tile, playback.stream, source);
            } else {
                tile._player = createYouTubePlayer(tile, channel, source, index);
            }

            tile.appendChild(bar);
            videoGrid.appendChild(tile);
        });

        updateTileLabels();
        layoutGrid();
    }

    function createYouTubePlayer(tile, channel, source, index) {
        const iframe = document.createElement('iframe');
        const handshakeTimers = [];
        let fellBack = false;

        function load(target) {
            iframe.src = M.embedUrl(target, {
                autoplay: settings.autoplay,
                mute: true,
                origin: isServed ? location.origin : ''
            });
        }

        load(source);
        iframe.title = channelLabel(channel, index);
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        tile.appendChild(iframe);

        function post(message) {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage(JSON.stringify(message), YT_ORIGIN);
            }
        }

        function command(func, args) {
            post({ event: 'command', func: func, args: args || [] });
        }

        // The embed only reports errors and state changes after this handshake.
        iframe.addEventListener('load', function () {
            [0, 1000, 3000].forEach(function (delay) {
                handshakeTimers.push(setTimeout(function () {
                    post({ event: 'listening', id: 'tile-' + index, channel: 'widget' });
                }, delay));
            });
        });

        function fallBackToChannel() {
            if (fellBack || !channel.channelId) {
                return;
            }
            fellBack = true;
            load({ type: 'channel', id: channel.channelId });
            if (tile.dataset.muted !== 'true') {
                tile.dataset.muted = 'true';
                updateTileLabels();
            }
        }

        function onMessage(event) {
            if (event.source !== iframe.contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) {
                return;
            }
            let data;
            try {
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch (e) {
                return;
            }
            if (!data) {
                return;
            }
            const ended = data.event === 'onStateChange' && data.info === 0;
            if (data.event === 'onError' || ended) {
                fallBackToChannel();
            }
        }

        window.addEventListener('message', onMessage);

        return {
            mute: function () {
                command('mute');
            },
            unmute: function () {
                command('unMute');
                command('setVolume', [100]);
                command('playVideo');
            },
            destroy: function () {
                window.removeEventListener('message', onMessage);
                handshakeTimers.forEach(clearTimeout);
                iframe.src = 'about:blank';
            }
        };
    }

    function loadHls() {
        if (window.Hls) {
            return Promise.resolve(window.Hls);
        }
        if (!hlsPromise) {
            hlsPromise = new Promise(function (resolve, reject) {
                const script = document.createElement('script');
                script.src = HLS_SCRIPT;
                script.onload = function () {
                    resolve(window.Hls);
                };
                script.onerror = function () {
                    hlsPromise = null;
                    reject(new Error('hls.js could not be loaded'));
                };
                document.head.appendChild(script);
            });
        }
        return hlsPromise;
    }

    function createHlsPlayer(tile, stream, source) {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = settings.autoplay;
        video.controls = !settings.autoplay;
        tile.appendChild(video);

        let hls = null;
        let retries = 0;
        let destroyed = false;

        const src = stream.proxy && proxy.ok
            ? M.proxyUrl(proxy.base, source.url, M.proxySpec(stream))
            : source.url;

        function fail(detail) {
            stop();
            showTileError(tile, t('streamError'), detail, start);
        }

        function stop() {
            if (hls) {
                hls.destroy();
                hls = null;
            }
            video.removeAttribute('src');
            video.load();
        }

        function play() {
            if (settings.autoplay) {
                const result = video.play();
                if (result && result.catch) {
                    result.catch(function () {});
                }
            }
        }

        function playNative() {
            if (!video.canPlayType('application/vnd.apple.mpegurl')) {
                showTileError(tile, t('hlsUnsupported'));
                return;
            }
            video.src = src;
            play();
        }

        function start() {
            if (destroyed) {
                return;
            }
            hideTileError(tile);
            retries = 0;

            loadHls().then(function (Hls) {
                if (destroyed) {
                    return;
                }
                if (!Hls || !Hls.isSupported()) {
                    playNative();
                    return;
                }

                // Start at a quality that fits the tile so the first segment arrives quickly.
                hls = new Hls({
                    capLevelToPlayerSize: true,
                    startFragPrefetch: true,
                    backBufferLength: 30,
                    maxBufferLength: 20,
                    manifestLoadingMaxRetry: 2
                });
                hls.on(Hls.Events.ERROR, function (event, data) {
                    if (!data.fatal) {
                        return;
                    }
                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
                        retries++;
                        hls.recoverMediaError();
                    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retries < 3 && data.details !== 'manifestLoadError') {
                        retries++;
                        setTimeout(function () {
                            if (hls) {
                                hls.startLoad();
                            }
                        }, 1500 * retries);
                    } else {
                        fail(data.response && data.response.code ? 'HTTP ' + data.response.code : data.details);
                    }
                });
                hls.on(Hls.Events.FRAG_LOADED, function () {
                    retries = 0;
                });
                hls.on(Hls.Events.MANIFEST_PARSED, play);
                hls.loadSource(src);
                hls.attachMedia(video);
            }, playNative);
        }

        video.addEventListener('error', function () {
            if (!hls && video.getAttribute('src')) {
                fail(video.error ? 'MediaError ' + video.error.code : '');
            }
        });

        video.addEventListener('volumechange', function () {
            if (String(video.muted) !== tile.dataset.muted) {
                setMuted(tile, video.muted);
            }
        });

        start();

        return {
            mute: function () {
                video.muted = true;
            },
            unmute: function () {
                video.muted = false;
                if (video.volume === 0) {
                    video.volume = 1;
                }
                const result = video.play();
                if (result && result.catch) {
                    result.catch(function () {});
                }
            },
            destroy: function () {
                destroyed = true;
                stop();
            }
        };
    }

    function showTileError(tile, message, detail, retry) {
        hideTileError(tile);
        const box = document.createElement('div');
        box.className = 'tile-error';

        const title = document.createElement('strong');
        title.textContent = message;
        box.appendChild(title);

        if (detail) {
            const small = document.createElement('small');
            small.textContent = detail;
            box.appendChild(small);
        }
        if (retry) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tile-btn';
            btn.textContent = t('retry');
            btn.addEventListener('click', retry);
            box.appendChild(btn);
        }
        tile.appendChild(box);
    }

    function hideTileError(tile) {
        const box = tile.querySelector('.tile-error');
        if (box) {
            box.remove();
        }
    }

    function tileButton(action, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile-btn tile-btn-' + action;
        btn.dataset.action = action;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function updateTileLabels() {
        tiles().forEach(function (tile) {
            tile.querySelector('.tile-name').textContent = channelLabel(tile._channel, tile._index);
            const badge = tile.querySelector('.tile-badge');
            if (badge) {
                badge.textContent = t('proxyMissingShort');
                badge.title = t('proxyMissing');
            }
            const muteBtn = tile.querySelector('.tile-btn-mute');
            muteBtn.textContent = t(tile.dataset.muted === 'true' ? 'unmute' : 'mute');
            muteBtn.classList.toggle('is-live', tile.dataset.muted !== 'true');
            tile.querySelector('.tile-btn-fullscreen').textContent = t('fullscreen');
            tile.querySelector('.tile-btn-remove').textContent = t('remove');
        });
    }

    // Only one tile plays sound at a time; unmuting a tile mutes the others.
    function setMuted(tile, muted) {
        if (!muted) {
            tiles().forEach(function (other) {
                if (other !== tile && other.dataset.muted !== 'true') {
                    other.dataset.muted = 'true';
                    other._player.mute();
                }
            });
        }
        tile.dataset.muted = String(muted);
        if (muted) {
            tile._player.mute();
        } else {
            tile._player.unmute();
        }
        updateTileLabels();
    }

    function removeTile(tile) {
        const index = settings.channels.indexOf(tile._channel);
        if (index !== -1) {
            settings.channels.splice(index, 1);
            saveSettings();
        }
        tile._player.destroy();
        tile.remove();
        layoutGrid();
    }

    function updateChannelCount() {
        const count = videoGrid.children.length;
        channelCount.textContent = count === 1 ? t('channelCountOne') : t('channelCount').replace('{n}', count);
    }

    function layoutGrid() {
        const count = videoGrid.children.length;
        updateChannelCount();
        emptyState.classList.toggle('hidden', count > 0);
        if (!count) {
            return;
        }
        const layout = M.gridLayout(count, videoGrid.clientWidth, videoGrid.clientHeight);
        videoGrid.style.gridTemplateColumns = 'repeat(' + layout.cols + ', 1fr)';
        videoGrid.style.gridTemplateRows = 'repeat(' + layout.rows + ', 1fr)';
    }

    window.addEventListener('resize', function () {
        if (!playerPage.classList.contains('hidden')) {
            layoutGrid();
        }
    });

    /* ---------- Fullscreen ---------- */

    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function requestFullscreen(el) {
        const request = el.requestFullscreen || el.webkitRequestFullscreen;
        if (request) {
            const result = request.call(el);
            if (result && result.catch) {
                result.catch(function () {});
            }
        }
    }

    function exitFullscreen() {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
            const result = exit.call(document);
            if (result && result.catch) {
                result.catch(function () {});
            }
        }
    }

    function updateFullscreenLabel() {
        const active = fullscreenElement() === document.documentElement;
        document.body.classList.toggle('is-fullscreen', active);
        fullscreenToggle.classList.toggle('is-active', active);
        fullscreenToggle.querySelector('.fullscreen-label').textContent = t(active ? 'exitFullscreen' : 'fullscreen');
        fullscreenToggle.title = t(active ? 'exitFullscreen' : 'fullscreen');
        if (!playerPage.classList.contains('hidden')) {
            layoutGrid();
        }
    }

    fullscreenToggle.addEventListener('click', function () {
        if (fullscreenElement()) {
            exitFullscreen();
        } else {
            requestFullscreen(document.documentElement);
        }
    });

    document.addEventListener('fullscreenchange', updateFullscreenLabel);
    document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);

    settingsButton.addEventListener('click', function () {
        if (fullscreenElement()) {
            exitFullscreen();
        }
        showSettings();
    });

    /* ---------- Init ---------- */

    if (!isServed) {
        document.getElementById('file-warning').classList.remove('hidden');
    }

    applyLanguage();

    // Fetch hls.js in parallel with the proxy check instead of after the grid is built.
    if (settings.channels.some(function (c) {
        return c.hlsAlt || (M.parseSource(c.source) || {}).type === 'hls';
    })) {
        loadHls().catch(function () {});
    }

    detectProxy(settings.proxyUrl).then(function () {
        if (settings.autoplay && isServed) {
            showPlayer();
        } else {
            showSettings();
        }
    });
})();
