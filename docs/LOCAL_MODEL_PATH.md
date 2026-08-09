# AION local model architecture

## Current, honest status

**AION** is MathKhata’s private local assistant architecture. Its main inference model is the published **Qwen3 8B** model, quantized as **Q4_K_M** and served on this Mac by **Ollama** under the local model name `qwen3:8b`. The model artifact is about 5.2 GB. MathKhata did not train Qwen3 and does not claim that it did.

The current machine setup is:

- Ollama installed as a local macOS service.
- `qwen3:8b` downloaded into Ollama’s local model store.
- MathKhata talks only to `http://127.0.0.1:11434/api/chat` and `/api/tags`.
- AION receives a read-only prompt derived from `DocumentContextProvider`; it has no notebook persistence or mutation capability.
- Hidden model thinking is never displayed as a solution. AION is prompted to provide concise, pedagogical, checkable steps in its visible answer.

If Ollama or the model is unavailable, notebook editing, the Symbols palette, MathLive keyboard/menus, deterministic voice parser, page grouping, quick calculator, and local CAS all remain operational. The older Qwen2.5 0.5B browser worker remains only as a dormant emergency implementation boundary; it is not presented as the main AION model.

## What AION does now

1. Reads the complete current page through the same ordered document-context boundary used by deterministic grouping.
2. Answers a writer’s free-form question about the page and can present visible solution steps.
3. Provides an optional second-pass interpretation of a final voice transcript into mixed Text and Math segments. The deterministic candidate appears immediately and remains the fallback.
4. Never inserts or changes notebook content automatically. Voice candidates still require explicit acceptance, and page answers remain advisory.

Mathematical results should be checked against the deterministic arithmetic evaluator or Nerdamer CAS when the expression is supported. A language-model answer is not silently treated as a proof.

## Local setup and verification

```sh
brew install ollama
brew services start ollama
ollama pull qwen3:8b
ollama list
```

Ollama’s service must allow the MathKhata localhost origin. The UI checks `/api/tags` before showing AION as ready and reports a clear fallback state rather than pretending a model responded.

## Privacy and storage tradeoffs

The local model consumes several gigabytes of disk and can use a substantial portion of unified memory while answering. It is appropriate for the current 16 GB Apple Silicon machine, but it is slower than a hosted frontier model and does not inherit ChatGPT Plus capacity. Page text is sent to the loopback Ollama service, not to OpenAI or another cloud provider. Model files are stored by Ollama locally; Google Drive is used for source/notebook backup only unless the writer deliberately copies model artifacts there.

## Adaptation and training path

No custom AION training run has occurred. A responsible later adaptation would first collect only writer-approved corrections in a deletable local event log. A consented and de-identified JSONL dataset would then be evaluated against the deterministic baseline, used for a LoRA/QLoRA adaptation of an explicitly disclosed base model, and accepted only after a frozen mixed-math/voice benchmark and regression suite pass. Until the dataset, training run, weights, model card, and evaluation report actually exist, the product must continue to say that AION uses a pretrained model rather than a MathKhata-trained model.

The provider boundary in `src/aion/ollamaProvider.ts` is deliberately replaceable so the user’s future AION architecture can take over without changing the notebook schema or presentation layer.
