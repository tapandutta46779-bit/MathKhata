import { describe, expect, it } from 'vitest';
import {
  angleDegrees,
  circleCircleIntersections,
  dilateCoordinate,
  geometryDistance,
  geometryMidpoint,
  geometryPointLabel,
  lineCircleIntersections,
  lineIntersection,
  polygonArea,
  polygonPerimeter,
  reflectCoordinate,
  rotateCoordinate,
  translateCoordinate,
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

  it('applies the construction transformations used by the geometry workspace', () => {
    expect(geometryMidpoint({ x: -2, y: 4 }, { x: 4, y: 0 })).toEqual({ x: 1, y: 2 });
    expect(translateCoordinate({ x: 1, y: 2 }, 3, -5)).toEqual({ x: 4, y: -3 });
    const rotated = rotateCoordinate({ x: 2, y: 0 }, { x: 0, y: 0 }, 90);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(2);
    expect(dilateCoordinate({ x: 2, y: 3 }, { x: 1, y: 1 }, 2)).toEqual({ x: 3, y: 5 });
    expect(reflectCoordinate({ x: 2, y: -3 }, 'x')).toEqual({ x: 2, y: 3 });
  });

  it('finds line-circle and circle-circle intersections', () => {
    expect(lineCircleIntersections(
      { x: -3, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }, 2,
    )).toEqual([{ x: -2, y: 0 }, { x: 2, y: 0 }]);
    const intersections = circleCircleIntersections({ x: 0, y: 0 }, 2, { x: 2, y: 0 }, 2);
    expect(intersections).toHaveLength(2);
    expect(intersections[0].x).toBeCloseTo(1);
    expect(Math.abs(intersections[0].y)).toBeCloseTo(Math.sqrt(3));
  });
});
