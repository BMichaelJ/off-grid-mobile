# State of Implementation (2026-04-22)

**Category:** meta
**Sources:** [[codebase-map]], [[codex-review-2026-04-22]], git log, direct source reads
**Related:** [[off-grid-mobile-app]], [[on-device-reid-pipeline]], [[critical-bugs]], [[miewid-v41-integration-plan]]
**Last updated:** 2026-04-22

## Snapshot

Pipeline is **~70-80% wired end-to-end in code**. Architecture is sound; most shortcomings are *unimplemented glue* rather than *wrong foundations*. The biggest single blocker is that MiewID is never actually loaded, followed by two preprocessing bugs that would silently degrade accuracy even once it is.

## Matrix

| Layer | Status | Notes |
|---|---|---|
| ONNX inference (ORT RN) | ✅ Real | Detector + generic embedding API |
| Native image preprocessing | ⚠️ Real but buggy | See [[critical-bugs]] Bug 1 + 2 |
| Detection postprocessing / NMS | ✅ Real | YOLOv8/11 only — see [[yolo-postprocessing]] |
| Embedding extraction | ⚠️ Code exists | Model never installed in practice |
| Vector matching | ✅ Real | Cosine brute-force, OK for < 5K individuals |
| Pack loading | ✅ Real | Manifest + index + embeddings.bin |
| Observation storage | ✅ Real | Zustand + AsyncStorage |
| Local individual management | ✅ Real | Accumulates embeddings on re-sighting |
| Match review UI | ⚠️ Partial | Pack IDs shown as raw strings — name/photo TODO |
| Detector model path | ⚠️ | Loaded from pack manifest; no auto-download |
| **MiewID model path** | ❌ | **Never populated**; setter exists but no caller |
| Pack install UX (.zip import) | ❌ | `packManager.initialize()` just mkdirs |
| Pack version check | ❌ | `embeddingModel.version` unenforced |
| Checksum verification | ❌ | `manifest.checksums` ignored |
| Geolocation | ❌ Stub | `useCaptureFlow` returns null |
| Wildbook sync (HTTP) | ❌ Stub | Queue exists, no client |
| Model download retry / timeout | ❌ | No exponential backoff, no hang guard |
| Golden parity test (Python ↔ device) | ❌ | Needed before trusting accuracy |

## Where Work Should Go Next

Ordered by leverage for the stated goal (on-app re-ID with MiewID v4.1):

1. **Fix preprocessing bugs + add parity test.** Foundation for everything else. See [[critical-bugs]].
2. **MiewID v4.1 acquisition flow.** Export → upload → app-side download/verify/cache/version-gate. See [[model-acquisition]], [[miewid-v41-integration-plan]].
3. **Pack install UX.** .zip → unzip → checksum → register.
4. **Resolve pack candidate names/photos in review UI.** Field-usability unlock.
5. **Sync client** (can trail re-ID goal, but needed for real-world usage).

## Non-Gaps (Already Strong)

- Service layering, separation of concerns
- Native Kotlin/Swift parity for image ops (once scale fix lands)
- Test coverage on unit + integration layers
- Typed state model (`src/types/wildlife.ts`)
- Commit discipline (see git log since `7704aed`)

## Licensing / External Blocker

MiewID weights have no explicit OSS license (`docs/WILDLIFE_REID_FEASIBILITY.md:27,109`). Resolve with Conservation X Labs before distribution.
