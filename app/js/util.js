var U = {
    el: function(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    },

    find: function(arr, fn) {
        for (var i = 0; i < arr.length; i++) if (fn(arr[i], i)) return arr[i];
        return null;
    },

    toArray: function(list) { return Array.prototype.slice.call(list); },

    store: {
        get: function(key, fallback) {
            try {
                var raw = localStorage.getItem('mytv_' + key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch (e) { return fallback; }
        },
        set: function(key, value) {
            try { localStorage.setItem('mytv_' + key, JSON.stringify(value)); return true; }
            catch (e) { return false; }
        }
    },

    fetchJson: function(url, options) {
        return fetch(url, options).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    },

    qs: function(params) {
        var parts = [];
        for (var k in params) {
            if (params[k] !== '' && params[k] != null) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        }
        return parts.join('&');
    },

    isoDate: function(date) {
        var d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return d.toISOString().slice(0, 10);
    },

    timeAgo: function(date) {
        var minutes = Math.round((Date.now() - date.getTime()) / 60000);
        if (minutes < 1) return t('justNow');
        if (minutes < 60) return t('minutesAgo', { n: minutes });
        if (minutes < 60 * 24) return t('hoursAgo', { n: Math.round(minutes / 60) });
        return t('daysAgo', { n: Math.round(minutes / 1440) });
    },

    stripHtml: function(html) {
        // DOMParser documents are inert: no image loads or event handlers from feed content.
        var doc = new DOMParser().parseFromString(html || '', 'text/html');
        return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    },

    // Runs fn over items with at most `limit` promises in flight.
    pool: function(items, limit, fn) {
        var index = 0;
        function next() {
            if (index >= items.length) return Promise.resolve();
            var item = items[index++];
            return Promise.resolve(fn(item)).catch(function() {}).then(next);
        }
        var workers = [];
        for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(next());
        return Promise.all(workers);
    }
};
