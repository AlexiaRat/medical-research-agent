/**
 * In-memory vector store.
 *
 * Why in-memory and not Chroma/Pinecone/Qdrant:
 *   - This agent builds a fresh corpus per question (10-30 papers from
 *     PubMed). The data lives for the duration of one request.
 *   - In-memory + cosine similarity is faster than a network round-trip to
 *     a hosted vector DB for this size.
 *   - The interface is intentionally minimal so swapping in Pinecone or
 *     Qdrant later is a small change (replace `upsert` + `search`).
 *
 * For long-lived, multi-user corpora (e.g. a clinic's internal docs) you'd
 * persist embeddings in Pinecone or Qdrant. The chunking, embedding, and
 * retrieval logic above would stay identical.
 */

import type { PaperChunk, RetrievalResult } from "./types";

export class InMemoryVectorStore {
  private chunks: PaperChunk[] = [];

  upsert(chunks: PaperChunk[]): void {
    this.chunks.push(...chunks);
  }

  size(): number {
    return this.chunks.length;
  }

  /**
   * Find the top-k chunks most similar to `queryEmbedding` by cosine similarity.
   *
   * Cosine similarity is the standard for sentence-embedding retrieval. Voyage
   * embeddings are L2-normalized at the model level, so cosine reduces to dot
   * product. We compute it explicitly anyway to stay correct if the embedding
   * provider ever changes.
   */
  search(queryEmbedding: number[], topK: number): RetrievalResult[] {
    if (this.chunks.length === 0) return [];

    const scored = this.chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Like `search`, but enforces source diversity: never returns more than
   * `maxPerPaper` chunks from the same PMID. Useful when one paper has a
   * very on-topic abstract that would otherwise dominate the results.
   */
  searchDiverse(
    queryEmbedding: number[],
    topK: number,
    maxPerPaper: number = 2,
  ): RetrievalResult[] {
    if (this.chunks.length === 0) return [];

    const scored = this.chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    const perPaperCount = new Map<string, number>();
    const results: RetrievalResult[] = [];

    for (const item of scored) {
      const used = perPaperCount.get(item.chunk.pmid) ?? 0;
      if (used >= maxPerPaper) continue;
      results.push(item);
      perPaperCount.set(item.chunk.pmid, used + 1);
      if (results.length >= topK) break;
    }

    return results;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
