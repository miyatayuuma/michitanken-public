# MT-11A PUBLIC NPC foundation

The production build is disabled until the private host supplies `public/data/npcs.json`. No actual geography or copyrighted character artwork is stored here. A **fictional, unverified** positioning fixture is available only with `?npcDemo=1`; never use that fixture as an actual safe position.

Example private host configuration (coordinates below are placeholders, not a proposed real position):

```json
{"schema":1,"groups":[{"groupId":"kiki-jiji","dialogueId":"kiki-jiji","spawnAnchor":[0,0],"spawnRadius":0,"interactionRadius":4.5,"displayRadius":65,"movementMode":"fixed","members":[{"id":"kiki","offset":[-0.8,0],"height":1.65},{"id":"jiji","offset":[0.8,0],"height":0.7}]}]}
```

`spawnAnchor` and offsets are world x/z in metres, in the manifest's projected local coordinate frame; `terrainHeight(world,x,z)` returns rendered y relative to baseElevation. Each group becomes active when the player enters displayRadius; both members appear together after their tile is loaded. The ground sampler does not validate placement. The private integration must select and validate locations against roads, water, buildings, vegetation, terrain slopes and access; it must check both individual offsets, not merely the group center. `movementMode` is reserved and currently supports fixed only. Host configuration may provide `dialogues` for other groups; each dialogue contains `first`, `again`, `explore` arrays of `[speaker, text]`. Character-specific configuration belongs in PRIVATE.

Menu > 登場人物の画像 accepts individual PNG/WebP files and an explicit single-frame rectangle in image pixels. No sheet layout is inferred; the entered rectangle determines the static frontal frame. Images and rectangles are stored in IndexedDB on the current origin and never sent by this module. If storage, decoding or validation fails a generated silhouette is used. Settings reset/clear of browser storage also clears images. Completion of the first conversation is stored in localStorage; subsequent sessions alternate reunion/exploration within a session. Browser storage may be blocked or evicted; a blocked store falls back to a silhouette and a session-only encounter state.

`node --test tests/npc*.test.mjs` tests state, data validation and an IndexedDB transaction mock. `node scripts/browser-npc.mjs artifacts/npc-browser` tests the fictional game and actual browser IndexedDB on desktop/mobile; it is also run in PUBLIC CI. Results and screenshots must not be described as private-map or physical-device acceptance.

Outstanding: confirm PRIVATE group location and visibility from the actual terrain, run integrated real-data browser tests and performance comparison, acquire real screenshots, and user visual review. Actual imported sprite artwork needs individual layout selection and user review. No deployment or merge is authorized.
