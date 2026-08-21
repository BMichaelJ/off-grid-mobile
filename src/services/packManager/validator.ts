import RNFS from 'react-native-fs';
import type { EmbeddingPackManifest, PackIndividual } from '../../types';
import type { PackIndexFile } from './types';

export type PackValidationErrorCode =
  | 'manifest-missing'
  | 'manifest-unparseable'
  | 'manifest-schema'
  | 'unsupported-format-version'
  | 'file-missing'
  | 'checksum-mismatch'
  | 'embeddings-size-mismatch'
  | 'index-unparseable'
  | 'index-out-of-bounds';

export interface PackValidationError {
  code: PackValidationErrorCode;
  detail: string;
}

export type PackValidationResult =
  | { ok: true; manifest: EmbeddingPackManifest; individuals: PackIndividual[] }
  | { ok: false; errors: PackValidationError[] };

export interface ValidatePackOptions {
  /**
   * Skip SHA-256 verification. Used for cheap startup re-validation of packs
   * that already passed a full check — existence, size, and bounds checks
   * still run.
   */
  skipChecksums?: boolean;
}

/** Pack format major versions this app can parse. */
const SUPPORTED_FORMAT_MAJOR_VERSIONS = [1];

const BYTES_PER_FLOAT32 = 4;

const isNonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

const isCount = (value: unknown): boolean =>
  typeof value === 'number' && value >= 0;

const isNumberTuple = (value: unknown, length: number): boolean =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((v) => typeof v === 'number');

const getPath = (obj: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined,
    obj,
  );

/**
 * Structural checks for the manifest, table-driven. Hand-rolled — the
 * project has no runtime schema dependency, and the field set is small and
 * stable (docs/EMBEDDING_PACK_FORMAT.md).
 */
const MANIFEST_SCHEMA_CHECKS: Array<{
  path: string[];
  check: (value: unknown) => boolean;
}> = [
  { path: ['formatVersion'], check: isNonEmptyString },
  { path: ['species'], check: isNonEmptyString },
  { path: ['featureClass'], check: isNonEmptyString },
  { path: ['displayName'], check: isNonEmptyString },
  { path: ['individualCount'], check: isCount },
  { path: ['embeddingCount'], check: isCount },
  {
    path: ['embeddingDim'],
    check: (v) => typeof v === 'number' && v > 0,
  },
  { path: ['embeddingModel', 'name'], check: isNonEmptyString },
  { path: ['embeddingModel', 'version'], check: isNonEmptyString },
  {
    path: ['embeddingModel', 'inputSize'],
    check: (v) => isNumberTuple(v, 2),
  },
  {
    path: ['embeddingModel', 'normalize', 'mean'],
    check: (v) => isNumberTuple(v, 3),
  },
  {
    path: ['embeddingModel', 'normalize', 'std'],
    check: (v) => isNumberTuple(v, 3),
  },
  { path: ['detectorModel', 'filename'], check: isNonEmptyString },
  { path: ['detectorModel', 'configFile'], check: isNonEmptyString },
];

function findManifestSchemaErrors(manifest: unknown): string[] {
  return MANIFEST_SCHEMA_CHECKS.filter(
    ({ path, check }) => !check(getPath(manifest, path)),
  ).map(({ path }) => `missing or invalid '${path.join('.')}'`);
}

/**
 * Resolve a manifest-relative file reference to an absolute path inside the
 * pack. `manifest.checksums` keys and `detectorModel.filename` are bare
 * filenames whose location follows the pack layout convention
 * (embeddings/, models/, config/); explicit relative paths pass through.
 */
async function resolvePackFile(
  packDir: string,
  name: string,
): Promise<string | null> {
  const candidates = name.includes('/')
    ? [`${packDir}/${name}`]
    : [
        `${packDir}/${name}`,
        `${packDir}/embeddings/${name}`,
        `${packDir}/models/${name}`,
        `${packDir}/config/${name}`,
      ];
  for (const candidate of candidates) {
    if (await RNFS.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Accumulates errors, deduplicating file-missing reports by filename. */
class ErrorCollector {
  readonly errors: PackValidationError[] = [];
  private readonly missingReported = new Set<string>();

  push(code: PackValidationErrorCode, detail: string): void {
    this.errors.push({ code, detail });
  }

  reportMissing(name: string): void {
    if (!this.missingReported.has(name)) {
      this.missingReported.add(name);
      this.errors.push({ code: 'file-missing', detail: name });
    }
  }
}

/** Load + parse + schema-check the manifest; errors here end validation. */
async function loadManifestChecked(
  packDir: string,
): Promise<
  { manifest: EmbeddingPackManifest } | { errors: PackValidationError[] }
> {
  const manifestPath = `${packDir}/manifest.json`;
  if (!(await RNFS.exists(manifestPath))) {
    return { errors: [{ code: 'manifest-missing', detail: manifestPath }] };
  }

  let manifest: EmbeddingPackManifest;
  try {
    manifest = JSON.parse(await RNFS.readFile(manifestPath, 'utf8'));
  } catch (error) {
    return {
      errors: [
        {
          code: 'manifest-unparseable',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const schemaErrors = findManifestSchemaErrors(manifest);
  if (schemaErrors.length > 0) {
    return {
      errors: schemaErrors.map((detail) => ({
        code: 'manifest-schema' as const,
        detail,
      })),
    };
  }
  return { manifest };
}

async function checkEmbeddingsSize(
  embeddingsPath: string,
  manifest: EmbeddingPackManifest,
  collector: ErrorCollector,
): Promise<void> {
  const expectedBytes =
    manifest.embeddingCount * manifest.embeddingDim * BYTES_PER_FLOAT32;
  const stat = await RNFS.stat(embeddingsPath);
  const actualBytes = Number(stat.size);
  if (actualBytes !== expectedBytes) {
    collector.push(
      'embeddings-size-mismatch',
      `embeddings.bin is ${actualBytes} bytes, expected ${expectedBytes} (${manifest.embeddingCount} × ${manifest.embeddingDim} × 4)`,
    );
  }
}

async function verifyChecksums(
  packDir: string,
  checksums: Record<string, string>,
  collector: ErrorCollector,
): Promise<void> {
  for (const [filename, declared] of Object.entries(checksums)) {
    const filePath = await resolvePackFile(packDir, filename);
    if (!filePath) {
      // A checksum entry for an absent file is a defect worth surfacing,
      // but required files are already reported — don't duplicate.
      collector.reportMissing(filename);
      continue;
    }
    const expected = declared.replace(/^sha256:/i, '').toLowerCase();
    const actual = (await RNFS.hash(filePath, 'sha256')).toLowerCase();
    if (actual !== expected) {
      collector.push(
        'checksum-mismatch',
        `${filename}: expected ${expected}, found ${actual}`,
      );
    }
  }
}

function isIndividualRangeValid(
  individual: PackIndividual,
  totalEmbeddings: number,
): boolean {
  const { embeddingOffset, embeddingCount } = individual;
  return (
    Number.isInteger(embeddingOffset) &&
    Number.isInteger(embeddingCount) &&
    embeddingOffset >= 0 &&
    embeddingCount >= 0 &&
    embeddingOffset + embeddingCount <= totalEmbeddings
  );
}

async function checkIndex(
  indexPath: string,
  manifest: EmbeddingPackManifest,
  collector: ErrorCollector,
): Promise<PackIndividual[]> {
  let parsed: PackIndexFile;
  try {
    parsed = JSON.parse(await RNFS.readFile(indexPath, 'utf8'));
  } catch (error) {
    collector.push(
      'index-unparseable',
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }

  if (!Array.isArray(parsed.individuals)) {
    collector.push('index-unparseable', "index.json has no 'individuals' array");
    return [];
  }

  for (const individual of parsed.individuals) {
    if (!isIndividualRangeValid(individual, manifest.embeddingCount)) {
      collector.push(
        'index-out-of-bounds',
        `individual ${individual.id}: offset ${individual.embeddingOffset} + count ${individual.embeddingCount} exceeds embeddingCount ${manifest.embeddingCount}`,
      );
    }
  }
  return parsed.individuals;
}

/**
 * Validate a pack directory against the pack format spec before admitting it
 * to the store. Errors accumulate (short-circuiting only when the manifest
 * itself is unreadable, since every later check depends on it).
 */
export async function validatePack(
  packDir: string,
  opts: ValidatePackOptions = {},
): Promise<PackValidationResult> {
  const loaded = await loadManifestChecked(packDir);
  if ('errors' in loaded) {
    return { ok: false, errors: loaded.errors };
  }
  const { manifest } = loaded;
  const collector = new ErrorCollector();

  const formatMajor = Number(manifest.formatVersion.split('.')[0]);
  if (!SUPPORTED_FORMAT_MAJOR_VERSIONS.includes(formatMajor)) {
    collector.push(
      'unsupported-format-version',
      `formatVersion ${manifest.formatVersion} (supported majors: ${SUPPORTED_FORMAT_MAJOR_VERSIONS.join(', ')})`,
    );
  }

  // Required files
  const embeddingsPath = await resolvePackFile(packDir, 'embeddings.bin');
  const indexPath = await resolvePackFile(packDir, 'index.json');
  const requiredNames = [
    ['embeddings.bin', embeddingsPath],
    ['index.json', indexPath],
    [
      manifest.detectorModel.filename,
      await resolvePackFile(packDir, manifest.detectorModel.filename),
    ],
    [
      manifest.detectorModel.configFile,
      await resolvePackFile(packDir, manifest.detectorModel.configFile),
    ],
  ] as const;
  for (const [name, path] of requiredNames) {
    if (!path) {
      collector.reportMissing(name);
    }
  }

  if (embeddingsPath) {
    await checkEmbeddingsSize(embeddingsPath, manifest, collector);
  }

  if (!opts.skipChecksums && manifest.checksums) {
    await verifyChecksums(packDir, manifest.checksums, collector);
  }

  const individuals = indexPath
    ? await checkIndex(indexPath, manifest, collector)
    : [];

  if (collector.errors.length > 0) {
    return { ok: false, errors: collector.errors };
  }
  return { ok: true, manifest, individuals };
}
