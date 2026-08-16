export interface SignedAreaSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  positive: boolean;
}

/** Split a sampled trapezoid at its linearly interpolated zero crossing. */
export function splitSignedAreaSegment(x0: number, y0: number, x1: number, y1: number): SignedAreaSegment[] {
  if (![x0, y0, x1, y1].every(Number.isFinite)) return [];
  if (y0 * y1 < 0) {
    const root = x0 + (-y0) * (x1 - x0) / (y1 - y0);
    return [
      { x0, y0, x1: root, y1: 0, positive: y0 > 0 },
      { x0: root, y0: 0, x1, y1, positive: y1 > 0 },
    ];
  }
  return [{ x0, y0, x1, y1, positive: y0 === 0 ? y1 >= 0 : y0 > 0 }];
}
