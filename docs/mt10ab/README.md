# MT-10A/B: direct treasure picking and complete distant buildings

Base: MT-09 `7d302de24a81f3d211d46e6fe144dfc15a1feb3b`. Independent stacked Draft; no merge or deployment.

- Remove the pickup button, its events and styling. Canvas pointer-up selects only the ray-hit treasure, or a visible real mesh within 22 CSS px of a tiny treasure's projected centre. Exact mesh hits take precedence over tolerance candidates; stable tie-breaks. Require horizontal range <=4.5m, live/not-taken state, camera clipping and actual terrain/building triangle occlusion. The tolerance ray must also intersect the actual object before any occluder. A/E nearest-visible collection remains.
- Single pointer, <=8px total displacement, <=500ms. Pinch, moved-and-returned drag, cancel, lost capture, inactive UI, blur and input reset cannot collect. Main guards map/menu/warp states. Existing save/SE/short success feedback remain.
- Replace the runner with a shoe and speed lines; no visible label. Hold-to-run, Shift, L3 toggle, aria-label and blur/release handling remain.
- Overview: axis-aligned footprint bounds with the same mean terrain base/height and palette; eight wall triangles plus two roof triangles. One outward-facing vertex-coloured tile batch, back-face culling. Full LOD unchanged. Actual triangle ray queries are accelerated only by conservative building boxes and draw ranges; no analytic hit substitutes. The normal GPU draw range is restored synchronously even on exceptions.

Validation runners:

```sh
npm test
node scripts/browser-direct-collect.mjs FICTIONAL_ROOT PRIVATE_OR_FICTIONAL_OUTPUT
node scripts/browser-collection-states.mjs FICTIONAL_ROOT OUTPUT
MICHI_BENCH_TILE=OPTIONAL_TILE node scripts/benchmark-mt10-built.mjs CASES_JSON PRIVATE_OUTPUT_JSON
```

The built benchmark uses normal movement/camera/LOD, a common collision-checked corridor, 120 RAF intervals and fresh counterbalanced contexts. Fixed-camera forced-overview tests are separately recorded: they expose added geometry costs but do not follow the player-owned LOD policy. Do not call SwiftShader results physical-device acceptance or infer VRAM from JS geometry buffers. Real geography, artwork, screenshots, performance raw data, SHA manifests and acceptance/release decisions belong in PRIVATE repositories.

MT-10C collision/sideways movement is excluded. Existing MT-09 map A, compass A, prepared water and all private source data are retained.
