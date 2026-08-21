# Pack Bundler + Synthetic Horse Pack

**Date:** 2026-04-25
**Tool:** `kb/wildlife-reid-mobile/tools/build_pack.py`
**Output:** `tools/output/horse-synthetic-2026-04-25.zip` (9.2 MB)

## Tool: `build_pack.py`

Two-mode CLI for assembling spec-compliant `.zip` packs per `docs/EMBEDDING_PACK_FORMAT.md`.

### `synthetic` mode (working today)

Random unit-norm 2152-d vectors with controlled per-individual noise (σ=0.0015 → within-individual cos ≈ 0.995, cross-individual cos ≈ ±0.02). Reference photos are HSV-spread colored squares so each individual is visually distinct in review UI. Real detector ONNX is bundled (the WHORSE one). Useful for:
- Mobile pipeline plumbing tests (file loading, byte layout, manifest parsing)
- Match-review UI dev (real-looking ranked candidates)
- Cross-platform parity tests once on-device

### `from-coco` mode (skeleton)

Stub for now — designed to ingest a Wildbook horses COCO export, batch-infer MiewID v4.1 over each annotation's bbox crop, and produce a real pack. Implementation deferred to when we have the Washington-horses COCO in hand.

## Pack: `horse-synthetic-2026-04-25.zip`

**Layout** (validated against `docs/EMBEDDING_PACK_FORMAT.md`):

```
horse-synthetic-2026-04-25.zip (9.2 MB)
├── manifest.json
├── config/detector.json
├── models/horse_wild_face_yolo11n_416.onnx  (10.5 MB)
├── embeddings/
│   ├── index.json          (5 individuals × 2 embeddings each)
│   └── embeddings.bin      (10 × 2152 × 4 = 86 KB)
└── reference_photos/SYN-{0001..0005}/ref_{01..03}.jpg  (15 colored squares)
```

**Manifest highlights:**
- `formatVersion: "1.0"` ✓
- `species: "horse"`, `featureClass: "horse_wild+face"` ✓
- `embeddingDim: 2152` ✓
- `embeddingModel.{name, version, inputSize, normalize}` populated for v4.1 ✓
- `detectorModel.{filename, configFile}` ✓
- SHA-256 checksums for `embeddings.bin` and the detector ✓

**Self-validation passes:**
- All required files present
- `embeddings.bin` size === `embeddingCount × embeddingDim × 4` (87,040 B)
- Per-individual offsets cumulate cleanly (0, 2, 4, 6, 8)
- Reference photos in `index.json` resolve to real files

**Consumer-side parity** (Python sim of mobile load):
- Within-individual cosine: 0.9950–0.9953 (target ~0.995) ✓
- Cross-individual cosine: ±0.007 to ±0.026 (target ~0) ✓

## What this unlocks

This is the **bridge artifact** between Stage 1 and Stage 2:

- For **Stage 2 development** — an end-to-end pack that satisfies the spec, so we can build/test mobile-side validators and loaders against something concrete instead of mocks.
- For **vertical-slice on-device test (step A)** — sideload this pack + the FP16 MiewID ONNX onto iPhone 13 / Pixel 8 and validate that the existing pipeline (post-PR-#11 fix) loads everything and produces sensible embeddings + match candidates against real test photos.
- For **cross-platform parity** — feeding a fixed test photo through both devices' pipelines should yield embeddings cosine ≥ 0.999 against each other and against a Python reference.

## Reproduce

```bash
cd /mnt/c/off-grid-mobile/kb/wildlife-reid-mobile/tools
python3 build_pack.py synthetic \
  --species horse \
  --feature-class horse_wild+face \
  --display-name "Synthetic Horses (Dev)" \
  --detector /mnt/c/claude-skills/output/whorse-face-detector/horse_wild_face_yolo11n_416.onnx \
  --detector-config /mnt/c/claude-skills/output/whorse-face-detector/detector_config.json \
  --num-individuals 5 \
  --photos-per-individual 3 \
  --embeddings-per-individual 2 \
  --output-dir output/
```

Runtime ~3 seconds. Output goes to `output/horse-synthetic-2026-04-25/` (kept) and `output/horse-synthetic-2026-04-25.zip`.

## Followups

- **Implement `from-coco` mode** when we have a Washington-horses COCO. Needs MiewID inference loop + crop preprocessing matching the mobile pipeline. ~half day.
- **Add a `validate-zip` mode** to `build_pack.py` that takes a `.zip` and runs the same self-validation a Stage-2 pack-validator would. Useful for CI gates on real pack exports.
