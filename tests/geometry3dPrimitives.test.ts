import { describe, expect, it } from 'vitest';
import { createGeometry3DWireframe, geometry3DPrimitiveMeasurement } from '../src/research/geometry3dPrimitives';

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
});
