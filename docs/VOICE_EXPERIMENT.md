# Voice Experiment

## Scope

Stage 1 uses Chrome's real Web Speech recognition when the browser exposes it. There is no simulated transcript and no claim of arbitrary natural-language mathematics. Unsupported browsers receive an honest fallback state while keeping the provider boundary replaceable.

The pipeline is:

```text
SpeechProvider
  → SpeechTranscript
  → MathSpeechParser
  → MathCandidate
  → VoiceInsertionController
  → MathObject
```

Interim recognition may update a provisional candidate. A user explicitly accepts or cancels it; committed mathematics remains editable and undoable.

## Intended grammar

Stage 1 composes numbers, variables, arithmetic and relation operators, common powers, square/cube roots, grouped fractions, bounded integrals/sums, differentials, and common functions. Correction commands are deliberately small: cancel, undo, and delete that.

“square root of x plus one” is intrinsically ambiguous. Stage 1 chooses `\\sqrt{x+1}` because “of” opens the root phrase through the remaining additive term. The alternative `\\sqrt{x}+1` should be entered with a pause/correction or edited manually. The UI must expose the transcript and provisional result rather than hiding this choice.

## Measurements

The implementation records recognition event time, parser start/finish, candidate render time, recognition-to-parse latency, candidate-to-render latency, and approximate total visible latency. Automated parser timing does not substitute for a real microphone observation.

Machine, Chrome version, genuine microphone results, measured latency, recognition limitations, and errors will be added during final manual verification.

## 2026-08-07 observations

- Machine: MacBook Air (Mac14,2), Apple M2, 16 GB memory, macOS 26.5.2, arm64.
- Browser: Google Chrome 151.0.7922.108.
- Capability: Chrome exposed `webkitSpeechRecognition`; the UI therefore offered the real Web Speech provider rather than the unsupported fallback.
- Genuine attempts: two starts were made in the controlled, visible Chrome tab. The provider entered the real request path but Chrome returned `Speech recognition error: aborted` before any interim or final transcript. A separate headless Chrome E2E run reached `requesting microphone`. No transcript was injected or fabricated.
- Consequence: microphone audio, recognition accuracy, interim cadence, recognition-to-candidate latency, and total perceived voice latency are not claimed as verified. A person must grant/confirm Chrome microphone access if prompted and speak into the live app to complete that check.
- Parser performance: 1,000 mixed supported utterances averaged 0.006 ms, with p95 0.010 ms and maximum 0.722 ms. This measures only the local deterministic parser, not browser speech recognition or human-perceived latency.
- Parser coverage: numbers, negative values, practical decimals, variables, implied multiplication, arithmetic/relations, plus-or-minus, squared/cubed/general powers, square/cube roots, whole-expression fractions, bounded integrals/sums/products, differentials, common functions, infinity, and a small Greek vocabulary.
- Correction commands: `cancel`, `undo`, and `delete that` are handled only when delivered as final recognition results.
- Known ambiguity: “square root of x plus one” is deliberately interpreted as `\\sqrt{x+1}` and carries an ambiguity notice because `\\sqrt{x}+1` is also plausible.

The parser timestamps recognition receipt, parser start/finish, and the candidate's next visual frame. When Chrome eventually delivers a transcript, the UI displays recognition-to-candidate, candidate-to-render, and rough total visible latency directly in the voice panel.
