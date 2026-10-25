# MT-07F-0 — readable unexplored terrain (visual acceptance pending)

Base: PUBLIC #20, 5ac0b9533ccd7731a7391cd5b1ac3b6c4833cf71. Independent branch; no existing PR/ref or release scripts changed.

The previous opaque unexplored-cell raster hides the road, water and green-space network. This candidate separates cartographic visibility from discovery. A shows muted terrain in unexplored cells and the existing full palette in explored cells. B adds a thin warm paper veil. C preserves full terrain color and outlines explored cells. A is the provisional default; the final recommendation and measured results are recorded in the PRIVATE acceptance report after real-map verification. User visual acceptance remains PENDING.

`src/map-terrain.js` caches two 1000×1000 rasters (8 MB raw RGBA total, about +4 MB versus the old base and 50×50 fog). A/B update newly revealed cell runs only. C rebuilds its outline only when exploration changes. The on-screen map uses one cached `drawImage` per invalidated frame and retains the E2B coalesced RAF scheduler. There is no continuous terrain animation. Parsed geography is released after rasterization as before. Canvases are released at dispose.

No writes to the store, no coordinate or save-schema change. Landmarks still require actual discovery; warp eligibility and the 44px hit diameter remain unchanged. Normal marker outer diameter 8px, selected 14px. No labels or extra product controls. `?test=1&terrain=A|B|C` selects a comparison variant only in the existing test mode; normal play always uses the candidate default.

Verification scripts (output inherits input visibility):

- `browser-terrain-contract.mjs ROOT OUT`: fictional pixel distinctions, idempotent caching, persistence/source immutability, incremental reveal and disposal.
- `browser-terrain-visibility.mjs ROOT OUT`: initial/partial/broad × 1/2/4× × PC/portrait/landscape =27 conditions per variant; road-dense/river/park centers within every condition =81 screenshots per variant, 243 total. Seeded states are fixtures, not proof of proximity discovery. Checks no discovery/unlock/reveal mutation while panning and no idle redraw.
- `benchmark-terrain-map.mjs CASES_JSON OUT_JSON`: built production variants, isolated browser, fresh contexts, counterbalanced repeats; first/warm open, idle/motion/walk frame intervals, actual redraw durations and counters. Real input paths/results must stay PRIVATE.

PUBLIC CI uses fictional maps only. Real maps/screenshots, raw performance, runtime landmark/20-warp regression and visual review records belong exclusively to PRIVATE. Firebase deployment, merge and human design acceptance are outside this candidate's completed automation.
