# MathKhata privacy

MathKhata is local-first by design.

- Notebook content is stored on the user's laptop in the application's local IndexedDB database.
- MathKhata has no account system, advertising, telemetry, analytics beacon, or cloud notebook database.
- Voice input starts only after the user opens Voice and permits microphone access. Browser speech-recognition implementations may use an operating-system or browser provider; MathKhata labels availability honestly and keeps the deterministic interpretation layer separate.
- AION is optional. When configured, page context and the user's question are sent only to the local loopback AION service on `127.0.0.1`. The app does not send that request to OpenAI or another hosted API.
- Deterministic calculations and CAS operations run inside the application without AION.
- Structured notebook exports leave the app only when the user deliberately saves, copies, or uploads them.

Public publishers should place this policy at a stable URL and add their legal identity, contact method, jurisdiction-specific disclosures, and retention commitments before distribution.
