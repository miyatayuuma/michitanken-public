# MT-08A — 3D roads and continuous water domains

Status: river follow-up implemented; final real-data regression/performance validation in progress. User visual acceptance is separate. Existing drafts PUBLIC #22 / PRIVATE #30 continue; no merge or deployment.

## Source and responsibility

Generic code/tests/build tools are PUBLIC. Real OSM/GSI snapshots, archived source features, prepared meshes, real captures and measurements stay PRIVATE. The original snapshots and existing coordinates are read only. MT-07F-0, the 2D map/fog, compass, HUD/menu, save schema, warp conditions and DreamCore #36 are unchanged.

## Repair

Roads in both LODs clip to exact DEM faces and tile bounds; avatar visual feet use that same surface. Navigation retains the original DEM sampler.

Water now has one canonical full-field domain, compiled from the existing source water polygons and uncovered, non-tunnel waterways. Archived source ways restore tile-corner omissions. Geographical points use one declared projection origin; this corrects per-tile projection seams without relocating real features.

The existing DEM-fitted longitudinal profile is retained, with the smallest downward translation per connected water body required by every real bank DEM face break. Water must remain at least 0.18m below those modelled banks. This is a constrained game rendering model, not a claim of measured river levels. Unrelated ponds are separate bodies. No location-specific height exceptions or whole-terrain flattening are used.

The original DEM triangles are retained outside source water. Within water, terrain is cut out and bank faces connect the original bank to below opaque water. Canonical water triangles are built once, refined conformingly, then clipped to tiles with all attributes interpolated from those same triangles. This removes both missing edge coverage and height T-junctions. The prepared water uses normal depth testing/writing; simply changing the old water material's depth flag was not sufficient.

Prepared water never refits or rebuilds when neighbouring tiles or LODs change. Collision coverage, source islands, vegetation exclusion and fauna contact use the same prepared authority. Existing animal candidate positions/behaviour are preserved. A world-anchored, locally advected procedural pattern avoids stripes caused by unrelated OSM station origins. No reflection passes or new texture assets.

## Build and verify

Python build dependency: `shapely==2.1.2` (not shipped to the browser).

```
python -m pip install --only-binary=:all: shapely==2.1.2
python scripts/build-water-domain.py PRIVATE_ROOT NEW_MESH_DIR PRIVATE_REPORT --source ARCHIVED_SOURCE.json.gz
```

Original source paths are protected against output overwrite. Prepared data records source snapshot hashes, and the report records archive/profile hashes. The private tile manifest declares a mesh path for every tile. Runtime loading validates indices, attributes, datums, bounds and coverage; missing declared data fails closed.

```
npm test
python -m unittest discover -s tests -p 'test_water_domain.py'
node scripts/verify-water-domain.mjs ASSEMBLED PRIVATE_REPORT
node scripts/audit-water-mesh-seams.mjs ASSEMBLED PRIVATE_REPORT
node scripts/check-surface-regressions.mjs BEFORE ASSEMBLED PRIVATE_REPORT
```

`verify-water-domain` samples actual indexed water triangles, compares Float32 bank contact with the original DEM, and verifies snapshot hashes. `audit-water-mesh-seams` intersects actual triangles with every shared tile plane; analytic profile equality is not substituted for rendered geometry. The Python fixture independently checks exact area, preserved land heights, source omissions, matching seams and source-file protection. PUBLIC CI only uses fictional data.

Camera captures, runtime warp checks and the counterbalanced built-production benchmark remain available through `capture-3d-surfaces`, `browser-surface-regressions` and `benchmark-surface-release`. Optional `MICHI_CHROMIUM_EXECUTABLE` selects an installed test binary. Outputs always inherit the input visibility.

At the first real-data verification: 25 tiles, bank clearance >=0.179997m, 40 seams with zero one-sided samples and maximum height difference 0.000000201m. 9,000 navigation steps, 42,025 collision samples, 40 bidirectional road boundaries and all 20 landings passed. Final images, browser checks, source preservation, performance and CI are recorded in the paired PRIVATE report; physical hardware and user visual acceptance are not implied by emulation.
