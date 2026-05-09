import type { EntryId, IsoTimestamp } from '../core/brands.js';
import type { StateStoreAPI } from '../state/store.js';
import { defaultIdFactory } from '../core/ids.js';
import type { LlmOverride, SteeringOutcome } from './types.js';

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

export interface SteeringRunLine {
  readonly type: 'steering_run';
  readonly id: string;
  readonly timestamp: IsoTimestamp;
  readonly completedAt: IsoTimestamp;
  readonly promoted: readonly EntryId[];
  readonly demoted: readonly EntryId[];
  readonly unchanged: readonly EntryId[];
  readonly llmAssisted: boolean;
}

// eslint-disable-next-line max-lines-per-function -- Pure factory: object construction with 8 fields
export const buildSteeringRun = (
  p: readonly EntryId[],
  d: readonly EntryId[],
  b: readonly EntryId[],
  llm: boolean,
  n: IsoTimestamp,
): SteeringRunLine => ({
  type: 'steering_run' as const,
  id: defaultIdFactory.next(),
  timestamp: n,
  completedAt: n,
  promoted: p,
  demoted: d,
  unchanged: b,
  llmAssisted: llm,
});

// eslint-disable-next-line max-lines-per-function -- Array concatenation: 3 patch builders
export const buildAllPatches = (
  promoted: readonly EntryId[],
  demoted: readonly EntryId[],
  llmOverrides: readonly LlmOverride[],
  store: StateStoreAPI,
  now: IsoTimestamp,
): readonly StatePatch[] => [
  ...buildPromotions(promoted, store, now),
  ...buildDemotions(demoted, store, now),
  ...buildOverrides(llmOverrides, store, now),
];

export const buildOutcome = (
  promoted: readonly EntryId[],
  demoted: readonly EntryId[],
  borderline: readonly EntryId[],
  usedLlm: boolean,
  llmError: Error | undefined,
): SteeringOutcome =>
  llmError !== undefined
    ? { promoted, demoted, borderline, usedLlm, llmError }
    : { promoted, demoted, borderline, usedLlm };
