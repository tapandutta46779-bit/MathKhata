# MathKhata research workspace comparison — 2026-08-09

This pass compared the live MathKhata research workspace with the live Desmos Graphing Calculator, 3D Calculator, Geometry, and Scientific Calculator at the same desktop viewport.

## Reference material

- [Desmos Graphing Calculator](https://www.desmos.com/calculator)
- [Desmos 3D Calculator](https://www.desmos.com/3d)
- [Desmos Geometry](https://www.desmos.com/geometry)
- [Desmos Scientific Calculator](https://www.desmos.com/scientific)
- [Desmos Graph Settings](https://help.desmos.com/hc/en-us/articles/4405296853517-Graph-Settings)
- [Desmos 3D Graph Settings](https://help.desmos.com/hc/en-us/articles/20301369699981-3D-Graph-Settings)
- [Getting Started with Desmos Geometry](https://help.desmos.com/hc/en-us/articles/15316366009997-Getting-Started-Desmos-Geometry)
- [Desmos Geometry Settings](https://help.desmos.com/hc/en-us/articles/25111004109581-Geometry-Settings)
- [Desmos Scientific Calculator](https://help.desmos.com/hc/en-us/articles/4404602552205-Scientific-Calculator)

## Live screenshots

Before screenshots:

- `mathkhata-2d-before.png`
- `mathkhata-3d-before.png`
- `mathkhata-geometry-before.png`
- `mathkhata-scientific-before.png`

Desmos reference screenshots:

- `desmos-2d-reference.png`
- `desmos-3d-reference.png`
- `desmos-geometry-reference.png`
- `desmos-geometry-circle-reference.png`
- `desmos-scientific-reference.png`

Verified MathKhata screenshots after the implementation:

- `mathkhata-2d-after.png`
- `mathkhata-2d-settings-after.png`
- `mathkhata-3d-after.png`
- `mathkhata-3d-settings-after.png`
- `mathkhata-geometry-after-responsive.png`
- `mathkhata-scientific-after-responsive.png`

## What changed

1. Every 2D, 3D, and Geometry canvas now synchronizes its internal drawing buffer with its rendered size. Grid units are square and circles no longer stretch into ellipses.
2. 2D now has a persistent expression rail that accepts full explicit, vertical, implicit, point, parametric, restricted, and parameter lines. Examples include `y=sin(x)`, `x=2`, `(x-2)^2+(y+1)^2=9`, `(cos(t),sin(t))`, and `a=2`.
3. 2D graph settings expose Cartesian or polar grids, major/minor grid visibility, axes, numbers, viewport locking, labels, steps, and numerical bounds. Settings toggle on a second click and dismiss with Escape or an outside pointer press.
4. Geometry tools now sit over the canvas while the left rail holds point tokens, a construction expression, object lines, point coordinates, selection controls, and graph-paper settings.
5. Geometry circles accept `circle(A,B)`, `circle(A,3)`, `circle((2,-1),4)`, `circle(2,-1,4)`, and standard-form circle equations such as `(x-2)^2+(y+1)^2=16`.
6. Selecting a circle exposes editable center coordinates, a numerical radius field, and a radius slider. A compass-derived radius remains linked to its source segment instead of silently breaking the construction.
7. Geometry and 2D have continuous major/minor grids and pointer-centered wheel zoom. Geometry now spans multiple orders of magnitude, supports pinch zoom, Fit and Reset, object-body dragging, constrained-point feedback, Space-drag temporary panning, and always reopens safely in Move rather than a persisted construction or Delete tool.
8. 3D has a clearer expression rail plus a viewport-layer settings panel for rendering, projection, axes, axis numbers, XY grid, bounding cube, intersections, camera locks, perspective, independent x/y/z bounds, mesh density, and camera presets. The settings layer has contained touch/trackpad scrolling, a sticky close header, keyboard focus scrolling, and direct Mesh decrement/increment/numeric controls. Horizontal orbit now follows Desmos direction and uses a calmer calibrated sensitivity. The 3D canvas supports orbit, wheel zoom, trace, surfaces, points, curves, parameters, sampled implicit surfaces, and sampled intersections.
9. Scientific now uses a MathLive expression field, rendered mathematical history, exact and decimal results, `ans`, RAD/DEG modes, three keypad sections, cursor controls, backspace, history reuse, and clear history.
10. The research overlay remains viewport-contained at 1280×659, preserves all notebook MathLive/Symbols/Voice/AION access paths, and does not widen the root document.

## Honest remaining differences from complete Desmos parity

MathKhata now follows the core Desmos interaction model, but it is not a complete reimplementation of every Desmos capability. Remaining gaps include tables, folders and notes inside the graph expression rail; regression and distribution visualizations; audio trace; Desmos's complete accessibility narration; production-grade implicit 3D meshing, lighting, and GPU rendering; the entire Desmos Geometry function catalog and token algebra; advanced locus tools; and Scientific complex-number mode. The implementation deliberately remains local, editable, and independent of proprietary Desmos code.

## Regression evidence

- 331 unit tests passed.
- 13 end-to-end tests cover the full notebook flow, MathLive keyboard/menu/symbol access, voice, AION, long structured mathematics, 2D/3D/Geometry/Scientific workflows, circle radius editing, safe Geometry reopen/drag/fit/extended anchored zoom, independent 3D bounds, Desmos-direction orbit and pointer release, fully scrollable 3D Mesh/camera settings, keyboard focus traversal, settings dismissal, square-coordinate canvas sizing, and viewport containment at 1280×659 and 720×600.
- Typecheck, lint, and the production build passed.
