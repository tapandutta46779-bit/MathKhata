# Stage 1 Acceptance

This is the verification ledger for Stage 1. A checked item must be backed by a test, a manual run, or both.

## Foundation

- [x] React/TypeScript/Vite application launches in Chrome.
- [x] TypeScript strict check, lint, Vitest, Playwright, and production build pass.
- [x] Initial load, selection, dragging, and typing have no obvious interaction lag in local Chrome runs.

## Notebook

- [x] Create, rename, and reopen a notebook.
- [x] Add, switch, reorder, and delete pages with confirmation and undo.
- [x] Add/edit/select/move/duplicate/delete Math and Text objects.
- [x] Positions and exact contents survive reload; IndexedDB reopening is covered in unit and Chrome tests.
- [x] Undo/redo covers object movement/deletion, page deletion, and grouped MathLive content edits.

## Mathematics

- [x] MathLive and the palette expose structured fractions, powers, roots, calculus, functions, Greek, relations, sets/logic, vectors, and matrices.
- [x] Physical keyboard entry and Tab navigation are exercised for powers, fractions, and roots in Chrome E2E.
- [x] Palette buttons insert real roots, definite integrals, and 2×2 matrices at the current MathLive caret in Chrome E2E.
- [ ] Exhaustive manual coverage of every arrow-key/deletion path in deeply nested structures remains a Stage 1 follow-up.

## Data safety

- [x] Autosave and save status are visible.
- [x] JSON export contains all versioned structured data.
- [x] Import validates before adding/replacing and rejects malformed input safely.
- [x] An unknown schema is rejected before persistence and never erases stored work.

## Voice

- [x] Browser capability is detected honestly; unsupported mode does not simulate speech.
- [ ] A genuine interim/final transcript could not be obtained in the automated Chrome session: both real starts ended with `aborted` before audio/transcript delivery.
- [x] Candidate UI/controller supports explicit accept/cancel and creates an ordinary editable, undoable MathObject; the live-transcript path remains unverified because recognition aborted.
- [x] All specified parser examples have automated tests, including disclosed root ambiguity.
- [x] Recognition, parse, render, and visible timestamps are instrumented. Parser timings are recorded; recognition-to-render timing is explicitly unavailable without a delivered transcript.

## Evidence and backup

- [x] Required screenshots are captured from the running application.
- [x] Source mirror and latest Git bundle are written to the detected Google Drive MathKhata folder.
- [x] Final milestone source snapshot and timestamped Git bundle were created after the verification commit.
- [x] Backup source files and the latest bundle were found and the bundle passed `git bundle verify`.

## Latest automated evidence

- Vitest: 6 files, 20 tests passed.
- Playwright/Chrome: 4 flows passed.
- Parser timing (1,000 mixed supported utterances): average 0.006 ms, p95 0.010 ms, maximum 0.722 ms on this development run.
- Production build: successful; MathLive contributes to a 1.20 MB minified main JavaScript chunk (342 KB gzip), which is the clearest current performance limitation.
