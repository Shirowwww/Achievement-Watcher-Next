# Security Policy

## Reporting a vulnerability

Please use GitHub's private **Report a vulnerability** form in this repository's Security tab.
Do not open a public issue for a suspected vulnerability and do not include credentials, OAuth
tokens, personal paths, save data or log archives in a report.

Include the affected version, Windows version, concise reproduction steps and the expected security
impact. A minimal synthetic example is preferred over user data.

## Update integrity

The auto-updater only installs a release signed by the project's own certificate, checked by
thumbprint rather than by name (`CN=Shirow` alone proves nothing, since anyone can create one). A
pinned offline standby certificate exists so the release certificate can be rotated without
stranding installed clients; losing both would strand every client on its current version until a
manual download. An unsigned installer, or one signed by any other certificate, is refused.

## Supported versions

| Version | Supported |
| --- | --- |
| Current 3.x release | Yes |
| Older releases | No |

Non-security bugs, feature requests and support questions belong in the existing public issue
templates.
