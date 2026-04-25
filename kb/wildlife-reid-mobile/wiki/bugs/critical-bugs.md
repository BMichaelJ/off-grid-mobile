# Critical Bugs (Pre-MiewID Integration)

**Category:** bugs
**Sources:** [[codex-review-2026-04-22]], direct read of `src/services/onnxInferenceService/preprocessing.ts`, native `ImageTensorModule` on both platforms
**Related:** [[image-preprocessing]], [[on-device-reid-pipeline]], [[miewid-v41-integration-plan]]
**Last updated:** 2026-04-22

## Summary

Two real preprocessing bugs will produce garbage embeddings and skewed detections even after MiewID is wired. They must be fixed first and covered by a golden parity test. Both were independently confirmed via file reads.

## Bug 1 — Native `scale` is divided instead of multiplied

**Files:**
- `android/app/src/main/java/ai/offgridmobile/imagetensor/ImageTensorModule.kt:62`
- `ios/ImageTensorModule.swift:188`

**Current code (Android):**
```kotlin
output[rIdx * h * w + i] = (r / scale - mean[0]) / std[0]
```

**Spec (`docs/EMBEDDING_PACK_FORMAT.md:166`):**
> `normalize.scale` … `1/255 = 0.00392156862` converts uint8 [0-255] to float [0-1]. Set to `1.0` if the model expects [0-255] input.

With a pack that ships `scale = 0.00392…` (correct per spec), the native code computes `r / 0.00392 = r * 255`, pushing values to [0, 65025] — completely out of range for any normalization.

**Fix:**
```kotlin
output[rIdx * h * w + i] = (r * scale - mean[0]) / std[0]
```
(Mirror in Swift.)

## Bug 2 — MiewID TS wrapper passes `scale = 1.0`

**File:** `src/services/onnxInferenceService/preprocessing.ts:62-70`

```ts
const rawArray = await ImageTensorModule.imageToTensor(
  imageUri, width, height,
  norm.mean, norm.std,
  1.0,             // ← should be 1.0/255.0
  'RGB',
);
```

Combined with the native bug, result is `r / 1.0 = r` (0-255), then `(r - 0.485) / 0.229` which yields values in [~-2.1, ~+1110]. MiewID expects inputs in roughly [-2.1, +2.7]. Embeddings are garbage → matching is meaningless.

**Fix after Bug 1 is resolved:**
```ts
1.0 / 255.0,
```

## Bug 3 (Architectural) — MiewID model path never populated

**Files:**
- `src/stores/wildlifeStore.ts:56,162` — `setMiewidModelPath` exists
- `src/screens/CaptureScreen/useCaptureFlow.ts:90` — early-returns when null
- **No call site ever populates it.**

The spec says MiewID is a separately downloaded shared model (`docs/EMBEDDING_PACK_FORMAT.md:151,549`). Download flow doesn't exist. See [[model-acquisition]].

## Bug 4 (Watch) — YOLO parser assumes v8/v11 layout

**File:** `src/services/onnxInferenceService/postprocessing.ts:143`
```ts
const numRows = 4 + numClasses;
```

Correct for YOLOv8/11 (no objectness). Wrong for legacy YOLOv5/v7. Low risk **if** we enforce v8+ detectors in packs. See [[yolo-postprocessing]] for branching strategy.

## Suggested Test Additions

1. **Golden parity test** (new): fix a test JPEG → load via native `imageToTensor(scale=1/255, mean=ImageNet, std=ImageNet)` → compare to a NumPy-generated reference tensor. ±1e-4 per element.
2. **Schema-driven test** (new): fabricate a `DetectorConfig` with `scale=1/255` and assert a solid-red 255/0/0 image lands at roughly `R=[(1-0.485)/0.229, ...]` after preprocessing.
3. **Update existing** `__tests__/unit/services/onnxInferenceService.test.ts` to expect the corrected semantics.

## Remediation Order (Recommended)

1. Land native fix (multiply instead of divide) + Swift mirror (one PR).
2. Land TS MiewID fix (`1/255`) + test updates (one PR).
3. Add golden parity test (one PR, can be same as #2).
4. Branch YOLO parser on architecture (defensive; separate PR).
5. Proceed to MiewID acquisition + wiring ([[miewid-v41-integration-plan]]).

## Status

- [x] **Fix Bug 1 (native `*` vs `/`)** — done 2026-04-23 on branch `fix/preprocessing-scale-math`. Kotlin verified green (11/11 tests); Swift mirrored, needs macOS/CI to verify.
- [x] **Fix Bug 2 (TS scale)** — done 2026-04-23. 410/410 Jest tests pass.
- [x] **Golden parity test** — cross-platform fixture added: 1×1 pure-red pixel through ImageNet norm + scale=1/255 → `R≈2.2489, G≈-2.0357, B≈-1.8044`. Encoded identically in Kotlin (`bitmapToNchw MiewID parity fixture — solid red 255 with ImageNet norm`) and Swift (`testExtractNchwMiewIDParityFixtureSolidRed`).
- [ ] YOLO architecture branching (deferred — only matters if a pack ever ships a YOLOv5/v7 detector)
- [ ] MiewID path populated end-to-end (Stage 2 of [[miewid-v41-integration-plan]])
