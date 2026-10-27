# MT-10R — static building lighting and LOD continuity

Release acceptance is pending PRIVATE final-build measurements and continuous walk capture. Do not infer release readiness from PUBLIC CI.

Buildings now use the exact full-detail footprint, elevation, height and roof triangulation at either road LOD. Winding is oriented outward and vertices are indexed without changing their positions. One material/batch per tile replaces the separate wall/roof batches. Conservative per-building bounds only prune ray candidates; actual indexed triangles still determine hits. Concave corners remain empty.

The production scene has a fixed, unshadowed hemisphere light and directional sun. Their linear RGB irradiance and world-space direction are passed explicitly to the building generator. Lambert diffuse irradiance is computed once per flat vertex, including `1 / PI`; Three's standard Basic material retains fog, tone mapping and output colour-space conversion. If lighting becomes dynamic, rotated tile roots or shadow casting are introduced, this assumption must be revisited. Calls without lighting still use live Lambert shading.

Road LOD continues to use the unchanged distance-from-tile-rectangle threshold of 95 metres, checked every >0.28 simulated seconds. Buildings remain attached to the tile and are neither regenerated nor disposed at road LOD transitions. Tile unload still disposes their geometry/material. This removes building shape/lighting transitions and building shader reinitialization at that boundary; it does not promise a particular frame rate.

The comparison runners keep source diagnostics separate from final-build acceptance:

- `benchmark-mt10r-built.mjs CASES OUTPUT`: five counterbalanced trials per variant/device; 120-frame moving warmup, 240 measured frames, native W/S input in a verified 24m corridor. Reports P50/P90/P95/P99 and every frame/position. Detects other Playwright Chromium instances, waits before a trial and marks interference observed during a trial. Do not treat contaminated results as release acceptance.
- `browser-building-lighting.mjs SOURCE CASES OUTPUT`: static live-Lambert versus precomputed-lighting captures with the same geometry/camera. PRIVATE pixel analysis is separate.
- `browser-lod-walk.mjs BUILT_ROOT CASES OUTPUT`: both directions, walking/running, front and 45-degree-oblique camera headings, desktop/touch-joystick viewport, three building settings. Retains every received screencast frame and RAF position/LOD/geometry identity. Screencast timings are observational, not a substitute for an unrecorded performance run. `MICHI_LOD_TIMING_ONLY=1` disables screencast encoding and retains native crossing RAF intervals; debug snapshots still add inspection overhead.
- `benchmark-mt10r-overview.mjs CASES POSES OUTPUT`: separate fixed-camera stress test using response-only instrumentation of the final bundle. It verifies all loaded tile LODs and the actual camera pose; native walking uses the unmodified bundle. Also monitors external Chromium interference.
- `profile-mt10r.mjs SOURCE PRIVATE_OUTPUT [ABLATION]`: source-only CPU sampling and subsystem timing. Its ablations never ship as product changes.

Real-world coordinates, source artwork, screenshots and raw measurements belong only in PRIVATE repositories. No MT-10C feature, merge or deployment is included.
