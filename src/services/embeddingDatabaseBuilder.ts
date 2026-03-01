import RNFS from 'react-native-fs';
import { packManager } from './packManager';
import type { EmbeddingPack, LocalIndividual } from '../types';
import type { EmbeddingDatabaseEntry } from './embeddingMatchService/types';
import logger from '../utils/logger';

/**
 * Decode a base64 string into a Uint8Array.
 *
 * React Native provides the global `atob` function, so we use it to
 * convert the base64 string returned by RNFS.readFile into raw bytes.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Build a merged embedding database from pack embeddings on disk
 * and local individual embeddings stored in the Zustand store.
 *
 * This is the database passed into `embeddingMatchService.matchEmbedding()`
 * when running the wildlife re-ID pipeline.
 */
export async function buildEmbeddingDatabase(
  species: string,
  packs: EmbeddingPack[],
  localIndividuals: LocalIndividual[],
): Promise<EmbeddingDatabaseEntry[]> {
  const entries: EmbeddingDatabaseEntry[] = [];

  // ---- Pack individuals for matching species --------------------------------
  const matchingPacks = packs.filter((p) => p.species === species);

  for (const pack of matchingPacks) {
    try {
      const individuals = await packManager.loadPackIndex(pack.indexFile);

      // Load binary embeddings file as base64 then decode to Float32Array
      const base64Data = await RNFS.readFile(pack.embeddingsFile, 'base64');
      const bytes = base64ToUint8Array(base64Data);
      const allEmbeddings = new Float32Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength / 4,
      );

      for (const individual of individuals) {
        const embeddings = packManager.getEmbeddingsForIndividual(
          allEmbeddings,
          individual,
          pack.embeddingDim,
        );

        if (embeddings.length > 0) {
          entries.push({
            individualId: individual.id,
            source: 'pack',
            embeddings,
            refPhotoIndex: 0,
          });
        }
      }

      logger.log(
        `[EmbeddingDB] Loaded ${individuals.length} individuals from pack ${pack.id}`,
      );
    } catch (error) {
      // A broken pack should not crash matching — log and continue
      logger.error(
        `[EmbeddingDB] Failed to load pack ${pack.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // ---- Local individuals for matching species -------------------------------
  const matchingLocals = localIndividuals.filter(
    (l) => l.species === species,
  );

  for (const local of matchingLocals) {
    if (local.embeddings.length > 0) {
      entries.push({
        individualId: local.localId,
        source: 'local',
        embeddings: local.embeddings,
        refPhotoIndex: 0,
      });
    }
  }

  logger.log(
    `[EmbeddingDB] Built database for "${species}": ` +
      `${entries.filter((e) => e.source === 'pack').length} pack + ` +
      `${entries.filter((e) => e.source === 'local').length} local entries`,
  );

  return entries;
}
