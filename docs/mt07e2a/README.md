# MT-07E-2A — small map markers and compass review

Base: PUBLIC #18 `04732a8544fc05572188be602f1a34dca3dc8bb7`. Separate cumulative branch; existing #17/#18 unchanged. No Firebase deployment. Compass visual acceptance: **PENDING**.

## Production change

- Marker stroke bounds 34px → 8px; selection outer diameter 42px → 14px, fixed CSS pixels at all zoom/DPR values.
- Remove map facility pictograms and all map name labels. Keep details in the selected card: full name, category, warp availability and explicit action.
- Independent 44px hit diameter, nearest-center selection with lexicographic ID tie breaking, ignore clipped centers and clicks outside map viewport.
- Mouse/touch selection never executes warp (including repeat tap). Existing second-press keyboard/gamepad activation retained.
- Move desktop/landscape card away from the map to prevent it covering bottom/nearby targets.
- No change to fog, world coordinates, discovery/unlock rules, save schema, originals or compass bearing code. Enlarged unexplored fog remains a separate unresolved UX issue.

## Review-only compass prototypes

`compass-designs.mjs`: SVG A (two-tone magnetic needle in paper case), B (simple compass rose). Upright letters, existing paper/ink/edge/focus tokens, no external image or animation. `scripts/preview-compasses.mjs` composites both into the same frozen game screenshot at the actual HUD bounding box. Four headings × desktop/portrait/landscape. Not imported by production code.

Real maps and original characters/screenshots belong exclusively to PRIVATE evidence. Only fictional preview evidence can be published here.

## Reproduction

```bash
npm test
npm run build
node scripts/assemble-production.mjs --private PRIVATE_CHECKOUT --out NEW_OUTPUT
node scripts/verify-production-overlay.mjs --private PRIVATE_CHECKOUT --public . --site NEW_OUTPUT
node scripts/browser-notebook.mjs NEW_OUTPUT PRIVATE_EVIDENCE --saved-map
node scripts/browser-small-markers.mjs NEW_OUTPUT PRIVATE_INPUT_EVIDENCE
node scripts/preview-compasses.mjs NEW_OUTPUT PRIVATE_COMPASS_EVIDENCE
```

Physical touchscreen/GC201 and hardware GPU performance are not certified by Chromium SwiftShader. Complete final results are recorded after verification.

## Verified results (2026-10-25)

PUBLIC unit 103/103 and build PASS; PRIVATE unit 62/62 and assembled build/protection PASS (127 protected files, 51 public code files). Real-data Chromium checks: 22 sites × 3 zooms × 4 viewports = 264 center selections; PC mouse and portrait touch each select every site twice without pointer-triggered warp; standard Gamepad API A/B via actual input polling PASS. PC/portrait each 20 real warps (40 total), save/restart/rejection/failure/cancel restoration PASS. Parent controls, pickup-once, all eight launches/back, shared audio and four biome playback PASS. Hardware/physical controller and listening acceptance remain unverified.

Camera-only orbit and both supported pitch limits track the actual camera quaternion while player position/facing remain unchanged. Exact vertical direction is outside normal camera pitch limits; only pure-helper fallback is tested for that case.

Performance is **mixed, not an improvement acceptance**: SwiftShader 390×844 DPR1, three before then three after, raw 60-frame first/reopen and 120-frame motion samples. Static draw median 0.30→0.20ms; motion median 0.30→0.20ms. Mean first-open-to-next-RAF 491.9→1842.5ms; reopen 8.7→10.6ms; motion frame P95 33.2→83.3ms. Large variation, execution order and async scene work are not isolated. Cause unresolved; no hardware GPU guarantee. PRIVATE retains all raw samples.

Real screenshots include both partially explored and fully explored saved fixtures. Fully explored previews make roads/rivers and marker sizes inspectable; neither fixture changes production fog behavior. Compass has 24 full game composites plus 12 side-by-side boards at three viewports/four headings. Letters orbit with north and remain upright. Selection remains PENDING.

The first browser CI exposed a test expectation error for exactly coincident fictional points. The test now asserts the specified deterministic ID tie break, without changing production selection rules. Real-data centers are distinct.
