# MT-07E-2B — approved compass A and production release verification

A was formally approved by the user on 2026-10-25. Implement the approved paper case, two-tone needle, central pin, fine ticks and upright N. N follows north spatially; glyph orientation stays upright. Camera XZ bearing, vertical fallback and angle unwrapping remain unchanged. Cache DOM handles and skip identical-bearing DOM writes; no extra animation loop or external asset.

The 2D map previously painted on every RAF even when static. Keep its existing visual/fog/coordinate/input/save rules, but coalesce invalidations to one RAF and stop when unchanged or closed. Resize, open, zoom, pan, pointer/pad selection, cursor and player changes invalidate. `drawCount` is a test snapshot diagnostic, not stored state.

Performance gate: compare E1 (large markers), E2A (small markers) and E2B production builds in counterbalanced order, separately from instrumented diagnosis and the old Vite-development protocol. Preserve all raw values privately for real data. If a release regression reproduces and remains unresolved, release status is BLOCKED. SwiftShader never certifies hardware GPU performance.

Verification tools: `profile-map.mjs`, `benchmark-release-map.mjs`, `browser-compass-a.mjs`, existing map/notebook/warp/collection/parent/hub/audio tests. Real location/character screenshots and traces belong only to PRIVATE. See PRIVATE acceptance for final results and fixed inputs.

Existing PRs are untouched. No PR merge, Firebase deployment or PRIVATE Actions execution.

## Verification checkpoint

PUBLIC unit 103/build and PUBLIC engine/browser CI PASS. Actual production compass: 3 viewports × 4 cardinal directions, upright N at the correct moving location, no HUD overlap; idle/closed map draw stops and zoom invalidates PASS. Real 22 sites × 3 zooms × 4 viewports = 264 center hits, wheel/pinch/pan, L3 and direct character choices PASS. Remaining warp/parent/hub/release evidence is recorded privately.

Counterbalanced built comparison: E1/E2A/E2B × PC/mobile × 3 repetitions = 18 cases. E2B first-open-to-next-RAF mobile 7.4/8.1/19.9ms, PC 13.6/11.6/11.2ms; warm mobile 8.3/8.2/7.9ms, PC 8.1/10.0/4.4ms. Static and continuous pan/zoom P95 approximately 16.7–16.8ms. The previous multi-second regression did not reproduce in the current original-protocol rerun or built comparison. The exact cause of the earlier severe outlier cannot be established from the old evidence.

A reproducible waste was fixed: idle map made 121 repeated paints (242 drawImage calls) over 120 intervals in E1/E2A; E2B makes zero after layout settles, and continues painting during input. First-open maximum frame interval in the built samples: E2A mobile 333.3ms/PC266.7ms, E2B mobile50.0ms/PC33.4ms. This supports removing the redundant repaint workload; it does not prove it caused the old 4.4s sample.

Instrumented E2A built diagnosis observed small map/world callbacks (median around 0.2–0.3ms), with long tasks mainly during startup. The old development-server rerun was a diagnostic rather than the release gate (a brief compilation overlapped it). Release measurements ran separately without this task starting other tests/builds. Raw results include startup, pending-work and settled states; sample order, counts, timings and environments are retained. Real-world GPU performance remains UNVERIFIED.
