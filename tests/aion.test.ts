import { afterEach, describe, expect, it, vi } from 'vitest';
import { AION_BASE_MODEL, AION_DISPLAY_NAME, createAIONPagePrompt } from '../src/aion/runtime';
import { askAIONLocal, checkAIONLocal } from '../src/aion/ollamaProvider';
import { createNotebook, createMathObject, createTextObject, addObject } from '../src/domain/notebook';
import { createDocumentContext } from '../src/extensions/providers';

describe('AION local-runtime boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('uses the exact AION name and discloses a real base model', () => {
    expect(AION_DISPLAY_NAME).toBe('AION');
    expect(AION_BASE_MODEL).toBe('qwen3:8b');
  });

  it('detects the installed Ollama model without sending page content', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: 'qwen3:8b' }],
    }), { status: 200 }));

    const status = await checkAIONLocal();

    expect(status.modelReady).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', { signal: undefined });
  });

  it('uses the private local chat endpoint and hides model thinking from the visible answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: '<think>private scratch work</think>\nVisible checked steps' },
    }), { status: 200 }));

    const answer = await askAIONLocal('Solve x^2=4');

    expect(answer.text).toBe('Visible checked steps');
    expect(answer.model).toBe('qwen3:8b');
  });

  it('normalizes fenced mathematics before it reaches the visible AION answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: '```latex\nx^2+6=42\n```' },
    }), { status: 200 }));

    const answer = await askAIONLocal('Typeset this equation');

    expect(answer.text).toBe('\\[x^2+6=42\\]');
    expect(answer.text).not.toContain('```');
  });

  it('creates a spatially ordered, read-only page prompt', () => {
    const notebook = createNotebook('Analysis notes');
    const page = notebook.pages[0];
    let withObjects = addObject(notebook, page.id, createTextObject({ x: 82, y: 64 }, 'Solve separately'));
    withObjects = addObject(withObjects, page.id, createMathObject({ x: 82, y: 20 }, 'x^2=4'));
    const context = createDocumentContext(withObjects, page.id, null);

    expect(context).not.toBeNull();
    const prompt = createAIONPagePrompt(context!);
    expect(prompt).toContain('You are AION');
    expect(prompt.indexOf('x^2=4')).toBeLessThan(prompt.indexOf('Solve separately'));
    expect(prompt).toContain('Do not claim that you edited the notebook');
  });
});
