# Security Policy

## Supported versions

Only the latest release gets security fixes. Update to the newest version before
reporting an issue.

| Version | Supported |
| ------- | --------- |
| 1.4.x   | yes       |
| < 1.4   | no        |

## Reporting a vulnerability

Report security issues privately — not in public issues or pull requests.

Use GitHub's private vulnerability reporting: open the **Security** tab of this
repository and click **Report a vulnerability**. If that option isn't available,
open a normal issue asking for a private contact channel, without any exploit
details.

Please include:

- the affected version and your OS,
- steps to reproduce or a proof of concept,
- the impact you observed.

This is a small project maintained in spare time, so responses and fixes are
best-effort. Please give a reasonable window before any public disclosure.

## How Tiddlui handles credentials

- Login uses Tidal's device authorization flow — you sign in on Tidal's own
  site. The app never sees or stores your Tidal password.
- Access and refresh tokens are kept in the operating system keychain (Windows
  Credential Manager via `keyring`), never in plaintext files.
- The app ships with no accounts, keys, or secrets. It talks only to Tidal's
  APIs, plus a one-time ffmpeg download on first launch.
- Signing out deletes the stored tokens.

## Scope

Tiddlui is a desktop client for your own Tidal account. Issues with Tidal's
services belong to Tidal. In scope here: local credential handling, the bundled
Python engine, the build/release pipeline, and the app's own network requests.
