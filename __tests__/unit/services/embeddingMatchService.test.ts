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

    it('should skip reference embeddings whose dimension differs from the query', () => {
      const database = [
        {
          individualId: 'short-ref',
          source: 'local' as const,
          embeddings: [[1]], // wrong dimension — must not produce a score
          refPhotoIndex: 0,
        },
        {
          individualId: 'good-ref',
          source: 'pack' as const,
          embeddings: [[1, 0, 0]],
          refPhotoIndex: 0,
        },
      ];

      const results = embeddingMatchService.matchEmbedding([1, 0, 0], database, 5);

      expect(results).toHaveLength(1);
      expect(results[0].individualId).toBe('good-ref');
      expect(Number.isFinite(results[0].score)).toBe(true);
    });

    it('should keep an individual if at least one of its embeddings is valid', () => {
      const database = [
        {
          individualId: 'mixed',
          source: 'pack' as const,
          embeddings: [[1], [0.9, 0.1, 0]], // one bad, one good
          refPhotoIndex: 0,
        },
      ];

      const results = embeddingMatchService.matchEmbedding([1, 0, 0], database, 5);

      expect(results).toHaveLength(1);
      expect(Number.isFinite(results[0].score)).toBe(true);
    });

    it('should never emit NaN scores for malformed references', () => {
      const database = [
        {
          individualId: 'bad',
          source: 'pack' as const,
          embeddings: [[1, 0, 0, 0, 0]], // longer than query
          refPhotoIndex: 0,
        },
      ];

      const results = embeddingMatchService.matchEmbedding([1, 0, 0], database, 5);

      expect(results).toEqual([]);
    });
  });
});
