import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We import the module AFTER setting up globalThis.__ENV__
// so the module reads the right PROXY_URL.
// Use vi.resetModules() between tests that need different configs.

describe('proxiedFetch', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockClear();
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('rewrites URL and injects X-Target-URL for a proxied domain', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.search.brave.com/res/v1/web/search?q=test');

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe('http://localhost:9080/res/v1/web/search?q=test');
        expect((calledInit?.headers as Headers).get('X-Target-URL')).toBe('https://api.search.brave.com');
    });

    it('passes through non-proxied URLs unchanged', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer sk-test' },
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('merges X-Target-URL with existing headers', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://ollama.com/v1/chat/completions', {
            headers: { 'Authorization': 'Bearer token', 'Content-Type': 'application/json' },
        });

        const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = calledInit?.headers as Headers;
        expect(headers.get('X-Target-URL')).toBe('https://ollama.com');
        expect(headers.get('Authorization')).toBe('Bearer token');
        expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('falls back to same-origin when PROXY_URL is empty', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: '' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.search.brave.com/res/v1/web/search?q=test');

        const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
        // Empty proxyBase → relative URL (same-origin)
        expect(calledUrl).toBe('/res/v1/web/search?q=test');
    });
});
