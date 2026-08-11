# MathKhata public beta privacy

MathKhata is local-first by design.

- Notebook content is stored on the user's device in the application's local IndexedDB database. Clearing site data can remove it, so important work should also be exported.
- MathKhata has no account system, advertising, personal tracking, or cloud notebook database. The public website uses Cloudflare's cookie-free Web Analytics for aggregate page views and performance measurements; the desktop application does not use that beacon.
- Voice input starts only after the user opens Voice and permits microphone access. Chrome speech recognition may use Chrome's recognition service. The packaged desktop app instead downloads the published Whisper Small ONNX model from Hugging Face once, caches it, and transcribes recorded PCM locally in a sandboxed worker; microphone audio is not uploaded. A denied permission or failed model download produces an error and never a fabricated transcript. The deterministic interpretation layer remains separate.
- AION is optional. In the packaged desktop app and local development it can use the configured loopback service on `127.0.0.1`. The public website offers two explicit modes. **Private on-device** runs Qwen3 8B through WebLLM/WebGPU; its model files are fetched from the published MLC/Hugging Face distribution and cached by the browser, and prompts stay on the device. **Fast online** uses Mistral Small 3.1 24B through a same-site Cloudflare Workers AI function; only after the user selects that mode and sends a question does the current page context and question leave the browser for processing.
- Browser AION requires WebGPU, several gigabytes of model download/storage, and sufficient device memory. If the browser or device cannot run it, AION reports that limitation and the local notebook, outline, and deterministic solver continue working.
- Deterministic calculations, page grouping, and CAS operations run inside the application without an AI model.
- Structured notebook exports leave the app only when the user deliberately saves, copies, or uploads them.
- MathKhata does not automatically read, publish, or synchronize Google Drive files.

This beta does not include a user account, server-side notebook retention, or individual profiling. Cloudflare Web Analytics does not receive notebook content, equations, or microphone recordings. Fast online AION processing is separate from analytics and occurs only after explicit selection and submission. Feedback submitted through an external issue tracker is governed by that service's privacy terms and should not contain private notebook material.
