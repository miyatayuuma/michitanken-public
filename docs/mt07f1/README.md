# MT-07F-1 — approved terrain A production integration

The user approved A on 2026-10-25. A is the sole production renderer. B/C branches, terrain-style URL selection and obsolete comparison runners are removed. Existing F0 comparison evidence remains preserved at PUBLIC commit `fcd7897793755f8dc89d5982a719c71cdda636b7` and PRIVATE #31. Historical F0 documents describe that frozen comparison, not the current API.

Unexplored roads/water/green space remain visible in the approved muted palette; explored cells retain the original normal palette. Rendering writes no exploration, discovery, position or save data. The 8/14px markers, 44px hit diameter, hidden undiscovered landmarks and warp conditions are unchanged. The invalidation-driven RAF and two cached 1000px terrain canvases remain; no continuous idle redraw or terrain animation.

`browser-approved-terrain-contract.mjs ROOT OUT` verifies fictional pixels/cache/save integrity. `browser-approved-terrain.mjs ROOT OUT` captures 27 exploration/zoom/device combinations at road/river/park centers (81 screens), with unchanged discovery/unlock/save state while panning and zero idle redraw. PUBLIC CI runs fictional inputs only.

`benchmark-approved-release.mjs CASES_JSON OUT_JSON` compares fixed built hosting trees at the real `/games/michitanken/` path. Each case has root, variant, device (mobile/desktop), repeat. Runs are isolated and counterbalanced, measuring first/warm opens, frame/draw timings and 50 open-close cycles. GC-stabilized heap, DOM, weakly observed canvas dimensions and renderer resources are recorded. The two terrain rasters imply 8MB raw RGBA (~4MB above E2B); physical GPU/native allocator memory is not inferred from JS heap. Raw real-map measurements and actual screenshots must remain PRIVATE.

This change starts from F0 #21 and does not include MT-08A #22. DreamCore integration uses an independent branch from release #36. No merge, PRIVATE Actions or Firebase deployment is performed by the work session. Exact release pins, hashes, rollback commands and remaining physical-device acceptance belong in the PRIVATE release report.
