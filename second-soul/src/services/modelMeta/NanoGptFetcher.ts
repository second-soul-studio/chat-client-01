import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

// Detailed response shape from GET /api/v1/models?detailed=true
// Docs: https://docs.nano-gpt.com/api-reference/endpoint/models
interface NanoGptModelEntry {
    id: string;
    object: string;
    name?: string;
    description?: string;
    context_length?: number;
    max_output_tokens?: number;
    capabilities?: {
        vision?: boolean;
        reasoning?: boolean;       // extended thinking
        tool_calling?: boolean;
        structured_output?: boolean;
    };
    pricing?: {
        prompt: number;            // USD per 1M input tokens
        completion: number;        // USD per 1M output tokens
        currency: string;
        unit: string;              // "per_million_tokens"
    };
}

export class NanoGptFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        const url = `${provider.baseUrl}/models?detailed=true`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
        });

        if (!response.ok) {
            throw new Error(`nano-gpt models endpoint returned ${response.status}`);
        }

        const json = await response.json() as { data: NanoGptModelEntry[] };

        return json.data
            .filter(m => m.object === 'model')
            .map(m => {
                const model: FetchedModel = {
                    slug: m.id,
                    displayName: m.name ?? m.id,
                    contextWindow: m.context_length,
                    maxOutputTokens: m.max_output_tokens,
                    supportsCot: m.capabilities?.reasoning,
                    supportsVision: m.capabilities?.vision,
                    functionCalling: m.capabilities?.tool_calling,
                    notes: m.description,
                };

                // Pricing values are already per-1M-tokens in USD
                if (m.pricing?.prompt != null && m.pricing.completion != null) {
                    model.pricing = {
                        unit: 'usd',
                        inputPer1M: m.pricing.prompt,
                        outputPer1M: m.pricing.completion,
                    };
                }

                return model;
            });
    }
}
