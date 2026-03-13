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
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    thinking?: string;              // CoT content — only on assistant messages
    timestamp: number;
}

export interface Chat {
    id: string;
    personaId: string;
    title: string;                  // auto-generated from first user message
    createdAt: number;
    updatedAt: number;
    messages: Message[];
}

export interface AppSettings {
    globalSystemPrompt: string;
    defaultModelId: string | null;
    theme: 'dark';
}
