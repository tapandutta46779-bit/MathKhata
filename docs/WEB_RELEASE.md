# Math Notebook web release

## Public beta

- Public URL: <https://mathkhata.pages.dev>
- Cloudflare Pages project: `mathkhata`
- Production branch: `main`
- Source backup: private GitHub repository `tapandutta46779-bit/MathKhata`
- Public feedback: <https://github.com/tapandutta46779-bit/MathKhata-Feedback/issues/new>

The website is a static, local-first PWA on the Cloudflare Pages free tier. No domain, hosted API, database, or paid service is required.

## Build and deploy

From the repository root:

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run deploy:web
```

`npm run build` produces the web-only `dist/` artifact. It excludes the packaged desktop Whisper runtime while retaining Web Speech support where the browser exposes it. `npm run deploy:web` rebuilds and deploys `dist/` to the existing `mathkhata` Pages project. Wrangler credentials remain in its normal OS-backed credential store and are never written to this repository.

## Redeployment and rollback

List deployments with:

```sh
npx wrangler pages deployment list --project-name=mathkhata
```

To restore an earlier release, check out the desired trusted Git commit, run the full quality gate, then run `npm run deploy:web`. This creates a new production deployment from that known source without deleting Git history or notebook backups. Cloudflare's deployment history also remains available in the Pages dashboard.

## Web and desktop boundaries

- Notebook editing, IndexedDB persistence, JSON import/export, deterministic speech parsing, checked local mathematics, MathLive, the floating calculator, and browser-compatible research tools run on the website.
- Browser voice input uses Web Speech only when the browser genuinely exposes it. The browser vendor may process recognition remotely; denial or unavailability creates no transcript.
- The packaged desktop app's local Whisper model, Electron IPC, native filesystem/printing integration, and local Ollama bridge are not shipped in the public web bundle.
- AION is available through a same-site Cloudflare Pages Function. It receives the current page context only when the user explicitly sends a question; notebook storage remains local. The checked solver and page outline continue working if the free daily AI allowance is unavailable.
- The future original non-LLM AION reasoning architecture is not implemented in this beta.

## Known limitations

- Browser data can be lost when site storage is cleared; export important notebooks.
- Browser speech support and accuracy vary by browser, operating system, permission, network, and vendor service.
- The research workspace provides substantial interactive 2D, 3D, Geometry, and Scientific functions but does not claim complete Desmos parity.
- The initial JavaScript bundle is approximately 1.4 MB before compression; further code splitting is a post-beta optimization.
- Desktop installers/signing and app-store distribution are outside this web release.

See [PRIVACY.md](PRIVACY.md) and the deployed [privacy page](https://mathkhata.pages.dev/privacy) for the data-flow statement.
