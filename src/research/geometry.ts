export interface GeometryCoordinate {
  x: number;
  y: number;
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
