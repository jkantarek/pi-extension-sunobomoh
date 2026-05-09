import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scheduleNextTick } from './tick-logic.js';

describe('scheduleNextTick', () => {
  let timeouts: NodeJS.Timeout[] = [];

  beforeEach(() => {
    timeouts = [];
  });

  afterEach(() => {
    for (const timeout of timeouts) clearTimeout(timeout);
  });

  it('returns a timeout handle', () => {
    const tick = (): Promise<void> => Promise.resolve();
    const handle = scheduleNextTick(undefined, tick, 10);
    expect(handle).toBeDefined();
    timeouts.push(handle);
  });

  it('clears existing handle before scheduling new timeout', async () => {
    let callCount = 0;
    const tick = (): Promise<void> => {
      callCount += 1;
      return Promise.resolve();
    };

    // Schedule first timeout with a long delay
    const firstHandle = scheduleNextTick(undefined, tick, 1000);
    timeouts.push(firstHandle);

    // Schedule second timeout with the first handle - should cancel the first
    const secondHandle = scheduleNextTick(firstHandle, tick, 10);
    timeouts.push(secondHandle);

    // Wait for the short timeout to fire
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should have been called once (second timeout only)
    expect(callCount).toBe(1);
  });
});
