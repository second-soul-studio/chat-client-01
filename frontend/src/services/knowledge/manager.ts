import type { KnowledgeCollection, KnowledgeDocument, KnowledgeChunk } from '@/types';
import {
    getCollection,
    saveCollection,
    deleteCollection as dbDeleteCollection,
    getDocument,
    saveDocument,
    deleteDocument as dbDeleteDocument,
    deleteDocumentsByCollection,
    saveChunks,
    deleteChunksByDocument,
    deleteChunksByCollection,
    getDocumentsByCollection,
} from '@/services/db';
import { chunkDocument } from './chunker';
import { embedBatch } from './embeddings';

// ─── Collections ──────────────────────────────────────────────────────────────

export async function createCollection(
    data: Omit<KnowledgeCollection, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<KnowledgeCollection> {
    const now = new Date();
    const collection: KnowledgeCollection = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };
    await saveCollection(collection);
    return collection;
}

export async function updateCollection(
    id: string,
    data: Partial<KnowledgeCollection>,
): Promise<void> {
    const existing = await getCollection(id);
    if (!existing) throw new Error(`Collection not found: ${id}`);
    await saveCollection({ ...existing, ...data, id, updatedAt: new Date() });
}

export async function deleteCollection(id: string): Promise<void> {
    await deleteChunksByCollection(id);
    await deleteDocumentsByCollection(id);
    await dbDeleteCollection(id);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function addDocument(
    collectionId: string,
    name: string,
    content: string,
): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
        id: crypto.randomUUID(),
        collectionId,
        name,
        content,
        chunkCount: 0,
        status: 'pending',
        createdAt: new Date(),
    };
    await saveDocument(doc);
    // Fire-and-forget; callers can poll document.status
    indexDocument(doc.id).catch(() => {
        // Error is persisted on the document itself
    });
    return doc;
}

export async function indexDocument(documentId: string): Promise<void> {
    const doc = await getDocument(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const collection = await getCollection(doc.collectionId);
    if (!collection) throw new Error(`Collection not found: ${doc.collectionId}`);

    // Mark as indexing so the UI can show a spinner
    await saveDocument({ ...doc, status: 'pending' });

    try {
        const rawChunks = chunkDocument(doc.content, collection.chunkSize, collection.chunkOverlap);

        const texts = rawChunks.map(c => c.content);
        const embeddings = await embedBatch(
            texts,
            collection.embeddingProviderId,
            collection.embeddingModelSlug,
        );

        const chunks: KnowledgeChunk[] = rawChunks.map((c, i) => ({
            id: crypto.randomUUID(),
            documentId: doc.id,
            collectionId: doc.collectionId,
            content: c.content,
            embedding: embeddings[i],
            startOffset: c.startOffset,
            endOffset: c.endOffset,
        }));

        await saveChunks(chunks);
        await saveDocument({ ...doc, status: 'indexed', chunkCount: chunks.length });

        // Keep collection.updatedAt fresh
        await saveCollection({ ...collection, updatedAt: new Date() });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await saveDocument({ ...doc, status: 'error', errorMessage: message });
        throw err;
    }
}

export async function reindexCollection(collectionId: string): Promise<void> {
    await deleteChunksByCollection(collectionId);
    const documents = await getDocumentsByCollection(collectionId);
    for (const doc of documents) {
        // Sequential to avoid hammering the embedding endpoint
        // eslint-disable-next-line no-await-in-loop
        await indexDocument(doc.id);
    }
}

export async function deleteDocument(documentId: string): Promise<void> {
    const doc = await getDocument(documentId);
    if (!doc) return;

    await deleteChunksByDocument(documentId);
    await dbDeleteDocument(documentId);

    // Update the collection's chunk count
    const collection = await getCollection(doc.collectionId);
    if (collection) {
        const remaining = await getDocumentsByCollection(doc.collectionId);
        const totalChunks = remaining.reduce((sum, d) => sum + d.chunkCount, 0);
        await saveCollection({ ...collection, updatedAt: new Date() });
        // The chunkCount on the collection itself is not tracked; per-document is the source of truth.
        void totalChunks; // suppress unused-variable lint
    }
}
