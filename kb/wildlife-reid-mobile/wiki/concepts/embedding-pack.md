# Embedding Pack

**Category:** concept
**Sources:** [[docs-live/EMBEDDING_PACK_FORMAT.md]], [[docs-live/plans/2026-02-25-wildlife-reid-design.md]]
**Related:** [[miewid-v4]], [[on-device-reid-pipeline]], [[off-grid-mobile-app]]
**Last updated:** 2026-04-22

## Summary

An **embedding pack** is a self-contained zip bundling a species-specific detector, pre-computed MiewID embeddings for all known individuals, reference photos for review, and metadata. Exported from a Wildbook instance via an Encounter Search export; consumed by the mobile app to enable offline individual re-identification for a single (species, feature class).

## Layout

```
{species}-{context}-{YYYY-MM}.zip
├── manifest.json
├── models/{detector-filename}.onnx
├── embeddings/
│   ├── index.json
│   └── embeddings.bin            # flat float32, little-endian, NCHW layout
├── reference_photos/{individual-id}/ref_NN.jpg
└── config/detector.json
```

## manifest.json (key fields)

- `formatVersion` (currently "1.0")
- `species`, `featureClass` (e.g., `horse+face`), `displayName`
- `wildbookInstanceUrl` — sync target
- `individualCount`, `embeddingCount`, `embeddingDim: 2152` (MiewID v4)
- `embeddingModel` — `name`, `version` (e.g., `4.0.0`), `huggingFaceRepo`, `inputSize: [440, 440]`, `normalize.{mean,std}`
- `detectorModel.filename`, `detectorModel.configFile`
- `checksums` — SHA-256 per critical file

## config/detector.json (key fields)

- `architecture` ("yolo11", "yolov8", "efficientdet", …)
- `inputSize`, `inputChannels: 3`, `channelOrder` ("RGB"/"BGR")
- `normalize.{mean, std, scale}` — where `scale` is intended as a **multiplier** (`1/255 = 0.00392156862`) applied **before** mean/std
- `confidenceThreshold`, `nmsThreshold`, `maxDetections`
- `outputFormat`, `classLabels`
- `outputSpec.{boxFormat: xyxy|xywh|cxcywh, coordinateType: normalized|absolute, layout}`

## embeddings.bin

- Flat float32, little-endian
- Individual *i*'s embeddings start at byte offset `individual.embeddingOffset * embeddingDim * 4`
- One individual may have multiple embeddings (multi-encounter) — count via `embeddingCount` in `index.json`

## Important Design Decisions

- **MiewID is NOT in the pack.** It's downloaded separately, since the same model works across all species. Packs reference the MiewID version so the app can warn on mismatch.
- **Detector IS in the pack.** Species-specific (e.g., different YOLO per feature class).
- **Reference photos are JPEG, ≤ 512×512**, ordered best-first.
- **Packs are content-addressed via SHA-256 checksums.**

## Open Questions / Contradictions

- **`normalize.scale` semantics.** The spec intends it as a **multiplier** (value `1/255`), but the native Kotlin (`android/.../ImageTensorModule.kt:62`) and Swift (`ios/ImageTensorModule.swift:188`) implementations **divide** by `scale`. With a pack that ships `scale: 0.00392…`, division yields `pixel × 255` — catastrophically wrong. See [[critical-bugs]]. Resolution: either (a) change native code to multiply, or (b) amend spec to clarify. Preferred: change native code + add golden parity test.

## References

- `docs/EMBEDDING_PACK_FORMAT.md`
- `docs/plans/2026-02-25-wildlife-reid-design.md` §3 Data Model
