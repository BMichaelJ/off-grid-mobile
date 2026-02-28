# Embedding Pack Format Specification

**Version:** 1.0
**Date:** 2026-02-25
**Purpose:** Defines the file format for embedding packs exported from Wildbook and consumed by the Wildbook Mobile app for offline individual animal re-identification.

---

## Overview

An **embedding pack** is a self-contained zip archive that enables offline re-identification of individual animals for a single species and feature class (e.g., "horse faces", "whale shark left flank"). It contains:

1. A species-specific **detector model** (ONNX format) for locating animals in photos
2. Pre-computed **MiewID embedding vectors** for all known individuals
3. **Reference photographs** for visual comparison during match review
4. **Metadata** mapping embeddings to individual identities
5. **Configuration** for the detector's preprocessing pipeline

The pack is exported from Wildbook via an Encounter Search export action. A researcher runs a search (e.g., "all horse encounters at Ranch Alpha"), then exports the results as an embedding pack. The Wildbook exporter:

1. Queries all Encounters matching the search criteria
2. Groups them by Individual (Marked Individual)
3. Runs MiewID on each Encounter's annotation to extract embeddings (or retrieves cached embeddings)
4. Collects representative reference photos per individual
5. Bundles the species-appropriate detector model
6. Packages everything into the zip format described below

---

## File Structure

```
{species}-{context}-{date}.zip
├── manifest.json
├── models/
│   └── {detector-filename}.onnx
├── embeddings/
│   ├── index.json
│   └── embeddings.bin
├── reference_photos/
│   ├── {individual-id-1}/
│   │   ├── ref_01.jpg
│   │   ├── ref_02.jpg
│   │   └── ref_03.jpg
│   ├── {individual-id-2}/
│   │   └── ref_01.jpg
│   └── ...
└── config/
    └── detector.json
```

### Naming Convention

The zip filename follows the pattern: `{species}-{context}-{YYYY-MM}.zip`

Examples:
- `horse-ranch-alpha-2026-03.zip`
- `whale-shark-mozambique-2026-01.zip`
- `giraffe-serengeti-north-2026-06.zip`

The filename is informational only. The canonical species and context are in `manifest.json`.

---

## manifest.json

The top-level manifest describes the pack contents and provenance.

```json
{
  "formatVersion": "1.0",
  "species": "horse",
  "featureClass": "horse+face",
  "displayName": "Ranch Alpha Horses",
  "description": "127 identified horses from Ranch Alpha, exported March 2026",
  "wildbookInstanceUrl": "https://horses.wildbook.org",
  "wildbookVersion": "9.x.x",
  "exportDate": "2026-03-15T14:30:00Z",
  "exportedBy": "researcher@example.com",
  "searchQuery": "locationId=ranch-alpha AND species=horse",
  "individualCount": 127,
  "embeddingCount": 635,
  "embeddingDim": 2152,
  "embeddingModel": {
    "name": "miewid-v4",
    "version": "4.0.0",
    "huggingFaceRepo": "conservationxlabs/miewid-msv4",
    "inputSize": [440, 440],
    "normalize": {
      "mean": [0.485, 0.456, 0.406],
      "std": [0.229, 0.224, 0.225]
    }
  },
  "detectorModel": {
    "filename": "horse-face-yolo11n.onnx",
    "configFile": "config/detector.json"
  },
  "checksums": {
    "embeddings.bin": "sha256:abc123...",
    "horse-face-yolo11n.onnx": "sha256:def456..."
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `formatVersion` | string | Yes | Pack format version. Currently `"1.0"`. The mobile app uses this to determine compatibility. |
| `species` | string | Yes | Species common name, lowercase. Must match Wildbook's species taxonomy key. |
| `featureClass` | string | Yes | The annotation feature class in Wildbook's IA pipeline (e.g., `"horse+face"`, `"whale_shark+left"`, `"giraffe+flank"`). This determines which detector model to use and which body region the embeddings represent. Follows Wildbook's `{species}+{viewpoint}` convention. |
| `displayName` | string | Yes | Human-readable name shown in the mobile app's pack selector. |
| `description` | string | No | Optional description shown in pack details. |
| `wildbookInstanceUrl` | string | Yes | Base URL of the Wildbook instance this pack was exported from. Used for sync (uploading new Encounters back to this instance). |
| `wildbookVersion` | string | No | Version of the Wildbook instance at export time. Informational. |
| `exportDate` | string (ISO 8601) | Yes | When this pack was exported. Used for freshness checks and update prompts. |
| `exportedBy` | string | No | Email or username of the researcher who exported the pack. |
| `searchQuery` | string | No | The Encounter Search query that produced this pack. Informational, helps researchers understand scope. |
| `individualCount` | integer | Yes | Number of distinct individuals in the pack. |
| `embeddingCount` | integer | Yes | Total number of embedding vectors in `embeddings.bin`. This is >= `individualCount` because each individual may have multiple embeddings from different Encounters/photos. |
| `embeddingDim` | integer | Yes | Dimensionality of each embedding vector. MiewID v4 produces 2152-dimensional vectors. |
| `embeddingModel` | object | Yes | Describes the embedding model used. See sub-fields below. |
| `embeddingModel.name` | string | Yes | Model identifier (e.g., `"miewid-v4"`). |
| `embeddingModel.version` | string | Yes | Exact model version. The mobile app warns if its loaded MiewID version doesn't match. |
| `embeddingModel.huggingFaceRepo` | string | No | HuggingFace repository for the model. Used by the mobile app to download MiewID if not already present. |
| `embeddingModel.inputSize` | [int, int] | Yes | Expected input dimensions [height, width] in pixels. MiewID expects [440, 440]. |
| `embeddingModel.normalize` | object | Yes | ImageNet normalization parameters. `mean` and `std` are arrays of 3 floats (RGB channels). |
| `detectorModel` | object | Yes | Describes the bundled detector model. See sub-fields below. |
| `detectorModel.filename` | string | Yes | Filename of the ONNX detector model in the `models/` directory. |
| `detectorModel.configFile` | string | Yes | Relative path to the detector configuration file. |
| `checksums` | object | No | SHA-256 checksums for critical files. Keys are filenames, values are `"sha256:{hex}"`. The mobile app verifies these after download to detect corruption. |

---

## models/ Directory

Contains the species-specific detector model in ONNX format.

### Detector Model Requirements

- **Format:** ONNX (Open Neural Network Exchange)
- **Compatibility:** Must be compatible with ONNX Runtime 1.x (opset version 11+)
- **Quantization:** FP16 recommended for mobile. INT8 acceptable if accuracy is validated.
- **Typical size:** 5-30 MB depending on architecture

The detector model is specific to a species and feature class. For example:
- `horse-face-yolo11n.onnx` — detects horse faces
- `whale-shark-yolov8s.onnx` — detects whale sharks (full body)
- `giraffe-flank-efficientdet.onnx` — detects giraffe flanks

**Important:** MiewID (the embedding model) is NOT included in the pack. It is a shared model downloaded separately by the mobile app, since the same MiewID model works across all species. The pack only references which MiewID version its embeddings were generated with (in `manifest.json`).

---

## config/detector.json

Describes how to preprocess images and interpret outputs for the bundled detector model. This makes the mobile app's inference pipeline model-agnostic.

```json
{
  "modelFile": "horse-face-yolo11n.onnx",
  "architecture": "yolo11",
  "inputSize": [640, 640],
  "inputChannels": 3,
  "channelOrder": "RGB",
  "normalize": {
    "mean": [0.0, 0.0, 0.0],
    "std": [1.0, 1.0, 1.0],
    "scale": 0.00392156862
  },
  "confidenceThreshold": 0.5,
  "nmsThreshold": 0.45,
  "maxDetections": 20,
  "outputFormat": "yolo",
  "classLabels": ["horse_face"],
  "outputSpec": {
    "boxFormat": "xyxy",
    "coordinateType": "normalized",
    "outputTensorName": "output0",
    "layout": "batch_detections_attributes"
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `modelFile` | string | Yes | Filename of the ONNX model in `models/`. Must match `manifest.json`. |
| `architecture` | string | Yes | Detector architecture family: `"yolo11"`, `"yolov8"`, `"efficientdet"`, `"ssd"`, etc. The mobile app may use this to select the correct post-processing path. |
| `inputSize` | [int, int] | Yes | Model input dimensions [height, width]. The mobile app resizes the captured photo to this size before inference. |
| `inputChannels` | integer | Yes | Number of input channels. Always `3` (RGB). |
| `channelOrder` | string | Yes | `"RGB"` or `"BGR"`. The mobile app reorders channels if needed. |
| `normalize.mean` | [float, float, float] | Yes | Per-channel mean subtraction values. YOLO models typically use `[0, 0, 0]`. |
| `normalize.std` | [float, float, float] | Yes | Per-channel standard deviation divisors. YOLO models typically use `[1, 1, 1]`. |
| `normalize.scale` | float | Yes | Pixel value scaling factor applied BEFORE mean/std normalization. `1/255 = 0.00392156862` converts uint8 [0-255] to float [0-1]. Set to `1.0` if the model expects [0-255] input. |
| `confidenceThreshold` | float | Yes | Minimum detection confidence score [0-1]. Detections below this are discarded. |
| `nmsThreshold` | float | Yes | IoU threshold for non-max suppression [0-1]. Overlapping boxes above this IoU are merged. |
| `maxDetections` | integer | Yes | Maximum number of detections to return per image. Prevents memory issues on dense scenes. |
| `outputFormat` | string | Yes | Output post-processing family: `"yolo"`, `"ssd"`, `"efficientdet"`. Determines how to parse the model's output tensor(s). |
| `classLabels` | [string] | Yes | Ordered list of class label strings. Index position corresponds to class ID in the model output. Single-class detectors have one entry. |
| `outputSpec` | object | Yes | Describes the output tensor layout. See sub-fields below. |
| `outputSpec.boxFormat` | string | Yes | Bounding box coordinate format: `"xyxy"` (x1,y1,x2,y2), `"xywh"` (center_x, center_y, width, height), or `"cxcywh"`. |
| `outputSpec.coordinateType` | string | Yes | `"normalized"` (0-1 relative to input size) or `"absolute"` (pixel coordinates). |
| `outputSpec.outputTensorName` | string | No | Name of the output tensor to read. If omitted, uses the first output tensor. |
| `outputSpec.layout` | string | Yes | Tensor dimension layout: `"batch_detections_attributes"` means shape [B, N, 5+C] where N=detections, 5=box coords+confidence, C=class scores. |

### Post-Processing by Architecture

The mobile app implements post-processing per `architecture` value:

**`yolo11` / `yolov8`:**
1. Output tensor shape: [1, 5+num_classes, num_detections] (transposed from typical YOLO)
2. Transpose to [1, num_detections, 5+num_classes]
3. Extract box coordinates (first 4 values per detection) in `boxFormat`
4. Extract confidence (5th value) and class scores (remaining values)
5. Apply confidence threshold
6. Apply NMS with `nmsThreshold`
7. Map class indices to `classLabels`

**`efficientdet` / `ssd`:**
1. Multiple output tensors: boxes [1, N, 4], scores [1, N, C], (optional) num_detections [1]
2. Extract boxes and scores from respective tensors
3. Apply confidence threshold and NMS

---

## embeddings/ Directory

Contains the pre-computed MiewID embedding vectors and their metadata.

### embeddings/index.json

Maps individuals to their embedding vectors and reference photos.

```json
{
  "formatVersion": "1.0",
  "generatedWith": "miewid-v4",
  "individuals": [
    {
      "id": "WB-HORSE-001",
      "name": "Butterscotch",
      "alternateId": "RANCH-A-042",
      "sex": "female",
      "lifeStage": "adult",
      "firstSeen": "2024-06-15",
      "lastSeen": "2026-02-10",
      "encounterCount": 12,
      "embeddingCount": 5,
      "embeddingOffset": 0,
      "referencePhotos": ["ref_01.jpg", "ref_02.jpg", "ref_03.jpg"],
      "notes": "Distinctive white blaze on forehead"
    },
    {
      "id": "WB-HORSE-002",
      "name": "Thunder",
      "alternateId": null,
      "sex": "male",
      "lifeStage": "adult",
      "firstSeen": "2025-01-20",
      "lastSeen": "2026-03-01",
      "encounterCount": 8,
      "embeddingCount": 3,
      "embeddingOffset": 5,
      "referencePhotos": ["ref_01.jpg"],
      "notes": null
    }
  ]
}
```

### Individual Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Wildbook's unique individual identifier (`MarkedIndividual.individualID`). Used as the foreign key when syncing Encounters back to Wildbook. |
| `name` | string | No | Display name for the individual. May be null for unnamed animals. |
| `alternateId` | string | No | Alternative identifier (e.g., researcher's field ID, tattoo number, band number). |
| `sex` | string | No | `"male"`, `"female"`, `"unknown"`, or null. From Wildbook's individual record. |
| `lifeStage` | string | No | `"adult"`, `"subadult"`, `"juvenile"`, `"calf"`, `"unknown"`, or null. |
| `firstSeen` | string (ISO date) | No | Date of first Encounter in Wildbook. Helps field users assess if a match makes temporal sense. |
| `lastSeen` | string (ISO date) | No | Date of most recent Encounter. |
| `encounterCount` | integer | No | Total Encounters in Wildbook for this individual. Indicates how well-known this animal is. |
| `embeddingCount` | integer | Yes | Number of embedding vectors for this individual in `embeddings.bin`. |
| `embeddingOffset` | integer | Yes | Starting index (0-based) of this individual's vectors in `embeddings.bin`. Vectors for this individual occupy indices `[embeddingOffset, embeddingOffset + embeddingCount)`. |
| `referencePhotos` | [string] | Yes | Filenames of reference photos in `reference_photos/{id}/`. Ordered by quality/representativeness (best first). At least 1 required. |
| `notes` | string | No | Free-form notes about distinguishing features. Shown to the user during match review. |

### embeddings.bin Format

A flat binary file containing all embedding vectors packed sequentially as **little-endian float32** values.

**Layout:**
```
[vector_0: 2152 x float32][vector_1: 2152 x float32]...[vector_N: 2152 x float32]
```

**Reading a specific individual's embeddings:**
```
byte_offset = individual.embeddingOffset * embeddingDim * 4
byte_length = individual.embeddingCount * embeddingDim * 4
```

For MiewID v4 with `embeddingDim = 2152`:
- Each vector: 2152 * 4 = 8,608 bytes
- 635 total vectors: 635 * 8,608 = 5,466,080 bytes (~5.2 MB)

**Why flat binary instead of JSON/numpy:**
- Zero parsing overhead — memory-map the file and read vectors directly
- No serialization/deserialization cost on mobile
- Compact — no key names, no formatting characters
- Compatible with typed arrays in JavaScript (`Float32Array`) and native buffers

**Endianness:** Little-endian (matches ARM and x86 architectures used by iOS and Android).

**Precision:** Float32 (4 bytes per value). Float16 could halve the size but introduces quantization error in cosine similarity. For <500 individuals, Float32 is negligible in size and preserves full precision.

---

## reference_photos/ Directory

Contains representative photographs of each known individual, organized by individual ID.

```
reference_photos/
├── WB-HORSE-001/
│   ├── ref_01.jpg      ← best/most representative
│   ├── ref_02.jpg
│   └── ref_03.jpg
├── WB-HORSE-002/
│   └── ref_01.jpg
└── ...
```

### Photo Requirements

| Property | Requirement | Rationale |
|---|---|---|
| **Format** | JPEG | Universal mobile compatibility, good compression |
| **Resolution** | 512x512 max (longest side) | Large enough for visual comparison, small enough for mobile storage |
| **Quality** | JPEG quality 80 | Good visual quality at reasonable file size (~30-80 KB per photo) |
| **Count per individual** | 1-3 photos | Best photo first; more photos help verification but increase pack size |
| **Content** | Cropped to the annotation region (same crop the detector would produce) | Shows exactly what the detector will crop, making visual comparison meaningful |
| **Naming** | `ref_01.jpg`, `ref_02.jpg`, etc. | Simple sequential naming, referenced by `index.json` |

### Selection Criteria for Wildbook Exporter

When selecting reference photos from an individual's Encounters, the exporter should prefer:

1. **Highest quality** annotations (sharpest, best lighting, least occlusion)
2. **Most recent** Encounters (animal's current appearance)
3. **Diverse viewpoints** if available (different angles of the same feature)
4. **Annotations that produced high-confidence MiewID matches** in Wildbook (proven discriminative photos)

The exporter should avoid:
- Blurry or heavily occluded annotations
- Very old photos where the animal's appearance may have changed
- Duplicate/near-duplicate photos from the same Encounter

---

## Wildbook Exporter Implementation Guide

This section provides guidance for implementing the embedding pack export as an Encounter Search export format in Wildbook.

### Export Trigger

The export is triggered from Wildbook's Encounter Search results page. After a researcher runs a search, they select "Export as Embedding Pack" from the export options. This is analogous to existing export formats (Excel, GIS, email).

### Exporter Workflow

```
1. GATHER ENCOUNTERS
   ├── Execute the Encounter Search query
   ├── Filter to Encounters that have:
   │   ├── At least one Annotation with the target feature class
   │   ├── An assigned Individual (MarkedIndividual)
   │   └── A usable media asset (photo, not video)
   └── Group Encounters by Individual

2. EXTRACT EMBEDDINGS
   ├── For each Encounter's Annotation:
   │   ├── Check if a cached MiewID embedding exists in Wildbook's database
   │   ├── If cached: retrieve the embedding vector
   │   ├── If not cached: send to WBIA for MiewID inference, cache the result
   │   └── Record the embedding vector (2152 x float32)
   └── Associate each embedding with its source Individual

3. SELECT REFERENCE PHOTOS
   ├── For each Individual:
   │   ├── Rank their Annotations by quality (sharpness, recency, match confidence)
   │   ├── Select top 1-3 annotations
   │   ├── Crop the annotation region from the source MediaAsset
   │   ├── Resize to 512x512 max (longest side), JPEG quality 80
   │   └── Save as ref_01.jpg, ref_02.jpg, etc.
   └── Record filenames in index.json

4. BUNDLE DETECTOR MODEL
   ├── Look up the ONNX detector model for the target feature class
   │   (e.g., feature class "horse+face" maps to "horse-face-yolo11n.onnx")
   ├── The model file and its detector.json config are managed as
   │   Wildbook server assets (uploaded by admin, versioned)
   └── Copy model + config into the pack

5. BUILD INDEX
   ├── Create index.json with all individual metadata
   ├── Compute embedding offsets (sequential packing order)
   ├── Write embeddings.bin as flat float32 binary
   └── Compute SHA-256 checksums for embeddings.bin and model file

6. CREATE MANIFEST
   ├── Populate manifest.json with all metadata
   ├── Include the search query for provenance
   ├── Include the Wildbook instance URL for sync
   └── Record the MiewID version used for embeddings

7. PACKAGE
   ├── Zip all files into {species}-{context}-{date}.zip
   ├── Use ZIP deflate compression (good for binary + JPEG mix)
   └── Serve for download or push to a staging URL
```

### Wildbook Data Model Mapping

| Pack Field | Wildbook Source |
|---|---|
| `individual.id` | `MarkedIndividual.individualID` |
| `individual.name` | `MarkedIndividual.nickname` or `MarkedIndividual.alternateID` |
| `individual.sex` | `MarkedIndividual.sex` |
| `individual.firstSeen` | Earliest `Encounter.dateInMilliseconds` for this individual |
| `individual.lastSeen` | Latest `Encounter.dateInMilliseconds` for this individual |
| `individual.encounterCount` | `MarkedIndividual.encounters.size()` |
| Reference photo source | `Annotation.mediaAsset` cropped by `Annotation.bbox` |
| Embedding source | WBIA MiewID plugin result for `Annotation` |
| `manifest.species` | `Encounter.genus + species` or taxonomy key |
| `manifest.featureClass` | `Annotation.iaClass` (IA class label) |
| `manifest.wildbookInstanceUrl` | Server's configured public URL |
| `manifest.searchQuery` | The `SearchQuery` object serialized as a filter string |

### Embedding Caching in Wildbook

To avoid re-running MiewID inference on every export, Wildbook should cache embeddings:

- **Storage:** A new table or column on `Annotation` storing the MiewID embedding vector and the model version that produced it.
- **Invalidation:** If MiewID is updated to a new version, cached embeddings for the old version should be marked stale and re-computed on next export.
- **Schema suggestion:**
  ```sql
  ALTER TABLE annotation ADD COLUMN miewid_embedding BYTEA;
  ALTER TABLE annotation ADD COLUMN miewid_version VARCHAR(32);
  ALTER TABLE annotation ADD COLUMN miewid_computed_at TIMESTAMP;
  ```

### Detector Model Management

Detector models are server-side assets managed by Wildbook administrators:

- Each `iaClass` (feature class) maps to one detector ONNX model + config
- Models are uploaded via Wildbook admin UI and versioned
- When a new detector version is available, packs exported with the old version should prompt users to re-download
- **Storage suggestion:** A `detector_models` table mapping `iaClass` to model file path, config JSON, and version string

### API Endpoint Suggestion

```
POST /api/v1/embedding-packs/export
Content-Type: application/json

{
  "searchQuery": { ... },     // Encounter Search criteria
  "featureClass": "horse+face",
  "maxReferencePhotos": 3,
  "photoMaxSize": 512,
  "photoQuality": 80
}

Response:
202 Accepted
{
  "packId": "uuid",
  "status": "generating",
  "estimatedSize": "35 MB",
  "pollUrl": "/api/v1/embedding-packs/uuid/status"
}
```

Pack generation is asynchronous because it may involve running MiewID inference on uncached annotations. The mobile app polls the status endpoint, then downloads the completed pack.

```
GET /api/v1/embedding-packs/{packId}/status

Response (in progress):
200 OK
{ "status": "generating", "progress": 0.45, "message": "Computing embeddings: 285/635" }

Response (complete):
200 OK
{ "status": "ready", "downloadUrl": "/api/v1/embedding-packs/{packId}/download", "size": 36421632 }
```

```
GET /api/v1/embedding-packs/{packId}/download

Response:
200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="horse-ranch-alpha-2026-03.zip"
[binary zip data]
```

### Pack Updates

When a researcher wants an updated pack (new individuals identified, better photos available):

1. Re-run the same Encounter Search
2. Export a new pack — it replaces the old one on the device
3. The mobile app compares `exportDate` to detect freshness
4. Future enhancement: incremental/delta packs that only ship new or changed individuals

---

## Size Estimates

| Component | Per Individual | 127 Individuals | 500 Individuals |
|---|---|---|---|
| Embeddings (5 vectors avg, float32) | 43 KB | 5.3 MB | 21 MB |
| Reference photos (2 photos avg, 50 KB each) | 100 KB | 12.4 MB | 49 MB |
| Individual metadata (index.json) | ~0.3 KB | 38 KB | 150 KB |
| Detector model (ONNX, FP16) | — | 15-30 MB | 15-30 MB |
| Manifest + config | — | ~2 KB | ~2 KB |
| **Total (uncompressed)** | — | **~35-48 MB** | **~85-100 MB** |
| **Total (zip compressed, est.)** | — | **~25-35 MB** | **~65-80 MB** |

MiewID model (downloaded separately): ~100 MB (FP16 ONNX)

---

## Versioning & Compatibility

### Format Versioning

The `formatVersion` field in `manifest.json` follows semantic versioning:

- **1.x** — Mobile app reads all 1.x packs. Minor versions add optional fields.
- **2.0** — Breaking change. Mobile app must be updated to read v2 packs.

### MiewID Version Compatibility

The mobile app downloads MiewID separately. If the loaded MiewID version doesn't match `embeddingModel.version` in the pack manifest:

- **Minor version mismatch** (e.g., loaded v4.0.1, pack says v4.0.0): Warn but allow. Embedding spaces should be compatible.
- **Major version mismatch** (e.g., loaded v4, pack says v3): Block. Different major versions may have incompatible embedding spaces. Prompt user to download the correct MiewID version or re-export the pack.

### Pack Staleness

The mobile app shows the pack's `exportDate` and warns if the pack is older than a configurable threshold (e.g., 90 days). Stale packs may be missing newly identified individuals.
