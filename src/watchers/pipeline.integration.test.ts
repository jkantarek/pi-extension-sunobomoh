import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import type { TagId, ResourceUri } from '../core/brands.js';
import { unsafeWatcherId, unsafeTagId, unsafeResourceUri } from '../core/brands.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import { createIdFactory } from '../core/ids.js';
import type { WatcherDefinition } from './types.js';
import { runWatcher } from './runner.js';
import { createStateStore } from '../state/store.js';
import { createTagRegistry } from '../tags/registry.js';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { StateEntry, StateEntryJson, TagOutcomeJson } from '../state/types.js';

const toOutcomesJson = (entry: StateEntry): Record<string, TagOutcomeJson> => {
  const outcomes: Record<string, TagOutcomeJson> = {};
  for (const [k, v] of entry.outcomes.entries()) {
    outcomes[k] = {
      tagId: v.tagId,
      status: v.status,
      ...(v.outcome !== undefined && { outcome: v.outcome }),
      ...(v.resolvedAt !== undefined && { resolvedAt: v.resolvedAt }),
      ...(v.notes !== undefined && { notes: v.notes }),
    };
  }
  return outcomes;
};

const toStateEntryJson = (entry: StateEntry): StateEntryJson => ({
  type: 'state_entry',
  id: entry.id,
  sourceId: entry.sourceId,
  sourceUri: entry.sourceUri,
  label: entry.label,
  timestamp: entry.timestamp,
  tags: [...entry.tags],
  outcomes: toOutcomesJson(entry),
  data: entry.data,
  ...(entry.hydratedData !== undefined && { hydratedData: entry.hydratedData }),
  needsAttention: entry.needsAttention,
  ...(entry.attentionScore !== undefined && { attentionScore: entry.attentionScore }),
  metadata: {
    watchedAt: entry.metadata.watchedAt,
    ...(entry.metadata.hydratedAt !== undefined && { hydratedAt: entry.metadata.hydratedAt }),
    ...(entry.metadata.lastSteeringAt !== undefined && {
      lastSteeringAt: entry.metadata.lastSteeringAt,
    }),
    ...(entry.metadata.steeringDecision !== undefined && {
      steeringDecision: entry.metadata.steeringDecision,
    }),
  },
});

interface TestEvent {
  readonly uri: string;
  readonly title: string;
}

const createTestHydrator = (): HydratorDefinition => ({
  id: 'test-enrich',
  name: 'Test Enricher',
  description: 'Adds hydrated data',
  hydrate: (entries: readonly StateEntry[]): Promise<readonly StateEntry[]> =>
    Promise.resolve(entries.map((e) => ({ ...e, hydratedData: { enriched: true } }))),
});

const createTestWatcher = (hydrator: HydratorDefinition): WatcherDefinition => ({
  id: unsafeWatcherId('test-watcher'),
  name: 'Test Watcher',
  description: 'Emits two fixed events',
  configSchema: { type: 'object' },
  watch: (): Promise<readonly TestEvent[]> =>
    Promise.resolve([
      { uri: 'test://event/1', title: 'First Event' },
      { uri: 'test://event/2', title: 'Second Event' },
    ]),
  extractUri: (evt: TestEvent): ResourceUri => unsafeResourceUri(evt.uri),
  extractLabel: (evt: TestEvent): string => evt.title,
  extractTags: (): readonly TagId[] => [unsafeTagId('informational')],
  hydrators: [hydrator],
  sideEffects: [],
});

describe('Watcher Pipeline Integration', () => {
  it('runs watcher → coerce → hydrate → tag → store → reload', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'sunobomoh-test-'));
    const stateFile = resolve(tempDir, 'state.jsonl');
    const fs = createNodeFileSystem();
    const clock = createSystemClock();
    const ids = createIdFactory();
    const tagRegistry = createTagRegistry();
    const signal = AbortSignal.timeout(5000);

    const hydrator = createTestHydrator();
    const watcher = createTestWatcher(hydrator);

    const result = await runWatcher({
      watcher,
      config: {},
      sideEffects: [],
      clock,
      ids,
      tagRegistry,
      signal,
    });

    if (!result.ok) throw new Error(`runWatcher failed: ${result.error.message}`);

    const entries = result.value;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.label).toBe('First Event');
    expect(entries[1]?.label).toBe('Second Event');

    const store = createStateStore(stateFile, fs, clock);
    await store.load();
    const appendResult = await store.append(entries.map(toStateEntryJson));
    expect(appendResult.ok).toBe(true);

    const store2 = createStateStore(stateFile, fs, clock);
    await store2.load();

    const model = store2.model;
    expect(model.entryCount).toBe(2);

    const firstEntry = entries[0];
    if (!firstEntry) throw new Error('First entry missing');
    const entry1 = model.byId.get(firstEntry.id);
    expect(entry1).toBeDefined();
    expect(entry1?.label).toBe('First Event');

    await rm(tempDir, { recursive: true });
  });
});
