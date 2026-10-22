// webOS integration: Luna service calls and the local SSAP API (the LG remote protocol on port 3000).
var TV = (function() {
    var hasLuna = !!(window.webOS && webOS.service && typeof webOS.service.request === 'function');

    function luna(uri, method, parameters) {
        return new Promise(function(resolve, reject) {
            if (!hasLuna) { reject({ errorText: 'preview' }); return; }
            try {
                webOS.service.request(uri, {
                    method: method,
                    parameters: parameters || {},
                    onSuccess: function(res) {
                        if (res && res.returnValue === false) reject(res);
                        else resolve(res);
                    },
                    onFailure: reject
                });
            } catch (e) { reject({ errorText: e.message }); }
        });
    }

    function launch(id, params) {
        var payload = { id: id };
        if (params) payload.params = params;
        return luna('luna://com.webos.applicationManager', 'launch', payload).catch(function(err) {
            if (/not exist/i.test(err && err.errorText || '')) throw { notInstalled: true };
            if (!ssap.isPaired()) throw err;
            return ssap.request('ssap://system.launcher/launch', payload);
        });
    }

    // SSAP needs a one-time pairing accepted on the TV; the client key is kept in localStorage.
    var ssap = (function() {
        var SSAP_URL = 'ws://127.0.0.1:3000/';
        var MANIFEST = {
            manifestVersion: 1,
            appVersion: '1.0',
            appId: 'io.github.jholhewres.mytvlg',
            vendorId: 'mytvlg',
            localizedAppNames: { '': 'MyTVLG' },
            permissions: ['LAUNCH', 'READ_INSTALLED_APPS', 'READ_RUNNING_APPS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST']
        };
        var socket = null;
        var ready = null;
        var seq = 0;
        var pending = {};

        function isPaired() { return !!U.store.get('ssap_key', ''); }

        function connect(allowPrompt) {
            if (ready) return ready;
            var key = U.store.get('ssap_key', '');
            if (!key && !allowPrompt) return Promise.reject(new Error('unpaired'));
            if (typeof WebSocket !== 'function' || !hasLuna) return Promise.reject(new Error('unavailable'));

            ready = new Promise(function(resolve, reject) {
                var timer = setTimeout(function() { fail(new Error('timeout')); }, allowPrompt ? 90000 : 8000);
                function fail(err) {
                    clearTimeout(timer);
                    ready = null;
                    if (socket) { try { socket.close(); } catch (e) {} }
                    socket = null;
                    reject(err);
                }
                try { socket = new WebSocket(SSAP_URL); } catch (e) { fail(e); return; }
                socket.onopen = function() {
                    var payload = { pairingType: 'PROMPT', manifest: MANIFEST };
                    if (key) payload['client-key'] = key;
                    socket.send(JSON.stringify({ type: 'register', id: 'register', payload: payload }));
                };
                socket.onmessage = function(event) {
                    var msg;
                    try { msg = JSON.parse(event.data); } catch (e) { return; }
                    if (msg.type === 'registered') {
                        clearTimeout(timer);
                        U.store.set('ssap_key', msg.payload['client-key']);
                        resolve();
                    } else if (msg.id === 'register' && msg.type === 'error') {
                        fail(new Error(msg.error || 'denied'));
                    } else if (pending[msg.id]) {
                        var p = pending[msg.id];
                        delete pending[msg.id];
                        if (msg.type === 'error' || (msg.payload && msg.payload.returnValue === false)) p.reject(msg);
                        else p.resolve(msg.payload);
                    }
                };
                socket.onerror = function() { fail(new Error('socket')); };
                socket.onclose = function() { ready = null; socket = null; };
            });
            return ready;
        }

        function request(uri, payload) {
            return connect(false).then(function() {
                return new Promise(function(resolve, reject) {
                    var id = 'r' + (++seq);
                    pending[id] = { resolve: resolve, reject: reject };
                    socket.send(JSON.stringify({ type: 'request', id: id, uri: uri, payload: payload || {} }));
                    setTimeout(function() {
                        if (pending[id]) { delete pending[id]; reject(new Error('timeout')); }
                    }, 8000);
                });
            });
        }

        return { connect: connect, request: request, isPaired: isPaired };
    })();

    function listApps() {
        return ssap.request('ssap://com.webos.applicationManager/listLaunchPoints').then(function(res) {
            return (res.launchPoints || []).map(function(lp) {
                return {
                    id: lp.id,
                    title: lp.title,
                    icon: lp.largeIcon || lp.icon || '',
                    color: lp.bgColor || lp.iconColor || '',
                    system: !!lp.systemApp
                };
            });
        });
    }

    function listInputs() {
        return ssap.request('ssap://tv/getExternalInputList').then(function(res) {
            return (res.devices || []).map(function(d) {
                return { id: d.appId, title: d.label || d.id, connected: !!d.connected, hdmi: /hdmi/i.test(d.id) };
            }).filter(function(d) { return !!d.id; });
        });
    }

    // Developer Mode expires and uninstalls the app; when installed with --auto-renew the package
    // carries the session token and the app extends the session itself, at most once a day.
    function renewDevMode() {
        var last = U.store.get('devmode_renewed_at', 0);
        if (Date.now() - last < 20 * 3600 * 1000) return Promise.resolve(last);
        return new Promise(function(resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'devmode.json');
            xhr.onload = function() {
                var token = '';
                try { token = JSON.parse(xhr.responseText).token || ''; } catch (e) {}
                resolve(token);
            };
            xhr.onerror = function() { resolve(''); };
            xhr.send();
        }).then(function(token) {
            if (!token) return 0;
            return fetch('https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=' + encodeURIComponent(token))
                .then(function(res) { return res.text(); })
                .then(function(body) {
                    if (body.replace(/\s/g, '').indexOf('"result":"success"') === -1) return 0;
                    var now = Date.now();
                    U.store.set('devmode_renewed_at', now);
                    return now;
                });
        }).catch(function() { return 0; });
    }

    function openUrl(url) {
        return launch('com.webos.app.browser', { target: url });
    }

    return {
        available: hasLuna,
        launch: launch,
        openUrl: openUrl,
        ssap: ssap,
        listApps: listApps,
        listInputs: listInputs,
        renewDevMode: renewDevMode
    };
})();
