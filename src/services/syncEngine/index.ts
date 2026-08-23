import RNFS from 'react-native-fs';
import { GANESHA_PROJECT_ID } from '../../config/ganeshaApi';
import { ganeshaApiClient } from '../ganeshaApiClient';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import type { Detection, Observation } from '../../types';
import logger from '../../utils/logger';
import type { SyncAllResult, SyncObservationResult } from './types';

/**
 * Drains the local, durable (SQLite-backed) sync queue into the Ganesha
 * backend: uploads each reviewed detection's cropped photo to Blob Storage,
 * then POSTs the match decision to `POST /projects/{project_id}/submissions`
 * (backend/function_app.py `submit_field_observation`).
 *
 * What actually gets submitted, and why -- read before changing this file:
 *
 * - An observation can hold several detections (several elephants in one
 *   photo), each reviewed independently and asynchronously (capture and
 *   review are separate steps -- MatchReviewScreen). `sync_queue` only
 *   tracks one coarse status per *observation*, so an observation is only
 *   considered ready once none of its detections are still
 *   `reviewStatus: 'pending'` -- see `isReadyToSync`. A still-pending
 *   detection is not an error, just not decided yet; the observation is
 *   left alone (sync_queue untouched) until the next sync attempt.
 * - Only detections approved against a real *pack* individual are
 *   submitted. Approving "No Match" on-device mints a brand-new
 *   *local-only* field id (e.g. `FIELD-001`) for an individual that isn't
 *   in the central catalog yet -- the backend has no concept of an
 *   uncataloged individual, and `elephantId` is required, so submitting a
 *   local-only id would silently pollute Cosmos DB with a string no
 *   researcher can resolve. These stay un-submitted indefinitely until a
 *   researcher formally catalogs them some other way; see `isPackMatch`.
 * - Per-detection `ganeshaSubmissionId` (schema v2) makes retries
 *   idempotent: if an observation has 3 eligible detections and the 2nd
 *   upload fails, the 1st's submission id is already persisted, so retrying
 *   only resubmits the 2nd and 3rd, never duplicates the 1st.
 */

const MAX_RETRIES_BEFORE_PERMANENT_FAILURE = 5;

function isPackMatch(detection: Detection): boolean {
  const { approvedIndividual, topCandidates } = detection.matchResult;
  if (!approvedIndividual) {
    return false;
  }
  return topCandidates.some(
    (candidate) => candidate.individualId === approvedIndividual && candidate.source === 'pack',
  );
}

function eligibleDetections(observation: Observation): Detection[] {
  return observation.detections.filter(
    (detection) =>
      detection.matchResult.reviewStatus === 'approved' &&
      !detection.ganeshaSubmissionId &&
      isPackMatch(detection),
  );
}

function allSubmissionIds(observation: Observation): string[] {
  return observation.detections
    .map((detection) => detection.ganeshaSubmissionId)
    .filter((id): id is string => id !== null);
}

async function uploadDetectionPhoto(detection: Detection): Promise<{ blobUrl: string }> {
  const uploadUrlResult = await ganeshaApiClient.getUploadUrl(GANESHA_PROJECT_ID, `${detection.id}.jpg`);
  if (!uploadUrlResult.ok) {
    throw new Error(`upload-url request failed: ${uploadUrlResult.message}`);
  }

  // NOT `fetch(uri).blob()` -- React Native's fetch routes through the native
  // OkHttp networking stack on Android, which does not support the `file://`
  // scheme (produces a misleading "Network request failed", not a clear
  // "unsupported scheme" error). RNFS.uploadFiles streams the file directly
  // from disk; `binaryStreamOnly: true` sends the raw file bytes as the
  // request body with no multipart wrapping, matching Azure Blob's PUT Blob
  // contract (which requires the body to be exactly the blob's bytes).
  let uploadResult: { statusCode: number };
  try {
    const { promise } = RNFS.uploadFiles({
      toUrl: uploadUrlResult.data.uploadUrl,
      method: 'PUT',
      binaryStreamOnly: true,
      files: [
        {
          name: 'file',
          filename: `${detection.id}.jpg`,
          filepath: detection.croppedImageUri,
          filetype: 'image/jpeg',
        },
      ],
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'image/jpeg',
      },
    });
    uploadResult = await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`blob upload failed: ${message}`);
  }

  if (uploadResult.statusCode < 200 || uploadResult.statusCode >= 300) {
    throw new Error(`blob upload failed: HTTP ${uploadResult.statusCode}`);
  }

  return { blobUrl: uploadUrlResult.data.blobUrl };
}

async function submitDetection(observation: Observation, detection: Detection): Promise<string> {
  const { blobUrl } = await uploadDetectionPhoto(detection);
  const approvedCandidate = detection.matchResult.topCandidates.find(
    (candidate) => candidate.individualId === detection.matchResult.approvedIndividual,
  );

  const submitResult = await ganeshaApiClient.submitObservation(GANESHA_PROJECT_ID, {
    imageUrl: blobUrl,
    // isPackMatch() (checked by the caller, eligibleDetections()) guarantees
    // approvedIndividual is set whenever a detection reaches this point.
    elephantId: detection.matchResult.approvedIndividual as string,
    confidence: approvedCandidate?.score ?? null,
    alternatives: detection.matchResult.topCandidates,
    lat: observation.gps?.lat ?? null,
    long: observation.gps?.lon ?? null,
    observationDate: observation.timestamp,
    observationNotes: observation.fieldNotes,
    captureTimestamp: observation.timestamp,
    deviceModel: observation.deviceInfo.model,
    deviceOs: observation.deviceInfo.os,
  });

  if (!submitResult.ok) {
    throw new Error(`submission request failed: ${submitResult.message}`);
  }
  return submitResult.data.submissionId;
}

/**
 * Attempts to sync one observation. Safe to call repeatedly (e.g. on every
 * "Sync All" tap, or a reconnect) -- already-submitted detections and
 * already-`synced` observations are cheap no-ops.
 */
export async function syncObservation(observation: Observation): Promise<SyncObservationResult> {
  const store = useWildlifeStore.getState();
  const observationId = observation.id;

  const hasUnreviewedDetections = observation.detections.some(
    (detection) => detection.matchResult.reviewStatus === 'pending',
  );
  if (hasUnreviewedDetections) {
    return { observationId, status: 'waiting-for-review' };
  }

  const toSubmit = eligibleDetections(observation);
  if (toSubmit.length === 0) {
    // Either every eligible detection was already submitted on a prior
    // attempt, or none are eligible yet (all rejected / all local-only) --
    // either way, there is nothing left this sync engine can do right now.
    const currentItem = useWildlifeStore.getState().syncQueue.find((item) => item.observationId === observationId);
    if (currentItem && currentItem.status !== 'synced') {
      await store.updateSyncStatus(observationId, {
        status: 'synced',
        syncedAt: new Date().toISOString(),
        wildbookEncounterIds: allSubmissionIds(observation),
        lastError: null,
      });
    }
    return { observationId, status: 'synced', submittedCount: 0 };
  }

  await store.updateSyncStatus(observationId, { status: 'uploading' });

  let submittedCount = 0;
  for (const detection of toSubmit) {
    try {
      const submissionId = await submitDetection(observation, detection);
      await store.updateDetection(observationId, detection.id, { ganeshaSubmissionId: submissionId });
      submittedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[SyncEngine] Failed to sync detection ${detection.id} of observation ${observationId}: ${message}`);

      // Read fresh, current state for the retry count -- `store` above is a
      // snapshot from function entry, taken before this function's own
      // 'uploading' status write, and must not be reused for reads here.
      const currentItem = useWildlifeStore.getState().syncQueue.find((item) => item.observationId === observationId);
      const retryCount = (currentItem?.retryCount ?? 0) + 1;
      await store.updateSyncStatus(observationId, {
        status: retryCount >= MAX_RETRIES_BEFORE_PERMANENT_FAILURE ? 'failedPermanent' : 'failed',
        retryCount,
        lastError: message,
        lastAttempt: new Date().toISOString(),
      });
      return { observationId, status: 'failed', submittedCount, message };
    }
  }

  // Re-read the observation from the store after the loop above -- `store`
  // (and the `observation` parameter) were both captured before this
  // function's own updateDetection() calls, so their `.detections` are now
  // stale; a fresh getState() reflects every id just written.
  const refreshedObservation =
    useWildlifeStore.getState().observations.find((obs) => obs.id === observationId) ?? observation;
  await store.updateSyncStatus(observationId, {
    status: 'synced',
    syncedAt: new Date().toISOString(),
    wildbookEncounterIds: allSubmissionIds(refreshedObservation),
    lastError: null,
  });

  return { observationId, status: 'synced', submittedCount };
}

/**
 * Syncs every observation currently queued (status `pending` or `failed`),
 * sequentially -- not in parallel, since field connectivity is often a
 * single flaky link and a batch of concurrent uploads would just contend
 * with each other. Skips observations already `uploading` (a sync is
 * already in flight for them) or `synced`.
 */
export async function syncAllObservations(): Promise<SyncAllResult> {
  const result: SyncAllResult = { synced: 0, uploaded: 0, waitingForReview: 0, failed: 0 };
  const { observations, syncQueue } = useWildlifeStore.getState();

  const queued = syncQueue.filter((item) => item.status === 'pending' || item.status === 'failed' || item.status === 'failedPermanent');

  for (const queueItem of queued) {
    const observation = observations.find((obs) => obs.id === queueItem.observationId);
    if (!observation) {
      continue;
    }
    const outcome = await syncObservation(observation);
    if (outcome.status === 'synced') {
      result.synced += 1;
      result.uploaded += outcome.submittedCount;
    } else if (outcome.status === 'waiting-for-review') {
      result.waitingForReview += 1;
    } else {
      result.failed += 1;
      result.uploaded += outcome.submittedCount;
    }
  }

  return result;
}

export type { SyncAllResult, SyncObservationResult, SyncObservationOutcome } from './types';
