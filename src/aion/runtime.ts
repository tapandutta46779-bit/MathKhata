import type { NotebookContext } from '../extensions/providers';

export const AION_DISPLAY_NAME = 'Local Qwen Assistant';
export const AION_BASE_MODEL = 'qwen3:8b';
export const AION_BROWSER_FALLBACK_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
export const AION_RUNTIME_DESCRIPTION = 'Qwen3 8B · Q4_K_M · Ollama · optional on-device runtime';
export const AION_APPROXIMATE_DOWNLOAD = 'about 5.2 GB';

export type AIONRuntimeStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

export type AIONWorkerRequest =
  | { type: 'load' }
  | { type: 'analyze'; prompt: string };

export type AIONWorkerResponse =
  | { type: 'progress'; progress?: number; message: string }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string };

export function aionPageObjectText(context: NotebookContext): string {
  return [...context.currentPage.objects]
    .sort((left, right) => left.y - right.y || left.x - right.x || left.zIndex - right.zIndex)
    .map((object, index) => {
      const content = object.type === 'math' ? object.latex : object.text;
      return `${index + 1}. ${object.type.toUpperCase()} at (${object.x}, ${object.y}): ${content}`;
    })
    .join('\n');
}

export function createAIONPagePrompt(context: NotebookContext): string {
  return [
    'You are the optional Local Qwen Assistant inside a mathematical notebook.',
    'Analyze only the supplied current-page objects. Do not claim that you edited the notebook.',
    'Respect vertical order, spacing, and text notes. Do not merge unrelated questions.',
    'Identify likely problem groups, possible systems of equations, suspicious speech-recognition text, and useful next steps.',
    'Complete the requested derivation. Use as much space as needed for the important steps, normally no more than 800 words.',
    'Use short Markdown headings and lists. Never use a code fence.',
    'Write inline mathematics inside \\( ... \\) and display mathematics inside \\[ ... \\] so the notebook can typeset it.',
    'Do not present LaTeX source, programming code, or hidden reasoning. State uncertainty honestly.',
    '',
    `Notebook: ${context.notebook.title}`,
    `Page: ${context.currentPage.order + 1}`,
    'Ordered page objects:',
    aionPageObjectText(context) || '(blank page)',
  ].join('\n');
}
