import { describe, it, expect } from 'vitest';
import type { ReadModel } from './read-model.js';
import { emptyModel, projectLine } from './read-model.js';
import { createStateQuery } from './query.js';
import { makeTestEntryJson } from './test-fixtures.js';

const ENTRY_A = makeTestEntryJson({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
  sourceId: 'watcher-a',
  tags: ['urgent'],
  needsAttention: true,
  metadata: { watchedAt: '2026-05-01T00:00:00.000Z' },
});

const ENTRY_B = makeTestEntryJson({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FBB',
  sourceId: 'watcher-b',
  tags: ['low-priority'],
  needsAttention: false,
  metadata: { watchedAt: '2026-05-07T00:00:00.000Z' },
});

const buildModel = (): ReadModel => [ENTRY_A, ENTRY_B].reduce(projectLine, emptyModel());

describe('createStateQuery', () => {
  it('byTag filters entries with matching tag', () => {
    const q = createStateQuery(buildModel());
    expect(q.byTag('urgent' as never).count()).toBe(1);
    expect(q.byTag('low-priority' as never).count()).toBe(1);
    expect(q.byTag('missing' as never).count()).toBe(0);
  });

  it('byWatcher filters entries by sourceId', () => {
    const q = createStateQuery(buildModel());
    expect(q.byWatcher('watcher-a' as never).count()).toBe(1);
    expect(q.byWatcher('watcher-b' as never).count()).toBe(1);
    expect(q.byWatcher('missing' as never).count()).toBe(0);
  });

  it('needsAttention(true) returns only entries needing attention', () => {
    const q = createStateQuery(buildModel());
    const results = q.needsAttention(true).execute();
    expect(results).toHaveLength(1);
    expect(results[0]?.needsAttention).toBe(true);
  });

  it('needsAttention(false) returns entries not needing attention', () => {
    const q = createStateQuery(buildModel());
    expect(q.needsAttention(false).count()).toBe(1);
  });

  it('since filters entries at or after timestamp', () => {
    const q = createStateQuery(buildModel());
    expect(q.since('2026-05-04T00:00:00.000Z').count()).toBe(1);
    expect(q.since('2026-04-01T00:00:00.000Z').count()).toBe(2);
  });

  it('until filters entries at or before timestamp', () => {
    const q = createStateQuery(buildModel());
    expect(q.until('2026-05-03T00:00:00.000Z').count()).toBe(1);
    expect(q.until('2026-12-31T00:00:00.000Z').count()).toBe(2);
  });

  it('execute returns all matching entries as readonly array', () => {
    const q = createStateQuery(buildModel());
    expect(q.execute()).toHaveLength(2);
    expect(q.byTag('urgent' as never).execute()).toHaveLength(1);
  });
});
