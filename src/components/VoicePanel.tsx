import { useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { MATH_PALETTE_CATEGORIES } from '../domain/mathNotation';
import { useNotebookStore } from '../store/notebookStore';
import {
  markNotebookCandidateRendered,
  parseNotebookSpeech,
} from '../voice/notebookSpeechParser';
import { NotebookVoiceInsertionController } from '../voice/voiceInsertionController';
import { WebSpeechProvider } from '../voice/webSpeechProvider';
import type { NotebookVoiceCandidate, VoiceState } from '../voice/types';
import { refineVoiceCandidateWithAION } from '../voice/aionVoiceInterpreter';

export function VoicePanel() {
  const provider = useMemo(() => new WebSpeechProvider(), []);
  const controller = useMemo(() => new NotebookVoiceInsertionController(), []);
  const setTool = useNotebookStore((state) => state.setTool);
  const undo = useNotebookStore((state) => state.undo);
  const deleteSelectedObject = useNotebookStore((state) => state.deleteSelectedObject);
  const [voiceState, setVoiceState] = useState<VoiceState>(provider.supported ? 'idle' : 'unsupported');
  const [candidate, setCandidate] = useState<NotebookVoiceCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aionVoiceState, setAionVoiceState] = useState<'idle' | 'refining' | 'refined' | 'fallback'>('idle');
  const mounted = useRef(true);
  const refinementRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refinementRef.current?.abort();
      provider.cancel();
    };
  }, [provider]);

  useEffect(() => {
    if (!candidate || candidate.latency.renderTimestamp) return;
    const frame = requestAnimationFrame(() => {
      if (mounted.current) {
        setCandidate((current) => current ? markNotebookCandidateRendered(current) : null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [candidate]);

  function close() {
    provider.cancel();
    refinementRef.current?.abort();
    controller.cancel();
    setTool('select');
  }

  function start() {
    setError(null);
    setCandidate(null);
    setAionVoiceState('idle');
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
        const deterministic = parseNotebookSpeech(
          transcript.text,
          transcript.recognitionTimestamp,
          transcript.isFinal,
        );
        setCandidate(deterministic);
        if (transcript.isFinal) {
          refinementRef.current?.abort();
          const controller = new AbortController();
          refinementRef.current = controller;
          setAionVoiceState('refining');
          void refineVoiceCandidateWithAION(deterministic, controller.signal)
            .then((refined) => {
              if (!mounted.current || controller.signal.aborted) return;
              setCandidate(refined);
              setAionVoiceState('refined');
            })
            .catch(() => {
              if (!mounted.current || controller.signal.aborted) return;
              setAionVoiceState('fallback');
            });
        }
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
    <section className="voice-panel" aria-label="Voice notebook dictation" data-testid="voice-panel">
      <div className="voice-panel__header">
        <div>
          <span className={`voice-pulse voice-pulse--${voiceState}`} aria-hidden="true" />
          <strong>Voice notes</strong>
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
          <div className="voice-segments">
            {candidate.segments.map((segment, index) => (
              <div className={`voice-segment voice-segment--${segment.kind}`} key={`${index}-${segment.sourceText}`}>
                <span className="voice-segment__kind">{segment.kind}</span>
                {segment.kind === 'math' ? (
                  <math-field
                    class="candidate-math"
                    read-only="true"
                    aria-label={`Provisional mathematics line ${index + 1}`}
                    ref={(element) => {
                      const latex = segment.latex ?? '';
                      if (element && (element as MathfieldElement).value !== latex) {
                        (element as MathfieldElement).value = latex;
                      }
                    }}
                  />
                ) : (
                  <p className="candidate-text">{segment.text}</p>
                )}
                {segment.ambiguities.map((ambiguity) => (
                  <p className="ambiguity" key={ambiguity}>{ambiguity}</p>
                ))}
                {segment.unknownTokens.length > 0 && (
                  <p className="ambiguity">
                    Check math words: {segment.unknownTokens.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          {!candidate.isFinal && <span className="provisional-label">provisional</span>}
          {candidate.isFinal && (
            <p className={`aion-voice-state aion-voice-state--${aionVoiceState}`} role="status">
              {aionVoiceState === 'refining' && 'AION is interpreting this locally; the deterministic draft remains usable.'}
              {aionVoiceState === 'refined' && 'Interpreted by local AION. Review before inserting.'}
              {aionVoiceState === 'fallback' && 'AION was unavailable; using the deterministic local parser.'}
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
          Dictate mathematics or ordinary notes. Say “then” or “next line” to continue on a new
          ruled line. Everything stays provisional until you accept it.
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
            disabled={candidate.segments.length === 0}
            onClick={() => {
              controller.accept(candidate);
              close();
            }}
          >
            Insert lines
          </button>
        )}
        <button type="button" onClick={close}>Cancel</button>
      </div>
      <details className="voice-guide">
        <summary>What can I say?</summary>
        <div className="voice-guide__content">
          <section>
            <strong>Notebook dictation</strong>
            <ul>
              <li><span>New line</span><q>x equals six, then y equals eight</q></li>
              <li><span>Text note</span><q>remember to check the boundary</q></li>
              <li><span>Mixed</span><q>x equals six, then this is a rough note</q></li>
            </ul>
          </section>
          {MATH_PALETTE_CATEGORIES.map((category) => (
            <section key={category.id}>
              <strong>{category.label}</strong>
              <ul>
                {category.items.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <q>{item.voice.phrase}</q>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
      <p className="voice-footnote">Try “x equals six, then y equals eight”.</p>
    </section>
  );
}
