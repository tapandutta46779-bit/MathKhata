# Security and licensing review — 6 September 2026

## Delivered

- Added the standard MIT license for original source and package metadata, a public LICENSE.txt, About links, and build-generated third-party notices. Dependencies, fonts, and downloaded models retain their own licenses.
- AION checks request origin and JSON content type, bounds actual streamed request bytes (not merely Content-Length), retains prompt/token limits, explicitly rejects unsupported methods, and returns no-store and restrictive response headers. Provider errors remain sanitized.
- Offline cache excludes API routes and respects private/no-store responses. Cache version advances to discard old cached API responses; it does not delete notebook IndexedDB data.
- Imports reject excessive nesting/node counts, cyclic inputs, dangerous prototype property names, and files over 64 MB before reading them. Existing schema validation and migration remain in place.
- Added HTTPS strict transport policy without broad preload/subdomain changes.
- Updated compatible transitive dependencies: fast-uri, nanoid, and @xmldom/xmldom.
- Enabled and verified GitHub private vulnerability reporting; replaced the placeholder reporting policy.

## Verification

- Typecheck, ESLint, production web build: passed.
- Unit/regression tests: 387 passed, including 11 new adversarial security tests covering AION, imports, and service worker behavior.
- Chrome browser regression tests: 17 passed, including editing, saved-data preservation, research, PDF export, responsive layouts, and current-page AION context.
- Production dependency audit: zero known npm advisories at review time.
- Full dependency audit improved from 26 affected packages to 23. Remaining findings propagate from the two desktop-only dependencies below.
- Read-only tracked Git-history scan for private-key blocks, AWS access keys, GitHub tokens, and OpenAI project keys: no matches. This heuristic scan does not prove absence of every credential type.
- Existing desktop IPC and provider tests ran in the unit suite. No native application rebuild, installation, or native binary penetration test was performed.

## Remaining limitations and release boundaries

- Desktop packaging depends on unpatched extract-zip 2.0.1 ([path traversal advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)) and image-size 0.7.5 ([ICNS parser advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)). Compatible published fixes were unavailable at review time; forced major downgrades were not applied. These tools are not shipped in the public web bundle. Do not build desktop distributions using untrusted archives or icon files; reassess the packaging chain before another native release.
- AION is intentionally public. Origin checks prevent browser cross-site use, not direct scripted abuse; global rate limiting and an independently reviewed quota/abuse policy remain recommended. No paid infrastructure was provisioned and no load test was run against the public service.
- This is a source/dependency and automated regression review, not an independent penetration test or a guarantee of security. Browser tests in this run used Chrome, not a new Safari/native-device matrix.
- The existing local GitHub Actions workflow cannot be pushed with the current OAuth credential because it lacks workflow scope. Source fixes can be published without that workflow; CI activation still requires a suitably authorized credential.
- Generated dependency notices are based on installed production packages. AI model license/usage terms must additionally be checked when selecting a model; MIT does not grant rights to third-party model weights or trademarks.

No existing notebook content was intentionally changed. User screenshot changes are excluded from this release.
