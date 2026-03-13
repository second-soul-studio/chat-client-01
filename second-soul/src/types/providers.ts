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
    metaFetcherKey?: string;        // key into the ModelMetaFetcher registry
}

export interface ModelConfig {
    id: string;                     // composite: "providerId/slug"
    providerId: string;
    displayName: string;
    slug: string;                   // exact string sent to the API (non-thinking variant)
    cotSlug?: string;               // slug to use when thinking is enabled (e.g. "model:thinking" on nano-gpt)
    contextSize: number;
    defaultTemperature: number;
    defaultTopP: number;
    topKSupport: boolean;
    defaultTopK?: number;
    maxOutputTokens: number;
    supportsStreaming: boolean;
    supportsCot: boolean;           // can produce CoT output (via <think> tags or cotSlug)
    isTee?: boolean;                // runs in a Trusted Execution Environment
    favorite: boolean;
    notes?: string;                 // provider-sourced description
    userSystemPrompt?: string;      // user-added extra system prompt appended when this model is active
    userNotes?: string;             // user's own notes about this model
    pricing?: {
        unit: 'usd' | 'credits';
        unitLabel?: string;         // e.g. "nano credits"
        inputPer1M: number;         // cost per 1 million input tokens
        outputPer1M: number;        // cost per 1 million output tokens
    };
}
