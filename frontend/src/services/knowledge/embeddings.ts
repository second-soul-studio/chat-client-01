import { proxiedFetch } from '@/services/proxiedFetch';
import { enqueue } from '@/services/requestQueue';
import { getProviders } from '@/services/db';

async function getProvider(providerId: string) {
    const providers = await getProviders();
    const provider = providers.find(p => p.id === providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider;
}

/**
 * Calls /v1/embeddings for a single text and returns the embedding as Float32Array.
 */
export async function embedText(
    text: string,
    providerId: string,
    modelSlug: string,
): Promise<Float32Array> {
    const results = await embedBatch([text], providerId, modelSlug, 1);
    return results[0];
}

/**
 * Embeds an array of texts in batches, honouring per-provider rate-limiting.
 */
export async function embedBatch(
    texts: string[],
    providerId: string,
    modelSlug: string,
    batchSize = 20,
): Promise<Float32Array[]> {
    const provider = await getProvider(providerId);
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        // eslint-disable-next-line no-await-in-loop
        const embeddings = await enqueue(providerId, () =>
            callEmbeddingsEndpoint(provider.baseUrl, provider.apiKey, modelSlug, batch),
        );
        results.push(...embeddings);
    }

    return results;
}

async function callEmbeddingsEndpoint(
    baseUrl: string,
    apiKey: string,
    model: string,
    input: string[],
): Promise<Float32Array[]> {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/embeddings`;

    const response = await proxiedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `Embeddings request failed for model "${model}" on provider baseUrl "${baseUrl}": ${response.status} ${body}`,
        );
    }

    const json = await response.json() as { data: Array<{ embedding: number[] }> };
    return json.data.map(item => new Float32Array(item.embedding));
}
