import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';

interface OllamaModelListEntry {
    id: string;
}

interface OllamaShowResponse {
    details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
    };
    model_info?: Record<string, unknown>;
    capabilities?: string[];
}

export class OllamaFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        // Ollama's native API lives at the root, not under /v1
        const baseUrl = provider.baseUrl.replace(/\/v1\/?$/, '');
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
            headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        // Use OpenAI-compatible /v1/models — works for both local and cloud Ollama
        const listResponse = await fetch(`${baseUrl}/v1/models`, { headers });
        if (!listResponse.ok) {
            throw new Error(`Ollama /v1/models returned ${listResponse.status}`);
        }

        const listJson = await listResponse.json() as { data: OllamaModelListEntry[] };

        const results = await Promise.all(
            listJson.data.map(entry => this.fetchModelDetail(baseUrl, headers, entry.id))
        );

        return results.filter((m): m is FetchedModel => m !== null);
    }

    private async fetchModelDetail(
        baseUrl: string,
        headers: Record<string, string>,
        slug: string,
    ): Promise<FetchedModel | null> {
        const response = await fetch(`${baseUrl}/api/show`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: slug }),
        });

        if (!response.ok) return null;

        const data = await response.json() as OllamaShowResponse;

        const modelInfo = data.model_info ?? {};
        const arch = modelInfo['general.architecture'] as string | undefined;
        const contextLength = arch
            ? modelInfo[`${arch}.context_length`] as number | undefined
            : undefined;

        const capabilities = data.capabilities ?? [];
        const supportsCot = capabilities.includes('thinking');
        const supportsVision = capabilities.includes('vision');
        const functionCalling = capabilities.includes('tools');

        const noteParts = [
            data.details?.family,
            data.details?.parameter_size,
            data.details?.quantization_level,
        ].filter(Boolean);

        return {
            slug,
            displayName: slug,
            contextWindow: contextLength,
            supportsCot,
            supportsVision,
            functionCalling,
            notes: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
        };
    }
}
