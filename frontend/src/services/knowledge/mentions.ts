import type { KnowledgeCollection } from '@/types';

/**
 * Extracts collection names from #mention tokens in the given text.
 * e.g. "tell me about #my-notes and #project-docs" → ['my-notes', 'project-docs']
 */
export function parseCollectionMentions(text: string): string[] {
    const matches = [...text.matchAll(/#([\w-]+)/g)];
    return matches.map(m => m[1]);
}

/**
 * Case-insensitive match of names against collection.name.
 * Returns all collections whose name is in the given list.
 */
export function resolveCollectionsByName(
    names: string[],
    collections: KnowledgeCollection[],
): KnowledgeCollection[] {
    const lowerNames = new Set(names.map(n => n.toLowerCase()));
    return collections.filter(c => lowerNames.has(c.name.toLowerCase()));
}
