import type { NotebookContext } from '../extensions/providers';
import { canOfferLocalSolve, solveLocally } from '../assistant/localMathSolver';
import { createAIONPagePrompt } from './runtime';

export const AION_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
export const AION_OLLAMA_MODEL = 'qwen3:8b';

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
    thinking?: string;
  };
  error?: string;
}

export interface AIONLocalStatus {
  reachable: boolean;
  modelReady: boolean;
  model: string;
  message: string;
}

export interface AIONAnswer {
  text: string;
  model: string;
  runtime: 'ollama';
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function cleanVisibleAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/gi, '')
    .replace(/<t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?$/i, '')
    .replace(/```(?:latex|tex|math)\s*([\s\S]*?)```/gi, (_, math: string) => `\\[${math.trim()}\\]`)
    .replace(/```(?:markdown|text)?\s*([\s\S]*?)```/gi, (_, content: string) => content.trim())
    .trim();
}

export async function checkAIONLocal(signal?: AbortSignal): Promise<AIONLocalStatus> {
  try {
    const desktop = window.mathKhataDesktop?.aion;
    let payload: OllamaTagsResponse;
    if (desktop) {
      payload = await withAbort(desktop.check(), signal);
    } else {
      const response = await fetch(`${AION_OLLAMA_ENDPOINT}/api/tags`, { signal });
      if (!response.ok) throw new Error(`AION returned ${response.status}`);
      payload = await response.json() as OllamaTagsResponse;
    }
    const modelReady = payload.models?.some((entry) => {
      const name = entry.name ?? entry.model ?? '';
      return name === AION_OLLAMA_MODEL || name.startsWith(`${AION_OLLAMA_MODEL}:`);
    }) ?? false;
    return {
      reachable: true,
      modelReady,
      model: AION_OLLAMA_MODEL,
      message: modelReady
        ? 'AION is ready on this Mac.'
        : 'AION is still preparing or is not installed.',
    };
  } catch (error) {
    const reason = error instanceof Error && error.message
      ? error.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
      : 'the private local service could not be reached';
    return {
      reachable: false,
      modelReady: false,
      model: AION_OLLAMA_MODEL,
      message: `AION is unavailable: ${reason}. Notebook editing and the checked local solver still work without it.`,
    };
  }
}

export async function askAIONLocal(
  prompt: string,
  options: { signal?: AbortSignal; json?: boolean; temperature?: number; onUpdate?: (text: string) => void } = {},
): Promise<AIONAnswer> {
  const requestPayload = {
    ...(options.json ? { format: 'json' as const } : {}),
    options: {
      temperature: options.temperature ?? 0.35,
      top_p: 0.9,
      num_ctx: 16384,
      num_predict: 1536,
    },
    messages: [
      {
        role: 'system' as const,
        content: [
          'You are AION, the private local mathematical research assistant inside MathKhata.',
          'Be precise and pedagogical. Show useful solution steps in the visible answer, but never reveal hidden chain-of-thought.',
          'Separate independent questions. Use the supplied page context only. State uncertainty and assumptions honestly.',
          'Never claim that you edited notebook content. Never use Markdown code fences.',
          'Put inline mathematics in \\( ... \\) and display mathematics in \\[ ... \\].',
          'Render every formula as mathematics, never as raw LaTeX source or programming code.',
        ].join(' '),
      },
      { role: 'user' as const, content: prompt },
    ],
  };
  let buffer = '';
  let answerText = '';
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const payload = JSON.parse(line) as OllamaChatResponse;
    if (payload.error) throw new Error(payload.error);
    answerText += payload.message?.content ?? '';
    const visible = cleanVisibleAnswer(answerText);
    if (visible) options.onUpdate?.(visible);
  };
  const desktop = window.mathKhataDesktop?.aion;
  if (desktop) {
    const requestId = globalThis.crypto?.randomUUID?.()
      ?? `aion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let streamFailure: unknown;
    const consumeChunk = (chunk: string) => {
      if (streamFailure) return;
      try {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(consumeLine);
      } catch (error) {
        streamFailure = error;
        desktop.cancel(requestId);
      }
    };
    const cancel = () => desktop.cancel(requestId);
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      await withAbort(desktop.chat(requestId, requestPayload, consumeChunk), options.signal);
      if (streamFailure) throw streamFailure;
    } finally {
      options.signal?.removeEventListener('abort', cancel);
    }
  } else {
    const response = await fetch(`${AION_OLLAMA_ENDPOINT}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        model: AION_OLLAMA_MODEL,
        stream: true,
        think: false,
        ...requestPayload,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as OllamaChatResponse;
      throw new Error(payload.error || `AION returned ${response.status}.`);
    }
    if (!response.body) throw new Error('AION returned no response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
    }
    buffer += decoder.decode();
  }
  if (buffer.trim()) consumeLine(buffer);
  const text = cleanVisibleAnswer(answerText);
  if (!text) throw new Error('AION returned an empty response.');
  return { text, model: AION_OLLAMA_MODEL, runtime: 'ollama' };
}

export function canCheckWithoutBlockingAION(latex: string): boolean {
  if (latex.length > 300) return false;
  const compact = latex.replace(/\s+/g, '');
  // Nerdamer's calculus routines are synchronous. Positive quadratic
  // exponentials and nested/series operators can occupy the renderer for
  // minutes, preventing the desktop request—and visible streaming—from even
  // starting. They remain available through the explicit checked solver, but
  // never run as a prerequisite for an AION conversation.
  if (/\\(?:iint|iiint|oint|sum|prod|lim)(?![a-zA-Z])/.test(compact)) return false;
  if (/e\^\{[^{}]*[a-zA-Z]\^\{?2\}?[^{}]*\}|\\exp(?:\\left)?\([^)]*[a-zA-Z]\^\{?2\}?/.test(compact)) return false;
  return true;
}

async function createCheckedPageResults(context: NotebookContext): Promise<string> {
  const objects = [...context.currentPage.objects]
    .sort((left, right) => left.y - right.y || left.x - right.x || left.zIndex - right.zIndex);
  const checked: string[] = [];

  for (const [index, object] of objects.entries()) {
    if (
      object.type !== 'math'
      || !canOfferLocalSolve(object.latex)
      || !canCheckWithoutBlockingAION(object.latex)
    ) continue;
    try {
      const result = await solveLocally(object.latex);
      const steps = result.steps
        ?.map((step) => `${step.label}: ${step.latex ?? step.text ?? ''}`)
        .filter(Boolean)
        .join('; ');
      checked.push([
        `Line ${index + 1} (${object.latex})`,
        `${result.label}: ${result.resultLatex}`,
        result.explanation,
        steps ? `Checked method: ${steps}` : '',
      ].filter(Boolean).join('. '));
    } catch {
      // Unsupported or incomplete lines remain visible in the page context;
      // AION must describe uncertainty rather than receiving a false result.
    }
  }

  return checked.join('\n');
}

export async function askAIONAboutPage(
  context: NotebookContext,
  question?: string,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
): Promise<AIONAnswer> {
  const checkedResults = await createCheckedPageResults(context);
  const checkedSection = checkedResults
    ? [
        '',
        'Checked local mathematical results:',
        'These deterministic CAS and numerical results are the computational references for this answer.',
        'Do not invent or repeat a conflicting value. If notation is ambiguous, explicitly identify the ambiguity before interpreting it.',
        checkedResults,
      ].join('\n')
    : '';
  const pagePrompt = `${createAIONPagePrompt(context)}${checkedSection}`;
  const prompt = question?.trim()
    ? `${pagePrompt}\n\nUser question:\n${question.trim()}\n\nAnswer the question with clear, checkable steps. For approximations, distinguish a coarse estimate from the checked value.`
    : pagePrompt;
  return askAIONLocal(prompt, { signal, onUpdate });
}
