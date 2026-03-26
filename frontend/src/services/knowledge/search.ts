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

// ─── Worker-based search ──────────────────────────────────────────────────────

// Threshold above which the Worker path is used
export const WORKER_CHUNK_THRESHOLD = 2000;

export function searchWithWorker(
    queryEmbedding: Float32Array,
    chunks: KnowledgeChunk[],
    topK: number,
): Promise<ScoredChunk[]> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL('../../workers/knowledgeSearch.worker.ts', import.meta.url),
            { type: 'module' },
        );

        worker.onmessage = (event: MessageEvent<{ results: ScoredChunk[] }>) => {
            worker.terminate();
            resolve(event.data.results);
        };

        worker.onerror = (error: ErrorEvent) => {
            worker.terminate();
            reject(error);
        };

        worker.postMessage({ queryEmbedding, chunks, topK });
    });
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

    const results =
        chunks.length > WORKER_CHUNK_THRESHOLD
            ? await searchWithWorker(queryEmbedding, chunks, topK)
            : new BruteForceSearch().search(queryEmbedding, chunks, topK);

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
