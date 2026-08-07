# Optional local model path

## Current, honest status

Stage 1 does **not** download, run, fine-tune, or claim to have trained a neural model. The page assistant that ships now is a deterministic structured-content analyzer backed by the existing `DocumentContextProvider`; mathematical results come from the local arithmetic evaluator or the opt-in local CAS. This remains useful offline and is the fallback even if a future model is disabled, unavailable, or uncertain.

That boundary is deliberate. A browser-ready 0.5B instruction model is not a small hidden dependency: the published ONNX files for `onnx-community/Qwen2.5-0.5B-Instruct` include a roughly 483 MB q4f16 file and roughly 512 MB int8/quantized files. Shipping one automatically would create a large first download, substantial memory pressure, and a weaker experience on machines without WebGPU. See the [Transformers.js-compatible model files](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/tree/main/onnx) and the [base model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct).

## Concrete next-stage implementation

1. Add an explicit **Enable local model (about 0.5 GB)** preference. Nothing downloads until the writer opts in, and the UI shows download progress, storage use, loaded/unloaded state, and a remove-model action.
2. Run `@huggingface/transformers` in a dedicated Web Worker. Prefer WebGPU with an fp16/q4f16-compatible build after a capability and memory check; fall back to quantized WASM/CPU, or disable the model without affecting the notebook. Transformers.js documents both [browser WebGPU execution](https://huggingface.co/docs/transformers.js/guides/webgpu) and [quantized browser inference](https://huggingface.co/docs/transformers.js/main/index). ONNX Runtime Web documents [WebGPU setup](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) and its [WASM CPU fallback](https://onnxruntime.ai/docs/tutorials/web/).
3. Start by benchmarking `onnx-community/Qwen2.5-0.5B-Instruct` as a candidate, not by declaring it production-ready. Its only job is to return a small, schema-constrained proposal:

   ```json
   {
     "groups": [{ "objectIds": ["..."], "relationship": "system", "confidence": 0.0 }],
     "corrections": [{ "objectId": "...", "kind": "likely_speech_text", "suggestion": "..." }],
     "pageSummary": "..."
   }
   ```

4. Feed the worker only the read-only document-context projection: ordered object IDs, LaTeX/text, ruled-line coordinates, spacing, and explicit separators. The worker never receives IndexedDB access and never mutates a notebook.
5. Validate every response against a strict schema. Object IDs must exist; groups may not overlap silently; a model may not merge groups that the deterministic boundary has marked explicitly separate. Invalid or low-confidence output is discarded.
6. Keep deterministic segmentation authoritative and visibly compare model suggestions with it. A proposed regrouping requires the writer's confirmation. Arithmetic/CAS verifies mathematical results; generated prose is never treated as proof.
7. Cache approved model assets locally for subsequent offline use. Initial download contacts the configured model host, but notebook page content remains on-device during inference. The preference must state this distinction clearly.

## Adaptation and training path

No in-browser training is planned for this stage. First collect only user-approved corrections in a local, inspectable event log: original transcript, deterministic segmentation, accepted type/group correction, and no notebook text beyond what the writer explicitly chooses to export. The writer can delete or export that log at any time.

An adapted model would be produced outside the app from a consented, de-identified JSONL dataset, evaluated on a frozen mixed-math benchmark, and versioned with its base-model/license metadata. A signed ONNX export would then go through the same opt-in download path. Until that dataset, training run, evaluation report, and artifact actually exist, the product must continue to say **no custom model has been trained**.

## Release gate

A local model is eligible only if it beats the deterministic baseline on held-out page grouping and speech-corruption classification, stays within a documented download/RAM/latency budget on supported Macs, produces schema-valid output reliably, works entirely in a worker, and never weakens the no-model path. Otherwise the current structured assistant remains the shipped behavior.
