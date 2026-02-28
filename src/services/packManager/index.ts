import RNFS from 'react-native-fs';
import type { EmbeddingPackManifest, PackIndividual } from '../../types';
import type { PackIndexFile } from './types';
import logger from '../../utils/logger';

const PACKS_DIR = `${RNFS.DocumentDirectoryPath}/embedding_packs`;

class PackManager {
  async initialize(): Promise<void> {
    const exists = await RNFS.exists(PACKS_DIR);
    if (!exists) {
      await RNFS.mkdir(PACKS_DIR);
    }
    logger.log('[PackManager] Initialized packs directory');
  }

  async loadPackIndex(indexFilePath: string): Promise<PackIndividual[]> {
    const content = await RNFS.readFile(indexFilePath, 'utf8');
    const parsed: PackIndexFile = JSON.parse(content);
    return parsed.individuals;
  }

  async loadManifest(manifestPath: string): Promise<EmbeddingPackManifest> {
    const content = await RNFS.readFile(manifestPath, 'utf8');
    return JSON.parse(content);
  }

  getEmbeddingsForIndividual(
    allEmbeddings: Float32Array,
    individual: PackIndividual,
    embeddingDim: number,
  ): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < individual.embeddingCount; i++) {
      const start = (individual.embeddingOffset + i) * embeddingDim;
      const vec = Array.from(allEmbeddings.slice(start, start + embeddingDim));
      result.push(vec);
    }
    return result;
  }

  async deletePack(packDir: string): Promise<void> {
    const exists = await RNFS.exists(packDir);
    if (exists) {
      await RNFS.unlink(packDir);
      logger.log(`[PackManager] Deleted pack: ${packDir}`);
    }
  }

  getPacksDir(): string {
    return PACKS_DIR;
  }
}

export const packManager = new PackManager();
