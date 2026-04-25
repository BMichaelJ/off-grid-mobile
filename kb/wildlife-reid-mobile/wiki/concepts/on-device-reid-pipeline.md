# On-Device Re-ID Pipeline

**Category:** concept
**Sources:** [[docs-live/plans/2026-02-25-wildlife-reid-design.md]], [[codebase-map]]
**Related:** [[off-grid-mobile-app]], [[miewid-v4]], [[embedding-pack]], [[image-preprocessing]], [[yolo-postprocessing]]
**Last updated:** 2026-04-22

## Summary

Offline detect-then-embed-then-match pipeline running entirely on-device via ONNX Runtime. User takes a photo, the app runs each loaded species' detector, crops each detection, extracts a 2152-dim MiewID embedding, ranks against an in-memory database (pack + local individuals), and shows top-5 candidates for human review. Reviewed results are queued for later Wildbook sync.

## Stages

```
1. CAPTURE
   photoUri saved, GPS (stub) + timestamp recorded

2. DETECT           (per loaded species detector)
   - Preprocess image → NCHW Float32 tensor (native ImageTensorModule)
   - ONNX session.run()
   - Parse output (YOLOv8/11 layout: 4+numClasses rows × N detections)
   - Confidence filter → NMS → slice to maxDetections

3. CROP & EMBED     (per detection)
   - Native cropImage() → JPEG on disk
   - Preprocess 440×440 ImageNet norm
   - MiewID ONNX session.run() → Float32Array[2152]

4. MATCH            (per detection)
   - cosineSimilarity vs. database
     · pack individuals (multi-embedding per individual; take best score)
     · local individuals (same)
   - Sort desc, top-5 → MatchCandidate[]

5. REVIEW           (human, async)
   - Approve → attach embedding to approved individual (accumulates)
   - No-Match → create FIELD-XXX LocalIndividual with this embedding
   - Skip → leave pending

6. SYNC             (when online, not implemented)
   - syncQueue → Wildbook REST API
   - Detection → Encounter; LocalIndividual → MarkedIndividual
```

## Key Code Paths

| Stage | File |
|---|---|
| Orchestration | `src/services/wildlifePipeline/index.ts` |
| Detection inference | `src/services/onnxInferenceService/index.ts` → `runDetection` |
| Detection preproc | `src/services/onnxInferenceService/preprocessing.ts` |
| Detection postproc / NMS | `src/services/onnxInferenceService/postprocessing.ts` |
| Crop | Native `ImageTensorModule.cropImage` |
| Embedding inference | `src/services/onnxInferenceService/index.ts` → `extractEmbedding` |
| Embedding preproc | `src/services/onnxInferenceService/preprocessing.ts` |
| Matching | `src/services/embeddingMatchService/index.ts` |
| DB assembly | `src/services/embeddingDatabaseBuilder.ts` |
| User flow | `src/screens/CaptureScreen/useCaptureFlow.ts` |
| Review | `src/screens/MatchReviewScreen/index.tsx` |

## Performance Budget (flagship phone, from feasibility)

| Stage | Target |
|---|---|
| Detection (YOLO nano/small, quantized) | 20-80ms |
| MiewID embedding (FP16) | 100-500ms |
| Vector search (10K individuals) | < 50ms |

## Scale Notes

- Brute-force cosine sim is fine for < ~5K individuals. For larger galleries, migrate to sqlite-vec / ObjectBox / FAISS-CPU.
- Storage: ~550 MB total for a realistic deployment (detector 15 MB + MiewID 100 MB FP16 + 10K individuals × 5 embeddings × 2152 × 4 B ≈ 430 MB).

## Known Issues

- Preprocessing scale math — see [[critical-bugs]]
- MiewID model is never loaded in production flow — see [[state-of-implementation]]
- Pack candidate names/photos not resolved in review UI
- GPS returns null; sync is a stub
