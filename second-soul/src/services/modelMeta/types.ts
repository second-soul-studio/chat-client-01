import type { Provider } from '@/types/providers';

// Common model metadata returned by any provider's model-list endpoint.
// Fields are optional because not every API exposes the same level of detail.
export interface FetchedModel {
    slug: string;
    displayName: string;
    cotSlug?: string;        // separate slug for CoT mode (nano-gpt :thinking pattern)
    contextWindow?: number;
    maxOutputTokens?: number;
    supportsCot?: boolean;
    isTee?: boolean;         // runs in a Trusted Execution Environment
    supportsVision?: boolean;
    functionCalling?: boolean;
    pricing?: {
        unit: 'usd' | 'credits';
        unitLabel?: string;
        inputPer1M: number;
        outputPer1M: number;
    };
    notes?: string;
}

export interface ModelMetaFetcher {
    fetchModels(provider: Provider): Promise<FetchedModel[]>;
}
