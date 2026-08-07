# Stage 1 Acceptance

This is the verification ledger for Stage 1. A checked item must be backed by a test, a manual run, or both.

## Foundation

- [ ] React/TypeScript/Vite application launches in Chrome.
- [ ] TypeScript strict check, lint, Vitest, Playwright, and production build pass.
- [ ] Initial load, selection, dragging, and typing have no obvious interaction lag.

## Notebook

- [ ] Create and rename a notebook.
- [ ] Add, switch, reorder, and delete pages with confirmation or undo.
- [ ] Add/edit/select/move/duplicate/delete Math and Text objects.
- [ ] Positions and exact contents survive reload and browser restart.
- [ ] Undo/redo covers important object and page changes, including content edits.

## Mathematics

- [ ] MathLive provides structured fractions, powers, roots, calculus, functions, Greek, relations, sets/logic, vectors, and matrices.
- [ ] Physical keyboard navigation is manually exercised for nested structures.
- [ ] Palette buttons insert structures at the current MathLive caret.

## Data safety

- [ ] Autosave and save status are visible.
- [ ] JSON export contains all versioned structured data.
- [ ] Import validates before adding/replacing and rejects malformed input safely.
- [ ] An unknown schema never erases stored work.

## Voice

- [ ] Browser capability is detected honestly.
- [ ] Genuine interim/final transcripts update a provisional structured candidate when Chrome supports recognition.
- [ ] Candidate can be accepted, cancelled, undone, and manually edited.
- [ ] Specified parser examples have automated tests.
- [ ] Recognition, parse, render, and visible latency measurements are recorded without fabrication.

## Evidence and backup

- [ ] Required screenshots are captured from the running application.
- [ ] Source mirror, latest Git bundle, and milestone snapshot are written to the detected Google Drive MathKhata folder.
- [ ] Backup destination contents are verified independently.

