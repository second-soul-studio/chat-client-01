import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Chat, Persona, AppSettings, ToolConfig, MemoryPendingEntry, MemoryTopic, MemoryMeta } from '@/types';
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
}

let dbInstance: IDBPDatabase<SecondSoulDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SecondSoulDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<SecondSoulDB>('second-soul', 4, {
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

const DEFAULT_SETTINGS: AppSettings = {
    globalSystemPrompt: '',
    defaultModelId: 'nano-gpt/claude-sonnet-4-6',
    theme: 'dark',
    memorySettings: {
        workerModelId: null,
        autoConsolidate: true,
        consolidationThreshold: 10,
        detectionInterval: 5,
    },
};

export async function getSettings(): Promise<AppSettings> {
    const db = await getDB();
    const stored = await db.get('settings', 'main');
    if (!stored) return DEFAULT_SETTINGS;
    // Merge with defaults so existing users get new memorySettings fields
    const storedAny = stored as unknown as Record<string, unknown>;
    const storedMemory = (storedAny.memorySettings ?? {}) as Partial<AppSettings['memorySettings']>;
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...storedMemory },
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
