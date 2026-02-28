export interface EmbeddingDatabaseEntry {
  individualId: string;
  source: 'pack' | 'local';
  embeddings: number[][];
  refPhotoIndex: number;
}
