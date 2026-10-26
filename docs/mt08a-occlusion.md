# MT-08A water occlusion contract

Prepared water uses the source-bounded, bank-constrained domain and matching cut terrain from MT-08A. Both depth testing and depth writing are enabled. Changing only the legacy material flags is not the repair: legacy water and uncut terrain can geometrically conflict. The legacy overlay remains supported for old fictional/demo manifests, and must not be used to represent a prepared production release.

`createWaterLayer(..., {requirePrepared: true})` rejects a detached/missing domain before creating an overlay. Main passes this contract for a manifest declaring `surfaceMeshes`. Declared surface load errors already fail closed. The `?test=1` visual audit reports each tile's `waterSource` and actual material depth flags/order. Prepared water is immutable across LOD/cache changes; an empty dry tile still has a prepared domain.

The GPU acceptance uses the production shader, indexed water geometry, building builder, sprite implementation and road ribbon builder. It tests five subjects (tree, building, animal, alpha sprite, bridge deck/piers), three depth relations and three render orders. Each relation must contain nonempty overlapping samples; crossing scenes must exercise both depth directions. Ray intersections classify expected front/back pixel ownership; readback verifies the actual renderer. Nearly opaque sprite pixels are checked against alpha compositing, rather than incorrectly requiring opaque output. The same geometry with the old disabled depth flags is a required negative control. The test does not change production render order or disable production depth.

```bash
npm install
npm install --no-save playwright@1.56.1
npx playwright install --with-deps chromium
node scripts/browser-water-occlusion.mjs . artifacts/water-occlusion
```

PUBLIC CI uses only fictional subjects. `MICHI_OCCLUSION_REAL=1` loads original GLB/PNG assets from a supplied assembled PRIVATE root; keep all resulting images and JSON PRIVATE. Those are controlled placement tests, not proof of real-world habitat or a modification of geographic coordinates. Full original-scene comparisons, prepared loading/LOD/tile switching, navigation/warps/save and timing evidence are separately preserved in existing PRIVATE MT-08A PR #30.

The existing map browser test must wait for pending tile activation and two RAFs before measuring map-only requests. Network idle alone does not prove that asynchronous mounts completed. These are the same two stabilization lines already accepted in MT-07F-1; active-tile invariance and no-new-request assertions remain unchanged. Map A source and its PR are not modified by this follow-up.

Hardware acceptance is separate: Chromium SwiftShader pixel correctness does not certify a physical phone/GPU, and no Firebase deployment or PR merge is performed by these checks.
