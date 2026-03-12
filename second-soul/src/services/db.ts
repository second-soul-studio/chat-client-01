import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Chat, Persona, AppSettings } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
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
}

let dbInstance: IDBPDatabase<SecondSoulDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SecondSoulDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<SecondSoulDB>('second-soul', 1, {
        upgrade(db) {
            const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
            chatStore.createIndex('by-persona', 'personaId');
            chatStore.createIndex('by-updated', 'updatedAt');

            db.createObjectStore('personas', { keyPath: 'id' });
            db.createObjectStore('settings');
            db.createObjectStore('providers', { keyPath: 'id' });

            const modelStore = db.createObjectStore('modelConfigs', { keyPath: 'id' });
            modelStore.createIndex('by-provider', 'providerId');
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
};

export async function getSettings(): Promise<AppSettings> {
    const db = await getDB();
    return (await db.get('settings', 'main')) ?? DEFAULT_SETTINGS;
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
