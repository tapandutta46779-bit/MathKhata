# MathKhata public beta privacy

MathKhata is local-first by design.

- Notebook content is stored on the user's device in the application's local IndexedDB database. Clearing site data can remove it, so important work should also be exported.
- MathKhata has no account system, advertising, telemetry, analytics beacon, or cloud notebook database.
- Voice input starts only after the user opens Voice and permits microphone access. Chrome speech recognition may use Chrome's recognition service. The packaged desktop app instead downloads the published Whisper Small ONNX model from Hugging Face once, caches it, and transcribes recorded PCM locally in a sandboxed worker; microphone audio is not uploaded. A denied permission or failed model download produces an error and never a fabricated transcript. The deterministic interpretation layer remains separate.
- The optional Local Qwen Assistant is available in the packaged desktop app and local development. When configured, page context and the user's question are sent only to the loopback Ollama service on `127.0.0.1`. The public website does not connect to Ollama, a hosted model, OpenAI, or another AI API.
- Deterministic calculations, page grouping, and CAS operations run inside the application without an AI model.
- Structured notebook exports leave the app only when the user deliberately saves, copies, or uploads them.
- MathKhata does not automatically read, publish, or synchronize Google Drive files.

This beta does not include a user account, server-side notebook retention, or individual analytics. Feedback submitted through an external issue tracker is governed by that service's privacy terms and should not contain private notebook material.
