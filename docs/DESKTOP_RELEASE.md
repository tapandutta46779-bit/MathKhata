# MathKhata desktop release

MathKhata 1.0 has a secure Electron desktop shell and native package definitions for macOS, Windows, and Linux. The packaged notebook is fully local and does not need the Vite development server or an internet connection.

## Build targets

| Operating system | Command | Release output |
| --- | --- | --- |
| macOS Apple Silicon | `npm run desktop:make:mac` | signed/notarized DMG and ZIP when Apple credentials are configured |
| Windows x64 | `npm run desktop:make:win` | Squirrel Setup executable |
| Linux x64 | `npm run desktop:make:linux` | DEB and RPM packages |

Build each public installer on its target operating system. Cross-building may create an artifact, but it does not replace native launch testing, accessibility testing, signing, or malware scanning.

## Release verification

Run this gate from a clean checkout:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm audit --omit=dev
npm run desktop:make
```

Then install the artifact on a clean user account and verify:

1. Create, rename, save, reopen, export, import, print, and recover a notebook.
2. Use Text, Math, Voice, Symbols, the MathLive virtual keyboard and context menus.
3. Solve supported arithmetic, equations, determinants, derivatives, and integrals without AION.
4. Open AION with the local service available and unavailable; both states must be honest and the notebook must remain usable.
5. Exercise 2D, 3D, Geometry, Scientific, and floating calculator workspaces with mouse, trackpad, keyboard, and window resizing.
6. Deny microphone permission, then grant it deliberately; no other permission should be requested.
7. Verify the app cannot navigate its main window to arbitrary web content and external HTTPS links open in the system browser.
8. Quit during an edit and confirm the last autosaved notebook is recovered.

## Signing and publication

The source cannot invent or embed publisher credentials. Before public publication:

- macOS: supply an Apple Developer ID Application certificate, sign the app, notarize it, and staple the notarization ticket. Electron documents signing/notarization as necessary to avoid Gatekeeper warnings.
- Windows: sign the installer with the publisher's code-signing certificate and timestamp it.
- Linux: publish checksums and sign the release metadata or package repository.
- Choose and add the publisher's distribution license/EULA, legal entity, support address, privacy URL, and public download/update location.

Unsigned local packages are suitable for internal testing, not a frictionless public download. Automatic updates are intentionally not pointed at a placeholder server; enable them only after a real signed release feed exists.

## Data locations and compatibility

Notebook documents remain versioned, validated data independent of Electron. IndexedDB is stored inside the standard Electron application-data directory:

- macOS: `~/Library/Application Support/MathKhata`
- Windows: `%APPDATA%/MathKhata`
- Linux: `~/.config/MathKhata`

The structured `.mathkhata.json` export is the portable backup and migration format. Import validates the complete document before it changes local state.

## Security posture

The desktop renderer loads only packaged `mathkhata://app` content in production. Node integration is disabled; context isolation, renderer sandboxing, web security, restrictive navigation, a CSP, ASAR integrity validation, and Electron fuses are enabled. The only privileged renderer bridge accepts fixed notebook commands and validated requests to the loopback AION service. It cannot request an arbitrary URL or arbitrary filesystem path.

Runtime production dependencies must report zero known vulnerabilities with `npm audit --omit=dev`. Installer tooling is kept outside the shipped renderer archive and must also be reviewed on each release.
