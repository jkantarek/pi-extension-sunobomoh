import { describe, expect, it } from 'vitest';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from './scheduler.js';
import { ok, type Result } from '../core/result.js';
import { toIsoTimestamp, type IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import { createMockRunner, createMockSteerer } from './test-fixtures.js';

const clock = { now: (): IsoTimestamp => toIsoTimestamp(new Date()) };

describe('createScheduler - triggerTick steering branches', () => {
  it('second triggerTick skips steering (covers checkIfSteeringDue false branch)', async () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, clock);
    await scheduler.triggerTick(); // steering due (first run)
    expect(steerer.calls).toBe(1);
    await scheduler.triggerTick(); // steering NOT due (just ran)
    expect(steerer.calls).toBe(1);
    expect(runner.calls).toBe(2);
  });
});

describe('createScheduler - tick skips steering when recently done', () => {
  it('tick does not call steering when lastSteeringAt is recent', async () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, clock);
    await scheduler.triggerSteering(); // sets lastSteeringAt to now
    expect(steerer.calls).toBe(1);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    scheduler.stop();
    expect(runner.calls).toBe(1);
    expect(steerer.calls).toBe(1); // not called again by tick
  });
});

describe('createScheduler - stop during active tick', () => {
  it('prevents next tick when stopped while watcher is running', async () => {
    let resolveWatcher!: () => void;
    const watcherPromise = new Promise<Result<readonly StateEntry[]>>((resolve) => {
      resolveWatcher = (): void => {
        resolve(ok([]));
      };
    });
    const runner = (): Promise<Result<readonly StateEntry[]>> => watcherPromise;
    const steerer = (): Promise<Result<void>> => Promise.resolve(ok(undefined));
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner, steerer, clock);

    scheduler.start();
    scheduler.stop();
    resolveWatcher();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(scheduler.state.running).toBe(false);
    expect(scheduler.state.tickCount).toBe(1);
  });
});
