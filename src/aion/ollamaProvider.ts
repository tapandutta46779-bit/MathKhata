import type { NotebookContext } from '../extensions/providers';
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

function cleanVisibleAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```(?:latex|tex|math)\s*([\s\S]*?)```/gi, (_, math: string) => `\\[${math.trim()}\\]`)
    .replace(/```(?:markdown|text)?\s*([\s\S]*?)```/gi, (_, content: string) => content.trim())
    .trim();
}

export async function checkAIONLocal(signal?: AbortSignal): Promise<AIONLocalStatus> {
  try {
    const response = await fetch(`${AION_OLLAMA_ENDPOINT}/api/tags`, { signal });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const payload = await response.json() as OllamaTagsResponse;
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
  } catch {
    return {
      reachable: false,
      modelReady: false,
      model: AION_OLLAMA_MODEL,
      message: 'AION is unavailable. Notebook editing and the checked local solver still work without it.',
    };
  }
}

export async function askAIONLocal(
  prompt: string,
  options: { signal?: AbortSignal; json?: boolean; temperature?: number; onUpdate?: (text: string) => void } = {},
): Promise<AIONAnswer> {
  const response = await fetch(`${AION_OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      model: AION_OLLAMA_MODEL,
      stream: true,
      think: false,
      ...(options.json ? { format: 'json' } : {}),
      options: {
        temperature: options.temperature ?? 0.35,
        top_p: 0.9,
        num_ctx: 16384,
        num_predict: 1536,
      },
      messages: [
        {
          role: 'system',
          content: [
            'You are AION, the private local mathematical research assistant inside MathKhata.',
            'Be precise and pedagogical. Show useful solution steps in the visible answer, but never reveal hidden chain-of-thought.',
            'Separate independent questions. Use the supplied page context only. State uncertainty and assumptions honestly.',
            'Never claim that you edited notebook content. Never use Markdown code fences.',
            'Put inline mathematics in \\( ... \\) and display mathematics in \\[ ... \\].',
            'Render every formula as mathematics, never as raw LaTeX source or programming code.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as OllamaChatResponse;
    throw new Error(payload.error || `AION returned ${response.status}.`);
  }
  if (!response.body) throw new Error('AION returned no response stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
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
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
  const text = cleanVisibleAnswer(answerText);
  if (!text) throw new Error('AION returned an empty response.');
  return { text, model: AION_OLLAMA_MODEL, runtime: 'ollama' };
}

export function askAIONAboutPage(
  context: NotebookContext,
  question?: string,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
): Promise<AIONAnswer> {
  const prompt = question?.trim()
    ? `${createAIONPagePrompt(context)}\n\nUser question:\n${question.trim()}\n\nAnswer the question with clear, checkable steps.`
    : createAIONPagePrompt(context);
  return askAIONLocal(prompt, { signal, onUpdate });
}
