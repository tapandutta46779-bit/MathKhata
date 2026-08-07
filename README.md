# MathKhata

MathKhata is a local-first, desktop-first mathematical notebook. Its page is the interface: write structured mathematics and ordinary notes directly on ruled lines, then return later without losing layout or mathematical editability.

Stage 1 targets macOS and Chrome with a physical keyboard, trackpad or mouse, and optional microphone access. It has no backend, account, cloud database, AI dependency, or API-key requirement.

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

Integrals and variable equations show an optional **Solve integral** or **Solve equation** action. The symbolic engine is downloaded with the app, loaded only after that action, and never sends the expression to a server. A reliable result can be added on the next ruled line; an unsupported closed form produces an explicit note instead of an invented answer.

## Whole-page assistant

The compact right-side Page assistant reads the complete current page through the read-only document-context boundary. It preserves ruled-line/spatial order, treats notes as context, proposes separate problems or equation systems, flags likely voice corruption, and lets the writer split, join, or confirm groups before solving. It is closed by default, remembers that choice across reloads, and never changes page content without an explicit action.

This Stage 1 assistant is deterministic; no neural model training is claimed. The exact opt-in, on-device model path and its roughly 0.5 GB download tradeoff are documented in [docs/LOCAL_MODEL_PATH.md](docs/LOCAL_MODEL_PATH.md).

## Data and backups

Notebook data is stored locally in IndexedDB and can be exported as validated, versioned JSON. See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for source-code backup and recovery.

To install the safe post-commit Google Drive backup and create a milestone snapshot:

```sh
./scripts/install-git-hooks.sh
./scripts/backup-to-drive.sh --snapshot
```

## Voice status

Chrome Web Speech support is used when genuinely available; nothing is simulated. One utterance may contain both mathematics and ordinary language: “x equals six, then y equals eight” becomes two math lines, while an unfamiliar prose phrase remains text. “Then”, “next line”, and “new line” continue on the next ruled line. Every Symbols-palette item has a tested spoken example. Supporting Chrome builds also receive contextual phrase hints for the shared math vocabulary; this is recognition biasing, not a claimed custom-trained voice model. See [docs/VOICE_EXPERIMENT.md](docs/VOICE_EXPERIMENT.md).

## Scope

Stage 1 builds the hands and paper: structured math entry, line-flowing notes, optional spatial placement, pages, persistence, history, import/export, full on-demand MathLive/symbol controls, mixed math/text voice dictation, quick arithmetic, an opt-in local symbolic solver, and a non-destructive whole-page analysis foundation. Chat, autonomous reasoning, graphing, handwriting, collaboration, accounts, and cloud services remain out of scope.
