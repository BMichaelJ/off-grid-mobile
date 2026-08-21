# MiewID v4.1 Checkpoint — Local Reference

**Date ingested:** 2026-04-23
**Source path:** `/mnt/c/claude-skills/models/reference/`

## Files

| File | Size | MD5 | Notes |
|---|---|---|---|
| `miew_id.msv4_1_main.bin` | 206,040,591 B (~196 MB) | `71c0bdd9bf8cbdb1b9e967a2e96949bb` | PyTorch state dict, FP32 |
| `miew_id.msv4_1_main.yaml` | 1,477 B | — | Training config |
| `detect.yolov11.msv3.pt` | 5.4 MB | (see `.md5` sidecar) | Companion YOLOv11 detector (msv3-era) |

Same file size (206 MB) as v3 and v4 main — architecture is identical, only weights change.

## Training Config (from .yaml)

```yaml
model_params:
  model_name: efficientnetv2_rw_m
  loss_module: arcface_subcenter_dynamic
  margin: 0.32841442327915477
  s: 49.32675426153405
  k: 2
  n_classes: 20191          # v4 main was 19911 → v4.1 adds 280 individuals
  fc_dim: 2048
  dropout: 0
  ls_eps: 0
  theta_zero: 0.785
  use_fc: false             # Output is backbone GeM features, NOT the 2048 FC
  pretrained: true

data:
  image_size: [440, 440]
  crop_bbox: true

engine:
  epochs: 30
  loss_module: arcface
  seed: 42
  use_swa: false

test:
  batch_size: 8
  fliplr: false
  fliplr_view: []
```

Exp name: `EDA-msv4_1` · Project: `msv4-main` · Trained on CUDA device 6.

## Compared to v4 main (`miew_id.msv4_v3_main.yaml`)

| Field | v4 main | v4.1 |
|---|---|---|
| `n_classes` | 19,911 | **20,191** (+280) |
| `margin`, `s`, `k` | same | same |
| Architecture | `efficientnetv2_rw_m` | same |
| Image size | 440×440 | same |
| `use_fc` | false | false |

Interpretation: v4.1 is an **additive retrain** on a superset of individuals — same architecture, same hyperparameters. ONNX export recipe will be identical to any v3/v4 main recipe, just pointed at this checkpoint.

## Embedding Dimension

The pack spec ([[embedding-pack]]) and feasibility doc ([[miewid-v4]]) state `embeddingDim: 2152`. With `use_fc: false`, the output comes from the backbone's GeM-pooled features. EfficientNetV2-RW-M has a natural feature dim around 2152 (per timm spec), which matches the pack format.

## Implications for On-Device Integration

- We have a **concrete v4.1 checkpoint to export**, no dependency on an external HF release.
- Export path (from [[model-acquisition]]): load `.bin` into the MiewID model class (`wbia-plugin-miew-id`) → `torch.onnx.export` at opset 17 with dynamic batch → parity test on CPU ORT → FP16 convert → parity test again.
- The companion `detect.yolov11.msv3.pt` (5.4 MB) can be exported to ONNX as the default detector for early testing — well under the 15 MB detector budget in the feasibility doc.

## Open Items

- License status for redistribution — the file is local to Jason's workspace; mobile distribution still requires CXL sign-off.
- Confirm exported ONNX preserves the normalization path (MiewID ingests 440×440 RGB, ImageNet mean/std, [0,1] range).
- Confirm the `.bin` loads cleanly from the `wbia-plugin-miew-id` repo class without a config mismatch (n_classes=20191).
