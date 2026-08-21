# Codex — Re-evaluation of Pipeline State + PR-0 Design Vetting

**Date:** 2026-08-20
**Reviewer:** codex-cli 0.144.5 (read-only sandbox)
**Scope:** Full re-read of the wildlife pipeline services, stores, capture flow, native ImageTensorModule, and App startup — four months after the [2026-04-24 Stage-2 risk review](2026-04-24-codex-5-5-stage-2-risk-review.md), which this pass re-verifies. Also vets the coordinate-space analysis and the planned PR-0 fixes.
**Related:** [[miewid-v41-integration-plan]], [[critical-bugs]]

## Headline

All eight April findings still substantively hold (no code landed between 2026-04-25 and this session). The coordinate-space audit conclusion is **correct with qualifications** (see below). Two **new material findings** (#11, #12).

## Re-verified April findings

| # | Severity (re-rated) | Finding | Status 2026-08-20 |
|---|---|---|---|
| 1 | Critical | No enforced MiewID identity (bare `miewidModelPath`) | Holds. Pack metadata carries a version string but it is unused for safety. → **Fixed by PR #18 (Stage 2.1)** |
| 2 | Critical | Pack integrity never validated | Holds. → **Fixed by Stage 2.2 PR** |
| 3 | Critical | Same-species packs: repeated detection + merged embedding spaces | Holds. Mixed spaces now partially mitigated by the 2.1 compatibility gate; duplicate detector runs remain → Stage 2.4 |
| 4 | Major | loadModel race + unsafe unload | Load race **fixed by PR #17**; refcounted unload deferred to Stage 2.5 (nothing calls unload mid-inference today) |
| 5 | Major | MiewID-missing dead end | Holds. Status-specific messaging landed in 2.1; the actionable download route needs Stage 2.8 Settings UX |
| 6 | Major | processPhoto discards all partial work | Holds → Stage 2.6 |
| 7 | Critical | ONNX I/O contracts assumed, `outputSpec.layout` ignored | Holds → Stage 2.7. Note: fallback config declares YOLOv5 `[1, N, 5+C]` but the parser reads `[1, 4+C, N]` — fallback boxes would be garbage (fallback is already `TODO(P0)` for removal) |
| 8 | Major | Native downloads lack integrity | Holds; **bypassed by Stage 2.3 PR** (JS download service; native module unused for models) |

## Coordinate-space audit verdict

Our conclusion (“crops are geometrically correct today; boxes unclamped; contract untested”) is **correct**, with qualifications:

- Correct for absolute-coordinate outputs matching the implemented `[1, 4+C, N]` parser, and for genuinely normalized outputs. Stretch preprocessing → normalized model space == normalized original space. BGR affects content, not geometry.
- **Not** universally correct for layout variants: `outputSpec.layout` is ignored (finding 7). YOLOv5-layout packs would produce garbage boxes before cropping.
- Native crop already clamps pixel coordinates (differently per platform) and forces ≥1px dimensions, so it cannot crop outside the bitmap — but it can produce oversized edge crops or bogus 1-pixel crops. JS-side boxes were persisted/rendered unclamped.
- The stretch contract is untested end-to-end; native tests verify resize occurs, not non-square coordinate round-tripping.

## PR-0 design vetting

- **#9 (Major, incorporated):** Clamp **corners**, not `x/width` independently — independent clamping widens an edge-clipped box. Convert to corners, clamp to [0,1], reconstruct, drop non-finite/non-positive-area boxes, all **before NMS**. → Implemented exactly this way in PR #17.
- **#10 (Major, incorporated):** Promise-dedup is the right minimal load fix; don't create an un-awaited `.finally` chain (unhandled-rejection risk). → PR #17 returns the same chained promise to all callers.

## New findings

- **#11 (Critical): pack-provided embedding preprocessing is ignored.** The manifest carries `embeddingModel.inputSize` + `normalize`, but capture never passes them to the pipeline (`ProcessPhotoParams.embeddingInputSize/embeddingNormalize` exist and are never supplied) — every pack silently gets MiewID-v4 440×440 ImageNet defaults. Requires `EmbeddingPack` to carry the input config (currently flattened away at install time). **→ scheduled with Stage 2.4 pack-grouping work** (the compatibility-group is the natural owner of the runtime embedding config).
- **#12 (Major): embedding dimension mismatches yield invalid scores.** Matching never verifies query/reference vector lengths; a short reference produces NaN cosine, a long one silently truncates. Partially mitigated by the Stage 2.2 validator (offset/size checks make short pack vectors structurally impossible) — but local individuals and the matcher itself remain unchecked. **→ fold into Stage 2.7 contract validation.**

## Session outcome (what this review drove)

- PR #17 `fix/postprocessing-clamp-and-load-race` — corner clamping + load dedup (findings 4-partial, 9, 10)
- PR #18 `feat/miewid-model-record` — Stage 2.1 (finding 1, part of 5)
- `feat/pack-validator` — Stage 2.2 (finding 2, part of 12)
- `feat/model-download-service` — Stage 2.3 (finding 8 bypass)
- Remaining: 2.4 (finding 3 + new 11), 2.5 (finding 4 unload), 2.6 (finding 6), 2.7 (findings 7 + 12), 2.8 (finding 5 UX)
