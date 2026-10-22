# Security Policy

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/jholhewres/mytvlg/security/advisories/new),
not in public issues. We aim to reply within a week.

Supported version: the latest release. Reports in Portuguese are welcome.

Notes for users:

- `tools/deploy.py pair` stores the Developer Mode SSH key unencrypted at `~/.ssh/webos_tv_<host>`
  (mode 600). Delete it if you stop developing for that TV.
- `install --auto-renew` stores the Developer Mode session token inside the package installed on the TV.
- API keys and IPTV credentials are kept in the TV's local storage only.
- Developer Mode exposes SSH on port 9922 to your local network. Turn it off when you no longer need it.
