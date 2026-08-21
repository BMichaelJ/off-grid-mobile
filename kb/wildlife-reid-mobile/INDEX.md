# Wildlife Re-ID Mobile Knowledge Base

**Last compiled:** 2026-04-23
**Articles:** 9 wiki + 1 output
**Sources:** 7 raw documents (+ 4 live docs via symlink)
**Coverage:** Good on architecture, pipeline, bugs, plan. V4.1 checkpoint now ingested. Gaps: device performance data, license resolution, real pack samples, ONNX hosting decision.

## Source Registry

| File | Type | Ingested | Summary |
|---|---|---|---|
| [raw/docs-live → docs/WILDLIFE_REID_FEASIBILITY.md](raw/docs-live/WILDLIFE_REID_FEASIBILITY.md) | design | yes | Feasibility assessment; Off Grid + ONNX Runtime recommendation; MiewID profile + storage budget |
| [raw/docs-live → docs/EMBEDDING_PACK_FORMAT.md](raw/docs-live/EMBEDDING_PACK_FORMAT.md) | spec | yes | Pack format v1.0 — manifest, embeddings.bin layout, detector config, checksums |
| [raw/docs-live → docs/plans/2026-02-25-wildlife-reid-design.md](raw/docs-live/plans/2026-02-25-wildlife-reid-design.md) | design | yes | Fork strategy (what stripped vs kept), data model, pipeline stages |
| [raw/docs-live → docs/plans/2026-02-25-wildlife-reid-implementation.md](raw/docs-live/plans/2026-02-25-wildlife-reid-implementation.md) | plan | partial | Task-by-task TDD implementation plan, executed ~through Phase 5 |
| [raw/docs-live → docs/ARCHITECTURE.md](raw/docs-live/ARCHITECTURE.md) | arch | skim | General Off Grid architecture patterns reused by the wildlife fork |
| [raw/codex/2026-04-22-codebase-review.md](raw/codex/2026-04-22-codebase-review.md) | review | yes | Codex second opinion: strengths, risks, preprocessing bugs, acquisition recommendation |
| [raw/exploration/2026-04-22-codebase-map.md](raw/exploration/2026-04-22-codebase-map.md) | map | yes | Thorough Explore-agent mapping of services, screens, stores, native modules, tests |
| [raw/models/2026-04-23-miewid-v41-checkpoint.md](raw/models/2026-04-23-miewid-v41-checkpoint.md) | model | yes | Local MiewID v4.1 checkpoint: file path, MD5, training config, n_classes=20,191 |
| [raw/models/2026-04-24-whorse-face-detector.md](raw/models/2026-04-24-whorse-face-detector.md) | model | yes | YOLO11n horse-face detector (10 MB, mAP50 0.9999) at /mnt/c/claude-skills/output/whorse-face-detector/ — pack-ready, no code changes needed |
| [raw/models/2026-04-24-miewid-v41-onnx-export.md](raw/models/2026-04-24-miewid-v41-onnx-export.md) | model | yes | MiewID v4.1 ONNX exports (FP32 205.7 MB, FP16 103.9 MB) at tools/output/. Parity vs PyTorch ref: FP32 cos_min 1.0000, FP16 cos_min 0.99999, embedding_dim=2152 confirmed. |
| [raw/models/2026-04-25-pack-bundler-and-synthetic-pack.md](raw/models/2026-04-25-pack-bundler-and-synthetic-pack.md) | tool | yes | `build_pack.py` two-mode pack assembler + `horse-synthetic-2026-04-25.zip` (9.2 MB, 5 individuals × 2 embeddings, validates against pack format spec). Bridge artifact between Stage 1 and Stage 2. |

## Wiki Articles

| Article | Category | Sources | Last Updated |
|---|---|---|---|
| [MiewID v4](wiki/entities/miewid-v4.md) | entity | 3 | 2026-04-22 |
| [Off Grid Mobile (Wildlife Re-ID Fork)](wiki/entities/off-grid-mobile-app.md) | entity | 3 | 2026-04-22 |
| [Embedding Pack](wiki/concepts/embedding-pack.md) | concept | 2 | 2026-04-22 |
| [On-Device Re-ID Pipeline](wiki/concepts/on-device-reid-pipeline.md) | concept | 2 | 2026-04-22 |
| [Image Preprocessing](wiki/methods/image-preprocessing.md) | method | 4 files + spec | 2026-04-22 |
| [YOLO Postprocessing](wiki/methods/yolo-postprocessing.md) | method | 2 | 2026-04-22 |
| [Model Acquisition](wiki/methods/model-acquisition.md) | method | 3 | 2026-04-22 |
| [Critical Bugs](wiki/bugs/critical-bugs.md) | bugs | source reads | 2026-04-22 |
| [State of Implementation](wiki/meta/state-of-implementation.md) | meta | 3 | 2026-04-22 |

## Outputs

| Output | Format | Date |
|---|---|---|
| [MiewID v4.1 On-Device Integration Plan](outputs/plans/miewid-v41-integration-plan.md) | plan | 2026-04-22 |
| [Codex 5.5 Stage-2 Risk Review](outputs/reports/2026-04-24-codex-5-5-stage-2-risk-review.md) | report | 2026-04-24 |
| [Codex Re-evaluation + PR-0 Vetting](outputs/reports/2026-08-20-codex-reeval.md) | report | 2026-08-20 |

## Coverage Gaps

- [ ] Device-class latency benchmarks (iPhone Neural Engine, Android NNAPI) — populate after Stage 3.2 of plan
- [x] ~~MiewID weights **license** resolution~~ — resolved 2026-04-23 via CXL employee sign-off (Jason)
- [x] ~~Confirmed **v4.1** availability~~ — local checkpoint found at `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin` (2026-04-23)
- [ ] Hosting decision for exported ONNX (HF / CXL CDN / GitHub release)
- [~] Real sample pack — **target: wild horses, State of Washington** (2026-04-23).
   - [x] Detector model — YOLO11n trained on WBIA `horse_wild+face`, ready as ONNX (2026-04-24). See [[2026-04-24-whorse-face-detector]].
   - [x] MiewID v4.1 ONNX export — FP16 103.9 MB, parity ≥ 0.99999 (2026-04-24). See [[2026-04-24-miewid-v41-onnx-export]].
   - [ ] Washington-horses COCO export from Wildbook + matchability assessment
   - [ ] Bundle `embeddings.bin` + `index.json` + reference photos + manifest into pack zip
- [ ] Wildbook sync API contract — endpoints, auth, Encounter upload shape
- [ ] Core ML / NNAPI EP compatibility testing for MiewID
- [ ] Gallery dilution curves per species at expected production scale
- [ ] Species-specific cosine thresholds (calibration data)

## Recent Queries

| Date | Query | Output |
|---|---|---|
| 2026-04-22 | "What's built, what's stubbed, and how to ship MiewID v4.1 on-device?" | [integration plan](outputs/plans/miewid-v41-integration-plan.md) + [state of implementation](wiki/meta/state-of-implementation.md) + [critical bugs](wiki/bugs/critical-bugs.md) |
| 2026-04-23 | "Fix the preprocessing scale bugs (Stage 0 of integration plan)" | PR [#11](https://github.com/WildMeOrg/off-grid-mobile/pull/11) — `fix/preprocessing-scale-math` → `wildlife-reid`. Native multiply-not-divide on both platforms + MiewID TS wrapper `1/255` + cross-platform golden parity fixture. 410/410 Jest, 11/11 Kotlin tests pass. |
| 2026-08-20/21 | "Resume: pull latest, upgrade the branch, re-evaluate with Codex, continue toward deployable" | [Codex re-eval](outputs/reports/2026-08-20-codex-reeval.md) + PRs #17, #18, #22–#27 merged (Stage 2.1–2.7 complete; see plan addendum). Housekeeping: 10 dependabot bumps → main → wildlife-reid (#20), stale PR #2 closed, upstream (2,929 commits) intentionally skipped. Gemini Code Assist unresponsive since ~Aug — Codex is the working second-opinion path. |

## Key Conclusions (TL;DR)

1. **Pipeline is ~70-80% wired end-to-end.** Architecture is sound; most remaining work is glue, not foundation.
2. **MiewID v4.1 is not actually loaded anywhere.** `miewidModelPath` setter exists but no call site populates it — highest-leverage gap.
3. **Two real preprocessing bugs** will produce garbage embeddings even after MiewID wiring:
   - Native `scale` divided instead of multiplied (both Kotlin & Swift)
   - TS MiewID wrapper passes `scale = 1.0` (feeds 0-255 into ImageNet normalization)
4. **Recommendation:** ship MiewID as a separate FP16 download (~80-120 MB), not bundled. Keep detectors in packs. Avoid INT8 until rank-order parity is proven on real wildlife crops.
5. **Next steps:** fix bugs + golden parity test → MiewID ONNX export + HF publish → in-app acquisition service → E2E verification. See [integration plan](outputs/plans/miewid-v41-integration-plan.md).
