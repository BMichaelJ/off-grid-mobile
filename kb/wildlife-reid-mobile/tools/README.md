# Tools

Reproducible scripts that produce artifacts referenced by the wiki.

## `export_miewid_v41_onnx.py`

Exports the MiewID v4.1 PyTorch checkpoint at
`/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin` to ONNX
(FP32 + optional FP16), runs cosine-similarity parity tests against the
PyTorch reference, and writes a JSON manifest with provenance.

**Quick start (in your existing miewid Python env):**

```bash
cd /mnt/c/off-grid-mobile/kb/wildlife-reid-mobile/tools

# Standard production export — FP32 + FP16 + 50-trial parity
python export_miewid_v41_onnx.py --fp16

# Minimal sanity-check export — FP32 only, fewer parity trials
python export_miewid_v41_onnx.py --parity-trials 10

# Verify an already-exported ONNX without re-exporting
python export_miewid_v41_onnx.py --validate-only --onnx output/miewid_v4_1_fp32.onnx
```

**Inputs:**
- `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin` (overridable via `--checkpoint`)
- `/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.yaml` (overridable via `--config`)

**Outputs (default `--output-dir output/`):**
- `miewid_v4_1_fp32.onnx` — full-precision, ~200 MB
- `miewid_v4_1_fp16.onnx` — half-precision, ~100 MB (only with `--fp16`)
- `miewid_v4_1_export_manifest.json` — checkpoint hash, model config, opset, parity stats, output hashes

**Parity acceptance:**
- FP32 vs PyTorch reference: per-sample cosine similarity ≥ 0.9999 across `--parity-trials` × 4 random batches. Fails the script if any sample drops below.
- FP16 vs PyTorch reference: ≥ 0.999 (looser). Logged as warning if it fails — does not abort.

**Requirements:**
```
pip install torch onnx onnxruntime onnxconverter-common onnxscript timm pyyaml numpy
# Strongly preferred — gives canonical model class:
pip install -e /path/to/wbia-plugin-miew-id
```

`onnxscript` is needed for PyTorch ≥ 2.10's dynamo-backed `torch.onnx.export` path.
On a system with externally-managed Python (Debian/Ubuntu PEP 668), add
`--user --break-system-packages` to the pip install command.

If `wbia_miew_id` isn't importable, the script falls back to a minimal
`timm` + GeM reconstruction. The fallback may not be byte-identical to the
training-time forward — the parity check will catch this.

**What this script does NOT do:**
- Upload to HuggingFace / CDN — that's a separate publishing step
- Embed test wildlife crops — use the miewid-trainer skill's
  `benchmark_model` for that
- Bundle into a pack `.zip` — that's the next step after both detector and
  MiewID ONNX are in hand

## After running

1. Move the verified ONNX into a stable location for pack bundling
2. Record the SHA-256 from the manifest into the pack `manifest.json` under
   `embeddingModel.checksums`
3. Continue with [miewid-v4.1 integration plan Stage 1.5](../outputs/plans/miewid-v41-integration-plan.md) (publish step)
