# MathKhata Agent Guide

These rules apply to every contributor and coding agent working in this repository.

## Product rules

- Fluency is the number-one product requirement.
- The mathematical page is the primary UI.
- Mathematics must remain structured and editable.
- Never silently change mathematical intent.
- AI assistance must remain non-destructive.
- Do not turn the notebook into a chatbot.
- Core notebook functionality cannot depend on AI availability.
- Future AION and reasoning layers must remain separate from presentation components.
- Preserve notebook data carefully and fail safely on loading or migration errors.
- Mac keyboard and trackpad interaction must stay excellent.
- Prefer robust architecture over feature hacks.
- Verify features before claiming they work.

## Engineering rules

- Keep the versioned document model independent of React, MathLive, storage, and future reasoning providers.
- Add migrations for schema changes; never silently discard an unknown schema.
- Treat import data as untrusted and validate it before persistence.
- Keep voice recognition, transcript parsing, insertion, and UI as separable layers.
- Keep MathCheckProvider advisory: it may recommend but may never mutate mathematics automatically.
- Keep DocumentContextProvider as the future AION boundary; AION must not become the notebook database.
- Cover changes with proportionate unit, persistence, and end-to-end tests.
- Run typecheck, lint, tests, and production build before a completion claim.

