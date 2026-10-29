# MT-07C

Depends on MT-07B PUBLIC #14; do not merge or modify the dependency PR.

- Optional PRIVATE `data/warps.json`: schema 1, points keyed by existing POI ID. Disabled records contain only `landing.confirmed:false`. Confirmed records require explicit publicAccessVerified, clearance >=1.5m, absolute rendered-foot elevation in position [x,y,z], and finite yaw. Display coordinates are never fallback landings.
- Discovery IDs in the existing exploration store are the only unlock history. The first 75m discovery produces one integrated effect, a teal ring and a dedicated common-volume SE for confirmed points. Saved IDs do not replay discovery effects.
- Map: X/M opens/closes; left stick / WASD moves cursor; A/E/Enter selects then confirms the same point; click/tap selects and then uses the small destination button or same-marker second press. B/Escape clears selection, then closes. Map never moves the player or camera.
- Cat/rabbit: Y/C or the touch button; optional explicit authored characters metadata, shared texture/physics, no inferred rectangles or generated character states. Default PRIVATE selection is cat, cycles to rabbit. Legacy metadata remains valid.
- Warp loads all tiles within 12m, validates the actual collision world, radius 1.5m, foot/terrain consistency, local grade <=0.35 and a continuous 10m escape route. The 0.35 grade /0.15m elevation tolerance are conservative game policies, not public-access evidence. Closed, missing, changed, invalid or undiscovered destinations fail closed.
- Single transaction, 12s deadline, revalidation after the transition, cancellation/late-result guard and rollback on commit failure. Busy input is suspended, held pad input requires neutral after mode changes. Parent owns A edges; child owns other edges. Parent virtual cursor remains disabled.
- Reduced motion disables expanding rings and fades; common SE settings handle master/SE/mute. No journal, long descriptions, blocking dialogs or new 3D map.

PUBLIC tests use fictional geography and simple synthetic sprite rectangles only. Actual regional coordinates and safety evidence belong in PRIVATE. Physical GC201, mobile hardware, real GPU, sound perception and child UX require separate acceptance.
