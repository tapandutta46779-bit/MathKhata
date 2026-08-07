import type { NotebookContext } from '../extensions/providers';

export const AION_DISPLAY_NAME = 'AION';
export const AION_BASE_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
export const AION_RUNTIME_DESCRIPTION = 'Qwen2.5 0.5B Instruct · ONNX q4 · Transformers.js';
export const AION_APPROXIMATE_DOWNLOAD = 'about 0.5 GB';

export type AIONRuntimeStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

export type AIONWorkerRequest =
  | { type: 'load' }
  | { type: 'analyze'; prompt: string };

export type AIONWorkerResponse =
  | { type: 'progress'; progress?: number; message: string }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string };

function objectText(context: NotebookContext): string {
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
    'You are AION, an optional private assistant inside a mathematical notebook.',
    'Analyze only the supplied current-page objects. Do not claim that you edited the notebook.',
    'Respect vertical order, spacing, and text notes. Do not merge unrelated questions.',
    'Identify likely problem groups, possible systems of equations, suspicious speech-recognition text, and useful next steps.',
    'Keep the response under 220 words. Use plain text with short headings. State uncertainty honestly.',
    '',
    `Notebook: ${context.notebook.title}`,
    `Page: ${context.currentPage.order + 1}`,
    'Ordered page objects:',
    objectText(context) || '(blank page)',
  ].join('\n');
}
