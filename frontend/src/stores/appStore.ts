import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppSettings, Chat, Message, Persona } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
import {
    getSettings, saveSettings,
    getPersonas, savePersona, deletePersona as dbDeletePersona,
    getProviders, saveProvider, deleteProvider as dbDeleteProvider,
    getModelConfigs, getModelsForProvider, saveModelConfig,
    putGlobalModelMeta,
    getChatsForPersona, saveChat, deleteChat as dbDeleteChat,
    getChat,
} from '@/services/db';
import { getFetcher } from '@/services/modelMeta/registry';

interface AppState {
    // ─── Initialisation ───────────────────────────────────────────────────────
    initialised: boolean;
    init: () => Promise<void>;

    // ─── Settings ─────────────────────────────────────────────────────────────
    settings: AppSettings | null;
    setSettings: (s: AppSettings) => Promise<void>;

    // ─── Personas ─────────────────────────────────────────────────────────────
    personas: Persona[];
    addPersona: (persona: Omit<Persona, 'id'>) => Promise<Persona>;
    updatePersona: (persona: Persona) => Promise<void>;
    removePersona: (id: string) => Promise<void>;

    // ─── Providers ────────────────────────────────────────────────────────────
    providers: Provider[];
    addProvider: (provider: Omit<Provider, 'id' | 'createdAt'>) => Promise<Provider>;
    updateProvider: (provider: Provider) => Promise<void>;
    removeProvider: (id: string) => Promise<void>;

    // ─── Model Configs ────────────────────────────────────────────────────────
    modelConfigs: ModelConfig[];
    syncProviderModels: (providerId: string) => Promise<{ added: number; updated: number }>;
    updateModelConfig: (id: string, partial: Partial<ModelConfig>) => Promise<void>;

    // ─── Active Chat ──────────────────────────────────────────────────────────
    activePersonaId: string | null;
    activeChat: Chat | null;
    isStreaming: boolean;

    setActivePersona: (id: string | null) => void;
    loadOrCreateChat: (personaId: string, chatId?: string) => Promise<void>;
    addMessage: (message: Message) => void;
    updateLastAssistantMessage: (content: string, thinking?: string) => void;
    finaliseMessage: (content: string, thinking?: string) => Promise<void>;
    setIsStreaming: (v: boolean) => void;
    startNewChat: (personaId: string) => void;

    // ─── Chat History ─────────────────────────────────────────────────────────
    loadChatsForPersona: (personaId: string) => Promise<Chat[]>;
    removeChat: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    initialised: false,

    async init() {
        const [settings, personas, providers, modelConfigs] = await Promise.all([
            getSettings(),
            getPersonas(),
            getProviders(),
            getModelConfigs(),
        ]);
        set({ settings, personas, providers, modelConfigs, initialised: true });
    },

    // ─── Settings ───────────────────────────────────────────────────────────

    settings: null,

    async setSettings(settings) {
        await saveSettings(settings);
        set({ settings });
    },

    // ─── Personas ───────────────────────────────────────────────────────────

    personas: [],

    async addPersona(data) {
        const persona: Persona = { ...data, id: uuidv4() };
        await savePersona(persona);
        set(s => ({ personas: [...s.personas, persona] }));
        return persona;
    },

    async updatePersona(persona) {
        await savePersona(persona);
        set(s => ({ personas: s.personas.map(p => p.id === persona.id ? persona : p) }));
    },

    async removePersona(id) {
        await dbDeletePersona(id);
        set(s => ({ personas: s.personas.filter(p => p.id !== id) }));
    },

    // ─── Providers ──────────────────────────────────────────────────────────

    providers: [],

    async addProvider(data) {
        const provider: Provider = { ...data, id: uuidv4(), createdAt: Date.now() };
        await saveProvider(provider);
        set(s => ({ providers: [...s.providers, provider] }));
        return provider;
    },

    async updateProvider(provider) {
        await saveProvider(provider);
        set(s => ({ providers: s.providers.map(p => p.id === provider.id ? provider : p) }));
    },

    async removeProvider(id) {
        await dbDeleteProvider(id);
        set(s => ({ providers: s.providers.filter(p => p.id !== id) }));
    },

    // ─── Model Configs ───────────────────────────────────────────────────────

    modelConfigs: [],

    async syncProviderModels(providerId) {
        const provider = get().providers.find(p => p.id === providerId);
        if (!provider?.metaFetcherKey) throw new Error('No meta fetcher key for this provider');

        const fetcher = getFetcher(provider.metaFetcherKey);
        if (!fetcher) throw new Error(`Unknown fetcher: "${provider.metaFetcherKey}"`);

        const fetched = await fetcher.fetchModels(provider);
        const existing = await getModelsForProvider(providerId);
        const existingMap = new Map(existing.map(m => [m.id, m]));

        let added = 0;
        let updated = 0;

        for (const fm of fetched) {
            const id = `${providerId}/${fm.slug}`;
            const prev = existingMap.get(id);

            // Write to global slug-based meta cache (for cross-provider reference)
            await putGlobalModelMeta(fm.slug, fm, providerId);

            if (prev) {
                // Upsert: refresh API-sourced fields; preserve user-authored fields
                await saveModelConfig({
                    ...prev,
                    displayName: fm.displayName,
                    cotSlug: fm.cotSlug ?? prev.cotSlug,
                    contextSize: fm.contextWindow ?? prev.contextSize,
                    maxOutputTokens: fm.maxOutputTokens ?? prev.maxOutputTokens,
                    supportsCot: fm.supportsCot ?? prev.supportsCot,
                    isTee: fm.isTee ?? prev.isTee,
                    ...(fm.pricing !== undefined && { pricing: fm.pricing }),
                    ...(fm.notes !== undefined && { notes: fm.notes }),
                });
                updated++;
            } else {
                await saveModelConfig({
                    id,
                    providerId,
                    displayName: fm.displayName,
                    slug: fm.slug,
                    cotSlug: fm.cotSlug,
                    contextSize: fm.contextWindow ?? 4096,
                    defaultTemperature: 0.7,
                    defaultTopP: 1,
                    topKSupport: false,
                    maxOutputTokens: fm.maxOutputTokens ?? 4096,
                    supportsStreaming: true,
                    supportsCot: fm.supportsCot ?? false,
                    isTee: fm.isTee,
                    favorite: false,
                    ...(fm.pricing !== undefined && { pricing: fm.pricing }),
                    ...(fm.notes !== undefined && { notes: fm.notes }),
                });
                added++;
            }
        }

        const modelConfigs = await getModelConfigs();
        set({ modelConfigs });

        return { added, updated };
    },

    async updateModelConfig(id, partial) {
        const prev = get().modelConfigs.find(m => m.id === id);
        if (!prev) return;
        const updated = { ...prev, ...partial };
        await saveModelConfig(updated);
        set(s => ({ modelConfigs: s.modelConfigs.map(m => m.id === id ? updated : m) }));
    },

    // ─── Active Chat ─────────────────────────────────────────────────────────

    activePersonaId: null,
    activeChat: null,
    isStreaming: false,

    setActivePersona(id) {
        set({ activePersonaId: id });
    },

    async loadOrCreateChat(personaId, chatId) {
        if (chatId) {
            const chat = await getChat(chatId);
            if (chat) {
                set({ activePersonaId: personaId, activeChat: chat });
                return;
            }
        }
        // Create a fresh chat
        get().startNewChat(personaId);
    },

    startNewChat(personaId) {
        const chat: Chat = {
            id: uuidv4(),
            personaId,
            title: 'New conversation',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
        };
        set({ activePersonaId: personaId, activeChat: chat });
    },

    addMessage(message) {
        set(s => {
            if (!s.activeChat) return s;
            return {
                activeChat: {
                    ...s.activeChat,
                    messages: [...s.activeChat.messages, message],
                },
            };
        });
    },

    updateLastAssistantMessage(content, thinking) {
        set(s => {
            if (!s.activeChat) return s;
            const messages = [...s.activeChat.messages];
            const last = messages[messages.length - 1];
            if (!last || last.role !== 'assistant') return s;
            messages[messages.length - 1] = { ...last, content, thinking };
            return { activeChat: { ...s.activeChat, messages } };
        });
    },

    async finaliseMessage(content, thinking) {
        set(s => {
            if (!s.activeChat) return s;
            const messages = [...s.activeChat.messages];
            const last = messages[messages.length - 1];
            if (!last || last.role !== 'assistant') return s;
            messages[messages.length - 1] = { ...last, content, thinking };
            return { activeChat: { ...s.activeChat, messages } };
        });

        const { activeChat } = get();
        if (!activeChat) return;

        // Auto-title from first user message
        let title = activeChat.title;
        if (title === 'New conversation') {
            const firstUser = activeChat.messages.find(m => m.role === 'user');
            if (firstUser) {
                title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '');
            }
        }

        const updated = { ...activeChat, title, updatedAt: Date.now() };
        await saveChat(updated);
        set({ activeChat: updated });
    },

    setIsStreaming(v) {
        set({ isStreaming: v });
    },

    // ─── Chat History ────────────────────────────────────────────────────────

    async loadChatsForPersona(personaId) {
        return getChatsForPersona(personaId);
    },

    async removeChat(id) {
        await dbDeleteChat(id);
    },
}));
