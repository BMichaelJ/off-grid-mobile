# Codebase Map — Wildlife Re-ID Pipeline (Off Grid Mobile)

**Date:** 2026-04-22
**Source:** Explore agent thorough pass over `/mnt/c/off-grid-mobile`
**Purpose:** Full map of what's been built in service of on-device MiewID re-ID, filed as the primary raw source for the KB.

## 1. Services Layer

### onnxInferenceService (`src/services/onnxInferenceService/`)
Unified ONNX Runtime wrapper for both detector (YOLO) and embedding (MiewID) inference.

**Public API:**
- `loadModel(modelPath, type)` — load detector or embedding ONNX
- `runDetection(imageUri, detectorModelPath, config) → DetectionOutput`
- `extractEmbedding(croppedImageUri, miewidModelPath, opts?) → EmbeddingOutput`
- `unloadModel(modelPath)`, `unloadAll()`, `isModelLoaded(modelPath)`

**Data flow:**
1. Detection: imageUri → `preprocessImageForDetection()` → native `ImageTensorModule` (NCHW tensor) → ONNX `session.run()` → `parseYoloOutput()` (NMS, filter, box convert) → `DetectionResult[]`
2. Embedding: croppedImageUri → `preprocessImageForEmbedding()` (440×440, ImageNet norm) → ONNX → Float32Array[2152]

**Details:** NCHW layout, supports YOLOv8/11 cxcywh + xyxy/xywh via `DetectorConfig.outputSpec`; MiewID defaults 440×440 ImageNet mean/std; IoU-based NMS; inference timing tracked. Status: real, tested.

### Native ImageTensor Module
- Android: `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt` (Kotlin)
- iOS: `ios/ImageTensorModule.swift` (Swift)
- API: `imageToTensor(uri, w, h, mean, std, scale, channelOrder) → number[]`, `cropImage(uri, x, y, w, h, outputPath) → string`
- Loads `content://`, `file://`, plain paths; bilinear resize; per-channel `(pixel/scale - mean[i]) / std[i]` (**note: divide, not multiply — see bugs**); NCHW pack; RGB↔BGR swap; JPEG crop save (95% q).

### packManager (`src/services/packManager/`)
Loads embedding packs from disk.
- `initialize()` creates `DocumentDirectoryPath/embedding_packs/`
- `loadPackIndex(path) → PackIndividual[]`
- `loadManifest(path) → EmbeddingPackManifest`
- `getEmbeddingsForIndividual(allEmbeddings, individual, embeddingDim) → number[][]`
- `deletePack(dir)`, `getPacksDir()`
- Pack layout: manifest.json, config/detector.json, models/{detector}.onnx, embeddings/index.json, embeddings.bin (flat FP32 LE), reference_photos/{id}/
- Offset math: `individual.embeddingOffset * embeddingDim * 4` bytes

### wildlifePipeline (`src/services/wildlifePipeline/`)
Orchestrates detect → crop → embed → match.
- `processPhoto(params) → PipelineResult`
- Per-species: load detector → detect → for each detection: crop (native), embed, match → Detection with `matchResult.topCandidates`
- Saves observations to store; returns pipeline result

### embeddingMatchService (`src/services/embeddingMatchService/`)
- `matchEmbedding(query, database, topN) → MatchCandidate[]`
- Cosine similarity brute-force; per-individual best score across their embeddings
- Sufficient for <5K individuals

### embeddingDatabaseBuilder.ts
- `buildEmbeddingDatabase(species, packs, localIndividuals) → EmbeddingDatabaseEntry[]`
- Filters packs by species, loads `index.json` + `embeddings.bin` (base64 → Uint8Array → Float32Array), merges with local individuals. Broken packs logged but non-fatal.

## 2. Screens (User Flow)

- **WildlifeHomeScreen.tsx** — dashboard (quick capture, pack summary, recent observations, sync status)
- **CaptureScreen** + `useCaptureFlow.ts` — take/pick photo → build `SpeciesConfig[]` per loaded pack → call pipeline → save observation → navigate. **GPS stub returns null.**
- **DetectionResultsScreen** — photo + bounding box overlays; tap detection → MatchReview
- **MatchReviewScreen** — cropped crop + candidates (local shows userLabel/ref photo; pack shows raw ID — name resolution TODO). Actions: Approve → `addEmbeddingToLocalIndividual`; No Match → create `FIELD-XXX` LocalIndividual; Skip.
- **ObservationsScreen** — list + filters (All / Pending / Reviewed / Synced)
- **PacksScreen + PackDetailScreen** — lists loaded packs
- **SyncScreen.tsx** — stubbed queue UI

## 3. Types & Stores

### `src/types/wildlife.ts`
`EmbeddingPackManifest`, `EmbeddingPack`, `PackIndividual`, `LocalIndividual`, `Observation`, `Detection`, `MatchCandidate`, `DetectorConfig`, `SyncQueueItem`

### `src/stores/wildlifeStore.ts`
State: packs, observations, localIndividuals, syncQueue, miewidModelPath, nextFieldId.
Actions: addPack, addObservation, updateDetection, addLocalIndividual, addEmbeddingToLocalIndividual, addToSyncQueue, updateSyncStatus, setMiewidModelPath, getNextFieldId. Zustand + AsyncStorage.

## 4. Tests

- Unit: `__tests__/unit/services/onnxInferenceService.test.ts` (NMS, box formats, multi-class), embeddingMatchService, packManager, embeddingDatabaseBuilder, wildlifeStore.
- Integration: `__tests__/integration/wildlife/pipelineFlow.test.ts` — first sighting → no match → local individual → re-sighting match → accumulate embeddings.

## 5. Data Flow

```
capture photo → useCaptureFlow.processPhoto
  → load detector config from pack manifest
  → buildEmbeddingDatabase(species, packs, locals)
  → wildlifePipeline.processPhoto
      for each species: load detector → detect → for each det: crop → embed → match
  → save Observation → navigate to DetectionResults
MatchReviewScreen: approve / no-match (new local FIELD-XXX) / skip
Sync: syncQueue → (stub; no HTTP client yet)
```

## 6. What's Built vs Stubbed

| Layer | Status |
|---|---|
| ONNX inference | Real |
| Image preprocessing | Real (but see accuracy bugs) |
| Detection postprocessing / NMS | Real |
| Embedding extraction | Real (called, but model never installed) |
| Vector matching | Real (cosine brute-force) |
| Pack loading | Real |
| Observation storage | Real (Zustand + AsyncStorage) |
| Local individual management | Real |
| Match review UI | Real; pack-name resolution TODO |
| Detector model path | Loaded from manifest; no auto-download |
| **MiewID model path** | **Never populated** |
| Pack download | Missing |
| Geolocation | Stubbed (returns null) |
| Wildbook sync | Queue exists, no HTTP client |
| Model timeout | Missing |
| Download retry | Missing |

## 7. Critical Gaps for MiewID v4.1 On-Device Re-ID End-to-End

1. MiewID v4.1 model acquisition flow (download, cache, version enforcement)
2. Pack install UX (import .zip → unzip → checksum verify → register)
3. Preprocessing bugs: `scale` semantics (divide vs multiply), MiewID pipeline feeds 0-255 to ImageNet norm
4. Pack name/photo resolution in MatchReviewScreen
5. GPS + sync (out of scope for pure re-ID, but needed for field use)
6. MiewID license clarification with CXL
