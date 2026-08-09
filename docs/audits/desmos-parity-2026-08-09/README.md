# Desmos workflow parity audit — 2026-08-09

This audit compares the live MathKhata Research workspace with the live Desmos Geometry and Desmos 3D tools at the same desktop scale. It is a workflow comparison, not a claim that MathKhata contains or reproduces Desmos source code.

## Captured evidence

- `01-mathkhata-geometry.png` — MathKhata Geometry before this pass.
- `02-desmos-geometry.png` — live Desmos Geometry reference.
- `03-desmos-3d.png` — live Desmos 3D reference.
- `04-mathkhata-3d.png` — MathKhata 3D before this pass.
- `07-mathkhata-3d-after.png` — explicit and parametric surfaces together.
- `08-mathkhata-geometry-after.png` — construction expression, selection, and transformation controls.
- `09-mathkhata-3d-final.png` — explicit, parametric, and sampled implicit surfaces together.

## Capability comparison after implementation

| Workflow | Desmos reference | MathKhata after this pass | Status |
| --- | --- | --- | --- |
| Editable 3D expressions | Unified expression list | Explicit surfaces, points, parametric curves, parametric surfaces, sampled implicit `F(x,y,z)=0` surfaces | Implemented with MathKhata-specific grouped cards |
| Parameters/sliders | Expression-defined sliders | Named local sliders usable in every 3D expression | Implemented |
| Restrictions | Brace restrictions | `{x>-2}{x<2}` and chained comparisons on explicit/implicit expressions | Implemented |
| 3D navigation | Orbit, zoom, orientation, settings | Orbit, wheel/buttons zoom, perspective/top/front/side, projection and perspective strength, rotation/zoom locks | Implemented |
| 3D inspection | Point inspection | Hover coordinate trace for surfaces, points, curves, intersections, and implicit samples | Implemented |
| 3D intersections | Surface analysis | Sampled explicit-surface intersections | Implemented numerically |
| Geometry construction toolbar | Point, segment, line, ray/vector, circle, angle, polygon, midpoint, parallel, perpendicular, compass | Matching construction access plus delete/move | Implemented |
| Geometry expression list | Algebraic geometry expressions/tokens | Local construction commands such as `point(2,3)`, `segment(A,B)`, `midpoint(A,B)`, `circle(A,B)`, and `polygon(A,B,C)` | Implemented for the supported command grammar |
| Dynamic dependencies | Constructions update when source objects move | Midpoints, parallel/perpendicular guides, compass radii, and transformation copies update from source points | Implemented |
| Selection/style | Multi-select, visibility, color, delete | Shift-click multi-select in object list, color, show/hide, delete | Implemented |
| Transformations | Translate, rotate, reflect, dilate using geometry objects | Live-dependent copies with numeric translation, origin rotation/dilation, and x/y reflection | Implemented; arbitrary centers/lines remain limited |
| Intersections | Geometry intersections | Line-line, line-circle, and circle-circle intersections with coordinates | Implemented |
| View settings | Grid, axes, units, viewport lock | Grid, axes/numbers, degrees/radians, snap, measurements, intersections, viewport lock | Implemented |

## Remaining differences that should not be called complete Desmos parity

- Geometry does not yet have Desmos's full token navigator or every free-form algebraic geometry expression.
- Transformations currently use numeric translation, the origin for rotate/dilate, and coordinate axes for reflection; selecting an arbitrary geometric center or reflection line is a later extension.
- 3D implicit surfaces are locally sampled iso-surfaces, not a full symbolic/marching-cubes solid engine. Filled inequalities, exact symbolic intersection curves, lists/tables, independent axis bounds, lighting controls, inertial spin, and complex mode remain separate work.
- Desmos account save/share, collaboration, print/export, Braille, reverse-contrast, and projector accessibility modes are not replicated. MathKhata keeps its own notebook-local persistence and export model.

## Verification

- Unit calculations cover transformations and line/circle intersection cases; all 330 unit tests pass.
- Browser regression covers explicit restrictions, parametric and implicit 3D creation, zoom locking, construction expressions, live midpoint dependency, selected-object controls, transformation copies, long-equation wrapping, and the preserved MathLive/Symbols/Voice paths; all 11 browser tests pass.
- TypeScript, ESLint, and the production build pass.
