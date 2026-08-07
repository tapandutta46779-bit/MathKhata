import { useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { useNotebookStore } from '../store/notebookStore';
import { markCandidateRendered, parseMathSpeech } from '../voice/mathSpeechParser';
import { NotebookVoiceInsertionController } from '../voice/voiceInsertionController';
import { WebSpeechProvider } from '../voice/webSpeechProvider';
import type { MathCandidate, VoiceState } from '../voice/types';

export function VoicePanel() {
  const provider = useMemo(() => new WebSpeechProvider(), []);
  const controller = useMemo(() => new NotebookVoiceInsertionController(), []);
  const insertionPoint = useNotebookStore((state) => state.insertionPoint);
  const setTool = useNotebookStore((state) => state.setTool);
  const undo = useNotebookStore((state) => state.undo);
  const deleteSelectedObject = useNotebookStore((state) => state.deleteSelectedObject);
  const [voiceState, setVoiceState] = useState<VoiceState>(provider.supported ? 'idle' : 'unsupported');
  const [candidate, setCandidate] = useState<MathCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      provider.cancel();
    };
  }, [provider]);

  useEffect(() => {
    if (!candidate || candidate.latency.renderTimestamp) return;
    const frame = requestAnimationFrame(() => {
      if (mounted.current) setCandidate((current) => current ? markCandidateRendered(current) : null);
    });
    return () => cancelAnimationFrame(frame);
  }, [candidate]);

  function close() {
    provider.cancel();
    controller.cancel();
    setTool('select');
  }

  function start() {
    setError(null);
    setCandidate(null);
    provider.start({
      onState: setVoiceState,
      onTranscript: (transcript) => {
        const command = transcript.text.trim().toLowerCase();
        if (transcript.isFinal && command === 'cancel') {
          close();
          return;
        }
        if (transcript.isFinal && command === 'undo') {
          undo();
          close();
          return;
        }
        if (transcript.isFinal && command === 'delete that') {
          deleteSelectedObject();
          close();
          return;
        }
        setCandidate(
          parseMathSpeech(transcript.text, transcript.recognitionTimestamp, transcript.isFinal),
        );
      },
      onError: setError,
      onEnd: () => {
        if (mounted.current) {
          setVoiceState((current) =>
            current === 'error' || current === 'unsupported' ? current : 'finished',
          );
        }
      },
    });
  }

  return (
    <section className="voice-panel" aria-label="Voice mathematics" data-testid="voice-panel">
      <div className="voice-panel__header">
        <div>
          <span className={`voice-pulse voice-pulse--${voiceState}`} aria-hidden="true" />
          <strong>Voice math</strong>
          <span className="voice-state">{voiceState.replaceAll('-', ' ')}</span>
        </div>
        <button type="button" aria-label="Close voice input" onClick={close}>×</button>
      </div>

      {!provider.supported ? (
        <p className="voice-message">
          Web Speech recognition is unavailable in this browser. Nothing is being simulated; the
          replaceable speech-provider boundary remains ready for another engine.
        </p>
      ) : candidate ? (
        <div className="voice-candidate">
          <p className="transcript">“{candidate.transcript}”</p>
          <math-field
            class="candidate-math"
            read-only="true"
            aria-label="Provisional voice mathematics"
            ref={(element) => {
              if (element && (element as MathfieldElement).value !== candidate.latex) {
                (element as MathfieldElement).value = candidate.latex;
              }
            }}
          />
          {!candidate.isFinal && <span className="provisional-label">provisional</span>}
          {candidate.ambiguities.map((ambiguity) => (
            <p className="ambiguity" key={ambiguity}>{ambiguity}</p>
          ))}
          {candidate.unknownTokens.length > 0 && (
            <p className="ambiguity">
              Check unrecognized words: {candidate.unknownTokens.join(', ')}
            </p>
          )}
          {candidate.latency.totalVisibleLatencyMs !== undefined && (
            <p className="latency-readout">
              Recognition → candidate {candidate.latency.recognitionToCandidateMs.toFixed(1)} ms ·
              render {candidate.latency.candidateToRenderMs?.toFixed(1)} ms · total{' '}
              {candidate.latency.totalVisibleLatencyMs.toFixed(1)} ms
            </p>
          )}
        </div>
      ) : (
        <p className="voice-message">
          Speak a supported expression. The transcript and structured candidate stay provisional
          until you accept them.
        </p>
      )}

      {error && <p className="voice-error" role="alert">{error}</p>}
      <div className="voice-actions">
        {(voiceState === 'idle' || voiceState === 'finished' || voiceState === 'error') && provider.supported && (
          <button type="button" className="primary-button" onClick={start}>
            Start listening
          </button>
        )}
        {['requesting-microphone', 'listening', 'interim-transcript', 'finalizing'].includes(voiceState) && (
          <button type="button" onClick={() => provider.stop()}>Finish</button>
        )}
        {candidate && (
          <button
            type="button"
            className="primary-button"
            disabled={!candidate.latex}
            onClick={() => {
              controller.accept(candidate, insertionPoint);
              close();
            }}
          >
            Insert candidate
          </button>
        )}
        <button type="button" onClick={close}>Cancel</button>
      </div>
      <p className="voice-footnote">Try “x squared plus six x minus forty equals zero”.</p>
    </section>
  );
}

