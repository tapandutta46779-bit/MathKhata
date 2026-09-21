import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('terminates a stalled CAS worker, leaves graph normalization independent, and recovers', async () => {
  vi.useFakeTimers(); vi.resetModules();
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    messages: any[] = [];
    terminate = vi.fn();
    constructor() { FakeWorker.instances.push(this); }
    postMessage(value: unknown) { this.messages.push(value); }
    answer(value: unknown) { this.onmessage?.({ data: { id: this.messages.at(-1).id, value } }); }
  }
  vi.stubGlobal('Worker', FakeWorker);
  const { runResearchTask } = await import('../src/research/calculationClient');
  const stalled = runResearchTask({ kind: 'evaluate', expression: 'expensive expression' });
  const rejected = expect(stalled).rejects.toThrow('time limit');
  const graph = runResearchTask({ kind: 'normalize', expression: 'x^2', allowedSymbols: ['x'] });
  FakeWorker.instances[1].answer('x^2');
  await expect(graph).resolves.toBe('x^2');
  await vi.advanceTimersByTimeAsync(8000);
  await rejected;
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  expect(FakeWorker.instances[1].terminate).not.toHaveBeenCalled();
  const next = runResearchTask({ kind: 'evaluate', expression: '1+1' });
  FakeWorker.instances[2].answer({ exact: '2' });
  await expect(next).resolves.toEqual({ exact: '2' });
});
