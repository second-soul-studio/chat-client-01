import type { ScoredChunk } from '@/types';
import { countTokens } from '@/services/tokenCount';

/**
 * Builds the RAG context string from scored chunks.
 *
 * Iterates chunks (assumed sorted by score desc), wraps each in an XML <source>
 * tag, and stops when the token budget would be exceeded.
 * Substitutes the {{chunks}} placeholder in the provided template.
 *
 * Returns an empty string when chunks is empty — callers should skip injection.
 */
export function formatKnowledgeContext(
    chunks: ScoredChunk[],
    template: string,
    tokenBudget: number,
): string {
    if (chunks.length === 0) return '';

    const sources: string[] = [];
    let usedTokens = 0;

    for (let i = 0; i < chunks.length; i++) {
        const { chunk, collectionName, documentName } = chunks[i];
        const source = `<source id="${i + 1}" collection="${collectionName}" document="${documentName}">\n${chunk.content}\n</source>`;
        const sourceTokens = countTokens(source);
        if (usedTokens + sourceTokens > tokenBudget) break;
        sources.push(source);
        usedTokens += sourceTokens;
    }

    if (sources.length === 0) return '';

    return template.replace('{{chunks}}', sources.join('\n'));
}
