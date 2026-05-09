import { describe, expect, it } from 'vitest';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from './scheduler.js';
import { createSteerer, DEFAULT_STEERING_CONFIG } from '../steering/steerer.js';
import { createTagRegistry } from '../tags/registry.js';
import { createStateStore } from '../state/store.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import { ok, type Result } from '../core/result.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StateEntry, StateEntryJson, SteeringRunJson } from '../state/types.js';

const createTestEntry = (now: string): StateEntryJson => ({
  type: 'state_entry',
  id: '01J3XYZ1234567890ABCDEFGHI',
  sourceId: 'test-watcher',
  sourceUri: 'test:///resource',
  label: 'Urgent item',
  timestamp: now,
  tags: ['urgent'],
  outcomes: {},
  data: {},
  needsAttention: false,
  metadata: { watchedAt: now },
});

const createOldSteeringRun = (oneHourAgo: string): SteeringRunJson => ({
  type: 'steering_run',
  id: '01J3XYZ1234567890ABCDEFGHZ',
  timestamp: oneHourAgo,
  completedAt: oneHourAgo,
  promoted: [],
  demoted: [],
  unchanged: [],
  llmAssisted: false,
});

describe('scheduler-steering integration', () => {
  it('createScheduler with shouldRunSteering → triggerTick calls both watcher runner AND steerer', async () => {
    const tmpFile = join(tmpdir(), `sched-steer-int-${String(Date.now())}.jsonl`);
    const store = createStateStore(tmpFile, createNodeFileSystem(), createSystemClock());
    await store.load();
    const clock = createSystemClock();
    const now = clock.now();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await store.append([createTestEntry(now), createOldSteeringRun(oneHourAgo)]);

    let watcherCalls = 0;
    const runWatchers = (): Promise<Result<readonly StateEntry[]>> => {
      watcherCalls++;
      return Promise.resolve(ok([]));
    };
    const steerer = createSteerer(
      DEFAULT_STEERING_CONFIG,
      createTagRegistry(),
      store,
      undefined,
      clock,
    );
    const runSteering = async (signal: AbortSignal): Promise<Result<void>> => {
      const result = await steerer.run(signal);
      return result.ok ? ok(undefined) : result;
    };

    const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG, runWatchers, runSteering, clock);
    const steeringRunsBefore = store.model.lastSteeringRun?.timestamp;
    await scheduler.triggerTick();

    expect(watcherCalls).toBe(1);
    expect(store.model.lastSteeringRun).toBeDefined();
    expect(store.model.lastSteeringRun?.timestamp).not.toBe(steeringRunsBefore);
  });
});
