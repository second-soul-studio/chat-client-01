import { get_encoding } from 'tiktoken';

let enc: ReturnType<typeof get_encoding> | null = null;

function getEncoder() {
    if (!enc) {
        enc = get_encoding('cl100k_base');
    }
    return enc;
}

export function countTokens(text: string): number {
    try {
        return getEncoder().encode(text).length;
    } catch {
        return Math.ceil(text.length / 4);
    }
}
