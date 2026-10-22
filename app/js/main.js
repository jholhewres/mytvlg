(function() {
    var $ = function(id) { return document.getElementById(id); };
    var SELF_ID = 'io.github.jholhewres.mytvlg';

    var DEFAULT_SETTINGS = {
        favorites: CATALOG.DEFAULT_FAVORITES.slice(),
        devices: {},
        city: '',
        theme: 'auto',
        tmdbKey: '',
        newsFeed: 'auto',
        newsUrl: '',
        language: 'auto',
        region: 'auto',
        tempUnit: 'c',
        clock: 'auto',
        showFps: false,
        screensaver: 5,
        rows: { continue: true, live: true, weekend: true, watchlist: true, forYou: true, watched: true, releases: true, shows: true, anime: true, kids: true, categories: true, today: true, news: true },
        hiddenProviders: [],
        minRating: 0,
        omdbKey: '',
        kidsArea: true,
        hideWatched: false,
        iptvEnabled: false,
        iptvSource: 'm3u',
        iptvUrl: '',
        iptvServer: '',
        iptvUser: '',
        iptvPass: ''
    };
    var REGIONS = ['auto', 'BR', 'US', 'PT', 'ES', 'MX', 'AR', 'CO', 'CL', 'GB', 'CA', 'DE', 'FR', 'IT'];

    function loadSettings() {
        var saved = U.store.get('settings', {});
        var s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        for (var k in DEFAULT_SETTINGS) {
            if (saved[k] === undefined) continue;
            if (k === 'rows') { for (var r in saved.rows) s.rows[r] = saved.rows[r]; }
            else s[k] = saved[k];
        }
        return s;
    }

    // TMDB score pre-filter; IMDb (when an OMDb key is set) is applied after the ratings load.
    function passesRating(item) {
        if (state.settings.hideWatched && item.source && inLibrary('watched', item)) return false;
        var min = state.settings.minRating;
        if (!min) return true;
        var score = item.imdb ? parseFloat(item.imdb) : parseFloat(item.rating);
        return !score || score >= min;
    }

    // ---------- Watched & My list (stored on the TV) ----------

    var KEYS = { GREEN: 404, YELLOW: 405 };
    function itemKey(item) { return item.source + ':' + item.kind + ':' + item.id; }
    function snapshot(item) {
        var copy = {};
        ['source', 'id', 'kind', 'title', 'overview', 'backdrop', 'card', 'year', 'rating', 'genres', 'genreIds', 'lang', 'score', 'channel', 'episode'].forEach(function(k) {
            if (item[k] !== undefined) copy[k] = item[k];
        });
        copy.savedAt = Date.now();
        return copy;
    }
    // Parsed once and kept in memory; decorateCard runs for every card on every render.
    var libraryCache = {};
    function libraryMap(name) {
        if (!libraryCache[name]) libraryCache[name] = U.store.get(name, {});
        return libraryCache[name];
    }
    function inLibrary(name, item) { return !!libraryMap(name)[itemKey(item)]; }
    function libraryItems(name) {
        var lib = libraryMap(name);
        return Object.keys(lib).map(function(k) { return lib[k]; }).sort(function(a, b) { return b.savedAt - a.savedAt; });
    }
    function toggleLibrary(name, item) {
        var lib = libraryMap(name);
        var key = itemKey(item);
        var added = !lib[key];
        if (added) lib[key] = snapshot(item); else delete lib[key];
        U.store.set(name, lib);
        if (name === 'watched') {
            toast(added ? t('markedWatched') : t('unmarkedWatched'));
            if (added) remember(item);
        } else {
            toast(added ? t('addedList') : t('removedList'));
        }
        U.toArray(document.querySelectorAll('.media-card')).forEach(function(c) {
            if (c._item && itemKey(c._item) === key) decorateCard(c);
        });
        if (state.layer === 'detail' && detailItem && itemKey(detailItem) === key) {
            renderDetail(detailItem);
            sheetItems = U.toArray($('detail').querySelectorAll('.focusable'));
            focusSheet(U.find(sheetItems, function(i) { return i._key === 'lib:' + name; }) || sheetItems[0]);
        }
        clearTimeout(libraryRenderTimer);
        libraryRenderTimer = setTimeout(function() { if (state.layer === 'main') renderRows(); else libraryDirty = true; }, 1500);
    }
    var libraryRenderTimer = null, libraryDirty = false;

    function decorateCard(card) {
        var item = card._item;
        if (!item) return;
        var watched = inLibrary('watched', item), listed = inLibrary('watchlist', item);
        card.classList.toggle('watched', watched);
        var tag = card.querySelector('.media-card-iptv');
        if (iptvMatches(item)) { if (!tag) card.firstChild.appendChild(U.el('span', 'media-card-iptv', t('iptvBadge'))); }
        else if (tag) tag.parentNode.removeChild(tag);
        var marks = card.querySelector('.media-card-marks');
        if (marks) marks.parentNode.removeChild(marks);
        if (!watched && !listed) return;
        marks = U.el('div', 'media-card-marks');
        if (watched) {
            var w = U.el('span', 'w');
            w.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
            w.appendChild(document.createTextNode(t('watchedBadge')));
            marks.appendChild(w);
        }
        if (listed) {
            var l = U.el('span', 'l');
            l.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';
            l.appendChild(document.createTextNode(t('keyList')));
            marks.appendChild(l);
        }
        card.firstChild.appendChild(marks);
    }

    function libraryTarget() {
        if (state.layer === 'detail') return detailItem;
        var el = state.layer === 'main' ? focusedElement() : sheetFocus;
        return el && el._item ? el._item : null;
    }

    function updateLegend() {
        $('keyLegend').hidden = !libraryTarget() || !!state.reorder;
    }

    function remember(item) {
        if (item.source !== 'tmdb') return;
        var history = U.store.get('history', []).filter(function(h) { return h.kind + h.id !== item.kind + item.id; });
        history.unshift({ id: item.id, kind: item.kind, title: item.title });
        U.store.set('history', history.slice(0, 20));
        loadRecommendations();
    }

    function hiddenIds() { return state.settings.hiddenProviders.map(function(p) { return p.id; }); }

    function isHiddenChannel(name) {
        var n = Media.normalize(name);
        return !!n && state.settings.hiddenProviders.some(function(p) {
            var h = Media.normalize(p.name);
            return h.length > 2 && (n.indexOf(h) === 0 || h.indexOf(n) === 0);
        });
    }

    var state = {
        settings: loadSettings(),
        apps: [],
        weather: null,
        featured: [],
        featuredIndex: 0,
        zones: [],
        zone: 1,
        layer: 'main',
        reorder: null,
        pendingLaunch: null,
        regionProviders: null,
        lastActivity: Date.now()
    };

    // ---------- Apps ----------

    function decorate(app) {
        var known = CATALOG.known(app.id);
        if (known) {
            app.logo = known.logo;
            app.bg = known.bg;
            app.wide = known.wide;
            if (!app.title) app.title = known.title;
        }
        return app;
    }

    function buildApps(discovered, inputs) {
        var list;
        if (discovered && discovered.length) {
            list = discovered.filter(function(a) { return a.id !== SELF_ID && a.id !== 'org.webos.freemytv'; });
        } else {
            list = CATALOG.APPS.map(function(a) { return { id: a.id, title: a.title }; });
        }
        var ins = inputs && inputs.length ? inputs.filter(function(i) { return i.hdmi; }) : CATALOG.HDMI;
        ins.forEach(function(input) {
            list.push({ id: input.id, title: input.title, hdmi: true, connected: input.connected });
        });
        return list.map(decorate);
    }

    function appById(id) { return U.find(state.apps, function(a) { return a.id === id; }); }

    function deviceFor(app) {
        var key = state.settings.devices[app.id] || '';
        return U.find(CATALOG.DEVICES, function(d) { return d.key === key; }) || CATALOG.DEVICES[0];
    }

    function displayTitle(app) {
        if (app.hdmi) {
            var device = deviceFor(app);
            return device.title || app.title;
        }
        return app.title;
    }

    function refreshApps() {
        if (!TV.ssap.isPaired()) return Promise.resolve();
        return Promise.all([TV.listApps(), TV.listInputs().catch(function() { return null; })]).then(function(res) {
            U.store.set('apps_cache', { apps: res[0], inputs: res[1] });
            state.apps = buildApps(res[0], res[1]);
            renderRows();
        }).catch(function() {});
    }

    function pairTv() {
        toast(t('pairWaiting'), 60000);
        return TV.ssap.connect(true).then(function() {
            toast(t('pairDone'));
            return refreshApps();
        }).catch(function() {
            toast(t('pairFailed'));
        });
    }

    function launchApp(app, tile) {
        if (state.pendingLaunch) return;
        var name = displayTitle(app);
        if (!TV.available) { toast(t('previewOnly')); return; }
        var request = {};
        state.pendingLaunch = request;
        if (tile) tile.setAttribute('aria-busy', 'true');
        toast(t('opening', { name: name }), 8000);
        function done(message) {
            if (state.pendingLaunch !== request) return;
            clearTimeout(request.timer);
            state.pendingLaunch = null;
            if (tile) tile.removeAttribute('aria-busy');
            if (message) toast(message); else hideToast();
        }
        request.timer = setTimeout(function() { done(t('noResponse', { name: name })); }, 8000);
        TV.launch(app.id).then(function() { done(''); }).catch(function(err) {
            done(err && err.notInstalled ? t('notInstalled', { name: name }) : t('openFailed', { name: name }));
        });
    }

    // ---------- Toast ----------

    var toastTimer = null;
    function toast(message, duration) {
        var el = $('toast');
        el.textContent = message;
        el.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, duration || 3200);
    }
    function hideToast() { $('toast').classList.remove('visible'); }

    // ---------- Clock & theme ----------

    var lastMinute = -1;
    function tick() {
        var now = new Date();
        if (now.getMinutes() === lastMinute) return;
        lastMinute = now.getMinutes();
        var opts = { hour: '2-digit', minute: '2-digit' };
        if (state.settings.clock !== 'auto') opts.hour12 = state.settings.clock === '12';
        var time = now.toLocaleTimeString(I18N.tag, opts);
        var date = capitalize(now.toLocaleDateString(I18N.tag, { weekday: 'long', day: 'numeric', month: 'long' }));
        $('clockTime').textContent = time;
        $('clockDate').textContent = date;
        $('screensaverTime').textContent = time;
        $('screensaverDate').textContent = date;
        applyTheme();
        if (state.zone <= 1 && !state.featured.length) showHero(greetingHero());
    }

    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    function minutesOf(hhmm) {
        var p = (hhmm || '').split(':');
        return p.length === 2 ? parseInt(p[0], 10) * 60 + parseInt(p[1], 10) : null;
    }

    function timeOfDay() {
        var now = new Date();
        var m = now.getHours() * 60 + now.getMinutes();
        var w = state.weather;
        var rise = w ? minutesOf(w.sunrise) : 6 * 60;
        var set = w ? minutesOf(w.sunset) : 18 * 60;
        if (m >= rise - 45 && m < rise + 60) return 'dawn';
        if (m >= set - 75 && m < set + 30) return 'sunset';
        if (m >= rise + 60 && m < set - 75) return 'day';
        return 'night';
    }

    function applyTheme() {
        var theme = state.settings.theme;
        document.body.classList.toggle('theme-oled', theme === 'oled');
        document.body.setAttribute('data-tod', theme === 'auto' ? timeOfDay() : 'night');
    }

    // ---------- Weather ----------

    function loadWeather() {
        var g = ++gen.weather;
        return Weather.load(state.settings.city, state.settings.tempUnit).then(function(w) {
            if (!fresh('weather', g)) return;
            state.weather = w;
            $('weatherIcon').innerHTML = Weather.icon(w.code, w.isDay);
            $('weatherTemp').textContent = w.temp + '°';
            $('weatherCondition').textContent = Weather.condition(w.code);
            $('weatherCity').textContent = w.city;
            $('screensaverWeather').textContent = w.temp + '° · ' + Weather.condition(w.code) + (w.city ? ' · ' + w.city : '');
            applyTheme();
            if (state.layer === 'weather') {
                renderWeatherSheet();
                sheetItems = U.toArray($('weatherBody').querySelectorAll('.focusable'));
                focusSheet(sheetItems[0]);
            }
        }).catch(function() {
            $('weatherIcon').innerHTML = Weather.icon(3, true);
            $('weatherTemp').textContent = '--°';
            $('weatherCondition').textContent = t('weatherSet');
            $('weatherCity').textContent = '';
        });
    }

    // ---------- Hero & backdrop ----------

    var backdropFront = 'backdropA';
    var heroTimer = null;
    var currentHero = null;

    function setBackdrop(url) {
        var front = $(backdropFront);
        if (!url) { front.classList.remove('visible'); return; }
        if (front.getAttribute('data-url') === url && front.classList.contains('visible')) return;
        var img = new Image();
        img.onload = function() {
            var backId = backdropFront === 'backdropA' ? 'backdropB' : 'backdropA';
            var back = $(backId);
            back.style.backgroundImage = 'url("' + url + '")';
            back.setAttribute('data-url', url);
            back.classList.add('visible');
            $(backdropFront).classList.remove('visible');
            backdropFront = backId;
        };
        img.src = url;
    }

    function showHero(hero) {
        if (!hero || currentHero === hero) return;
        currentHero = hero;
        clearTimeout(heroTimer);
        var el = $('hero');
        el.classList.add('fading');
        heroTimer = setTimeout(function() {
            $('heroEyebrow').textContent = hero.eyebrow || '';
            var title = $('heroTitle');
            title.textContent = hero.title || '';
            title.classList.toggle('long', (hero.title || '').length > 20);
            var meta = $('heroMeta');
            meta.innerHTML = '';
            (hero.meta || []).forEach(function(m) {
                var node;
                if (m.type === 'provider') {
                    node = U.el('span', 'provider');
                    if (m.logo) { var img = U.el('img'); img.src = m.logo; node.appendChild(img); }
                    node.appendChild(document.createTextNode(m.text));
                } else {
                    node = U.el('span', m.type || '', m.text);
                }
                meta.appendChild(node);
            });
            $('heroDesc').textContent = hero.desc || '';
            setBackdrop(hero.backdrop || '');
            el.classList.remove('fading');
        }, 160);
    }

    function greetingHero() {
        var h = new Date().getHours();
        var greeting = h < 5 ? t('greetingEvening') : h < 12 ? t('greetingMorning') : h < 18 ? t('greetingAfternoon') : t('greetingEvening');
        var w = state.weather;
        return {
            eyebrow: capitalize(new Date().toLocaleDateString(I18N.tag, { weekday: 'long', day: 'numeric', month: 'long' })),
            title: greeting,
            meta: w ? [{ text: w.temp + '° · ' + Weather.condition(w.code) }, { text: w.city }] : [],
            desc: t('greetingHint')
        };
    }

    function mediaHero(item) {
        var meta = [];
        if (item.imdb) meta.push({ type: 'imdb', text: 'IMDb ' + item.imdb });
        else if (item.rating) meta.push({ type: 'rating', text: '★ ' + item.rating });
        if (item.year) meta.push({ text: item.year });
        if (item.episode) meta.push({ type: 'pill', text: item.episode });
        if (item.genres && item.genres.length) meta.push({ text: item.genres.join(' · ') });
        if (item.provider) meta.push({ type: 'provider', text: item.provider.name, logo: item.provider.logo });
        else if (item.channel) meta.push({ type: 'pill', text: item.channel });
        return {
            eyebrow: item.eyebrow || (item.kind === 'movie' ? t('movie') : item.kind === 'tv' ? t('show') : t('episode')),
            title: item.title,
            meta: meta,
            desc: item.overview,
            backdrop: item.backdrop
        };
    }

    function newsHero(item) {
        return {
            eyebrow: item.source,
            title: item.title,
            meta: item.date ? [{ text: U.timeAgo(item.date) }] : [],
            desc: item.summary,
            backdrop: item.image
        };
    }

    var featuredTimer = null;
    function startFeatured() {
        clearInterval(featuredTimer);
        if (!state.featured.length) { showHero(greetingHero()); return; }
        showFeatured();
        featuredTimer = setInterval(function() {
            if (state.zone > 1 || state.layer !== 'main') return;
            state.featuredIndex = (state.featuredIndex + 1) % state.featured.length;
            showFeatured();
        }, 12000);
    }
    function showFeatured() {
        state.featured = state.featured.filter(function(i) { return !i.removed; });
        if (!state.featured.length) { showHero(greetingHero()); return; }
        var item = state.featured[state.featuredIndex % state.featured.length];
        item.eyebrow = t('featured');
        if (!item.hero) item.hero = mediaHero(item);
        showHero(item.hero);
    }

    // ---------- Rows ----------

    var rowData = { continue: [], weekend: null, forYou: null, releases: null, shows: null, anime: null, kids: null, today: null, news: null };

    function rowSection(key, title, sub) {
        var section = U.el('section', 'row');
        section.setAttribute('data-row', key);
        var header = U.el('div', 'row-header');
        header.appendChild(U.el('h2', 'row-title', title));
        if (sub) header.appendChild(U.el('span', 'row-sub', sub));
        header.appendChild(U.el('span', 'row-count'));
        section.appendChild(header);
        var viewport = U.el('div', 'track-viewport');
        var track = U.el('div', 'track');
        viewport.appendChild(track);
        section.appendChild(viewport);
        return { section: section, track: track };
    }

    function appTile(app) {
        var tile = U.el('button', 'app-tile focusable');
        var face = U.el('div', 'app-tile-face');
        var title = displayTitle(app);
        if (app.hdmi) {
            var device = deviceFor(app);
            face.style.background = device.bg;
            if (device.logo) addImage(face, 'assets/brands/' + device.logo + '.svg', 'brand-logo', title);
            else face.innerHTML = CATALOG.deviceArt(device.art);
            if (app.connected) face.appendChild(U.el('span', 'status-dot'));
        } else if (app.logo) {
            face.style.background = app.bg;
            addImage(face, 'assets/brands/' + app.logo + '.svg', 'brand-logo' + (app.wide ? ' wide' : ''), title);
        } else {
            face.style.background = app.bg || tileColor(app.color);
            if (app.icon) addImage(face, app.icon, 'tv-icon', title);
            else face.appendChild(U.el('span', 'fallback-name', title));
        }
        tile.appendChild(face);
        tile.appendChild(U.el('div', 'app-tile-label', title + (app.hdmi && deviceFor(app).title ? ' · ' + app.title : '')));
        tile.setAttribute('aria-label', title);
        tile._activate = function() {
            if (state.reorder) return toggleMoving(app.id);
            launchApp(app, tile);
        };
        tile._appId = app.id;
        return tile;
    }

    function tileColor(color) {
        if (!color || /^#?f{3,6}$/i.test(color)) return 'linear-gradient(135deg, #2a2e3d, #151821)';
        return 'linear-gradient(135deg, ' + color + ', #0d0f16)';
    }

    function addImage(parent, url, className, fallbackText) {
        var img = U.el('img', className);
        img.alt = '';
        img.onerror = function() {
            if (img.parentNode) img.parentNode.removeChild(img);
            parent.insertBefore(U.el('span', 'fallback-name', fallbackText), parent.firstChild);
        };
        img.src = url;
        parent.appendChild(img);
    }

    function pairTile() {
        var tile = U.el('button', 'app-tile focusable');
        var face = U.el('div', 'app-tile-face');
        face.style.background = 'linear-gradient(135deg, rgba(157,140,255,0.35), rgba(255,122,168,0.25))';
        face.innerHTML = '<svg class="device-art" viewBox="0 0 64 64"><path d="M32 18v28M18 32h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>';
        tile.appendChild(face);
        tile.appendChild(U.el('div', 'app-tile-label', t('allApps')));
        tile._activate = pairTv;
        tile._hero = { eyebrow: t('apps'), title: t('pairTitle'), desc: t('pairText') };
        return tile;
    }

    function allAppsTile() {
        var tile = U.el('button', 'app-tile focusable');
        var face = U.el('div', 'app-tile-face');
        face.style.background = 'linear-gradient(135deg, #2a2e3d, #151821)';
        face.innerHTML = '<svg class="device-art" viewBox="0 0 64 64">' +
            [14, 29, 44].map(function(y) {
                return [14, 29, 44].map(function(x) { return '<rect x="' + x + '" y="' + y + '" width="9" height="9" rx="3" fill="#fff"/>'; }).join('');
            }).join('') + '</svg>';
        tile.appendChild(face);
        tile.appendChild(U.el('div', 'app-tile-label', t('allApps')));
        tile._activate = openAllApps;
        return tile;
    }

    function openAllApps() {
        $('allAppsTitle').textContent = t('allApps');
        var grid = $('allAppsGrid');
        grid.innerHTML = '';
        function rank(a) { return (a.system ? 1 : 0) + (a.hdmi ? 2 : 0); }
        state.apps.slice().sort(function(a, b) { return rank(a) - rank(b); }).forEach(function(app) {
            grid.appendChild(appTile(app));
        });
        $('allApps').querySelector('.sheet-scroll').scrollTop = 0;
        openSheet('allApps', 'allapps');
    }

    function mediaCard(item) {
        var card = U.el('button', 'media-card focusable');
        var face = U.el('div', 'media-card-face');
        if (item.card) face.style.backgroundImage = 'url("' + item.card + '")';
        if (item.thisWeek) face.appendChild(U.el('span', 'media-card-badge accent', t('thisWeekBadge')));
        else if (item.isNew) face.appendChild(U.el('span', 'media-card-badge accent', item.kind === 'episode' ? t('today') : t('newBadge')));
        var text = U.el('div', 'media-card-text');
        text.appendChild(U.el('div', 'media-card-title', item.title));
        var sub = [item.episode || item.year, item.channel || (item.genres || [])[0]].filter(Boolean).join(' · ');
        text.appendChild(U.el('div', 'media-card-sub', sub));
        face.appendChild(text);
        card.appendChild(face);
        card._item = item;
        card._heroFn = function() { return mediaHero(item); };
        card._activate = function() { openDetail(item); };
        decorateCard(card);
        return card;
    }

    function setCardProvider(card, provider) {
        if (!provider || !provider.logo || card.querySelector('.media-card-provider')) return;
        var face = card.firstChild;
        var img = U.el('img', 'media-card-provider');
        img.src = provider.logo;
        img.alt = provider.name;
        face.appendChild(img);
    }

    function openMedia(item, chosen) {
        remember(item);
        if (chosen) {
            if (!chosen.appId) { toast(t('notInstalled', { name: chosen.name })); return; }
            launchApp(appById(chosen.appId) || { id: chosen.appId, title: chosen.name });
            return;
        }
        var appId = item.provider && item.provider.appId;
        if (!appId && item.channel) {
            var name = item.channel.toLowerCase().replace(/[^a-z0-9]/g, '');
            var hit = U.find(state.apps, function(a) {
                var title = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return title.length > 2 && (name.indexOf(title) === 0 || title.indexOf(name) === 0);
            });
            if (hit) appId = hit.id;
        }
        if (!appId) { toast(item.provider ? t('availableOn') + ' ' + item.provider.name : t('notStreaming')); return; }
        launchApp(appById(appId) || { id: appId, title: item.provider ? item.provider.name : item.channel });
    }

    // ---------- Kids zone ----------

    function videoCard(video) {
        var card = U.el('button', 'media-card focusable');
        var face = U.el('div', 'media-card-face');
        face.style.backgroundImage = 'url("https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg")';
        var text = U.el('div', 'media-card-text');
        text.appendChild(U.el('div', 'media-card-title', video.title));
        text.appendChild(U.el('div', 'media-card-sub', video.channel + ' · ' + U.timeAgo(video.date)));
        face.appendChild(text);
        card.appendChild(face);
        card._activate = function() {
            if (!TV.available) { window.open('https://www.youtube.com/watch?v=' + video.id, '_blank'); return; }
            toast(t('opening', { name: 'YouTube' }));
            TV.launch('youtube.leanback.v4', { contentTarget: 'https://www.youtube.com/tv?v=' + video.id })
                .catch(function() { toast(t('openFailed', { name: 'YouTube' })); });
        };
        return card;
    }

    var kidsToken = 0;
    function openKids() {
        var token = ++kidsToken;
        var body = $('kidsBody');
        body.innerHTML = '';
        var head = U.el('div', 'kids-head');
        var h = U.el('h2');
        h.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg>';
        h.appendChild(document.createTextNode(t('kidsTitle')));
        head.appendChild(h);
        var exit = U.el('button', 'button focusable', t('kidsExit'));
        exit._activate = function() { closeSheet(); };
        head.appendChild(exit);
        body.appendChild(head);

        var sections = [{ key: 'videos', title: t('kidsVideos'), load: function() { return Kids.videos(4).then(function(v) { return v.slice(0, 16); }); }, card: videoCard }];
        var key = state.settings.tmdbKey;
        if (key) {
            var kidsCat = categoryByKey('kids');
            sections.push({ key: 'shows', title: t('kidsShows'), card: mediaCard,
                load: function() { return Media.explore(key, { type: 'tv', category: kidsCat, sort: 'popularity' }, 1).then(function(i) { return i.slice(0, 12); }); } });
            sections.push({ key: 'movies', title: t('kidsMovies'), card: mediaCard,
                load: function() { return Media.explore(key, { type: 'movie', category: kidsCat, sort: 'popularity' }, 1).then(function(i) { return i.slice(0, 12); }); } });
        }
        sections.forEach(function(sec) {
            body.appendChild(U.el('h3', '', sec.title));
            var grid = U.el('div', 'browse-grid');
            skeletonCards(grid, 4);
            body.appendChild(grid);
            sec.load().then(function(items) {
                if (token !== kidsToken) return;
                grid.innerHTML = '';
                items.forEach(function(item) { grid.appendChild(sec.card(item)); });
                if (state.layer === 'kids') {
                    sheetItems = U.toArray(body.querySelectorAll('.focusable'));
                    if (sheetFocus === exit && sec.key === 'videos' && items.length) focusSheet(grid.firstChild);
                }
                if (sec.card === mediaCard) attachProviders(grid);
            }).catch(function() { grid.innerHTML = ''; });
        });
        body.scrollTop = 0;
        openSheet('kids', 'kids');
    }

    // ---------- IPTV & player ----------

    function loadIptv() {
        if (!state.settings.iptvEnabled) { state.iptvStatus = ''; Iptv.load(state.settings); renderRowsSoon(); return Promise.resolve(); }
        state.iptvStatus = t('iptvLoading');
        return Iptv.load(state.settings).then(function() {
            var c = Iptv.counts();
            state.iptvStatus = c ? t('iptvLoaded', { m: c.movies, s: c.series, e: c.episodes, l: c.live }) : '';
            U.toArray(document.querySelectorAll('.media-card')).forEach(decorateCard);
            renderRowsSoon();
        }).catch(function() {
            state.iptvStatus = t('iptvError');
        }).then(function() {
            if (state.layer === 'settings') rerenderSettingsKeepingFocus();
        });
    }

    function iptvMatches(item) {
        if (!Iptv.ready() || !item || item.source !== 'tmdb') return false;
        return item.kind === 'movie' ? Iptv.findMovie(item).length > 0 : !!Iptv.findSeries(item);
    }

    var player = { ret: null, uiTimer: null, opts: null, saveTimer: null };

    function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2);
    }

    function openPlayer(opts) {
        player.opts = opts;
        player.ret = { layer: state.layer, items: sheetItems, focus: sheetFocus };
        state.layer = 'player';
        $('player').classList.add('open');
        $('playerTitle').textContent = opts.title;
        $('playerSub').textContent = opts.sub || '';
        $('player').classList.toggle('live', !!opts.live);
        $('playerHint').textContent = opts.live ? t('playerHintLive') : t('playerHint');
        var video = $('playerVideo');
        var resume = opts.live ? 0 : U.store.get('resume', {})[opts.url] || 0;
        video.src = opts.url;
        video.onloadedmetadata = function() {
            if (resume > 30 && (!video.duration || resume < video.duration - 60)) {
                video.currentTime = resume;
                playerState(t('resumeFrom'), 2500);
            }
        };
        video.onerror = function() {
            if (player.opts && player.opts.live) { playerState(t('playerError'), 4000); return; }
            toast(t('playerError'), 5000);
            closePlayer();
        };
        video.ontimeupdate = updatePlayerUi;
        video.onended = function() { finishPlayback(); closePlayer(); };
        video.play().catch(function() {});
        clearInterval(player.saveTimer);
        player.saveTimer = setInterval(savePosition, 10000);
        showPlayerUi();
    }

    function savePosition() {
        var video = $('playerVideo');
        if (!player.opts || player.opts.live || !video.currentTime) return;
        var resume = U.store.get('resume', {});
        resume[player.opts.url] = Math.floor(video.currentTime);
        var keys = Object.keys(resume);
        if (keys.length > 200) delete resume[keys[0]];
        U.store.set('resume', resume);
        if (video.duration && video.currentTime / video.duration > 0.92) finishPlayback();
    }

    function finishPlayback() {
        if (player.opts && !player.opts.finished && player.opts.onFinish) {
            player.opts.finished = true;
            player.opts.onFinish();
        }
    }

    function closePlayer() {
        savePosition();
        clearInterval(player.saveTimer);
        var video = $('playerVideo');
        video.pause();
        video.removeAttribute('src');
        video.load();
        $('player').classList.remove('open');
        state.lastActivity = Date.now();
        var ret = player.ret;
        player.opts = null;
        if (!ret || ret.layer === 'main') { state.layer = 'main'; focusZone(state.zone); return; }
        state.layer = ret.layer;
        sheetItems = ret.items;
        focusSheet(ret.focus);
        if (state.layer === 'episodes') renderEpisodes();
    }

    function updatePlayerUi() {
        var video = $('playerVideo');
        $('playerTime').textContent = fmtTime(video.currentTime);
        $('playerDuration').textContent = video.duration && isFinite(video.duration) ? fmtTime(video.duration) : '';
        $('playerProgress').style.width = video.duration ? (video.currentTime * 100 / video.duration) + '%' : '0';
    }

    function showPlayerUi() {
        $('playerUi').classList.remove('hidden');
        clearTimeout(player.uiTimer);
        player.uiTimer = setTimeout(function() { if (!$('playerVideo').paused) $('playerUi').classList.add('hidden'); }, 4000);
    }

    var stateTimer = null;
    function playerState(text, ms) {
        var el = $('playerState');
        el.textContent = text;
        el.classList.add('visible');
        clearTimeout(stateTimer);
        stateTimer = setTimeout(function() { el.classList.remove('visible'); }, ms || 1200);
    }

    function playerKey(e) {
        state.lastActivity = Date.now();
        var video = $('playerVideo');
        var code = e.keyCode;
        showPlayerUi();
        if (Nav.isBack(e) || code === 413) { closePlayer(); return; }
        if (code === 13 || code === 415 || code === 19 || code === 179) {
            if (video.paused) { video.play(); playerState('▶'); } else { video.pause(); playerState('❚❚'); }
            return;
        }
        if (player.opts && player.opts.live) {
            var zap = { 38: -1, 40: 1, 33: -1, 34: 1 }[code];
            if (zap) {
                var list = player.opts.list;
                var next = (player.opts.index + zap + list.length) % list.length;
                player.opts.index = next;
                player.opts.url = list[next].url;
                $('playerTitle').textContent = list[next].name;
                $('playerSub').textContent = list[next].group || '';
                video.src = list[next].url;
                video.play().catch(function() {});
                playerState(list[next].name, 1500);
            }
            return;
        }
        var step = { 37: -10, 39: 10, 38: 60, 40: -60, 412: -30, 417: 30 }[code];
        if (step && video.duration) {
            video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + step));
            playerState((step > 0 ? '+' : '') + step + 's');
        }
    }

    // ---------- Live TV ----------

    function channelCard(ch, list, index) {
        var card = U.el('button', 'media-card channel-card focusable');
        var face = U.el('div', 'media-card-face');
        var initials = U.el('span', 'ch-initials', (ch.name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w.charAt(0); }).join('').toUpperCase());
        face.appendChild(initials);
        if (ch.logo) {
            var img = U.el('img');
            img.alt = '';
            img.onload = function() { initials.style.display = 'none'; };
            img.onerror = function() { if (img.parentNode) img.parentNode.removeChild(img); };
            img.src = ch.logo;
            face.appendChild(img);
        }
        face.appendChild(U.el('span', 'live-dot', t('liveBadge')));
        card.appendChild(face);
        card.appendChild(U.el('div', 'ch-name', ch.name));
        if (ch.group) card.appendChild(U.el('div', 'ch-group', ch.group));
        card._hero = { eyebrow: t('liveTv'), title: ch.name, desc: ch.group };
        card._activate = function() { playChannel(list, index); };
        return card;
    }

    function playChannel(list, index) {
        var ch = list[index];
        openPlayer({ title: ch.name, sub: ch.group, url: ch.url, live: true, list: list, index: index });
    }

    // IPTV library: live channels, movies and series with the list's own categories.
    var lib = { type: 'live', group: '', query: '', series: null };
    function openChannels(type) {
        lib.type = type || 'live';
        lib.group = '';
        lib.query = '';
        lib.series = null;
        $('channelsInput').value = '';
        $('channelsBody').scrollTop = 0;
        openSheet('channels', 'channels');
        renderLibrary();
        focusSheet(U.find(sheetItems, function(i) { return i.classList.contains('media-card'); }) || sheetItems[0]);
    }

    function libraryData() {
        if (lib.series) {
            var eps = [];
            Object.keys(lib.series.episodes).forEach(function(code) {
                var p = code.split('x');
                lib.series.episodes[code].forEach(function(e) { eps.push({ s: +p[0], e: +p[1], name: e.name, url: e.url }); });
            });
            eps.sort(function(x, y) { return x.s - y.s || x.e - y.e; });
            return eps;
        }
        return lib.type === 'movie' ? Iptv.vod() : lib.type === 'series' ? Iptv.seriesList() : Iptv.live();
    }

    function posterCard(item, label, sub, activate) {
        var card = U.el('button', 'media-card poster-card focusable');
        var face = U.el('div', 'media-card-face');
        face.appendChild(U.el('span', 'poster-fallback', label));
        if (item.logo) {
            var img = new Image();
            img.onload = function() { face.style.backgroundImage = 'url("' + item.logo + '")'; face.firstChild.style.display = 'none'; };
            img.src = item.logo;
        }
        card.appendChild(face);
        card.appendChild(U.el('div', 'ch-name', label));
        if (sub) card.appendChild(U.el('div', 'ch-group', sub));
        card._hero = { eyebrow: t('iptvLibrary'), title: label, desc: sub };
        card._activate = activate;
        return card;
    }

    function renderLibrary(keepKey) {
        var all = libraryData();
        var bar = $('channelsFilters');
        bar.innerHTML = '';
        $('channelsTitle').textContent = lib.series ? lib.series.name : t('iptvLibrary');
        $('channelsInput').placeholder = t('channelSearchPh');
        if (!lib.series) {
            var types = [['live', t('libLive'), Iptv.live().length], ['movie', t('libMovies'), Iptv.vod().length], ['series', t('libSeries'), Iptv.seriesList().length]];
            types.forEach(function(tp) {
                if (!tp[2]) return;
                var chip = U.el('button', 'filter-chip focusable' + (lib.type === tp[0] ? ' active' : ''));
                chip.appendChild(U.el('span', 'v', tp[1] + ' · ' + tp[2]));
                chip._key = 'lib:type:' + tp[0];
                chip._activate = function() { lib.type = tp[0]; lib.group = ''; renderLibrary(chip._key); };
                bar.appendChild(chip);
            });
            var groups = [];
            all.forEach(function(c) { if (c.group && groups.indexOf(c.group) === -1) groups.push(c.group); });
            if (groups.length) {
                var gchip = U.el('button', 'filter-chip focusable' + (lib.group ? ' active' : ''));
                gchip.appendChild(U.el('span', 'k', t('fCategory')));
                gchip.appendChild(U.el('span', 'v', lib.group || t('fAll')));
                gchip._key = 'lib:group';
                gchip._activate = function() {
                    var values = [''].concat(groups);
                    lib.group = values[(values.indexOf(lib.group) + 1) % values.length];
                    renderLibrary('lib:group');
                };
                bar.appendChild(gchip);
            }
        }
        var q = lib.query.toLowerCase();
        var filtered = all.filter(function(c) {
            return (!lib.group || c.group === lib.group) && (!q || (c.name || '').toLowerCase().indexOf(q) !== -1);
        });
        $('channelsCount').textContent = t('itemsShown', { n: filtered.length });
        var grid = $('channelsGrid');
        grid.innerHTML = '';
        grid.classList.toggle('posters', !lib.series && lib.type !== 'live');
        // Rendering is capped; search or the category filter narrows the rest.
        filtered.slice(0, 280).forEach(function(c, i) {
            if (lib.series) {
                var label = t('iptvSeasonEp', { s: c.s, e: c.e });
                grid.appendChild(channelLikeCard(label, c.name, function() {
                    openPlayer({ title: lib.series.name, sub: label + (c.name && c.name !== label ? ' · ' + c.name : ''), url: c.url });
                }));
            } else if (lib.type === 'live') {
                grid.appendChild(channelCard(c, filtered, i));
            } else if (lib.type === 'movie') {
                grid.appendChild(posterCard(c, c.name, c.group, function() {
                    openPlayer({ title: c.name, sub: c.group, url: c.url });
                }));
            } else {
                grid.appendChild(posterCard(c, c.name, c.group, function() {
                    Iptv.episodes(c).then(function() {
                        lib.series = c;
                        lib.query = '';
                        $('channelsInput').value = '';
                        renderLibrary();
                        focusSheet(U.find(sheetItems, function(i) { return i.classList.contains('media-card'); }) || sheetItems[0]);
                    });
                }));
            }
        });
        if (!filtered.length) grid.appendChild(U.el('div', 'search-empty', t('noItems')));
        sheetItems = U.toArray($('channelsBody').querySelectorAll('.focusable'));
        if (keepKey) focusSheet(U.find(sheetItems, function(i) { return i._key === keepKey; }) || sheetItems[0]);
    }

    function channelLikeCard(label, sub, activate) {
        var card = U.el('button', 'media-card channel-card focusable');
        var face = U.el('div', 'media-card-face');
        face.appendChild(U.el('span', 'ch-initials', label));
        card.appendChild(face);
        if (sub) card.appendChild(U.el('div', 'ch-name', sub));
        card._activate = activate;
        return card;
    }

    var channelTimer = null;
    $('channelsInput').addEventListener('input', function() {
        clearTimeout(channelTimer);
        channelTimer = setTimeout(function() {
            if (state.layer !== 'channels') return;
            lib.query = $('channelsInput').value.trim();
            renderLibrary();
            focusSheet($('channelsInput'));
        }, 400);
    });
    $('channelsInput')._activate = function() { $('channelsInput').focus(); };
    $('channelsInput')._key = 'ch:search';

    // ---------- Seasons & episodes ----------

    function epStore() { return U.store.get('episodes', {}); }
    function epCode(s, e) { return s + 'x' + e; }
    function seenFor(tvId) { var entry = epStore()[tvId]; return entry ? entry.seen : {}; }

    function setEpisodes(show, codes, watched) {
        var store = epStore();
        var entry = store[show.id] || { show: snapshot(show), seen: {} };
        codes.forEach(function(c) { if (watched) entry.seen[c] = Date.now(); else delete entry.seen[c]; });
        entry.updatedAt = Date.now();
        if (Object.keys(entry.seen).length) store[show.id] = entry; else delete store[show.id];
        U.store.set('episodes', store);
        if (watched) remember(show);
        loadContinue();
    }

    function airedCount(details) {
        var last = details.last_episode_to_air;
        if (!last) return 0;
        var n = 0;
        (details.seasons || []).forEach(function(s) {
            if (s.season_number < 1) return;
            if (s.season_number < last.season_number) n += s.episode_count;
            else if (s.season_number === last.season_number) n += last.episode_number;
        });
        return n;
    }

    // First aired episode not marked yet, in order; null when up to date.
    function nextEpisode(details, seen) {
        var last = details.last_episode_to_air;
        if (!last) return null;
        var seasons = (details.seasons || []).filter(function(s) { return s.season_number > 0; })
            .sort(function(a, b) { return a.season_number - b.season_number; });
        for (var i = 0; i < seasons.length; i++) {
            var s = seasons[i];
            if (s.season_number > last.season_number) break;
            var max = s.season_number === last.season_number ? last.episode_number : s.episode_count;
            for (var e = 1; e <= max; e++) {
                if (!seen[epCode(s.season_number, e)]) return { s: s.season_number, e: e };
            }
        }
        return null;
    }

    function daysUntil(date) {
        return Math.ceil((new Date(date + 'T12:00:00').getTime() - Date.now()) / 86400000);
    }

    function trackingLabel(details, seen) {
        var next = nextEpisode(details, seen);
        if (next) return t('nextEp', { s: next.s, e: next.e });
        var up = details.next_episode_to_air;
        if (up && up.air_date) {
            var d = daysUntil(up.air_date);
            return d <= 0 ? t('newEpToday') : t('newEpIn', { d: d });
        }
        return t('upToDate');
    }

    function loadContinue() {
        var key = state.settings.tmdbKey;
        var store = epStore();
        var ids = Object.keys(store);
        var g = ++gen.cont;
        if (!key || !ids.length) { rowData.continue = []; renderRowsSoon(); return; }
        Promise.all(ids.map(function(id) {
            var entry = store[id];
            return Media.tvDetails(key, id).then(function(details) {
                var item = {};
                for (var k in entry.show) item[k] = entry.show[k];
                item.episode = trackingLabel(details, entry.seen);
                item.upToDate = !nextEpisode(details, entry.seen);
                item.updatedAt = entry.updatedAt || 0;
                item.tracking = true;
                return item;
            }).catch(function() { return null; });
        })).then(function(items) {
            if (!fresh('cont', g)) return;
            rowData.continue = items.filter(Boolean).sort(function(a, b) {
                return (a.upToDate ? 1 : 0) - (b.upToDate ? 1 : 0) || b.updatedAt - a.updatedAt;
            });
            renderRowsSoon();
        });
    }

    var renderSoonTimer = null;
    function renderRowsSoon() {
        clearTimeout(renderSoonTimer);
        renderSoonTimer = setTimeout(function() { if (state.layer === 'main') renderRows(); else libraryDirty = true; }, 300);
    }

    var ep = { show: null, details: null, season: 1, filter: 'all', order: 'asc', list: [], ret: null, token: 0 };

    function openEpisodes(show) {
        ep.ret = state.layer === 'main' ? null : { layer: state.layer, items: sheetItems, focus: sheetFocus };
        ep.show = show;
        ep.details = null;
        ep.iptv = {};
        var iptvShow = Iptv.findSeries(show);
        if (iptvShow) Iptv.episodes(iptvShow).then(function(map) {
            if (ep.show !== show) return;
            ep.iptv = map || {};
            if (state.layer === 'episodes' && ep.details) renderEpisodes();
        });
        ep.filter = 'all';
        ep.order = 'asc';
        var body = $('episodesBody');
        body.innerHTML = '';
        body.appendChild(U.el('div', 'search-empty', t('loading')));
        body.scrollTop = 0;
        if (ep.ret) {
            state.layer = 'episodes';
            $('episodes').classList.add('open');
            sheetItems = [];
            sheetFocus = null;
        } else {
            openSheet('episodes', 'episodes');
        }
        var token = ++ep.token;
        Media.tvDetails(state.settings.tmdbKey, show.id).then(function(details) {
            if (token !== ep.token) return;
            ep.details = details;
            var next = nextEpisode(details, seenFor(show.id));
            var seasons = seasonNumbers();
            ep.season = next ? next.s : (seasons.length ? seasons[0] : 0);
            loadSeason();
        }).catch(function() { body.innerHTML = ''; body.appendChild(U.el('div', 'search-empty', t('searchEmpty'))); });
    }

    function seasonNumbers() {
        var all = (ep.details.seasons || []).map(function(s) { return s.season_number; }).sort(function(a, b) { return a - b; });
        var regular = all.filter(function(n) { return n > 0; });
        return regular.length ? regular.concat(all.indexOf(0) !== -1 ? [0] : []) : all;
    }

    function loadSeason() {
        var token = ++ep.token;
        Media.season(state.settings.tmdbKey, ep.show.id, ep.season).then(function(list) {
            if (token !== ep.token) return;
            ep.list = list;
            renderEpisodes();
        }).catch(function() { ep.list = []; renderEpisodes(); });
    }

    function renderEpisodes(focusKey) {
        var body = $('episodesBody');
        var show = ep.show, details = ep.details;
        var seen = seenFor(show.id);
        var keep = focusKey || (sheetFocus && sheetFocus._key);
        body.innerHTML = '';

        var head = U.el('div', 'ep-head');
        var bg = show.backdrop || (details.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + details.backdrop_path : '');
        if (bg) head.style.backgroundImage = 'url("' + bg + '")';
        var text = U.el('div', 'ep-head-text');
        text.appendChild(U.el('div', 'hero-eyebrow', t('seasonsEpisodes')));
        text.appendChild(U.el('div', 'ep-title', show.title));
        var aired = airedCount(details);
        var watchedCount = Object.keys(seen).filter(function(c) { return c.indexOf('0x') !== 0; }).length;
        var progress = U.el('div', 'ep-progress');
        var bar = U.el('div', 'ep-bar');
        var fill = U.el('i');
        fill.style.width = (aired ? Math.min(100, Math.round(watchedCount * 100 / aired)) : 0) + '%';
        bar.appendChild(fill);
        progress.appendChild(bar);
        progress.appendChild(U.el('span', '', t('epProgress', { w: watchedCount, n: aired })));
        progress.appendChild(U.el('span', 'next', trackingLabel(details, seen)));
        text.appendChild(progress);
        head.appendChild(text);
        body.appendChild(head);

        var seasonsBar = U.el('div', 'filter-bar');
        seasonNumbers().forEach(function(n) {
            var chip = U.el('button', 'filter-chip focusable' + (n === ep.season ? ' active' : ''));
            chip.appendChild(U.el('span', 'v', n === 0 ? t('specials') : t('seasonN', { n: n })));
            chip._key = 'season:' + n;
            chip._activate = function() { ep.season = n; loadSeason(); };
            seasonsBar.appendChild(chip);
        });
        body.appendChild(seasonsBar);

        var tools = U.el('div', 'ep-tools');
        var filters = { all: t('epAll'), unwatched: t('epUnwatched'), watched: t('epWatched') };
        var fChip = U.el('button', 'filter-chip focusable' + (ep.filter !== 'all' ? ' active' : ''));
        fChip.appendChild(U.el('span', 'k', t('epShow')));
        fChip.appendChild(U.el('span', 'v', filters[ep.filter]));
        fChip._key = 'ep:filter';
        fChip._activate = function() {
            var order = ['all', 'unwatched', 'watched'];
            ep.filter = order[(order.indexOf(ep.filter) + 1) % order.length];
            renderEpisodes('ep:filter');
        };
        tools.appendChild(fChip);
        var oChip = U.el('button', 'filter-chip focusable');
        oChip.appendChild(U.el('span', 'k', t('epOrder')));
        oChip.appendChild(U.el('span', 'v', ep.order === 'asc' ? t('epAsc') : t('epDesc')));
        oChip._key = 'ep:order';
        oChip._activate = function() { ep.order = ep.order === 'asc' ? 'desc' : 'asc'; renderEpisodes('ep:order'); };
        tools.appendChild(oChip);
        var view = U.store.get('ep_view', 'grid');
        var vChip = U.el('button', 'filter-chip focusable');
        vChip.appendChild(U.el('span', 'k', t('epView')));
        vChip.appendChild(U.el('span', 'v', view === 'grid' ? t('epGrid') : t('epList')));
        vChip._key = 'ep:view';
        vChip._activate = function() { U.store.set('ep_view', view === 'grid' ? 'list' : 'grid'); renderEpisodes('ep:view'); };
        tools.appendChild(vChip);
        var today = U.isoDate(new Date());
        var airedHere = ep.list.filter(function(e) { return e.airDate && e.airDate <= today; });
        var allSeen = airedHere.length && airedHere.every(function(e) { return seen[epCode(e.season, e.number)]; });
        var seasonBtn = U.el('button', 'button focusable', allSeen ? t('unmarkSeason') : t('markSeason'));
        seasonBtn._key = 'ep:season';
        seasonBtn._activate = function() {
            setEpisodes(show, airedHere.map(function(e) { return epCode(e.season, e.number); }), !allSeen);
            toast(allSeen ? t('epUnmarked') : t('epMarked'));
            renderEpisodes('ep:season');
        };
        tools.appendChild(seasonBtn);
        body.appendChild(tools);

        var list = U.el('div', 'ep-list' + (view === 'grid' ? ' grid' : ''));
        var episodes = ep.list.filter(function(e) {
            var w = !!seen[epCode(e.season, e.number)];
            return ep.filter === 'all' || (ep.filter === 'watched' ? w : !w);
        });
        if (ep.order === 'desc') episodes = episodes.slice().reverse();
        episodes.forEach(function(e) {
            var code = epCode(e.season, e.number);
            var unaired = !e.airDate || e.airDate > today;
            var row = U.el('button', 'ep-row focusable' + (seen[code] ? ' watched' : '') + (unaired ? ' unaired' : ''));
            var thumb = U.el('div', 'ep-thumb');
            if (e.still) thumb.style.backgroundImage = 'url("' + e.still + '")';
            row.appendChild(thumb);
            var info = U.el('div', 'ep-info');
            var name = U.el('div', 'ep-name');
            name.appendChild(U.el('b', '', 'E' + e.number));
            name.appendChild(document.createTextNode(e.name || ''));
            info.appendChild(name);
            var date = e.airDate ? new Date(e.airDate + 'T12:00:00').toLocaleDateString(I18N.tag, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            info.appendChild(U.el('div', 'ep-meta', [unaired ? t('notAired') : '', date, e.runtime ? t('min', { n: e.runtime }) : '', e.rating ? '★ ' + e.rating : '']
                .filter(Boolean).join('  ·  ')));
            if (e.overview) info.appendChild(U.el('div', 'ep-overview', e.overview));
            row.appendChild(info);
            var streams = ep.iptv[code] || [];
            if (streams.length) row.appendChild(U.el('span', 'ep-play', '▶ ' + t('iptvBadge')));
            var check = U.el('span', 'ep-check');
            check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
            row.appendChild(check);
            row._key = 'ep:' + code;
            row._episode = e;
            row._toggle = function() {
                if (unaired) { toast(t('notAired')); return; }
                var nowSeen = !seenFor(show.id)[code];
                setEpisodes(show, [code], nowSeen);
                toast(nowSeen ? t('epMarked') : t('epUnmarked'));
                renderEpisodes(row._key);
            };
            row._activate = function() {
                if (streams.length) {
                    openPlayer({ title: show.title, sub: 'T' + e.season + ' E' + e.number + (e.name ? ' · ' + e.name : ''), url: streams[0].url, onFinish: function() {
                        if (!seenFor(show.id)[code]) setEpisodes(show, [code], true);
                    } });
                    return;
                }
                if (unaired) { toast(t('notAired')); return; }
                var nowSeen = !seenFor(show.id)[code];
                setEpisodes(show, [code], nowSeen);
                toast(nowSeen ? t('epMarked') : t('epUnmarked'));
                renderEpisodes(row._key);
            };
            list.appendChild(row);
        });
        if (!episodes.length) list.appendChild(U.el('div', 'search-empty', t('noEpisodes')));
        body.appendChild(list);

        sheetItems = U.toArray(body.querySelectorAll('.focusable'));
        var again = keep && U.find(sheetItems, function(i) { return i._key === keep; });
        focusSheet(again || U.find(sheetItems, function(i) { return i._key === 'season:' + ep.season; }) || sheetItems[0]);
    }

    function closeEpisodes() {
        $('episodes').classList.remove('open');
        ep.token++;
        if (ep.ret) {
            state.layer = ep.ret.layer;
            sheetItems = ep.ret.items;
            focusSheet(ep.ret.focus);
            ep.ret = null;
        } else {
            closeSheet();
        }
    }

    // ---------- Title detail ----------

    var detailReturn = null;
    function openDetail(item) {
        detailReturn = state.layer === 'main' ? null : { layer: state.layer, items: sheetItems, focus: sheetFocus };
        renderDetail(item);
        if (detailReturn) {
            state.layer = 'detail';
            $('detail').classList.add('open');
            sheetItems = U.toArray($('detail').querySelectorAll('.focusable'));
            focusSheet(sheetItems[0]);
        } else {
            openSheet('detail', 'detail');
        }
        var key = state.settings.tmdbKey;
        if (key && item.source === 'tmdb' && !item.provider) {
            Media.provider(key, item, state.apps, hiddenIds()).then(function(p) {
                if (p && !p.hidden) item.provider = p;
                if (state.layer === 'detail' && detailItem === item) {
                    var keep = sheetFocus && sheetFocus._key;
                    renderDetail(item);
                    sheetItems = U.toArray($('detail').querySelectorAll('.focusable'));
                    focusSheet(U.find(sheetItems, function(i) { return keep && i._key === keep; }) || sheetItems[0]);
                }
            });
        }
    }

    function closeDetail() {
        $('detail').classList.remove('open');
        if (detailReturn) {
            state.layer = detailReturn.layer;
            sheetItems = detailReturn.items;
            focusSheet(detailReturn.focus);
            detailReturn = null;
        } else {
            closeSheet();
        }
    }

    var detailItem = null;
    function renderDetail(item) {
        detailItem = item;
        var body = $('detailBody');
        body.innerHTML = '';
        var hero = U.el('div', 'detail-hero');
        var img = item.backdrop || item.card;
        if (img) hero.style.backgroundImage = 'url("' + img + '")';
        body.appendChild(hero);
        var content = U.el('div', 'detail-content');
        var h = mediaHero(item);
        content.appendChild(U.el('div', 'hero-eyebrow', h.eyebrow));
        content.appendChild(U.el('div', 'detail-title', item.title));
        var meta = U.el('div', 'hero-meta');
        h.meta.filter(function(m) { return m.type !== 'provider'; }).forEach(function(m) { meta.appendChild(U.el('span', m.type || '', m.text)); });
        content.appendChild(meta);
        if (item.overview) content.appendChild(U.el('p', 'detail-overview', item.overview));

        content.appendChild(U.el('h3', '', t('whereToWatch')));
        var list = U.el('div', 'provider-list');
        if (Iptv.ready() && item.source === 'tmdb') {
            if (item.kind === 'movie') {
                Iptv.findMovie(item).slice(0, 4).forEach(function(entry) {
                    var b = U.el('button', 'provider-button installed focusable');
                    b.appendChild(U.el('span', 'media-card-iptv', t('iptvBadge')));
                    b.firstChild.style.position = 'static';
                    b.firstChild.style.marginRight = '14px';
                    b.appendChild(U.el('span', '', t('playIptv')));
                    b.appendChild(U.el('span', 'sub', entry.name));
                    b._activate = function() {
                        closeDetail();
                        openPlayer({ title: item.title, sub: entry.name, url: entry.url, onFinish: function() {
                            if (!inLibrary('watched', item)) toggleLibrary('watched', item);
                        } });
                    };
                    list.appendChild(b);
                });
            } else if (Iptv.findSeries(item)) {
                var sb = U.el('button', 'provider-button installed focusable');
                sb.appendChild(U.el('span', 'media-card-iptv', t('iptvBadge')));
                sb.firstChild.style.position = 'static';
                sb.firstChild.style.marginRight = '14px';
                sb.appendChild(U.el('span', '', t('iptvEpisodes')));
                sb._activate = function() { closeDetail(); openEpisodes(item); };
                list.appendChild(sb);
            }
        }
        var providers = item.provider && item.provider.all ? item.provider.all : [];
        if (!providers.length && item.channel) {
            var hit = U.find(state.apps, function(a) {
                var n = Media.normalize(item.channel), ti = Media.normalize(a.title);
                return ti.length > 2 && (n.indexOf(ti) === 0 || ti.indexOf(n) === 0);
            });
            providers = [{ name: item.channel, appId: hit ? hit.id : '', logo: '' }];
        }
        providers.forEach(function(p) {
            var b = U.el('button', 'provider-button focusable' + (p.appId ? ' installed' : ''));
            if (p.logo) { var im = U.el('img'); im.src = p.logo; im.alt = ''; b.appendChild(im); }
            b.appendChild(U.el('span', '', p.appId ? t('openIn', { name: p.name }) : p.name));
            if (!p.appId) b.appendChild(U.el('span', 'sub', t('notInstalledShort')));
            b._activate = function() { closeDetail(); openMedia(item, p); };
            list.appendChild(b);
        });
        if (!providers.length && !list.children.length) list.appendChild(U.el('p', 'note', item.source === 'tmdb' && !item.provider ? t('loading') : t('notStreaming')));
        content.appendChild(list);

        var actions = U.el('div', 'detail-actions');
        if (item.source === 'tmdb' && item.kind === 'tv') {
            var epBtn = U.el('button', 'button primary focusable', t('seasonsEpisodes'));
            epBtn._key = 'episodes';
            epBtn._activate = function() { closeDetail(); openEpisodes(item); };
            actions.appendChild(epBtn);
        }
        if (item) {
            [['watched', 'green', inLibrary('watched', item) ? t('unmarkWatched') : t('markWatched')],
                ['watchlist', 'yellow', inLibrary('watchlist', item) ? t('removeList') : t('addList')]].forEach(function(a) {
                var b = U.el('button', 'button focusable');
                b.appendChild(U.el('i', 'dot ' + a[1]));
                b.appendChild(document.createTextNode(a[2]));
                b._key = 'lib:' + a[0];
                b._activate = function() { toggleLibrary(a[0], item); };
                actions.appendChild(b);
            });
        }
        var close = U.el('button', 'button focusable', t('close'));
        close._activate = closeDetail;
        actions.appendChild(close);
        content.appendChild(actions);
        body.appendChild(content);
    }

    function categoryLabel(cat) {
        return cat.label ? t(cat.label) : (Media.genreName(cat.genre) || cat.key);
    }

    function categoryCard(cat) {
        var card = U.el('button', 'media-card category-card focusable');
        var face = U.el('div', 'media-card-face');
        face.style.background = 'linear-gradient(135deg, ' + cat.colors[0] + ', ' + cat.colors[1] + ')';
        face.appendChild(U.el('span', 'glyph'));
        face.appendChild(U.el('div', 'category-name', categoryLabel(cat)));
        card.appendChild(face);
        card._hero = { eyebrow: t('categories'), title: categoryLabel(cat), desc: t('categoriesSub') };
        card._activate = function() { openExplore({ category: cat.key }); };
        return card;
    }

    // ---------- Search & explore ----------

    var DECADES = ['', '2020', '2010', '2000', '1990', '1980', '1970'];
    var LANGUAGES = ['', 'pt', 'en', 'es', 'ja', 'ko', 'fr', 'it', 'de'];
    var LANGUAGE_NAMES = { pt: 'Português', en: 'English', es: 'Español', ja: '日本語', ko: '한국어', fr: 'Français', it: 'Italiano', de: 'Deutsch' };
    var explore = { query: '', filters: { type: 'all', category: '', provider: '', rating: 0, decade: '', language: '', sort: 'popularity' }, token: 0 };

    function filterDefs() {
        var providers = (state.regionProviders || []).filter(function(p) {
            return hiddenIds().indexOf(p.id) === -1;
        });
        return [
            { key: 'type', label: t('fType'), values: ['all', 'movie', 'tv'], format: function(v) { return { all: t('fAll'), movie: t('fMovies'), tv: t('fSeries') }[v]; } },
            { key: 'category', label: t('fGenre'), values: [''].concat(CATALOG.CATEGORIES.map(function(c) { return c.key; })),
                format: function(v) { var c = categoryByKey(v); return c ? categoryLabel(c) : t('fAny'); } },
            { key: 'provider', label: t('fService'), values: [''].concat(providers.map(function(p) { return p.id; })),
                format: function(v) { var p = U.find(providers, function(x) { return x.id === v; }); return p ? p.name : t('fMine'); } },
            { key: 'rating', label: t('minRating'), values: [0, 6, 7, 7.5, 8], format: function(v) { return v ? v + '+' : t('fAny'); } },
            { key: 'decade', label: t('fDecade'), values: DECADES, format: function(v) { return !v ? t('fAny') : v === '1970' ? '< 1980' : v + 's'; } },
            { key: 'language', label: t('fLanguage'), values: LANGUAGES, format: function(v) { return v ? LANGUAGE_NAMES[v] : t('fAny'); } },
            { key: 'sort', label: t('fSort'), values: ['popularity', 'rating', 'newest'],
                format: function(v) { return { popularity: t('fPopular'), rating: t('fTopRated'), newest: t('fNewest') }[v]; } }
        ];
    }

    function categoryByKey(key) { return U.find(CATALOG.CATEGORIES, function(c) { return c.key === key; }); }

    function openExplore(preset) {
        explore.query = '';
        explore.filters = { type: 'all', category: '', provider: '', rating: state.settings.minRating || 0, decade: '', language: '', sort: 'popularity' };
        if (preset) for (var k in preset) explore.filters[k] = preset[k];
        $('searchInput').value = '';
        $('searchInput').placeholder = t('searchPlaceholder');
        if (state.regionProviders === null && state.settings.tmdbKey) {
            Media.regionProviders(state.settings.tmdbKey).then(function(list) {
                state.regionProviders = list;
                if (state.layer === 'search') renderFilterBar();
            }).catch(function() { state.regionProviders = []; });
        }
        clearInterval(ehTimer);
        ehItems = [];
        $('exploreHero').hidden = true;
        $('ehA').classList.remove('visible');
        $('ehB').classList.remove('visible');
        renderFilterBar();
        $('search').querySelector('.sheet-scroll').scrollTop = 0;
        openSheet('search', 'search');
        sheetItems = exploreItems();
        focusSheet(preset ? sheetItems[1] : sheetItems[0]);
        runExplore();
    }

    var ehTimer = null, ehItems = [], ehIndex = 0, ehFront = 'ehA';
    function startExploreHero(items, label) {
        clearInterval(ehTimer);
        var key = state.settings.tmdbKey;
        var candidates = items.filter(function(i) { return i.backdrop; }).slice(0, 10);
        var token = explore.token;
        // Resolve services first so titles only on hidden services never reach the slideshow.
        Promise.all(candidates.map(function(i) {
            return Media.provider(key, i, state.apps, hiddenIds()).then(function(p) { if (p && p.hidden) i.removed = true; });
        })).then(function() {
            if (token !== explore.token || state.layer !== 'search') return;
            runExploreHero(candidates.filter(function(i) { return !i.removed; }).slice(0, 6), label);
        });
    }

    function runExploreHero(items, label) {
        ehItems = items;
        var hero = $('exploreHero');
        hero.hidden = !ehItems.length;
        if (!ehItems.length) return;
        $('ehEyebrow').textContent = label;
        var dots = $('ehDots');
        dots.innerHTML = '';
        ehItems.forEach(function() { dots.appendChild(U.el('span')); });
        ehIndex = 0;
        showExploreSlide();
        ehTimer = setInterval(function() {
            if (state.layer !== 'search') { clearInterval(ehTimer); return; }
            ehIndex = (ehIndex + 1) % ehItems.length;
            showExploreSlide();
        }, 7000);
    }

    function showExploreSlide() {
        // Titles dropped by the service/rating filters leave the slideshow too.
        var kept = ehItems.filter(function(i) { return !i.removed; });
        if (kept.length !== ehItems.length) {
            var current = ehItems[ehIndex];
            ehItems = kept;
            ehIndex = Math.max(0, ehItems.indexOf(current));
            if (!ehItems.length) { $('exploreHero').hidden = true; return; }
            var dots = $('ehDots');
            dots.innerHTML = '';
            ehItems.forEach(function() { dots.appendChild(U.el('span')); });
        }
        var item = ehItems[ehIndex % ehItems.length];
        var content = $('exploreHero').querySelector('.eh-content');
        content.classList.add('fading');
        var img = new Image();
        img.onload = function() {
            var back = ehFront === 'ehA' ? 'ehB' : 'ehA';
            $(back).style.backgroundImage = 'url("' + item.backdrop + '")';
            $(back).classList.add('visible');
            $(ehFront).classList.remove('visible');
            ehFront = back;
        };
        img.src = item.backdrop;
        setTimeout(function() {
            $('ehTitle').textContent = item.title;
            var meta = $('ehMeta');
            meta.innerHTML = '';
            mediaHero(item).meta.forEach(function(m) {
                if (m.type === 'provider') return;
                meta.appendChild(U.el('span', m.type || '', m.text));
            });
            $('ehDesc').textContent = item.overview;
            U.toArray($('ehDots').children).forEach(function(d, i) { d.classList.toggle('on', i === ehIndex); });
            content.classList.remove('fading');
        }, 300);
    }

    $('exploreHero')._activate = function() { if (ehItems[ehIndex]) openDetail(ehItems[ehIndex]); };

    function exploreItems() {
        var lead = $('exploreHero').hidden ? [] : [$('exploreHero')];
        return lead.concat([$('searchInput')]).concat(U.toArray($('filterBar').querySelectorAll('.focusable')), U.toArray($('searchGrid').querySelectorAll('.focusable')));
    }

    function renderFilterBar() {
        var bar = $('filterBar');
        var focusedKey = sheetFocus && sheetFocus._key;
        bar.innerHTML = '';
        filterDefs().forEach(function(def) {
            var chip = U.el('button', 'filter-chip focusable');
            var value = explore.filters[def.key];
            chip.appendChild(U.el('span', 'k', def.label));
            chip.appendChild(U.el('span', 'v', def.format(value)));
            if (value && value !== 'all' && value !== 'popularity') chip.classList.add('active');
            chip._key = 'filter:' + def.key;
            chip._activate = function() {
                var i = def.values.indexOf(explore.filters[def.key]);
                explore.filters[def.key] = def.values[(i + 1) % def.values.length];
                renderFilterBar();
                runExplore();
            };
            bar.appendChild(chip);
        });
        if (state.layer === 'search') {
            sheetItems = exploreItems();
            if (focusedKey) focusSheet(U.find(sheetItems, function(i) { return i._key === focusedKey; }) || sheetFocus);
        }
    }

    function matchesFilters(item) {
        var f = explore.filters;
        if (f.type !== 'all' && item.kind !== f.type) return false;
        if (f.rating && item.score && item.score < f.rating) return false;
        if (f.language && item.lang && item.lang !== f.language) return false;
        if (f.decade) {
            var y = parseInt(item.year, 10), d = parseInt(f.decade, 10);
            if (!y || (d < 1980 ? y >= 1980 : (y < d || y > d + 9))) return false;
        }
        var cat = categoryByKey(f.category);
        if (cat) {
            var g = cat[item.kind] && cat[item.kind].with_genres;
            if (!g) return false;
            var wanted = String(g).split(',').map(Number);
            if (!wanted.every(function(id) { return item.genreIds.indexOf(id) !== -1; })) return false;
        }
        return true;
    }

    var exploreTimer = null;
    function runExplore() {
        clearTimeout(exploreTimer);
        var token = ++explore.token;
        var grid = $('searchGrid');
        exploreTimer = setTimeout(function() {
            var key = state.settings.tmdbKey;
            if (!key) { grid.innerHTML = ''; grid.appendChild(U.el('div', 'search-empty', t('tmdbTitle'))); return; }
            grid.innerHTML = '';
            skeletonCards(grid, 8);
            var f = {};
            for (var k in explore.filters) f[k] = explore.filters[k];
            f.category = categoryByKey(f.category);
            var job = explore.query ? Media.search(key, explore.query).then(function(items) { return items.filter(matchesFilters); })
                : Promise.all([Media.explore(key, f, 1), Media.explore(key, f, 2)]).then(function(r) { return r[0].concat(r[1]); });
            job.then(function(items) {
                if (token !== explore.token || state.layer !== 'search') return;
                grid.innerHTML = '';
                items.forEach(function(item) { grid.appendChild(mediaCard(item)); });
                if (!items.length) grid.appendChild(U.el('div', 'search-empty', t('searchEmpty')));
                $('searchCount').textContent = items.length ? t('titles', { n: items.length }) : '';
                var cat = categoryByKey(explore.filters.category);
                if (cat && !explore.query) startExploreHero(items, categoryLabel(cat));
                else { clearInterval(ehTimer); $('exploreHero').hidden = true; }
                sheetItems = exploreItems();
                if (!sheetFocus || sheetItems.indexOf(sheetFocus) === -1) focusSheet(sheetItems[0]);
                else focusSheet(sheetFocus);
                attachProviders(grid);
            }).catch(function() {
                if (token === explore.token) { grid.innerHTML = ''; grid.appendChild(U.el('div', 'search-empty', t('searchEmpty'))); }
            });
        }, explore.query ? 600 : 150);
    }

    $('searchInput').addEventListener('input', function() {
        explore.query = $('searchInput').value.trim();
        runExplore();
    });
    $('searchInput')._activate = function() { $('searchInput').focus(); };
    $('searchInput')._key = 'search';

    function updateExploreDetail(el) {
        var item = el && el._item;
        var detail = $('searchDetail');
        detail.innerHTML = '';
        if (!item) return;
        var head = [item.imdb ? 'IMDb ' + item.imdb : item.rating ? '★ ' + item.rating : '', item.year, (item.genres || []).join(' · '), item.provider ? item.provider.name : '']
            .filter(Boolean).join('   ');
        detail.appendChild(U.el('b', '', item.title));
        detail.appendChild(document.createTextNode(head + (item.overview ? ' — ' + item.overview : '')));
    }

    function newsCard(item) {
        var card = U.el('button', 'media-card news-card focusable');
        var face = U.el('div', 'media-card-face' + (item.image ? '' : ' no-image'));
        if (item.image) face.style.backgroundImage = 'url("' + item.image + '")';
        var text = U.el('div', 'media-card-text');
        text.appendChild(U.el('div', 'media-card-title', item.title));
        text.appendChild(U.el('div', 'media-card-sub', [item.source, item.date ? U.timeAgo(item.date) : ''].filter(Boolean).join(' · ')));
        face.appendChild(text);
        card.appendChild(face);
        card._heroFn = function() { return newsHero(item); };
        card._activate = function() {
            if (!item.link) return;
            if (!TV.available) { window.open(item.link, '_blank'); return; }
            TV.openUrl(item.link).catch(function() { toast(t('openFailed', { name: item.source })); });
        };
        return card;
    }

    function infoCard(title, text, action) {
        var card = U.el('button', 'media-card info-card focusable');
        var face = U.el('div', 'media-card-face');
        face.appendChild(U.el('div', 'info-card-title', title));
        face.appendChild(U.el('div', 'info-card-text', text));
        card.appendChild(face);
        card._hero = { eyebrow: '', title: title, desc: text };
        card._activate = action;
        return card;
    }

    function skeletonCards(track, n, cls) {
        for (var i = 0; i < n; i++) {
            var card = U.el('div', 'media-card skeleton ' + (cls || ''));
            card.appendChild(U.el('div', 'media-card-face'));
            track.appendChild(card);
        }
    }

    function renderRows() {
        var rowsEl = $('rows');
        var focusedZone = state.zones[state.zone];
        var focusedKey = focusedZone ? focusedZone.key : 'apps';
        rowsEl.innerHTML = '';
        $('kidsButton').hidden = !state.settings.kidsArea;
        var iptvOn = Iptv.ready() && (Iptv.live().length || Iptv.vod().length || Iptv.seriesList().length);
        $('iptvButton').hidden = !iptvOn;
        var topItems = [$('searchButton')];
        if (iptvOn) topItems.push($('iptvButton'));
        if (state.settings.kidsArea) topItems.push($('kidsButton'));
        state.zones = [{ key: 'top', items: topItems.concat([$('weatherChip'), $('settingsButton')]), index: topItems.length + 1 }];

        // Apps
        var apps = rowSection('apps', t('apps'), state.reorder ? '' : t('appsSub'));
        var favorites = state.reorder ? state.reorder.list : state.settings.favorites;
        favorites.map(appById).filter(Boolean).forEach(function(app) {
            var tile = appTile(app);
            if (state.reorder) tile.classList.add('editing');
            if (state.reorder && state.reorder.moving === app.id) tile.classList.add('moving');
            apps.track.appendChild(tile);
        });
        if (!state.reorder) apps.track.appendChild(TV.ssap.isPaired() || !TV.available ? allAppsTile() : pairTile());
        addZone('apps', apps);

        // Releases (TMDB) or a hint to add a key
        var key = state.settings.tmdbKey;
        var rows = state.settings.rows;

        var following = rowData.continue || [];
        if (rows.continue && key && following.length) {
            var cw = rowSection('continue', t('continueRow'), t('continueSub'));
            following.forEach(function(item) {
                var card = mediaCard(item);
                card._activate = function() { openEpisodes(item); };
                cw.track.appendChild(card);
            });
            addZone('continue', cw);
        }

        var liveList = Iptv.live();
        if (rows.live && liveList.length) {
            var lr = rowSection('live', t('liveTv'), t('liveSub'));
            liveList.slice(0, 20).forEach(function(ch, i) { lr.track.appendChild(channelCard(ch, liveList, i)); });
            var allCh = U.el('button', 'media-card channel-card focusable');
            var allFace = U.el('div', 'media-card-face');
            allFace.appendChild(U.el('span', 'ch-initials', '⋯'));
            allCh.appendChild(allFace);
            allCh.appendChild(U.el('div', 'ch-name', t('allChannels') + ' (' + liveList.length + ')'));
            allCh._hero = { eyebrow: t('liveTv'), title: t('allChannels'), desc: t('channelsShown', { n: liveList.length }) };
            allCh._activate = function() { openChannels('live'); };
            lr.track.appendChild(allCh);
            addZone('live', lr);
        }

        var week = (rowData.weekend || []).filter(passesRating);
        if (rows.weekend && key && week.length) {
            // Thursday to Sunday the row is framed as weekend picks.
            var day = new Date().getDay();
            var weekendish = day === 0 || day >= 4;
            var wk = rowSection('weekend', weekendish ? t('weekend') : t('thisWeekRow'), t('weekendSub'));
            week.forEach(function(item) { wk.track.appendChild(mediaCard(item)); });
            addZone('weekend', wk);
        }
        var releases = rowSection('releases', t('releases'), t('releasesSub'));
        if (!rows.releases) {
            // hidden by the user
        } else if (!key) {
            releases.track.appendChild(infoCard(t('tmdbTitle'), t('tmdbText'), openSettings));
            addZone('releases', releases);
        } else if (rowData.releases === null) {
            skeletonCards(releases.track, 5);
            addZone('releases', releases);
        } else if (rowData.releases.length) {
            rowData.releases.filter(passesRating).forEach(function(item) { releases.track.appendChild(mediaCard(item)); });
            addZone('releases', releases);
        }

        var listItems = libraryItems('watchlist');
        if (rows.watchlist && listItems.length) {
            var wl = rowSection('watchlist', t('watchlist'), t('watchlistSub'));
            listItems.forEach(function(item) { wl.track.appendChild(mediaCard(item)); });
            addZone('watchlist', wl);
        }

        var forYou = rowData.forYou;
        if (rows.forYou && key && forYou && forYou.items.length) {
            var fy = rowSection('forYou', t('forYou'), forYou.personal ? t('forYouSub') : t('forYouTop'));
            forYou.items.filter(passesRating).forEach(function(item) { fy.track.appendChild(mediaCard(item)); });
            addZone('forYou', fy);
        }

        if (rows.shows && key && rowData.shows && rowData.shows.length) {
            var shows = rowSection('shows', t('shows'), t('showsSub'));
            rowData.shows.filter(passesRating).forEach(function(item) { shows.track.appendChild(mediaCard(item)); });
            addZone('shows', shows);
        }

        [['anime', t('anime'), t('animeSub')], ['kids', t('kids'), t('kidsSub')]].forEach(function(r) {
            var data = rowData[r[0]];
            if (!rows[r[0]] || !key || !data || !data.length) return;
            var row = rowSection(r[0], r[1], r[2]);
            data.filter(passesRating).forEach(function(item) { row.track.appendChild(mediaCard(item)); });
            addZone(r[0], row);
        });

        if (rows.categories && key) {
            var cats = rowSection('categories', t('categories'), t('categoriesSub'));
            CATALOG.CATEGORIES.forEach(function(cat) { cats.track.appendChild(categoryCard(cat)); });
            addZone('categories', cats);
        }

        var todayItems = (rowData.today || []).filter(function(item) { return !isHiddenChannel(item.channel) && passesRating(item); });
        if (rows.today && todayItems.length) {
            var today = rowSection('today', t('releasesToday'), t('releasesTodaySub'));
            todayItems.forEach(function(item) { today.track.appendChild(mediaCard(item)); });
            addZone('today', today);
        }

        var watchedItems = libraryItems('watched');
        if (rows.watched && watchedItems.length) {
            var wr = rowSection('watched', t('watchedRow'), t('watchedRowSub'));
            watchedItems.forEach(function(item) { wr.track.appendChild(mediaCard(item)); });
            addZone('watched', wr);
        }

        var newsFeed = News.feedFor(state.settings);
        var news = rowSection('news', t('news'), newsFeed ? newsFeed.name : '');
        if (!rows.news) {
            // hidden by the user
        } else if (rowData.news === null) {
            skeletonCards(news.track, 4, 'news-card');
            addZone('news', news);
        } else if (rowData.news.length) {
            rowData.news.forEach(function(item) { news.track.appendChild(newsCard(item)); });
            addZone('news', news);
        } else {
            news.track.appendChild(infoCard(t('news'), t('newsError'), openSettings));
            addZone('news', news);
        }

        // Keep focus on the same row after a re-render.
        var idx = 1;
        state.zones.forEach(function(z, i) { if (z.key === focusedKey) idx = i; });
        // Rows can re-render while an overlay is open; only move focus when the home screen has it.
        if (state.layer === 'main') focusZone(idx, true);
        else state.zone = Math.min(idx, state.zones.length - 1);
        attachProviders();
    }

    var zoneMemory = {};
    function addZone(key, row) {
        $('rows').appendChild(row.section);
        var items = U.toArray(row.track.querySelectorAll('.focusable'));
        state.zones.push({ key: key, section: row.section, track: row.track, items: items, index: Math.min(zoneMemory[key] || 0, Math.max(items.length - 1, 0)) });
    }

    function attachProviders(root) {
        var key = state.settings.tmdbKey;
        if (!key) return;
        var cards = U.toArray((root || $('rows')).querySelectorAll('.media-card')).filter(function(c) {
            return c._item && c._item.source === 'tmdb';
        });
        var hidden = hiddenIds();
        U.pool(cards, 4, function(card) {
            return Media.provider(key, card._item, state.apps, hidden).then(function(p) {
                if (p && p.hidden) { removeCard(card); return; }
                card._item.provider = p;
                setCardProvider(card, p);
                if (explore.filters.provider && state.layer === 'search' && p && p.ids && p.ids.indexOf(explore.filters.provider) === -1) {
                    removeCard(card);
                    return;
                }
                return Media.imdbRating(key, state.settings.omdbKey, card._item).then(function(imdb) {
                    if (!imdb) return;
                    card._item.imdb = imdb;
                    var min = state.layer === 'search' ? explore.filters.rating : state.settings.minRating;
                    if (min && parseFloat(imdb) < min) removeCard(card);
                });
            }).then(function() {
                if (card.classList.contains('focused')) {
                    if (state.layer === 'search') updateExploreDetail(card);
                    else showHero(mediaHero(card._item));
                }
            });
        });
    }

    function removeCard(card) {
        if (card._item) card._item.removed = true;
        var wasFocused = card.classList.contains('focused');
        if (card.parentNode) card.parentNode.removeChild(card);
        var si = sheetItems.indexOf(card);
        if (si !== -1) {
            sheetItems.splice(si, 1);
            if (wasFocused) focusSheet(sheetItems[Math.min(si, sheetItems.length - 1)]);
            $('searchCount').textContent = t('titles', { n: $('searchGrid').querySelectorAll('.media-card').length });
            return;
        }
        state.zones.forEach(function(z, i) {
            var idx = z.items.indexOf(card);
            if (idx === -1) return;
            z.items.splice(idx, 1);
            if (z.index > idx || z.index >= z.items.length) z.index = Math.max(0, z.index - 1);
            if (!z.items.length && z.section) z.section.parentNode.removeChild(z.section);
            if (wasFocused && i === state.zone && z.items.length) focusZone(i, true);
            else if (z.track && z.items.length) scrollTrack(z, true);
        });
        var current = state.zones[state.zone];
        state.zones = state.zones.filter(function(z) { return z.items.length; });
        var idx = state.zones.indexOf(current);
        state.zone = idx !== -1 ? idx : Math.min(state.zone, state.zones.length - 1);
        if (state.layer === 'main' && idx === -1 && state.zones.length) focusZone(state.zone, true);
    }

    // ---------- Focus on the home screen ----------

    function focusedElement() {
        var z = state.zones[state.zone];
        return z && z.items[z.index];
    }

    function focusZone(zoneIndex, instant) {
        if (zoneIndex < 0 || zoneIndex >= state.zones.length) return;
        var z = state.zones[zoneIndex];
        if (!z.items.length) return;
        state.zone = zoneIndex;
        U.toArray(document.querySelectorAll('.topbar .focused, #rows .focused')).forEach(function(el) { el.classList.remove('focused'); });
        var el = z.items[z.index];
        el.classList.add('focused');
        zoneMemory[z.key] = z.index;

        scrollRows(instant);
        if (z.track) scrollTrack(z, instant);
        updateRowIndicators();
        updateLegend();

        if (z.key === 'top' || z.key === 'apps') {
            if (el._hero) showHero(el._hero);
            else if (state.featured.length) showFeatured();
            else showHero(greetingHero());
        } else if (el._heroFn) {
            showHero(el._heroFn());
        } else if (el._hero) {
            showHero(el._hero);
        }
    }

    function updateRowIndicators() {
        state.zones.forEach(function(z, i) {
            if (!z.section) return;
            z.section.classList.toggle('current', i === state.zone);
            var count = z.section.querySelector('.row-count');
            if (!count) return;
            var below = state.zones.length - 1 - i;
            count.innerHTML = '';
            if (z.items.length > 1) count.appendChild(U.el('span', '', (z.index + 1) + ' / ' + z.items.length));
            if (below > 1 && !state.reorder) count.appendChild(U.el('span', 'below', t('rowsBelow', { n: below })));
        });
    }

    function scrollRows(instant) {
        var rowsEl = $('rows');
        var current = state.zones[state.zone];
        var offset = 0;
        if (current.section) {
            var first = state.zones[1].section;
            offset = current.section.offsetTop - first.offsetTop;
        }
        if (instant) rowsEl.style.transition = 'none';
        rowsEl.style.transform = 'translateY(' + (-offset) + 'px)';
        if (instant) { void rowsEl.offsetHeight; rowsEl.style.transition = ''; }
        state.zones.forEach(function(z, i) {
            if (z.section) z.section.classList.toggle('above', i > 0 && i < state.zone);
        });
    }

    function scrollTrack(z, instant) {
        var el = z.items[z.index];
        var margin = 96;
        var visible = 1920 - margin * 2;
        var x = z.scroll || 0;
        var left = el.offsetLeft - margin;
        var right = left + el.offsetWidth;
        if (left < x) x = left;
        else if (right > x + visible) x = right - visible;
        var max = Math.max(0, z.track.scrollWidth - margin - visible - margin);
        x = Math.max(0, Math.min(x, max + 26));
        z.scroll = x;
        z.track.parentNode.classList.toggle('more-left', x > 0);
        z.track.parentNode.classList.toggle('more-right', x < max);
        if (instant) z.track.style.transition = 'none';
        z.track.style.transform = 'translateX(' + (-x) + 'px)';
        if (instant) { void z.track.offsetHeight; z.track.style.transition = ''; }
    }

    function moveMain(dir) {
        var z = state.zones[state.zone];
        if (dir === 'left' || dir === 'right') {
            var step = dir === 'left' ? -1 : 1;
            if (state.reorder && state.reorder.moving && z.key === 'apps') { moveTile(step); return; }
            var next = z.index + step;
            if (next < 0 || next >= z.items.length) return;
            z.index = next;
            focusZone(state.zone);
        } else {
            if (state.reorder) return;
            var target = state.zone + (dir === 'up' ? -1 : 1);
            if (target < 0 || target >= state.zones.length) return;
            if (target === 0 || state.zone === 0) {
                // Moving between the top bar and the rows: keep the geometrically closest item.
                var from = focusedElement();
                var to = state.zones[target];
                var picked = Nav.pick(from, to.items, dir);
                if (picked) to.index = to.items.indexOf(picked);
            }
            focusZone(target);
        }
    }

    // ---------- Reorder ----------

    function startReorder() {
        closeSheet(false);
        state.reorder = { list: state.settings.favorites.slice(), moving: null };
        $('hintBar').textContent = t('reorderHint');
        $('hintBar').hidden = false;
        state.zone = 1;
        renderRows();
    }

    function toggleMoving(id) {
        state.reorder.moving = state.reorder.moving === id ? null : id;
        renderRows();
    }

    function moveTile(step) {
        var list = state.reorder.list;
        var i = list.indexOf(state.reorder.moving);
        var j = i + step;
        if (i < 0 || j < 0 || j >= list.length) return;
        list.splice(i, 1);
        list.splice(j, 0, state.reorder.moving);
        state.zones[1].index = j;
        zoneMemory.apps = j;
        renderRows();
    }

    function finishReorder() {
        state.settings.favorites = state.reorder.list.slice();
        U.store.set('settings', state.settings);
        state.reorder = null;
        $('hintBar').hidden = true;
        renderRows();
        toast(t('reorderSaved'));
    }

    // ---------- Sheets ----------

    var sheetItems = [];
    var sheetFocus = null;
    var draft = null;

    function openSheet(id, layer) {
        state.layer = layer;
        $(id).classList.add('open');
        sheetItems = U.toArray($(id).querySelectorAll('.focusable'));
        focusSheet(sheetItems[0]);
    }

    function closeSheet(restoreFocus) {
        $('settingsSheet').classList.remove('open');
        $('weatherSheet').classList.remove('open');
        $('allApps').classList.remove('open');
        $('search').classList.remove('open');
        $('detail').classList.remove('open');
        $('kids').classList.remove('open');
        $('episodes').classList.remove('open');
        $('channels').classList.remove('open');
        kidsToken++;
        explore.token++;
        if (sheetFocus) sheetFocus.blur();
        sheetFocus = null;
        state.layer = 'main';
        if (libraryDirty) { libraryDirty = false; renderRows(); }
        if (restoreFocus !== false) focusZone(state.zone);
    }

    function focusSheet(el) {
        if (!el) return;
        // Clear stale focus in the whole overlay, including items that are hidden right now.
        var overlay = el.closest('.sheet, .all-apps, .detail') || document.body;
        U.toArray(overlay.querySelectorAll('.focused')).forEach(function(i) { i.classList.remove('focused'); });
        if (sheetFocus && sheetFocus.tagName === 'INPUT' && sheetFocus !== el) sheetFocus.blur();
        sheetFocus = el;
        el.classList.add('focused');
        var scroller = el.closest('.sheet-scroll');
        var top = el.offsetTop - scroller.offsetTop;
        if (top - 120 < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - 120);
        else if (top + el.offsetHeight + 120 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + el.offsetHeight + 120 - scroller.clientHeight;
        scroller.parentNode.classList.toggle('has-more', scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 8);
        if (state.layer === 'search') updateExploreDetail(el);
        updateLegend();
        $('searchBox') && $('searchBox').classList.toggle('focused', el === $('searchInput'));
    }

    function option(label, opts) {
        opts = opts || {};
        var b = U.el('button', 'option focusable' + (opts.selected ? ' selected' : ''));
        if (opts.image) {
            var img = U.el('img');
            img.src = opts.image;
            img.alt = '';
            if (opts.swatch) img.style.background = opts.swatch;
            img.onerror = function() { img.style.visibility = 'hidden'; };
            b.appendChild(img);
        } else if (opts.swatch) {
            var sw = U.el('span', 'swatch', opts.swatchText || '');
            sw.style.background = opts.swatch;
            b.appendChild(sw);
        }
        b.appendChild(U.el('span', 'label', label));
        if (opts.value != null) b.appendChild(U.el('span', 'value', opts.value));
        if (opts.check) b.appendChild(U.el('span', 'check'));
        b._activate = opts.onClick;
        return b;
    }

    function field(value, placeholder, onInput, secret) {
        var input = U.el('input', 'field focusable');
        input.type = secret ? 'password' : 'text';
        input.value = value || '';
        input.placeholder = placeholder;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        input.addEventListener('input', function() { onInput(input.value.trim()); });
        input._activate = function() { input.focus(); };
        return input;
    }

    function cycleOption(key, label, values, current, format) {
        var b = option(label, { value: format(current), onClick: function() {
            var i = values.indexOf(draft[key]);
            draft[key] = values[(i + 1) % values.length];
            rerenderSettingsKeepingFocus();
        } });
        b._key = 'cycle:' + key;
        return b;
    }

    function loadRegionProviders() {
        if (state.regionProvidersLoading || !draft.tmdbKey) return;
        state.regionProvidersLoading = true;
        Media.regionProviders(draft.tmdbKey).then(function(list) {
            state.regionProviders = list;
        }).catch(function() {
            state.regionProviders = [];
        }).then(function() {
            state.regionProvidersLoading = false;
            if (state.layer === 'settings') rerenderSettingsKeepingFocus();
        });
    }

    function openSettings() {
        if (state.reorder) return;
        draft = JSON.parse(JSON.stringify(state.settings));
        renderSettings();
        openSheet('settingsSheet', 'settings');
    }

    function renderSettings(focusLabel) {
        var body = $('settingsBody');
        body.innerHTML = '';
        body.appendChild(U.el('h2', '', t('settings')));
        body.appendChild(U.el('p', 'sheet-lead', t('settingsLead')));

        body.appendChild(U.el('h3', '', t('homeApps')));
        var grid = U.el('div', 'option-grid two');
        var favs = state.settings.favorites;
        function rank(a) {
            var f = favs.indexOf(a.id);
            return f !== -1 ? f : 100 + (a.system ? 200 : 0) + (a.hdmi ? 100 : 0);
        }
        var apps = state.apps.slice().sort(function(a, b) { return rank(a) - rank(b); });
        apps.forEach(function(app) {
            var selected = draft.favorites.indexOf(app.id) !== -1;
            var device = app.hdmi ? deviceFor(app) : null;
            var opts = {
                selected: selected,
                check: true,
                onClick: function() {
                    var i = draft.favorites.indexOf(app.id);
                    if (i !== -1) { if (draft.favorites.length > 1) draft.favorites.splice(i, 1); }
                    else if (draft.favorites.length < CATALOG.MAX_FAVORITES) draft.favorites.push(app.id);
                    else toast(t('maxApps', { n: CATALOG.MAX_FAVORITES }));
                    rerenderSettingsKeepingFocus();
                }
            };
            if (app.logo) { opts.image = 'assets/brands/' + app.logo + '.svg'; opts.swatch = app.bg; }
            else if (device && device.logo) { opts.image = 'assets/brands/' + device.logo + '.svg'; opts.swatch = device.bg; }
            else if (app.icon) opts.image = app.icon;
            else { opts.swatch = device ? device.bg : tileColor(app.color); opts.swatchText = app.hdmi ? 'HDMI' : app.title.slice(0, 2); }
            var b = option(displayTitle(app), opts);
            b._key = 'app:' + app.id;
            grid.appendChild(b);
        });
        body.appendChild(grid);
        body.appendChild(U.el('p', 'note', t('homeAppsNote', { n: CATALOG.MAX_FAVORITES })));
        var tools = U.el('div', 'option-grid two');
        tools.style.marginTop = '14px';
        var reorder = option(t('reorder'), { onClick: function() { applyDraft(); startReorder(); } });
        reorder._key = 'reorder';
        tools.appendChild(reorder);
        if (TV.available) {
            var paired = TV.ssap.isPaired();
            var pair = option(t('connectTv'), { value: paired ? t('connected') : '', onClick: function() {
                pairTv().then(function() { rerenderSettingsKeepingFocus(); });
            } });
            pair._key = 'pair';
            tools.appendChild(pair);
        }
        body.appendChild(tools);
        if (TV.available && !TV.ssap.isPaired()) body.appendChild(U.el('p', 'note', t('connectTvNote')));

        var hdmis = state.apps.filter(function(a) { return a.hdmi; });
        if (hdmis.length) {
            body.appendChild(U.el('h3', '', t('hdmi')));
            var hgrid = U.el('div', 'option-grid two');
            hdmis.forEach(function(app) {
                var key = draft.devices[app.id] || '';
                var device = U.find(CATALOG.DEVICES, function(d) { return d.key === key; }) || CATALOG.DEVICES[0];
                var b = option(app.title, { value: device.title || t('input'), swatch: device.bg, swatchText: '', onClick: function() {
                    var i = CATALOG.DEVICES.indexOf(device);
                    draft.devices[app.id] = CATALOG.DEVICES[(i + 1) % CATALOG.DEVICES.length].key;
                    rerenderSettingsKeepingFocus();
                } });
                b._key = 'hdmi:' + app.id;
                hgrid.appendChild(b);
            });
            body.appendChild(hgrid);
            body.appendChild(U.el('p', 'note', t('hdmiNote')));
        }

        // Streaming
        body.appendChild(U.el('h3', '', t('streaming')));
        var tmdb = field(draft.tmdbKey, t('tmdbPlaceholder'), function(v) { draft.tmdbKey = v; }, true);
        tmdb._key = 'tmdb';
        body.appendChild(tmdb);
        body.appendChild(U.el('p', 'note', t('tmdbNote')));
        var streamGrid = U.el('div', 'option-grid one');
        streamGrid.style.marginTop = '14px';
        streamGrid.appendChild(cycleOption('region', t('region'), REGIONS, draft.region, function(v) {
            return v === 'auto' ? t('regionAuto') + (I18N.region && draft.region === 'auto' ? ' (' + I18N.region + ')' : '') : v;
        }));
        body.appendChild(streamGrid);

        if (draft.tmdbKey) {
            body.appendChild(U.el('h3', '', t('hiddenProviders')));
            if (state.regionProviders === null) {
                body.appendChild(U.el('p', 'note', t('loading')));
                loadRegionProviders();
            } else {
                var pgrid = U.el('div', 'option-grid two');
                var list = state.regionProviders.slice();
                draft.hiddenProviders.forEach(function(h) {
                    if (!U.find(list, function(p) { return p.id === h.id; })) list.push(h);
                });
                list.forEach(function(p) {
                    var isHidden = !!U.find(draft.hiddenProviders, function(h) { return h.id === p.id; });
                    var b = option(p.name, { image: p.logo, check: true, selected: !isHidden, onClick: function() {
                        if (isHidden) draft.hiddenProviders = draft.hiddenProviders.filter(function(h) { return h.id !== p.id; });
                        else draft.hiddenProviders.push({ id: p.id, name: p.name, logo: p.logo });
                        rerenderSettingsKeepingFocus();
                    } });
                    b._key = 'provider:' + p.id;
                    pgrid.appendChild(b);
                });
                body.appendChild(pgrid);
                body.appendChild(U.el('p', 'note', t('hiddenProvidersNote')));
            }
        }

        // Ratings
        body.appendChild(U.el('h3', '', t('ratings')));
        var ratingGrid = U.el('div', 'option-grid one');
        ratingGrid.appendChild(cycleOption('minRating', t('minRating'), [0, 6, 6.5, 7, 7.5, 8], draft.minRating, function(v) {
            return v ? v + '+' : t('anyRating');
        }));
        body.appendChild(ratingGrid);
        var omdb = field(draft.omdbKey, t('omdbPlaceholder'), function(v) { draft.omdbKey = v; }, true);
        omdb.style.marginTop = '12px';
        omdb._key = 'omdb';
        body.appendChild(omdb);
        body.appendChild(U.el('p', 'note', t('omdbNote')));

        // Rows
        body.appendChild(U.el('h3', '', t('rowsSection')));
        var rowsGrid = U.el('div', 'option-grid two');
        [['continue', t('continueRow')], ['live', t('liveTv')], ['weekend', t('weekend')], ['watchlist', t('watchlist')], ['forYou', t('forYou')], ['watched', t('watchedRow')], ['releases', t('releases')], ['shows', t('shows')], ['anime', t('anime')], ['kids', t('kids')],
            ['categories', t('categories')], ['today', t('releasesToday')], ['news', t('news')]].forEach(function(r) {
            var b = option(r[1], { check: true, selected: draft.rows[r[0]], onClick: function() {
                draft.rows[r[0]] = !draft.rows[r[0]];
                rerenderSettingsKeepingFocus();
            } });
            b._key = 'row:' + r[0];
            rowsGrid.appendChild(b);
        });
        body.appendChild(rowsGrid);
        var hideW = option(t('hideWatched'), { check: true, selected: draft.hideWatched, onClick: function() {
            draft.hideWatched = !draft.hideWatched;
            rerenderSettingsKeepingFocus();
        } });
        hideW._key = 'hideWatched';
        hideW.style.marginTop = '12px';
        body.appendChild(hideW);

        // IPTV
        body.appendChild(U.el('h3', '', t('iptv')));
        var iptvToggle = option(t('iptvEnable'), { check: true, selected: draft.iptvEnabled, onClick: function() {
            draft.iptvEnabled = !draft.iptvEnabled;
            rerenderSettingsKeepingFocus();
        } });
        iptvToggle._key = 'iptvEnabled';
        body.appendChild(iptvToggle);
        if (draft.iptvEnabled) {
            var iptvGrid = U.el('div', 'option-grid one');
            iptvGrid.style.marginTop = '12px';
            iptvGrid.appendChild(cycleOption('iptvSource', t('iptvSource'), ['m3u', 'xtream'], draft.iptvSource, function(v) {
                return v === 'xtream' ? t('iptvXtream') : t('iptvM3u');
            }));
            body.appendChild(iptvGrid);
            var fields = draft.iptvSource === 'xtream'
                ? [['iptvServer', t('iptvServerPh'), false], ['iptvUser', t('iptvUserPh'), false], ['iptvPass', t('iptvPassPh'), true]]
                : [['iptvUrl', t('iptvUrlPh'), false]];
            fields.forEach(function(f) {
                var input = field(draft[f[0]], f[1], function(v) { draft[f[0]] = v; }, f[2]);
                input.style.marginTop = '12px';
                input._key = f[0];
                body.appendChild(input);
            });
            var reload = option(t('iptvReload'), { value: state.iptvStatus || '', onClick: function() {
                applyDraft();
                loadIptv();
                rerenderSettingsKeepingFocus();
            } });
            reload._key = 'iptvReload';
            reload.style.marginTop = '12px';
            body.appendChild(reload);
        }
        body.appendChild(U.el('p', 'note', t('iptvNote')));

        // Kids
        body.appendChild(U.el('h3', '', t('kidsAreaToggle')));
        var kidsToggle = option(t('kidsAreaToggle'), { check: true, selected: draft.kidsArea, onClick: function() {
            draft.kidsArea = !draft.kidsArea;
            rerenderSettingsKeepingFocus();
        } });
        kidsToggle._key = 'kidsArea';
        body.appendChild(kidsToggle);
        body.appendChild(U.el('p', 'note', t('kidsAreaNote')));

        // News
        body.appendChild(U.el('h3', '', t('newsSection')));
        var feeds = [{ id: 'auto', name: t('newsAuto') }].concat(CATALOG.NEWS_FEEDS).concat([{ id: 'custom', name: t('newsCustom') }]);
        var currentFeed = U.find(feeds, function(f) { return f.id === draft.newsFeed; }) || feeds[0];
        var feed = option(t('newsSource'), { value: currentFeed.name, onClick: function() {
            draft.newsFeed = feeds[(feeds.indexOf(currentFeed) + 1) % feeds.length].id;
            rerenderSettingsKeepingFocus();
        } });
        feed._key = 'feed';
        body.appendChild(feed);
        if (draft.newsFeed === 'custom') {
            var rss = field(draft.newsUrl, t('rssPlaceholder'), function(v) { draft.newsUrl = v; });
            rss.style.marginTop = '12px';
            rss._key = 'rss';
            body.appendChild(rss);
        }

        // Weather
        body.appendChild(U.el('h3', '', t('weatherSection')));
        var city = field(draft.city, t('cityPlaceholder'), function(v) { draft.city = v; });
        city._key = 'city';
        body.appendChild(city);
        var weatherGrid = U.el('div', 'option-grid one');
        weatherGrid.style.marginTop = '12px';
        weatherGrid.appendChild(cycleOption('tempUnit', t('tempUnit'), ['c', 'f'], draft.tempUnit, function(v) { return v === 'c' ? '°C' : '°F'; }));
        body.appendChild(weatherGrid);

        // Display
        body.appendChild(U.el('h3', '', t('display')));
        var displayGrid = U.el('div', 'option-grid one');
        var themes = { auto: t('themeAuto'), night: t('themeNight'), oled: t('themeOled') };
        displayGrid.appendChild(cycleOption('theme', t('theme'), ['auto', 'night', 'oled'], draft.theme, function(v) { return themes[v]; }));
        var clocks = { auto: t('clockAuto'), '24': t('clock24'), '12': t('clock12') };
        displayGrid.appendChild(cycleOption('clock', t('clockFormat'), ['auto', '24', '12'], draft.clock, function(v) { return clocks[v]; }));
        displayGrid.appendChild(cycleOption('language', t('language'), ['auto'].concat(I18N.languages), draft.language, function(v) {
            return { auto: t('langAuto'), pt: 'Português', en: 'English', es: 'Español' }[v];
        }));
        displayGrid.appendChild(cycleOption('screensaver', t('screensaver'), [0, 2, 5, 10, 30], draft.screensaver, function(v) {
            return v ? t('minutes', { n: v }) : t('off');
        }));
        var fps = option(t('showFps'), { check: true, selected: draft.showFps, onClick: function() {
            draft.showFps = !draft.showFps;
            rerenderSettingsKeepingFocus();
        } });
        fps._key = 'fps';
        displayGrid.appendChild(fps);
        body.appendChild(displayGrid);

        var actions = U.el('div', 'sheet-actions sticky');
        var save = U.el('button', 'button primary focusable', t('save'));
        save._activate = function() { applyDraft(); closeSheet(); toast(t('saved')); };
        save._key = 'save';
        var cancel = U.el('button', 'button focusable', t('cancel'));
        cancel._activate = function() { closeSheet(); };
        var reset = U.el('button', 'button focusable', t('reset'));
        reset._activate = function() {
            var keep = { tmdbKey: draft.tmdbKey };
            draft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            draft.tmdbKey = keep.tmdbKey;
            rerenderSettingsKeepingFocus();
        };
        reset._key = 'reset';
        actions.appendChild(save);
        actions.appendChild(cancel);
        actions.appendChild(reset);
        body.appendChild(actions);

        sheetItems = U.toArray(body.querySelectorAll('.focusable'));
        if (focusLabel) {
            var again = U.find(sheetItems, function(i) { return i._key === focusLabel; });
            focusSheet(again || sheetItems[0]);
        }
    }

    function rerenderSettingsKeepingFocus() {
        var scroller = $('settingsBody');
        var scroll = scroller.scrollTop;
        renderSettings(sheetFocus && sheetFocus._key);
        scroller.scrollTop = scroll;
        if (sheetFocus) focusSheet(sheetFocus);
    }

    function applyDraft() {
        var prev = state.settings;
        state.settings = draft;
        draft = JSON.parse(JSON.stringify(state.settings));
        U.store.set('settings', state.settings);
        if (prev.language !== state.settings.language || prev.region !== state.settings.region) {
            location.reload();
            return;
        }
        applyTheme();
        lastMinute = -1;
        tick();
        updateFps();
        if (prev.city !== state.settings.city || prev.tempUnit !== state.settings.tempUnit) loadWeather();
        if (['iptvEnabled', 'iptvSource', 'iptvUrl', 'iptvServer', 'iptvUser', 'iptvPass'].some(function(k) { return prev[k] !== state.settings[k]; })) loadIptv();
        Media.config.minRating = state.settings.minRating;
        if (prev.tmdbKey !== state.settings.tmdbKey || prev.minRating !== state.settings.minRating || prev.omdbKey !== state.settings.omdbKey) { rowData.releases = null; rowData.shows = null; state.featured = []; loadMedia(); }
        if (prev.newsFeed !== state.settings.newsFeed || prev.newsUrl !== state.settings.newsUrl) { rowData.news = null; loadNews(); }
        renderRows();
    }

    function renderWeatherSheet() {
        var body = $('weatherBody');
        var w = state.weather;
        body.innerHTML = '';
        body.appendChild(U.el('h2', '', w && w.city ? w.city : t('weatherTitle')));
        if (!w) {
            body.appendChild(U.el('p', 'sheet-lead', t('weatherSet')));
        } else {
            var now = U.el('div', 'weather-now');
            now.innerHTML = Weather.icon(w.code, w.isDay);
            var col = U.el('div');
            col.appendChild(U.el('div', 'weather-now-temp', w.temp + '°'));
            col.appendChild(U.el('div', 'weather-now-text', Weather.condition(w.code) + ' · ' + t('feelsLike', { t: w.feels })));
            now.appendChild(col);
            body.appendChild(now);

            body.appendChild(U.el('h3', '', t('nextHours')));
            var hours = U.el('div', 'weather-hours');
            w.hourly.forEach(function(h) {
                var cell = U.el('div', 'weather-cell');
                cell.appendChild(U.el('div', 't', h.hour));
                cell.insertAdjacentHTML('beforeend', Weather.icon(h.code, h.isDay));
                cell.appendChild(U.el('div', 'v', h.temp + '°'));
                hours.appendChild(cell);
            });
            body.appendChild(hours);

            body.appendChild(U.el('h3', '', t('nextDays')));
            var days = U.el('div', 'weather-days');
            w.daily.forEach(function(d, i) {
                var row = U.el('div', 'weather-day');
                row.appendChild(U.el('span', 'd', i === 0 ? t('today') : capitalize(d.date.toLocaleDateString(I18N.tag, { weekday: 'long' }))));
                row.insertAdjacentHTML('beforeend', Weather.icon(d.code, true));
                row.appendChild(U.el('span', 'c', Weather.condition(d.code)));
                var r = U.el('span', 'r', d.max + '°');
                r.appendChild(U.el('span', '', d.min + '°'));
                row.appendChild(r);
                days.appendChild(row);
            });
            body.appendChild(days);

            body.appendChild(U.el('h3', '', t('sunrise') + ' · ' + t('sunset')));
            var sun = U.el('div', 'sun-times');
            [[t('sunrise'), w.sunrise], [t('sunset'), w.sunset]].forEach(function(p) {
                var c = U.el('div');
                c.appendChild(U.el('div', 't', p[0]));
                c.appendChild(U.el('div', 'v', p[1]));
                sun.appendChild(c);
            });
            body.appendChild(sun);
        }
        var close = U.el('button', 'button focusable', '✕');
        close.style.marginTop = '40px';
        close._activate = function() { closeSheet(); };
        body.appendChild(close);
    }

    function openWeather() {
        renderWeatherSheet();
        openSheet('weatherSheet', 'weather');
        loadWeather();
    }

    // ---------- FPS meter ----------

    var fpsRunning = false;
    function updateFps() {
        var badge = $('fpsBadge');
        if (!state.settings.showFps) { fpsRunning = false; if (badge) badge.parentNode.removeChild(badge); return; }
        if (!badge) {
            badge = U.el('div', 'fps-badge');
            badge.id = 'fpsBadge';
            document.body.appendChild(badge);
        }
        if (fpsRunning) return;
        fpsRunning = true;
        var frames = 0, since = performance.now();
        (function loop(now) {
            if (!fpsRunning) return;
            frames++;
            if (now - since >= 1000) {
                var fps = Math.round(frames * 1000 / (now - since));
                badge.textContent = fps + ' FPS';
                badge.className = 'fps-badge' + (fps < 40 ? ' low' : fps < 55 ? ' mid' : '');
                frames = 0;
                since = now;
            }
            requestAnimationFrame(loop);
        })(since);
    }

    // ---------- Screensaver ----------

    var saverOn = false;
    var saverTimer = null;
    function enterSaver() {
        saverOn = true;
        $('screensaver').classList.add('active');
        shiftSaver();
        saverTimer = setInterval(shiftSaver, 30000);
    }
    function exitSaver() {
        saverOn = false;
        $('screensaver').classList.remove('active');
        clearInterval(saverTimer);
    }
    function shiftSaver() {
        var x = Math.round((Math.random() - 0.5) * 560);
        var y = Math.round((Math.random() - 0.5) * 340);
        $('screensaverContent').style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }
    function activity() {
        state.lastActivity = Date.now();
        if (saverOn) { exitSaver(); return true; }
        return false;
    }

    // ---------- Input ----------

    document.addEventListener('keydown', function(e) {
        if (state.layer === 'player') { playerKey(e); e.preventDefault(); return; }
        if (activity()) { e.preventDefault(); return; }
        if (e.keyCode === KEYS.GREEN && state.layer === 'episodes') {
            if (sheetFocus && sheetFocus._toggle) sheetFocus._toggle();
            e.preventDefault();
            return;
        }
        if (e.keyCode === KEYS.GREEN || e.keyCode === KEYS.YELLOW) {
            var target = libraryTarget();
            if (target) toggleLibrary(e.keyCode === KEYS.GREEN ? 'watched' : 'watchlist', target);
            e.preventDefault();
            return;
        }
        var dir = Nav.direction(e);
        var back = Nav.isBack(e);
        var enter = e.keyCode === 13;

        if (state.layer !== 'main') {
            var typing = sheetFocus && sheetFocus.tagName === 'INPUT' && document.activeElement === sheetFocus;
            if (back) {
                if (typing) { sheetFocus.blur(); e.preventDefault(); return; }
                if (state.layer === 'detail') { closeDetail(); e.preventDefault(); return; }
                if (state.layer === 'episodes') { closeEpisodes(); e.preventDefault(); return; }
                if (state.layer === 'settings') {
                    // Back keeps the changes, like the TV's own settings; Cancel discards them.
                    if (JSON.stringify(draft) !== JSON.stringify(state.settings)) { applyDraft(); toast(t('saved')); }
                    closeSheet();
                    e.preventDefault();
                    return;
                }
                if (state.layer === 'channels' && lib.series) { lib.series = null; renderLibrary(); focusSheet(sheetItems[0]); e.preventDefault(); return; }
                closeSheet();
                e.preventDefault();
                return;
            }
            if (dir) {
                if (typing && (dir === 'left' || dir === 'right')) return;
                if (!sheetFocus) { if (sheetItems.length) focusSheet(sheetItems[0]); e.preventDefault(); return; }
                // The sticky Save/Cancel bar sits right under the visible area; reach it only
                // after the last option, otherwise Down would always jump to it.
                var flow = sheetItems.filter(function(i) { return !i.closest('.sticky'); });
                var next = Nav.pick(sheetFocus, flow, dir) || Nav.pick(sheetFocus, sheetItems, dir);
                if (next) focusSheet(next);
                e.preventDefault();
            } else if (enter && sheetFocus) {
                if (typing) { sheetFocus.blur(); }
                else if (sheetFocus._activate) sheetFocus._activate();
                e.preventDefault();
            }
            return;
        }

        if (state.reorder && back) { finishReorder(); e.preventDefault(); return; }
        if (back) {
            // With disableBackHistoryAPI the app owns Back; on the home screen hand it to the system.
            e.preventDefault();
            if (window.webOS && typeof webOS.platformBack === 'function') webOS.platformBack();
            return;
        }
        if (dir) { moveMain(dir); e.preventDefault(); }
        else if (enter) {
            var el = focusedElement();
            if (el && el._activate) el._activate();
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', function() { activity(); });
    document.addEventListener('mouseover', function(e) {
        var el = e.target.closest && e.target.closest('.focusable');
        if (!el) return;
        if (state.layer !== 'main') {
            if (sheetItems.indexOf(el) !== -1) focusSheet(el);
            return;
        }
        for (var i = 0; i < state.zones.length; i++) {
            var idx = state.zones[i].items.indexOf(el);
            if (idx !== -1) {
                if (i === state.zone && idx === state.zones[i].index) return;
                state.zones[i].index = idx;
                focusZone(i);
                return;
            }
        }
    });
    document.addEventListener('click', function(e) {
        if (activity()) return;
        var el = e.target.closest && e.target.closest('.focusable');
        if (el && el._activate && el.tagName !== 'INPUT') el._activate();
    });
    document.addEventListener('wheel', function(e) {
        if (state.layer !== 'main' || state.reorder) return;
        moveMain(e.deltaY > 0 ? 'down' : 'up');
    });

    $('weatherChip')._activate = openWeather;
    $('settingsButton')._activate = openSettings;
    $('searchButton')._activate = function() { openExplore(); };
    $('searchButton').setAttribute('aria-label', t('search'));
    $('searchLabel').textContent = t('search');
    $('kidsButton')._activate = openKids;
    $('iptvButton')._activate = function() { openChannels(Iptv.live().length ? 'live' : Iptv.vod().length ? 'movie' : 'series'); };
    $('iptvLabel').textContent = t('iptvLibrary');
    $('kidsLabel').textContent = t('kidsArea');
    $('legendWatched').textContent = t('keyWatched');
    $('legendList').textContent = t('keyList');
    $('playerHint').textContent = t('playerHint');
    $('settingsButton').setAttribute('aria-label', t('settings'));

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) { lastMinute = -1; tick(); state.lastActivity = Date.now(); }
    });

    setInterval(function() {
        tick();
        var idle = state.settings.screensaver * 60000;
        if (idle && !saverOn && state.layer === 'main' && !$('playerVideo').src && !state.reorder && Date.now() - state.lastActivity > idle) enterSaver();
    }, 1000);

    // ---------- Data loading ----------

    // Each loader bumps a generation counter; answers from an older generation are dropped,
    // so a slow response for an old key, city or feed never overwrites newer data.
    var gen = { media: 0, news: 0, weather: 0, cont: 0 };
    function fresh(name, g) { return gen[name] === g; }

    function loadMedia() {
        var key = state.settings.tmdbKey;
        var g = ++gen.media;
        function set(name, fallback) {
            return function(items) {
                if (!fresh('media', g)) return;
                rowData[name] = items === undefined ? (rowData[name] || fallback) : items;
                renderRows();
            };
        }
        function keep(name) { return function() { if (fresh('media', g)) set(name, [])(undefined); }; }
        Media.todayStreaming().then(set('today')).catch(keep('today'));
        if (!key) { startFeatured(); return; }
        Media.thisWeek(key).then(function(items) {
            if (!fresh('media', g)) return;
            var picks = items.filter(function(i) { return i.backdrop; }).slice(0, 8);
            if (picks.length >= 3) { state.featured = picks; state.featuredIndex = 0; if (state.zone <= 1) startFeatured(); }
            set('weekend')(items);
        }).catch(keep('weekend'));
        Media.featured(key).then(function(items) {
            if (!fresh('media', g)) return;
            if (rowData.weekend && rowData.weekend.filter(function(i) { return i.backdrop; }).length >= 3) return;
            state.featured = items;
            state.featuredIndex = 0;
            if (state.zone <= 1) startFeatured();
        }).catch(function() {});
        Media.releases(key).then(set('releases')).catch(keep('releases'));
        Media.trendingShows(key).then(set('shows')).catch(keep('shows'));
        loadRecommendations();
        loadContinue();
        ['anime', 'kids'].forEach(function(name) {
            var cat = U.find(CATALOG.CATEGORIES, function(c) { return c.key === name; });
            Media.category(key, cat, 1).then(set(name)).catch(keep(name));
        });
    }
    function loadRecommendations() {
        var key = state.settings.tmdbKey;
        if (!key) return;
        var seeds = libraryItems('watched').filter(function(i) { return i.source === 'tmdb'; })
            .concat(U.store.get('history', []));
        Media.recommendations(key, seeds).then(function(res) {
            rowData.forYou = res;
            renderRows();
        }).catch(function() {});
    }

    function loadNews() {
        var g = ++gen.news;
        News.load(state.settings).then(function(items) { if (fresh('news', g)) { rowData.news = items; renderRows(); } })
            .catch(function() { if (fresh('news', g)) { rowData.news = rowData.news || []; renderRows(); } });
    }

    // ---------- Boot ----------

    Media.config.minRating = state.settings.minRating;
    var cached = U.store.get('apps_cache', null);
    state.apps = buildApps(cached && cached.apps, cached && cached.inputs);
    tick();
    applyTheme();
    updateFps();
    renderRows();
    showHero(greetingHero());
    loadWeather();
    loadIptv();
    loadMedia();
    loadNews();
    refreshApps();

    setInterval(loadWeather, 30 * 60 * 1000);
    if (TV.available) {
        TV.renewDevMode();
        setInterval(TV.renewDevMode, 6 * 3600 * 1000);
    }
    setInterval(function() { loadMedia(); loadNews(); }, 60 * 60 * 1000);
})();
