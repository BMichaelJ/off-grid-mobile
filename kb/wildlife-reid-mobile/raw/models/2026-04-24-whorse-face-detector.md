# WHORSE Face Detector — Pack-Ready Deliverable

**Date ingested:** 2026-04-24
**Source path:** `/mnt/c/claude-skills/output/whorse-face-detector/`
**Built with:** yolo-trainer skill (1× RTX 5080 Laptop, 50 epochs, batch 64)
**Run provenance:** `/mnt/c/claude-skills/runs/runs/run_20260424_093150/run_manifest.json`

## Files

| File | Size | Purpose |
|---|---|---|
| `horse_wild_face_yolo11n_416.onnx` | 10 MB | YOLO11n single-class face detector, opset 12, simplified |
| `detector_config.json` | 567 B | DetectorConfig — drops into pack `config/detector.json` |
| `README.md` | 1.6 KB | Training + eval summary |

## Spec & Compatibility

The `detector_config.json` is byte-compatible with `src/types/wildlife.ts → DetectorConfig`:

```json
{
  "modelFile": "horse_wild_face_yolo11n_416.onnx",
  "architecture": "yolo11n",
  "inputSize": [416, 416],
  "inputChannels": 3,
  "channelOrder": "RGB",
  "normalize": { "mean": [0,0,0], "std": [1,1,1], "scale": 0.00392156862745098 },
  "confidenceThreshold": 0.25,
  "nmsThreshold": 0.45,
  "maxDetections": 100,
  "outputFormat": "yolov11-detect",
  "classLabels": ["horse_wild+face"],
  "outputSpec": {
    "boxFormat": "cxcywh",
    "coordinateType": "absolute",
    "outputTensorName": "output0",
    "layout": "1x(4+C)xN"
  }
}
```

End-to-end check vs the app's runtime constraints (see [[yolo-postprocessing]]):

| Constraint | This model |
|---|---|
| ONNX opset ≥ 11 (ORT Mobile) | opset 12 ✓ |
| Single output tensor `[1, 4+C, N]` | `[1, 5, 3549]` (1 class → 4+1=5; 3549 = 52² + 26² + 13² for 416×416 multi-scale heads) ✓ |
| No objectness channel (anchor-free) | YOLO11 anchor-free ✓ |
| Box format ∈ {cxcywh, xyxy, xywh} | cxcywh ✓ |
| Channel order RGB or BGR | RGB ✓ |
| `scale` is a multiplier (per `EMBEDDING_PACK_FORMAT.md`) | 1/255 = 0.00392... ✓ — matches the [[critical-bugs]] fix landed in PR #11 |
| Output tensor name | `output0` (hardcoded fallback in `onnxInferenceService.runDetection`) ✓ |
| Mobile-friendly size | 10 MB (well under feasibility-doc 15 MB detector budget) ✓ |

**No code changes required to consume this model in `parseYoloOutput`.**

## Eval (345-image WBIA holdout)

| Metric | Value |
|---|---|
| mAP@50 | 0.9999 |
| mAP@50-95 | 0.9576 |
| Optimal F1 | 0.997 @ conf 0.2 |

## Caveats (flagged by trainer)

1. **Metrics are near-ceiling because the task is easy.** 1725 training images, mostly one large face per close-cropped photo. Real-world mobile-camera photos (small, multi-subject, harsh lighting) will be the honest test. **Need a small field-photo eval set before broad deployment.**
2. **Possible viewpoint blind spots.** WBIA images are mostly frontal close-ups; expect under-firing on side profiles or distant subjects. **Remedy is more diverse training data, not more epochs.**

Both caveats are accuracy/recall risks for the dogfood pack — they don't block integration.

## What this unlocks

| Pack component | Status |
|---|---|
| Detector model + config | ✅ this deliverable |
| MiewID embedding model | ❌ Stage 1 of [[miewid-v41-integration-plan]] (export from `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin`) |
| `embeddings.bin` (per-individual MiewID vectors) | ❌ pending Wildbook horse-face COCO export + MiewID inference |
| `index.json` (individual metadata) | ❌ same |
| `reference_photos/{id}/` | ❌ pulled from Wildbook export |
| `manifest.json` | ❌ assembled last, references all of the above with checksums |

## Recommended next step

The **detector half** of the Washington horses pack is now done. Sequence to complete the pack:

1. Export MiewID v4.1 → ONNX (Stage 1.2 in [[miewid-v41-integration-plan]])
2. Pull a Washington-horses COCO from `horses.wildbook.org` filtered to `feature_class = horse_wild+face`
3. Use the miewid-trainer MCP `benchmark_model` to run a zero-shot matchability check against MiewID v4.1 on those crops
4. If matchability ≥ marginal tier, batch-infer MiewID v4.1 over the COCO crops to populate `embeddings.bin` + `index.json`
5. Bundle as a `.zip` per `EMBEDDING_PACK_FORMAT.md`

## References

- `/mnt/c/claude-skills/output/whorse-face-detector/README.md`
- `/mnt/c/claude-skills/runs/runs/run_20260424_093150/run_manifest.json`
- yolo-trainer skill at `/mnt/c/claude-skills/.claude/skills/yolo-trainer/`
- [[2026-04-23-miewid-v41-checkpoint]]
