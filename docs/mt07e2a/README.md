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
