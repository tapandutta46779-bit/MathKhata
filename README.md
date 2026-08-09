# MathKhata

MathKhata is a local-first, desktop-first mathematical notebook. Its page is the interface: write structured mathematics and ordinary notes directly on ruled lines, then return later without losing layout or mathematical editability.

Stage 1 targets macOS and Chrome with a physical keyboard, trackpad or mouse, and optional microphone access. It has no backend, account, cloud database, required AI dependency, or API-key requirement.

## Development

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

- `Command-Z`: undo the last notebook action.
- `Command-Shift-Z`: redo.
- `Command-S`: save immediately.
- `Escape`: stop editing, leave the active tool, or clear selection.
- `Delete` / `Backspace`: delete the selected object when its content editor is not active.
- `M`: activate Math insertion when focus is not in an editor.
- `T`: activate Text insertion when focus is not in an editor.
- `V`: open voice insertion when focus is not in an editor.
- `Command-D`: duplicate the selected page object when content editing is inactive.
- `Tab`: accept the quiet arithmetic result shown beside a complete numeric expression. Inside an incomplete fraction/root/template, Tab keeps its normal MathLive navigation behavior.

## Local calculation

Pure arithmetic is evaluated instantly and locally. For example, entering `6 × 4` shows `24` in a small right-side suggestion; click it or press Tab to place `=24` on the same line. No steps are added.

Integrals, higher/partial derivatives, limits, finite sums/products, variable equations, bounded nested integrals, double/triple antiderivatives, the classical Gaussian integral, numeric determinants, RREF matrices, gradients, and Laplacians show an optional local solve action. The symbolic engine is bundled with the app, loaded only after that action, and never sends the expression to a server. A reliable result can be added on the next ruled line; an unsupported form produces an explicit note instead of an invented answer.

Long expressions are kept as one structured MathLive expression but rendered through a genuine multiline environment. They continue onto later ruled lines, grow the page flow, and keep the on-screen keyboard/menu controls in reserved space instead of covering the notation.

## Whole-page assistant

The compact right-side Page assistant reads the complete current page through the read-only document-context boundary. It preserves ruled-line/spatial order, treats notes as context, proposes separate problems or equation systems, flags likely voice corruption, and lets the writer split, join, or confirm groups before solving. It is closed by default, remembers that choice across reloads, and never changes page content without an explicit action.

Deterministic page analysis remains the reliable fallback. The assistant also offers **AION**, a private local runtime using the published Qwen3 8B Q4_K_M model through Ollama on this Mac. AION can answer free-form questions about the complete page and present visible solution steps; the deterministic grouping and CAS remain independent verification layers. MathKhata has not trained Qwen3 or a custom AION model. Details and privacy tradeoffs are documented in [docs/LOCAL_MODEL_PATH.md](docs/LOCAL_MODEL_PATH.md).

## Data and backups

Notebook data is stored locally in IndexedDB and can be exported as validated, versioned JSON. See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for source-code backup and recovery.

To install the safe post-commit Google Drive backup and create a milestone snapshot:

```sh
./scripts/install-git-hooks.sh
./scripts/backup-to-drive.sh --snapshot
```

## Voice status

Chrome Web Speech support is used when genuinely available; nothing is simulated. One utterance may contain both mathematics and ordinary language: “x equals six, then y equals eight” becomes two math lines, while an unfamiliar prose phrase remains text. “Then”, “next line”, and “new line” continue on the next ruled line. Every Symbols-palette item has a tested spoken example. A final transcript may receive a private AION second pass; the immediate deterministic candidate remains usable if AION is slow or unavailable. See [docs/VOICE_EXPERIMENT.md](docs/VOICE_EXPERIMENT.md).

## Scope

The app now includes an always-available ruled-line composer with Auto/Math/Text intent, structured multiline MathLive editing, optional spatial placement, full on-demand keyboard/symbol controls, mixed voice dictation, quick arithmetic, advanced local CAS actions, whole-page deterministic analysis, and AION assistance. A separate research workspace provides local 2D graphs, 3D wireframes, interactive polygon geometry, and scientific calculation, while a floating calculator stays available over every section. These are research-workspace foundations rather than a claim of complete Desmos feature parity.
