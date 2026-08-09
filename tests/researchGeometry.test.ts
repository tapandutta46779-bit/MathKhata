import { describe, expect, it } from 'vitest';
import {
  angleDegrees,
  geometryDistance,
  geometryPointLabel,
  lineIntersection,
  polygonArea,
  polygonPerimeter,
} from '../src/research/geometry';

describe('research geometry calculations', () => {
  it('measures constructed segments and polygons in coordinate units', () => {
    expect(geometryDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    const rectangle = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    expect(polygonPerimeter(rectangle)).toBe(14);
    expect(polygonArea(rectangle)).toBe(12);
  });

  it('measures the smaller angle at the selected vertex', () => {
    expect(angleDegrees({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleDegrees({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45);
  });

  it('finds line intersections and rejects parallel lines', () => {
    expect(lineIntersection(
      { x: 0, y: 0 }, { x: 2, y: 2 },
      { x: 0, y: 2 }, { x: 2, y: 0 },
    )).toEqual({ x: 1, y: 1 });
    expect(lineIntersection(
      { x: 0, y: 0 }, { x: 2, y: 0 },
      { x: 0, y: 1 }, { x: 2, y: 1 },
    )).toBeNull();
  });

  it('continues point labels after Z without collisions', () => {
    expect(geometryPointLabel(0)).toBe('A');
    expect(geometryPointLabel(25)).toBe('Z');
    expect(geometryPointLabel(26)).toBe('A1');
  });
});
