#!/usr/bin/env python3
"""
Build a wildlife re-ID embedding pack conforming to
docs/EMBEDDING_PACK_FORMAT.md.

Two modes:

  synthetic    — Random 2152-d unit-norm vectors + colored-square reference
                 photos + made-up individual IDs. For development / on-device
                 plumbing tests; the detector still works against real photos
                 but the embeddings won't actually match anything sensible.

  from-coco    — Real pack assembled from a COCO export (e.g. horses.wildbook.org).
                 Batch-infers MiewID over each annotation's bbox crop to populate
                 embeddings.bin; copies reference photos from the source images.

Pack layout produced (per EMBEDDING_PACK_FORMAT.md §File Structure):

    {species}-{context}-{YYYY-MM-DD}.zip
    ├── manifest.json              # EmbeddingPackManifest
    ├── models/
    │   └── {detector-filename}.onnx
    ├── config/
    │   └── detector.json          # DetectorConfig
    ├── embeddings/
    │   ├── index.json             # PackIndividual[]
    │   └── embeddings.bin         # Flat float32 LE, NCHW(?) — flat per spec
    └── reference_photos/{individual-id}/ref_NN.jpg

Important: MiewID is **NOT** bundled in the pack (per spec) — it's a shared
model the app downloads separately. We reference its version + repo in the
manifest so the app can version-gate.

Usage examples:

    # Synthetic mini-pack for on-device dev/testing
    python build_pack.py synthetic \\
        --species horse \\
        --feature-class horse_wild+face \\
        --display-name "Synthetic Horses (Dev)" \\
        --detector /mnt/c/claude-skills/output/whorse-face-detector/horse_wild_face_yolo11n_416.onnx \\
        --detector-config /mnt/c/claude-skills/output/whorse-face-detector/detector_config.json \\
        --miewid-version 4.1.0 \\
        --num-individuals 5 \\
        --photos-per-individual 3 \\
        --embeddings-per-individual 2 \\
        --output-dir output/

    # Real pack from a COCO + MiewID inference
    python build_pack.py from-coco \\
        --species horse \\
        --feature-class horse_wild+face \\
        --display-name "Washington Wild Horses 2026-04" \\
        --wildbook-url https://horses.wildbook.org \\
        --coco /path/to/washington_horses_coco.json \\
        --images-dir /path/to/images \\
        --detector /mnt/c/claude-skills/output/whorse-face-detector/horse_wild_face_yolo11n_416.onnx \\
        --detector-config /mnt/c/claude-skills/output/whorse-face-detector/detector_config.json \\
        --miewid /mnt/c/off-grid-mobile/kb/wildlife-reid-mobile/tools/output/miewid_v4_1_fp16.onnx \\
        --miewid-version 4.1.0 \\
        --output-dir output/

Requirements:
    pip install pillow numpy onnx
    # Plus, for `from-coco` mode:
    pip install onnxruntime
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import logging
import shutil
import struct
import sys
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger("build_pack")

PACK_FORMAT_VERSION = "1.0"
DEFAULT_EMBEDDING_DIM = 2152

# ImageNet normalize defaults — must match what the mobile app expects.
DEFAULT_IMAGENET_MEAN = [0.485, 0.456, 0.406]
DEFAULT_IMAGENET_STD = [0.229, 0.224, 0.225]
DEFAULT_MIEWID_INPUT = [440, 440]


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def sha256_of_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def write_jpeg_square(path: Path, color: tuple[int, int, int], size: int = 256):
    """Write a solid-color JPEG. Used as a synthetic reference photo."""
    from PIL import Image
    img = Image.new("RGB", (size, size), color)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(path), format="JPEG", quality=85)


# ----------------------------------------------------------------------------
# Pack data model (matches src/types/wildlife.ts)
# ----------------------------------------------------------------------------

def make_individual_record(
    individual_id: str,
    name: Optional[str],
    embedding_offset: int,
    embedding_count: int,
    reference_photos: list[str],
    sex: Optional[str] = None,
    life_stage: Optional[str] = None,
    encounter_count: Optional[int] = None,
) -> dict:
    return {
        "id": individual_id,
        "name": name,
        "alternateId": None,
        "sex": sex,
        "lifeStage": life_stage,
        "firstSeen": None,
        "lastSeen": None,
        "encounterCount": encounter_count if encounter_count is not None else embedding_count,
        "embeddingCount": embedding_count,
        "embeddingOffset": embedding_offset,
        "referencePhotos": reference_photos,
        "notes": None,
    }


def make_manifest(
    *,
    species: str,
    feature_class: str,
    display_name: str,
    description: Optional[str],
    wildbook_url: str,
    individual_count: int,
    embedding_count: int,
    embedding_dim: int,
    miewid_name: str,
    miewid_version: str,
    miewid_hf_repo: Optional[str],
    miewid_input_size: list,
    miewid_normalize: dict,
    detector_filename: str,
    detector_config_relpath: str,
    checksums: dict,
    exported_by: Optional[str] = None,
    search_query: Optional[str] = None,
) -> dict:
    return {
        "formatVersion": PACK_FORMAT_VERSION,
        "species": species,
        "featureClass": feature_class,
        "displayName": display_name,
        "description": description,
        "wildbookInstanceUrl": wildbook_url,
        "exportDate": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "exportedBy": exported_by,
        "searchQuery": search_query,
        "individualCount": individual_count,
        "embeddingCount": embedding_count,
        "embeddingDim": embedding_dim,
        "embeddingModel": {
            "name": miewid_name,
            "version": miewid_version,
            "huggingFaceRepo": miewid_hf_repo,
            "inputSize": miewid_input_size,
            "normalize": miewid_normalize,
        },
        "detectorModel": {
            "filename": detector_filename,
            "configFile": detector_config_relpath,
        },
        "checksums": checksums,
    }


# ----------------------------------------------------------------------------
# Pack assembly
# ----------------------------------------------------------------------------

def write_embeddings_bin(path: Path, embeddings: np.ndarray) -> None:
    """Flat float32 little-endian NCHW(N×D) layout per spec."""
    assert embeddings.dtype == np.float32
    assert embeddings.ndim == 2
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        # numpy tofile uses native byte order on most platforms; force little-endian.
        f.write(embeddings.astype("<f4").tobytes())


def assemble_pack_dir(
    *,
    pack_dir: Path,
    detector_path: Path,
    detector_config: dict,
    embeddings: np.ndarray,
    individuals: list[dict],
    reference_photos: dict[str, list[Path]],
    manifest_partial_kwargs: dict,
):
    pack_dir.mkdir(parents=True, exist_ok=True)
    (pack_dir / "models").mkdir(exist_ok=True)
    (pack_dir / "config").mkdir(exist_ok=True)
    (pack_dir / "embeddings").mkdir(exist_ok=True)
    (pack_dir / "reference_photos").mkdir(exist_ok=True)

    # Detector model + config
    detector_dest = pack_dir / "models" / detector_path.name
    shutil.copy2(detector_path, detector_dest)
    with (pack_dir / "config" / "detector.json").open("w") as f:
        json.dump(detector_config, f, indent=2)

    # Embeddings.bin + index.json
    write_embeddings_bin(pack_dir / "embeddings" / "embeddings.bin", embeddings)
    with (pack_dir / "embeddings" / "index.json").open("w") as f:
        json.dump(individuals, f, indent=2)

    # Reference photos
    for individual_id, photos in reference_photos.items():
        target = pack_dir / "reference_photos" / individual_id
        target.mkdir(parents=True, exist_ok=True)
        for src in photos:
            shutil.copy2(src, target / src.name)

    # Compute checksums
    checksums = {
        "embeddings.bin": "sha256:" + sha256_of_file(pack_dir / "embeddings" / "embeddings.bin"),
        detector_path.name: "sha256:" + sha256_of_file(detector_dest),
    }

    # Manifest
    manifest = make_manifest(
        embedding_dim=embeddings.shape[1],
        embedding_count=embeddings.shape[0],
        individual_count=len(individuals),
        detector_filename=detector_path.name,
        detector_config_relpath="config/detector.json",
        checksums=checksums,
        **manifest_partial_kwargs,
    )
    with (pack_dir / "manifest.json").open("w") as f:
        json.dump(manifest, f, indent=2)
    return manifest


def zip_pack(pack_dir: Path, zip_path: Path):
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(pack_dir.rglob("*")):
            if path.is_file():
                arc = path.relative_to(pack_dir).as_posix()
                zf.write(path, arc)


def validate_pack(pack_dir: Path) -> list[str]:
    """Self-check before zipping. Returns list of validation errors (empty = OK)."""
    errors: list[str] = []
    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.exists():
        errors.append("manifest.json missing")
        return errors

    manifest = json.loads(manifest_path.read_text())

    # Required files
    required = [
        "manifest.json",
        f"models/{manifest['detectorModel']['filename']}",
        manifest["detectorModel"]["configFile"],
        "embeddings/index.json",
        "embeddings/embeddings.bin",
    ]
    for rel in required:
        if not (pack_dir / rel).exists():
            errors.append(f"missing required file: {rel}")

    # embeddings.bin size matches embeddingCount * embeddingDim * 4
    bin_path = pack_dir / "embeddings" / "embeddings.bin"
    if bin_path.exists():
        expected = manifest["embeddingCount"] * manifest["embeddingDim"] * 4
        actual = bin_path.stat().st_size
        if expected != actual:
            errors.append(f"embeddings.bin size {actual} != expected {expected} "
                          f"({manifest['embeddingCount']} × {manifest['embeddingDim']} × 4)")

    # index.json offsets in bounds
    index_path = pack_dir / "embeddings" / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text())
        if len(index) != manifest["individualCount"]:
            errors.append(f"index has {len(index)} entries, manifest says {manifest['individualCount']}")
        total_emb = 0
        for i, ind in enumerate(index):
            if ind["embeddingOffset"] != total_emb:
                errors.append(f"individual[{i}] {ind['id']}: offset {ind['embeddingOffset']} "
                              f"!= cumulative {total_emb}")
            total_emb += ind["embeddingCount"]
        if total_emb != manifest["embeddingCount"]:
            errors.append(f"sum of individual embeddingCount ({total_emb}) "
                          f"!= manifest embeddingCount ({manifest['embeddingCount']})")

    # Reference photos in index point to files that exist
    if index_path.exists():
        for ind in json.loads(index_path.read_text()):
            for photo_name in ind["referencePhotos"]:
                p = pack_dir / "reference_photos" / ind["id"] / photo_name
                if not p.exists():
                    errors.append(f"reference photo missing: {p}")

    return errors


# ----------------------------------------------------------------------------
# Synthetic mode
# ----------------------------------------------------------------------------

def build_synthetic(args):
    output_dir = Path(args.output_dir)
    pack_id = f"{args.species}-{args.synthetic_label}-{dt.date.today().isoformat()}"
    pack_dir = output_dir / pack_id
    if pack_dir.exists():
        logger.info("Removing existing %s", pack_dir)
        shutil.rmtree(pack_dir)

    rng = np.random.default_rng(args.seed)

    # Make individuals + per-individual unit-norm embeddings + colored-square photos
    individuals = []
    all_embeddings: list[np.ndarray] = []
    reference_photos: dict[str, list[Path]] = {}
    photo_staging = output_dir / f"_synthetic_photos_{pack_id}"
    if photo_staging.exists():
        shutil.rmtree(photo_staging)
    photo_staging.mkdir(parents=True)

    offset = 0
    for i in range(args.num_individuals):
        individual_id = f"SYN-{i+1:04d}"
        # Center direction per individual; per-embedding noise
        center = rng.standard_normal(args.embedding_dim).astype(np.float32)
        center /= (np.linalg.norm(center) + 1e-8)
        # Per-dim noise scale: cos(center+n, center+n') ≈ 1 - σ²·d when both
        # are L2-normalized. For d=2152 and target cos ≈ 0.995, σ ≈ 0.0015.
        # Keep noise small relative to the curse-of-dimensionality effect.
        sigma = 0.0015
        embeddings = []
        for _ in range(args.embeddings_per_individual):
            v = center + sigma * rng.standard_normal(args.embedding_dim).astype(np.float32)
            v /= (np.linalg.norm(v) + 1e-8)
            embeddings.append(v)
        emb_arr = np.stack(embeddings, axis=0)
        all_embeddings.append(emb_arr)

        # Reference photos: one solid-color JPEG per photo
        photo_paths = []
        # Hue spread across individuals so each gets a distinct color
        hue = (i / max(args.num_individuals, 1)) * 360
        for j in range(args.photos_per_individual):
            # Vary brightness slightly per photo
            brightness = 0.7 + 0.2 * (j / max(args.photos_per_individual, 1))
            color = _hsv_to_rgb(hue, 0.7, brightness)
            p = photo_staging / individual_id / f"ref_{j+1:02d}.jpg"
            write_jpeg_square(p, color)
            photo_paths.append(p)

        individuals.append(make_individual_record(
            individual_id=individual_id,
            name=f"Synthetic {i+1}",
            embedding_offset=offset,
            embedding_count=args.embeddings_per_individual,
            reference_photos=[p.name for p in photo_paths],
            sex=("male" if i % 2 == 0 else "female"),
            life_stage="adult",
        ))
        reference_photos[individual_id] = photo_paths
        offset += args.embeddings_per_individual

    embeddings_concat = np.concatenate(all_embeddings, axis=0).astype(np.float32)

    # Detector + config (real, not synthetic)
    detector_path = Path(args.detector)
    detector_config = json.loads(Path(args.detector_config).read_text())

    # Embedding model normalize info — synthesized but spec-shaped
    miewid_normalize = {
        "mean": DEFAULT_IMAGENET_MEAN,
        "std": DEFAULT_IMAGENET_STD,
    }

    manifest_kwargs = dict(
        species=args.species,
        feature_class=args.feature_class,
        display_name=args.display_name,
        description=f"Synthetic development pack — {args.num_individuals} individuals × "
                    f"{args.embeddings_per_individual} embeddings (random unit vectors). "
                    "Detector is real; embeddings are NOT — do not use for actual matching.",
        wildbook_url=args.wildbook_url,
        miewid_name=args.miewid_name,
        miewid_version=args.miewid_version,
        miewid_hf_repo=args.miewid_hf_repo,
        miewid_input_size=DEFAULT_MIEWID_INPUT,
        miewid_normalize=miewid_normalize,
        exported_by="build_pack.py (synthetic)",
        search_query=None,
    )

    manifest = assemble_pack_dir(
        pack_dir=pack_dir,
        detector_path=detector_path,
        detector_config=detector_config,
        embeddings=embeddings_concat,
        individuals=individuals,
        reference_photos=reference_photos,
        manifest_partial_kwargs=manifest_kwargs,
    )

    errors = validate_pack(pack_dir)
    if errors:
        logger.error("Validation errors:")
        for e in errors:
            logger.error("  - %s", e)
        return 4
    logger.info("Pack validated OK.")

    # Zip
    zip_path = output_dir / f"{pack_id}.zip"
    if zip_path.exists():
        zip_path.unlink()
    zip_pack(pack_dir, zip_path)
    logger.info("Wrote %s (%.1f MB)", zip_path, zip_path.stat().st_size / 1e6)

    # Cleanup staging
    if photo_staging.exists():
        shutil.rmtree(photo_staging)

    print()
    print("=" * 72)
    print(f"Synthetic pack ready: {zip_path}")
    print(f"  Individuals: {manifest['individualCount']}")
    print(f"  Embeddings: {manifest['embeddingCount']} × {manifest['embeddingDim']}")
    print(f"  Detector: {detector_path.name} ({detector_path.stat().st_size / 1e6:.1f} MB)")
    print(f"  Pack dir (kept): {pack_dir}")
    print("=" * 72)
    return 0


def _hsv_to_rgb(h, s, v) -> tuple[int, int, int]:
    """Tiny self-contained HSV→RGB so we don't need colorsys with nice clamping."""
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


# ----------------------------------------------------------------------------
# from-coco mode (skeleton — full impl in next iteration)
# ----------------------------------------------------------------------------

def build_from_coco(args):
    """Real-data pack from a COCO export. Stub for now — needs Wildbook COCO + crop pipeline."""
    raise NotImplementedError(
        "from-coco mode is the next iteration. The script structure supports it; "
        "we still need: (1) a COCO JSON spec'd to horses.wildbook.org export shape, "
        "(2) a crop+preprocess loop matching mobile's preprocessing, "
        "(3) MiewID ONNX inference loop. Do this once we have a real Washington-horses COCO."
    )


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def add_common_args(p: argparse.ArgumentParser):
    p.add_argument("--species", required=True, help="e.g. horse")
    p.add_argument("--feature-class", required=True, help="e.g. horse_wild+face")
    p.add_argument("--display-name", required=True)
    p.add_argument("--description", default=None)
    p.add_argument("--wildbook-url", default="https://horses.wildbook.org")
    p.add_argument("--detector", required=True, help="Path to detector .onnx")
    p.add_argument("--detector-config", required=True, help="Path to detector.json")
    p.add_argument("--miewid-name", default="miewid-v4")
    p.add_argument("--miewid-version", default="4.1.0")
    p.add_argument("--miewid-hf-repo", default="conservationxlabs/miewid-msv4")
    p.add_argument("--embedding-dim", type=int, default=DEFAULT_EMBEDDING_DIM)
    p.add_argument("--output-dir", default="output")
    p.add_argument("--log-level", default="INFO")


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="mode", required=True)

    syn = sub.add_parser("synthetic", help="Build a synthetic dev pack with random embeddings")
    add_common_args(syn)
    syn.add_argument("--synthetic-label", default="synthetic",
                     help="Tag in the pack id, e.g. 'synthetic' or 'dev'")
    syn.add_argument("--num-individuals", type=int, default=5)
    syn.add_argument("--embeddings-per-individual", type=int, default=2)
    syn.add_argument("--photos-per-individual", type=int, default=2)
    syn.add_argument("--seed", type=int, default=42)

    coco = sub.add_parser("from-coco", help="Build a real pack from a COCO export")
    add_common_args(coco)
    coco.add_argument("--coco", required=True)
    coco.add_argument("--images-dir", required=True)
    coco.add_argument("--miewid", required=True, help="Path to MiewID ONNX (FP16 recommended)")
    coco.add_argument("--max-photos-per-individual", type=int, default=3)

    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    if args.mode == "synthetic":
        return build_synthetic(args)
    elif args.mode == "from-coco":
        return build_from_coco(args)
    else:
        return 2


if __name__ == "__main__":
    sys.exit(main())
