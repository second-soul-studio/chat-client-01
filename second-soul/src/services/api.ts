import type { Message, AppSettings, Persona } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';

// ─── Token Estimation ─────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function buildContextWindow(messages: Message[], maxTokens: number, systemPrompt: string): Message[] {
    const systemTokens = estimateTokens(systemPrompt);
    let budget = maxTokens - systemTokens - 500; // reserve for response
    const result: Message[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(messages[i].content);
        if (budget - tokens < 0) break;
        budget -= tokens;
        result.unshift(messages[i]);
    }

    return result;
}

// ─── CoT Extraction ───────────────────────────────────────────────────────────

export function extractThinkingFromText(raw: string): { thinking?: string; content: string } {
    const match = raw.match(/^<think>([\s\S]*?)<\/think>\s*/);
    if (!match) return { content: raw };
    return { thinking: match[1].trim(), content: raw.slice(match[0].length) };
}

// ─── Header Builders ─────────────────────────────────────────────────────────

function buildOpenAIHeaders(apiKey: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };
}

function buildAnthropicHeaders(apiKey: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
    };
}

// ─── Send Message ─────────────────────────────────────────────────────────────

export interface SendMessageOptions {
    messages: Message[];
    settings: AppSettings;
    persona: Persona;
    provider: Provider;
    model: ModelConfig;
    thinkingEnabled: boolean;
    onChunk?: (content: string) => void;
}

export async function sendMessage(options: SendMessageOptions): Promise<{ content: string; thinking?: string }> {
    const { messages, settings, persona, provider, model, thinkingEnabled, onChunk } = options;

    // Build system prompt: global → persona → per-model user addition
    const systemPrompt = [
        settings.globalSystemPrompt,
        persona.systemPrompt,
        model.userSystemPrompt,
    ].filter(Boolean).join('\n\n');

    // When thinking is requested and the model has a dedicated CoT slug (nano-gpt pattern),
    // swap to that slug. Otherwise use the base slug.
    const effectiveSlug = (thinkingEnabled && model.cotSlug) ? model.cotSlug : model.slug;
    const effectiveCot = thinkingEnabled && (!!model.cotSlug || model.supportsCot);

    const maxContextTokens = 8000; // TODO: make configurable per model
    const contextMessages = buildContextWindow(
        messages.filter(m => m.role !== 'system'),
        maxContextTokens,
        systemPrompt,
    );

    // Merge params: model defaults → persona overrides
    const temperature = persona.paramOverrides?.temperature ?? model.defaultTemperature;
    const topP = persona.paramOverrides?.topP ?? model.defaultTopP;
    const maxOutputTokens = persona.paramOverrides?.maxOutputTokens ?? model.maxOutputTokens;

    if (provider.adapter === 'anthropic') {
        return sendAnthropicMessage({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            modelSlug: effectiveSlug,
            systemPrompt,
            contextMessages,
            temperature,
            topP,
            maxOutputTokens,
            onChunk,
        });
    }

    // openai + ollama both use OpenAI-compatible format
    return sendOpenAIMessage({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        modelSlug: effectiveSlug,
        systemPrompt,
        contextMessages,
        temperature,
        topP,
        maxOutputTokens,
        supportsCot: effectiveCot,
        onChunk,
    });
}

// ─── OpenAI-Compatible Adapter ────────────────────────────────────────────────

interface OpenAIAdapterOptions {
    baseUrl: string;
    apiKey: string;
    modelSlug: string;
    systemPrompt: string;
    contextMessages: Message[];
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    supportsCot: boolean;
    onChunk?: (content: string) => void;
}

async function sendOpenAIMessage(opts: OpenAIAdapterOptions): Promise<{ content: string; thinking?: string }> {
    const body = {
        model: opts.modelSlug,
        messages: [
            { role: 'system', content: opts.systemPrompt },
            ...opts.contextMessages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: opts.temperature,
        top_p: opts.topP,
        max_tokens: opts.maxOutputTokens,
        stream: !!opts.onChunk,
    };

    const response = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(opts.apiKey),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
    }

    if (opts.onChunk && response.body) {
        const raw = await readStream(response.body, opts.onChunk);
        if (opts.supportsCot) return extractThinkingFromText(raw);
        return { content: raw };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (opts.supportsCot) return extractThinkingFromText(raw);
    return { content: raw };
}

// ─── Anthropic Adapter ────────────────────────────────────────────────────────

interface AnthropicAdapterOptions {
    baseUrl: string;
    apiKey: string;
    modelSlug: string;
    systemPrompt: string;
    contextMessages: Message[];
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    onChunk?: (content: string) => void;
}

async function sendAnthropicMessage(opts: AnthropicAdapterOptions): Promise<{ content: string; thinking?: string }> {
    const body = {
        model: opts.modelSlug,
        system: opts.systemPrompt,
        messages: opts.contextMessages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content })),
        temperature: opts.temperature,
        top_p: opts.topP,
        max_tokens: opts.maxOutputTokens,
        stream: !!opts.onChunk,
    };

    const response = await fetch(`${opts.baseUrl}/messages`, {
        method: 'POST',
        headers: buildAnthropicHeaders(opts.apiKey),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    if (opts.onChunk && response.body) {
        // Anthropic streaming uses server-sent events with different event types
        const content = await readAnthropicStream(response.body, opts.onChunk);
        return content;
    }

    const data = await response.json();
    const thinkingBlock = data.content?.find((b: { type: string }) => b.type === 'thinking');
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
    return {
        thinking: thinkingBlock?.thinking,
        content: textBlock?.text ?? '',
    };
}

// ─── Stream Readers ───────────────────────────────────────────────────────────

async function readStream(body: ReadableStream, onChunk: (content: string) => void): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                    fullContent += delta;
                    onChunk(fullContent);
                }
            } catch {
                // Skip malformed chunks
            }
        }
    }

    return fullContent;
}

async function readAnthropicStream(
    body: ReadableStream,
    onChunk: (content: string) => void,
): Promise<{ content: string; thinking?: string }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let textContent = '';
    let thinkingContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta') {
                    const delta = parsed.delta;
                    if (delta.type === 'text_delta') {
                        textContent += delta.text;
                        onChunk(textContent);
                    } else if (delta.type === 'thinking_delta') {
                        thinkingContent += delta.thinking;
                    }
                }
            } catch {
                // Skip malformed chunks
            }
        }
    }

    return {
        content: textContent,
        thinking: thinkingContent || undefined,
    };
}

// ─── Provider Test ────────────────────────────────────────────────────────────

export async function testProvider(provider: Provider): Promise<boolean> {
    try {
        if (provider.adapter === 'anthropic') {
            // Anthropic doesn't have a /models endpoint — use a minimal completion
            const res = await fetch(`${provider.baseUrl}/messages`, {
                method: 'POST',
                headers: buildAnthropicHeaders(provider.apiKey),
                body: JSON.stringify({
                    model: 'claude-haiku-20240307',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'ping' }],
                }),
                signal: AbortSignal.timeout(5000),
            });
            return res.ok || res.status === 400; // 400 = valid key, wrong model — still reachable
        }

        const res = await fetch(`${provider.baseUrl}/models`, {
            headers: buildOpenAIHeaders(provider.apiKey),
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
