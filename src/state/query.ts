import type { WatcherId, TagId } from '../core/brands.js';
import type { ReadModel } from './read-model.js';
import type { StateEntry } from './types.js';

export interface StateQueryAPI {
  byTag(tagId: TagId): StateQueryAPI;
  byWatcher(watcherId: WatcherId): StateQueryAPI;
  needsAttention(value?: boolean): StateQueryAPI;
  since(timestamp: string): StateQueryAPI;
  until(timestamp: string): StateQueryAPI;
  execute(): readonly StateEntry[];
  count(): number;
}

type Predicate = (entry: StateEntry) => boolean;

const needsAttnPred =
  (v: boolean): Predicate =>
  (e): boolean =>
    e.needsAttention === v;

const makeSince =
  (ts: string): Predicate =>
  (e): boolean =>
    e.metadata.watchedAt >= ts;

const makeUntil =
  (ts: string): Predicate =>
  (e): boolean =>
    e.metadata.watchedAt <= ts;

const runPredicates = (m: ReadModel, ps: readonly Predicate[]): readonly StateEntry[] =>
  [...m.byId.values()].filter((e) => ps.every((p) => p(e)));

/**
 * @example
 * ```ts @import.meta.vitest
 * const { emptyModel } = await import('./read-model.js');
 * const q = createStateQuery(emptyModel());
 * expect(q.count()).toBe(0);
 * expect(q.execute()).toHaveLength(0);
 * const q2 = q.needsAttention();
 * expect(q2).not.toBe(q);
 * expect(q2.count()).toBe(0);
 * const q3 = q.since('2026-01-01T00:00:00Z').until('2026-12-31T23:59:59Z');
 * expect(q3.count()).toBe(0);
 * ```
 */
export const createStateQuery = (m: ReadModel, ps: readonly Predicate[] = []): StateQueryAPI => ({
  byTag: (t): StateQueryAPI => createStateQuery(m, [...ps, (e): boolean => e.tags.includes(t)]),
  byWatcher: (w): StateQueryAPI => createStateQuery(m, [...ps, (e): boolean => e.sourceId === w]),
  needsAttention: (v = true): StateQueryAPI => createStateQuery(m, [...ps, needsAttnPred(v)]),
  since: (ts): StateQueryAPI => createStateQuery(m, [...ps, makeSince(ts)]),
  until: (ts): StateQueryAPI => createStateQuery(m, [...ps, makeUntil(ts)]),
  execute: (): readonly StateEntry[] => runPredicates(m, ps),
  count: (): number => runPredicates(m, ps).length,
});
