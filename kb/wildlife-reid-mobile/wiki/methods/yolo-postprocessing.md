# YOLO Postprocessing (Parse + NMS)

**Category:** method
**Sources:** `src/services/onnxInferenceService/postprocessing.ts`, [[docs-live/EMBEDDING_PACK_FORMAT.md]]
**Related:** [[on-device-reid-pipeline]], [[embedding-pack]]
**Last updated:** 2026-04-22

## Summary

`parseYoloOutput()` interprets a row-major Float32 tensor from a YOLO ONNX model, applies confidence threshold, converts boxes to normalized xywh, sorts, runs IoU-based NMS, and slices to `maxDetections`. Assumes YOLOv8/YOLO11 output layout `[1, (4 + numClasses), N]` — **no objectness channel**.

## Output Layout Assumption

Current implementation at `postprocessing.ts:143`:

```ts
const numRows = 4 + numClasses;
```

This is correct for **YOLOv8 and YOLO11** (they fold objectness into class scores). Legacy **YOLOv5** outputs `[1, (5 + numClasses), N]` with objectness at row 4. If a pack ever ships a v5 detector, this code will silently misread the tensor.

**Mitigation:** The pack's `config/detector.json` has an `architecture` field. The parser should branch on it (or on the observed tensor dimension) and handle `5 + C` for `yolov5` / `yolov7`.

## Box Format Support

Driven by `config.outputSpec.boxFormat`:

| Format | Layout | Conversion |
|---|---|---|
| `cxcywh` | center x/y + w/h | `x = cx - w/2`, `y = cy - h/2` (YOLOv8/v11 default) |
| `xyxy` | top-left + bottom-right | `w = x2-x1`, `h = y2-y1` |
| `xywh` | top-left + w/h | pass-through |

And `config.outputSpec.coordinateType`: `"normalized"` (pass through) vs `"absolute"` (divide by `inputSize`).

## Confidence & Class Selection

For each detection:
1. Read 4 box values (row 0..3, col i)
2. Read per-class scores (rows 4..4+numClasses-1, col i)
3. Take `argmax` across classes — pick best class + confidence
4. Skip if confidence < `config.confidenceThreshold`

## NMS

Standard greedy IoU-based:
1. Sort candidates by confidence desc
2. Repeatedly pick highest, drop any remaining with `IoU > nmsThreshold` against it
3. Return survivors

Trimmed to `config.maxDetections`.

## Test Coverage

`__tests__/unit/services/onnxInferenceService.test.ts` covers:
- Multiple box formats (cxcywh, xyxy, xywh)
- Absolute vs normalized coords
- Multi-class scoring
- NMS suppression of overlapping boxes
- Confidence threshold filtering

## Improvement Opportunities

- **Objectness support** for YOLOv5/v7 detectors (as noted above).
- **Class-aware NMS** (different IoU per class) for packs that need it.
- **Batch inference** if a detector supports multi-crop input — not needed for single-photo capture flow.

## References

- `src/services/onnxInferenceService/postprocessing.ts`
- Ultralytics YOLOv8 output layout docs
