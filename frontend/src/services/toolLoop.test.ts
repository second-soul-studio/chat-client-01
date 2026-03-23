import { describe, it, expect } from 'vitest';

// We test the internal context-expansion logic (pure function, no fetch needed)
import { expandToolCallsToApiMessages } from './toolLoop';
import type { ToolCallRecord } from '@/types';

describe('expandToolCallsToApiMessages', () => {
    it('expands a completed ToolCallRecord into assistant + tool messages', () => {
        const records: ToolCallRecord[] = [{
            id: 'call_1',
            toolName: 'brave_web_search',
            query: 'test query',
            status: 'complete',
            results: [{ title: 'A', url: 'https://a.com', snippet: 'S' }],
        }];

        const messages = expandToolCallsToApiMessages(records, 'Response text');

        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe('assistant');
        expect(messages[0].tool_calls).toHaveLength(1);
        expect(messages[0].tool_calls![0].id).toBe('call_1');
        expect(messages[1].role).toBe('tool');
        expect(messages[1].tool_call_id).toBe('call_1');
        expect(JSON.parse(messages[1].content as string).results).toHaveLength(1);
        expect(messages[2].role).toBe('assistant');
        expect(messages[2].content).toBe('Response text');
    });

    it('uses error content for failed tool calls', () => {
        const records: ToolCallRecord[] = [{
            id: 'call_err',
            toolName: 'brave_web_search',
            query: 'fail',
            status: 'error',
            errorMessage: 'API down',
        }];

        const messages = expandToolCallsToApiMessages(records, 'Sorry');
        const toolMsg = messages.find(m => m.role === 'tool');
        expect(JSON.parse(toolMsg!.content as string)).toEqual({ error: 'API down' });
    });
});
