import { describe, expect, it } from 'vitest';
import { createNotebook } from '../src/domain/notebook';
import { MATH_PALETTE_CATEGORIES } from '../src/domain/mathNotation';
import { WRITING_LINE_HEIGHT, WRITING_TOP } from '../src/domain/writingFlow';
import { useNotebookStore } from '../src/store/notebookStore';
import {
  parseNotebookSpeech,
  splitNotebookSpeech,
} from '../src/voice/notebookSpeechParser';
import { NotebookVoiceInsertionController } from '../src/voice/voiceInsertionController';
import { WebSpeechProvider } from '../src/voice/webSpeechProvider';

function compact(latex: string | undefined): string {
  return (latex ?? '').replace(/\s+/g, '');
}

describe('notebook voice parsing', () => {
  it('treats “then” as a new notebook line and keeps both equations', () => {
    const candidate = parseNotebookSpeech('x is equal to 6 then y is equal to 8', 0);

    expect(candidate.segments).toHaveLength(2);
    expect(candidate.segments.map((segment) => segment.kind)).toEqual(['math', 'math']);
    expect(compact(candidate.segments[0].latex)).toBe('x=6');
    expect(compact(candidate.segments[1].latex)).toBe('y=8');
  });

  it.each(['then', 'next line', 'new line', 'after that', ';']) (
    'recognizes “%s” as a line separator',
    (separator) => {
      expect(splitNotebookSpeech(`x equals 6 ${separator} y equals 8`)).toEqual([
        'x equals 6',
        'y equals 8',
      ]);
    },
  );

  it('preserves ordinary and unfamiliar dictation as text', () => {
    const candidate = parseNotebookSpeech('remember quasarvani before the boundary', 0);

    expect(candidate.segments).toEqual([
      expect.objectContaining({
        kind: 'text',
        text: 'remember quasarvani before the boundary',
        unknownTokens: [],
      }),
    ]);
  });

  it('keeps a noisy prose-like recognition result out of mathematics', () => {
    const candidate = parseNotebookSpeech('then why why x plus y x plus y', 0);

    expect(candidate.segments).toHaveLength(1);
    expect(candidate.segments[0]).toMatchObject({
      kind: 'text',
      text: 'why why x plus y x plus y',
    });
  });

  it('supports mixed mathematics and notes in one utterance', () => {
    const candidate = parseNotebookSpeech(
      'x squared plus six equals forty two then remember to check the boundary',
      0,
    );

    expect(candidate.segments.map((segment) => segment.kind)).toEqual(['math', 'text']);
    expect(compact(candidate.segments[0].latex)).toBe('x^2+6=42');
    expect(candidate.segments[1].text).toBe('remember to check the boundary');
  });

  it('understands spoken multiplication using “into”', () => {
    const candidate = parseNotebookSpeech('six into four', 0);

    expect(candidate.segments[0].kind).toBe('math');
    expect(compact(candidate.segments[0].latex)).toBe('6\\times4');
  });

  it.each(
    MATH_PALETTE_CATEGORIES.flatMap((category) =>
      category.items.map((item) => [category.label, item.label, item.voice.phrase] as const),
    ),
  )('classifies the %s palette phrase “%s” as mathematics', (_category, _label, phrase) => {
    expect(parseNotebookSpeech(phrase, 0).segments[0]?.kind).toBe('math');
  });

  it('accepts every segment as an editable object on successive ruled lines', () => {
    const notebook = createNotebook('Voice flow');
    useNotebookStore.setState({
      notebook,
      currentPageId: notebook.pages[0].id,
      selectedObjectId: null,
      editingObjectId: null,
      undoStack: [],
      redoStack: [],
    });
    const candidate = parseNotebookSpeech(
      'x equals six then remember the boundary then y equals eight',
      0,
    );

    const ids = new NotebookVoiceInsertionController().accept(candidate);
    const objects = useNotebookStore.getState().notebook?.pages[0].objects ?? [];

    expect(ids).toHaveLength(3);
    expect(objects.map((object) => object.type)).toEqual(['math', 'text', 'math']);
    expect(objects.map((object) => object.y)).toEqual([
      WRITING_TOP,
      WRITING_TOP + WRITING_LINE_HEIGHT,
      WRITING_TOP + WRITING_LINE_HEIGHT * 2,
    ]);
  });

  it('retries without contextual phrases when Chrome advertises but rejects them', async () => {
    const browserWindow = window as typeof window & {
      webkitSpeechRecognition?: new () => FakeRecognition;
      SpeechRecognitionPhrase?: new (phrase: string, boost?: number) => { phrase: string; boost: number };
    };
    const originalRecognition = browserWindow.webkitSpeechRecognition;
    const originalPhrase = browserWindow.SpeechRecognitionPhrase;
    const instances: FakeRecognition[] = [];

    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 1;
      phrases: Array<{ phrase: string; boost: number }> = [];
      onstart: (() => void) | null = null;
      onresult = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      starts = 0;

      start() {
        this.starts += 1;
        if (this.starts === 1 && this.phrases.length > 0) {
          queueMicrotask(() => {
            this.onerror?.({ error: 'phrases-not-supported' });
            this.onend?.();
          });
        } else {
          queueMicrotask(() => this.onstart?.());
        }
      }

      stop() {}
      abort() {}
    }

    try {
      browserWindow.webkitSpeechRecognition = class extends FakeRecognition {
        constructor() {
          super();
          instances.push(this);
        }
      };
      browserWindow.SpeechRecognitionPhrase = class {
        constructor(readonly phrase: string, readonly boost = 1) {}
      };
      const states: string[] = [];
      const errors: string[] = [];
      const provider = new WebSpeechProvider();

      provider.start({
        onState: (state) => states.push(state),
        onTranscript: () => undefined,
        onError: (error) => errors.push(error),
        onEnd: () => undefined,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(instances).toHaveLength(2);
      expect(instances[0]?.starts).toBe(1);
      expect(instances[1]?.starts).toBe(1);
      expect(instances[1]?.phrases).toEqual([]);
      expect(states).toContain('listening');
      expect(errors).toEqual([]);
      provider.cancel();
    } finally {
      browserWindow.webkitSpeechRecognition = originalRecognition;
      browserWindow.SpeechRecognitionPhrase = originalPhrase;
    }
  });
});
