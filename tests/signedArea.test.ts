import { describe, expect, it } from 'vitest';
import { splitSignedAreaSegment } from '../src/research/signedArea';

describe('signed integral area segments', () => {
  it('splits a trapezoid precisely where it crosses the x-axis', () => {
    expect(splitSignedAreaSegment(2, 3, 8, -1)).toEqual([
      { x0: 2, y0: 3, x1: 6.5, y1: 0, positive: true },
      { x0: 6.5, y0: 0, x1: 8, y1: -1, positive: false },
    ]);
  });

  it('keeps same-sign and exact-root segments in their correct colors', () => {
    expect(splitSignedAreaSegment(0, -2, 1, -4)).toEqual([
      { x0: 0, y0: -2, x1: 1, y1: -4, positive: false },
    ]);
    expect(splitSignedAreaSegment(0, 0, 1, 2)[0].positive).toBe(true);
    expect(splitSignedAreaSegment(0, 0, 1, -2)[0].positive).toBe(false);
  });
});
