# MT-06R / MT-07B / MT-07S

Stacked on MT-04–06, without merging dependency PRs. No Firebase deployment.

- The journal/records button, dialog, listener and decorative notifications are removed. The existing acquisition keys, IDs and one-time pickup checks are retained.
- North-up Canvas map: offline-derived road/river/green polygons in `data/exploration-map.json`; no overview terrain mesh or all-tile scan. The map pauses WebGL rendering while preserving the walking collision neighborhood.
- Exploration uses 50m cells, 75m reveal radius and a monotone area mask. Only a grid signature, membership bits and sorted discovered IDs are persisted. No route, timestamps, device identity or geolocation API. Corrupt/unavailable storage stays playable. Future warp state always returns `enabled:false, landing:null`.
- Landmarks are data-driven. First discovery lights the nearby marker and expands a ground ring for 1.6s; repeated discoveries are silent. Reduced-motion preferences suppress marker animation. Unexplored/unfound markers do not appear on the map.
- Sound uses the existing DreamCore `DreamcoreAudio` settings and `BgmPlayer` via a same-origin configured module. Three-second continuous biome dwell; 850ms crossfade; no MP3 request until activation, no four-track preload, at most current+retiring BGM media. Hidden pages stop; mute prevents new BGM streaming. SE share master/SE/mute settings and a 250ms throttle.
- Walking: left movement, right look, ZR dash, A pickup, X map, B cancel, Y unused. On map: left cursor, A select, X/B close; right stick cannot orbit. Keyboard: WASD/arrows, Shift, E, M/X, Escape. Touch uses existing move/look/dash, pickup button, map button and marker tap.
- Embedded A edges are consumed from the same-origin parent only. Local A sampling is disabled in that case and the parent virtual click is captured. X/B are sampled locally; relayed copies are ignored.

Verification commands:

```
npm test
node scripts/create-biome-fixture.mjs FRESH_FIXTURE
node scripts/generate-exploration.mjs FRESH_FIXTURE
node scripts/generate-map.mjs FRESH_FIXTURE FRESH_FIXTURE/public/data/exploration-map.json
node scripts/browser-map.mjs FRESH_FIXTURE ARTIFACTS
node scripts/browser-exploration-walk.mjs FRESH_FIXTURE ARTIFACTS
```

Local unit tests: 88 PASS. Fictional desktop/mobile map/collection/save/controller browser flow: PASS. Public CI is separately identified on the PR. Runtime geography, 22 selected sites, MP3s, private artwork, real-data screenshots, audio evidence and release manifests remain PRIVATE.

Physical devices, real GC201, actual audio listening and child acceptance: UNVERIFIED. Full-file decode and browser media playback are not a listening judgment.
