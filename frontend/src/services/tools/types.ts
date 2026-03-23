import type { ToolConfig } from '@/types';

export interface ToolDefinition {
    /** OpenAI function name, e.g. 'brave_web_search'. Must match the name sent in tool_calls. */
    name: string;
    /** The tool config ID this tool reads its API key and settings from. */
    configId: string;
    /** Description shown to the model. */
    description: string;
    /** JSON Schema for the function's arguments object. */
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, config: ToolConfig) => Promise<ToolResult>;
}

export interface ToolResult {
    results: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
}
