# MathKhata

MathKhata is a local-first mathematical notebook and research workspace for laptops. Its page is the interface: write structured mathematics and ordinary notes directly on ruled lines, then return later without losing layout or mathematical editability.

Version 1.0 public beta runs as an installable macOS, Windows, or Linux desktop application and as a browser/PWA build. It supports a physical keyboard, trackpad or mouse, and optional microphone access. It has no account, cloud database, telemetry, or API-key requirement. The desktop speech model is downloaded once on first use and cached locally; recorded audio is then transcribed on-device.

## Desktop application

The desktop build packages the complete notebook, MathLive keyboard and menus, Symbols, Voice, optional AION assistance, 2D/3D graphing, Geometry, Scientific workspace, and floating calculator. Notebook work, deterministic mathematics, and cached speech recognition work offline. The renderer is sandboxed and has no Node.js or unrestricted filesystem access.

```sh
npm install
npm run desktop:dev
npm run desktop:make:mac
```

Use `npm run desktop:make:win` on Windows and `npm run desktop:make:linux` on Linux. Native installers must be built and signed on their target operating systems before public publication. Complete release, signing, privacy, and verification guidance is in [docs/DESKTOP_RELEASE.md](docs/DESKTOP_RELEASE.md).

## Web development

Requires Node.js 20.19+ (verified with Node 24.18.0). From the repository root:

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) after `npm run dev`.

## Keyboard shortcuts

- `Command-Z` / `Ctrl-Z`: undo the last notebook action.
- `Command-Shift-Z` / `Ctrl-Shift-Z`: redo.
- `Command-S` / `Ctrl-S`: save immediately.
- `Escape`: stop editing, leave the active tool, or clear selection.
- `Delete` / `Backspace`: delete the selected object when its content editor is not active.
- `M`: activate Math insertion when focus is not in an editor.
- `T`: activate Text insertion when focus is not in an editor.
- `V`: open voice insertion when focus is not in an editor.
- `Command-D` / `Ctrl-D`: duplicate the selected page object when content editing is inactive.
- `Tab`: accept the quiet arithmetic result shown beside a complete numeric expression. Inside an incomplete fraction/root/template, Tab keeps its normal MathLive navigation behavior.

## Local calculation

Pure arithmetic is evaluated instantly and locally. For example, entering `6 × 4` shows `24` in a small right-side suggestion; click it or press Tab to place `=24` on the same line. No steps are added.

Integrals, higher/partial derivatives, limits, finite sums/products, variable equations, bounded nested integrals, double/triple antiderivatives, the classical Gaussian integral, numeric determinants, RREF matrices, gradients, and Laplacians show an optional local solve action. The symbolic engine is bundled with the app, loaded only after that action, and never sends the expression to a server. A reliable result can be added on the next ruled line; an unsupported form produces an explicit note instead of an invented answer.

Long expressions are kept as one structured MathLive expression but rendered through a genuine multiline environment. They continue onto later ruled lines, grow the page flow, and keep the on-screen keyboard/menu controls in reserved space instead of covering the notation.

## Whole-page assistant

The compact right-side Page assistant reads the complete current page through the read-only document-context boundary. It preserves ruled-line/spatial order, treats notes as context, proposes separate problems or equation systems, flags likely voice corruption, and lets the writer split, join, or confirm groups before solving. It is closed by default, remembers that choice across reloads, and never changes page content without an explicit action.

Deterministic page analysis remains the reliable foundation. In the packaged desktop app or local development, AION can optionally use the configured local model through Ollama. On the public website, AION uses a same-site Cloudflare Pages Function and Workers AI only after the user explicitly sends a question. Deterministic grouping and CAS remain independent verification layers, and notebook editing never depends on AI availability. Details are in [docs/LOCAL_MODEL_PATH.md](docs/LOCAL_MODEL_PATH.md) and [docs/PRIVACY.md](docs/PRIVACY.md).

## Data and backups

Notebook data is stored locally in IndexedDB and can be exported as validated, versioned JSON. See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for source-code backup and recovery.

To install the safe post-commit Google Drive backup and create a milestone snapshot:

```sh
./scripts/install-git-hooks.sh
./scripts/backup-to-drive.sh --snapshot
```

## Voice status

Chrome Web Speech support is used in Chrome when genuinely available. Electron does not reliably provide Chrome's hosted recognition service, so the desktop build records microphone PCM only after permission and runs a cached local Whisper speech model in a sandboxed worker. Its model files are downloaded from Hugging Face on first use; audio is not uploaded. Nothing is simulated. One utterance may contain both mathematics and ordinary language: “x equals six, then y equals eight” becomes two math lines, while an unfamiliar prose phrase remains text. “Then”, “next line”, and “new line” continue on the next ruled line. Every Symbols-palette item has a tested spoken example. A final transcript may receive an optional AION second pass in desktop/local development; the immediate deterministic candidate remains usable when it is unavailable. See [docs/VOICE_EXPERIMENT.md](docs/VOICE_EXPERIMENT.md).

## Product scope

The app includes an always-available ruled-line composer with Auto/Math/Text intent, structured multiline MathLive editing, optional spatial placement, full on-demand keyboard/symbol controls, mixed voice dictation, quick arithmetic, advanced local CAS actions, whole-page deterministic analysis, and optional AION assistance. A separate research workspace provides local interactive 2D graphs, 3D surfaces, dynamic geometry, and scientific calculation, while a floating calculator stays available over every section. MathKhata follows the familiar expression-list and direct-manipulation workflow, but it does not claim proprietary Desmos code or complete one-for-one Desmos feature parity; the verified remaining gaps are recorded in [docs/audits/desmos-workspace-2026-08-09/README.md](docs/audits/desmos-workspace-2026-08-09/README.md).
