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

