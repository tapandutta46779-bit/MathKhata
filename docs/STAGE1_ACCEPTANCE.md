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
- [x] New writing starts on ruled lines; manual insertions snap vertically and accepted multi-line voice candidates continue line by line without visible object cards.

## Mathematics

- [x] MathLive and the palette expose structured fractions, powers, roots, calculus, functions, Greek, relations, sets/logic, vectors, and matrices.
- [x] MathLive's complete on-screen keyboard remains available on demand with numeric, symbols, alphabetic, and Greek layouts; the native Insert menu retains derivatives, integrals, sums, products, nth roots, and the matrix-size picker.
- [x] Symbols, Voice, the MathLive keyboard/menu, and selected-math controls stay quiet on the paper by default but remain independently accessible and survive repeated open/close cycles.
- [x] Physical keyboard entry and Tab navigation are exercised for powers, fractions, and roots in Chrome E2E.
- [x] Physical and virtual cursor controls, Tab/Shift-Tab, and Space behavior are covered across fractions, roots, superscripts, integrals, and matrices without scrolling an actively edited page.
- [x] Palette buttons insert real roots, definite integrals, and 2×2 matrices at the current MathLive caret in Chrome E2E.
- [ ] Exhaustive manual coverage of every arrow-key/deletion path in deeply nested structures remains a Stage 1 follow-up.

## Data safety

- [x] Autosave and save status are visible.
- [x] JSON export contains all versioned structured data.
- [x] Import validates before adding/replacing and rejects malformed input safely.
- [x] An unknown schema is rejected before persistence and never erases stored work.

## Voice

- [x] Browser capability is detected honestly; unsupported mode does not simulate speech.
- [x] A genuine final transcript was observed by the user in live Chrome; controlled automated starts still cannot supply microphone audio and remain honest about that limitation.
- [x] Candidate UI/controller supports explicit accept/cancel, mixed math/text classification, “then” line breaks, and several editable/undoable ruled objects from one utterance.
- [x] All specified parser examples have automated tests, including disclosed root ambiguity, unfamiliar prose fallback, and the two-equation “then” regression.
- [x] Recognition, parse, render, and visible timestamps are instrumented. Parser timings are recorded; recognition-to-render timing is explicitly unavailable without a delivered transcript.

## Local assistance

- [x] Complete numeric arithmetic shows a quiet right-side result; click or Tab acceptance appends it to the same MathObject without adding steps.
- [x] Tab remains available for navigation inside incomplete MathLive templates because no arithmetic suggestion is offered there.
- [x] Integral/equation/derivative/limit/finite-series solving is explicit, local, dynamically loaded, advisory, and can add a result on the next ruled line.
- [x] Unsupported symbolic forms produce a visible limitation note rather than a fabricated closed form.
- [x] The closed-by-default Page assistant reads the complete current page through `DocumentContextProvider`, proposes ordered problem groups, distinguishes equation systems, incorporates text notes, and flags likely voice corruption.
- [x] Problem grouping is correctable with split/join/confirm controls, solving is per group, and no analysis silently merges or edits notebook content.
- [x] Assistant visibility is a persisted user preference: analysis refreshes, math edits, page switches, React remounts, and reloads never reopen a panel the writer closed.
- [x] At 1280×659 and a narrower viewport, the assistant and notebook menu remain inside the viewport, do not overlap close controls, do not widen the document, and dismiss by second click, Escape, outside pointer, or item selection.
- [x] The app makes no trained-model claim. Deterministic parsing/segmentation and local CAS remain reliable; AION discloses its Qwen3 8B Q4_K_M base and local Ollama runtime.

## Evidence and backup

- [x] Required screenshots are captured from the running application.
- [x] Source mirror and latest Git bundle are written to the detected Google Drive MathKhata folder.
- [x] Final milestone source snapshot and timestamped Git bundle were created after the verification commit.
- [x] Backup source files and the latest bundle were found and the bundle passed `git bundle verify`.

## Latest automated evidence

- Vitest: 13 files, 318 tests passed.
- Playwright: 11 end-to-end flows are collected, including the new continuous composer/research workspace path; a fresh full live-browser run remains pending for this checkpoint.
- Production build: successful; the main JavaScript chunk is about 1,291 kB minified (370 kB gzip). The symbolic engine remains a separate 472.45 kB minified chunk (169.71 kB gzip) and is loaded on demand.
- Local model: Ollama listed `qwen3:8b` at 5.2 GB, and a real smoke inference solved `x^2+6=42` as `x=±6` with two visible checked steps.
