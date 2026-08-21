# Codex Review — Off Grid Mobile → Wildlife Re-ID

**Date:** 2026-04-22
**Reviewer:** codex-cli 0.121.0 (read-only mode)
**Scope:** Assessment of work done toward on-device MiewID v4.1 individual re-ID.

## Top 3 Strengths

- **Layering is solid.** Session management in `src/services/onnxInferenceService/index.ts:8`, orchestration in `src/services/wildlifePipeline/index.ts:11`, DB assembly in `src/services/embeddingDatabaseBuilder.ts:29`, and persisted offline state in `src/stores/wildlifeStore.ts:79`. The separation will survive real-model integration.
- **Symmetric cross-platform native image prep/crop.** Kotlin `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt:21` and Swift `ios/ImageTensorModule.swift:12` mirror each other, removing a common RN bottleneck.
- **Disciplined commit progression.** docs/spec (`7704aed`) → core services (`97450e8`) → detector preprocessing (`79a14bf`) → pipeline (`68f5729`) → screens/store/tests (`28f0b57`, `c6a5a02`) → real native tensor + ONNX wiring (`5a67794`).

## Top 3 Risks / Gaps

1. **Licensing blocker.** Feasibility doc still says MiewID weights/code have no explicit open-source license. Must be resolved with Conservation X Labs before shipping.
2. **MiewID v4.1 is not actually wired as a product feature.** `miewidModelPath` is set-only in `src/stores/wildlifeStore.ts:56` / `:162`, checked in `src/screens/CaptureScreen/useCaptureFlow.ts:90`, but no call site ever populates it. Spec says MiewID is a separately downloaded shared model with version checks (`docs/EMBEDDING_PACK_FORMAT.md:151,549`) — none of that exists.
3. **Accuracy bugs in preprocessing/postprocessing.**
   - Native code divides by `scale` in `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt:62` and `ios/ImageTensorModule.swift:188`, but the pack spec defines `scale` as a multiplier (`1/255`) (`docs/EMBEDDING_PACK_FORMAT.md:166`). If a pack ships `scale: 0.00392...`, division yields `r * 255` — catastrophically wrong.
   - Embedding preprocessing passes `scale=1.0` in `src/services/onnxInferenceService/preprocessing.ts:62`, meaning 0-255 pixel values get ImageNet-normalized with `mean=[0.485,…]` / `std=[0.229,…]` that expects 0-1. MiewID embeddings will be garbage.
   - YOLO parser at `src/services/onnxInferenceService/postprocessing.ts:142` uses `4 + numClasses` rows. Matches YOLOv8/v11 (objectness-free) but not legacy YOLOv5 which is `5 + C`. Architecture-dependent — ensure detectors are v8+.

## Highest-Leverage Improvements

- **Build the real acquisition path first.** Pack import/unzip/checksum, MiewID download/cache, manifest version enforcement, startup restore. Today packs are only a directory abstraction (`src/services/packManager/index.ts:8`) and the UI has no install flow.
- **Fix tensor math and add golden parity tests against Python** for one detector and one MiewID export. Do not optimize before this.
- **Make review field-usable.** Resolve pack candidate names/photos (not raw IDs) in `src/screens/MatchReviewScreen/index.tsx:67`, add calibrated acceptance thresholds, replace GPS/sync stubs in `src/screens/CaptureScreen/useCaptureFlow.ts:63` and `src/screens/SyncScreen.tsx:55`.

## Answers to Specific Questions

**Is MiewID v4 actually wired in?** No. `extractEmbedding()` in `onnxInferenceService` is generic and would work if given a path, but no call site provides a real MiewID model. In current app UX, neither the detector nor MiewID is end-to-end without manually seeding pack/model paths.

**Model acquisition recommendation.** Ship MiewID as a **separate versioned download**, not bundled in the app binary. Start **FP16**, target ~80-120 MB. Keep detector ONNX in each pack. Avoid INT8 until you prove rank-order parity on real wildlife crops; re-ID quality is more fragile than detection.
