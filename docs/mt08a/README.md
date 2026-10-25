# MT-08A — 3D surface continuity

Status: BLOCKED on the remaining shoreline/terrain depth contract. This draft is not a release approval.

Base: PUBLIC #20, `5ac0b9533ccd7731a7391cd5b1ac3b6c4833cf71`. Independent of MT-07F-0. No map, fog, markers, compass, HUD/menu, warp rules, save schema, DreamCore distribution, merge or deployment changes.

## Changes

- Both road LODs clip ribbons to the actual triangular DEM faces. The old full-detail rectangular subdivision could cross under terrain between sampled corners. Ribbons are also clipped to tile bounds so an edge overhang cannot use a clamped local height over a rising neighbouring DEM. Avatar contact now samples the same surface; navigation/physics retain their original sampler.
- An explicitly declared, validated optional source supplement adds only missing OSM ways. Original snapshots and existing way coordinates remain intact. The real supplement and its archived source evidence are PRIVATE.
- Optional build-time water profiles fit the entire declared field once. Streamed tile acquisition/eviction can no longer refit a river's elevation. Only stream IDs present in a field receive these profiles; unrelated ponds cannot inherit a distant river height. Original water geometry, shader and depth policy are unchanged.
- Declared data that cannot be loaded or validated fails closed, instead of silently restoring broken geometry. Undeclared optional data causes no fetch.

## Reproducible checks

`npm test` (108 passing tests) and `npm run build`.

All scripts accept external roots. Their outputs inherit the input's visibility. Never send real field outputs to PUBLIC CI or this repository.

- `scripts/audit-3d-surfaces.mjs FIELD CODE OUTPUT`: all tiles, LOD triangle interiors, shared DEM edges, road/river topology and shoreline samples.
- `scripts/generate-road-supplement.mjs FIELD SOURCE_JSON_GZ OUTPUT REPORT`: reclip archived source ways that explain unmatched seam endpoints; no online fetch or source overwrite.
- `scripts/generate-water-profiles.mjs FIELD OUTPUT`: fixed full-field fit plus original snapshot SHA-256s.
- `scripts/check-surface-regressions.mjs BEFORE AFTER OUTPUT`: original snapshot integrity, navigation, collisions, every bidirectional seam, landings, municipal vegetation and wildlife.
- `scripts/create-surface-cases.mjs FIELD OUTPUT`, then `scripts/capture-3d-surfaces.mjs FIELD CASES OUTPUT_DIR`: production geometry/materials at fixed overview/walk/low oblique cameras, PC/mobile. Test-only camera instrumentation must have zero browser errors and reach the requested camera before capture.
- `scripts/browser-surface-regressions.mjs FIELD OUTPUT_DIR`: actual runtime warp/movement/map checks.
- `scripts/audit-water-mesh-seams.mjs FIELD OUTPUT`: actual float32 production water triangles intersected with shared tile planes; no footprint cap approximation.
- `scripts/diagnose-water-profiles.mjs FIELD OUTPUT`: cache-composition sensitivity before the fixed fit.

The existing public browser workflow runs only fictional data. Real inputs, full screenshots, comparisons, regression reports and performance samples are in the paired PRIVATE draft.

## Findings and limits

The real-data audit reproduced full-detail road penetration (276 triangles in 16/25 tiles; zero after repair; the additional neighbour-overhang pass also ends at zero), source-way omissions at tile corners (12 source-backed missing segments restored), and cache-dependent water elevations (up to 1.18 m at the same location). Shared DEM boundaries were already continuous and are unchanged.

Remaining HEIGHT/RENDER: a smooth DEM-fitted water surface can exceed parts of the mapped shoreline; the existing water material disables depth testing. Enabling depth testing alone hides source-mapped reaches below terrain, so it is not an accepted repair. Actual float32 water-triangle traces also retain missing boundary coverage and height steps; analytic profile equality alone is insufficient. A coupled, source-respecting bank/channel depth representation and mesh seam repair are still required. This draft does not lower all rivers, flatten terrain, move real coordinates, or claim the remaining issue is resolved.

Numeric raster/shore samples, emulated Chromium/SwiftShader captures and synthetic input are evidence for their stated conditions; physical PC/mobile/gamepad and user visual acceptance remain unverified.
