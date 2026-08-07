# Architecture

## Layers

1. **Domain** — versioned notebook/page/object types, commands, history snapshots, validation, serialization, and migrations. It has no React or browser-storage dependency.
2. **Persistence** — a Dexie adapter stores validated notebooks in IndexedDB. Storage errors leave in-memory work intact and surface a visible status.
3. **Application state** — a small external store coordinates the current notebook, selected page/object, tools, undo/redo, and debounced persistence.
4. **Editor UI** — React renders the notebook shell, ruled pages, line-flowing/spatial objects, MathLive editors, palette, dialogs, and accessible controls.
5. **Voice experiment** — `SpeechProvider → SpeechTranscript → NotebookSpeechParser → NotebookVoiceCandidate → VoiceInsertionController → MathObject | TextObject`. A single candidate may contain several lines of different types.
6. **Local math assistance** — a small deterministic arithmetic parser supplies immediate numeric suggestions. Nerdamer Prime is dynamically imported only after an explicit integral/equation solve action; results remain advisory until added.
7. **Whole-page analysis** — `DocumentContextProvider → PageAnalysis → PageProblemGroup → PageProblemSolver`. Deterministic grouping preserves object IDs/order, consumes TextObjects as context, requires confirmation for uncertain systems, and never edits the page implicitly.
8. **Extension boundaries** — `MathCheckProvider` provides non-destructive suggestions; `DocumentContextProvider` is also the only permitted input boundary for an optional future local model.

## Versioned document model

Schema version 1 contains a notebook with ordered pages. Pages contain discriminated `math` and `text` objects sharing spatial and timestamp fields. Math objects retain exact LaTeX plus editor metadata; text objects retain plain text. Future object types can extend the union without flattening existing data.

Import is parsed as unknown data, validated field by field, normalized within safe page bounds, and migrated before it can be saved. Unsupported future schema versions are rejected. Failed loads never initialize over the stored record.

## Editing and history

Domain commands return new notebook values. The store records meaningful document states for create/delete/move/content/page actions. Rapid content input is coalesced into an edit transaction so MathLive changes participate in history without an entry per keystroke. Undo/redo restores a prior structured notebook and schedules persistence.

Normal creation and accepted voice segments use a ruled-line flow starting at the paper margin. Math/text objects remain structured and movable, but their card chrome is transparent; selection is indicated quietly in the margin. Manual placement snaps vertically to the nearest ruled line, while dragging can still make a deliberate spatial rough-work layout.

## MathLive boundary

Each MathObject owns a MathLive math-field. The page object stores LaTeX, not MathLive DOM. Palette actions call MathLive commands or insert LaTeX at the active caret. Input events update the object through the application store.

## Persistence and recovery

Dexie stores a full validated notebook record, with autosave after document mutations and an explicit save command. JSON export is a second recovery path. Schema and import failures surface errors and do not overwrite existing records.

## Future reasoning

`DocumentContextProvider` derives current page, selection, nearby objects, prior equations, annotations, spatial relationships, and limited edit context from the domain. The deterministic page assistant consumes this contract without direct storage access. Optional AION inference receives a compact prompt derived from the same read-only context in a dedicated worker; it cannot access persistence or mutate a notebook. See [LOCAL_MODEL_PATH.md](LOCAL_MODEL_PATH.md).
