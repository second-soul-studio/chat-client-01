import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

interface MistralModelEntry {
    id: string;
    object: string;
    max_context_length?: number;
    capabilities?: {
        reasoning?: boolean;
        function_calling?: boolean;
        vision?: boolean;
    };
}

export class MistralFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        const response = await fetch(`${provider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
        });

        if (!response.ok) {
            throw new Error(`Mistral models endpoint returned ${response.status}`);
        }

        const json = await response.json() as { data: MistralModelEntry[] };

        return json.data
            .filter(m => m.object === 'model')
            .map(m => ({
                slug: m.id,
                displayName: m.id,
                contextWindow: m.max_context_length,
                supportsCot: m.capabilities?.reasoning,
                functionCalling: m.capabilities?.function_calling,
                supportsVision: m.capabilities?.vision,
            }));
    }
}
