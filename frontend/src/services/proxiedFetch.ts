import proxyRoutes from '@/config/proxyRoutes.json';

interface ProxyRoute {
    domain: string;
    requiresProxy: boolean;
}

const routes = proxyRoutes as ProxyRoute[];

function getProxyUrl(): string {
    return (globalThis as { __ENV__?: { PROXY_URL?: string } }).__ENV__?.PROXY_URL ?? '';
}

export async function proxiedFetch(
    url: string | URL,
    init?: RequestInit,
): Promise<Response> {
    const parsed = new URL(url);
    const origin = parsed.origin; // e.g. "https://api.search.brave.com"

    const route = routes.find(r => r.domain === origin && r.requiresProxy);

    if (!route) {
        return fetch(url, init);
    }

    const proxyBase = getProxyUrl();
    const rewritten = `${proxyBase}${parsed.pathname}${parsed.search}`;

    const existingHeaders = init?.headers ?? {};
    const headers: Record<string, string> = {
        ...(existingHeaders as Record<string, string>),
        'X-Target-URL': route.domain,
    };

    return fetch(rewritten, { ...init, headers });
}
