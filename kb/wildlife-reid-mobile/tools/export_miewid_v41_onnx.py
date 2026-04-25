#!/usr/bin/env python3
"""
Export MiewID v4.1 PyTorch checkpoint to ONNX for on-device inference.

Source artifacts:
    /mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin   (~206 MB FP32)
    /mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.yaml  (training config)

Outputs (default --output-dir output/):
    miewid_v4_1_fp32.onnx                   (~200 MB)
    miewid_v4_1_fp16.onnx                   (~100 MB, only with --fp16)
    miewid_v4_1_export_manifest.json        (provenance + parity stats)

Usage examples:
    # Full export with FP16 conversion + parity tests
    python export_miewid_v41_onnx.py --fp16

    # Custom paths
    python export_miewid_v41_onnx.py \\
        --checkpoint /path/to/miew_id.msv4_1_main.bin \\
        --config     /path/to/miew_id.msv4_1_main.yaml \\
        --output-dir ./output \\
        --fp16 --parity-trials 100

    # Skip export, only verify an already-exported ONNX file
    python export_miewid_v41_onnx.py --validate-only \\
        --onnx output/miewid_v4_1_fp32.onnx

Requirements:
    pip install torch onnx onnxruntime onnxconverter-common timm pyyaml numpy

    Strongly preferred: wbia-plugin-miew-id installed in editable mode so the
    canonical MiewIdNet class is used. The script falls back to a minimal
    timm + GeM reconstruction if wbia_miew_id can't be imported, but the
    canonical class guarantees byte-identical inference to the trainer.

What this script does:

    1. Load the YAML config + .bin checkpoint.
    2. Instantiate a MiewIdNet (or timm-fallback equivalent), then strip the
       ArcFace classification head (we only need the 2152-dim embedding).
    3. Wrap in an EmbeddingOnly nn.Module that returns the L2-normalized feature.
    4. Export to ONNX (opset 17, dynamic batch dimension).
    5. Parity check: run N random batches through both PyTorch (FP32) and
       ONNX Runtime (CPU EP), compute per-sample cosine similarity, and assert
       all >= 0.9999. Reports min/mean/max + L2-distance stats.
    6. (Optional) Convert to FP16 via onnxconverter_common, re-run parity.
    7. SHA-256 every output. Write a JSON manifest with full provenance.

Why "embedding only":
    MiewID's training-time forward returns logits over n_classes (20,191 for
    v4.1). For inference we only need the embedding before the ArcFace head;
    exporting only the embedding path drops ~80 MB of unnecessary classification
    weights and avoids exporting the head's specialized ops.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger("export_miewid_v41")


# ----------------------------------------------------------------------------
# Defaults derived from miew_id.msv4_1_main.yaml
# ----------------------------------------------------------------------------

DEFAULT_CHECKPOINT = "/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.bin"
DEFAULT_CONFIG = "/mnt/c/claude-skills/models/reference/miew_id.msv4_1_main.yaml"
DEFAULT_OUTPUT_DIR = "output"

EXPECTED_EMBEDDING_DIM = 2152  # EfficientNetV2-RW-M GeM-pooled feature dim per pack spec
DEFAULT_INPUT_SIZE = (440, 440)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def sha256_of_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def load_yaml_config(path: Path) -> dict:
    import yaml
    with path.open("r") as f:
        return yaml.safe_load(f)


# ----------------------------------------------------------------------------
# Model loading
# ----------------------------------------------------------------------------

def build_model_canonical(model_params: dict):
    """Use the canonical wbia-plugin-miew-id model class. Preferred path."""
    try:
        # The wbia-plugin-miew-id repo ships a Python package usually called
        # `wbia_miew_id`. The classification module is typically `MiewIdNet`
        # under `wbia_miew_id.models`. Adjust if your install differs.
        from wbia_miew_id.models import MiewIdNet
    except ImportError as e:
        raise ImportError(
            "wbia_miew_id not installed. Install it from "
            "https://github.com/WildMeOrg/wbia-plugin-miew-id "
            "or rerun with the timm fallback (set MIEWID_FALLBACK_TIMM=1)."
        ) from e

    model = MiewIdNet(
        model_name=model_params["model_name"],
        use_fc=model_params.get("use_fc", False),
        fc_dim=model_params.get("fc_dim", 2048),
        dropout=model_params.get("dropout", 0.0),
        loss_module=model_params["loss_module"],
        s=model_params["s"],
        margin=model_params["margin"],
        ls_eps=model_params.get("ls_eps", 0.0),
        theta_zero=model_params.get("theta_zero", 0.785),
        pretrained=False,                           # we'll load weights ourselves
        n_classes=model_params["n_classes"],
        k=model_params.get("k", 1),
    )
    return model


def build_model_timm_fallback(model_params: dict):
    """Minimal timm + GeM pooling reconstruction.

    Used only if wbia_miew_id can't be imported. This may NOT be byte-identical
    to the canonical model — verify with the parity test before trusting.
    """
    import timm
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    backbone = timm.create_model(
        model_params["model_name"],
        pretrained=False,
        num_classes=0,            # drop classification head
        global_pool="",           # we'll add our own GeM
    )

    class GeM(nn.Module):
        def __init__(self, p: float = 3.0, eps: float = 1e-6):
            super().__init__()
            self.p = nn.Parameter(torch.ones(1) * p)
            self.eps = eps

        def forward(self, x):  # (N, C, H, W)
            return F.avg_pool2d(
                x.clamp(min=self.eps).pow(self.p),
                kernel_size=(x.size(-2), x.size(-1)),
            ).pow(1.0 / self.p).flatten(1)

    class MiewIdMinimal(nn.Module):
        def __init__(self, backbone, embedding_dim: int):
            super().__init__()
            self.backbone = backbone
            self.global_pool = GeM()
            self.bn = nn.BatchNorm1d(embedding_dim)

        def forward(self, x):
            features = self.backbone.forward_features(x)
            pooled = self.global_pool(features)
            return self.bn(pooled)

        # match canonical class API for EmbeddingOnly to call
        def extract_features(self, x):
            return self.forward(x)

    # Probe feature dim from a dummy forward
    backbone.eval()
    with torch.no_grad():
        feats = backbone.forward_features(torch.zeros(1, 3, *DEFAULT_INPUT_SIZE))
    embedding_dim = feats.shape[1]
    return MiewIdMinimal(backbone, embedding_dim)


def build_model(model_params: dict):
    import os
    if os.environ.get("MIEWID_FALLBACK_TIMM") == "1":
        logger.warning("MIEWID_FALLBACK_TIMM=1 — using timm fallback reconstruction.")
        return build_model_timm_fallback(model_params)
    try:
        return build_model_canonical(model_params)
    except ImportError as e:
        logger.warning("Canonical wbia_miew_id import failed (%s); using timm fallback.", e)
        return build_model_timm_fallback(model_params)


def load_checkpoint(model, checkpoint_path: Path):
    import torch
    state = torch.load(checkpoint_path, map_location="cpu")
    # Some checkpoints are dicts with 'model_state_dict'; handle both shapes.
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    elif isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    incompatible = model.load_state_dict(state, strict=False)
    missing = list(incompatible.missing_keys)
    unexpected = list(incompatible.unexpected_keys)

    # Expect ArcFace head keys to be 'unexpected' since we strip the head later.
    head_keylike = ("final.", "arcface", "loss_module", "head.")
    benign_unexpected = [k for k in unexpected if any(t in k.lower() for t in head_keylike)]
    surprising_unexpected = [k for k in unexpected if k not in benign_unexpected]

    logger.info("Loaded checkpoint: missing=%d, unexpected=%d (%d benign head keys)",
                len(missing), len(unexpected), len(benign_unexpected))
    if missing:
        logger.warning("Missing keys (first 5): %s", missing[:5])
    if surprising_unexpected:
        logger.warning("Surprising unexpected keys (first 5): %s", surprising_unexpected[:5])

    return {"missing": missing, "unexpected": unexpected,
            "benign_unexpected": benign_unexpected,
            "surprising_unexpected": surprising_unexpected}


# ----------------------------------------------------------------------------
# Embedding-only wrapper
# ----------------------------------------------------------------------------

def make_embedding_only(model):
    """Wrap the model so forward() returns ONLY the embedding, no logits."""
    import torch
    import torch.nn as nn

    class EmbeddingOnly(nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, x):
            # Try canonical extract_features first, then various fallbacks.
            for method in ("extract_features", "embedding", "forward_features"):
                fn = getattr(self.m, method, None)
                if callable(fn):
                    return fn(x)
            # Last resort: assume forward(x) returns (embedding, logits) tuple
            out = self.m(x)
            if isinstance(out, (tuple, list)) and len(out) >= 1:
                return out[0]
            return out

    wrapper = EmbeddingOnly(model)
    wrapper.eval()
    return wrapper


# ----------------------------------------------------------------------------
# ONNX export
# ----------------------------------------------------------------------------

def export_onnx(wrapper, output_path: Path, opset: int = 17,
                input_size=DEFAULT_INPUT_SIZE) -> dict:
    """Export to ONNX, then consolidate any external-data weights into a single file.

    PyTorch's dynamo exporter (default in torch>=2.10) can split large models into
    `model.onnx` (graph) + `model.onnx.data` (weights). Mobile pack format expects
    a single self-contained `.onnx`; we re-save with `save_as_external_data=False`
    after export so downstream consumers don't have to think about it.
    """
    import onnx
    import torch
    h, w = input_size
    dummy = torch.randn(1, 3, h, w)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapper,
        dummy,
        str(output_path),
        input_names=["input"],
        output_names=["embedding"],
        opset_version=opset,
        dynamic_axes={
            "input": {0: "batch"},
            "embedding": {0: "batch"},
        },
        do_constant_folding=True,
    )

    # Consolidate external data (if any) back into the .onnx file
    data_path = output_path.with_suffix(output_path.suffix + ".data")
    if data_path.exists():
        logger.info("Consolidating external weights from %s into %s", data_path, output_path)
        model = onnx.load(str(output_path))
        # save_as_external_data=False forces all initializer tensors back into the model proto
        onnx.save_model(model, str(output_path), save_as_external_data=False)
        data_path.unlink()

    return {"path": str(output_path), "opset": opset, "input_size": [h, w]}


# ----------------------------------------------------------------------------
# Parity check
# ----------------------------------------------------------------------------

@dataclasses.dataclass
class ParityResult:
    trials: int
    cosine_min: float
    cosine_mean: float
    cosine_max: float
    l2_max: float
    embedding_dim: int
    embedding_dim_matches_expected: bool
    all_pass: bool
    threshold: float


def _cosine(a: np.ndarray, b: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    """Per-row cosine similarity. a,b shape: (N, D)."""
    an = a / (np.linalg.norm(a, axis=1, keepdims=True) + eps)
    bn = b / (np.linalg.norm(b, axis=1, keepdims=True) + eps)
    return (an * bn).sum(axis=1)


def parity_check(wrapper, onnx_path: Path,
                 trials: int = 50,
                 batch: int = 4,
                 input_size=DEFAULT_INPUT_SIZE,
                 cosine_threshold: float = 0.9999,
                 seed: int = 42) -> ParityResult:
    import torch
    import onnxruntime as ort

    rng = np.random.default_rng(seed)
    h, w = input_size

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name

    cos_all: list[float] = []
    l2_all: list[float] = []
    emb_dim: Optional[int] = None

    wrapper.eval()
    with torch.no_grad():
        for _ in range(trials):
            x_np = rng.standard_normal((batch, 3, h, w), dtype=np.float32)
            x_torch = torch.from_numpy(x_np)

            torch_emb = wrapper(x_torch).cpu().numpy()
            onnx_emb = sess.run([output_name], {input_name: x_np})[0]

            if emb_dim is None:
                emb_dim = torch_emb.shape[-1]

            assert torch_emb.shape == onnx_emb.shape, (
                f"Shape mismatch: torch {torch_emb.shape} vs onnx {onnx_emb.shape}")

            cos = _cosine(torch_emb, onnx_emb)
            l2 = np.linalg.norm(torch_emb - onnx_emb, axis=1)
            cos_all.extend(cos.tolist())
            l2_all.extend(l2.tolist())

    return ParityResult(
        trials=trials * batch,
        cosine_min=float(min(cos_all)),
        cosine_mean=float(sum(cos_all) / len(cos_all)),
        cosine_max=float(max(cos_all)),
        l2_max=float(max(l2_all)),
        embedding_dim=emb_dim or -1,
        embedding_dim_matches_expected=(emb_dim == EXPECTED_EMBEDDING_DIM),
        all_pass=min(cos_all) >= cosine_threshold,
        threshold=cosine_threshold,
    )


# ----------------------------------------------------------------------------
# FP16 conversion
# ----------------------------------------------------------------------------

def convert_fp16(fp32_path: Path, fp16_path: Path) -> None:
    import onnx
    from onnxconverter_common import float16
    model = onnx.load(str(fp32_path))
    fp16_model = float16.convert_float_to_float16(model, keep_io_types=True)
    onnx.save(fp16_model, str(fp16_path))


def parity_check_fp16(wrapper, fp16_path: Path,
                      trials: int = 25,
                      batch: int = 4,
                      input_size=DEFAULT_INPUT_SIZE,
                      cosine_threshold: float = 0.999,
                      seed: int = 43) -> ParityResult:
    """FP16 has slightly looser parity (1e-3 vs 1e-4)."""
    return parity_check(
        wrapper, fp16_path,
        trials=trials, batch=batch, input_size=input_size,
        cosine_threshold=cosine_threshold, seed=seed,
    )


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT,
                   help="Path to miew_id.msv4_1_main.bin")
    p.add_argument("--config", default=DEFAULT_CONFIG,
                   help="Path to miew_id.msv4_1_main.yaml")
    p.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR,
                   help="Where to write ONNX + manifest")
    p.add_argument("--opset", type=int, default=17,
                   help="ONNX opset version (>= 11 required for ORT Mobile)")
    p.add_argument("--input-size", type=int, nargs=2, default=list(DEFAULT_INPUT_SIZE),
                   metavar=("H", "W"))
    p.add_argument("--fp16", action="store_true",
                   help="Also produce FP16 ONNX (recommended for mobile)")
    p.add_argument("--parity-trials", type=int, default=50,
                   help="Number of random batches for FP32 parity check")
    p.add_argument("--validate-only", action="store_true",
                   help="Skip export; run parity check on an existing ONNX")
    p.add_argument("--onnx", default=None,
                   help="(--validate-only) Path to existing ONNX to verify")
    p.add_argument("--log-level", default="INFO")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    checkpoint = Path(args.checkpoint)
    config_path = Path(args.config)
    output_dir = Path(args.output_dir)

    if not checkpoint.is_file():
        logger.error("Checkpoint not found: %s", checkpoint)
        return 2
    if not config_path.is_file():
        logger.error("Config not found: %s", config_path)
        return 2

    cfg = load_yaml_config(config_path)
    model_params = cfg["model_params"]
    logger.info("Loaded config: model=%s n_classes=%d use_fc=%s",
                model_params["model_name"],
                model_params["n_classes"],
                model_params.get("use_fc", False))

    logger.info("Building model...")
    model = build_model(model_params)

    logger.info("Loading checkpoint %s", checkpoint)
    load_report = load_checkpoint(model, checkpoint)

    wrapper = make_embedding_only(model)

    # Validate-only short-circuit
    if args.validate_only:
        if not args.onnx:
            logger.error("--validate-only requires --onnx PATH")
            return 2
        onnx_path = Path(args.onnx)
        logger.info("Running parity check on %s", onnx_path)
        result = parity_check(wrapper, onnx_path,
                              trials=args.parity_trials,
                              input_size=tuple(args.input_size))
        print(json.dumps(dataclasses.asdict(result), indent=2))
        return 0 if result.all_pass else 1

    # Export
    fp32_path = output_dir / "miewid_v4_1_fp32.onnx"
    logger.info("Exporting FP32 ONNX → %s (opset=%d, input=%s)",
                fp32_path, args.opset, args.input_size)
    export_info = export_onnx(wrapper, fp32_path,
                              opset=args.opset,
                              input_size=tuple(args.input_size))

    logger.info("Running FP32 parity check (%d trials)...", args.parity_trials)
    fp32_parity = parity_check(wrapper, fp32_path,
                               trials=args.parity_trials,
                               input_size=tuple(args.input_size))
    logger.info("FP32 parity: cos_min=%.6f cos_mean=%.6f l2_max=%.4e dim=%d pass=%s",
                fp32_parity.cosine_min, fp32_parity.cosine_mean,
                fp32_parity.l2_max, fp32_parity.embedding_dim,
                fp32_parity.all_pass)
    if not fp32_parity.all_pass:
        logger.error("FP32 parity FAILED (cosine_min=%.6f < threshold=%.4f). "
                     "Check that the model class matches the checkpoint and that "
                     "EmbeddingOnly is calling the right inference path.",
                     fp32_parity.cosine_min, fp32_parity.threshold)
        return 3
    if not fp32_parity.embedding_dim_matches_expected:
        logger.warning("Embedding dim is %d, expected %d (per pack spec). "
                       "If you change embedding_dim, update EmbeddingPackManifest.",
                       fp32_parity.embedding_dim, EXPECTED_EMBEDDING_DIM)

    # Optional FP16
    fp16_path: Optional[Path] = None
    fp16_parity: Optional[ParityResult] = None
    if args.fp16:
        fp16_path = output_dir / "miewid_v4_1_fp16.onnx"
        logger.info("Converting to FP16 → %s", fp16_path)
        convert_fp16(fp32_path, fp16_path)
        logger.info("Running FP16 parity check (looser threshold 0.999)...")
        fp16_parity = parity_check_fp16(wrapper, fp16_path,
                                        input_size=tuple(args.input_size))
        logger.info("FP16 parity: cos_min=%.6f cos_mean=%.6f l2_max=%.4e pass=%s",
                    fp16_parity.cosine_min, fp16_parity.cosine_mean,
                    fp16_parity.l2_max, fp16_parity.all_pass)
        if not fp16_parity.all_pass:
            logger.warning("FP16 parity below threshold — embeddings may diverge "
                           "from PyTorch reference. Consider sticking with FP32.")

    # Manifest
    manifest = {
        "schema_version": "1",
        "exported_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "source": {
            "checkpoint": str(checkpoint),
            "checkpoint_sha256": sha256_of_file(checkpoint),
            "config": str(config_path),
            "model_name": model_params["model_name"],
            "n_classes": model_params["n_classes"],
            "loss_module": model_params["loss_module"],
            "use_fc": model_params.get("use_fc", False),
        },
        "load_report": {
            "missing_keys": len(load_report["missing"]),
            "unexpected_keys": len(load_report["unexpected"]),
            "benign_head_keys": len(load_report["benign_unexpected"]),
            "surprising_unexpected_keys": load_report["surprising_unexpected"][:10],
        },
        "export": {
            "opset": args.opset,
            "input_size": list(args.input_size),
            "fp32": {
                "path": str(fp32_path),
                "sha256": sha256_of_file(fp32_path),
                "size_bytes": fp32_path.stat().st_size,
                "parity": dataclasses.asdict(fp32_parity),
            },
        },
    }
    if fp16_path is not None:
        manifest["export"]["fp16"] = {
            "path": str(fp16_path),
            "sha256": sha256_of_file(fp16_path),
            "size_bytes": fp16_path.stat().st_size,
            "parity": dataclasses.asdict(fp16_parity),
        }

    manifest_path = output_dir / "miewid_v4_1_export_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info("Wrote manifest: %s", manifest_path)

    # Summary
    print()
    print("=" * 72)
    print("Export complete.")
    print(f"  FP32: {fp32_path}  ({fp32_path.stat().st_size / 1e6:.1f} MB)")
    if fp16_path is not None:
        print(f"  FP16: {fp16_path}  ({fp16_path.stat().st_size / 1e6:.1f} MB)")
    print(f"  Manifest: {manifest_path}")
    print(f"  FP32 parity: cosine_min={fp32_parity.cosine_min:.6f} (>= {fp32_parity.threshold})")
    if fp16_parity is not None:
        print(f"  FP16 parity: cosine_min={fp16_parity.cosine_min:.6f} (>= {fp16_parity.threshold})")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
