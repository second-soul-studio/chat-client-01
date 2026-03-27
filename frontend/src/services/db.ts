import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Chat, Persona, AppSettings, ToolConfig, MemoryPendingEntry, MemoryTopic, MemoryMeta, KnowledgeCollection, KnowledgeDocument, KnowledgeChunk, KnowledgeSettings } from '@/types';
import { DEFAULT_RAG_PROMPT_TEMPLATE } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
import type { FetchedModel } from '@/services/modelMeta/types';
import defaultProviders from '@/data/providers.default.json';
import defaultModels from '@/data/models.default.json';

interface SecondSoulDB extends DBSchema {
    chats: {
        key: string;
        value: Chat;
        indexes: { 'by-persona': string; 'by-updated': number };
    };
    personas: {
        key: string;
        value: Persona;
    };
    settings: {
        key: string;
        value: AppSettings;
    };
    providers: {
        key: string;
        value: Provider;
    };
    modelConfigs: {
        key: string;
        value: ModelConfig;
        indexes: { 'by-provider': string };
    };
    // Slug-keyed metadata cache populated by fetchers.
    // Used as reference when manually adding models for providers without a fetcher.
    globalModelMeta: {
        key: string;             // = FetchedModel.slug
        value: FetchedModel & { source: string; updatedAt: number };
    };
    toolConfigs: {
        key: string;
        value: ToolConfig;
    };
    memoryPending: {
        key: string;
        value: MemoryPendingEntry;
        indexes: { 'by-persona': string; 'by-status': string };
    };
    memoryTopics: {
        key: string;
        value: MemoryTopic;
        indexes: { 'by-persona': string };
    };
    memoryMeta: {
        key: string;
        value: MemoryMeta;
    };
    knowledgeCollections: {
        key: string;
        value: KnowledgeCollection;
        indexes: { 'by-updated': Date };
    };
    knowledgeDocuments: {
        key: string;
        value: KnowledgeDocument;
        indexes: { 'by-collection': string };
    };
    knowledgeChunks: {
        key: string;
        // Stored with embedding as ArrayBuffer; Float32Array reconstructed on read
        value: Omit<KnowledgeChunk, 'embedding'> & { embedding: ArrayBuffer };
        indexes: { 'by-collection': string; 'by-document': string };
    };
}

let dbInstance: IDBPDatabase<SecondSoulDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SecondSoulDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<SecondSoulDB>('second-soul', 5, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
                chatStore.createIndex('by-persona', 'personaId');
                chatStore.createIndex('by-updated', 'updatedAt');

                db.createObjectStore('personas', { keyPath: 'id' });
                db.createObjectStore('settings');
                db.createObjectStore('providers', { keyPath: 'id' });

                const modelStore = db.createObjectStore('modelConfigs', { keyPath: 'id' });
                modelStore.createIndex('by-provider', 'providerId');
            }
            if (oldVersion < 2) {
                db.createObjectStore('globalModelMeta');
            }
            if (oldVersion < 3) {
                db.createObjectStore('toolConfigs', { keyPath: 'id' });
            }
            if (oldVersion < 4) {
                const pendingStore = db.createObjectStore('memoryPending', { keyPath: 'id' });
                pendingStore.createIndex('by-persona', 'personaId');
                pendingStore.createIndex('by-status', 'status');

                const topicStore = db.createObjectStore('memoryTopics', { keyPath: 'id' });
                topicStore.createIndex('by-persona', 'personaId');

                db.createObjectStore('memoryMeta', { keyPath: 'personaId' });
            }
            if (oldVersion < 5) {
                const collectionsStore = db.createObjectStore('knowledgeCollections', { keyPath: 'id' });
                collectionsStore.createIndex('by-updated', 'updatedAt');

                const documentsStore = db.createObjectStore('knowledgeDocuments', { keyPath: 'id' });
                documentsStore.createIndex('by-collection', 'collectionId');

                const chunksStore = db.createObjectStore('knowledgeChunks', { keyPath: 'id' });
                chunksStore.createIndex('by-collection', 'collectionId');
                chunksStore.createIndex('by-document', 'documentId');
            }
        },
    });

    await seedDefaults(dbInstance);
    return dbInstance;
}

// Seed providers and models on first run
async function seedDefaults(db: IDBPDatabase<SecondSoulDB>) {
    const existingProviders = await db.getAll('providers');
    if (existingProviders.length === 0) {
        const tx = db.transaction('providers', 'readwrite');
        for (const p of defaultProviders as Provider[]) {
            await tx.store.put(p);
        }
        await tx.done;
    }

    const existingModels = await db.getAll('modelConfigs');
    if (existingModels.length === 0) {
        const tx = db.transaction('modelConfigs', 'readwrite');
        for (const m of defaultModels as ModelConfig[]) {
            await tx.store.put(m);
        }
        await tx.done;
    }
}

// ─── Chats ────────────────────────────────────────────────────────────────────

export async function saveChat(chat: Chat): Promise<void> {
    const db = await getDB();
    await db.put('chats', { ...chat, updatedAt: Date.now() });
}

export async function getChat(id: string): Promise<Chat | undefined> {
    const db = await getDB();
    return db.get('chats', id);
}

export async function getChatsForPersona(personaId: string): Promise<Chat[]> {
    const db = await getDB();
    const chats = await db.getAllFromIndex('chats', 'by-persona', personaId);
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteChat(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('chats', id);
}

export async function updateChatLastDetection(chatId: string, turnCount: number): Promise<void> {
    const db = await getDB();
    const chat = await db.get('chats', chatId);
    if (!chat) return;
    await db.put('chats', { ...chat, lastDetectionAt: turnCount, updatedAt: Date.now() });
}

// ─── Personas ─────────────────────────────────────────────────────────────────

export async function getPersonas(): Promise<Persona[]> {
    const db = await getDB();
    return db.getAll('personas');
}

export async function savePersona(persona: Persona): Promise<void> {
    const db = await getDB();
    await db.put('personas', persona);
}

export async function deletePersona(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('personas', id);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
    defaultChunkSize: 1000,
    defaultChunkOverlap: 100,
    knowledgeContextTokenBudget: 3000,
    topK: 5,
    ragPromptTemplate: DEFAULT_RAG_PROMPT_TEMPLATE,
};

const DEFAULT_SETTINGS: AppSettings = {
    globalSystemPrompt: '',
    defaultModelId: 'nano-gpt/claude-sonnet-4-6',
    theme: 'dark',
    memorySettings: {
        workerModelId: null,
        autoConsolidate: true,
        consolidationThreshold: 10,
        detectionInterval: 5,
        suggestedEntryExpiryDays: 7,
    },
    knowledge: DEFAULT_KNOWLEDGE_SETTINGS,
    chatFontSize: 'normal',
    uiScale: 100,
};

export async function getSettings(): Promise<AppSettings> {
    const db = await getDB();
    const stored = await db.get('settings', 'main');
    if (!stored) return DEFAULT_SETTINGS;
    // Merge with defaults so existing users get new fields on upgrade
    const storedAny = stored as unknown as Record<string, unknown>;
    const storedMemory = (storedAny.memorySettings ?? {}) as Partial<AppSettings['memorySettings']>;
    const storedKnowledge = (storedAny.knowledge ?? {}) as Partial<AppSettings['knowledge']>;
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...storedMemory },
        knowledge: { ...DEFAULT_SETTINGS.knowledge, ...storedKnowledge },
    };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    const db = await getDB();
    await db.put('settings', settings, 'main');
}

// ─── Providers ────────────────────────────────────────────────────────────────

export async function getProviders(): Promise<Provider[]> {
    const db = await getDB();
    return db.getAll('providers');
}

export async function saveProvider(provider: Provider): Promise<void> {
    const db = await getDB();
    await db.put('providers', provider);
}

export async function deleteProvider(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('providers', id);
}

// ─── Model Configs ────────────────────────────────────────────────────────────

export async function getModelConfigs(): Promise<ModelConfig[]> {
    const db = await getDB();
    return db.getAll('modelConfigs');
}

export async function getModelsForProvider(providerId: string): Promise<ModelConfig[]> {
    const db = await getDB();
    return db.getAllFromIndex('modelConfigs', 'by-provider', providerId);
}

export async function saveModelConfig(model: ModelConfig): Promise<void> {
    const db = await getDB();
    await db.put('modelConfigs', model);
}

export async function deleteModelConfig(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('modelConfigs', id);
}

// ─── Global Model Meta Cache ──────────────────────────────────────────────────

export async function putGlobalModelMeta(
    slug: string,
    meta: FetchedModel,
    source: string,
): Promise<void> {
    const db = await getDB();
    await db.put('globalModelMeta', { ...meta, source, updatedAt: Date.now() }, slug);
}

export async function getGlobalModelMeta(slug: string) {
    const db = await getDB();
    return db.get('globalModelMeta', slug);
}

export async function getAllGlobalModelMeta() {
    const db = await getDB();
    return db.getAll('globalModelMeta');
}

// ─── Tool Configs ─────────────────────────────────────────────────────────────

export async function getToolConfigs(): Promise<ToolConfig[]> {
    const db = await getDB();
    return db.getAll('toolConfigs');
}

export async function saveToolConfig(config: ToolConfig): Promise<void> {
    const db = await getDB();
    await db.put('toolConfigs', config);
}

export async function deleteToolConfig(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('toolConfigs', id);
}

// ─── Memory: Pending Entries ──────────────────────────────────────────────────

export async function getPendingEntries(personaId: string): Promise<MemoryPendingEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('memoryPending', 'by-persona', personaId);
}

export async function getAcceptedPendingEntries(personaId: string): Promise<MemoryPendingEntry[]> {
    const all = await getPendingEntries(personaId);
    return all.filter(e => e.status === 'accepted');
}

export async function getSuggestedPendingEntries(personaId: string): Promise<MemoryPendingEntry[]> {
    const all = await getPendingEntries(personaId);
    return all.filter(e => e.status === 'suggested');
}

export async function deleteExpiredSuggestedEntries(
    personaId: string,
    expiryDays: number,
): Promise<void> {
    const cutoff = Date.now() - expiryDays * 86_400_000;
    const all = await getPendingEntries(personaId);
    const expired = all.filter(e => e.status === 'suggested' && e.extractedAt < cutoff);
    if (expired.length === 0) return;
    const db = await getDB();
    const tx = db.transaction('memoryPending', 'readwrite');
    for (const e of expired) {
        await tx.store.delete(e.id);
    }
    await tx.done;
}

export async function savePendingEntry(entry: MemoryPendingEntry): Promise<void> {
    const db = await getDB();
    await db.put('memoryPending', entry);
}

export async function deletePendingEntry(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('memoryPending', id);
}

export async function clearAcceptedPendingEntries(personaId: string): Promise<void> {
    const entries = await getAcceptedPendingEntries(personaId);
    const db = await getDB();
    const tx = db.transaction('memoryPending', 'readwrite');
    for (const e of entries) {
        await tx.store.delete(e.id);
    }
    await tx.done;
}

// ─── Memory: Topics ───────────────────────────────────────────────────────────

export async function getMemoryTopics(personaId: string): Promise<MemoryTopic[]> {
    const db = await getDB();
    return db.getAllFromIndex('memoryTopics', 'by-persona', personaId);
}

export async function saveMemoryTopic(topic: MemoryTopic): Promise<void> {
    const db = await getDB();
    await db.put('memoryTopics', topic);
}

export async function deleteMemoryTopic(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('memoryTopics', id);
}

// ─── Memory: Meta ─────────────────────────────────────────────────────────────

export async function getMemoryMeta(personaId: string): Promise<MemoryMeta | undefined> {
    const db = await getDB();
    return db.get('memoryMeta', personaId);
}

export async function saveMemoryMeta(meta: MemoryMeta): Promise<void> {
    const db = await getDB();
    await db.put('memoryMeta', meta);
}

// ─── Memory: Cascade Delete ───────────────────────────────────────────────────

export async function deleteAllMemoryForPersona(personaId: string): Promise<void> {
    const db = await getDB();

    const pending = await db.getAllFromIndex('memoryPending', 'by-persona', personaId);
    const topics = await db.getAllFromIndex('memoryTopics', 'by-persona', personaId);

    const tx1 = db.transaction('memoryPending', 'readwrite');
    for (const e of pending) await tx1.store.delete(e.id);
    await tx1.done;

    const tx2 = db.transaction('memoryTopics', 'readwrite');
    for (const t of topics) await tx2.store.delete(t.id);
    await tx2.done;

    await db.delete('memoryMeta', personaId);
}

// ─── Knowledge: Collections ───────────────────────────────────────────────────

export async function getCollections(): Promise<KnowledgeCollection[]> {
    const db = await getDB();
    return db.getAll('knowledgeCollections');
}

export async function getCollection(id: string): Promise<KnowledgeCollection | undefined> {
    const db = await getDB();
    return db.get('knowledgeCollections', id);
}

export async function saveCollection(c: KnowledgeCollection): Promise<void> {
    const db = await getDB();
    await db.put('knowledgeCollections', c);
}

export async function deleteCollection(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('knowledgeCollections', id);
}

// ─── Knowledge: Documents ─────────────────────────────────────────────────────

export async function getDocumentsByCollection(collectionId: string): Promise<KnowledgeDocument[]> {
    const db = await getDB();
    return db.getAllFromIndex('knowledgeDocuments', 'by-collection', collectionId);
}

export async function getDocument(id: string): Promise<KnowledgeDocument | undefined> {
    const db = await getDB();
    return db.get('knowledgeDocuments', id);
}

export async function saveDocument(d: KnowledgeDocument): Promise<void> {
    const db = await getDB();
    await db.put('knowledgeDocuments', d);
}

export async function deleteDocument(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('knowledgeDocuments', id);
}

export async function deleteDocumentsByCollection(collectionId: string): Promise<void> {
    const docs = await getDocumentsByCollection(collectionId);
    if (docs.length === 0) return;
    const db = await getDB();
    const tx = db.transaction('knowledgeDocuments', 'readwrite');
    for (const d of docs) await tx.store.delete(d.id);
    await tx.done;
}

// ─── Knowledge: Chunks ────────────────────────────────────────────────────────
// Float32Array is serialised to ArrayBuffer on write and reconstructed on read.

function serialiseChunk(chunk: KnowledgeChunk): Omit<KnowledgeChunk, 'embedding'> & { embedding: ArrayBuffer } {
    return { ...chunk, embedding: chunk.embedding.buffer };
}

function deserialiseChunk(raw: Omit<KnowledgeChunk, 'embedding'> & { embedding: ArrayBuffer }): KnowledgeChunk {
    return { ...raw, embedding: new Float32Array(raw.embedding) };
}

export async function getChunksByCollection(collectionId: string): Promise<KnowledgeChunk[]> {
    const db = await getDB();
    const raw = await db.getAllFromIndex('knowledgeChunks', 'by-collection', collectionId);
    return raw.map(deserialiseChunk);
}

export async function getChunksByDocument(documentId: string): Promise<KnowledgeChunk[]> {
    const db = await getDB();
    const raw = await db.getAllFromIndex('knowledgeChunks', 'by-document', documentId);
    return raw.map(deserialiseChunk);
}

export async function saveChunks(chunks: KnowledgeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const db = await getDB();
    const tx = db.transaction('knowledgeChunks', 'readwrite');
    for (const chunk of chunks) {
        await tx.store.put(serialiseChunk(chunk));
    }
    await tx.done;
}

export async function deleteChunksByDocument(documentId: string): Promise<void> {
    const db = await getDB();
    const raw = await db.getAllFromIndex('knowledgeChunks', 'by-document', documentId);
    if (raw.length === 0) return;
    const tx = db.transaction('knowledgeChunks', 'readwrite');
    for (const c of raw) await tx.store.delete(c.id);
    await tx.done;
}

export async function deleteChunksByCollection(collectionId: string): Promise<void> {
    const db = await getDB();
    const raw = await db.getAllFromIndex('knowledgeChunks', 'by-collection', collectionId);
    if (raw.length === 0) return;
    const tx = db.transaction('knowledgeChunks', 'readwrite');
    for (const c of raw) await tx.store.delete(c.id);
    await tx.done;
}
