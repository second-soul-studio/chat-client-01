import { v4 as uuidv4 } from 'uuid';
import type { Message, MemoryPendingEntry, MemoryType } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
import {
    getMemoryMeta, saveMemoryMeta,
    getMemoryTopics, saveMemoryTopic, deleteMemoryTopic,
    getAcceptedPendingEntries, clearAcceptedPendingEntries,
} from '@/services/db';
import { buildOpenAIHeaders, retry502, readStream, readAnthropicStream } from '@/services/api';
import { proxiedFetch } from '@/services/proxiedFetch';
import { enqueue } from '@/services/requestQueue';
import DETECTION_PROMPT from '@/data/prompts/memory-detection.md?raw';
import CONSOLIDATION_PROMPT from '@/data/prompts/memory-consolidation.md?raw';

// ─── LLM Helper (non-streaming, simple) ──────────────────────────────────────

async function callMemoryWorker(
    systemPrompt: string,
    userMessage: string,
    provider: Provider,
    model: ModelConfig,
    onRetry?: (attempt: number, max: number) => void,
): Promise<string> {
    return enqueue(
        provider.id,
        () => _callMemoryWorkerInner(systemPrompt, userMessage, provider, model, onRetry),
    );
}

async function _callMemoryWorkerInner(
    systemPrompt: string,
    userMessage: string,
    provider: Provider,
    model: ModelConfig,
    onRetry?: (attempt: number, max: number) => void,
): Promise<string> {
    if (provider.adapter === 'anthropic') {
        return callAnthropic(systemPrompt, userMessage, provider, model, onRetry);
    }

    let baseUrl = provider.baseUrl;
    if (provider.adapter === 'ollama' || provider.adapter === 'ollama-cloud') {
        baseUrl = baseUrl.replace(/\/v1\/?$/, '') + '/v1';
    }

    const response = await retry502(() => proxiedFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(provider.apiKey),
        body: JSON.stringify({
            model: model.slug,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            stream: true,
        }),
    }), onRetry);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker error ${response.status}: ${error}`);
    }

    const { content } = await readStream(response.body!, undefined, undefined);
    return content;
}

async function callAnthropic(
    systemPrompt: string,
    userMessage: string,
    provider: Provider,
    model: ModelConfig,
    onRetry?: (attempt: number, max: number) => void,
): Promise<string> {
    const response = await retry502(() => proxiedFetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: model.slug,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            temperature: 0.3,
            max_tokens: 4096,
            stream: true,
        }),
    }), onRetry);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker (Anthropic) error ${response.status}: ${error}`);
    }

    const { content } = await readAnthropicStream(response.body!, undefined, undefined);
    return content;
}

// ─── Detection ────────────────────────────────────────────────────────────────

export async function detectMemories(
    messages: Message[],
    personaId: string,
    chatId: string,
    provider: Provider,
    model: ModelConfig,
    existingContext?: {
        indexContent: string;
        acceptedPending: MemoryPendingEntry[];
        nsfwEnabled: boolean;
    },
    onRetry?: (attempt: number, max: number) => void,
): Promise<MemoryPendingEntry[]> {
    const conversation = messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

    let alreadyKnown = '';
    if (existingContext) {
        const parts: string[] = [];

        if (existingContext.indexContent) {
            parts.push(`## ALREADY KNOWN (summary)\n${existingContext.indexContent}`);
        }

        const pending = existingContext.nsfwEnabled
            ? existingContext.acceptedPending
            : existingContext.acceptedPending.filter(e => e.type !== 'nsfw');

        if (pending.length > 0) {
            parts.push(
                '## ALREADY KNOWN (recent, not yet consolidated)\n' +
                pending.map(e => `- [${e.type}] ${e.content}`).join('\n')
            );
        }

        alreadyKnown = parts.join('\n\n');
    }

    const userMessage = alreadyKnown
        ? `${alreadyKnown}\n\n## CONVERSATION TO ANALYSE\n${conversation}`
        : `Conversation:\n${conversation}`;

    const raw = await callMemoryWorker(
        DETECTION_PROMPT,
        userMessage,
        provider,
        model,
        onRetry,
    );

    const parsed = parseDetectionOutput(raw);

    return parsed.map(item => ({
        id: uuidv4(),
        personaId,
        type: item.type,
        content: item.content,
        extractedAt: Date.now(),
        sourceChatId: chatId,
        status: 'suggested' as const,
    }));
}

function parseDetectionOutput(raw: string): Array<{ type: MemoryType; content: string }> {
    const validTypes: MemoryType[] = ['emotional', 'hard_fact', 'preference', 'event', 'nsfw'];

    try {
        // Strip markdown fences if the model added them anyway
        const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
        const arr = JSON.parse(cleaned);

        if (!Array.isArray(arr)) return [];

        return arr
            .filter((item: unknown) => {
                if (typeof item !== 'object' || item === null) return false;
                const obj = item as Record<string, unknown>;
                return validTypes.includes(obj.type as MemoryType) && typeof obj.content === 'string' && obj.content.length > 0;
            })
            .map((item: Record<string, unknown>) => ({
                type: item.type as MemoryType,
                content: (item.content as string).slice(0, 500),
            }));
    } catch {
        return [];
    }
}

// ─── Consolidation ────────────────────────────────────────────────────────────

export async function consolidateMemory(
    personaId: string,
    provider: Provider,
    model: ModelConfig,
    onRetry?: (attempt: number, max: number) => void,
): Promise<void> {
    const meta = await getMemoryMeta(personaId);
    const topics = await getMemoryTopics(personaId);
    const pending = await getAcceptedPendingEntries(personaId);

    if (pending.length === 0 && topics.length === 0) return;

    // Build the current state for the model
    let currentState = '';

    if (meta?.indexContent) {
        currentState += `## CURRENT INDEX\n${meta.indexContent}\n\n`;
    }

    for (const topic of topics) {
        currentState += `## CURRENT TOPIC: ${topic.slug}\n${topic.content}\n\n`;
    }

    if (pending.length > 0) {
        currentState += '## NEW OBSERVATIONS\n';
        currentState += pending.map(e => `- [${e.type}] ${e.content}`).join('\n');
    }

    const raw = await callMemoryWorker(
        CONSOLIDATION_PROMPT,
        currentState,
        provider,
        model,
        onRetry,
    );

    const result = parseConsolidationOutput(raw);

    // Write new topics to DB
    // First, remove old topics for this persona
    for (const oldTopic of topics) {
        await deleteMemoryTopic(oldTopic.id);
    }

    // Save new topics
    for (const newTopic of result.topics) {
        await saveMemoryTopic({
            id: `${personaId}-${newTopic.slug}`,
            personaId,
            slug: newTopic.slug,
            content: newTopic.content,
            updatedAt: Date.now(),
        });
    }

    // Clear pending entries that were consolidated
    await clearAcceptedPendingEntries(personaId);

    // Update meta
    await saveMemoryMeta({
        personaId,
        indexContent: result.index,
        lastConsolidatedAt: Date.now(),
        pendingCount: 0,
        nsfwEnabled: meta?.nsfwEnabled ?? true,
    });
}

export function parseConsolidationOutput(raw: string): {
    index: string;
    topics: Array<{ slug: string; content: string }>;
} {
    const lines = raw.split('\n');
    let index = '';
    const topics: Array<{ slug: string; content: string }> = [];

    let currentSection: 'none' | 'index' | 'topic' = 'none';
    let currentSlug = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        const indexMatch = line.match(/^## INDEX\s*$/i);
        const topicMatch = line.match(/^## TOPIC:\s*(.+)$/i);

        if (indexMatch) {
            // Flush previous topic if any
            if (currentSection === 'topic' && currentSlug) {
                topics.push({ slug: currentSlug, content: currentContent.join('\n').trim() });
            }
            currentSection = 'index';
            currentContent = [];
            continue;
        }

        if (topicMatch) {
            // Flush previous section
            if (currentSection === 'index') {
                index = currentContent.join('\n').trim();
            } else if (currentSection === 'topic' && currentSlug) {
                topics.push({ slug: currentSlug, content: currentContent.join('\n').trim() });
            }
            currentSection = 'topic';
            currentSlug = topicMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
            currentContent = [];
            continue;
        }

        currentContent.push(line);
    }

    // Flush last section
    if (currentSection === 'index') {
        index = currentContent.join('\n').trim();
    } else if (currentSection === 'topic' && currentSlug) {
        topics.push({ slug: currentSlug, content: currentContent.join('\n').trim() });
    }

    if (!index && topics.length === 0) {
        throw new Error('Could not parse consolidation output');
    }

    return { index, topics };
}

// ─── Prompt Injection ─────────────────────────────────────────────────────────

export async function formatMemoryForPrompt(personaId: string): Promise<string> {
    const meta = await getMemoryMeta(personaId);
    if (!meta) return '';

    const topics = await getMemoryTopics(personaId);
    const pending = await getAcceptedPendingEntries(personaId);

    const filteredPending = meta.nsfwEnabled
        ? pending
        : pending.filter(e => e.type !== 'nsfw');

    if (topics.length === 0 && filteredPending.length === 0) return '';

    let section = '## Your Memories of This User\n\n';

    if (meta.indexContent) {
        section += meta.indexContent + '\n\n';
    }

    for (const topic of topics) {
        section += `### ${topic.slug}\n${topic.content}\n\n`;
    }

    if (filteredPending.length > 0) {
        section += 'Recent (not yet consolidated):\n';
        section += filteredPending.map(e => `• ${e.content}`).join('\n');
    }

    return section.trim();
}

// ─── Detection Helper ─────────────────────────────────────────────────────────

export function shouldRunDetection(
    turnsSinceLastDetection: number,
    detectionInterval: number,
): boolean {
    return turnsSinceLastDetection >= detectionInterval;
}
