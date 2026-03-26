import type { KnowledgeChunk, ScoredChunk } from '@/types';
import { BruteForceSearch } from '@/services/knowledge/search';

interface SearchRequest {
    queryEmbedding: Float32Array;
    chunks: KnowledgeChunk[];
    topK: number;
}

interface SearchResponse {
    results: ScoredChunk[];
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
    const { queryEmbedding, chunks, topK } = event.data;
    const strategy = new BruteForceSearch();
    const results = strategy.search(queryEmbedding, chunks, topK);
    const response: SearchResponse = { results };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(response, [queryEmbedding.buffer]);
};
