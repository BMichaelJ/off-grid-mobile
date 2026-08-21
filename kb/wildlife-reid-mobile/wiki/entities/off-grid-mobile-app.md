# Off Grid Mobile (Wildlife Re-ID Fork)

**Category:** entity
**Sources:** [[docs-live/WILDLIFE_REID_FEASIBILITY.md]], [[docs-live/plans/2026-02-25-wildlife-reid-design.md]], [[docs-live/plans/2026-02-25-wildlife-reid-implementation.md]], [[codebase-map]]
**Related:** [[miewid-v4]], [[embedding-pack]], [[on-device-reid-pipeline]], [[state-of-implementation]]
**Last updated:** 2026-04-22

## Summary

`/mnt/c/off-grid-mobile` is a React Native 0.83 / TypeScript app originally built as an on-device LLM / image-gen / voice tool. It is being repurposed as an offline wildlife individual re-identification platform: capture photo → species detector (YOLO) → crop → MiewID embedding → cosine match against embedding pack + local individuals → human review → queue for Wildbook sync. Chat / LLM / image-gen / voice / tools modules were stripped in commit `a63d662`.

## Stack

| Layer | Choice |
|---|---|
| UI | React Native 0.83, React 19.2, Zustand 5, React Navigation 7 |
| ML runtime | `onnxruntime-react-native` |
| Native image ops | Custom Kotlin `ImageTensorModule` + Swift `ImageTensorModule` |
| Persistence | Zustand → AsyncStorage; files on RNFS DocumentDirectory |
| Testing | Jest, RNTL, Maestro (E2E) |
| CI | Gemini, Codecov, SonarCloud |

## Architecture (wildlife pipeline)

See [[on-device-reid-pipeline]] for the full flow. Key service modules:

| Service | Purpose | Path |
|---|---|---|
| `onnxInferenceService` | Detector + embedding ONNX sessions | `src/services/onnxInferenceService/` |
| `wildlifePipeline` | Orchestrate detect → crop → embed → match | `src/services/wildlifePipeline/` |
| `packManager` | Load manifest, index, embeddings.bin from disk | `src/services/packManager/` |
| `embeddingMatchService` | Cosine similarity brute-force top-N | `src/services/embeddingMatchService/` |
| `embeddingDatabaseBuilder` | Merge pack + local individuals for a species | `src/services/embeddingDatabaseBuilder.ts` |
| `wildlifeStore` | Zustand state for packs/observations/locals/sync | `src/stores/wildlifeStore.ts` |

Native modules (both platforms):

- `imageToTensor(uri, w, h, mean, std, scale, channelOrder)` — load → resize → normalize → NCHW Float array
- `cropImage(uri, x, y, w, h, outputPath)` — JPEG crop save (95% q)

## Screens (user flow)

WildlifeHome → Capture (take/pick photo) → pipeline runs → DetectionResults (bboxes) → MatchReview (approve / new-individual / skip) → Observations → Sync (stub).

## What Reused From Off Grid Infrastructure

Background download service, model manager patterns, HuggingFace browser, Zustand + AsyncStorage patterns, theme system, auth (passphrase), navigation, Card/AppSheet/Button/Animated* components.

## What Was Stripped

LLM chat, image generation, voice/Whisper, tool calling, intent classifier, chat UI. See commit `a63d662`.

## Status Snapshot (2026-04-22)

Pipeline is ~70-80% wired end-to-end in code. The **critical missing pieces** are:
- MiewID v4.1 acquisition + wiring ([[miewid-v4]])
- Pack install UX / unzip / checksum
- Preprocessing scale math bug ([[critical-bugs]])
- Pack candidate name/photo resolution in review UI
- GPS + Wildbook sync HTTP client

See [[state-of-implementation]] for the full gap matrix.

## Quality Gates

Pre-commit (Husky, file-scoped): ESLint + tsc + Jest for TS/JS; SwiftLint + `npm run test:ios` for Swift; Kotlin compile + lint + `npm run test:android` for Kotlin.
PR review loop: Gemini bot, Codecov (80% thresholds), SonarCloud.

## References

- `CLAUDE.md` — pre-commit gates, push/PR workflow, CI review loop
- `docs/plans/2026-02-25-wildlife-reid-design.md`
- `docs/plans/2026-02-25-wildlife-reid-implementation.md`
- `docs/WILDLIFE_REID_FEASIBILITY.md`
