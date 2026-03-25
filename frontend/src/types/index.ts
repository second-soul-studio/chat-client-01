// Core data types for Second Soul

export interface Persona {
    id: string;
    name: string;
    tagline: string;
    avatarUrl: string | null;       // base64 or blob URL from user upload
    color: string;                  // accent hex, e.g. "#C9A96E"
    glow: string;                   // rgba glow colour, e.g. "rgba(201,169,110,0.3)"
    gradient: string;               // CSS gradient for card background
    systemPrompt: string;           // appended to global system prompt
    online: boolean;
    modelId: string | null;         // references ModelConfig.id; null = use global default
    showThinking: boolean;          // whether CoT block is visible for this persona
    thinkingEnabled: boolean;       // whether CoT is requested by default for this persona
    paramOverrides?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        maxOutputTokens?: number;
    };
    order?: number;
    memoryEnabled?: boolean;        // default true — set false to disable memory for this persona
}

export interface ToolCallRecord {
    id: string;
    toolName: string;
    query: string;
    status: 'pending' | 'complete' | 'error';
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    errorMessage?: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    thinking?: string;              // CoT content — only on assistant messages
    timestamp: number;
    toolCalls?: ToolCallRecord[];
}

export interface Chat {
    id: string;
    personaId: string;
    title: string;                  // auto-generated from first user message
    createdAt: number;
    updatedAt: number;
    messages: Message[];
    lastDetectionAt: number | null; // message count at last memory detection
}

export interface AppSettings {
    globalSystemPrompt: string;
    defaultModelId: string | null;
    theme: 'dark';
    memorySettings: MemorySettings;
}

export interface BraveSearchSettings {
    safesearch: 'off' | 'moderate' | 'strict';
    lat?: number;
    long?: number;
    timezone?: string;
    city?: string;
    state?: string;
    stateName?: string;
    country?: string;
    postalCode?: string;
}

export interface ToolConfig {
    id: string;
    displayName: string;
    enabled: boolean;
    apiKey: string;
    settings: Record<string, unknown>;
}

// ─── Memory System ────────────────────────────────────────────────────────────

export type MemoryType = 'emotional' | 'hard_fact' | 'preference' | 'event' | 'nsfw';

export const MEMORY_TYPE_EMOJI: Record<MemoryType, string> = {
    emotional: '💫',
    hard_fact: '📌',
    preference: '⚙️',
    event: '📅',
    nsfw: '🔥',
};

export interface MemoryPendingEntry {
    id: string;
    personaId: string;
    type: MemoryType;
    content: string;
    extractedAt: number;
    sourceChatId: string;
    status: 'suggested' | 'accepted' | 'dismissed';
}

export interface MemoryTopic {
    id: string;                   // "{personaId}-{slug}"
    personaId: string;
    slug: string;                 // "profile", "interests", etc.
    content: string;              // Markdown
    updatedAt: number;
}

export interface MemoryMeta {
    personaId: string;            // PK
    indexContent: string;         // Markdown index (topic overview with one-liners)
    lastConsolidatedAt: number | null;
    pendingCount: number;
    nsfwEnabled: boolean;
}

export interface MemorySettings {
    workerModelId: string | null;     // null = use chat model
    autoConsolidate: boolean;
    consolidationThreshold: number;   // 5–25, default 10
    detectionInterval: number;        // 3–10 turns, default 5
    suggestedEntryExpiryDays: number; // 3–30, default 7
}
