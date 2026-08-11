import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AION_BASE_MODEL,
  AION_BROWSER_MODEL,
  AION_DISPLAY_NAME,
  createAIONPagePrompt,
} from '../src/aion/runtime';
import {
  askAIONAboutPage,
  askAIONLocal,
  canCheckWithoutBlockingAION,
  checkAIONLocal,
  parsePublicAIONEvent,
} from '../src/aion/ollamaProvider';
import { AION_WEBGPU_MODEL } from '../src/aion/webgpuProvider';
import { createNotebook, createMathObject, createTextObject, addObject } from '../src/domain/notebook';
import { createDocumentContext } from '../src/extensions/providers';

describe('AION provider boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not block live AION streaming on expensive synchronous calculus preflight', () => {
    expect(canCheckWithoutBlockingAION('x^2=9')).toBe(true);
    expect(canCheckWithoutBlockingAION('\\int_0^1 e^x x\\sin(x^3)\\,dx')).toBe(true);
    expect(canCheckWithoutBlockingAION('\\int_0^2 e^{x^2}(x^3+5)\\,dx')).toBe(false);
    expect(canCheckWithoutBlockingAION('\\iint_D f(x,y)\\,dx\\,dy')).toBe(false);
    expect(canCheckWithoutBlockingAION('\\iiint xy^2\\left(z+x\\sin z\\right)\\,dx\\,dy\\,dz')).toBe(true);
    expect(canCheckWithoutBlockingAION('\\sum_{n=1}^{\\infty}n^{-2}')).toBe(false);
  });

  it('uses the requested AION public name while retaining the provider model internally', () => {
    expect(AION_DISPLAY_NAME).toBe('AION');
    expect(AION_BASE_MODEL).toBe('qwen3:8b');
    expect(AION_BROWSER_MODEL).toBe('Qwen3-8B-q4f16_1-MLC');
    expect(AION_WEBGPU_MODEL).toBe(AION_BROWSER_MODEL);
  });

  it('assembles visible online SSE chunks and detects the generation boundary', () => {
    expect(parsePublicAIONEvent('data: {"response":"First"}\n\n')).toEqual({
      text: 'First', done: false, truncated: false,
    });
    expect(parsePublicAIONEvent('data: {"choices":[{"delta":{"content":" step"},"finish_reason":"length"}]}\n\n')).toEqual({
      text: ' step', done: true, truncated: true,
    });
    expect(parsePublicAIONEvent('data: [DONE]\n\n')).toEqual({
      text: '', done: true, truncated: false,
    });
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

  it('repairs compact Markdown headings in streamed visible answers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: '###3. Limit\n\\[1/3\\]' },
    }), { status: 200 }));

    const answer = await askAIONLocal('Evaluate the limit');

    expect(answer.text).toBe('### 3. Limit\n\\[1/3\\]');
  });

  it('creates a spatially ordered, read-only page prompt', () => {
    const notebook = createNotebook('Analysis notes');
    const page = notebook.pages[0];
    let withObjects = addObject(notebook, page.id, createTextObject({ x: 82, y: 64 }, 'Solve separately'));
    withObjects = addObject(withObjects, page.id, createMathObject({ x: 82, y: 20 }, 'x^2=4'));
    const context = createDocumentContext(withObjects, page.id, null);

    expect(context).not.toBeNull();
    const prompt = createAIONPagePrompt(context!);
    expect(prompt).toContain('You are AION inside a mathematical notebook');
    expect(prompt.indexOf('x^2=4')).toBeLessThan(prompt.indexOf('Solve separately'));
    expect(prompt).toContain('Do not claim that you edited the notebook');
  });

  it('grounds page answers in checked local mathematics before asking AION', async () => {
    const notebook = createNotebook('Integral notes');
    const page = notebook.pages[0];
    const withIntegral = addObject(
      notebook,
      page.id,
      createMathObject({ x: 82, y: 20 }, '\\int_{0}^{1}e^x x\\left(\\sin x^3\\right)\\,dx'),
    );
    const context = createDocumentContext(withIntegral, page.id, null)!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: 'The checked value is \\(0.42777611548\\).' },
    }), { status: 200 }));

    await askAIONAboutPage(context, 'Evaluate the integral.');

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { messages: Array<{ content: string }> };
    const prompt = body.messages[1].content;
    expect(prompt).toContain('Checked local mathematical results');
    expect(prompt).toContain('\\approx 0.42777611548');
    expect(prompt).toContain('Do not invent or repeat a conflicting value');
  });

  it('grounds an unbounded triple integral without inventing a region or numeric value', async () => {
    const notebook = createNotebook('Triple integral notes');
    const page = notebook.pages[0];
    const expression = '\\iiint xy^2\\left(z+x\\sin z\\right)\\,dx\\,dy\\,dz';
    const withIntegral = addObject(notebook, page.id, createMathObject({ x: 82, y: 20 }, expression));
    const context = createDocumentContext(withIntegral, page.id, null)!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: 'A checked symbolic antiderivative is shown below.' },
    }), { status: 200 }));

    await askAIONAboutPage(context, 'Solve this integral with steps.');

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { messages: Array<{ content: string }> };
    const prompt = body.messages[1].content;
    expect(prompt).toContain('Triple antiderivative');
    expect(prompt).toContain('unbounded multiple integral');
    expect(prompt).toContain('Never invent bounds, a region, or a numerical value');
    expect(prompt).toContain('mixed derivative');
  });

  it('checks question mathematics and diagonal polynomial sphere flux before generation', async () => {
    const notebook = createNotebook('Stress checks');
    const context = createDocumentContext(notebook, notebook.pages[0].id, null)!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: 'Checked solutions.' },
    }), { status: 200 }));
    const question = [
      'Evaluate \\(\\int_0^1\\int_0^2\\int_0^3(x+2y+3z)\\,dz\\,dy\\,dx\\).',
      'For \\(\\mathbf F=(x^3,y^3,z^3)\\), find the outward flux through the unit sphere.',
      'Compute \\(\\det\\begin{pmatrix}2&1&0\\\\1&3&1\\\\0&1&2\\end{pmatrix}\\).',
    ].join(' ');

    await askAIONAboutPage(context, question);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { messages: Array<{ content: string }> };
    const prompt = body.messages[1].content;
    expect(prompt).toContain('Multiple integral value: 42');
    expect(prompt).toContain('Determinant: 8');
    expect(prompt).toContain('outward flux is \\(\\frac{12}{5}\\pi\\)');
    expect(prompt).toContain('exactly one Jacobian factor');
  });
});
