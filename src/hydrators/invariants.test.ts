import { describe, it, expect } from 'vitest';
import type { StateEntry } from '../state/types.js';
import type { EntryId, WatcherId, ResourceUri, IsoTimestamp } from '../core/brands.js';
import { assertHydrationInvariants, HydrationInvariantError } from './invariants.js';

const baseEntry: StateEntry = {
  type: 'state_entry',
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' as EntryId,
  sourceId: 'github' as WatcherId,
  sourceUri: 'github:///owner/repo/issues/1' as ResourceUri,
  label: 'Issue #1',
  timestamp: '2026-05-07T10:00:00Z' as IsoTimestamp,
  tags: [],
  outcomes: new Map(),
  data: {},
  needsAttention: false,
  metadata: { watchedAt: '2026-05-07T10:00:00Z' as IsoTimestamp },
};

describe('assertHydrationInvariants – passes', () => {
  it('passes on unchanged entries', () => {
    const e2 = { ...baseEntry, hydratedData: { extra: 'data' } };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [e2]);
    }).not.toThrow();
  });

  it('handles sparse arrays gracefully', () => {
    const sparse = new Array<StateEntry>(3);
    sparse[0] = baseEntry;
    sparse[2] = baseEntry;
    expect(() => {
      assertHydrationInvariants('hydrator-1', sparse, sparse);
    }).not.toThrow();
  });
});

describe('assertHydrationInvariants – length', () => {
  it('throws on length mismatch', () => {
    const e2 = { ...baseEntry, hydratedData: { extra: 'data' } };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [baseEntry, e2]);
    }).toThrow(HydrationInvariantError);
  });
});

describe('assertHydrationInvariants – field immutability', () => {
  it('throws on changed id', () => {
    const modified = { ...baseEntry, id: '01ARZ3NDEKTSV4RRFFQ69G5FBB' as EntryId };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [modified]);
    }).toThrow(HydrationInvariantError);
  });

  it('throws on changed sourceId', () => {
    const modified = { ...baseEntry, sourceId: 'gitlab' as WatcherId };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [modified]);
    }).toThrow(HydrationInvariantError);
  });

  it('throws on changed sourceUri', () => {
    const modified = { ...baseEntry, sourceUri: 'github:///other/repo' as ResourceUri };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [modified]);
    }).toThrow(HydrationInvariantError);
  });

  it('throws on changed timestamp', () => {
    const modified = { ...baseEntry, timestamp: '2026-05-07T11:00:00Z' as IsoTimestamp };
    expect(() => {
      assertHydrationInvariants('hydrator-1', [baseEntry], [modified]);
    }).toThrow(HydrationInvariantError);
  });
});
