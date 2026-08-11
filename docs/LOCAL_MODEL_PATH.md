# Local Qwen assistant architecture

## Current, honest status

MathKhata can optionally use the published **Qwen3 8B** model, quantized as **Q4_K_M**, through a local **Ollama** service under the model name `qwen3:8b`. The model artifact is about 5.2 GB. MathKhata did not train Qwen3 and does not claim that it did.

This Local Qwen Assistant is not the author's future original non-LLM **AION** reasoning architecture. AION is a separate future system and is not implemented in this release. Internal source identifiers retain the historical `aion` provider name only as a compatibility boundary.

The current desktop/local setup is:

- Ollama runs as a local service.
- `qwen3:8b` is downloaded into Ollama's local model store.
- MathKhata talks only to `http://127.0.0.1:11434/api/chat` and `/api/tags` in the desktop app or local development.
- The Local Qwen Assistant receives a read-only prompt derived from `DocumentContextProvider`; it has no notebook persistence or mutation capability.
- Hidden model thinking is never displayed as a solution. The model is prompted to provide concise, pedagogical, checkable steps in its visible answer.
- The public web beta never probes localhost and does not connect to any hosted model.

If Ollama or the model is unavailable, notebook editing, Symbols, MathLive keyboard/menus, deterministic voice parsing, page grouping, the quick calculator, and local CAS remain operational.

## What the optional assistant does

1. Reads the complete current page through the same ordered document-context boundary used by deterministic grouping.
2. Answers a writer's free-form question and can present visible solution steps.
3. Provides an optional second-pass interpretation of a final voice transcript. The deterministic candidate appears immediately and remains the fallback.
4. Never inserts or changes notebook content automatically.

Language-model output should be checked against the deterministic evaluator or local CAS when the expression is supported. It is not silently treated as a proof.

## Local setup

```sh
brew install ollama
brew services start ollama
ollama pull qwen3:8b
ollama list
```

## Privacy and resource tradeoffs

The model consumes several gigabytes of disk and can use substantial memory while answering. Page text is sent to the local loopback Ollama service, not to OpenAI or another cloud provider. Model files are stored by Ollama locally. Google Drive is used for source/notebook backup only if the writer explicitly enables or performs that backup.

## Future AION boundary

No custom model training run and no original AION implementation has occurred. The replaceable provider boundary in `src/aion/ollamaProvider.ts` allows a future system to integrate without changing notebook storage or presentation. Any future trained/adapted model must be disclosed with its dataset consent, training method, weights/model card, and evaluation results before it is presented as such.
