# Security Policy

## Reporting a vulnerability

Please use GitHub's private **Report a vulnerability** form in this repository's Security tab.
Do not open a public issue for a suspected vulnerability and do not include credentials, OAuth
tokens, personal paths, save data or log archives in a report.

Include the affected version, your Windows version or Linux distribution, short reproduction steps and
the expected security impact. A minimal synthetic example is better than user data.

## Update integrity

The auto-updater installs only a release signed by the project's own certificate, checked by
thumbprint, not by name (`CN=Shirow` alone proves nothing, since anyone can create one). A pinned
offline standby certificate lets the release certificate be rotated without stranding installed
clients. If both were lost, every client would stay on its current version until a manual download. An
unsigned installer, or one signed by any other certificate, is refused.

## Supported versions

| Version | Supported |
| --- | --- |
| Current 3.x release | Yes |
| Older releases | No |

Non-security bugs, feature requests and support questions belong in the existing public issue
templates.
