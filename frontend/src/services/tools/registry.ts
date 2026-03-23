import type { ToolDefinition } from './types';

const tools: Record<string, ToolDefinition> = {};

export function registerTool(tool: ToolDefinition): void {
    tools[tool.name] = tool;
}

export function getToolByName(name: string): ToolDefinition | null {
    return tools[name] ?? null;
}

export function getAllTools(): ToolDefinition[] {
    return Object.values(tools);
}
