# Development

**Português:** [../pt-BR/desenvolvimento.md](../pt-BR/desenvolvimento.md)

The app is plain HTML, CSS and JavaScript in `app/`, with no build step and no dependencies.

```
app/
  index.html          markup
  css/app.css         styles
  js/i18n.js          translations (en, pt, es)
  js/util.js          helpers and localStorage
  js/catalog.js       known apps, devices, categories, feeds
  js/tv.js            Luna calls and the SSAP (LG remote) API
  js/services.js      weather, TMDB, TVMaze, news, Kids videos, IPTV
  js/nav.js           D-pad focus helpers
  js/main.js          screens, navigation and settings
tools/
  package.py          builds dist/<id>_<version>_all.ipk (standard library only)
  deploy.py           pair, install, launch, uninstall, renew
```

## Target

webOS 5+ (Chromium 68+). Write ES5-style JavaScript and avoid newer syntax and APIs (optional chaining,
`??`, `Array.prototype.flat`, flexbox `gap`, `clamp()`, `aspect-ratio`) or provide a fallback.

## Run in a browser

```bash
python3 -m http.server 8000 -d app
```

Open <http://localhost:8000>. Launching apps, the TV connection and some feeds (CORS) only work on the TV.

## Build and install

```bash
python3 tools/package.py                                  # dist/*.ipk
python3 tools/deploy.py install --host <TV_IP>            # build + install + open
python3 tools/deploy.py launch --host <TV_IP>
```

## Debug on the TV

Apps installed in Developer Mode expose the Chrome DevTools protocol on port 9998:
open `http://<TV_IP>:9998` in Chrome to inspect the page, read the console or take screenshots.

## Releases

1. Bump `version` in `app/appinfo.json` and update `CHANGELOG.md`.
2. Push a `vX.Y.Z` tag. CI builds the `.ipk` and attaches it to the GitHub release.
