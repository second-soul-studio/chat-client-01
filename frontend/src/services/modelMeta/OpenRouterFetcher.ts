import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

interface OpenRouterModelEntry {
    id: string;
    name?: string;
    context_length?: number;
    // OpenRouter returns price as a decimal string (USD per token)
    pricing?: {
        prompt: string;
        completion: string;
    };
    top_provider?: {
        max_completion_tokens?: number;
    };
}

export class OpenRouterFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        const response = await fetch(`${provider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
        });

        if (!response.ok) {
            throw new Error(`OpenRouter models endpoint returned ${response.status}`);
        }

        const json = await response.json() as { data: OpenRouterModelEntry[] };

        return json.data.map(m => {
            const model: FetchedModel = {
                slug: m.id,
                displayName: m.name ?? m.id,
                contextWindow: m.context_length,
                maxOutputTokens: m.top_provider?.max_completion_tokens,
            };

            const inputPrice = parseFloat(m.pricing?.prompt ?? '0');
            const outputPrice = parseFloat(m.pricing?.completion ?? '0');
            if (inputPrice > 0 || outputPrice > 0) {
                model.pricing = {
                    unit: 'usd',
                    // OpenRouter prices are per token; convert to per-1M
                    inputPer1M: inputPrice * 1_000_000,
                    outputPer1M: outputPrice * 1_000_000,
                };
            }

            return model;
        });
    }
}
