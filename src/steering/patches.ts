import type { EntryId, IsoTimestamp } from '../core/brands.js';
import type { StateStoreAPI } from '../state/store.js';
import { defaultIdFactory } from '../core/ids.js';
import type { LlmOverride } from './types.js';

export interface StatePatch {
  readonly type: 'state_patch';
  readonly id: string;
  readonly targetId: EntryId;
  readonly timestamp: IsoTimestamp;
  readonly patch: { readonly needsAttention: boolean };
  readonly reason: string;
}

// eslint-disable-next-line max-lines-per-function -- Pure factory: object construction with 6 fields
const createPatch = (
  id: EntryId,
  now: IsoTimestamp,
  needsAttention: boolean,
  reason: string,
): StatePatch => ({
  type: 'state_patch' as const,
  id: defaultIdFactory.next(),
  targetId: id,
  timestamp: now,
  patch: { needsAttention },
  reason,
});

export const buildPromotions = (
  ids: readonly EntryId[],
  store: StateStoreAPI,
  now: IsoTimestamp,
): readonly StatePatch[] =>
  ids
    .map((id) => store.model.byId.get(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined && !e.needsAttention)
    .map((e) => createPatch(e.id, now, true, 'steering:promote'));

export const buildDemotions = (
  ids: readonly EntryId[],
  store: StateStoreAPI,
  now: IsoTimestamp,
): readonly StatePatch[] =>
  ids
    .map((id) => store.model.byId.get(id))
    .filter((e): e is NonNullable<typeof e> => e?.needsAttention === true)
    .map((e) => createPatch(e.id, now, false, 'steering:demote'));

// eslint-disable-next-line max-lines-per-function -- Pure chain: map + filter + map
export const buildOverrides = (
  overrides: readonly LlmOverride[],
  store: StateStoreAPI,
  now: IsoTimestamp,
): readonly StatePatch[] =>
  overrides
    .map((o) => ({ entry: store.model.byId.get(o.entryId), override: o }))
    .filter(
      ({ entry, override }) =>
        entry !== undefined && entry.needsAttention !== (override.decision === 'promote'),
    )
    .map(({ override }) =>
      createPatch(
        override.entryId,
        now,
        override.decision === 'promote',
        `llm:${override.decision}`,
      ),
    );
