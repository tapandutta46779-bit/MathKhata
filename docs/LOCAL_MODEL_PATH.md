# AION optional local model

## Current, honest status

The shipped page assistant is first a deterministic structured-content analyzer backed by `DocumentContextProvider`; mathematical results come from the local arithmetic evaluator or opt-in CAS. This remains the reliable offline fallback if AION is disabled, unavailable, or uncertain.

**AION** is now an optional runtime exposed inside that assistant. When the writer presses **Enable AION**, a dedicated Web Worker uses `@huggingface/transformers` to download `onnx-community/Qwen2.5-0.5B-Instruct` in q4/q4f16 form, prefer WebGPU, fall back to WASM, and cache the published files in the browser. The files are roughly 0.5 GB, so nothing downloads automatically. See the [Transformers.js-compatible model files](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/tree/main/onnx) and [base model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct).

AION is the MathKhata assistant/runtime name. It is **not** a claim that MathKhata trained Qwen2.5 or produced a custom model. The current implementation is an inference integration around that disclosed published base model.

## Implemented boundary

1. Nothing downloads until the writer opts in; progress, runtime state, and WebGPU/WASM device are visible.
2. `@huggingface/transformers` runs only in a dedicated worker. Transformers.js documents [browser WebGPU execution](https://huggingface.co/docs/transformers.js/guides/webgpu) and [quantized browser inference](https://huggingface.co/docs/transformers.js/main/index).
3. AION receives a compact read-only page prompt and returns advisory prose. The worker never receives IndexedDB access and cannot mutate notebook content.
4. Deterministic segmentation stays authoritative; local arithmetic/CAS verifies mathematical results. Generated prose is never treated as proof.

## Next hardening stage

The next release gate is to replace free-form advisory output with a strict proposal:

   ```json
   {
     "groups": [{ "objectIds": ["..."], "relationship": "system", "confidence": 0.0 }],
     "corrections": [{ "objectId": "...", "kind": "likely_speech_text", "suggestion": "..." }],
     "pageSummary": "..."
   }
   ```

That output must be schema-validated: object IDs must exist, groups may not overlap silently, and AION may not merge groups marked explicitly separate. A remove-downloaded-model control and an inspectable cache-size readout are also required before calling AION production-ready.

## Adaptation and training path

No in-browser training occurred and none is claimed. A future adaptation should first collect only user-approved corrections in a local, inspectable event log: original transcript, deterministic segmentation, accepted type/group correction, and no notebook text beyond what the writer explicitly chooses to export. The writer must be able to delete or export that log.

An adapted model would be produced outside the app from a consented, de-identified JSONL dataset, evaluated on a frozen mixed-math benchmark, and versioned with its base-model/license metadata. A signed ONNX export would then go through the same opt-in download path. Until that dataset, training run, evaluation report, and artifact actually exist, the product must continue to say **no custom model has been trained**.

## Release gate

A local model is eligible only if it beats the deterministic baseline on held-out page grouping and speech-corruption classification, stays within a documented download/RAM/latency budget on supported Macs, produces schema-valid output reliably, works entirely in a worker, and never weakens the no-model path. Otherwise the current structured assistant remains the shipped behavior.
