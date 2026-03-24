import type { Message, AppSettings, Persona, ToolCallRecord, ToolConfig } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
import { sendMessage, buildOpenAIHeaders, readStream, extractThinkingFromText, buildContextWindow } from './api';
import { proxiedFetch } from './proxiedFetch';
import { getToolByName, getAllTools } from './tools/registry';
import type { ToolDefinition } from './tools/types';

// Side-effect import: registers braveSearch into the registry
import './tools/braveSearch';

// ─── Context Expansion ────────────────────────────────────────────────────────

interface RawApiMessage {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
}

/**
 * Converts stored ToolCallRecord[] (from a persisted Message) back into the
 * OpenAI multi-turn wire format: assistant(tool_calls) + tool(results)... + assistant(content).
 */
export function expandToolCallsToApiMessages(
    toolCalls: ToolCallRecord[],
    assistantContent: string,
): RawApiMessage[] {
    const messages: RawApiMessage[] = [];

    messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.toolName,
                arguments: JSON.stringify({ query: tc.query }),
            },
        })),
    });

    for (const tc of toolCalls) {
        const content = tc.status === 'error'
            ? JSON.stringify({ error: tc.errorMessage ?? 'Unknown error' })
            : JSON.stringify({ results: tc.results ?? [] });

        messages.push({
            role: 'tool',
            content,
            tool_call_id: tc.id,
        });
    }

    messages.push({ role: 'assistant', content: assistantContent });

    return messages;
}

// ─── Context Builder ─────────────────────────────────────────────────────────

/**
 * Converts the app's Message[] into the raw OpenAI message array,
 * expanding any stored toolCalls into multi-turn format.
 */
function buildRawContext(messages: Message[], systemPrompt: string): RawApiMessage[] {
    const raw: RawApiMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
        if (msg.role === 'system') continue;

        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            raw.push(...expandToolCallsToApiMessages(msg.toolCalls, msg.content));
        } else {
            raw.push({ role: msg.role, content: msg.content });
        }
    }

    return raw;
}

// ─── Tool Loop ────────────────────────────────────────────────────────────────

export interface ToolLoopOptions {
    messages: Message[];
    settings: AppSettings;
    persona: Persona;
    provider: Provider;
    model: ModelConfig;
    toolConfigs: ToolConfig[];
    thinkingEnabled: boolean;
    onChunk?: (content: string) => void;
    onThinkingChunk?: (thinking: string) => void;
    onToolCall?: (record: ToolCallRecord) => void;
    onToolResult?: (record: ToolCallRecord) => void;
}

export interface ToolLoopResult {
    content: string;
    thinking?: string;
    toolCalls: ToolCallRecord[];
}

export async function toolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
    const { provider, model, toolConfigs } = opts;

    // Anthropic and tools: out of scope for v1 — fall through to sendMessage
    const activeToolDefs = toolConfigs
        .filter(c => c.enabled)
        .map(c => getToolByName(
            getAllTools().find(t => t.configId === c.id)?.name ?? ''
        ))
        .filter((t): t is ToolDefinition => t !== null);

    if (activeToolDefs.length === 0 || provider.adapter === 'anthropic') {
        const result = await sendMessage({
            messages: opts.messages,
            settings: opts.settings,
            persona: opts.persona,
            provider,
            model,
            thinkingEnabled: opts.thinkingEnabled,
            onChunk: opts.onChunk,
            onThinkingChunk: opts.onThinkingChunk,
        });
        return { ...result, toolCalls: [] };
    }

    // Build system prompt (mirrors api.ts logic)
    const systemPrompt = [
        opts.settings.globalSystemPrompt,
        opts.persona.systemPrompt,
        model.userSystemPrompt,
    ].filter(Boolean).join('\n\n');

    const effectiveSlug = (opts.thinkingEnabled && model.cotSlug) ? model.cotSlug : model.slug;
    const temperature = opts.persona.paramOverrides?.temperature ?? model.defaultTemperature;
    const topP = opts.persona.paramOverrides?.topP ?? model.defaultTopP;
    const maxOutputTokens = opts.persona.paramOverrides?.maxOutputTokens ?? model.maxOutputTokens;

    let baseUrl = provider.baseUrl;
    if (provider.adapter === 'ollama' || provider.adapter === 'ollama-cloud') {
        baseUrl = baseUrl.replace(/\/v1\/?$/, '') + '/v1';
    }
    const extraHeaders: Record<string, string> = {};

    const openAITools = activeToolDefs.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const collectedToolCalls: ToolCallRecord[] = [];
    const maxContextTokens = 8000;
    const trimmedMessages = buildContextWindow(
        opts.messages.filter(m => m.role !== 'system'),
        maxContextTokens,
        systemPrompt,
    );
    let context = buildRawContext(trimmedMessages, systemPrompt);

    for (let iter = 0; iter < 5; iter++) {
        const response = await proxiedFetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { ...buildOpenAIHeaders(provider.apiKey), ...extraHeaders },
            body: JSON.stringify({
                model: effectiveSlug,
                messages: context,
                tools: openAITools,
                tool_choice: 'auto',
                temperature,
                top_p: topP,
                max_tokens: maxOutputTokens,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API error ${response.status}: ${error}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        if (choice?.finish_reason !== 'tool_calls' || !choice.message?.tool_calls?.length) {
            break;
        }

        // Execute all tool calls in parallel
        const rawToolCalls: Array<{ id: string; function: { name: string; arguments: string } }> =
            choice.message.tool_calls;

        const records = await Promise.all(
            rawToolCalls.map(async (tc) => {
                let args: Record<string, unknown>;
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    args = {};
                }

                const record: ToolCallRecord = {
                    id: tc.id,
                    toolName: tc.function.name,
                    query: (args.query as string) ?? tc.function.name,
                    status: 'pending',
                };
                opts.onToolCall?.({ ...record });

                try {
                    const toolDef = getToolByName(tc.function.name);
                    const toolConfig = toolConfigs.find(c => toolDef && c.id === toolDef.configId);
                    if (!toolDef || !toolConfig) throw new Error(`Tool "${tc.function.name}" not found or not configured`);

                    const result = await toolDef.execute(args, toolConfig);
                    const completed: ToolCallRecord = { ...record, status: 'complete', results: result.results };
                    opts.onToolResult?.({ ...completed });
                    return completed;
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    const failed: ToolCallRecord = { ...record, status: 'error', errorMessage };
                    opts.onToolResult?.({ ...failed });
                    return failed;
                }
            }),
        );

        collectedToolCalls.push(...records);

        // Append tool turn to context
        context.push({
            role: 'assistant',
            content: null,
            tool_calls: rawToolCalls.map(tc => ({ id: tc.id, type: 'function', function: tc.function })),
        });
        for (const record of records) {
            const content = record.status === 'error'
                ? JSON.stringify({ error: record.errorMessage })
                : JSON.stringify({ results: record.results ?? [] });
            context.push({ role: 'tool', content, tool_call_id: record.id });
        }
    }

    // Final streaming turn — no tools, get the actual response
    const finalResponse = await proxiedFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...buildOpenAIHeaders(provider.apiKey), ...extraHeaders },
        body: JSON.stringify({
            model: effectiveSlug,
            messages: context,
            temperature,
            top_p: topP,
            max_tokens: maxOutputTokens,
            stream: !!(opts.onChunk || opts.onThinkingChunk),
        }),
    });

    if (!finalResponse.ok) {
        const error = await finalResponse.text();
        throw new Error(`API error ${finalResponse.status}: ${error}`);
    }

    let content = '';
    let thinking: string | undefined;

    if ((opts.onChunk || opts.onThinkingChunk) && finalResponse.body) {
        const streamed = await readStream(finalResponse.body, opts.onChunk, opts.onThinkingChunk);
        content = streamed.content;
        thinking = streamed.thinking;
        if (!thinking && model.supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    } else {
        const data = await finalResponse.json();
        content = data.choices?.[0]?.message?.content ?? '';
        if (model.supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    }

    return { content, thinking, toolCalls: collectedToolCalls };
}
