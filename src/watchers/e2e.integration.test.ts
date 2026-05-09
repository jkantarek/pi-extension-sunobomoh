import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateStore } from '../state/store.js';
import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
import { createIdFactory } from '../core/ids.js';
import { filesystemWatcher } from './filesystem/filesystem-watcher.js';
import { runWatcher } from './runner.js';
import { createTagRegistry } from '../tags/registry.js';
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

describe('end-to-end pipeline integration with real watchers', () => {
  it('should create state entry from FilesystemWatcher and persist to store', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'e2e-test-'));
    const stateFile = join(tmpRoot, 'state.jsonl');
    const watchDir = join(tmpRoot, 'watch');
    const testFile = join(watchDir, 'test.ts');

    try {
      const fs = createNodeFileSystem();
      const clock = createSystemClock();
      const registry = createTagRegistry();
      const ids = createIdFactory();
      const ctrl = new AbortController();

      await mkdir(watchDir);
      await writeFile(testFile, 'export const x = 42;');

      const result = await runWatcher({
        watcher: filesystemWatcher,
        config: { path: watchDir },
        sideEffects: [],
        clock,
        ids,
        tagRegistry: registry,
        signal: ctrl.signal,
      });

      if (!result.ok) throw new Error('runWatcher failed');

      const entries = result.value;
      expect(entries).toHaveLength(1);

      const store = createStateStore(stateFile, fs, clock);
      await store.load();
      const appendResult = await store.append(entries.map(toStateEntryJson));
      expect(appendResult.ok).toBe(true);

      const store2 = createStateStore(stateFile, fs, clock);
      await store2.load();
      const model = store2.model;

      expect(model.entryCount).toBe(1);
      const entry = Array.from(model.byId.values())[0];
      if (!entry) throw new Error('Entry missing');
      expect(entry.sourceUri).toContain('file://');
      expect(entry.sourceUri).toContain('test.ts');
      expect(entry.label).toBe('test.ts');
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
