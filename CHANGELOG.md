# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-22

### Added
- New home screen design: hero with backdrops, app tiles, media rows, weather sheet, screensaver.
- App and HDMI discovery through the TV's SSAP API after a one-time pairing.
- Releases, trending series, anime, kids, recommendations and categories from TMDB.
- Search and explore screen with filters; hidden streaming services; IMDb ratings via OMDb.
- RSS news row, localization (en, pt, es), settings for region, units, clock, screensaver and FPS meter.
- Seasons/episodes tracking, watched and My list (color keys), continue watching, weekend picks, title details with every service.
- Kids zone, category highlights slideshow, IPTV mode (M3U/Xtream) with built-in player.
- Developer Mode session renewal (`deploy.py renew`, `install --auto-renew`).
- Standard-library `.ipk` packager (`tools/package.py`) and TV deploy CLI (`tools/deploy.py`).
- Open-source project files, CI and release workflow.

### Changed
- Forked from FreeMyTvWebOS 1.2.2 under a new app ID (`io.github.jholhewres.mytvlg`).

[Unreleased]: https://github.com/jholhewres/mytvlg/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jholhewres/mytvlg/releases/tag/v0.1.0
