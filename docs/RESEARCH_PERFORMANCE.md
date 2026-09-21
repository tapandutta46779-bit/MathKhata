# Research responsiveness — 20 September 2026

## Cause and changes

The numerical plotting loop called Nerdamer's symbolic substitution and decimal conversion for every sample. Six 29×29 surfaces require 5,046 evaluations, repeated during camera movement. Expression normalization was repeated as well. Symbolic calculations also shared the browser UI thread, and grid loops could become excessive with very small custom spacing or extreme coordinates.

- Compile common numerical expressions into a small interpreted arithmetic program. It does not use eval or generated JavaScript, and works with the production security policy. Preserve real odd roots and retain CAS fallback for uncommon functions and variable powers requiring CAS branch rules.
- Cache compiled expressions, restricted evaluators, sampled surface heights, and 3D solid wireframes with bounded memory. Camera movement reuses mathematical samples.
- Move LaTeX normalization and symbolic research/scientific calculations to independent background-worker lanes. An eight-second timeout terminates stalled work and permits another calculation. Briefly debounce automatic calculation previews while typing.
- Coalesce canvas updates into animation frames and yield during longer sampling operations. Cancel obsolete asynchronous draws when the view changes. Closed research views unmount their renderers.
- Bound grid work, scale 3D grid spacing with the domain, and constrain imported mesh resolutions to the supported range. Coincident curves no longer cause repeated bisection searches at every sample.
- Skip unchanged research-state writes. Retain saved equations, notebook history, snapshots, and mathematical results.

## Measurements and checks

Controlled same-process benchmark on the development Mac, using sin(x)*cos(y)+x²/10 over 5,046 points:

| Sampling implementation | Elapsed time | Sum of values |
| --- | ---: | ---: |
| Previous symbolic substitution | 1,120.16 ms | 14,923.542526341582 |
| Numerical program | 1.89 ms | 14,923.542526341584 |

This measures sampling only, not a claim that the entire application is 590 times faster. The tiny checksum difference is floating-point rounding.

Browser stress fixture: six explicit surfaces at 45×45 mesh plus three implicit surfaces; 12 2D curves; 12 log-log curves; 40 geometry points with 35 objects; 30 3D solids. Maximum observed 16-ms heartbeat intervals during drag/zoom in the final focused Chrome run were approximately 59, 37, 34, 68, and 41 ms respectively. These are local responsiveness observations, not guaranteed frame rates on other devices.

Typecheck, lint, 394 unit tests, and production build passed. The full 19-test Chrome suite passed, followed by focused research tests after the final scheduling changes. Tests cover numerical agreement with CAS, real-root domains, cache bounds, extreme grids, worker timeout/recovery, dense scene interaction, saved-data reload, PDF export, intersections, and scientific degree mode.

An existing MathLive rapid-fill focus test failed once and passed both its isolated rerun and the full rerun; no speculative change to the shared editor was made.

## Limits

Rendering still uses Canvas 2D projection. Very large scenes, uncommon CAS-only functions, or low-powered devices can still run more slowly. Symbolic calculations exceeding the worker limit report an error rather than blocking navigation. This release does not rebuild the installed Mac application or claim universal 60-fps performance.
