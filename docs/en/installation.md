# Installation

**Português:** [../pt-BR/instalacao.md](../pt-BR/instalacao.md)

## Requirements

- An LG TV with webOS 5 or newer (tested on webOS 6 / TV Lite 6.5).
- A computer on the same network with Python 3.9+, `ssh`, `scp` and `openssl`.
- A free [LG Developer account](https://webostv.developer.lge.com).

## 1. Enable Developer Mode on the TV

1. Install **Developer Mode** from the LG Content Store and sign in with your LG Developer account.
2. Turn **Dev Mode Status** on and let the TV restart.
3. Open Developer Mode again and turn **Key Server** on. Note the **IP address** and the **passphrase**.

## 2. Install

```bash
git clone https://github.com/jholhewres/mytvlg.git
cd mytvlg
python3 tools/deploy.py pair --host <TV_IP>                   # asks for the passphrase
python3 tools/deploy.py install --host <TV_IP> --auto-renew   # builds, installs and opens the app
```

You can export `MYTVLG_TV_HOST=<TV_IP>` instead of passing `--host`.

To install without the command line, build the package (`python3 tools/package.py`) and install
`dist/*.ipk` with [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop).

## Keep it installed

Developer Mode sessions expire and the TV then removes apps installed through it.

- `--auto-renew` stores the session token inside the installed package only, and the app extends the
  session by itself once a day while it is used. The token never goes into the repository or `dist/`.
- `python3 tools/deploy.py renew --host <TV_IP>` extends it once by hand (you can schedule it with cron).

## Open it quickly

webOS does not let unrooted apps start at power-on or replace the Home button. Two shortcuts:

- Inside MyTVLG, **hold a number key** (for example `1`) on the remote and assign MyTVLG to it.
- In the TV's Home, edit the app list and move MyTVLG to the first position.

With **Quick Start+** enabled, the TV usually returns to the app that was open when it was turned off.

## First run

- Accept the connection request the TV shows: it lets MyTVLG list every installed app and HDMI input.
- Open **Settings** (gear icon) and paste a free [TMDB API key](https://www.themoviedb.org/settings/api)
  to enable releases, recommendations, search and where to watch.

## Uninstall

```bash
python3 tools/deploy.py uninstall --host <TV_IP>
```
