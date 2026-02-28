import { embeddingMatchService } from '../../../src/services/embeddingMatchService';

describe('EmbeddingMatchService', () => {
  it('should export a singleton instance', () => {
    expect(embeddingMatchService).toBeDefined();
    expect(typeof embeddingMatchService.matchEmbedding).toBe('function');
    expect(typeof embeddingMatchService.cosineSimilarity).toBe('function');
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const score = embeddingMatchService.cosineSimilarity(vec, vec);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const score = embeddingMatchService.cosineSimilarity(a, b);
      expect(score).toBeCloseTo(0.0, 5);
    });

    it('should return -1.0 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      const score = embeddingMatchService.cosineSimilarity(a, b);
      expect(score).toBeCloseTo(-1.0, 5);
    });

    it('should handle zero vectors gracefully', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      const score = embeddingMatchService.cosineSimilarity(a, b);
      expect(score).toBe(0);
    });
  });

  describe('matchEmbedding', () => {
    it('should return top-N candidates ranked by score', () => {
      const queryEmbedding = [1, 0, 0, 0];
      const database = [
        { individualId: 'A', source: 'pack' as const, embeddings: [[1, 0, 0, 0]], refPhotoIndex: 0 },
        { individualId: 'B', source: 'pack' as const, embeddings: [[0, 1, 0, 0]], refPhotoIndex: 0 },
        { individualId: 'C', source: 'local' as const, embeddings: [[0.9, 0.1, 0, 0]], refPhotoIndex: 0 },
      ];

      const results = embeddingMatchService.matchEmbedding(queryEmbedding, database, 5);

      expect(results).toHaveLength(3);
      expect(results[0].individualId).toBe('A');
      expect(results[0].score).toBeCloseTo(1.0, 3);
      expect(results[1].individualId).toBe('C');
      expect(results[2].individualId).toBe('B');
    });

    it('should limit results to topN', () => {
      const query = [1, 0];
      const database = [
        { individualId: 'A', source: 'pack' as const, embeddings: [[1, 0]], refPhotoIndex: 0 },
        { individualId: 'B', source: 'pack' as const, embeddings: [[0, 1]], refPhotoIndex: 0 },
        { individualId: 'C', source: 'pack' as const, embeddings: [[0.5, 0.5]], refPhotoIndex: 0 },
      ];

      const results = embeddingMatchService.matchEmbedding(query, database, 2);
      expect(results).toHaveLength(2);
    });

    it('should match best embedding when individual has multiple', () => {
      const query = [1, 0, 0];
      const database = [
        {
          individualId: 'A',
          source: 'pack' as const,
          embeddings: [
            [0, 1, 0],       // poor match
            [0.95, 0.05, 0], // good match
          ],
          refPhotoIndex: 0,
        },
      ];

      const results = embeddingMatchService.matchEmbedding(query, database, 5);
      expect(results[0].score).toBeGreaterThan(0.9);
    });

    it('should return empty array for empty database', () => {
      const results = embeddingMatchService.matchEmbedding([1, 0, 0], [], 5);
      expect(results).toEqual([]);
    });

    it('should include source field in results', () => {
      const database = [
        { individualId: 'A', source: 'pack' as const, embeddings: [[1, 0]], refPhotoIndex: 0 },
        { individualId: 'B', source: 'local' as const, embeddings: [[0, 1]], refPhotoIndex: 0 },
      ];

      const results = embeddingMatchService.matchEmbedding([1, 0], database, 5);
      expect(results[0].source).toBe('pack');
      expect(results[1].source).toBe('local');
    });
  });
});
