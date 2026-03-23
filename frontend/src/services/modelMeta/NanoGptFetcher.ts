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
        prompt: number;            // USD per 1M input tokens (already per-million)
        completion: number;        // USD per 1M output tokens
        currency: string;
        unit: string;              // "per_million_tokens"
    };
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

// Returns true when a slug represents the :thinking variant of a model.
// nano-gpt uses two patterns:
//   base:thinking            e.g. deepseek/deepseek-v3.2:thinking
//   base:thinking:qualifier  e.g. kimi-k2.5:thinking:cloud
function isThinkingSlug(slug: string): boolean {
    return slug.endsWith(':thinking') || slug.includes(':thinking:');
}

// Returns true for TEE variants (e.g. model:tee or model:tee:qualifier).
function isTeeSlug(slug: string): boolean {
    return slug.endsWith(':tee') || slug.includes(':tee:');
}

// Strips :thinking from a slug to produce the corresponding base slug:
//   deepseek/v3.2:thinking        → deepseek/v3.2
//   kimi-k2.5:thinking:cloud      → kimi-k2.5:cloud
function toBaseSlug(thinkingSlug: string): string {
    if (thinkingSlug.endsWith(':thinking')) {
        return thinkingSlug.slice(0, -':thinking'.length);
    }
    return thinkingSlug.replace(':thinking:', ':');
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
        const entries = json.data.filter(m => m.object === 'model');

        // Build a lookup: base slug → :thinking slug (for models that have a thinking variant)
        const thinkingVariants = new Map<string, string>();
        for (const m of entries) {
            if (isThinkingSlug(m.id)) {
                thinkingVariants.set(toBaseSlug(m.id), m.id);
            }
        }

        const result: FetchedModel[] = [];

        for (const m of entries) {
            // Skip :thinking entries — they're surfaced via cotSlug on the base model
            if (isThinkingSlug(m.id)) continue;

            const pricing = m.pricing?.prompt != null && m.pricing.completion != null
                ? { unit: 'usd' as const, inputPer1M: m.pricing.prompt, outputPer1M: m.pricing.completion }
                : undefined;

            const cotSlug = thinkingVariants.get(m.id);
            const isTee = isTeeSlug(m.id);

            result.push({
                slug: m.id,
                displayName: m.name ?? m.id,
                cotSlug,
                contextWindow: m.context_length,
                maxOutputTokens: m.max_output_tokens,
                // supportsCot is true when there's a dedicated thinking variant OR reasoning capability
                supportsCot: cotSlug !== undefined || m.capabilities?.reasoning === true,
                isTee,
                supportsVision: m.capabilities?.vision,
                functionCalling: m.capabilities?.tool_calling,
                pricing,
                notes: m.description,
            });
        }

        return result;
    }
}

