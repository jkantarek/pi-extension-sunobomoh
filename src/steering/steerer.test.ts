import { describe, expect, it } from 'vitest';
import { createSteerer, DEFAULT_STEERING_CONFIG } from './steerer.js';
import { createTagRegistry } from '../tags/registry.js';
import { createStateStore, type StateStoreAPI } from '../state/store.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import { isOk, ok, type Result } from '../core/result.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmOverride } from './types.js';
import type { StateEntry, StateEntryJson } from '../state/types.js';
import { unsafeEntryId } from '../core/brands.js';

const createTmpStore = async (name: string): Promise<StateStoreAPI> => {
  const path = join(tmpdir(), `steer-${name}-${String(Date.now())}.jsonl`);
  const store = createStateStore(path, createNodeFileSystem(), createSystemClock());
  await store.load();
  return store;
};

const createEntry = (id: string, tags: readonly string[], timestamp: Date): StateEntryJson => ({
  type: 'state_entry' as const,
  id,
  sourceId: 'test-watcher',
  sourceUri: 'test:///resource',
  label: 'Test',
  timestamp: timestamp.toISOString(),
  tags,
  outcomes: {},
  data: {},
  needsAttention: false,
  metadata: { watchedAt: timestamp.toISOString() },
});

// eslint-disable-next-line max-lines-per-function -- Test body: 4 test cases, ~15 lines each
describe('createSteerer', () => {
  it('empty store runs without error', async () => {
    const store = await createTmpStore('empty');
    const steerer = createSteerer(DEFAULT_STEERING_CONFIG, createTagRegistry(), store);
    const result = await steerer.run(new AbortController().signal);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.promoted).toHaveLength(0);
    }
  });

  it('high-scoring entry gets promoted', async () => {
    const store = await createTmpStore('promote');
    const entries = [createEntry('01J3XYZ1234567890ABCDEFGHI', ['urgent'], new Date())];
    await store.append(entries);
    const steerer = createSteerer(DEFAULT_STEERING_CONFIG, createTagRegistry(), store);
    const result = await steerer.run(new AbortController().signal);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.promoted.length).toBeGreaterThan(0);
    }
  });

  it('low-scoring entry gets demoted', async () => {
    const store = await createTmpStore('demote');
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const entries = [createEntry('01J3XYZ1234567890ABCDEFGHJ', ['stale'], twoDaysAgo)];
    await store.append(entries);
    const steerer = createSteerer(DEFAULT_STEERING_CONFIG, createTagRegistry(), store);
    const result = await steerer.run(new AbortController().signal);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.demoted.length).toBeGreaterThan(0);
    }
  });

  it('llmStrategy can override borderline entries', async () => {
    const store = await createTmpStore('override');
    // needs-review (weight 7) at 12 hours ago → score ~35 → borderline (20-60)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const entries = [createEntry('01J3XYZ1234567890ABCDEFGHK', ['needs-review'], twelveHoursAgo)];
    await store.append(entries);
    const mockLlm = (
      _entries: readonly StateEntry[],
      _signal: AbortSignal,
    ): Promise<Result<readonly LlmOverride[]>> =>
      Promise.resolve(
        ok([
          {
            entryId: unsafeEntryId('01J3XYZ1234567890ABCDEFGHK'),
            decision: 'promote',
            reason: 'LLM says so',
          },
        ]),
      );
    const config = { ...DEFAULT_STEERING_CONFIG, llmSteering: true };
    const steerer = createSteerer(config, createTagRegistry(), store, mockLlm);
    const result = await steerer.run(new AbortController().signal);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.llmOverrides.length).toBeGreaterThan(0);
    }
  });

  it('demotes entry with needsAttention:true and low score (covers buildDemotions final map)', async () => {
    const store = await createTmpStore('demote-flagged');
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const entry = createEntry('01J3XYZ1234567890ABCDEFGHL', ['informational'], twelveHoursAgo);
    await store.append([{ ...entry, needsAttention: true }]);
    await store.load();
    const steerer = createSteerer(DEFAULT_STEERING_CONFIG, createTagRegistry(), store);
    const result = await steerer.run(new AbortController().signal);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.demoted.length).toBeGreaterThan(0);
  });
});
