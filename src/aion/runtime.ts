import type { NotebookContext } from '../extensions/providers';

export const AION_DISPLAY_NAME = 'AION';
export const AION_BASE_MODEL = 'qwen3:8b';
export const AION_BROWSER_MODEL = 'Qwen3-8B-q4f16_1-MLC';
export const AION_ONLINE_MODEL = 'Mistral Small 3.1 24B';
export const AION_RUNTIME_DESCRIPTION = 'Qwen3 8B · on-device browser or Ollama runtime';
export const AION_APPROXIMATE_DOWNLOAD = 'several gigabytes on first use';

export type AIONRuntimeStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';
export type AIONProvider = 'on-device' | 'online';

export function formatAIONElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

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
    'You are AION inside a mathematical notebook.',
    'Analyze only the supplied current-page objects. Do not claim that you edited the notebook.',
    'Respect vertical order, spacing, and text notes. Do not merge unrelated questions.',
    'Identify likely problem groups, possible systems of equations, suspicious speech-recognition text, and useful next steps.',
    'Complete the requested derivation. Use as much space as needed for the important steps, normally no more than 800 words.',
    'Use short Markdown headings and lists. Never use a code fence.',
    'Write inline mathematics inside \\( ... \\) and display mathematics inside \\[ ... \\] so the notebook can typeset it.',
    'Do not present LaTeX source, programming code, or hidden reasoning. State uncertainty honestly.',
    'Never invent bounds, a region, or a numerical value for an integral when they are absent from the page. Treat an unbounded multiple integral as an indefinite iterated integral in its written differential order.',
    'Do not repeat completed steps or headings.',
    'Before the final answer, verify the result by a second applicable method. Name only a check you actually performed; if independent verification is unavailable, say that plainly rather than inventing a CAS, numerical, or graph check.',
    '',
    `Notebook: ${context.notebook.title}`,
    `Page: ${context.currentPage.order + 1}`,
    'Ordered page objects:',
    aionPageObjectText(context) || '(blank page)',
  ].join('\n');
}
