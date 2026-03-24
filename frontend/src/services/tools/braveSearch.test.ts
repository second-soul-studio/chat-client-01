import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapBraveResults, searchBrave } from './braveSearch';
import type { ToolConfig } from '@/types';

describe('mapBraveResults', () => {
    it('returns top 3 results with title, url, snippet', () => {
        const raw = {
            web: {
                results: [
                    { title: 'A', url: 'https://a.com', description: 'Snippet A' },
                    { title: 'B', url: 'https://b.com', description: 'Snippet B' },
                    { title: 'C', url: 'https://c.com', description: 'Snippet C' },
                    { title: 'D', url: 'https://d.com', description: 'Snippet D' },
                ],
            },
        };
        const results = mapBraveResults(raw);
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({ title: 'A', url: 'https://a.com', snippet: 'Snippet A' });
        expect(results[2]).toEqual({ title: 'C', url: 'https://c.com', snippet: 'Snippet C' });
    });

    it('returns fewer than 3 results when fewer are available', () => {
        const raw = { web: { results: [{ title: 'A', url: 'https://a.com', description: 'S' }] } };
        expect(mapBraveResults(raw)).toHaveLength(1);
    });

    it('returns empty array when web.results is missing', () => {
        expect(mapBraveResults({})).toHaveLength(0);
        expect(mapBraveResults({ web: {} })).toHaveLength(0);
    });
});

vi.mock('@/services/proxiedFetch', () => ({
    proxiedFetch: vi.fn(),
}));

describe('searchBrave', () => {
    const mockConfig: ToolConfig = {
        id: 'brave-search',
        displayName: 'Brave',
        enabled: true,
        apiKey: 'test-key',
        settings: { safesearch: 'moderate' },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the real Brave URL via proxiedFetch', async () => {
        const { proxiedFetch } = await import('@/services/proxiedFetch');
        const mockFetch = proxiedFetch as ReturnType<typeof vi.fn>;
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ web: { results: [{ title: 'T', url: 'https://t.com', description: 'S' }] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const result = await searchBrave('test query', mockConfig);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl] = mockFetch.mock.calls[0] as [string];
        expect(calledUrl).toContain('https://api.search.brave.com/res/v1/web/search');
        expect(calledUrl).toContain('q=test+query');
        expect(result.results).toHaveLength(1);
        expect(result.results[0].title).toBe('T');
    });
});
