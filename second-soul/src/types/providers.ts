// Provider and model configuration types

export type AdapterType = 'openai' | 'anthropic' | 'ollama';

export interface Provider {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;                 // stored in IndexedDB only, never exported as plaintext
    adapter: AdapterType;
    notes?: string;
    enabled: boolean;
    createdAt: number;
}

export interface ModelConfig {
    id: string;                     // composite: "providerId/slug"
    providerId: string;
    displayName: string;
    slug: string;                   // exact string sent to the API
    contextSize: number;
    defaultTemperature: number;
    defaultTopP: number;
    topKSupport: boolean;
    defaultTopK?: number;
    maxOutputTokens: number;
    supportsStreaming: boolean;
    supportsCot: boolean;           // extended thinking / <think> tags
    favorite: boolean;
    notes?: string;
}
