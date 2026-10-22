// Known apps, used before the TV is paired and to give known brands a consistent look.
var CATALOG = (function() {
    var APPS = [
        { id: 'youtube.leanback.v4', title: 'YouTube', logo: 'youtube', bg: 'linear-gradient(135deg, #ff1a3c, #b3001b)' },
        { id: 'netflix', title: 'Netflix', logo: 'netflix', bg: 'linear-gradient(135deg, #232323, #050505)' },
        { id: 'amazon', title: 'Prime Video', logo: 'amazonprime', wide: true, bg: 'linear-gradient(135deg, #1fb6ee, #0a6fa8)' },
        { id: 'com.disney.disneyplus-prod', title: 'Disney+', logo: 'disneyplus', bg: 'linear-gradient(135deg, #1440b8, #0a1f5c)' },
        { id: 'com.hbo.hbomax', title: 'HBO Max', bg: 'linear-gradient(135deg, #5a12d6, #23063f)' },
        { id: 'globoplaywebos', title: 'Globoplay', logo: 'globoplay', wide: true, bg: 'linear-gradient(135deg, #2a2a30, #0c0c10)' },
        { id: 'com.apple.appletv', title: 'Apple TV', bg: 'linear-gradient(135deg, #2b2b2e, #0b0b0c)' },
        { id: 'com.crunchyroll.webapp', title: 'Crunchyroll', logo: 'crunchyroll', bg: 'linear-gradient(135deg, #ff8a3d, #d9560f)' },
        { id: 'spotify-beehive', title: 'Spotify', logo: 'spotify', bg: 'linear-gradient(135deg, #2bd469, #11853b)' },
        { id: 'cdp-30', title: 'Plex', logo: 'plex', bg: 'linear-gradient(135deg, #2a2a2a, #0c0c0c)' },
        { id: 'tv.twitch.tv.starshot.lg', title: 'Twitch', bg: 'linear-gradient(135deg, #a26bff, #5b2bc9)' },
        { id: 'com.webos.app.browser', title: 'Browser' },
        { id: 'com.webos.app.mediadiscovery', title: 'Media Player' },
        { id: 'org.webosbrew.hbchannel', title: 'Homebrew', bg: 'linear-gradient(135deg, #e0186a, #8b0034)' }
    ];

    var HDMI = [1, 2, 3, 4].map(function(n) {
        return { id: 'com.webos.app.hdmi' + n, title: 'HDMI ' + n, hdmi: true };
    });

    var DEFAULT_FAVORITES = [
        'youtube.leanback.v4', 'netflix', 'amazon', 'com.disney.disneyplus-prod',
        'com.hbo.hbomax', 'globoplaywebos', 'com.webos.app.hdmi1', 'com.webos.app.browser'
    ];

    var DEVICES = [
        { key: '', title: '', bg: 'linear-gradient(135deg, #2f6bff, #173aa8)', art: 'input' },
        { key: 'ps5', title: 'PlayStation 5', logo: 'playstation5', bg: 'linear-gradient(135deg, #2357d6, #0b2468)' },
        { key: 'ps4', title: 'PlayStation 4', logo: 'playstation4', bg: 'linear-gradient(135deg, #1d3f99, #0b1d4a)' },
        { key: 'xbox', title: 'Xbox', logo: 'xbox', bg: 'linear-gradient(135deg, #1f9b1f, #0b4f0b)' },
        { key: 'switch', title: 'Nintendo Switch', logo: 'nintendoswitch', bg: 'linear-gradient(135deg, #f0303f, #a3101c)' },
        { key: 'pc', title: 'PC', bg: 'linear-gradient(135deg, #7a4ff0, #3b1f8f)', art: 'pc' },
        { key: 'tvbox', title: 'TV Box', bg: 'linear-gradient(135deg, #3a3f52, #171a24)', art: 'box' }
    ];

    var DEVICE_ART = {
        input: '<path d="M14 22h36v18l-8 8H22l-8-8Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M23 30v9m6-9v9m6-9v9m6-9v9" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
        pc: '<rect x="10" y="14" width="44" height="30" rx="4" fill="none" stroke="#fff" stroke-width="4"/><path d="M32 44v8m-11 0h22" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
        box: '<rect x="10" y="24" width="44" height="18" rx="5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="44" cy="33" r="3" fill="#fff"/>'
    };

    // TMDB watch provider id -> webOS app id.
    var PROVIDER_APPS = {
        8: 'netflix', 1796: 'netflix',
        9: 'amazon', 119: 'amazon',
        337: 'com.disney.disneyplus-prod',
        384: 'com.hbo.hbomax', 1899: 'com.hbo.hbomax',
        307: 'globoplaywebos',
        283: 'com.crunchyroll.webapp',
        350: 'com.apple.appletv'
    };

    var NEWS_FEEDS = [
        { id: 'g1', name: 'g1', url: 'https://g1.globo.com/rss/g1/', lang: 'pt' },
        { id: 'bbc-pt', name: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
        { id: 'bbc', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en' },
        { id: 'bbc-es', name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', lang: 'es' }
    ];

    // Browsable categories; labels come from i18n keys or TMDB genre names.
    var CATEGORIES = [
        { key: 'anime', label: 'anime', colors: ['#ff5f8f', '#7b2ff7'], movie: { with_genres: 16, with_original_language: 'ja' }, tv: { with_genres: 16, with_original_language: 'ja' } },
        { key: 'kids', label: 'kids', colors: ['#ffb547', '#ff6f61'], movie: { with_genres: '16,10751' }, tv: { with_genres: 10762 } },
        { key: 'action', genre: 28, colors: ['#ff6a3d', '#9b1d20'], movie: { with_genres: 28 }, tv: { with_genres: 10759 } },
        { key: 'comedy', genre: 35, colors: ['#ffd23f', '#f77f00'], movie: { with_genres: 35 }, tv: { with_genres: 35 } },
        { key: 'drama', genre: 18, colors: ['#5e60ce', '#1e1b4b'], movie: { with_genres: 18 }, tv: { with_genres: 18 } },
        { key: 'scifi', genre: 878, colors: ['#00c2ff', '#1d3a8a'], movie: { with_genres: 878 }, tv: { with_genres: 10765 } },
        { key: 'horror', genre: 27, colors: ['#8b0000', '#140303'], movie: { with_genres: 27 } },
        { key: 'thriller', genre: 53, colors: ['#4b5563', '#0f172a'], movie: { with_genres: 53 }, tv: { with_genres: 9648 } },
        { key: 'crime', genre: 80, colors: ['#b45309', '#1c1917'], movie: { with_genres: 80 }, tv: { with_genres: 80 } },
        { key: 'romance', genre: 10749, colors: ['#ff7aa8', '#9d174d'], movie: { with_genres: 10749 } },
        { key: 'documentary', genre: 99, colors: ['#22c55e', '#14532d'], movie: { with_genres: 99 }, tv: { with_genres: 99 } },
        { key: 'reality', genre: 10764, colors: ['#f472b6', '#6d28d9'], tv: { with_genres: 10764 } }
    ];

    // Kid-safe YouTube channels read through their public RSS feeds, by UI language.
    var KIDS_CHANNELS = {
        pt: [
            { id: 'UCBAb_DK4GYZqZR9MFA7y2Xg', name: 'Galinha Pintadinha' },
            { id: 'UC0cGVh96osM7yqMu0ENSKKQ', name: 'Mundo Bita' },
            { id: 'UCV4XcEqBswMCryorV_gNENw', name: 'Turma da Mônica' },
            { id: 'UCGs6qb1ohFhDzeHbYeJlsAA', name: 'Palavra Cantada' },
            { id: 'UCZcsG6kUpOLQZZpTMSAernw', name: 'Bob Zoom' }
        ],
        en: [
            { id: 'UCVzLLZkDuFGAE2BGdBuBNBg', name: 'Bluey' },
            { id: 'UCbCmjCuTUZos6Inko4u57UQ', name: 'Cocomelon' },
            { id: 'UCoookXUzPciGrEZEXmh4Jjg', name: 'Sesame Street' },
            { id: 'UCLsooMJoIpl_7ux2jvdPB-Q', name: 'Super Simple Songs' },
            { id: 'UCrNnk0wFBnCS1awGjq_ijGQ', name: 'PBS KIDS' }
        ],
        es: [
            { id: 'UCBErs5AlvBpzKfVRNj9ogAQ', name: 'Peppa Pig Español' },
            { id: 'UCYvpkMpzo1S_rmcj2Axmbig', name: 'Bluey Español' },
            { id: 'UCLsooMJoIpl_7ux2jvdPB-Q', name: 'Super Simple Songs' }
        ]
    };

    function deviceArt(name) {
        return '<svg class="device-art" viewBox="0 0 64 64" aria-hidden="true">' + DEVICE_ART[name] + '</svg>';
    }

    return {
        APPS: APPS,
        HDMI: HDMI,
        DEFAULT_FAVORITES: DEFAULT_FAVORITES,
        DEVICES: DEVICES,
        PROVIDER_APPS: PROVIDER_APPS,
        NEWS_FEEDS: NEWS_FEEDS,
        CATEGORIES: CATEGORIES,
        KIDS_CHANNELS: KIDS_CHANNELS,
        MAX_FAVORITES: 10,
        deviceArt: deviceArt,
        known: function(id) { return U.find(APPS, function(a) { return a.id === id; }); }
    };
})();
