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
        : `Ollama is running; ${AION_OLLAMA_MODEL} is still downloading or is not installed.`,
    };
  } catch {
    return {
      reachable: false,
      modelReady: false,
      model: AION_OLLAMA_MODEL,
      message: 'Start the local Ollama service to use AION. Notebook editing and local CAS still work without it.',
    };
  }
}

export async function askAIONLocal(
  prompt: string,
  options: { signal?: AbortSignal; json?: boolean; temperature?: number } = {},
): Promise<AIONAnswer> {
  const response = await fetch(`${AION_OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      model: AION_OLLAMA_MODEL,
      stream: false,
      think: true,
      ...(options.json ? { format: 'json' } : {}),
      options: {
        temperature: options.temperature ?? 0.35,
        top_p: 0.9,
        num_ctx: 16384,
      },
      messages: [
        {
          role: 'system',
          content: [
            'You are AION, the private local mathematical research assistant inside MathKhata.',
            'Be precise and pedagogical. Show useful solution steps in the visible answer, but never reveal hidden chain-of-thought.',
            'Separate independent questions. Use the supplied page context only. State uncertainty and assumptions honestly.',
            'Never claim that you edited notebook content. Use readable Markdown and LaTeX.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const payload = await response.json() as OllamaChatResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `AION returned ${response.status}.`);
  }
  const text = cleanVisibleAnswer(payload.message?.content ?? '');
  if (!text) throw new Error('AION returned an empty response.');
  return { text, model: AION_OLLAMA_MODEL, runtime: 'ollama' };
}

export function askAIONAboutPage(
  context: NotebookContext,
  question?: string,
  signal?: AbortSignal,
): Promise<AIONAnswer> {
  const prompt = question?.trim()
    ? `${createAIONPagePrompt(context)}\n\nUser question:\n${question.trim()}\n\nAnswer the question with clear, checkable steps.`
    : createAIONPagePrompt(context);
  return askAIONLocal(prompt, { signal });
}
