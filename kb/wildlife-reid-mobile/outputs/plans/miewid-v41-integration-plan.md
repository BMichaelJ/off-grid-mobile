# MiewID v4.1 On-Device Integration Plan

**Category:** outputs/plans
**Date:** 2026-04-22
**Sources:** [[critical-bugs]], [[model-acquisition]], [[state-of-implementation]], [[off-grid-mobile-app]]
**Related:** [[miewid-v4]], [[embedding-pack]], [[image-preprocessing]]

## Goal

Make MiewID v4.1 individual re-ID work **end-to-end on device** in the Off Grid Mobile wildlife fork: user photographs an animal → detector finds it → MiewID v4.1 produces a valid 2152-dim embedding → cosine match against pack + local individuals surfaces top-5 candidates for review.

## Sequencing

### Stage 0 — Foundation Fixes (blockers)

Must land before any MiewID work is meaningful, or we'll be tuning on garbage.

- [x] **0.1** Fix native `imageToTensor` scale semantics — multiply, not divide. Kotlin + Swift. Update unit tests. **Done 2026-04-23 (PR #11).**
- [x] **0.2** Fix MiewID TS preprocessor to pass `scale = 1.0/255.0`. Update test. **Done 2026-04-23 (PR #11).**
- [x] **0.3** Cross-platform golden parity fixture (1×1 pure-red pixel through ImageNet norm + scale=1/255 → R≈2.249, G≈-2.036, B≈-1.804). Encoded identically in Kotlin and Swift tests. **Done 2026-04-23 (PR #11).** Follow-on: real Python ↔ device parity on a larger image once MiewID ONNX exists.
- [ ] **0.4** (Defensive) Branch YOLO postprocessing on `architecture` for `5 + C` v5/v7 support. Deferred — only matters if a pack ever ships a YOLOv5/v7 detector.

### Stage 1 — MiewID v4.1 ONNX Export

Done outside the app (in the miewid-trainer workspace or a throwaway repo).

**Starting artifact (confirmed 2026-04-23):**
- PyTorch checkpoint: `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin`
  (206 MB FP32, md5 `71c0bdd9bf8cbdb1b9e967a2e96949bb`, n_classes=20,191)
- Config: `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.yaml`
- Architecture: EfficientNetV2-RW-M + GeM + sub-center ArcFace dynamic (m=0.328, s=49.33, k=2), `use_fc=false`
- See [[2026-04-23-miewid-v41-checkpoint]] for full details.

Tasks:

- ~~**1.1** Confirm with CXL: license for mobile redistribution.~~ **Done 2026-04-23**: Jason signed off as a CXL employee. We redistribute the ONNX derivative, not the raw `.bin`.
- [x] **1.2** ~~Write export script~~ **Done 2026-04-24.** Script at `kb/wildlife-reid-mobile/tools/export_miewid_v41_onnx.py`. Outputs in `tools/output/`: FP32 205.7 MB cos_min 1.0000; FP16 103.9 MB cos_min 0.999994. Single self-contained files (no external-data shards). Manifest with checksums + provenance. See [[2026-04-24-miewid-v41-onnx-export]]. *(Original task description retained below for reference.)*
  - Instantiate the model class from `wbia-plugin-miew-id` using `miew_id.msv4_1_main.yaml` `model_params`
  - `load_state_dict(…, strict=False)` to drop the ArcFace classification head
  - Wrap in an `EmbeddingOnly` module that returns only the 2152-dim normalized feature vector
  - `torch.onnx.export(opset_version=17, dynamic_axes={"input": {0:"batch"}, "embedding": {0:"batch"}})`
  - Output: `miewid_v4_1_fp32.onnx` (~200 MB)
- [~] **1.3** Parity test: 100 random tensors → cos_min 1.0000 FP32 / 0.99999 FP16 (done as part of 1.2). **Still pending:** 50 diverse real wildlife crops (grab from an existing miewid-trainer test set). For each, run:
  - PyTorch forward on the `.bin` checkpoint → reference embedding
  - `onnxruntime.InferenceSession` on the ONNX → test embedding
  - Assert cosine(ref, test) ≥ 0.9999 for all 50
- [x] **1.4** ~~FP16 conversion~~ **Done 2026-04-24** via `onnxconverter_common.float16.convert_float_to_float16`. cos_min 0.999994 vs PyTorch ref (well above the 0.999 threshold). Per-sample l2 drift ≈ 0.23 on embeddings of magnitude O(2-3). **Still pending:** rank-order parity on a 100-pair cross-gallery retrieval test using real crops (defer to 1.3-real-crop).
- **1.5** Publish: upload `miewid_v4_1_fp16.onnx` (~100 MB) to either (a) a `conservationxlabs/miewid-msv4-1-onnx` HF repo, (b) a CXL-hosted CDN URL, or (c) a GitHub release asset on the off-grid-mobile repo. Record SHA-256 for app-side verification.

### Stage 2 — In-App Acquisition (expanded based on [codex 5.5 Stage-2 risk review, 2026-04-24](../reports/2026-04-24-codex-5-5-stage-2-risk-review.md))

> **2026-08-20 addendum** (see [codex re-evaluation](../reports/2026-08-20-codex-reeval.md)): a pre-Stage-2 correctness PR landed first — box corner-clamping to the unit square + `loadModel` promise-dedup (PR #17). **2.1 done** (PR #18: `MiewIDModelRecord`, persist v1 migration, startup reconciliation, capture gate + compatibility filter). **2.2 done** (`feat/pack-validator`: validator + quarantine + `setPacks` + bounds-checked `getEmbeddingsForIndividual`). **2.3 done** (`feat/model-download-service`: staging + SHA-256 + atomic move + retry/backoff + `acquireMiewidModel`; hosting still open — URL/hash live in `src/config/modelSources.ts`). New codex findings folded in: pack `embeddingModel.inputSize/normalize` ignored by capture → 2.4; embedding-dim validation in matcher → 2.7.

The original "add a download service + wire the path" framing was too thin. Before any download work is meaningful we need a model state machine, a versioned identity record, and a pack validator. These also unlock fixes for lifecycle races and partial-success observations that are currently latent bugs.

- **2.1** **Model record + state machine.** Define `MiewIDModelRecord { path, name, version, sha256, sizeBytes, status }` with states `missing | downloading | ready | corrupt | incompatible`. Replace `wildlifeStore.miewidModelPath: string | null`. Reconcile on app startup — verify file existence + hash + optionally resume in-flight downloads.
- **2.2** **Pack validator** (blocker). Manifest schema, `formatVersion` support gate, required-files existence, SHA-256 vs `manifest.checksums`, `embeddings.bin` size === `embeddingCount * embeddingDim * 4`, per-individual offset/count bounds. Quarantine invalid packs rather than admit them to the store.
- **2.3** **JS download/cache service** (`src/services/modelDownloadService` or similar). Wraps existing native `DownloadManagerModule` with staging-path download, HTTP status check, expected length check, SHA-256 verify, atomic move into cache, retry/backoff, cancellation. Used by both MiewID and pack downloads.
- **2.4** **Pack grouping + compatibility.** Group by `{species, featureClass, detectorModelFile, embeddingModelVersion}` in capture flow. Run one detector per group. Reject or isolate incompatible embedding spaces. Currently two horse packs produce double-detections + mixed DBs.
- **2.5** **ONNX lifecycle hardening** in `onnxInferenceService`. Per-path load-promise dedup (so concurrent loads don't leak sessions). Release waits for active inference via refcount or read/write lock. Fixes: duplicate sessions, use-after-free during unload.
- **2.6** **Partial-success observations.** `wildlifePipeline.processPhoto` returns `{detections, errors}` with per-species/per-detection failure annotations. Capture saves partial observations with explicit failed statuses instead of losing all completed detections when one species fails.
- **2.7** **Model descriptors + I/O contract validation.** Declare expected input/output names, tensor ranks, dtype, embedding dim for detector and MiewID v4.1. Validate at session load time with actionable errors. Fail fast on model/config drift.
- **2.8** **Settings UX for model + pack management.** New routes: MiewID download/update/delete; broken-pack recovery. Also a first-run prompt to acquire MiewID when no pack has been loaded yet.

**Suggested order:** 2.1 + 2.2 + 2.3 together (foundation trio), then 2.4 (capture flow), then 2.5–2.7 as parallel hardening, then 2.8 last.

### Stage 3 — End-to-End Verification

- **3.1** Maestro E2E: bundle a tiny test pack (2-3 synthetic individuals, 3 embeddings each) + the FP16 MiewID ONNX in a `fixtures/` dir — sideload on test devices. Run full capture flow; assert a self-sighting (same photo → top candidate = same individual with score > 0.95).
- **3.2** Measure device latency: detection ms, embedding ms, match ms, total. Reference devices: **iPhone 13** (A15 Bionic, 6-core NPU) on iOS; **Pixel 8** (Tensor G3, clean AOSP for predictable NNAPI) on Android. Budgets: detection <80ms, embedding <500ms cold / <300ms warm. Log results to `outputs/reports/` in the KB.
- **3.3** Cross-platform consistency: same test image on iOS and Android → embeddings cosine similarity ≥ 0.999. Catches native preprocessing drift.

### Stage 4 — Review UX Polish

Not strictly required for "re-ID works," but unlocks real field usage.

- **4.1** Pack candidate name resolution in `MatchReviewScreen`: cache `pack.index.json` in memory on pack load; map `candidate.individualId` → name + ref photo URI.
- **4.2** Calibrated thresholds: per-species cosine thresholds (from test gallery stats) for "auto-approve" / "strong candidate" / "weak candidate" coloring.
- **4.3** Show top-5 with reference photos side-by-side with the capture crop.

### Stage 5 — Scale + Quality (Follow-on)

- Gallery dilution study per species (from miewid-trainer skill) to know how accuracy drops with gallery size.
- Move `embeddingMatchService` to sqlite-vec or FAISS when pack × gallery crosses ~5K individuals.
- Consider INT8 quantization after FP16 ships and proves stable — re-run rank-order parity against real wildlife test set.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ~~License ambiguity for MiewID weights~~ | Resolved 2026-04-23 (CXL employee sign-off). |
| FP16 drift on Android GPU delegate | Stage 3.3 cross-platform test; fall back to CPU EP |
| Pack schema drift (new v2 manifest) | `formatVersion` is already in the manifest; gate parsing on it |
| INT8 rank regressions | Don't ship INT8 until rank-order parity is proven on real crops |
| Accuracy degradation vs. Python reference | Golden parity test (Stage 0.3) + embedding parity test (Stage 3.3) |

## Success Criteria

- ✅ Stages 0 + 1 + 2 done, app can photograph an animal and show meaningful top-5 candidates from a real pack with real MiewID v4.1 embeddings.
- ✅ Self-sighting test: same photo re-captured returns the same individual at the top with cosine > 0.95.
- ✅ Cross-platform embedding cosine ≥ 0.999 on a fixed test image.
- ✅ First capture (cold) < 3 s on a reference flagship; subsequent captures < 1 s.
- ✅ No preprocessing tensor diverges from Python reference by > 1e-3 per element.

## Open Items to Confirm with User

1. ~~Is v4.1 published yet?~~ **Resolved 2026-04-23** — v4.1 checkpoint is local at `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin`. Will export it ourselves.
2. ~~License status with CXL~~ — **Resolved 2026-04-23** (Jason, CXL employee, granted sign-off).
3. ~~Target pack for dogfooding~~ — **wild horses in the State of Washington** (confirmed 2026-04-23). Likely sourced from `horses.wildbook.org`. **Caveat:** per miewid-trainer MODEL_DATA.md, `horse_wild_tunisian+face` gets 98.5% R1, but generic `horse_wild+face` scores 0% (likely dataset-too-small). Before shipping the pack, run a matchability assessment on a real Washington-horses COCO export using the miewid-trainer skill; if R1 < 40%, reserve extra budget for fine-tuning before declaring dogfood ready.
4. ~~Reference device(s) for latency + parity testing~~ — **iPhone 13 + Pixel 8** (confirmed 2026-04-23).
5. Preferred hosting for the published ONNX: HF repo / CXL CDN / GitHub release asset?
