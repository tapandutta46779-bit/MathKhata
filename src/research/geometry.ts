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
