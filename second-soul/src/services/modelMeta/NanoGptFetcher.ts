import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

// Shape of fields we care about from nano-gpt's /v1/models response.
// Core fields follow the OpenAI standard; pricing fields are nano-gpt-specific.
interface NanoGptModelEntry {
    id: string;
    object: string;
    context_window?: number;
    max_completion_tokens?: number;
    // nano-gpt-specific — present when authenticated
    prompt_tokens_cost?: number;
    completion_tokens_cost?: number;
}

export class NanoGptFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        const response = await fetch(`${provider.baseUrl}/models`, {
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
                    displayName: m.id,
                    contextWindow: m.context_window,
                    maxOutputTokens: m.max_completion_tokens,
                };

                // Attach pricing only when the endpoint returns cost fields
                if (m.prompt_tokens_cost != null && m.completion_tokens_cost != null) {
                    model.pricing = {
                        unit: 'credits',
                        unitLabel: 'nano credits',
                        // API returns cost per token; convert to per-1M
                        inputPer1M: m.prompt_tokens_cost * 1_000_000,
                        outputPer1M: m.completion_tokens_cost * 1_000_000,
                    };
                }

                return model;
            });
    }
}
