import type { Provider } from '@/types/providers';

// Common model metadata returned by any provider's model-list endpoint.
// Fields are optional because not every API exposes the same level of detail.
export interface FetchedModel {
    slug: string;
    displayName: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    supportsCot?: boolean;
    supportsVision?: boolean;
    functionCalling?: boolean;
    pricing?: {
        unit: 'usd' | 'credits';
        unitLabel?: string;      // e.g. "nano credits"
        inputPer1M: number;      // cost per 1 million input tokens
        outputPer1M: number;     // cost per 1 million output tokens
    };
    notes?: string;
}

export interface ModelMetaFetcher {
    fetchModels(provider: Provider): Promise<FetchedModel[]>;
}
