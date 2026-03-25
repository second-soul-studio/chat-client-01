const queues = new Map<string, Promise<void>>();

/**
 * Enqueue a function to run after any pending calls for the same providerId.
 * A minimum gap (ms) is inserted before each queued call to avoid rate-limit bursts.
 * The first call (no existing queue) runs immediately.
 */
export function enqueue<T>(
    providerId: string,
    fn: () => Promise<T>,
    gapMs = 5000,
): Promise<T> {
    const existing = queues.get(providerId);
    const tail = existing ?? Promise.resolve();

    const next = existing
        ? tail.then(() => delay(gapMs)).then(() => fn())
        : fn();

    queues.set(
        providerId,
        next.then(() => {}, () => {}),
    );

    return next;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
