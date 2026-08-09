export interface GeometryCoordinate {
  x: number;
  y: number;
}

export type CircleConstruction =
  | { kind: 'center-edge'; centerLabel: string; edgeLabel: string }
  | { kind: 'center-radius'; centerLabel: string; radius: number }
  | { kind: 'coordinates-radius'; center: GeometryCoordinate; radius: number };

function finiteNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse the circle forms accepted by the Geometry expression rail.
 *
 * Supported examples:
 * - circle(A,B)
 * - circle(A,3.5)
 * - circle((2,-1),4)
 * - circle(2,-1,4)
 * - (x-2)^2+(y+1)^2=16
 */
export function parseCircleConstruction(source: string): CircleConstruction | null {
  const compact = source.trim().replace(/\s+/g, '').replace(/−/g, '-').replace(/²/g, '^2');
  const coordinateCall = compact.match(/^circle\(\((-?\d*\.?\d+),(-?\d*\.?\d+)\),(-?\d*\.?\d+)\)$/i);
  if (coordinateCall) {
    const x = finiteNumber(coordinateCall[1]);
    const y = finiteNumber(coordinateCall[2]);
    const radius = finiteNumber(coordinateCall[3]);
    if (x !== null && y !== null && radius !== null && radius > 0) {
      return { kind: 'coordinates-radius', center: { x, y }, radius };
    }
  }

  const flatCoordinateCall = compact.match(/^circle\((-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+)\)$/i);
  if (flatCoordinateCall) {
    const x = finiteNumber(flatCoordinateCall[1]);
    const y = finiteNumber(flatCoordinateCall[2]);
    const radius = finiteNumber(flatCoordinateCall[3]);
    if (x !== null && y !== null && radius !== null && radius > 0) {
      return { kind: 'coordinates-radius', center: { x, y }, radius };
    }
  }

  const labelCall = compact.match(/^circle\(([a-z][a-z0-9]*),([a-z][a-z0-9]*|-?\d*\.?\d+)\)$/i);
  if (labelCall) {
    const radius = finiteNumber(labelCall[2]);
    if (radius !== null) {
      return radius > 0 ? { kind: 'center-radius', centerLabel: labelCall[1], radius } : null;
    }
    return { kind: 'center-edge', centerLabel: labelCall[1], edgeLabel: labelCall[2] };
  }

  const equation = compact.match(/^\(?x([+-]\d*\.?\d+)?\)?\^2\+\(?y([+-]\d*\.?\d+)?\)?\^2=(-?\d*\.?\d+)$/i);
  if (equation) {
    const xOffset = finiteNumber(equation[1] || '0');
    const yOffset = finiteNumber(equation[2] || '0');
    const squaredRadius = finiteNumber(equation[3]);
    if (xOffset !== null && yOffset !== null && squaredRadius !== null && squaredRadius > 0) {
      return {
        kind: 'coordinates-radius',
        center: { x: -xOffset, y: -yOffset },
        radius: Math.sqrt(squaredRadius),
      };
    }
  }
  return null;
}

export function geometryDistance(left: GeometryCoordinate, right: GeometryCoordinate): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function polygonPerimeter(points: GeometryCoordinate[]): number {
  if (points.length < 2) return 0;
  return points.reduce((total, point, index) => (
    total + geometryDistance(point, points[(index + 1) % points.length])
  ), 0);
}

export function polygonArea(points: GeometryCoordinate[]): number {
  if (points.length < 3) return 0;
  return Math.abs(points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

export function angleDegrees(
  first: GeometryCoordinate,
  vertex: GeometryCoordinate,
  last: GeometryCoordinate,
): number {
  const ax = first.x - vertex.x;
  const ay = first.y - vertex.y;
  const bx = last.x - vertex.x;
  const by = last.y - vertex.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

export function geometryPointLabel(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < alphabet.length) return alphabet[index];
  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length)}`;
}

export function lineIntersection(
  firstStart: GeometryCoordinate,
  firstEnd: GeometryCoordinate,
  secondStart: GeometryCoordinate,
  secondEnd: GeometryCoordinate,
): GeometryCoordinate | null {
  const firstX = firstEnd.x - firstStart.x;
  const firstY = firstEnd.y - firstStart.y;
  const secondX = secondEnd.x - secondStart.x;
  const secondY = secondEnd.y - secondStart.y;
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) < 1e-10) return null;
  const offsetX = secondStart.x - firstStart.x;
  const offsetY = secondStart.y - firstStart.y;
  const parameter = (offsetX * secondY - offsetY * secondX) / denominator;
  return {
    x: firstStart.x + parameter * firstX,
    y: firstStart.y + parameter * firstY,
  };
}

export function geometryMidpoint(
  left: GeometryCoordinate,
  right: GeometryCoordinate,
): GeometryCoordinate {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function translateCoordinate(
  point: GeometryCoordinate,
  deltaX: number,
  deltaY: number,
): GeometryCoordinate {
  return { x: point.x + deltaX, y: point.y + deltaY };
}

export function rotateCoordinate(
  point: GeometryCoordinate,
  center: GeometryCoordinate,
  angleDegreesValue: number,
): GeometryCoordinate {
  const radians = angleDegreesValue * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

export function dilateCoordinate(
  point: GeometryCoordinate,
  center: GeometryCoordinate,
  scale: number,
): GeometryCoordinate {
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

export function reflectCoordinate(
  point: GeometryCoordinate,
  axis: 'x' | 'y',
): GeometryCoordinate {
  return axis === 'x' ? { x: point.x, y: -point.y } : { x: -point.x, y: point.y };
}

export function lineCircleIntersections(
  start: GeometryCoordinate,
  end: GeometryCoordinate,
  center: GeometryCoordinate,
  radius: number,
): GeometryCoordinate[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-12 || radius < 0) return [];
  const offsetX = start.x - center.x;
  const offsetY = start.y - center.y;
  const b = 2 * (offsetX * dx + offsetY * dy);
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const parameters = discriminant <= 1e-10
    ? [-b / (2 * a)]
    : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  return parameters.map((parameter) => ({
    x: start.x + parameter * dx,
    y: start.y + parameter * dy,
  }));
}

export function circleCircleIntersections(
  firstCenter: GeometryCoordinate,
  firstRadius: number,
  secondCenter: GeometryCoordinate,
  secondRadius: number,
): GeometryCoordinate[] {
  const distance = geometryDistance(firstCenter, secondCenter);
  if (
    distance < 1e-10
    || distance > firstRadius + secondRadius + 1e-10
    || distance < Math.abs(firstRadius - secondRadius) - 1e-10
  ) return [];
  const along = (firstRadius * firstRadius - secondRadius * secondRadius + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, firstRadius * firstRadius - along * along));
  const ux = (secondCenter.x - firstCenter.x) / distance;
  const uy = (secondCenter.y - firstCenter.y) / distance;
  const base = { x: firstCenter.x + along * ux, y: firstCenter.y + along * uy };
  if (height < 1e-10) return [base];
  return [
    { x: base.x - uy * height, y: base.y + ux * height },
    { x: base.x + uy * height, y: base.y - ux * height },
  ];
}
