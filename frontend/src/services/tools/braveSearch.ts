import type { ToolConfig, BraveSearchSettings } from '@/types';
import type { ToolDefinition, ToolResult } from './types';
import { registerTool } from './registry';
import { proxiedFetch } from '@/services/proxiedFetch';

// ─── Result Mapping ───────────────────────────────────────────────────────────

export function mapBraveResults(raw: Record<string, unknown>): ToolResult['results'] {
    const results = (raw?.web as { results?: unknown[] })?.results ?? [];
    return results.slice(0, 3).map((r: unknown) => {
        const item = r as { title?: string; url?: string; description?: string };
        return {
            title: item.title ?? '',
            url: item.url ?? '',
            snippet: item.description ?? '',
        };
    });
}

// ─── API Call ─────────────────────────────────────────────────────────────────

export async function searchBrave(
    query: string,
    config: ToolConfig,
): Promise<ToolResult> {
    const settings = config.settings as unknown as BraveSearchSettings;
    const params = new URLSearchParams({ q: query });
    if (settings.safesearch) params.set('safesearch', settings.safesearch);

    const locationHeaders: Record<string, string> = {};
    if (settings.lat != null) locationHeaders['x-loc-lat'] = String(settings.lat);
    if (settings.long != null) locationHeaders['x-loc-long'] = String(settings.long);
    if (settings.timezone) locationHeaders['x-loc-timezone'] = settings.timezone;
    if (settings.city) locationHeaders['x-loc-city'] = settings.city;
    if (settings.state) locationHeaders['x-loc-state'] = settings.state;
    if (settings.stateName) locationHeaders['x-loc-state-name'] = settings.stateName;
    if (settings.country) locationHeaders['x-loc-country'] = settings.country;
    if (settings.postalCode) locationHeaders['x-loc-postal-code'] = settings.postalCode;

    const response = await proxiedFetch(
        `https://api.search.brave.com/res/v1/web/search?${params}`,
        {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': config.apiKey,
                ...locationHeaders,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Brave Search API error ${response.status}`);
    }

    const data = await response.json();
    return { results: mapBraveResults(data) };
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

const braveSearchTool: ToolDefinition = {
    name: 'brave_web_search',
    configId: 'brave-search',
    description: 'Search the web using Brave Search. Use this to find current information, news, facts, or anything that benefits from a live web search.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query',
            },
        },
        required: ['query'],
    },
    async execute(args, config) {
        const { query } = args as { query: string };
        return searchBrave(query, config);
    },
};

registerTool(braveSearchTool);

export default braveSearchTool;
