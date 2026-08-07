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

Stage 1 composes numbers, variables, arithmetic and relation operators, powers and indexed roots, grouped fractions, bounded integrals/sums/products, derivatives, limits, differentials, trigonometric/logarithmic functions, Greek letters, vectors and fixed-size matrices, and the set/logic notation in the Symbols palette. Correction commands are deliberately small: cancel, undo, and delete that.

The Symbols palette and voice guide share one notation catalog. Each current palette item carries a spoken example and expected structured LaTeX, and the parser test suite runs the complete catalog. Recognition variants such as `square`/`squared`, words or literal operator symbols, `equals`/`is equal to`, and common aliases are normalized before parsing. If any tail remains unparsed, it is rendered as an explicit unknown candidate fragment and shown in the warning list rather than silently discarded.

“square root of x plus one” is intrinsically ambiguous. Stage 1 chooses `\\sqrt{x+1}` because “of” opens the root phrase through the remaining additive term. The alternative `\\sqrt{x}+1` should be entered with a pause/correction or edited manually. The UI must expose the transcript and provisional result rather than hiding this choice.

## Measurements

The implementation records recognition event time, parser start/finish, candidate render time, recognition-to-parse latency, candidate-to-render latency, and approximate total visible latency. Automated parser timing does not substitute for a real microphone observation.

Machine, Chrome version, genuine microphone results, measured latency, recognition limitations, and errors will be added during final manual verification.

## 2026-08-07 observations

- Machine: MacBook Air (Mac14,2), Apple M2, 16 GB memory, macOS 26.5.2, arm64.
- Browser: Google Chrome 151.0.7922.108.
- Capability: Chrome exposed `webkitSpeechRecognition`; the UI therefore offered the real Web Speech provider rather than the unsupported fallback.
- Initial controlled attempts: two starts were made in the controlled, visible Chrome tab. The provider entered the real request path but Chrome returned `Speech recognition error: aborted` before any interim or final transcript. A separate headless Chrome E2E run reached `requesting microphone`. No transcript was injected or fabricated.
- Subsequent user observation: a live Chrome session delivered and displayed the final transcript “x square + 6 is equal to 42”. The original parser produced only `x`, proving that recognition worked while normalization and parse-tail handling did not. The regression is now covered directly and yields `x^2+6=42` with no unknown words.
- Consequence: one genuine final transcript is now evidenced, but broader microphone recognition accuracy and interim cadence are still not claimed. The panel timing measures from recognition-event receipt to candidate rendering; it does not include Chrome's speech-to-text time.
- Parser performance after the expanded grammar: 1,000 mixed supported utterances averaged 0.013 ms, with p95 0.019 ms and maximum 1.647 ms. This measures only the local deterministic parser, not browser speech recognition or human-perceived latency.
- Parser coverage: every notation item currently exposed by the Basic, Calculus, Functions, Greek, Linear algebra, and Sets & logic palette categories has a passing spoken-example test. This remains a documented grammar, not a claim of arbitrary natural-language mathematics.
- Correction commands: `cancel`, `undo`, and `delete that` are handled only when delivered as final recognition results.
- Known ambiguity: “square root of x plus one” is deliberately interpreted as `\\sqrt{x+1}` and carries an ambiguity notice because `\\sqrt{x}+1` is also plausible.

The parser timestamps recognition receipt, parser start/finish, and the candidate's next visual frame. When Chrome eventually delivers a transcript, the UI displays recognition-to-candidate, candidate-to-render, and rough total visible latency directly in the voice panel.
