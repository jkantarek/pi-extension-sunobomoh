import { describe, expect, it } from 'vitest';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from './scheduler.js';
import { ok, type Result } from '../core/result.js';
import { toIsoTimestamp, type IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';

interface MockRunner {
  fn: () => Promise<Result<readonly StateEntry[]>>;
  calls: number;
}

interface MockSteerer {
  fn: () => Promise<Result<void>>;
  calls: number;
}

const createMockRunner = (): MockRunner => {
  let calls = 0;
  return {
    fn: (): Promise<Result<readonly StateEntry[]>> => {
      calls++;
      return Promise.resolve(ok([]));
    },
    get calls(): number {
      return calls;
    },
  };
};

const createMockSteerer = (): MockSteerer => {
  let calls = 0;
  return {
    fn: (): Promise<Result<void>> => {
      calls++;
      return Promise.resolve(ok(undefined));
    },
    get calls(): number {
      return calls;
    },
  };
};

describe('createScheduler', () => {
  it('state.running starts false', () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, {
      now: () => toIsoTimestamp(new Date()),
    });
    expect(scheduler.state.running).toBe(false);
  });

  it('triggerTick calls runWatchers once', async () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, {
      now: () => toIsoTimestamp(new Date()),
    });
    await scheduler.triggerTick();
    expect(runner.calls).toBe(1);
  });

  it('triggerSteering calls runSteering once', async () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, {
      now: () => toIsoTimestamp(new Date()),
    });
    await scheduler.triggerSteering();
    expect(steerer.calls).toBe(1);
  });

  it('stop prevents further ticks', async () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, {
      now: () => toIsoTimestamp(new Date()),
    });
    scheduler.start();
    expect(scheduler.state.running).toBe(true);
    scheduler.stop();
    expect(scheduler.state.running).toBe(false);
    const callsBefore = runner.calls;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runner.calls).toBe(callsBefore);
  });

  it('start() does nothing if already running', () => {
    const runner = createMockRunner();
    const steerer = createMockSteerer();
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner.fn, steerer.fn, {
      now: () => toIsoTimestamp(new Date()),
    });
    scheduler.start();
    scheduler.start(); // Second call should be no-op
    expect(scheduler.state.running).toBe(true);
  });
});

describe('Scheduler stop with timeout', () => {
  it('clears timeout handle on stop', async () => {
    const runner = (): Promise<Result<readonly StateEntry[]>> => Promise.resolve(ok([]));
    const steerer = (): Promise<Result<void>> => Promise.resolve(ok(undefined));
    const clock = { now: (): IsoTimestamp => toIsoTimestamp(new Date()) };
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner, steerer, clock);

    scheduler.start();
    // Wait for the first tick to complete and schedule next timeout
    await new Promise((resolve) => setTimeout(resolve, 50));
    scheduler.stop();

    const state = scheduler.state;
    expect(state.running).toBe(false);
  });
});

describe('Scheduler stop during tick', () => {
  it('prevents next tick when stopped while watcher is running', async () => {
    let resolveWatcher: () => void;
    const watcherPromise = new Promise<Result<readonly StateEntry[]>>((resolve) => {
      resolveWatcher = (): void => {
        resolve(ok([]));
      };
    });
    const runner = (): Promise<Result<readonly StateEntry[]>> => watcherPromise;
    const steerer = (): Promise<Result<void>> => Promise.resolve(ok(undefined));
    const clock = { now: (): IsoTimestamp => toIsoTimestamp(new Date()) };
    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runner, steerer, clock);

    scheduler.start();
    scheduler.stop();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by Promise constructor
    resolveWatcher!();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = scheduler.state;
    expect(state.running).toBe(false);
    expect(state.tickCount).toBe(1);
  });
});
