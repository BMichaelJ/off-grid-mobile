import type { MatchCandidate } from '../../types';
import type { EmbeddingDatabaseEntry } from './types';

class EmbeddingMatchService {
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  matchEmbedding(
    queryEmbedding: number[],
    database: EmbeddingDatabaseEntry[],
    topN: number,
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];

    for (const entry of database) {
      let bestScore = -Infinity;
      for (const embedding of entry.embeddings) {
        const score = this.cosineSimilarity(queryEmbedding, embedding);
        if (score > bestScore) {
          bestScore = score;
        }
      }

      candidates.push({
        individualId: entry.individualId,
        score: bestScore,
        source: entry.source,
        refPhotoIndex: entry.refPhotoIndex,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topN);
  }
}

export const embeddingMatchService = new EmbeddingMatchService();
