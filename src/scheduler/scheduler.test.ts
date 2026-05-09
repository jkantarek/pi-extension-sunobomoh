import { describe, expect, it } from 'vitest';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from './scheduler.js';
import { ok, type Result } from '../core/result.js';
import { toIsoTimestamp, type IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import { createMockRunner, createMockSteerer } from './test-fixtures.js';

const clock = { now: (): IsoTimestamp => toIsoTimestamp(new Date()) };

describe('createScheduler - initial state', () => {
  it('state.running starts false', () => {
    const s = createScheduler(
      DEFAULT_SCHEDULER_CONFIG,
      createMockRunner().fn,
      createMockSteerer().fn,
      clock,
    );
    expect(s.state.running).toBe(false);
  });

  it('start() sets running true; stop() sets it false and prevents further ticks', async () => {
    const runner = createMockRunner();
    const s = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, createMockSteerer().fn, clock);
    s.start();
    expect(s.state.running).toBe(true);
    s.stop();
    expect(s.state.running).toBe(false);
    const before = s.state.tickCount;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.state.tickCount).toBe(before);
  });

  it('start() is idempotent', () => {
    const s = createScheduler(
      DEFAULT_SCHEDULER_CONFIG,
      createMockRunner().fn,
      createMockSteerer().fn,
      clock,
    );
    s.start();
    s.start();
    expect(s.state.running).toBe(true);
    s.stop();
  });

  it('stop() on a non-started scheduler is a no-op', () => {
    const s = createScheduler(
      DEFAULT_SCHEDULER_CONFIG,
      createMockRunner().fn,
      createMockSteerer().fn,
      clock,
    );
    expect(() => {
      s.stop();
    }).not.toThrow();
    expect(s.state.running).toBe(false);
  });
});

describe('createScheduler - manual triggers', () => {
  it('triggerTick calls runWatchers once', async () => {
    const runner = createMockRunner();
    const s = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, createMockSteerer().fn, clock);
    await s.triggerTick();
    expect(runner.calls).toBe(1);
  });

  it('triggerSteering calls runSteering once', async () => {
    const steerer = createMockSteerer();
    const s = createScheduler(DEFAULT_SCHEDULER_CONFIG, createMockRunner().fn, steerer.fn, clock);
    await s.triggerSteering();
    expect(steerer.calls).toBe(1);
  });
});

describe('createScheduler - stop cleanup', () => {
  it('clears timeout handle when stopped after tick completes', async () => {
    const runner = (): Promise<Result<readonly StateEntry[]>> => Promise.resolve(ok([]));
    const steerer = (): Promise<Result<void>> => Promise.resolve(ok(undefined));
    const s = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner, steerer, clock);
    s.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    s.stop();
    expect(s.state.running).toBe(false);
  });
});
