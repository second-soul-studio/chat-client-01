import { describe, it, expect, vi } from 'vitest';
import { retry502 } from './api';

function makeResponse(status: number): Response {
    return new Response('', { status });
}

describe('retry502', () => {
    it('returns immediately when response is not 502', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(200));
        const result = await retry502(fn);
        expect(result.status).toBe(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on 502 and returns success on second attempt', async () => {
        const fn = vi.fn()
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(200));
        const onRetry = vi.fn();
        const result = await retry502(fn, onRetry, 5, 0);
        expect(result.status).toBe(200);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledWith(2, 5);
    });

    it('calls onRetry with incrementing attempt numbers', async () => {
        const fn = vi.fn()
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(200));
        const onRetry = vi.fn();
        await retry502(fn, onRetry, 5, 0);
        expect(onRetry).toHaveBeenNthCalledWith(1, 2, 5);
        expect(onRetry).toHaveBeenNthCalledWith(2, 3, 5);
    });

    it('does NOT call onRetry on the first attempt', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(200));
        const onRetry = vi.fn();
        await retry502(fn, onRetry, 5, 0);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('throws after maxAttempts consecutive 502s', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(502));
        await expect(retry502(fn, undefined, 3, 0)).rejects.toThrow('502 after 3 attempts');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-502 errors', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(503));
        const result = await retry502(fn, undefined, 5, 0);
        // non-502 is returned as-is, caller decides what to do
        expect(result.status).toBe(503);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
