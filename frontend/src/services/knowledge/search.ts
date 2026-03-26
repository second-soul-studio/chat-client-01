import type { KnowledgeChunk, ScoredChunk } from '@/types';
import { getChunksByCollection, getCollection, getDocumentsByCollection } from '@/services/db';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SearchStrategy {
    search(
        queryEmbedding: Float32Array,
        chunks: KnowledgeChunk[],
        topK: number,
    ): ScoredChunk[];
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

// ─── BruteForceSearch ─────────────────────────────────────────────────────────

export class BruteForceSearch implements SearchStrategy {
    search(
        queryEmbedding: Float32Array,
        chunks: KnowledgeChunk[],
        topK: number,
    ): ScoredChunk[] {
        const scored = chunks.map(chunk => ({
            chunk,
            score: cosineSimilarity(queryEmbedding, chunk.embedding),
            documentName: '',
            collectionName: '',
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
}

// ─── Collection-scoped search ─────────────────────────────────────────────────

export async function searchCollection(
    queryEmbedding: Float32Array,
    collectionId: string,
    topK: number,
): Promise<ScoredChunk[]> {
    const [chunks, collection, documents] = await Promise.all([
        getChunksByCollection(collectionId),
        getCollection(collectionId),
        getDocumentsByCollection(collectionId),
    ]);

    const strategy = new BruteForceSearch();
    const results = strategy.search(queryEmbedding, chunks, topK);

    const collectionName = collection?.name ?? collectionId;
    const docNameById = new Map(documents.map(d => [d.id, d.name]));

    return results.map(r => ({
        ...r,
        documentName: docNameById.get(r.chunk.documentId) ?? r.chunk.documentId,
        collectionName,
    }));
}

// ─── Multi-collection search ──────────────────────────────────────────────────

export async function searchMultipleCollections(
    queryEmbedding: Float32Array,
    collectionIds: string[],
    topK: number,
): Promise<ScoredChunk[]> {
    const perCollection = await Promise.all(
        collectionIds.map(id => searchCollection(queryEmbedding, id, topK)),
    );

    const merged = perCollection.flat();
    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, topK);
}
