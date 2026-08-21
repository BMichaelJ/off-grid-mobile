# Image Preprocessing (Detector + MiewID)

**Category:** method
**Sources:** [[docs-live/EMBEDDING_PACK_FORMAT.md]], `src/services/onnxInferenceService/preprocessing.ts`, `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt`, `ios/ImageTensorModule.swift`
**Related:** [[embedding-pack]], [[on-device-reid-pipeline]], [[critical-bugs]]
**Last updated:** 2026-04-22

## Summary

All image→tensor work is done in a native module (`ImageTensorModule`) on both platforms for perf. TypeScript wrappers in `preprocessing.ts` exist for detection (per-pack `DetectorConfig`) and for MiewID embedding (hardcoded 440×440 + ImageNet norm). Two real accuracy bugs exist in the current implementation — see [[critical-bugs]].

## Intended Formula

Per the pack spec (`docs/EMBEDDING_PACK_FORMAT.md:166`):

> `normalize.scale` is the pixel value scaling factor applied BEFORE mean/std normalization. `1/255 = 0.00392156862` converts uint8 [0-255] to float [0-1]. Set to `1.0` if the model expects [0-255] input.

So the correct formula is:

```
normalized[c] = (pixel[c] * scale - mean[c]) / std[c]
```

For MiewID (ImageNet): `scale = 1/255`, `mean = [0.485, 0.456, 0.406]`, `std = [0.229, 0.224, 0.225]`.
For typical YOLO: `scale = 1/255`, `mean = [0, 0, 0]`, `std = [1, 1, 1]` (→ `pixel/255`).

## Actual Implementation (Bug)

### Native (both Android and iOS)

Android `ImageTensorModule.kt:62`:
```kotlin
output[rIdx * h * w + i] = (r / scale - mean[0]) / std[0]
```

iOS `ImageTensorModule.swift:188` mirrors this. **Divides by scale** instead of multiplying. With `scale = 1/255`, this yields `r × 255`, which is wildly out of range — effectively garbage tensors.

### TypeScript MiewID wrapper

`src/services/onnxInferenceService/preprocessing.ts:62-70`:
```ts
const rawArray = await ImageTensorModule.imageToTensor(
  imageUri, width, height,
  norm.mean, norm.std,
  1.0,           // ← scale hardcoded to 1.0
  'RGB',
);
```
Comment says "[0, 255] divided by 1.0". Given the native bug, this produces raw 0-255 values minus ImageNet mean ≈ (0.485) — still completely wrong (pixel values 0-254.5 instead of ≈ -2 to +2).

Even if the spec interpretation were "divide" and that were correct here by coincidence, the TypeScript layer doesn't match the detection layer, and no pack with `scale: 1/255` would work as intended.

## Fix Strategy

1. **Change native math to multiply** by scale, matching the spec:
   ```kotlin
   output[rIdx * h * w + i] = (r * scale - mean[0]) / std[0]
   ```
2. **Update MiewID TS wrapper** to pass `scale = 1.0/255.0`:
   ```ts
   await ImageTensorModule.imageToTensor(..., 1.0 / 255.0, 'RGB');
   ```
3. **Update detector preprocessing** — pack's `config/detector.json` should always set `scale` to `1/255` for YOLO, which is what the spec already says. No change needed there after fix #1.
4. **Add golden parity test** that compares on-device tensor output vs a known Python / NumPy reference for a fixed test image.
5. **Update existing unit tests** to cover the corrected semantics.

## NCHW Packing

Output is laid out `[channel][h][w]`:
```
output[channel * H * W + row * W + col]
```
Channel indices swap for BGR: `rIdx=2, gIdx=1, bIdx=0`. Confirmed consistent between Kotlin and Swift.

## Resize

Bilinear resize to model input size before channel splitting. Both platforms use platform-native bilinear.

## Crop (Pre-Embedding)

`ImageTensorModule.cropImage(uri, x, y, w, h, outputPath)` — coords may be normalized or absolute (check per-call site). Saves JPEG at 95% quality. Called by `wildlifePipeline.processPhoto` between detection and embedding.

## Test Coverage

Exists:
- `__tests__/unit/services/onnxInferenceService.test.ts` — mocks native module; tests TS wrappers
- No golden parity test against Python reference

Needed:
- Parity test with a fixed image + known expected NCHW float array
- iOS + Android crossvalidation (same inputs → same outputs)

## References

- `docs/EMBEDDING_PACK_FORMAT.md` §config/detector.json → normalize
- `src/services/onnxInferenceService/preprocessing.ts:62`
- `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt:62`
- `ios/ImageTensorModule.swift:188`
