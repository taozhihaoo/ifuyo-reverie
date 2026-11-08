# Security Policy

Reverie stores a person's entire reading archive on their own disk, so we treat every
piece of external content — HTML, RSS, EPUB, PDF, and anything a browser extension sends us —
as untrusted input. This document explains how to report a problem and what we consider in scope.

---

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | ✅ Security fixes |
| < 1.0 (M0–M12 development builds) | ❌ |

Only the latest 1.0.x build receives security updates. Development builds are for testing and
should not hold a library you care about.

## Reporting a vulnerability

**Please do not open a public issue, pull request, or discussion for a security problem.**

1. Use **GitHub Security Advisories** → *Security* → *Report a vulnerability* on this repository
   (private, visible only to maintainers). If advisories are unavailable, contact a maintainer
   directly and ask for a private channel before sharing details.
2. Include: affected version and platform, a minimal reproduction, the impact you observed, and
   any suggested fix.
3. We will acknowledge receipt, confirm the affected scope, and keep you updated until a fix ships.
   Please give us a reasonable window to release a patch before any public disclosure.
4. Credit is offered in the release notes unless you prefer to stay anonymous.

## In scope

- **Content sanitization** — HTML/RSS/EPUB content escaping the sanitizer, executing script,
  loading remote resources, or escaping the reader's sandbox.
- **Renderer isolation** — breaking out of `contextIsolation`, the sandboxed renderer, or the
  Content-Security-Policy (`default-src 'none'`, `script-src 'self'`).
- **Navigation & URL handling** — `javascript:` / `data:` / `file:` URLs reaching a privileged
  context, or the reader navigating away from local content.
- **Path handling** — path traversal, symlink tricks, or writing/overwriting files outside the
  library, export directory, or temp directory.
- **Archive handling** — zip-slip, compression bombs, or directory escape through EPUB/ZIP import.
- **Native messaging** — spoofing the browser origin, injecting messages, or causing command
  execution through the capture host.
- **Data integrity** — silent deletion or corruption of user library files.
- **Privacy** — any telemetry, network request, or log line that leaks page content, highlight
  text, or full URLs (including query strings).

## Out of scope

- Attacks that require an attacker to already control the user's OS account or the library folder.
- DRM circumvention, paywall bypass, or any request to weaken access controls — these are
  explicitly not features of Reverie.
- Vulnerabilities in Chromium/Electron itself; please report those upstream. We still want to know
  if the way Reverie uses them makes an upstream issue exploitable.
- Denial of service through deliberately enormous personal libraries on the user's own machine.
- Social engineering, or physical access to an unlocked device.

## Security design at a glance

| Area | Approach |
| --- | --- |
| Untrusted HTML | DOMPurify allow-list with forbidden tags/attributes; remote resources blocked |
| Renderer | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP |
| Navigation | External links leave for the system browser; the window never navigates |
| URLs | `http:` / `https:` / `mailto:` only; private/loopback hosts refused by default |
| Archives | Entry-name validation, resolved-path containment, count/size/ratio limits |
| Files | Atomic writes (tmp → fsync → rename); the index is disposable and rebuildable |
| Capture host | Fixed extension origin, versioned protocol, size limits, no shell interpolation |
| Privacy | No accounts, no telemetry, no cloud dependency; logs carry IDs and origins only |

The detailed threat model and per-subsystem rules live in [`docs/SECURITY.md`](docs/SECURITY.md).

## Safe harbor

We will not pursue or support legal action against researchers who act in good faith: test only
against your own installation and your own library, avoid privacy violations and data destruction,
and give us a chance to fix the issue before publishing.

## Third-party components

Dependency licenses and distribution notes are audited in [`THIRD_PARTY.md`](THIRD_PARTY.md).
Vendored components (PDF.js, foliate-js, DOMPurify, Readability) keep their upstream licenses under
`app/vendor/`.
