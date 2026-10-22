#!/usr/bin/env python3
"""Package app/ into a webOS .ipk (same layout as ares-package), standard library only.

Usage: python3 tools/package.py [--app-dir app] [--out-dir dist]
Honors SOURCE_DATE_EPOCH for reproducible builds.
"""
import argparse
import io
import json
import os
import sys
import tarfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED_KEYS = ("id", "version", "type", "main", "title", "icon")


def load_appinfo(app_dir):
    with open(os.path.join(app_dir, "appinfo.json"), encoding="utf-8") as f:
        info = json.load(f)
    missing = [k for k in REQUIRED_KEYS if k not in info]
    if missing:
        sys.exit(f"appinfo.json is missing: {', '.join(missing)}")
    if not os.path.isfile(os.path.join(app_dir, info["main"])):
        sys.exit(f"main entry not found: {info['main']}")
    return info


def build(app_dir, out_dir, extra_files=None):
    """extra_files: {relative path: bytes} added to the app without touching app_dir."""
    info = load_appinfo(app_dir)
    app_id, version = info["id"], info["version"]
    mtime = int(os.environ.get("SOURCE_DATE_EPOCH", time.time()))

    def add_file(tar, name, data):
        ti = tarfile.TarInfo(name)
        ti.size, ti.mode, ti.mtime = len(data), 0o644, mtime
        tar.addfile(ti, io.BytesIO(data))

    def add_dir(tar, name):
        ti = tarfile.TarInfo(name)
        ti.type, ti.mode, ti.mtime = tarfile.DIRTYPE, 0o755, mtime
        tar.addfile(ti)

    data_buf, installed_size = io.BytesIO(), 0
    with tarfile.open(fileobj=data_buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tar:
        base = f"./usr/palm/applications/{app_id}"
        for d in ("./usr", "./usr/palm", "./usr/palm/applications", base):
            add_dir(tar, d)
        for root, dirs, files in os.walk(app_dir):
            dirs.sort()
            rel = os.path.relpath(root, app_dir)
            if rel != ".":
                add_dir(tar, f"{base}/{rel.replace(os.sep, '/')}")
            for name in sorted(files):
                if rel == "." and name == "devmode.json":
                    continue  # session token: only ever added through extra_files
                path = os.path.join(root, name)
                with open(path, "rb") as f:
                    data = f.read()
                installed_size += len(data)
                add_file(tar, f"{base}/{os.path.relpath(path, app_dir).replace(os.sep, '/')}", data)
        for rel, data in sorted((extra_files or {}).items()):
            installed_size += len(data)
            add_file(tar, f"{base}/{rel}", data)
        pkg_dir = f"./usr/palm/packages/{app_id}"
        add_dir(tar, "./usr/palm/packages")
        add_dir(tar, pkg_dir)
        packageinfo = json.dumps({"id": app_id, "version": version, "app": app_id}, indent=2)
        add_file(tar, f"{pkg_dir}/packageinfo.json", packageinfo.encode())

    control = (
        f"Package: {app_id}\nVersion: {version}\nSection: misc\nPriority: optional\n"
        f"Architecture: all\nInstalled-Size: {installed_size}\n"
        f"Maintainer: {info.get('vendor', 'N/A')}\n"
        f"Description: {info['title']}\n"
        "webOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n"
    ).encode()
    control_buf = io.BytesIO()
    with tarfile.open(fileobj=control_buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_file(tar, "./control", control)

    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{app_id}_{version}_all.ipk")
    members = (
        ("debian-binary", b"2.0\n"),
        ("control.tar.gz", control_buf.getvalue()),
        ("data.tar.gz", data_buf.getvalue()),
    )
    with open(out, "wb") as f:
        f.write(b"!<arch>\n")
        for name, data in members:
            f.write(f"{name:<16}{mtime:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode())
            f.write(data)
            if len(data) % 2:
                f.write(b"\n")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--app-dir", default=os.path.join(ROOT, "app"))
    parser.add_argument("--out-dir", default=os.path.join(ROOT, "dist"))
    args = parser.parse_args()
    print(build(args.app_dir, args.out_dir))


if __name__ == "__main__":
    main()
