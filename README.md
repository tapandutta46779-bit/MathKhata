# MathKhata

MathKhata is a local-first, desktop-first mathematical notebook. Its page is the interface: place structured mathematics and ordinary notes where they help you think, then return later without losing layout or mathematical editability.

Stage 1 targets macOS and Chrome with a physical keyboard, trackpad or mouse, and optional microphone access. It has no backend, account, cloud database, AI dependency, or API-key requirement.

## Development

The application commands will be finalized with the runnable foundation. The intended workflow is:

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

## Keyboard shortcuts

- `Command-Z`: undo the last notebook action.
- `Command-Shift-Z`: redo.
- `Command-S`: save immediately.
- `Escape`: stop editing, leave the active tool, or clear selection.
- `Delete` / `Backspace`: delete the selected object when its content editor is not active.
- `M`: activate Math insertion when focus is not in an editor.
- `T`: activate Text insertion when focus is not in an editor.
- `V`: open voice insertion when focus is not in an editor.

## Data and backups

Notebook data is stored locally in IndexedDB and can be exported as validated, versioned JSON. See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for source-code backup and recovery.

## Scope

Stage 1 builds the hands and paper: structured math entry, spatial notes, pages, persistence, history, import/export, an auxiliary symbol palette, and an honest browser speech-recognition experiment. AION, chat, autonomous reasoning, CAS, graphing, handwriting, collaboration, accounts, and cloud services are intentionally out of scope.

