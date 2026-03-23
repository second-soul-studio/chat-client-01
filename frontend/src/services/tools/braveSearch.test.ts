import { describe, it, expect } from 'vitest';
import { mapBraveResults } from './braveSearch';

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
