# MathKhata public beta privacy

MathKhata is local-first by design.

- Notebook content is stored on the user's device in the application's local IndexedDB database. Clearing site data can remove it, so important work should also be exported.
- MathKhata has no account system, advertising, telemetry, analytics beacon, or cloud notebook database.
- Voice input starts only after the user opens Voice and permits microphone access. Chrome speech recognition may use Chrome's recognition service. The packaged desktop app instead downloads the published Whisper Small ONNX model from Hugging Face once, caches it, and transcribes recorded PCM locally in a sandboxed worker; microphone audio is not uploaded. A denied permission or failed model download produces an error and never a fabricated transcript. The deterministic interpretation layer remains separate.
- AION is optional. In the packaged desktop app and local development it can use the configured loopback service on `127.0.0.1`. On the public website, page context and the user's question are sent to MathKhata's same-site Cloudflare function only after the user explicitly asks AION; Cloudflare Workers AI processes that request. The notebook database remains in the browser and is not uploaded for storage.
- The public AION service uses Cloudflare's free daily allowance. If that allowance is exhausted, AION reports that it is unavailable and the local notebook, outline, and deterministic solver continue working.
- Deterministic calculations, page grouping, and CAS operations run inside the application without an AI model.
- Structured notebook exports leave the app only when the user deliberately saves, copies, or uploads them.
- MathKhata does not automatically read, publish, or synchronize Google Drive files.

This beta does not include a user account, server-side notebook retention, or individual analytics. Feedback submitted through an external issue tracker is governed by that service's privacy terms and should not contain private notebook material.
