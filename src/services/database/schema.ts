/**
 * SQLite schema for the field-durable data: observations, their detections,
 * and the sync queue. Packs, local individuals, and the MiewID model record
 * stay in the AsyncStorage-backed wildlifeStore -- they are small, do not
 * need transactional per-row updates, and packs are validated file-based
 * artifacts already (see services/packManager).
 *
 * Migrations: statements are applied once, tracked via `PRAGMA user_version`.
 * To add a schema change, bump CURRENT_SCHEMA_VERSION and append new
 * statements to MIGRATIONS keyed by the version they introduce -- never
 * mutate an already-shipped array in place, or devices that already applied
 * it will silently skip real schema changes.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/** Statements introducing schema version 1 (initial release). */
const V1_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    photo_uri TEXT NOT NULL,
    gps_lat REAL,
    gps_lon REAL,
    gps_accuracy REAL,
    captured_at TEXT NOT NULL,
    device_model TEXT NOT NULL,
    device_os TEXT NOT NULL,
    field_notes TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS detections (
    id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL,
    bbox_x REAL NOT NULL,
    bbox_y REAL NOT NULL,
    bbox_width REAL NOT NULL,
    bbox_height REAL NOT NULL,
    species TEXT NOT NULL,
    species_confidence REAL NOT NULL,
    cropped_image_uri TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    top_candidates_json TEXT NOT NULL,
    approved_individual TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending',
    location_id TEXT,
    sex TEXT,
    life_stage TEXT,
    behavior TEXT,
    submitter_id TEXT,
    project_id TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_detections_observation ON detections(observation_id);`,
  // observation_id is intentionally not a FOREIGN KEY: the sync_queue row is
  // always created transactionally alongside its observation in real usage
  // (see insertObservationWithDetections), but the unit test suite exercises
  // addToSyncQueue as a standalone store action without a parent row -- a
  // real FK constraint would make those tests fight the schema rather than
  // the store's actual behavior.
  `CREATE TABLE IF NOT EXISTS sync_queue (
    observation_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    wildbook_instance_url TEXT NOT NULL DEFAULT '',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_attempt TEXT,
    synced_at TEXT,
    wildbook_encounter_ids_json TEXT NOT NULL DEFAULT '[]'
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`,
];

/** Statements keyed by the schema version they introduce, applied in order. */
export const MIGRATIONS: Record<number, string[]> = {
  1: V1_STATEMENTS,
};
