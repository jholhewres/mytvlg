// Data sources: Open-Meteo (weather), TMDB / TVMaze (releases), RSS (news).

var Weather = (function() {
    var CONDITIONS = {
        0: 'wClear', 1: 'wMostlyClear', 2: 'wPartlyCloudy', 3: 'wCloudy',
        45: 'wFog', 48: 'wFog',
        51: 'wDrizzle', 53: 'wDrizzle', 55: 'wDrizzle', 56: 'wDrizzle', 57: 'wDrizzle',
        61: 'wRain', 63: 'wRain', 65: 'wHeavyRain', 66: 'wRain', 67: 'wHeavyRain',
        71: 'wSnow', 73: 'wSnow', 75: 'wSnow', 77: 'wSnow',
        80: 'wShowers', 81: 'wShowers', 82: 'wHeavyRain', 85: 'wSnow', 86: 'wSnow',
        95: 'wStorm', 96: 'wStorm', 99: 'wStorm'
    };

    var CLOUD = '<path d="M19 50h28a11 11 0 0 0 1.5-21.9A15 15 0 0 0 20 25.5 12.3 12.3 0 0 0 19 50Z" fill="#e7ebf6"/>';
    var CLOUD_DARK = '<path d="M19 50h28a11 11 0 0 0 1.5-21.9A15 15 0 0 0 20 25.5 12.3 12.3 0 0 0 19 50Z" fill="#aab3c8"/>';
    function sun(cx, cy, r) {
        var rays = '';
        for (var i = 0; i < 8; i++) {
            var a = i * Math.PI / 4;
            var x1 = cx + Math.cos(a) * (r + 5), y1 = cy + Math.sin(a) * (r + 5);
            var x2 = cx + Math.cos(a) * (r + 10), y2 = cy + Math.sin(a) * (r + 10);
            rays += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" stroke="#ffc94a" stroke-width="3.5" stroke-linecap="round"/>';
        }
        return rays + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#ffc94a"/>';
    }
    function moon(cx, cy, r) {
        return '<path d="M' + (cx + r * 0.2) + ' ' + (cy - r) + 'a' + r + ' ' + r + ' 0 1 0 ' + (r * 0.8) + ' ' + (r * 1.6) + 'A' + (r * 0.85) + ' ' + (r * 0.85) + ' 0 0 1 ' + (cx + r * 0.2) + ' ' + (cy - r) + 'Z" fill="#cdd5ff"/>';
    }
    function drops(color) {
        return '<path d="M24 54l-3 6m13-6l-3 6m13-6l-3 6" stroke="' + color + '" stroke-width="3.5" stroke-linecap="round"/>';
    }

    function icon(code, isDay) {
        var body;
        if (code === 0) body = isDay ? sun(32, 32, 12) : moon(30, 32, 15);
        else if (code === 1 || code === 2) body = (isDay ? sun(24, 22, 9) : moon(22, 22, 11)) + CLOUD;
        else if (code === 3) body = CLOUD;
        else if (code === 45 || code === 48) body = CLOUD + '<path d="M14 56h36M20 62h24" stroke="#aab3c8" stroke-width="3.5" stroke-linecap="round"/>';
        else if (code >= 51 && code <= 67 || code >= 80 && code <= 82) body = CLOUD_DARK + drops('#6cb6ff');
        else if (code >= 71 && code <= 77 || code === 85 || code === 86) body = CLOUD + '<circle cx="24" cy="57" r="2.6" fill="#fff"/><circle cx="34" cy="60" r="2.6" fill="#fff"/><circle cx="44" cy="57" r="2.6" fill="#fff"/>';
        else if (code >= 95) body = CLOUD_DARK + '<path d="M34 46l-7 10h7l-4 9 10-13h-7l4-6Z" fill="#ffd34a"/>';
        else body = CLOUD;
        return '<svg viewBox="0 0 64 68" aria-hidden="true">' + body + '</svg>';
    }

    function condition(code) { return t(CONDITIONS[code] || 'wCloudy'); }

    function locate(city) {
        if (city) {
            var url = 'https://geocoding-api.open-meteo.com/v1/search?' + U.qs({ name: city, count: 1, language: I18N.lang });
            return U.fetchJson(url).then(function(data) {
                var r = data.results && data.results[0];
                if (!r) throw new Error('city not found');
                return { lat: r.latitude, lon: r.longitude, name: r.name };
            });
        }
        var cached = U.store.get('geo', null);
        if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return Promise.resolve(cached);
        return U.fetchJson('https://ipapi.co/json/').then(function(d) {
            // Rate-limited responses come back as HTTP 200 with { error: true }.
            if (d.error || !d.latitude) throw new Error('ipapi');
            return { lat: d.latitude, lon: d.longitude, name: d.city };
        }).catch(function() {
            return U.fetchJson('https://ipwho.is/').then(function(d) {
                return { lat: d.latitude, lon: d.longitude, name: d.city };
            });
        }).then(function(loc) {
            if (!loc.lat && !loc.lon) throw new Error('no location');
            loc.at = Date.now();
            U.store.set('geo', loc);
            return loc;
        });
    }

    function load(city, unit) {
        return locate(city).then(function(loc) {
            var url = 'https://api.open-meteo.com/v1/forecast?' + U.qs({
                latitude: loc.lat,
                longitude: loc.lon,
                current: 'temperature_2m,apparent_temperature,weather_code,is_day',
                hourly: 'temperature_2m,weather_code,is_day',
                daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
                timezone: 'auto',
                temperature_unit: unit === 'f' ? 'fahrenheit' : 'celsius',
                forecast_days: 6
            });
            return U.fetchJson(url).then(function(data) {
                // Open-Meteo returns wall-clock strings in the location's timezone.
                var localNow = new Date(Date.now() + (data.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13);
                var start = 0;
                while (start < data.hourly.time.length && data.hourly.time[start].slice(0, 13) < localNow) start++;
                var hourly = [];
                for (var i = start + 1; i < Math.min(start + 7, data.hourly.time.length); i++) {
                    hourly.push({
                        hour: data.hourly.time[i].slice(11, 16),
                        temp: Math.round(data.hourly.temperature_2m[i]),
                        code: data.hourly.weather_code[i],
                        isDay: data.hourly.is_day[i] === 1
                    });
                }
                var daily = data.daily.time.map(function(day, i) {
                    return {
                        date: new Date(day + 'T12:00:00'),
                        code: data.daily.weather_code[i],
                        max: Math.round(data.daily.temperature_2m_max[i]),
                        min: Math.round(data.daily.temperature_2m_min[i])
                    };
                });
                return {
                    city: loc.name || '',
                    temp: Math.round(data.current.temperature_2m),
                    feels: Math.round(data.current.apparent_temperature),
                    code: data.current.weather_code,
                    isDay: data.current.is_day === 1,
                    hourly: hourly,
                    daily: daily,
                    sunrise: data.daily.sunrise[0].slice(11, 16),
                    sunset: data.daily.sunset[0].slice(11, 16),
                    localHour: parseInt(localNow.slice(11, 13), 10)
                };
            });
        });
    }

    return { load: load, icon: icon, condition: condition };
})();

var Media = (function() {
    var IMG = 'https://image.tmdb.org/t/p/';
    var genreNames = {};
    var providerCache = {};

    function tmdb(key, path, params) {
        params = params || {};
        params.language = I18N.tag;
        var options = {};
        // v4 read access tokens are JWTs; v3 keys are 32 hex characters.
        if (key.length > 40) options.headers = { Authorization: 'Bearer ' + key };
        else params.api_key = key;
        return U.fetchJson('https://api.themoviedb.org/3' + path + '?' + U.qs(params), options);
    }

    function loadGenres(key) {
        if (genreNames.loaded) return Promise.resolve();
        return Promise.all([tmdb(key, '/genre/movie/list'), tmdb(key, '/genre/tv/list')]).then(function(res) {
            res.forEach(function(r) { (r.genres || []).forEach(function(g) { genreNames[g.id] = g.name; }); });
            genreNames.loaded = true;
        }).catch(function() {});
    }

    function fromTmdb(r, kind) {
        kind = r.media_type || kind;
        var date = r.release_date || r.first_air_date || '';
        var released = date ? new Date(date + 'T12:00:00') : null;
        return {
            source: 'tmdb',
            id: r.id,
            kind: kind,
            title: r.title || r.name,
            originalTitle: r.original_title || r.original_name || '',
            overview: r.overview || '',
            backdrop: r.backdrop_path ? IMG + 'w1280' + r.backdrop_path : '',
            card: r.backdrop_path ? IMG + 'w780' + r.backdrop_path : (r.poster_path ? IMG + 'w500' + r.poster_path : ''),
            year: date.slice(0, 4),
            rating: r.vote_average ? r.vote_average.toFixed(1) : '',
            genres: (r.genre_ids || []).map(function(id) { return genreNames[id]; }).filter(Boolean).slice(0, 2),
            genreIds: r.genre_ids || [],
            lang: r.original_language || '',
            score: r.vote_average || 0,
            isNew: released ? (Date.now() - released.getTime()) < 45 * 86400000 : false
        };
    }

    function usable(items) {
        return items.filter(function(i) { return i.card && i.title; });
    }

    function releases(key) {
        var today = new Date();
        var from = new Date(today.getTime() - 180 * 86400000);
        var params = {
            sort_by: 'popularity.desc',
            'primary_release_date.gte': U.isoDate(from),
            'primary_release_date.lte': U.isoDate(today),
            'vote_count.gte': 5,
            include_adult: false
        };
        if (config.minRating) params['vote_average.gte'] = config.minRating;
        if (I18N.region) {
            params.watch_region = I18N.region;
            params.with_watch_monetization_types = 'flatrate';
        }
        return loadGenres(key).then(function() {
            return tmdb(key, '/discover/movie', params);
        }).then(function(res) {
            return usable(res.results.map(function(r) { return fromTmdb(r, 'movie'); }));
        });
    }

    function trendingShows(key) {
        return loadGenres(key).then(function() {
            return tmdb(key, '/trending/tv/week');
        }).then(function(res) {
            return usable(res.results.map(function(r) { return fromTmdb(r, 'tv'); }));
        });
    }

    function featured(key) {
        return loadGenres(key).then(function() {
            return tmdb(key, '/trending/all/week');
        }).then(function(res) {
            return usable(res.results.filter(function(r) {
                return (r.media_type === 'movie' || r.media_type === 'tv') && r.backdrop_path;
            }).map(function(r) { return fromTmdb(r); })).slice(0, 8);
        });
    }

    var config = { minRating: 0 };

    function discover(key, kind, filters, page) {
        var params = { sort_by: 'popularity.desc', 'vote_count.gte': 20, include_adult: false, page: page || 1 };
        if (config.minRating) params['vote_average.gte'] = config.minRating;
        for (var f in filters) params[f] = filters[f];
        if (I18N.region) {
            params.watch_region = I18N.region;
            params.with_watch_monetization_types = 'flatrate';
        }
        return tmdb(key, '/discover/' + kind, params).then(function(res) {
            return res.results.map(function(r) { return fromTmdb(r, kind); });
        }).catch(function() { return []; });
    }

    // Mixes movies and series of a category, alternating so neither dominates.
    function category(key, cat, pages) {
        pages = pages || 1;
        return loadGenres(key).then(function() {
            var jobs = [];
            for (var p = 1; p <= pages; p++) {
                jobs.push(cat.movie ? discover(key, 'movie', cat.movie, p) : Promise.resolve([]));
                jobs.push(cat.tv ? discover(key, 'tv', cat.tv, p) : Promise.resolve([]));
            }
            return Promise.all(jobs);
        }).then(function(lists) {
            var movies = [], shows = [];
            lists.forEach(function(l, i) { (i % 2 ? shows : movies).push.apply(i % 2 ? shows : movies, l); });
            var mixed = [];
            for (var i = 0; i < Math.max(movies.length, shows.length); i++) {
                if (movies[i]) mixed.push(movies[i]);
                if (shows[i]) mixed.push(shows[i]);
            }
            return usable(mixed);
        });
    }

    function genreName(id) { return genreNames[id] || ''; }

    var tvCache = {};
    function tvDetails(key, id) {
        var hit = tvCache[id];
        if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return Promise.resolve(hit.data);
        return tmdb(key, '/tv/' + id).then(function(d) {
            tvCache[id] = { at: Date.now(), data: d };
            return d;
        });
    }

    function season(key, id, number) {
        return tmdb(key, '/tv/' + id + '/season/' + number).then(function(s) {
            return (s.episodes || []).map(function(e) {
                return {
                    season: e.season_number,
                    number: e.episode_number,
                    name: e.name,
                    overview: e.overview || '',
                    airDate: e.air_date || '',
                    runtime: e.runtime || 0,
                    rating: e.vote_average ? e.vote_average.toFixed(1) : '',
                    still: e.still_path ? IMG + 'w300' + e.still_path : ''
                };
            });
        });
    }

    // Movies that reached digital/streaming and series with episodes aired in the last 7 days.
    function thisWeek(key) {
        var today = new Date();
        var from = U.isoDate(new Date(today.getTime() - 7 * 86400000));
        var to = U.isoDate(today);
        var movie = { with_release_type: '4|6', 'release_date.gte': from, 'release_date.lte': to, 'vote_count.gte': 0 };
        if (I18N.region) movie.region = I18N.region;
        var tv = { 'air_date.gte': from, 'air_date.lte': to, 'vote_count.gte': 10 };
        return loadGenres(key).then(function() {
            return Promise.all([discover(key, 'movie', movie, 1), discover(key, 'tv', tv, 1), discover(key, 'tv', tv, 2)]);
        }).then(function(lists) {
            var items = interleave(lists[0], lists[1].concat(lists[2]));
            items.forEach(function(i) {
                i.thisWeek = true;
                if (i.kind === 'tv') i.episode = t('newEpisodes');
            });
            return items.slice(0, 30);
        });
    }

    // Discover with user filters: { type, category, provider, rating, decade, language, sort }.
    function explore(key, f, page) {
        var kinds = f.type === 'movie' ? ['movie'] : f.type === 'tv' ? ['tv'] : ['movie', 'tv'];
        var today = U.isoDate(new Date());
        return loadGenres(key).then(function() {
            return Promise.all(kinds.map(function(kind) {
                var cat = f.category;
                if (cat && !cat[kind]) return [];
                var p = {};
                if (cat) for (var k in cat[kind]) p[k] = cat[kind][k];
                var dateField = kind === 'movie' ? 'primary_release_date' : 'first_air_date';
                if (f.sort === 'rating') { p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = 300; }
                else if (f.sort === 'newest') { p.sort_by = dateField + '.desc'; p[dateField + '.lte'] = today; }
                if (f.provider) p.with_watch_providers = f.provider;
                if (f.rating) p['vote_average.gte'] = f.rating;
                if (f.decade) {
                    var y = parseInt(f.decade, 10);
                    p[dateField + '.gte'] = (y < 1980 ? 1900 : y) + '-01-01';
                    p[dateField + '.lte'] = (y < 1980 ? 1979 : y + 9) + '-12-31';
                }
                if (f.language) p.with_original_language = f.language;
                return discover(key, kind, p, page);
            }));
        }).then(function(lists) {
            return interleave(lists[0] || [], lists[1] || []);
        });
    }

    function search(key, query) {
        return loadGenres(key).then(function() {
            return tmdb(key, '/search/multi', { query: query, include_adult: false });
        }).then(function(res) {
            return usable(res.results.filter(function(r) {
                return r.media_type === 'movie' || r.media_type === 'tv';
            }).map(function(r) { return fromTmdb(r); }));
        });
    }

    // Recommendations seeded by recently opened titles; falls back to the best rated titles on streaming.
    function recommendations(key, history) {
        var seeds = history.slice(0, 3);
        if (!seeds.length) {
            var top = { sort_by: 'vote_average.desc', 'vote_count.gte': 1500 };
            return loadGenres(key).then(function() {
                return Promise.all([discover(key, 'movie', top), discover(key, 'tv', top)]);
            }).then(function(lists) {
                return { personal: false, items: interleave(lists[0], lists[1]) };
            });
        }
        var seen = {};
        history.forEach(function(h) { seen[h.kind + h.id] = true; });
        return loadGenres(key).then(function() {
            return Promise.all(seeds.map(function(h) {
                return tmdb(key, '/' + h.kind + '/' + h.id + '/recommendations').then(function(res) {
                    return res.results.map(function(r) { return fromTmdb(r, h.kind); });
                }).catch(function() { return []; });
            }));
        }).then(function(lists) {
            var mixed = [];
            for (var i = 0; i < 20; i++) {
                lists.forEach(function(l) {
                    var item = l[i];
                    if (item && !seen[item.kind + item.id]) { seen[item.kind + item.id] = true; mixed.push(item); }
                });
            }
            return { personal: true, items: usable(mixed).slice(0, 30) };
        });
    }

    function interleave(a, b) {
        var out = [];
        for (var i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) out.push(a[i]);
            if (b[i]) out.push(b[i]);
        }
        return usable(out);
    }

    // IMDb rating through OMDb (optional key), cached for a week.
    function imdbRating(key, omdbKey, item) {
        if (!omdbKey || item.source !== 'tmdb') return Promise.resolve('');
        var cache = U.store.get('imdb_cache', {});
        var id = item.kind + item.id;
        var hit = cache[id];
        if (hit && Date.now() - hit[1] < 7 * 86400000) return Promise.resolve(hit[0]);
        return tmdb(key, '/' + item.kind + '/' + item.id + '/external_ids').then(function(ext) {
            if (!ext.imdb_id) return '';
            return U.fetchJson('https://www.omdbapi.com/?' + U.qs({ i: ext.imdb_id, apikey: omdbKey })).then(function(d) {
                // Errors such as "Request limit reached" also arrive as HTTP 200; never cache them.
                if (d.Response !== 'True') throw new Error(d.Error || 'omdb');
                return d.imdbRating && d.imdbRating !== 'N/A' ? d.imdbRating : '';
            });
        }).then(function(rating) {
            cache = U.store.get('imdb_cache', {});
            cache[id] = [rating, Date.now()];
            var keys = Object.keys(cache);
            if (keys.length > 500) {
                keys.sort(function(a, b) { return cache[a][1] - cache[b][1]; });
                keys.slice(0, keys.length - 500).forEach(function(k) { delete cache[k]; });
            }
            U.store.set('imdb_cache', cache);
            return rating;
        }).catch(function() { return ''; });
    }

    // Picks the subscription provider to show for a title: an installed app first, skipping hidden ones.
    // Returns { hidden: true } when every provider of the title is hidden.
    function provider(key, item, apps, hidden) {
        if (item.source !== 'tmdb' || !I18N.region) return Promise.resolve(null);
        var cacheKey = item.kind + item.id;
        var listPromise = providerCache[cacheKey] ? Promise.resolve(providerCache[cacheKey]) :
            tmdb(key, '/' + item.kind + '/' + item.id + '/watch/providers').then(function(res) {
                var region = res.results && res.results[I18N.region];
                providerCache[cacheKey] = region && region.flatrate || [];
                return providerCache[cacheKey];
            });
        return listPromise.then(function(all) {
            var list = all.filter(function(p) { return hidden.indexOf(p.provider_id) === -1; });
            if (all.length && !list.length) return { hidden: true, ids: [] };
            var ids = list.map(function(p) { return p.provider_id; });
            var best = null;
            for (var i = 0; i < list.length && !best; i++) {
                var appId = matchApp(list[i], apps);
                if (appId) best = { id: list[i].provider_id, name: list[i].provider_name, logo: logoUrl(list[i].logo_path), appId: appId };
            }
            if (!best && list.length) best = { id: list[0].provider_id, name: list[0].provider_name, logo: logoUrl(list[0].logo_path), appId: '' };
            if (best) {
                best.ids = ids;
                // Every visible provider, installed apps first, for the "where to watch" list.
                var byApp = {};
                best.all = list.map(function(p) {
                    return { id: p.provider_id, name: p.provider_name, logo: logoUrl(p.logo_path), appId: matchApp(p, apps) };
                }).filter(function(p) {
                    // One button per app: "X with Ads" and channels inside X collapse into X.
                    if (!p.appId) return true;
                    if (byApp[p.appId]) return false;
                    byApp[p.appId] = true;
                    return true;
                }).sort(function(a, b) { return (b.appId ? 1 : 0) - (a.appId ? 1 : 0); });
            }
            return best;
        }).catch(function() { return null; });
    }

    // Main subscription services in the region, ordered by TMDB's display priority.
    var regionProvidersCache = null;
    function regionProviders(key) {
        if (!I18N.region) return Promise.resolve([]);
        if (regionProvidersCache) return Promise.resolve(regionProvidersCache);
        return tmdb(key, '/watch/providers/movie', { watch_region: I18N.region }).then(function(res) {
            var list = (res.results || []).map(function(p) {
                var prio = p.display_priorities && p.display_priorities[I18N.region];
                return { id: p.provider_id, name: p.provider_name, logo: logoUrl(p.logo_path), priority: prio == null ? 999 : prio };
            });
            list.sort(function(a, b) { return a.priority - b.priority; });
            regionProvidersCache = list.slice(0, 24);
            return regionProvidersCache;
        });
    }

    function logoUrl(path) { return path ? IMG + 'w92' + path : ''; }

    function normalize(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

    function matchApp(p, apps) {
        var known = CATALOG.PROVIDER_APPS[p.provider_id];
        if (known && (!apps.length || U.find(apps, function(a) { return a.id === known; }))) return known;
        var name = normalize(p.provider_name);
        // Channels sold inside another store open in that store's app.
        if (name.indexOf('amazonchannel') !== -1) return 'amazon';
        if (name.indexOf('appletvchannel') !== -1) return 'com.apple.appletv';
        var hit = U.find(apps, function(a) {
            var title = normalize(a.title);
            return title.length > 2 && (name.indexOf(title) === 0 || title.indexOf(name) === 0 ||
                (title.length >= 5 && name.indexOf(title) !== -1));
        });
        return hit ? hit.id : '';
    }

    // Zero-key fallback: episodes released today on streaming services.
    function todayStreaming() {
        var base = 'https://api.tvmaze.com/schedule/web?';
        var date = U.isoDate(new Date());
        // Regional schedules are often empty; fall back to the global one.
        return U.fetchJson(base + U.qs({ date: date, country: I18N.region })).then(function(episodes) {
            return episodes.length ? episodes : U.fetchJson(base + U.qs({ date: date }));
        }).then(function(episodes) {
            var seen = {};
            var items = [];
            episodes.forEach(function(ep) {
                var show = ep._embedded && ep._embedded.show;
                if (!show || seen[show.id] || !show.image) return;
                seen[show.id] = true;
                var channel = show.webChannel || show.network;
                items.push({
                    source: 'tvmaze',
                    id: show.id,
                    kind: 'episode',
                    title: show.name,
                    overview: U.stripHtml(show.summary),
                    backdrop: '',
                    card: show.image.original || show.image.medium,
                    year: (show.premiered || '').slice(0, 4),
                    rating: show.rating && show.rating.average ? show.rating.average.toFixed(1) : '',
                    genres: (show.genres || []).slice(0, 2),
                    episode: 'S' + ep.season + ' · E' + ep.number,
                    channel: channel ? channel.name : '',
                    isNew: true
                });
            });
            return items.slice(0, 20);
        });
    }

    return { config: config, search: search, explore: explore, thisWeek: thisWeek, tvDetails: tvDetails, season: season, recommendations: recommendations, imdbRating: imdbRating, releases: releases, trendingShows: trendingShows, featured: featured, provider: provider, regionProviders: regionProviders, todayStreaming: todayStreaming, normalize: normalize, category: category, genreName: genreName };
})();

var News = (function() {
    function feedFor(settings) {
        if (settings.newsFeed === 'custom' && settings.newsUrl) return { name: '', url: settings.newsUrl };
        var preset = U.find(CATALOG.NEWS_FEEDS, function(f) { return f.id === settings.newsFeed; }) ||
            U.find(CATALOG.NEWS_FEEDS, function(f) { return f.lang === I18N.lang; }) ||
            U.find(CATALOG.NEWS_FEEDS, function(f) { return f.lang === 'en'; });
        return preset;
    }

    function text(node, names) {
        for (var i = 0; i < names.length; i++) {
            var found = node.getElementsByTagName(names[i])[0];
            if (found && found.textContent) return found.textContent.trim();
        }
        return '';
    }

    function image(node, html) {
        var media = node.getElementsByTagName('media:content')[0] ||
            node.getElementsByTagName('media:thumbnail')[0] ||
            node.getElementsByTagName('enclosure')[0];
        var url = media && media.getAttribute('url') || '';
        if (!url) {
            var match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
            if (match) url = match[1];
        }
        // BBC serves 240px thumbnails by default; the same path accepts larger widths.
        return url.replace(/(ichef\.bbci\.co\.uk\/(?:ace\/)?(?:standard|ws)\/)\d+\//, '$1800/');
    }

    function load(settings) {
        var feed = feedFor(settings);
        return fetch(feed.url).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        }).then(function(xml) {
            var doc = new DOMParser().parseFromString(xml, 'text/xml');
            var channelTitle = text(doc, ['title']);
            var nodes = U.toArray(doc.getElementsByTagName('item'));
            if (!nodes.length) nodes = U.toArray(doc.getElementsByTagName('entry'));
            return nodes.slice(0, 16).map(function(n) {
                var desc = text(n, ['description', 'summary', 'content:encoded', 'content']);
                var linkNode = n.getElementsByTagName('link')[0];
                var link = linkNode ? (linkNode.getAttribute('href') || linkNode.textContent.trim()) : '';
                var dateText = text(n, ['pubDate', 'published', 'updated', 'dc:date']);
                var date = dateText ? new Date(dateText) : null;
                return {
                    title: U.stripHtml(text(n, ['title'])),
                    link: /^https?:\/\//i.test(link) ? link : '',
                    image: image(n, desc),
                    summary: U.stripHtml(desc).slice(0, 320),
                    date: date && !isNaN(date.getTime()) ? date : null,
                    source: feed.name || channelTitle
                };
            }).filter(function(i) { return i.title; });
        });
    }

    return { load: load, feedFor: feedFor };
})();

var Kids = (function() {
    function channelVideos(channel) {
        return fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + channel.id).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        }).then(function(xml) {
            var doc = new DOMParser().parseFromString(xml, 'text/xml');
            return U.toArray(doc.getElementsByTagName('entry')).map(function(e) {
                var link = e.getElementsByTagName('link')[0];
                var href = link ? link.getAttribute('href') || '' : '';
                var idNode = e.getElementsByTagName('yt:videoId')[0];
                return {
                    id: idNode ? idNode.textContent : '',
                    title: (e.getElementsByTagName('title')[0] || {}).textContent || '',
                    date: new Date((e.getElementsByTagName('published')[0] || {}).textContent || 0),
                    channel: channel.name,
                    shorts: href.indexOf('/shorts/') !== -1
                };
            }).filter(function(v) { return v.id && !v.shorts; });
        }).catch(function() { return []; });
    }

    // Latest videos across the language's channels, newest first, at most `perChannel` each.
    function videos(perChannel) {
        var channels = CATALOG.KIDS_CHANNELS[I18N.lang] || CATALOG.KIDS_CHANNELS.en;
        return Promise.all(channels.map(channelVideos)).then(function(lists) {
            var all = [];
            lists.forEach(function(l) { all = all.concat(l.slice(0, perChannel || 6)); });
            all.sort(function(a, b) { return b.date - a.date; });
            return all;
        });
    }

    return { videos: videos };
})();

// IPTV: the user's own M3U list or Xtream Codes account, matched to TMDB titles by name and year.
var Iptv = (function() {
    var index = null;
    var loading = null;
    var config = null;

    var NOISE = /\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|2160p|hdr|dublado|dub|legendado|leg|dual|audio|nacional|cam|ts|hdcam|webdl|web dl|bluray|x264|x265|hevc)\b/g;

    function norm(s) {
        return (s || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
            .replace(/&/g, ' e ')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(NOISE, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function yearOf(s) {
        var m = /\((\d{4})\)/.exec(s) || /\b(19\d{2}|20\d{2})\b\s*$/.exec(s);
        return m ? parseInt(m[1], 10) : 0;
    }

    function stripYear(s) { return s.replace(/\s*\(?\b(19\d{2}|20\d{2})\b\)?\s*$/, ''); }

    var EPISODE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})/i;

    var MAX_LIVE = 20000;
    function emptyIndex() { return { movies: {}, series: {}, live: [], vod: [], seriesList: [], counts: { movies: 0, episodes: 0, series: 0, live: 0 } }; }

    function addLive(idx, entry) {
        idx.counts.live++;
        if (idx.live.length < MAX_LIVE) idx.live.push(entry);
    }

    function addMovie(idx, name, entry) {
        var key = norm(stripYear(name));
        if (!key) return;
        entry.year = entry.year || yearOf(name);
        (idx.movies[key] = idx.movies[key] || []).push(entry);
        idx.vod.push(entry);
        idx.counts.movies++;
    }

    function seriesEntry(idx, showName, logo, group) {
        var key = norm(stripYear(showName));
        if (!key) return null;
        if (!idx.series[key]) {
            idx.series[key] = { name: showName.trim(), episodes: {}, logo: logo || '', group: group || '' };
            idx.seriesList.push(idx.series[key]);
            idx.counts.series++;
        }
        return idx.series[key];
    }

    function parseM3u(text) {
        var idx = emptyIndex();
        var pos = 0, info = null;
        while (pos < text.length) {
            var end = text.indexOf('\n', pos);
            if (end === -1) end = text.length;
            var line = text.slice(pos, end).trim();
            pos = end + 1;
            if (!line) continue;
            if (line.indexOf('#EXTINF') === 0) {
                var comma = line.lastIndexOf(',');
                var group = /group-title="([^"]*)"/.exec(line);
                var tvgName = /tvg-name="([^"]*)"/.exec(line);
                var logo = /tvg-logo="([^"]*)"/.exec(line);
                info = { name: (comma !== -1 ? line.slice(comma + 1) : '') || (tvgName ? tvgName[1] : ''), group: group ? group[1] : '', logo: logo ? logo[1] : '' };
                continue;
            }
            if (line.charAt(0) === '#' || !info) continue;
            var url = line, name = info.name.trim(), groupName = info.group, logoUrl = info.logo;
            info = null;
            var ep = EPISODE.exec(name);
            if (/\/series\//.test(url) || ep) {
                if (!ep) continue;
                var show = seriesEntry(idx, ep[1], logoUrl, groupName);
                if (!show) continue;
                var code = parseInt(ep[2], 10) + 'x' + parseInt(ep[3], 10);
                (show.episodes[code] = show.episodes[code] || []).push({ name: name, url: url });
                idx.counts.episodes++;
            } else if (/\/movie\//.test(url) || /\.(mp4|mkv|avi|mov)(\?|$)/i.test(url) ||
                (/filme|movie|vod|cinema/i.test(groupName) && yearOf(name))) {
                // Movie channels in live lists share these group names, so VOD also needs a file URL or a year.
                addMovie(idx, name, { name: name, url: url, logo: logoUrl, group: groupName });
            } else {
                addLive(idx, { name: name, url: url, logo: logoUrl, group: groupName });
            }
        }
        return idx;
    }

    function xtreamBase(c) { return c.server.replace(/\/+$/, ''); }
    function xtreamApi(c, params) {
        params.username = c.user;
        params.password = c.pass;
        return U.fetchJson(xtreamBase(c) + '/player_api.php?' + U.qs(params));
    }

    function loadXtream(c) {
        var idx = emptyIndex();
        function cats(list) {
            var map = {};
            (Array.isArray(list) ? list : []).forEach(function(cat) { map[cat.category_id] = cat.category_name; });
            return map;
        }
        var none = function() { return []; };
        return Promise.all([
            xtreamApi(c, { action: 'get_vod_streams' }),
            xtreamApi(c, { action: 'get_series' }),
            xtreamApi(c, { action: 'get_live_streams' }).catch(none),
            xtreamApi(c, { action: 'get_live_categories' }).catch(none),
            xtreamApi(c, { action: 'get_vod_categories' }).catch(none),
            xtreamApi(c, { action: 'get_series_categories' }).catch(none)
        ]).then(function(res) {
            var categories = cats(res[3]), vodCats = cats(res[4]), seriesCats = cats(res[5]);
            function arr(x) { return Array.isArray(x) ? x : []; }
            res = res.map(arr);
            (res[2] || []).forEach(function(ch) {
                addLive(idx, {
                    name: ch.name || '',
                    url: xtreamBase(c) + '/live/' + encodeURIComponent(c.user) + '/' + encodeURIComponent(c.pass) + '/' + ch.stream_id + '.m3u8',
                    logo: ch.stream_icon || '',
                    group: categories[ch.category_id] || ''
                });
            });
            (res[0] || []).forEach(function(v) {
                addMovie(idx, v.name || '', {
                    name: v.name,
                    url: xtreamBase(c) + '/movie/' + encodeURIComponent(c.user) + '/' + encodeURIComponent(c.pass) + '/' + v.stream_id + '.' + (v.container_extension || 'mp4'),
                    tmdb: v.tmdb ? String(v.tmdb) : '',
                    logo: v.stream_icon || '',
                    group: vodCats[v.category_id] || '',
                    rating: v.rating ? String(v.rating) : ''
                });
            });
            (res[1] || []).forEach(function(s) {
                var show = seriesEntry(idx, s.name || '', s.cover || '', seriesCats[s.category_id] || '');
                if (!show) return;
                show.plot = s.plot || '';
                show.xtreamId = s.series_id;
                show.tmdb = s.tmdb ? String(s.tmdb) : '';
            });
            return idx;
        });
    }

    var loadToken = 0;
    function load(settings) {
        var token = ++loadToken;
        index = null;
        var c = { mode: settings.iptvSource, url: settings.iptvUrl, server: settings.iptvServer, user: settings.iptvUser, pass: settings.iptvPass };
        if (!settings.iptvEnabled || (c.mode === 'xtream' ? !(c.server && c.user && c.pass) : !c.url)) {
            index = null; config = null; loading = null;
            return Promise.resolve(null);
        }
        config = c;
        loading = (c.mode === 'xtream' ? loadXtream(c) : fetch(c.url).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        }).then(parseM3u)).then(function(idx) {
            // A newer load (or switching IPTV off) wins over this one.
            if (token !== loadToken) return null;
            index = idx;
            return idx;
        });
        return loading;
    }

    function titleKeys(item) {
        var keys = [norm(item.title)];
        if (item.originalTitle) keys.push(norm(item.originalTitle));
        return keys.filter(function(k, i) { return k && keys.indexOf(k) === i; });
    }

    function findMovie(item) {
        if (!index || item.kind !== 'movie') return [];
        var year = parseInt(item.year, 10) || 0;
        var out = [];
        titleKeys(item).forEach(function(k) {
            (index.movies[k] || []).forEach(function(e) {
                if (e.tmdb && String(item.id) !== e.tmdb) return;
                if (year && e.year && Math.abs(e.year - year) > 1) return;
                if (out.indexOf(e) === -1) out.push(e);
            });
        });
        return out;
    }

    function findSeries(item) {
        if (!index || item.kind !== 'tv') return null;
        var keys = titleKeys(item);
        for (var i = 0; i < keys.length; i++) {
            var s = index.series[keys[i]];
            if (s && (!s.tmdb || s.tmdb === String(item.id))) return s;
        }
        return null;
    }

    // Episode map { "1x3": [{ name, url }] } for a matched series (fetched lazily for Xtream).
    function episodes(show) {
        if (!show) return Promise.resolve({});
        if (!show.xtreamId || show.loaded) return Promise.resolve(show.episodes);
        if (show.loading) return show.loading;
        show.loading = xtreamApi(config, { action: 'get_series_info', series_id: show.xtreamId }).then(function(info) {
            var eps = info.episodes || {};
            Object.keys(eps).forEach(function(season) {
                (eps[season] || []).forEach(function(e) {
                    var code = parseInt(e.season || season, 10) + 'x' + parseInt(e.episode_num, 10);
                    (show.episodes[code] = show.episodes[code] || []).push({
                        name: e.title || code,
                        url: xtreamBase(config) + '/series/' + encodeURIComponent(config.user) + '/' + encodeURIComponent(config.pass) + '/' + e.id + '.' + (e.container_extension || 'mp4')
                    });
                });
            });
            show.loaded = true;
            return show.episodes;
        }).catch(function() { return show.episodes; }).then(function(eps) {
            show.loading = null;
            return eps;
        });
        return show.loading;
    }

    return {
        load: load,
        ready: function() { return !!index; },
        counts: function() { return index ? index.counts : null; },
        live: function() { return index ? index.live : []; },
        vod: function() { return index ? index.vod : []; },
        seriesList: function() { return index ? index.seriesList : []; },
        findMovie: findMovie,
        findSeries: findSeries,
        episodes: episodes
    };
})();
