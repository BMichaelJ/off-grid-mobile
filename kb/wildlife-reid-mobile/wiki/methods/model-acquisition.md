# Model Acquisition (MiewID + Detectors)

**Category:** method
**Sources:** [[docs-live/plans/2026-02-25-wildlife-reid-design.md]], [[docs-live/EMBEDDING_PACK_FORMAT.md]], [[codex-review-2026-04-22]]
**Related:** [[miewid-v4]], [[embedding-pack]], [[miewid-v41-integration-plan]]
**Last updated:** 2026-04-22

## Summary

MiewID is **one shared model** used across all species — downloaded separately from packs and reused. Detectors are **species-specific** and ship inside each pack. The app must enforce `embeddingModel.version` compatibility between the loaded MiewID and each pack's manifest. Neither side of this acquisition flow is implemented yet.

## MiewID Export → ONNX

1. **Start from PyTorch checkpoint.** Use the local v4.1 reference file we already have:
   - `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin` (md5 `71c0bdd9bf8cbdb1b9e967a2e96949bb`, 206 MB FP32)
   - Companion config: `miew_id.msv4_1_main.yaml` (see [[2026-04-23-miewid-v41-checkpoint]])
   - Architecture: `efficientnetv2_rw_m`, `arcface_subcenter_dynamic`, `n_classes=20191`, `use_fc=false`, `image_size=[440,440]`
2. **Export:** load via the `wbia-plugin-miew-id` model class (the checkpoint is a raw state dict, not an HF transformers artifact). Strip the ArcFace head — we only need the backbone + GeM → L2 norm path since the app only uses embeddings, not classification logits.
   ```python
   import torch
   from wbia_miew_id.models import MiewIdNet  # or equivalent class in the repo
   import yaml

   cfg = yaml.safe_load(open(".../miew_id.msv4_1_main.yaml"))["model_params"]
   model = MiewIdNet(
       model_name=cfg["model_name"],      # efficientnetv2_rw_m
       use_fc=cfg["use_fc"],              # False
       fc_dim=cfg["fc_dim"],
       dropout=cfg["dropout"],
       loss_module=cfg["loss_module"],
       n_classes=cfg["n_classes"],
       # ArcFace head parameters…
   )
   state = torch.load(".../miew_id.msv4_1_main.bin", map_location="cpu")
   model.load_state_dict(state, strict=False)  # tolerate ArcFace head keys
   model.eval()

   # Export only backbone+pool, NOT the classification logits.
   class EmbeddingOnly(torch.nn.Module):
       def __init__(self, m): super().__init__(); self.m = m
       def forward(self, x): return self.m.extract_features(x)  # backbone+GeM→L2

   export_model = EmbeddingOnly(model)
   dummy = torch.randn(1, 3, 440, 440)
   torch.onnx.export(
       export_model, dummy, "miewid_v4_1.onnx",
       opset_version=17,
       input_names=["input"],
       output_names=["embedding"],
       dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
   )
   ```
   (Final method name depends on the exact `wbia-plugin-miew-id` API — may be `extract_features`, `embedding`, or similar. See the miewid-trainer skill for the authoritative class signature.)
3. **Verify numerical parity.** On a fixed batch of ~50 crops, compare ONNX CPU vs PyTorch float32. Rank-order parity (cosine-sim ordering of gallery matches) is the relevant metric, not raw cosine closeness.
4. **Quantize:** Start FP16 (`onnxconverter_common.float16.convert_float_to_float16`), re-run parity. INT8 only after confirming rank parity on real wildlife crops.
5. **Publish:** Upload to HF (`conservationxlabs/miewid-msv4-onnx` or equivalent) with clear version tag.

## Distribution Strategy (Recommended)

| Asset | Distribution | Rationale |
|---|---|---|
| MiewID ONNX FP16 | **Separate download** (HuggingFace), ~80-120 MB | Shared across all species packs; app binary stays lean; can version-bump independently |
| Detector ONNX | **Bundled in pack** (.zip) | Species-specific; each pack's correct detector travels with its embeddings |
| Reference photos | **Bundled in pack** | Needed for review UI |

Avoid bundling MiewID in the app binary — it blows up install size and makes version updates require app store rollouts.

## App-Side Acquisition Flow (Needed)

Currently missing. Target flow:

1. **First run / model missing:**
   - Surface "Download MiewID v4.1 (112 MB)" prompt
   - Download via existing `backgroundDownloadService` (reused from Off Grid)
   - Verify SHA-256 checksum
   - Store in `DocumentDirectoryPath/models/miewid_v4_1.onnx`
   - Set `wildlifeStore.miewidModelPath`
2. **Version check on pack load:**
   - Compare `pack.manifest.embeddingModel.version` to loaded MiewID version
   - Block or warn on mismatch; offer MiewID update
3. **Restore on startup:**
   - On `App.initializeApp`, scan `models/` directory and rehydrate `miewidModelPath`

## Pack Install Flow (Needed)

Currently `packManager.initialize()` just creates the directory; no import UX exists.

Target flow:
1. **Source .zip** via Files picker / deep-link / server download
2. **Unzip** to `packs/{pack-id}/`
3. **Validate:** parse `manifest.json`, check `formatVersion`, verify all listed `checksums`, spot-check `embeddings.bin` size vs `embeddingCount × embeddingDim × 4`
4. **Register** in `wildlifeStore.packs`
5. **Detector warm-load** (optional) so first capture isn't slow
6. **Delete flow** for storage reclamation

## Open Questions

- ~~**License** — MiewID weights license is unresolved~~. Signed off by Jason (CXL) on 2026-04-23 for the v4.1 ONNX export.
- **Hosting** — Where does the ONNX export live for app download? Options: (a) public HF mirror, (b) CXL CDN, (c) GitHub Release asset.
- **Delta updates** — If a pack is re-exported with +10 individuals, can we fetch only the delta?

## References

- `docs/plans/2026-02-25-wildlife-reid-design.md` §4 ML Inference Pipeline, §6 Distribution
- `docs/EMBEDDING_PACK_FORMAT.md`
- [[codex-review-2026-04-22]]
