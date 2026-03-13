import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

interface OllamaModelDetails {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
}

interface OllamaModelEntry {
    name: string;
    model: string;
    details?: OllamaModelDetails;
}

export class OllamaFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        // Ollama's native API lives at the root, not under /v1
        const baseUrl = provider.baseUrl.replace(/\/v1\/?$/, '');
        const response = await fetch(`${baseUrl}/api/tags`);

        if (!response.ok) {
            throw new Error(`Ollama /api/tags returned ${response.status}`);
        }

        const json = await response.json() as { models: OllamaModelEntry[] };

        return json.models.map(m => {
            const parts = [
                m.details?.family,
                m.details?.parameter_size,
                m.details?.quantization_level,
            ].filter(Boolean);

            return {
                slug: m.model,
                displayName: m.name,
                notes: parts.length > 0 ? parts.join(' · ') : undefined,
            };
        });
    }
}
