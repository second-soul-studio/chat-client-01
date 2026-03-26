import { countTokens } from '@/services/tokenCount';

export interface ChunkResult {
    content: string;
    startOffset: number;
    endOffset: number;
}

/**
 * Splits `text` into overlapping chunks of at most `chunkSize` tokens,
 * with `chunkOverlap` tokens of overlap between consecutive chunks.
 *
 * Strategy (in order):
 * 1. Markdown header split (## / ###)
 * 2. Paragraph split (\n\n), merging small paragraphs
 * 3. Character sliding-window fallback
 */
export function chunkDocument(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
): ChunkResult[] {
    if (!text.trim()) return [];

    const sections = splitByMarkdownHeaders(text);
    if (sections.length > 1) {
        return mergeAndOverlap(sections, chunkSize, chunkOverlap);
    }

    const paragraphs = splitByParagraphs(text);
    if (paragraphs.length > 1) {
        return mergeAndOverlap(paragraphs, chunkSize, chunkOverlap);
    }

    return characterSplit(text, chunkSize, chunkOverlap);
}

// ─── Strategy 1: Markdown headers ─────────────────────────────────────────────

interface TextSpan {
    content: string;
    startOffset: number;
    endOffset: number;
}

function splitByMarkdownHeaders(text: string): TextSpan[] {
    // Split on lines that start with ## or ### (keeping the heading in the chunk)
    const headerRe = /(?=^#{2,3} )/m;
    const raw = text.split(headerRe);
    const spans: TextSpan[] = [];
    let offset = 0;

    for (const part of raw) {
        if (!part.trim()) {
            offset += part.length;
            continue;
        }
        spans.push({ content: part.trimEnd(), startOffset: offset, endOffset: offset + part.trimEnd().length });
        offset += part.length;
    }
    return spans;
}

// ─── Strategy 2: Paragraphs ────────────────────────────────────────────────────

function splitByParagraphs(text: string): TextSpan[] {
    const parts = text.split(/\n\n+/);
    const spans: TextSpan[] = [];
    let offset = 0;

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) {
            offset += part.length + 2; // account for the \n\n separator
            continue;
        }
        const start = text.indexOf(part, offset);
        const end = start + part.length;
        spans.push({ content: trimmed, startOffset: start, endOffset: end });
        offset = end;
    }
    return spans;
}

// ─── Merge small spans and apply overlap ──────────────────────────────────────

function mergeAndOverlap(
    spans: TextSpan[],
    chunkSize: number,
    chunkOverlap: number,
): ChunkResult[] {
    // First pass: merge adjacent spans that are too small into groups <= chunkSize
    const groups: TextSpan[][] = [];
    let current: TextSpan[] = [];
    let currentTokens = 0;

    for (const span of spans) {
        const tokens = countTokens(span.content);
        if (current.length > 0 && currentTokens + tokens > chunkSize) {
            groups.push(current);
            current = [span];
            currentTokens = tokens;
        } else {
            current.push(span);
            currentTokens += tokens;
        }
    }
    if (current.length > 0) groups.push(current);

    // Second pass: build ChunkResult with overlap prefix
    const results: ChunkResult[] = [];
    let overlapSuffix = '';

    for (const group of groups) {
        const body = group.map(s => s.content).join('\n\n');
        const content = overlapSuffix ? `${overlapSuffix}\n\n${body}` : body;

        const startOffset = group[0].startOffset;
        const endOffset = group[group.length - 1].endOffset;

        results.push({ content, startOffset, endOffset });

        // Compute overlap suffix from the end of `body`
        overlapSuffix = overlapTokens(body, chunkOverlap);
    }

    return results;
}

// ─── Strategy 3: Character sliding window ─────────────────────────────────────

function characterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
): ChunkResult[] {
    // Approximate characters per token (cl100k_base ≈ 4 chars/token)
    const charsPerToken = 4;
    const windowChars = chunkSize * charsPerToken;
    const stepChars = (chunkSize - chunkOverlap) * charsPerToken;

    if (stepChars <= 0) {
        return [{ content: text, startOffset: 0, endOffset: text.length }];
    }

    const results: ChunkResult[] = [];
    let pos = 0;

    while (pos < text.length) {
        const end = Math.min(pos + windowChars, text.length);
        results.push({ content: text.slice(pos, end), startOffset: pos, endOffset: end });
        if (end === text.length) break;
        pos += stepChars;
    }

    return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the last `tokenCount` tokens worth of text from `text`. */
function overlapTokens(text: string, tokenCount: number): string {
    if (tokenCount <= 0) return '';
    // Work backwards by words (cheap approximation before tokenising)
    const words = text.split(/\s+/);
    let suffix = '';
    for (let i = words.length - 1; i >= 0; i--) {
        const candidate = words.slice(i).join(' ');
        if (countTokens(candidate) >= tokenCount) {
            return candidate;
        }
        suffix = candidate;
    }
    return suffix;
}
