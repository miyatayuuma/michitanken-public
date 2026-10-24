# MT-07D game-space landing certification

MT-07C coupled game geometry and proof of real-world public access. MT-07D separates these domains: a virtual landing can be certified without asserting real-world permission. New schema-1 records require `confirmed: true`, `gameSafety: "GAME_SAFE_CONFIRMED"`, a finite position/yaw and clearance >= 1.5 m. Unknown/rejected game status fails closed. Existing schema-1 records explicitly carrying `publicAccessVerified: true` remain readable for compatibility; this legacy field is not emitted for new records.

The unchanged runtime revalidates the loaded collision world, surrounding clearance, terrain/rendered contact, slope and 10 m egress before and after the transition. Discovery gating, transactional cancellation, late-result guards, restoration and stable landmark/save IDs remain unchanged. The fictional fixture now exercises the game-space status. Actual geography, real access exclusions, source snapshots and landing selection evidence belong exclusively in the PRIVATE overlay. Neither the engine flag nor absent access tags guarantee real-world access.

PRIVATE selection must reject explicit restrictions, building interiors, school grounds, enclosed/barrier interiors and closed areas; select a natural mapped movement corridor within approximately 120 m; compare alternative positions; verify a 10 m navigable route; and preserve uncertainty in its non-hosted audit. Runtime data contains only the selected game position and certification, never audit material.

Validation: `npm test`, `scripts/create-warp-fixture.mjs`, `scripts/browser-warp.mjs`. PUBLIC CI uses only fictional inputs. Physical hardware acceptance is separate.
