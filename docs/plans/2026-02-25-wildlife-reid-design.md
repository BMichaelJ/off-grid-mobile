# Wildlife Re-ID Mobile App — Design Document

**Date:** 2026-02-25
**Status:** Approved
**Feasibility Analysis:** [docs/WILDLIFE_REID_FEASIBILITY.md](../WILDLIFE_REID_FEASIBILITY.md)
**Embedding Pack Format Spec:** [docs/EMBEDDING_PACK_FORMAT.md](../EMBEDDING_PACK_FORMAT.md)

---

## 1. Purpose

Build a mobile app that enables researchers and citizen scientists to photograph wildlife in the field, run on-device detection and individual re-identification using MiewID v4, and sync observations back to Wildbook when online. The app supports offline operation — all inference runs on-device with no network required after initial setup.

### Users

Both trained researchers and citizen scientists. The UI must be powerful enough for professional field biologists while accessible to community volunteers.

### Core Workflow

1. Download embedding packs and models while online (preparation)
2. Go into the field — capture photos, detect animals, match individuals (all offline)
3. Return online — sync observations to Wildbook as Encounters

---

## 2. Fork Strategy

The app is a **fork** of Off Grid Mobile — separate app identity (name, icon, bundle ID) built on Off Grid's infrastructure.

### What Gets Stripped

| Module | Files | Reason |
|---|---|---|
| LLM chat | `llm.ts`, `llmHelpers.ts`, `llmMessages.ts`, `llmTypes.ts`, `llmToolGeneration.ts`, `generationService.ts`, `generationToolLoop.ts` | Not needed |
| Image generation | `imageGenerator.ts`, `imageGenerationService.ts`, `localDreamGenerator.ts`, CoreMLDiffusionModule, LocalDreamModule | Not needed |
| Voice transcription | `whisperService.ts`, `voiceService.ts`, whisperStore, Whisper native modules | Not needed |
| Tool calling | `tools/` directory | Not needed |
| Intent classifier | `intentClassifier.ts` | Not needed |
| Chat UI | ChatScreen, ChatInput, ChatMessage components, ChatsListScreen | Replaced by wildlife UI |

### What Gets Kept & Adapted

| Module | Files | Adaptation |
|---|---|---|
| Model management | `modelManager/` (download, scan, restore, storage, types) | Manage ONNX models + embedding packs instead of GGUF models |
| Background downloads | `backgroundDownloadService.ts` | Download models and packs from Wildbook |
| Active model service | `activeModelService/` | Singleton load/unload for ONNX sessions instead of llama.rn contexts |
| Hardware service | `hardware.ts` | Memory checks before loading detector + MiewID |
| Auth service | `authService.ts` | Wildbook authentication instead of local passphrase |
| HuggingFace browser | `huggingFaceModelBrowser.ts`, `huggingface.ts` | Adapt for MiewID model downloads |
| Document service | `documentService.ts` | Import embedding pack zip files |
| Stores | `appStore.ts`, `chatStore.ts` (pattern only) | New stores for packs, observations, sync |
| Navigation | `AppNavigator.tsx`, types | New screen structure |
| Theme | `theme/` | Rebrand, keep theme system |
| Components | `Card`, `AppSheet`, `Button`, `AnimatedEntry`, `AnimatedPressable`, `CustomAlert` | Reuse directly |
| Settings | `SettingsScreen.tsx`, `StorageSettingsScreen.tsx` | Adapt for Wildbook settings + pack storage |

---

## 3. Data Model

### EmbeddingPack

Downloaded from Wildbook. Defines one species the app can identify.

```typescript
interface EmbeddingPack {
  id: string;                          // unique pack identifier
  species: string;                     // e.g., "horse"
  featureClass: string;                // e.g., "horse+face"
  displayName: string;                 // e.g., "Ranch Alpha Horses"
  wildbookInstanceUrl: string;         // sync target
  exportDate: string;                  // ISO 8601
  individualCount: number;
  embeddingDim: number;                // 2152 for MiewID v4
  embeddingModelVersion: string;       // e.g., "4.0.0"
  detectorModelFile: string;           // path to ONNX detector on filesystem
  embeddingsFile: string;              // path to embeddings.bin on filesystem
  indexFile: string;                   // path to index.json on filesystem
  referencePhotosDir: string;          // path to reference_photos/ dir
  packDir: string;                     // root directory of unpacked pack
  downloadedAt: string;               // when the pack was installed
  sizeBytes: number;                   // total uncompressed size
}
```

### PackIndividual

A known individual from an embedding pack.

```typescript
interface PackIndividual {
  id: string;                          // Wildbook individual ID (e.g., "WB-HORSE-042")
  name: string | null;                 // display name
  alternateId: string | null;          // researcher's field ID
  sex: 'male' | 'female' | 'unknown' | null;
  lifeStage: string | null;
  firstSeen: string | null;           // ISO date
  lastSeen: string | null;
  encounterCount: number;
  embeddingCount: number;
  embeddingOffset: number;             // index into embeddings.bin
  referencePhotos: string[];           // filenames in reference_photos/{id}/
  notes: string | null;
}
```

### LocalIndividual

Created in the field when no pack match is found.

```typescript
interface LocalIndividual {
  localId: string;                     // e.g., "FIELD-001"
  userLabel: string | null;            // user-assigned name (e.g., "Bay mare near river")
  species: string;
  embeddings: number[][];              // accumulated embedding vectors
  referencePhotos: string[];           // URIs to cropped detection images
  firstSeen: string;                   // ISO 8601
  encounterCount: number;
  syncStatus: 'pending' | 'synced';   // becomes Wildbook MarkedIndividual on sync
  wildbookId: string | null;           // assigned after sync
}
```

### Observation

One per captured photo.

```typescript
interface Observation {
  id: string;
  photoUri: string;                    // file:// path to original photo
  gps: {
    lat: number;
    lon: number;
    accuracy: number;                  // meters
  } | null;
  timestamp: string;                   // ISO 8601
  deviceInfo: {
    model: string;
    os: string;
  };
  fieldNotes: string | null;
  detections: Detection[];
  createdAt: string;
}
```

### Detection

One per bounding box. Each becomes a Wildbook Encounter on sync.

```typescript
interface Detection {
  id: string;
  observationId: string;
  boundingBox: {
    x: number;                         // normalized [0-1]
    y: number;
    width: number;
    height: number;
  };
  species: string;
  speciesConfidence: number;
  croppedImageUri: string;             // file:// path to cropped image
  embedding: number[];                 // 2152-dim float32
  matchResult: {
    topCandidates: MatchCandidate[];
    approvedIndividual: string | null; // pack individual ID or local ID
    reviewStatus: 'pending' | 'approved' | 'rejected';
  };
  encounterFields: {
    locationId: string | null;
    sex: string | null;
    lifeStage: string | null;
    behavior: string | null;
    submitterId: string | null;
    projectId: string | null;
  };
}

interface MatchCandidate {
  individualId: string;                // pack ID or local ID
  score: number;                       // cosine similarity [0-1]
  source: 'pack' | 'local';           // where this candidate came from
  refPhotoIndex: number;               // index into individual's reference photos
}
```

### SyncQueue

Tracks upload state per observation.

```typescript
interface SyncQueueItem {
  observationId: string;
  status: 'pending' | 'uploading' | 'synced' | 'failed' | 'failedPermanent';
  wildbookInstanceUrl: string;
  retryCount: number;
  lastError: string | null;
  lastAttempt: string | null;          // ISO 8601
  syncedAt: string | null;
  wildbookEncounterIds: string[];      // IDs returned by Wildbook on success
}
```

### Storage Strategy

- **Embedding packs:** Unzipped directories on filesystem. Pack metadata in Zustand store persisted to AsyncStorage.
- **Observations + Detections:** Zustand store persisted to AsyncStorage. Photos on filesystem.
- **Local Individuals:** Zustand store persisted to AsyncStorage. Embeddings stored inline (small count for PoC). Reference photos on filesystem.
- **Sync queue:** Zustand store.
- **Scale note:** AsyncStorage is sufficient for the PoC (<500 individuals, hundreds of observations). Migrate to WatermelonDB/SQLite if scale demands it.

---

## 4. ML Inference Pipeline

All inference runs on-device via `onnxruntime-react-native`. Two ONNX model types: species-specific detectors and the shared MiewID embedding model.

### Pipeline Flow

```
1. CAPTURE
   └── Photo saved to filesystem, GPS + timestamp recorded

2. DETECT (per loaded species detector)
   ├── Load detector ONNX session (if not already loaded)
   ├── Preprocess: resize to detector's inputSize, normalize per detector.json
   ├── Run ONNX inference
   ├── Post-process: NMS, confidence threshold filter
   └── Output: [{ boundingBox, species, confidence }]

3. CROP & EMBED (per detection)
   ├── Crop bounding box from original photo
   ├── Resize to 440x440
   ├── Normalize: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
   ├── Load MiewID ONNX session (if not already loaded)
   ├── Run ONNX inference → 2152-dim embedding
   └── Save cropped image to filesystem

4. MATCH (per detection)
   ├── Compute cosine similarity against:
   │   ├── All embeddings in the species' pack
   │   └── All embeddings in local individuals for that species
   ├── Merge and rank by score
   ├── Return top-5 candidates with scores, source, and ref photo index
   └── Present to user for review

5. REVIEW
   ├── User approves one candidate → approvedIndividual set
   ├── User rejects all → can create new LocalIndividual
   ├── User skips → reviewStatus stays "pending"
   └── If approved: new embedding added to individual's profile

6. SAVE
   └── Observation + detections + match results → Zustand store
```

### Model Loading Strategy

| Model | Load when | Unload when | Size (FP16) |
|---|---|---|---|
| Detector (per species) | First photo for that species | User switches species or memory pressure | ~15-30 MB |
| MiewID v4 | First detection needs embedding | Memory pressure or app background | ~100 MB |

MiewID stays loaded since it's shared across species. Species detectors swap as needed.

### Multiple Species in One Photo

The app runs each loaded species detector sequentially against the same photo. If a horse detector finds 2 horses and a cattle detector finds 1 cow, the result is 3 detections, each matched against its species' embedding database independently.

### Preprocessing Configuration

Each embedding pack includes `config/detector.json` specifying how to preprocess for its detector. This makes the pipeline model-agnostic. See [EMBEDDING_PACK_FORMAT.md](../EMBEDDING_PACK_FORMAT.md) for the full detector config specification.

---

## 5. Live Embedding Accumulation

The on-device embedding database **grows during fieldwork**. This is a key differentiator from static offline matching.

### How It Works

1. **Start of trip:** Pack has N known individuals (or zero — can start empty)
2. **New sighting, no match:** User creates a new LocalIndividual with a field ID (e.g., "FIELD-001") or user-chosen name. The detection's embedding becomes the individual's first embedding. The cropped image becomes their first reference photo.
3. **Re-sighting of field individual:** The new embedding is added to the LocalIndividual's profile, improving future matches.
4. **Re-sighting of pack individual:** The new embedding is stored with the detection (not added to the pack — the pack is read-only). The match is recorded for sync.
5. **Matching always searches both sources:** Pack embeddings (static, read-only) and local individual embeddings (growing, read-write) are merged and ranked together.

### Match Source Identification

Each match candidate includes a `source` field (`"pack"` or `"local"`) so the user knows whether they're matching against a Wildbook-known individual or a field-created one.

### On Sync

- LocalIndividuals with `syncStatus: "pending"` become new MarkedIndividuals in Wildbook
- Wildbook assigns permanent IDs, which are written back to the local record
- Future pack exports from Wildbook will include these individuals

---

## 6. Wildbook Sync Protocol

### Sync Lifecycle

```
OFFLINE                                 ONLINE
───────                                 ──────
Observations saved locally              App detects network
SyncQueue items: "pending"              For each pending observation:
                                          1. Upload full-res photo → MediaAsset
                                          2. Per detection → create Encounter:
                                             - Attach bbox, species, embedding
                                             - If approved: assign individual ID
                                             - If rejected/pending: no ID (server re-matches)
                                          3. Per new LocalIndividual:
                                             - Create MarkedIndividual in Wildbook
                                             - Get back permanent Wildbook ID
                                        SyncQueue: "synced" or "failed"
```

### Per-Detection Encounter Payload

```json
{
  "mediaAsset": "<uploaded photo reference>",
  "annotationBbox": { "x": 0.12, "y": 0.08, "width": 0.35, "height": 0.42 },
  "species": "horse",
  "featureClass": "horse+face",
  "embedding": [2152 floats],
  "matchResult": {
    "reviewStatus": "approved",
    "approvedIndividual": "WB-HORSE-042",
    "matchConfidence": 0.87,
    "topCandidates": [
      { "individualId": "WB-HORSE-042", "score": 0.87 },
      { "individualId": "WB-HORSE-019", "score": 0.72 }
    ]
  },
  "encounterFields": {
    "locationId": "ranch-alpha",
    "gps": { "lat": 34.0522, "lon": -118.2437, "accuracy": 5.2 },
    "dateTime": "2026-03-20T14:30:00Z",
    "sex": null,
    "lifeStage": "adult",
    "behavior": "grazing",
    "submitterId": "user@example.com",
    "projectId": "horse-survey-2026",
    "fieldNotes": "Near water trough, group of 5"
  }
}
```

### Sync Behavior by Review Status

| reviewStatus | Encounter in Wildbook | Individual Assignment |
|---|---|---|
| `approved` (pack individual) | Created with individual ID | Linked to existing MarkedIndividual |
| `approved` (local individual) | Created with new individual | New MarkedIndividual created |
| `rejected` | Created, no individual ID | Queued for server-side matching |
| `pending` | Created, no individual ID | Queued for server-side matching |

### Error Handling

- Failed uploads remain in queue as `"failed"` with error message
- Retry with exponential backoff: 1min, 5min, 30min
- After 5 failures → `"failedPermanent"`, user notified
- User can manually retry from Sync Screen
- If Wildbook rejects an individual ID (merged/deleted since pack export), Encounter created without ID, flagged for user

### Photo Upload

- Full-resolution original photo uploaded (Wildbook re-crops from its own detection)
- Multipart POST with resumable upload for large files on slow connections
- Cropped detection images kept locally, not uploaded

---

## 7. App Screens & User Flow

### Screen Map

```
Launch → Home Screen
           ├── Active Packs (loaded species)
           ├── Quick Capture button
           └── Recent Observations list

Home → Packs Screen
           ├── Downloaded packs list
           ├── Download new pack (from Wildbook)
           ├── Pack details (individuals, size)
           └── Delete / update pack

Home → Capture Flow
           ├── Camera (standard photo capture)
           ├── Detection Results (bounding boxes on photo)
           ├── Match Review per detection (top-5 + ref photos)
           ├── New Individual creation (when no match)
           ├── Encounter Metadata form
           └── Save observation

Home → Observations Screen
           ├── All saved observations list
           ├── Filter: pending review / reviewed / synced
           ├── Tap → Observation detail (photo, detections, matches)
           └── Review unreviewed detections

Home → Sync Screen
           ├── Sync status (pending / uploading / synced / failed)
           ├── Manual sync trigger
           ├── Wildbook connection settings
           └── Retry failed uploads

Home → Settings
           ├── Wildbook instance URL + auth
           ├── MiewID model management
           ├── Storage usage (packs + observations + photos)
           ├── Default encounter fields (pre-fill values)
           └── About / version
```

### Capture Flow Detail

```
1. Tap "Capture" → standard camera
2. Take photo → saved, GPS + timestamp recorded
3. "Detecting..." spinner (run loaded detectors)
4. Detection Results:
   ├── Original photo with bounding boxes
   ├── Each box: species label + confidence
   ├── Tap a box → Match Review
   └── "Save All" → save without reviewing any
5. Match Review (per detection):
   ├── Cropped detection image (top)
   ├── Top-5 candidates:
   │   ├── Reference photo (side-by-side)
   │   ├── Name + ID + source (pack/local)
   │   ├── Score (percentage)
   │   └── Notes
   ├── "Approve" one candidate
   ├── "No Match — New Individual" → create LocalIndividual
   └── "Skip" → leave as pending
6. Encounter Metadata:
   ├── Pre-filled: GPS, date/time, species, submitter
   ├── User fills: location, behavior, life stage, sex, notes
   ├── Defaults from Settings applied
   └── "Save" commits observation
```

### Reused Off Grid Screens (Adapted)

| Off Grid Screen | Becomes | Changes |
|---|---|---|
| HomeScreen | Home | New layout: packs + capture + recent observations |
| ModelsScreen | Packs Screen | Embedding packs instead of LLM models |
| ModelDownloadScreen | Pack Download | Wildbook API instead of HuggingFace |
| SettingsScreen | Settings | Wildbook auth, default encounter fields |
| StorageSettingsScreen | Storage Settings | Pack + observation sizes |

### New Screens

| Screen | Purpose |
|---|---|
| Camera / Capture | Photo capture triggering detection |
| Detection Results | Bounding box overlay, entry to match review |
| Match Review | Side-by-side candidate comparison, approve/reject/new |
| New Individual | Create a LocalIndividual when no match found |
| Encounter Metadata | Field data entry form |
| Observations List | Browse and filter saved observations |
| Observation Detail | View past observation's detections + matches |
| Sync Screen | Upload status, Wildbook connection, retry |

---

## 8. Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **App approach** | Fork Off Grid | 40-50% infrastructure reuse; proven patterns |
| **ML inference** | ONNX Runtime (`onnxruntime-react-native`) | Cross-platform, single model format, Microsoft-backed, mature |
| **Model format** | ONNX (FP16) | Single conversion pipeline, works on both platforms |
| **Embedding model** | MiewID v4 (shared, ~100 MB) | Multi-species, 78% top-1 accuracy, proven in Wildbook |
| **Detection models** | Species-specific ONNX, config-driven | Different species need different detectors |
| **Vector search** | Brute-force cosine similarity | <500 individuals, no indexing overhead needed |
| **Persistence** | Zustand + AsyncStorage | Matches Off Grid patterns, sufficient for PoC scale |
| **Camera** | react-native-image-picker (capture-then-detect) | Simpler than VisionCamera, lower battery, works on older devices |
| **Embedding growth** | Live on-device accumulation | Field-created individuals matchable in same session |
| **Pack format** | Zip with manifest + binary embeddings + ref photos + ONNX detector | Self-contained, documented in EMBEDDING_PACK_FORMAT.md |

---

## 9. MVP Scope — Horse Face PoC

### In Scope

| Component | MVP Scope |
|---|---|
| Species | Horse faces only |
| Detector | One ONNX horse face detector (YOLO11 nano) |
| Embedding model | MiewID v4 (ONNX FP16) |
| Embedding pack | Hand-built test pack (~10-50 horses) OR start empty |
| Detection | Capture-then-detect, single photo |
| Match review | Top-5 candidates, approve/reject/skip/new individual |
| Live accumulation | New sightings matchable immediately |
| Metadata | GPS + timestamp auto-filled, other fields optional |
| Storage | Zustand + AsyncStorage |
| Sync | Stub/mock — save locally, display sync queue UI |
| Pack import | Manual file import (zip from device storage) |
| Platform | iOS first, Android second |

### Not in Scope (Future Phases)

| Feature | Phase |
|---|---|
| Wildbook API pack download | Phase 2 |
| Wildbook API sync (actual upload) | Phase 2 |
| Wildbook authentication | Phase 2 |
| Multiple species simultaneously | Phase 2 |
| Multiple detector architectures | Phase 2 |
| Pack update / delta sync | Phase 3 |
| Incremental embedding packs | Phase 3 |
| Confidence-tiered auto-review | Phase 3 |
| Offline maps / location names | Phase 3 |
| Live viewfinder detection | Phase 3 |

### Success Criteria

1. User takes a photo of a horse
2. App detects the horse's face with a bounding box
3. App extracts a MiewID embedding from the cropped face
4. App matches against pack + local individuals, shows top-5 with reference photos
5. User approves a match or creates a new individual
6. New individual is matchable on the next photo
7. Observation saved locally with all metadata
8. Full pipeline runs offline after initial model + pack setup

### Prerequisites

1. Horse face detector model in ONNX format (train or source)
2. MiewID v4 exported to ONNX (`torch.onnx.export()`)
3. Test dataset of horse face photos with known IDs + pre-computed embeddings
4. MiewID licensing clarification from Conservation X Labs
