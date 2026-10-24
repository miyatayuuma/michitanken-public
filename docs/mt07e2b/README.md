# MT-07E-2B — approved compass A and production release verification

A was formally approved by the user on 2026-10-25. Implement the approved paper case, two-tone needle, central pin, fine ticks and upright N. N follows north spatially; glyph orientation stays upright. Camera XZ bearing, vertical fallback and angle unwrapping remain unchanged. Cache DOM handles and skip identical-bearing DOM writes; no extra animation loop or external asset.

The 2D map previously painted on every RAF even when static. Keep its existing visual/fog/coordinate/input/save rules, but coalesce invalidations to one RAF and stop when unchanged or closed. Resize, open, zoom, pan, pointer/pad selection, cursor and player changes invalidate. `drawCount` is a test snapshot diagnostic, not stored state.

Performance gate: compare E1 (large markers), E2A (small markers) and E2B production builds in counterbalanced order, separately from instrumented diagnosis and the old Vite-development protocol. Preserve all raw values privately for real data. If a release regression reproduces and remains unresolved, release status is BLOCKED. SwiftShader never certifies hardware GPU performance.

Verification tools: `profile-map.mjs`, `benchmark-release-map.mjs`, `browser-compass-a.mjs`, existing map/notebook/warp/collection/parent/hub/audio tests. Real location/character screenshots and traces belong only to PRIVATE. See PRIVATE acceptance for final results and fixed inputs.

Existing PRs are untouched. No PR merge, Firebase deployment or PRIVATE Actions execution.
