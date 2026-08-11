# AION local-provider architecture

## Current, honest status

MathKhata can optionally use published Qwen models. The desktop path uses **Qwen3 8B Q4_K_M** through local **Ollama** under the model name `qwen3:8b`. The public browser's **Private on-device** path uses the MLC **Qwen3-8B-q4f16_1** build through WebLLM/WebGPU and requires several gigabytes of model data and memory. The public **Fast online** path uses Cloudflare's hosted **Qwen3 30B-A3B FP8** model, requires no model download, and is subject to the account's free daily Workers AI allowance. MathKhata did not train either model and does not claim that it did.

AION currently uses a replaceable provider boundary. The desktop/local provider connects to the configured model through Ollama; a future original reasoning architecture can replace that provider without taking ownership of notebook storage or presentation.

The current desktop/local setup is:

- Ollama runs as a local service.
- `qwen3:8b` is downloaded into Ollama's local model store.
- MathKhata talks only to `http://127.0.0.1:11434/api/chat` and `/api/tags` in the desktop app or local development.
- AION receives a read-only prompt derived from `DocumentContextProvider`; it has no notebook persistence or mutation capability.
- Hidden model thinking is never displayed as a solution. The model is prompted to provide concise, pedagogical, checkable steps in its visible answer.
- The public web beta never probes localhost. Private on-device mode keeps the prompt on the device. Fast online mode sends it to the same-site AION function only after the user explicitly selects that mode and submits a request.

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

The private model consumes several gigabytes of disk and can use substantial memory while answering. In the desktop/local provider, page text is sent to the local loopback Ollama service and model files are stored by Ollama locally. In the public private provider, model files are downloaded from the published MLC/Hugging Face distribution and cached by the browser; prompts remain on the user's device. Fast online mode sends the current page prompt to Cloudflare Workers AI for transient processing and MathKhata does not retain it in a server-side notebook database. Google Drive is used for source/notebook backup only if the writer explicitly enables or performs that backup.

## Future AION boundary

No custom model training run and no original AION implementation has occurred. The replaceable provider boundary in `src/aion/ollamaProvider.ts` allows a future system to integrate without changing notebook storage or presentation. Any future trained/adapted model must be disclosed with its dataset consent, training method, weights/model card, and evaluation results before it is presented as such.
