# MathKhata public beta release verification

- Verification time (UTC): `2026-08-11T13:01:24Z`
- Initial deployed application commit: `45514e9f88b4a1bf9483c287767f853456a4535c`
- Public URL: <https://mathkhata.pages.dev>
- Cloudflare project: `mathkhata`
- Browser: Google Chrome through the Codex in-app browser, clean public origin

## Quality gate

- `npm install`: passed; production dependency audit reports 0 known vulnerabilities.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 346 tests in 17 files.
- `npm run test:e2e`: passed, 13 tests in real Chrome.
- `npm run build`: passed; web output is 2.7 MB total, with no source maps and without the 23 MB desktop Whisper/WASM runtime.
- Full development-dependency audit: 4 high-severity advisories remain in the macOS DMG packaging toolchain, with no upstream fix reported. They are development-only, do not enter `dist/`, and do not affect the public web runtime.

## Public HTTPS smoke test

- Canonical root returned HTTP 200 over HTTPS with the intended CSP, permissions, frame, referrer, and content-type protections.
- JavaScript, CSS, MathLive runtime, KaTeX font, icon, manifest, service worker, privacy page, and feedback page resolved successfully.
- A clean public origin loaded the notebook, created separate text and structured math lines, autosaved, added a page, exercised undo/redo, reloaded, and restored both notebook content and page count from IndexedDB.
- Structured MathLive access inserted a root, definite integral, 2 by 2 matrix, and fraction template; the full Symbols categories, virtual keyboard, and MathLive menu remained available.
- The floating calculator evaluated `6*4` as `24`; the checked local symbolic solver solved `x^2=4`.
- JSON export reported successful creation. A valid structured JSON file imported as a separately validated local notebook.
- 2D Graph, 3D Surface, Geometry, and Scientific workspaces opened and rendered in the deployed app.
- At 720 by 600, the root document width equalled the viewport, horizontal scroll remained zero, and the page-assistant close control remained inside the viewport.
- The public Page assistant kept deterministic grouping active and explicitly reported Local Qwen as unavailable without sending notebook content to an AI service.
- Browser speech made a genuine recognition attempt; permission denial produced `not-allowed` and no fabricated transcript.
- The About dialog showed version `1.0.0-beta.1`, local storage, no telemetry, the privacy link, and the public issue link.
- Browser console errors/warnings after the smoke workflow: none.

## Security and privacy verification

- Tracked/untracked source and the production bundle were scanned for common API keys, GitHub/Cloudflare tokens, private keys, authorization headers, passwords, environment files, absolute personal filesystem paths, private Google Drive paths, and notebook exports.
- No credentials, private notebook data, source maps, or personal filesystem paths were found in `dist/`.
- The account-specific Google Drive mount was removed from documentation while automatic wildcard-based Drive discovery and backup scripts were preserved.
- The production CSP permits only same-origin network connections. The built JavaScript contains no Ollama/localhost endpoint.
- No application analytics or individual tracking was added.

## Known limitations

1. Web Speech behavior is browser/vendor dependent and may require an online browser speech service.
2. Local Qwen, desktop Whisper, and Electron-only capabilities are not available on the hosted website; deterministic fallbacks remain usable.
3. Research graphing and geometry are advanced beta features but do not claim complete Desmos parity.
4. Production code splitting can be improved after beta; current assets load successfully and the desktop model runtime is excluded.
