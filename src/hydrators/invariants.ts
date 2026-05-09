import type { StateEntry } from '../state/types.js';

export class HydrationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    void (this.name = 'HydrationInvariantError');
  }
}

const checkLength = (
  id: string,
  before: readonly StateEntry[],
  after: readonly StateEntry[],
): void => {
  if (before.length === after.length) return;
  throw new HydrationInvariantError(
    `${id}: length mismatch (before=${String(before.length)}, after=${String(after.length)})`,
  );
};

const checkId = (id: string, i: number, b: StateEntry, a: StateEntry): void => {
  if (b.id === a.id) return;
  throw new HydrationInvariantError(`${id}: id changed at index ${String(i)}`);
};

const checkSourceId = (id: string, i: number, b: StateEntry, a: StateEntry): void => {
  if (b.sourceId === a.sourceId) return;
  throw new HydrationInvariantError(`${id}: sourceId changed at index ${String(i)}`);
};

const checkSourceUri = (id: string, i: number, b: StateEntry, a: StateEntry): void => {
  if (b.sourceUri === a.sourceUri) return;
  throw new HydrationInvariantError(`${id}: sourceUri changed at index ${String(i)}`);
};

const checkTimestamp = (id: string, i: number, b: StateEntry, a: StateEntry): void => {
  if (b.timestamp === a.timestamp) return;
  throw new HydrationInvariantError(`${id}: timestamp changed at index ${String(i)}`);
};

const checkers = [checkId, checkSourceId, checkSourceUri, checkTimestamp];

const checkAllEntries = (
  id: string,
  before: readonly StateEntry[],
  after: readonly StateEntry[],
): void => {
  for (let i = 0; i < before.length; i++) {
    const [b, a] = [before[i], after[i]];
    if (b && a) for (const check of checkers) check(id, i, b, a);
  }
};

export const assertHydrationInvariants = (
  id: string,
  before: readonly StateEntry[],
  after: readonly StateEntry[],
): void => {
  checkLength(id, before, after);
  checkAllEntries(id, before, after);
};
