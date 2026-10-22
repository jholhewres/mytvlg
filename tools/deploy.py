#!/usr/bin/env python3
"""Pair with, install on and control an LG TV in Developer Mode.

Usage:
  python3 tools/deploy.py pair      --host 192.168.0.10   # fetch and decrypt the Dev Mode SSH key
  python3 tools/deploy.py install   --host 192.168.0.10   # build, upload, install and launch
  python3 tools/deploy.py install   --host 192.168.0.10 --auto-renew   # app keeps Developer Mode alive
  python3 tools/deploy.py launch    --host 192.168.0.10
  python3 tools/deploy.py uninstall --host 192.168.0.10
  python3 tools/deploy.py renew     --host 192.168.0.10   # extend the Developer Mode session

The host can also come from MYTVLG_TV_HOST. Needs ssh, scp and openssl on PATH.
"""
import argparse
import getpass
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import package  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SSH_PORT = "9922"
KEY_SERVER_PORT = "9991"
REMOTE_IPK = "/media/developer/temp/mytvlg.ipk"
KNOWN_HOSTS = os.path.expanduser("~/.ssh/known_hosts_webos")


def key_path(host):
    return os.path.expanduser(f"~/.ssh/webos_tv_{host}")


def ssh_opts(host):
    return [
        "-o", f"UserKnownHostsFile={KNOWN_HOSTS}",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "HostKeyAlgorithms=+ssh-rsa",
        "-o", "PubkeyAcceptedKeyTypes=+ssh-rsa",
        "-o", "ConnectTimeout=8",
        "-i", key_path(host),
    ]


def run_remote(host, command):
    # luna-send-pub prints nothing without a TTY; some sshd builds refuse one, so retry without.
    base = ["ssh", *ssh_opts(host), "-p", SSH_PORT, f"prisoner@{host}", command]
    res = subprocess.run([base[0], "-tt", *base[1:]], capture_output=True, text=True)
    if "PTY allocation request failed" in (res.stderr or ""):
        res = subprocess.run(base, capture_output=True, text=True)
    return res


def luna(host, uri, payload, replies=1, seconds=None):
    cmd = f"luna-send-pub -n {replies} {uri} '{json.dumps(payload)}'"
    if seconds:
        # BusyBox timeout takes -t on older firmware; GNU timeout does not.
        cmd = f"if timeout -t 1 true 2>/dev/null; then T='timeout -t {seconds}'; else T='timeout {seconds}'; fi; $T {cmd}"
    return run_remote(host, cmd)


def pair(host):
    passphrase = getpass.getpass("Passphrase shown in the Developer Mode app: ").strip()
    url = f"http://{host}:{KEY_SERVER_PORT}/webos_rsa"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            key_data = resp.read()
    except OSError as e:
        sys.exit(f"Could not fetch the key from {url} ({e}). Is Key Server ON?")
    path = key_path(host)
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "wb") as f:
        f.write(key_data)
    # The passphrase goes through stdin, never argv (visible in ps).
    out = tmp + ".dec"
    res = None
    for extra in (["-traditional"], []):
        res = subprocess.run(["openssl", "rsa", *extra, "-in", tmp, "-out", out, "-passin", "stdin"],
                             input=passphrase + "\n", capture_output=True, text=True)
        if res.returncode == 0:
            break
    os.unlink(tmp)
    if res.returncode != 0:
        if os.path.exists(out):
            os.unlink(out)
        sys.exit("Could not decrypt the key: check the passphrase.")
    tmp = out
    os.replace(tmp, path)
    os.chmod(path, 0o600)
    print(f"Key saved to {path}")


def require_key(host):
    if not os.path.isfile(key_path(host)):
        sys.exit(f"No key for {host}. Run: python3 tools/deploy.py pair --host {host}")


def app_id():
    with open(os.path.join(ROOT, "app", "appinfo.json"), encoding="utf-8") as f:
        return json.load(f)["id"]


def launch(host):
    res = luna(host, "luna://com.webos.applicationManager/launch", {"id": app_id()})
    if '"returnValue":true' not in res.stdout:
        sys.exit(f"Launch failed:\n{res.stdout}{res.stderr}")
    print("Launched.")


def read_devmode_token(host):
    token = (run_remote(host, "cat /var/luna/preferences/devmode_enabled").stdout or "").strip()
    if not token:
        sys.exit("Could not read the Developer Mode session token.")
    return token


def install(host, auto_renew=False):
    if auto_renew:
        # The token goes only into this package (built in a temp dir), never into app/ or dist/.
        extra = {"devmode.json": json.dumps({"token": read_devmode_token(host)}).encode()}
        out_dir = tempfile.mkdtemp(prefix="mytvlg-")
        ipk = package.build(os.path.join(ROOT, "app"), out_dir, extra)
        print("Built package with Developer Mode auto-renewal")
    else:
        out_dir = None
        ipk = package.build(os.path.join(ROOT, "app"), os.path.join(ROOT, "dist"))
        print(f"Built {ipk}")
    try:
        upload_and_install(host, ipk)
    finally:
        if out_dir:
            shutil.rmtree(out_dir, ignore_errors=True)


def upload_and_install(host, ipk):
    scp = ["scp", *ssh_opts(host), "-P", SSH_PORT, ipk, f"prisoner@{host}:{REMOTE_IPK}"]
    if subprocess.run(scp).returncode != 0:
        sys.exit("Upload failed.")
    payload = {"id": app_id(), "ipkUrl": REMOTE_IPK, "subscribe": True}
    res = luna(host, "luna://com.webos.appInstallService/dev/install", payload, replies=40, seconds=60)
    run_remote(host, f"rm -f {REMOTE_IPK}")
    if '"state":"installed"' not in res.stdout:
        sys.exit(f"Install did not finish:\n{res.stdout}{res.stderr}")
    print("Installed.")
    launch(host)


def uninstall(host):
    payload = {"id": app_id(), "subscribe": True}
    res = luna(host, "luna://com.webos.appInstallService/dev/remove", payload, replies=10, seconds=30)
    if '"returnValue":false' in res.stdout or '"returnValue":true' not in res.stdout:
        sys.exit(f"Uninstall did not finish:\n{res.stdout}{res.stderr}")
    print("Removed.")


def renew(host):
    # Same endpoint the Developer Mode app's "Extend" button uses; the token never leaves memory.
    token = read_devmode_token(host)
    url = "https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=" + urllib.parse.quote(token, safe="")
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = resp.read().decode("utf-8", "replace")
    except OSError as e:
        sys.exit(f"Renewal request failed: {e}")
    if '"result":"success"' not in body.replace(" ", ""):
        sys.exit("LG did not confirm the renewal.")
    print("Developer Mode session extended.")


def main():
    parser = argparse.ArgumentParser(description="Deploy MyTVLG to an LG TV in Developer Mode.")
    parser.add_argument("command", choices=("pair", "install", "launch", "uninstall", "renew"))
    parser.add_argument("--host", default=os.environ.get("MYTVLG_TV_HOST"))
    parser.add_argument("--auto-renew", action="store_true",
                        help="let the app extend the Developer Mode session by itself (stores the session token on the TV)")
    args = parser.parse_args()
    if not args.host:
        parser.error("--host or MYTVLG_TV_HOST is required")
    if args.command == "pair":
        pair(args.host)
        return
    require_key(args.host)
    if args.command == "install":
        install(args.host, args.auto_renew)
        return
    {"launch": launch, "uninstall": uninstall, "renew": renew}[args.command](args.host)


if __name__ == "__main__":
    main()
