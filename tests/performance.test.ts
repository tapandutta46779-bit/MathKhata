import { describe, expect, it } from 'vitest';
import { parseMathSpeech } from '../src/voice/mathSpeechParser';

describe('fluency performance checks', () => {
  it('parses supported speech well below the visible-latency budget', () => {
    const utterances = [
      'x squared plus six x minus forty equals zero',
      'x equals negative six plus or minus square root of thirty six plus one hundred sixty all over two',
      'integral from zero to two x squared d x',
      'sum from n equals one to infinity one over n squared',
    ];
    const samples: number[] = [];
    for (let run = 0; run < 1_000; run += 1) {
      const start = performance.now();
      parseMathSpeech(utterances[run % utterances.length], start);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const averageMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
    const p95Ms = samples[Math.floor(samples.length * 0.95)];
    const maxMs = samples.at(-1) ?? 0;
    console.info(
      `Spoken-math parser: 1000 runs, average ${averageMs.toFixed(3)} ms, p95 ${p95Ms.toFixed(3)} ms, max ${maxMs.toFixed(3)} ms`,
    );
    expect(p95Ms).toBeLessThan(10);
  });
});

