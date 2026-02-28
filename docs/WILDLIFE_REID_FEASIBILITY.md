# Wildlife Re-ID on Mobile: Feasibility Analysis

**Date:** 2026-02-25
**Goal:** Evaluate using Off Grid Mobile as a platform to bring Wildbook's MiewID algorithm to mobile for offline individual animal re-identification.

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Off Grid Codebase Quality](#off-grid-codebase-quality)
- [MiewID Technical Profile](#miewid-technical-profile)
- [Re-ID Pipeline](#re-id-pipeline)
- [Mobile Feasibility](#mobile-feasibility)
- [Platform Alternatives](#platform-alternatives)
- [ML Inference Libraries for React Native](#ml-inference-libraries-for-react-native)
- [Vector Search on Mobile](#vector-search-on-mobile)
- [Recommendation](#recommendation)
- [What to Build on Top of Off Grid](#what-to-build-on-top-of-off-grid)
- [Blockers to Resolve First](#blockers-to-resolve-first)
- [Sources](#sources)

---

## Executive Summary

Off Grid Mobile is a well-engineered React Native app (8.5/10 code quality) with production-grade model management, background downloads, offline persistence, and native module bridges. It provides roughly 40-50% of the infrastructure needed for a mobile wildlife re-ID app. The recommended path is to build on Off Grid, adding ONNX Runtime for MiewID/detector inference, vector similarity search for matching, and a Wildbook sync protocol.

Key risk: MiewID code and model weights have **no explicit open-source license**. This must be resolved with Conservation X Labs before proceeding.

---

## Off Grid Codebase Quality

**Overall: 8.5/10 — Production-grade**

### Architecture

- Layered service-based architecture: UI -> Navigation -> Zustand stores -> Services -> Native modules
- Lifecycle-independent services — generation continues when UI unmounts (advanced pattern)
- Clean native module bridges for iOS (Swift/Core ML) and Android (Kotlin/MNN/QNN)
- 168 TypeScript files with strong typing throughout
- Singleton service pattern for thread-safe model loading/unloading
- Platform differences hidden behind `Platform.select()` abstractions

### Test Coverage

- 1,208 tests across unit, integration, component (RNTL), and contract layers
- 16 E2E Maestro flows covering all P0 user journeys
- 80% coverage thresholds enforced in CI
- Strict pre-commit hooks: ESLint + tsc + tests (JS/TS), SwiftLint (Swift), Gradle lint + compile (Kotlin)

### Dependencies (Key)

| Package | Version | Purpose |
|---|---|---|
| react | 19.2.0 | UI framework |
| react-native | 0.83.1 | Mobile runtime |
| zustand | ^5.0.10 | State management |
| llama.rn | ^0.11.0-rc.3 | On-device LLM inference |
| whisper.rn | ^0.5.5 | On-device voice transcription |
| @react-navigation | ^7.x | Navigation |

### What Off Grid Provides That's Reusable

| Capability | Relevance to Wildlife Re-ID |
|---|---|
| HuggingFace model downloading | Download MiewID / detector models |
| Background download service (native Android + iOS) | Download embedding packs |
| Model lifecycle management (download/delete/scan/restore) | Manage detector + re-ID models |
| Camera/image picker integration | Capture animal photos |
| Offline-first persistence (Zustand + AsyncStorage) | Store observations offline |
| Project/conversation management | Adapt to survey/encounter management |
| Security (passphrase, keychain) | Protect sensitive location data |
| Theme system + UI components | Field-appropriate UI |

### What Off Grid Does NOT Have

- No ONNX / TFLite inference (uses llama.rn for LLMs, not vision models)
- No object detection pipeline
- No vector similarity search
- No sync protocol to an external server
- No structured database (uses AsyncStorage, not SQLite)

### Minor Issues

- No timeout on model loading (can hang)
- No download retry with exponential backoff
- `App.tsx` is somewhat overloaded (~274 lines)

---

## MiewID Technical Profile

| Property | Value |
|---|---|
| **Backbone** | EfficientNetV2-RW-M (timm library) |
| **Parameters** | 51.1M |
| **GMACs** | 24.38 |
| **Input** | 440x440 RGB, ImageNet-normalized |
| **Pooling** | GeM (Generalized Mean Pooling), learnable p=3 |
| **Output** | 2,152-dim embedding vector (batch-normalized) |
| **Loss** | Sub-center ArcFace with dynamic margins |
| **Species (v4, Jan 2026)** | ~90 species, ~110 feature classes |
| **Accuracy (v4)** | 78% top-1, 87% top-5, 89% top-10 |
| **Framework** | PyTorch (timm + HuggingFace transformers) |
| **Distribution** | Safetensors on HuggingFace |
| **Model size** | ~200 MB (FP32), ~100 MB (FP16), ~50 MB (INT8) |
| **License** | **No license file** — legal risk |

### Species Coverage

Cetaceans (humpback whale, orca, beluga, sperm whale, blue whale), felids (leopard, cheetah, jaguar, snow leopard, lion, lynx), marine (whale shark, manta ray, sea turtles, seahorse), primates (chimpanzee, macaque), zebra, giraffe, hyena, wild dog, seal species, elephants, fire salamanders, and more.

### HuggingFace Models

- [`conservationxlabs/miewid-msv2`](https://huggingface.co/conservationxlabs/miewid-msv2) — 54 species
- [`conservationxlabs/miewid-msv3`](https://huggingface.co/conservationxlabs/miewid-msv3) — 64 species
- v4 — ~90 species (announced January 2026)

---

## Re-ID Pipeline

The Wildbook re-identification pipeline works as follows:

1. **Detect** — YOLO-class detector produces bounding boxes with species labels
2. **Crop** — Extract animal from image using bounding box
3. **Embed** — Pass 440x440 crop through MiewID -> 2,152-dim vector
4. **Match** — Cosine similarity against database of known individuals (top-N ranked)
5. **Human review** — Researcher confirms or rejects match candidates

Wildbook also runs complementary algorithms in parallel: HotSpotter (texture matching), PIE v2 (pose-invariant embeddings), Modified Groth/I3S (spot patterns).

### Detection

- WBIA uses Darknet YOLO and supports Faster R-CNN, SSD, DenseNet
- [MegaDetector v6](https://github.com/agentmorris/MegaDetector) (YOLOv9/v10-based) is the leading open-source wildlife detector
- MegaDetector compact variant has 2% of MDv5's parameters — excellent for mobile
- YOLO models are well-proven on mobile (Core ML, TFLite, ONNX Runtime)

---

## Mobile Feasibility

### On-Device Performance Estimates

| Component | Model Size | Latency (iPhone Neural Engine) | Latency (Android GPU) |
|---|---|---|---|
| Detection (YOLO nano/small) | ~15 MB | ~20-50ms | ~30-80ms |
| MiewID embedding (FP16) | ~100 MB | ~100-300ms | ~200-500ms |
| Vector search (10K individuals) | ~430 MB DB | <50ms | <50ms |

### Storage Budget

| Component | Size |
|---|---|
| Detector model (YOLO, quantized) | ~15 MB |
| MiewID model (FP16) | ~100 MB |
| Embedding database (10K individuals x 5 images, 2152-dim FP32) | ~430 MB |
| **Total** | **~550 MB** |

This is feasible on modern phones (128+ GB storage is standard).

### ONNX Export Path

MiewID uses standard operations (EfficientNetV2 backbone, GeM pooling, batch norm). The export chain:

1. `torch.onnx.export()` — PyTorch to ONNX
2. `coremltools` — ONNX to Core ML (iOS) for Neural Engine acceleration
3. ONNX Runtime Mobile — Direct ONNX on Android with NNAPI acceleration
4. Or TFLite conversion via TensorFlow for `react-native-fast-tflite`

### Field Conditions

| Concern | Mitigation |
|---|---|
| Battery | NPU/Neural Engine inference: 0.5-2W vs CPU 3-5W. Process on-capture, not continuous. |
| Heat/throttling | Avoid sustained inference. Use dedicated NPU when available. |
| Storage | ~550 MB total is feasible on modern devices. |
| Offline duration | All inference on-device. Observations queued locally. Sync when connected. |

---

## Platform Alternatives

| Approach | Pros | Cons | Dev Effort |
|---|---|---|---|
| **Off Grid (RN) + ONNX Runtime** | 40-50% infrastructure reuse; iNaturalist/Seek proves RN+ML at scale | Need to add ONNX inference, vector search, sync | **Medium** |
| **React Native from scratch + ONNX** | Clean slate, no legacy | Rebuild all model management, downloads, offline storage, UI | **High** |
| **Native Swift + Kotlin** | Best performance; Core ML + TFLite are first-party | 2x maintenance, 2x codebase, expensive | **Very High** |
| **Flutter + TFLite** | Good TFLite integration; single codebase | Smaller conservation community; no Off Grid equivalent | **High** |
| **React Native + ExecuTorch** | Meta-backed; 50KB runtime; broad hardware backends | Pre-1.0 RN bindings; newer than ONNX RT | **Medium-High** |

### Precedent: iNaturalist / Seek

iNaturalist's [Seek app](https://github.com/inaturalist/SeekReactNative) is built in React Native with on-device TFLite (Android) + Core ML (iOS). It proves the tech stack works at scale for wildlife apps — though Seek does species classification, not individual re-ID.

---

## ML Inference Libraries for React Native

All three are production-viable in 2026:

### onnxruntime-react-native (Recommended)

- Microsoft-backed, part of the main [onnxruntime](https://github.com/microsoft/onnxruntime) repo
- NNAPI (Android) + CoreML (iOS) hardware acceleration
- Single ONNX model format works on both platforms
- Most mature cross-platform option
- [Docs](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html)

### react-native-fast-tflite

- By Marc Rousavy (author of VisionCamera)
- JSI zero-copy memory access — no JS-to-native bridge overhead
- GPU acceleration via CoreML/Metal (iOS) and GPU delegate (Android)
- Integrates with VisionCamera for real-time frame processing
- [GitHub](https://github.com/mrousavy/react-native-fast-tflite)

### react-native-executorch

- By Software Mansion, brings Meta's ExecuTorch to React Native
- 12+ hardware backends (Apple Neural Engine, Qualcomm, ARM, MediaTek, Vulkan)
- 50KB base runtime footprint
- Pre-1.0 but actively developed with Expo backing
- [GitHub](https://github.com/software-mansion/react-native-executorch)

---

## Vector Search on Mobile

| Solution | Platform | Notes |
|---|---|---|
| [ObjectBox](https://objectbox.io/vector-database-for-ondevice-ai/) | iOS + Android SDKs | Full database with HNSW vector search built-in |
| [sqlite-vec](https://github.com/asg017/sqlite-vec) | Any SQLite binding | KNN queries, compact format |
| [sqlite-vector](https://github.com/sqliteai/sqlite-vector) | Any SQLite binding | SIMD-optimized, 30MB memory footprint |
| [FAISS Mobile](https://github.com/DeveloperMindset-com/faiss-mobile) | iOS/macOS | In-memory, fast, limited Android support |
| Brute-force cosine | Trivial | Sufficient for <5K individuals |

For a database of thousands of individuals, **ObjectBox** or **sqlite-vec** are the strongest options. For hundreds, brute-force cosine similarity is simpler and sufficient.

---

## Recommendation

**Build on Off Grid with ONNX Runtime.** This is the most efficient path because:

1. Off Grid saves months of work on model management, background downloads, native module bridging, offline persistence, and cross-platform build infrastructure
2. The code quality is genuinely good (8.5/10) — strong typing, comprehensive tests, clean architecture
3. The missing pieces are well-scoped and additive (not requiring rewrites)
4. The iNaturalist/Seek precedent validates React Native + on-device ML for conservation apps
5. `onnxruntime-react-native` is the most mature cross-platform ML inference library

---

## What to Build on Top of Off Grid

| Component | Technology | Effort |
|---|---|---|
| Animal detection | `onnxruntime-react-native` + MegaDetector v6 (YOLO) | Medium |
| Re-ID embeddings | `onnxruntime-react-native` + MiewID (ONNX export) | Medium |
| Vector search | sqlite-vec or ObjectBox | Low-Medium |
| Observation data model | WatermelonDB (SQLite) replacing AsyncStorage | Medium |
| Wildbook sync | Custom REST client + background sync | Medium |
| Field UI | Bounding box overlay, match cards, survey management | Medium |
| Camera upgrade | VisionCamera (replacing image-picker for real-time detection) | Low |
| Model update mechanism | Extend existing HuggingFace download infrastructure | Low |

---

## Blockers to Resolve First

1. **License MiewID** — Contact Conservation X Labs for explicit permission to use the code and model weights. Neither the [GitHub repo](https://github.com/WildMeOrg/wbia-plugin-miew-id) nor the [HuggingFace models](https://huggingface.co/conservationxlabs/miewid-msv3) have a license file.
2. **Validate ONNX export** — Export MiewID to ONNX and benchmark inference on a target device (iPhone 15+, recent Android flagship) to confirm latency is acceptable.
3. **Confirm Wildbook API** — Verify what sync/data-exchange APIs Wildbook exposes for mobile clients. WBIA has a Flask REST API, but Wildbook's external API surface is not well-documented.

---

## Sources

### MiewID & Wildbook

- [MiewID arXiv Paper (Multispecies Animal Re-ID)](https://arxiv.org/html/2412.05602v1)
- [MiewID GitHub (wbia-plugin-miew-id)](https://github.com/WildMeOrg/wbia-plugin-miew-id)
- [MiewID-msv3 on HuggingFace](https://huggingface.co/conservationxlabs/miewid-msv3)
- [MiewID-msv2 on HuggingFace](https://huggingface.co/conservationxlabs/miewid-msv2)
- [MiewID v4 Announcement](https://community.wildme.org/t/miewid-v4-announcement/5406)
- [Wildbook Image Analysis Pipeline Docs](https://wildbook.docs.wildme.org/introduction/image-analysis-pipeline.html)
- [Wildbook-IA (WBIA) GitHub](https://github.com/WildMeOrg/wildbook-ia)
- [ScoutBot GitHub](https://github.com/WildMeOrg/scoutbot)
- [MegaDetector GitHub](https://github.com/agentmorris/MegaDetector)
- [MegaDescriptor on HuggingFace](https://huggingface.co/collections/BVRA/megadescriptor)

### Mobile ML

- [ONNX Runtime React Native Docs](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html)
- [react-native-fast-tflite GitHub](https://github.com/mrousavy/react-native-fast-tflite)
- [react-native-executorch GitHub](https://github.com/software-mansion/react-native-executorch)
- [react-native-vision-camera GitHub](https://github.com/mrousavy/react-native-vision-camera)
- [ExecuTorch GitHub](https://github.com/pytorch/executorch)

### Wildlife Apps

- [Seek by iNaturalist (React Native) GitHub](https://github.com/inaturalist/SeekReactNative)
- [iNaturalist React Native GitHub](https://github.com/inaturalist/iNaturalistReactNative)
- [RAPID: Real-time Animal Re-ID on Edge Devices](https://www.biorxiv.org/content/10.1101/2025.07.07.663143v1)
- [Animal Re-ID on Microcontrollers](https://arxiv.org/html/2512.08198v1)

### Vector Search

- [ObjectBox Vector Database](https://objectbox.io/vector-database-for-ondevice-ai/)
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [sqlite-vector GitHub](https://github.com/sqliteai/sqlite-vector)
- [FAISS Mobile GitHub](https://github.com/DeveloperMindset-com/faiss-mobile)
