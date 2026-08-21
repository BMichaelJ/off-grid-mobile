# Codex 5.5 — Stage-2-Risk Deep Review

**Date:** 2026-04-24
**Reviewer:** codex-cli 0.121.0, model GPT-5.5 (upgraded same day)
**Scope:** Pre-Stage-2 risk scan of code paths Stage 2 will touch — model lifecycle, pack manager, embedding DB, capture flow, wildlife pipeline, download service.
**Related:** [[miewid-v41-integration-plan]], [[state-of-implementation]], [[critical-bugs]]

## Summary

Two blockers, three highs, three mediums. None in the code I just fixed in PR #11 — all in pre-existing paths that Stage 2 (MiewID download/cache/version-gate) will amplify. Three are architecture-shaped (model lifecycle, pack grouping, download integrity) and need design decisions before implementation.

## Findings (ranked by severity)

### 1. [blocker] No authoritative MiewID version identity

No way to gate `manifest.embeddingModel.version` against the installed MiewID.

- `src/stores/wildlifeStore.ts:22` persists only `miewidModelPath`
- `setMiewidModelPath` at `:162` stores a bare string
- `useCaptureFlow.ts:90` gates only on non-null
- `EmbeddingPack` in `src/types/wildlife.ts:55` flattens only `embeddingModelVersion`, discarding model name + input config

Conflicts with spec's required major/minor behavior (`docs/EMBEDDING_PACK_FORMAT.md:549`).

**Fix:** persist a `MiewIDModelRecord { path, name, version, sha256, sizeBytes, status }`. Verify file existence + hash on hydration. Gate packs/capture by semver — block major mismatch, warn minor mismatch.

### 2. [blocker] Pack integrity not validated before use

- `packManager.loadManifest` and `loadPackIndex` only `JSON.parse` — no schema, `formatVersion`, file existence, checksum, byte-size, or offset validation
- `buildEmbeddingDatabase:43` reads `embeddings.bin` blindly
- `getEmbeddingsForIndividual:33` slices without bounds checks
- Corrupt/truncated pack → short vectors → `cosineSimilarity` reads `undefined` and returns `NaN`

**Fix:** pack install/rehydrate validator checking:
- Manifest schema + supported `formatVersion`
- Required files present
- `RNFS.hash(..., 'sha256')` matches `manifest.checksums`
- `embeddings.bin` size === `embeddingCount * embeddingDim * 4`
- Every individual's offset/count in bounds

Quarantine invalid packs rather than admitting them to `wildlifeStore`.

### 3. [high] Capture config: one per pack, but DB merges all packs per species

- `useCaptureFlow.ts:99` builds one `SpeciesConfig` per pack
- `buildEmbeddingDatabase:37` pulls every pack with that species

→ two horse packs → horse detector runs twice, both runs match the merged DB. Worse, packs with same species but different feature class or different MiewID version get mixed into one embedding space.

**Fix:** group by `{ species, featureClass, detectorModelFile, embeddingModelVersion }` and run one detector per group. Reject/isolate incompatible embedding spaces.

### 4. [high] ONNX session lifecycle is race-prone

- `loadModel:11` checks the map before awaiting `InferenceSession.create` — concurrent callers create duplicate sessions, leaking the first
- `unloadModel:131` can release a session while `runDetection:57` or `extractEmbedding:116` is in flight
- `useCaptureFlow.ts:148` has no concurrency guard against repeated camera/gallery actions

**Fix:** per-path load promises + session states; serialize load/release; operation refcounts or read/write lock so release waits for active inference.

### 5. [high] MiewID-missing = dead-end alert, not recoverable flow

- `useCaptureFlow.ts:90` shows "MiewID model not loaded" and returns
- `App.tsx:85` hydrates stores and initializes packs but never reconciles restored model path with actual file, version, checksum, or active download
- `SettingsScreen.tsx:81` has no MiewID management route

**Fix:** model state machine with `missing | downloading | ready | corrupt | incompatible`. Capture routes to/resumes the required download from the pack manifest. App startup reconciles/resumes any in-flight download.

### 6. [medium] Pipeline discards partial successful work on error

- `wildlifePipeline.processPhoto:24` accumulates detections across species
- Any later detector/MiewID/crop/match error rejects the whole call
- `useCaptureFlow.ts:137` then saves nothing

→ one species succeeds, another fails → user loses all completed detections.

**Fix:** either validate/load MiewID before any detector work, or return `{ detections, errors }` with per-species/per-detection failure annotations so capture can save partial observations with explicit failed statuses.

### 7. [medium] ONNX I/O contracts are assumed, not checked

- `runDetection:50` uses `session.inputNames[0]` and a guessed output name
- Dereferences `outputTensor.data` without existence check
- `extractEmbedding:119` takes first output; never validates embedding length vs pack/model expectations

**Fix:** model descriptors for detector and MiewID v4.1 with expected input/output names, tensor ranks, dtype, embedding dim. Validate at load time with actionable errors.

### 8. [medium] Existing download layer lacks integrity guarantees

- No JS `backgroundDownloadService` under `src/services` — only native modules
- Android `DownloadManagerModule.kt:405`: treats `unknown` DownloadManager row + any non-empty file as completed
- iOS `DownloadManagerModule.swift:890`: saves completed downloads without checksum or HTTP status validation

**Fix:** JS download/cache service that:
- Downloads to a staging path
- Validates HTTP status + expected length + SHA-256
- Atomically moves into the model cache
- Records the verified model record
- Handles retry/backoff and cancellation in JS, not just via native progress events

## Implications for the Stage-2 Integration Plan

These findings reshape Stage 2 significantly. The existing plan in [[miewid-v41-integration-plan]] treats Stage 2 as "add a download service + wire the path." Reality: Stage 2 needs a model *state machine* (finding 5), a *version identity record* (finding 1), and a *pack validator* (finding 2) before any download work is meaningful — findings 3, 4, 7, 8 are correctness/robustness wins that should land alongside.

### Revised Stage 2 sub-stages

- **2.1 — Model record + state machine.** Define `MiewIDModelRecord`, states `missing|downloading|ready|corrupt|incompatible`, persist in `wildlifeStore`. Reconcile on startup.
- **2.2 — Pack validator.** Schema check, checksum verify, byte-size verify, offset-bounds verify. Quarantine invalid packs. Errors flow to new "broken packs" Settings section.
- **2.3 — JS download service.** Wrap native downloads with staging + HTTP status check + SHA-256 + atomic move + retry/backoff. Used by both MiewID and pack download.
- **2.4 — Pack grouping + compatibility check.** Group packs by `{species, featureClass, detectorModelFile, embeddingModelVersion}` for capture. Reject mixing incompatible embedding spaces.
- **2.5 — Lifecycle hardening.** Per-path load-promise dedup in `onnxInferenceService`; release waits for active inference via refcount.
- **2.6 — Partial-success observations.** `processPhoto` returns `{detections, errors}`; capture saves partial observations with per-detection failure flags.
- **2.7 — Model descriptors + I/O contract validation** at session load time.
- **2.8 — Settings UX** for MiewID management + broken-pack recovery.

### Suggested order

Land 2.1 + 2.2 + 2.3 as a trio (they're interdependent and form the foundation). Then 2.4 (capture flow), then 2.5-2.7 as parallel hardening. 2.8 last.

## Note on Scope

Codex explicitly skipped what was fixed in PR #11 (native scale multiply, TS wrapper `1/255`, `DEFAULT_DETECTOR_CONFIG` fallback, stub `MatchReviewScreen.tsx` removal). Focus here is genuinely pre-existing latent issues.

## Source

Full codex output archived at `/tmp/claude-1000/-mnt-c-off-grid-mobile/.../bhuoqrwdt.output` (transient; this file is the durable record).
