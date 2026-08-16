export type Geometry3DPrimitive =
  | 'cube'
  | 'cuboid'
  | 'tetrahedron'
  | 'octahedron'
  | 'sphere'
  | 'ellipsoid'
  | 'cylinder'
  | 'cone'
  | 'paraboloid';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Geometry3DWireframe {
  paths: Vector3[][];
  faces: Vector3[][];
}

export const GEOMETRY_3D_ORBIT_RADIANS_PER_PIXEL = .004;

export function orbitGeometry3DCamera<T extends { yaw: number; pitch: number }>(
  camera: T,
  deltaX: number,
  deltaY: number,
): T {
  return {
    ...camera,
    // Geometry3D's projection convention is the inverse of Graph3D's camera
    // transform. Increasing yaw for a rightward drag matches Desmos's
    // grab-and-rotate direction for this canvas.
    yaw: camera.yaw + deltaX * GEOMETRY_3D_ORBIT_RADIANS_PER_PIXEL,
    pitch: Math.max(-1.5, Math.min(1.5, camera.pitch + deltaY * GEOMETRY_3D_ORBIT_RADIANS_PER_PIXEL)),
  };
}

const point = (x: number, y: number, z: number): Vector3 => ({ x, y, z });

function ring(rx: number, ry: number, z: number, segments = 32): Vector3[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return point(Math.cos(angle) * rx, Math.sin(angle) * ry, z);
  });
}

function boxWireframe(x: number, y: number, z: number): Geometry3DWireframe {
  const vertices = [
    point(-x, -y, -z), point(x, -y, -z), point(x, y, -z), point(-x, y, -z),
    point(-x, -y, z), point(x, -y, z), point(x, y, z), point(-x, y, z),
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const faces = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  return { paths: edges.map(([a, b]) => [vertices[a], vertices[b]]), faces: faces.map((indices) => indices.map((index) => vertices[index])) };
}

export function createGeometry3DWireframe(
  primitive: Geometry3DPrimitive,
  dimensions: [number, number, number],
): Geometry3DWireframe {
  const [rawX, rawY, rawZ] = dimensions;
  const x = Math.max(.05, Math.abs(rawX));
  const y = Math.max(.05, Math.abs(rawY));
  const z = Math.max(.05, Math.abs(rawZ));
  if (primitive === 'cube') return boxWireframe(x / 2, x / 2, x / 2);
  if (primitive === 'cuboid') return boxWireframe(x / 2, y / 2, z / 2);
  if (primitive === 'tetrahedron') {
    const vertices = [point(x, x, x), point(x, -x, -x), point(-x, x, -x), point(-x, -x, x)].map((value) => point(value.x / 2, value.y / 2, value.z / 2));
    const faces = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
    return { paths: [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].map(([a,b]) => [vertices[a], vertices[b]]), faces: faces.map((indices) => indices.map((index) => vertices[index])) };
  }
  if (primitive === 'octahedron') {
    const vertices = [point(x,0,0),point(-x,0,0),point(0,x,0),point(0,-x,0),point(0,0,x),point(0,0,-x)].map((value) => point(value.x / 2, value.y / 2, value.z / 2));
    const faces = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,2,5],[2,1,5],[1,3,5],[3,0,5]];
    return { paths: faces.flatMap((face) => face.map((index, i) => [vertices[index], vertices[face[(i + 1) % face.length]]])), faces: faces.map((indices) => indices.map((index) => vertices[index])) };
  }
  if (primitive === 'sphere' || primitive === 'ellipsoid') {
    const rx = x;
    const ry = primitive === 'sphere' ? x : y;
    const rz = primitive === 'sphere' ? x : z;
    const paths: Vector3[][] = [];
    for (const level of [-.75, -.5, 0, .5, .75]) {
      const factor = Math.sqrt(1 - level * level);
      paths.push(ring(rx * factor, ry * factor, rz * level));
    }
    for (let meridian = 0; meridian < 8; meridian += 1) {
      const azimuth = meridian / 8 * Math.PI * 2;
      paths.push(Array.from({ length: 25 }, (_, index) => {
        const latitude = -Math.PI / 2 + index / 24 * Math.PI;
        return point(rx * Math.cos(latitude) * Math.cos(azimuth), ry * Math.cos(latitude) * Math.sin(azimuth), rz * Math.sin(latitude));
      }));
    }
    return { paths, faces: [] };
  }
  if (primitive === 'cylinder') {
    const bottom = ring(x, x, -z / 2);
    const top = ring(x, x, z / 2);
    const verticals = Array.from({ length: 8 }, (_, index) => [bottom[index * 4], top[index * 4]]);
    return { paths: [bottom, top, ...verticals], faces: [] };
  }
  if (primitive === 'cone') {
    const base = ring(x, x, -z / 2);
    const apex = point(0, 0, z / 2);
    return { paths: [base, ...Array.from({ length: 12 }, (_, index) => [base[Math.round(index / 12 * 32)], apex])], faces: [] };
  }
  const rings = Array.from({ length: 7 }, (_, level) => {
    const amount = level / 6;
    return ring(x * Math.sqrt(amount), x * Math.sqrt(amount), -z / 2 + amount * z);
  });
  const meridians = Array.from({ length: 10 }, (_, meridian) => rings.map((current) => current[Math.round(meridian / 10 * 32)]));
  return { paths: [...rings.slice(1), ...meridians], faces: [] };
}

export function geometry3DPrimitiveMeasurement(primitive: Geometry3DPrimitive, dimensions: [number, number, number]): string {
  const [rawX, rawY, rawZ] = dimensions;
  const x = Math.abs(rawX); const y = Math.abs(rawY); const z = Math.abs(rawZ);
  if (primitive === 'cube') return `edge ${x.toPrecision(4)} · volume ${(x ** 3).toPrecision(5)}`;
  if (primitive === 'cuboid') return `dimensions ${x.toPrecision(3)} × ${y.toPrecision(3)} × ${z.toPrecision(3)} · volume ${(x * y * z).toPrecision(5)}`;
  if (primitive === 'sphere') return `radius ${x.toPrecision(4)} · volume ${(4 / 3 * Math.PI * x ** 3).toPrecision(5)}`;
  if (primitive === 'ellipsoid') return `semi-axes ${x.toPrecision(3)}, ${y.toPrecision(3)}, ${z.toPrecision(3)} · volume ${(4 / 3 * Math.PI * x * y * z).toPrecision(5)}`;
  if (primitive === 'cylinder') return `radius ${x.toPrecision(4)} · height ${z.toPrecision(4)} · volume ${(Math.PI * x * x * z).toPrecision(5)}`;
  if (primitive === 'cone') return `radius ${x.toPrecision(4)} · height ${z.toPrecision(4)} · volume ${(Math.PI * x * x * z / 3).toPrecision(5)}`;
  if (primitive === 'paraboloid') return `rim radius ${x.toPrecision(4)} · height ${z.toPrecision(4)} · volume ${(Math.PI * x * x * z / 2).toPrecision(5)}`;
  if (primitive === 'tetrahedron') return `edge scale ${x.toPrecision(4)} · volume ${(x ** 3 / 3).toPrecision(5)}`;
  return `axis scale ${x.toPrecision(4)} · volume ${(x ** 3 / 6).toPrecision(5)}`;
}
