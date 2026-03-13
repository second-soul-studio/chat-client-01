import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

// OpenAI's /v1/models endpoint; also works for any OpenAI-compatible provider
// that doesn't have a dedicated fetcher. Note: the standard OpenAI response
// omits pricing — use OpenRouterFetcher or a dedicated fetcher for cost data.
interface OpenAIModelEntry {
    id: string;
    object: string;
    context_window?: number;
    max_completion_tokens?: number;
}

export class OpenAIListFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        const response = await fetch(`${provider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
        });

        if (!response.ok) {
            throw new Error(`OpenAI models endpoint returned ${response.status}`);
        }

        const json = await response.json() as { data: OpenAIModelEntry[] };

        return json.data
            .filter(m => m.object === 'model')
            .map(m => ({
                slug: m.id,
                displayName: m.id,
                contextWindow: m.context_window,
                maxOutputTokens: m.max_completion_tokens,
            }));
    }
}
