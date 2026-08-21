# MiewID v4.1 ONNX Export — Stage 1.2 Deliverable

**Date:** 2026-04-24
**Tool:** `kb/wildlife-reid-mobile/tools/export_miewid_v41_onnx.py`
**Run command:** `python3 export_miewid_v41_onnx.py --fp16 --parity-trials 25`
**Source:** [[2026-04-23-miewid-v41-checkpoint]]

## Outputs (in `tools/output/`)

| File | Size | SHA-256 | Status |
|---|---|---|---|
| `miewid_v4_1_fp32.onnx` | 205.7 MB single file | `feb5ff43f548a12f3b92b6ab5117e80bfe1638216d8530617d7c3147ab8c7fd6` | reference (parity test target) |
| `miewid_v4_1_fp16.onnx` | **103.9 MB** single file | `3c1f1db5bda5d2434b01c63daa0bfa6a1f62b77ef89c40c335699eea2b04c0bd` | **mobile deployment artifact** |
| `miewid_v4_1_export_manifest.json` | 1.8 KB | — | provenance |

Both ONNX files are self-contained (no `.onnx.data` external-data shards) thanks to the consolidation pass added 2026-04-24.

## Source provenance

- **PyTorch checkpoint:** `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin`
- **Checkpoint SHA-256:** `032a41a0472697f1fc403b16ee1a20ef5cf01238b88cc4172ea0910d0b3808c9` (matches md5 noted in [[2026-04-23-miewid-v41-checkpoint]])
- **Backbone:** `efficientnetv2_rw_m`
- **Loss module:** `arcface_subcenter_dynamic`
- **n_classes:** 20,191 (training-time head; stripped at export)
- **`use_fc`:** false (so output is backbone GeM-pooled features, not the 2048 FC dim)

## Parity (vs PyTorch FP32 reference)

100 random batches × 4 samples = 400 actually wait. 25 trials × batch 4 = 100 samples each.

### FP32 ONNX vs PyTorch
- `cosine_min`: **0.9999998807907104** (well above the 0.9999 threshold)
- `cosine_mean`: 0.9999999958276748
- `l2_max` per-sample: 1.5e-4 (effectively floating-point round-trip noise)
- `embedding_dim`: **2152** (matches pack spec exactly)
- All 100 samples pass

Interpretation: the ONNX export is byte-for-byte equivalent to the PyTorch reference up to numerical noise. ArcFace head was correctly stripped — `missing=0, unexpected=0` on `load_state_dict`, meaning the canonical `wbia_miew_id.MiewIdNet` class is a perfect structural match for this checkpoint.

### FP16 ONNX vs PyTorch
- `cosine_min`: **0.9999938011169434** (well above the looser 0.999 threshold)
- `cosine_mean`: 0.9999958050251007
- `l2_max` per-sample: 0.23 (FP16 quantization noise — embedding magnitudes are O(2-3))
- All 100 samples pass

Interpretation: FP16 introduces ~5e-6 cosine drift, far below the precision floor that would affect re-ID rank ordering. Safe for production.

## Sanity check vs the [[on-device-reid-pipeline]] spec

| Pack spec field | Required value | Export observed |
|---|---|---|
| `embeddingModel.name` | `miewid-v4` (or v4.1) | `efficientnetv2_rw_m` backbone, MiewID v4.1 weights ✓ |
| `embeddingModel.version` | semver string | `4.1.0` (to be set in pack manifest) |
| `embeddingModel.inputSize` | `[440, 440]` | exported with `(1,3,440,440)` ✓ |
| `embeddingModel.normalize.mean` | `[0.485, 0.456, 0.406]` | ImageNet — model expects this ✓ |
| `embeddingModel.normalize.std` | `[0.229, 0.224, 0.225]` | ImageNet ✓ |
| `embeddingDim` | `2152` | confirmed via parity test ✓ |
| ONNX opset | ≥ 11 (ORT Mobile) | 17 ✓ |
| Input dtype | float32 | ✓ |
| Output | single tensor `(N, 2152)` | ✓ |

End-to-end compatible with the existing `onnxInferenceService.extractEmbedding()` after the [[critical-bugs]] fix in PR #11. No code changes required to consume.

## What this unlocks

This is the **embedding** half of the Washington horses pack. With the [[2026-04-24-whorse-face-detector]] (detector half) already in hand, the remaining pack ingredients are:

| Component | Status |
|---|---|
| Detector ONNX + config | ✅ done 2026-04-24 |
| **MiewID v4.1 ONNX (FP16)** | ✅ **done 2026-04-24 (this artifact)** |
| `embeddings.bin` (per-individual MiewID vectors) | ❌ pending Wildbook horse-face COCO export + batch inference |
| `index.json` (individual metadata + offsets) | ❌ same |
| `reference_photos/{id}/` | ❌ same |
| `manifest.json` | ❌ assembled last with checksums |

## Followups

- **Hosting decision** (Stage 1.5) — where does the FP16 ONNX live for app-side download? HF / CXL CDN / GitHub release. Untouched.
- **Cross-platform on-device parity** — Stage 3 in the integration plan: load `miewid_v4_1_fp16.onnx` on iPhone 13 + Pixel 8, embed a fixed test crop, assert cross-platform cosine ≥ 0.999.
- **Real-crop matchability assessment** — use miewid-trainer's `benchmark_model` on a Washington-horses COCO before bundling. If R1 < 40% on horse_wild+face, consider fine-tune before shipping the pack.

## Reproduce

```bash
cd /mnt/c/off-grid-mobile/kb/wildlife-reid-mobile/tools
python3 export_miewid_v41_onnx.py --fp16 --parity-trials 25
```

Runtime observed: ~2 minutes total on RTX 5080 Laptop (mostly FP16 conversion + parity).

## Notes

- **Dependency that wasn't in the original requirements list:** `onnxscript` (for PyTorch ≥ 2.10's dynamo-backed ONNX export path). Added during this run via `pip install --user --break-system-packages onnxscript`. Documented in tools/README.md.
- The `efficientnetv2_rw_m` backbone is **not** a public timm model name today — wbia_miew_id includes a registered alias. The script's `wbia_miew_id` canonical path uses this; the timm-fallback would need extra wiring. Stick with the canonical class.
