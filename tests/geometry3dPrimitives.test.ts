import { describe, expect, it } from 'vitest';
import { createGeometry3DWireframe, geometry3DPrimitiveMeasurement, orbitGeometry3DCamera } from '../src/research/geometry3dPrimitives';

describe('3D geometry primitives', () => {
  it('builds recognizable polyhedral wireframes', () => {
    const cube = createGeometry3DWireframe('cube', [2, 2, 2]);
    expect(cube.paths).toHaveLength(12);
    expect(cube.faces).toHaveLength(6);
    expect(new Set(cube.paths.flat().map((point) => `${point.x},${point.y},${point.z}`)).size).toBe(8);

    const tetrahedron = createGeometry3DWireframe('tetrahedron', [2, 2, 2]);
    expect(tetrahedron.paths).toHaveLength(6);
    expect(tetrahedron.faces).toHaveLength(4);
  });

  it('builds curved objects and reports checked dimensions', () => {
    for (const primitive of ['sphere', 'ellipsoid', 'cylinder', 'cone', 'paraboloid'] as const) {
      expect(createGeometry3DWireframe(primitive, [2, 1.5, 3]).paths.length).toBeGreaterThan(5);
    }
    expect(geometry3DPrimitiveMeasurement('cuboid', [2, 3, 4])).toContain('volume 24.000');
    expect(geometry3DPrimitiveMeasurement('sphere', [1, 1, 1])).toContain('4.1888');
  });

  it('orbits horizontally in the Desmos-style drag direction and clamps pitch', () => {
    const start = { yaw: -.72, pitch: -.52, zoom: 1 };
    expect(orbitGeometry3DCamera(start, 100, 0).yaw).toBeGreaterThan(start.yaw);
    expect(orbitGeometry3DCamera(start, -100, 0).yaw).toBeLessThan(start.yaw);
    expect(orbitGeometry3DCamera(start, 0, 1000).pitch).toBe(1.5);
    expect(orbitGeometry3DCamera(start, 0, -1000).pitch).toBe(-1.5);
  });
});
