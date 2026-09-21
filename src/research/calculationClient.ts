export type ResearchTask =
  | { kind: 'normalize'; expression: string; allowedSymbols: readonly string[] }
  | { kind: 'evaluate'; expression: string }
  | { kind: 'scientific'; expression: string; previousAnswer: string; angleUnit: 'radians' | 'degrees' };

// Keep symbolic work away from input, canvas events and the browser's UI thread.
// Separate lanes prevent a slow integral from holding up graph normalization.
function createLane() {
  let worker: Worker | null = null;
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const stop = (message: string) => {
    worker?.terminate(); worker = null;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
    pending.clear();
  };
  return (task: ResearchTask): Promise<unknown> => {
    if (pending.size >= 64) return Promise.reject(new Error('Research is busy. Please try again after the current calculation.'));
    if (!worker) {
      worker = new Worker(new URL('./calculation.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<{ id: number; value?: unknown; error?: string }>) => {
        const entry = pending.get(data.id); if (!entry) return;
        clearTimeout(entry.timer); pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.value);
      };
      worker.onerror = () => stop('The local calculation worker stopped. Please try again.');
    }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stop('This calculation exceeded the local time limit. Simplify it and try again.'), 8_000);
      pending.set(id, { resolve, reject, timer });
      worker!.postMessage({ id, task });
    });
  };
}
const normalize = createLane();
const calculate = createLane();
export const hasResearchWorker = () => typeof window !== 'undefined' && typeof Worker !== 'undefined';
export async function runResearchTask<T>(task: ResearchTask): Promise<T> {
  return await (task.kind === 'normalize' ? normalize(task) : calculate(task)) as T;
}
