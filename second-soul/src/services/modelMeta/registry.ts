import type { ModelMetaFetcher } from './types';
import { MistralFetcher } from './MistralFetcher';
import { NanoGptFetcher } from './NanoGptFetcher';
import { OllamaFetcher } from './OllamaFetcher';
import { OpenAIListFetcher } from './OpenAIListFetcher';
import { OpenRouterFetcher } from './OpenRouterFetcher';

// Maps metaFetcherKey (stored on Provider) to the concrete fetcher implementation.
// Using 'openai-list' for plain OpenAI-compatible providers without pricing data
// lets users assign the right fetcher to custom providers via the key field.
const registry: Record<string, ModelMetaFetcher> = {
    'nano-gpt':    new NanoGptFetcher(),
    'mistral':     new MistralFetcher(),
    'openai-list': new OpenAIListFetcher(),
    'openrouter':  new OpenRouterFetcher(),
    'ollama':      new OllamaFetcher(),
};

export function getFetcher(key: string): ModelMetaFetcher | null {
    return registry[key] ?? null;
}
