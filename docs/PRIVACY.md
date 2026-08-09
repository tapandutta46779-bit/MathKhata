# MathKhata privacy

MathKhata is local-first by design.

- Notebook content is stored on the user's laptop in the application's local IndexedDB database.
- MathKhata has no account system, advertising, telemetry, analytics beacon, or cloud notebook database.
- Voice input starts only after the user opens Voice and permits microphone access. Chrome speech recognition may use Chrome's recognition service. The packaged desktop app instead downloads the published Whisper Small ONNX model from Hugging Face once, caches it, and transcribes recorded PCM locally in a sandboxed worker; microphone audio is not uploaded. A denied permission or failed model download produces an error and never a fabricated transcript. The deterministic interpretation layer remains separate.
- AION is optional. When configured, page context and the user's question are sent only to the local loopback AION service on `127.0.0.1`. The app does not send that request to OpenAI or another hosted API.
- Deterministic calculations and CAS operations run inside the application without AION.
- Structured notebook exports leave the app only when the user deliberately saves, copies, or uploads them.

Public publishers should place this policy at a stable URL and add their legal identity, contact method, jurisdiction-specific disclosures, and retention commitments before distribution.
