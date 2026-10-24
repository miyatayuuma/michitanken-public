# MT-02R / MT-03

## Dependencies and scope

This branch stacks on PUBLIC #11 (9288f9e7f4c84ce98b78c0e33e00520a4749c718), which stacks on #10 and the existing nature/controller integration. Preserve #8/#9/#10/#11. Real snapshots, derived biome data and real-field evidence remain PRIVATE, stacking on PRIVATE #20 and #19. No merge or deployment is part of this change.

## Marker materials

Kenney, **Cartography Pack**, https://kenney.nl/assets/cartography-pack . Downloaded 2026-10-24 JST from the official download linked on that page:
https://kenney.nl/media/pages/assets/cartography-pack/2055ba99c2-1677578192/kenney_cartography-pack.zip

The archive was inspected: 85 default and 85 retina PNG counterparts, spritesheets, vector source, preview/sample and License.txt. The bundled license explicitly grants CC0 use; original copied to `src/assets/cartography/License.txt`.

| Original file | Use | Processing |
| --- | --- | --- |
| PNG/Retina/treePines.png | park landmark | unchanged source; CSS contain in 24px ink/parchment disc |
| PNG/Retina/bridge.png | bridge overview | unchanged source; same CSS |
| PNG/Retina/lake.png | waterside overview | unchanged source; same CSS |
| PNG/Retina/flag.png | generic place/clearing landmark | unchanged source; same CSS; never a quest/event claim |

No image was redrawn. UI Pack Adventure and Scribble Dungeons were not needed. No suitable shrine pictogram exists in the inspected pack: shrine retains the existing torii, and its new-material adoption is deferred. A church image is not used. The existing combined shrine/temple schema remains for compatibility; the generic fictional shrine label is used only for synthetic tests.

Default: parchment-backed cartography artwork. Quiet dark ink complements scribbled characters and stays visible over bright/dim scenery. No continuous marker animation. A plain flag marks a place, not a reward or unimplemented event. `data-role=landmark` leaves an explicit hook for future discovery/special renderers; those roles are not emitted yet.

Walking shows at most 3 landmarks, suppresses water and bridges, labels only close places, reserves HUD/input rectangles and the player region. Overview allows 12 mobile / 18 desktop icons, rejects overlapping whole icon+label boxes, and uses the same category symbol. Priority, then distance, then stable ID determines selection. Formal point names are preserved; no personal names or invented place names are added. Internal civic classification remains but no generic public-facility label is displayed.

During validation, use `?test=1&markers=legacy` or `window.__michiDebug.setMarkerTheme('legacy'|'cartography')`. This compares the old pictograms against the new materials using the same revised layout. The exact previous commit is used separately for performance comparison. Player URLs have no new debug controls.

## Biomes and spawn contracts

`lib/biomes.mjs` is a pure geometry/classification module, separate from declarative policy/object types and the future selection API (`lib/spawn-policy.mjs`), and from rendering. `selectSpawnCandidates` filters by allowed type, habitat, dry-ground surface and footprint clearance, then deterministically enforces spacing/count; it returns records and creates no objects. It uses a world-space spatial index with neighbouring tile features. Natural habitat and POI attributes remain separate. POIs are proximity associations within 40m, never spawn coordinates and never proof of habitat. Existing vegetation (including holes), measured green cover, buildings, roads, railways, water polygons and waterways are reused.

Point classification priority: water or bank within 12m → waterside; mapped wood/grove/canopy → woodland; grass/park/scrub/shrub → grassland; otherwise urban. Urban is a fallback class, not proof of surveyed paving. A single tree crown may form a small woodland patch. No tile is assigned one biome. The 10m audit grid may miss patches narrower than its spacing; point classification remains continuous and geometry-based.

Candidate IDs use seed plus world-grid centres, independent of tile order. Default grid: 10m; density: 0.18; deterministic FNV thinning, no wall clock/random. IDs are stable for unchanged seed/grid; changing geometry can legitimately add/remove eligibility. World coordinates include absolute terrain elevation; rendering subtracts the game's base elevation. Each record contains tile ID, biome, slope, water distance, dry-ground surface, 1.5m clearance, allowed object types and related POI IDs.

Reject outside field, missing/nonfinite/uncertain terrain, invalid samples at edges, building interior or within footprint clearance, roads (half-width + radius + 1m), rail (half-width + radius + 2m), water, bank distance under radius+1m, mapped tree trunk clearance, slope above 0.35, or nearby seam elevation disagreement above 0.5m. Road/rail bridges and tunnels are conservatively excluded in plan view. Buried waterways do not define surface water habitat. Missing DEM nodes are not invented. Slope checks use the maximum gradient of rendered DEM triangles across the candidate footprint, plus cross-tile height samples, so narrow ridges cannot cancel in a central difference. Adjacent feature geometry is indexed globally to prevent clipping gaps. A 10m grid provides at least 10m candidate spacing before future per-object choice.

This release produces **dry-ground** candidate locations only, including dry waterside banks. Ducks/aquatic objects require a future water-surface policy and must not be selected from these candidates. Future object definitions must require compatible surface, footprint <= recorded clearance, habitat and spacing; flying objects need their own altitude/collision policy. Allow-lists are semantic object classes, not actual spawned content. No new creatures or treasure are placed.

Run `node scripts/generate-biomes.mjs ROOT NEW_OUTPUT.json`. Existing output is refused. All 25 source tiles are required; missing optional habitat layers lead to urban fallback, not invented woodland. The CLI combines OSM habitat with optional municipal green-cover polygons. Preserve source attribution/provenance. PRIVATE data must never be used as a PUBLIC fixture or CI artifact.

The result contains candidates, diagnostic samples, per-tile and global counts, exclusions and 101 checks along each adjacent edge. Area is a 10m cell-centre estimate (including roads/buildings/water), not exact polygon area or available spawn area. Seam class changes are reported rather than suppressed: a real polygon ending at a boundary is possible and is not itself a terrain discontinuity.

`?test=1&biomes=1` loads the audit file once and shows classification/candidate/exclusion overlays. Normal play never fetches or classifies it per frame. The debug point cloud adds rendering cost only in explicit audit mode. In the PRIVATE build, `data/biomes.json` stays PRIVATE in source, although production deployment would make any shipped file downloadable. No deployment is done here.

## Reproduce fictional acceptance

```
npm test
npm run build
node scripts/create-biome-fixture.mjs /tmp/michi-fictional-new
# Install/resolve the same dependencies for this fresh fixture root.
node scripts/browser-mt02r-mt03.mjs /tmp/michi-fictional-new artifacts/mt02r-mt03
```

The fixture uses five categories and a flat, synthetic 25-tile grid. It contains no real coordinates or private artwork. Legacy/new walking and overview screenshots, bright/dim backgrounds, near/far views, and debug overlays cover desktop and mobile Chromium. Dim backgrounds are deliberately simulated by darkening only the WebGL canvas; this is a contrast test, not an implemented night mode.

Automated acceptance does not replace the user's actual design acceptance. Physical phone, physical GC201 and hardware GPU timing remain UNVERIFIED.

## Validation result

80 unit tests PASS. Existing browser regressions PASS: legacy 3×3 and 25-tile atlas, synthetic controller walk/map/pan/zoom/disconnect, sprite alpha/depth, keyboard/touch movement, POI edge/reload and full/overview building colours. The new fictional comparison runner passes desktop/mobile with 20 screenshots, including 40-point crowding, three audit overlays, near/far and bright/dim contrast. Normal play fetches no biome audit data. See `artifacts/mt02r-mt03/browser.json`, `regression.log`, `unit-tests.log`, and the PNGs in that directory. PRIVATE actual-field checks and hardware limitations are recorded only in the corresponding PRIVATE PR.

PNG byte hashes and the downloaded archive SHA256 are recorded in `src/assets/cartography/provenance.json`. The four included PNGs are unchanged from the official archive.
