# MathKhata

MathKhata is a local-first, desktop-first mathematical notebook. Its page is the interface: place structured mathematics and ordinary notes where they help you think, then return later without losing layout or mathematical editability.

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

## Data and backups

Notebook data is stored locally in IndexedDB and can be exported as validated, versioned JSON. See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for source-code backup and recovery.

To install the safe post-commit Google Drive backup and create a milestone snapshot:

```sh
./scripts/install-git-hooks.sh
./scripts/backup-to-drive.sh --snapshot
```

## Voice status

Chrome Web Speech support is used when genuinely available; nothing is simulated. The Stage 1 parser is deliberately constrained and shows provisional transcripts, unknown words, ambiguity, and measured timing. Every item in the current Symbols palette has a tested spoken example in the in-app voice guide. A live Chrome transcript exposed and now guards the recognition variant “x square + 6 is equal to 42”. See [docs/VOICE_EXPERIMENT.md](docs/VOICE_EXPERIMENT.md).

## Scope

Stage 1 builds the hands and paper: structured math entry, spatial notes, pages, persistence, history, import/export, an auxiliary symbol palette, and an honest browser speech-recognition experiment. AION, chat, autonomous reasoning, CAS, graphing, handwriting, collaboration, accounts, and cloud services are intentionally out of scope.
