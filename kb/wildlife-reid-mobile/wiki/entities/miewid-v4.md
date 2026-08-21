# MiewID v4

**Category:** entity
**Sources:** [[docs-live/WILDLIFE_REID_FEASIBILITY.md]], [[docs-live/EMBEDDING_PACK_FORMAT.md]], miewid-trainer skill (MODEL_DATA.md reference)
**Related:** [[embedding-pack]], [[on-device-reid-pipeline]], [[image-preprocessing]], [[miewid-v41-integration-plan]]
**Last updated:** 2026-04-22

## Summary

MiewID is Wild Me / Conservation X Labs' multispecies animal re-identification model. **v4** (Jan 2026) covers ~90 species and ~110 feature classes with ArcFace subcenter dynamic-margin training on ~20K individuals. Used to produce 2152-dim L2-normalizable embedding vectors from 440×440 animal crops; cosine similarity against a gallery of known individuals drives re-ID.

## Architecture & Profile

| Property | Value |
|---|---|
| Backbone | EfficientNetV2-RW-M (timm) |
| Parameters | 51.1M |
| GMACs | 24.38 |
| Input | 440×440 RGB, ImageNet-normalized (mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]`) |
| Pooling | GeM (Generalized Mean Pooling), learnable p=3 |
| Output | 2,152-dim embedding (batch-normalized) |
| Loss | Sub-center ArcFace with dynamic margins (s=49.3, m=0.33, k=2) |
| Framework | PyTorch (timm + HuggingFace transformers) |
| Distribution | Safetensors on HuggingFace |
| Size estimates | ~200 MB FP32, ~100 MB FP16, ~50 MB INT8 |
| Accuracy (v4) | 78% top-1, 87% top-5, 89% top-10 on held-out test data |

## Versions

| Version | Source | Species / n_classes | Notes |
|---|---|---|---|
| v2 | `conservationxlabs/miewid-msv2` | 54 species | |
| v3 | `conservationxlabs/miewid-msv3` | 64 species | Common zero-shot baseline |
| v4 (main) | `conservationxlabs/miewid-msv4`; local `/mnt/c/claude-skills/models/reference/miew_id.msv4_v3_main.bin` | 19,911 classes | Current production; includes deer |
| **v4.1 (main)** | **Local: `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin`** (md5 `71c0bdd9bf8cbdb1b9e967a2e96949bb`, 206,040,591 B) + `.yaml` | **20,191 classes** (+280 over v4 main) | **Target for this project.** Same architecture / hyperparameters as v4 main — additive retrain. See [[2026-04-23-miewid-v41-checkpoint]]. |

## Relation to this project

The Off Grid Mobile fork targets MiewID **v4.1** on-device. The embedding pack format (`embeddingModel.version`) is explicitly versioned so the app can version-gate packs. `embeddingDim: 2152` is baked into the pack spec ([[embedding-pack]]).

### Current wiring status

MiewID is **not yet operationally wired**:
- `extractEmbedding()` in `src/services/onnxInferenceService/index.ts` is generic and would call ONNX Runtime if given a model path, but
- `wildlifeStore.miewidModelPath` is never populated by any call site
- The spec-expected flow (download MiewID separately from pack, version-gate against `embeddingModel.version`) is not implemented
- See [[state-of-implementation]] and [[critical-bugs]].

## ONNX Export Path

1. `torch.onnx.export()` from PyTorch checkpoint (opset ≥ 11 for ONNX Runtime Mobile)
2. Verify numerical parity against Python reference on a fixed batch of crops (rank-order parity > cosine-closeness)
3. FP16 for mobile first (~100 MB). INT8 only after rank-order parity is proven on real wildlife crops.
4. Distribution: separate download, not bundled in the app binary — the same MiewID works across all species packs, and the app should warn when pack `embeddingModel.version` doesn't match loaded MiewID.

## Literature Context (from miewid-trainer skill)

- **EfficientNetV2-M backbone** outperforms SwinV2-Base by ~4.5% on multispecies Re-ID (fine-grained CNNs still competitive).
- **Sub-center ArcFace with dynamic margins** differentiates MiewID from MegaDescriptor (which uses standard ArcFace m=0.5, s=64).
- GeM pooling validated as standard.
- 440×440 square input is optimal for fine-grained Re-ID.
- Multi-species training provides ~12.5% avg improvement over single-species.

## Open Questions

- ~~**License** — MiewID weights have no explicit open-source license~~. **Resolved 2026-04-23**: Jason (CXL employee) signed off on mobile redistribution of the v4.1 ONNX export. The PyTorch `.bin` is not distributed directly; we ship a derivative ONNX.
- **v4.1 public availability** — checkpoint exists locally (see above); not confirmed published to a public HF repo. For app distribution we need either (a) a public HF mirror or (b) a CXL-hosted CDN URL for the ONNX export.
- **INT8 quantization stability** — untested for re-ID; start FP16.
- **Core ML / NNAPI delegate parity** — if using EP-accelerated inference on iOS Neural Engine / Android NNAPI, verify embeddings are bitwise close to CPU/ORT reference.

## References

- `docs/WILDLIFE_REID_FEASIBILITY.md` §MiewID Technical Profile
- `docs/EMBEDDING_PACK_FORMAT.md` §manifest.json (embeddingModel block)
- miewid-trainer skill MODEL_DATA.md (Wild Me reference checkpoints)
- arxiv 2412.05602 (MiewID v2 paper)
- Beyan et al. 2026 Information Fusion 133 — animal Re-ID survey
