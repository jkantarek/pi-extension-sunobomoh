// Types
export type { WatcherDefinition, BoundWatcher } from './watchers/types.js';
export type { HydratorDefinition } from './hydrators/types.js';
export type {
  SideEffectDefinition,
  CallbackPhase,
  SideEffectContext,
  SideEffectResult,
} from './side-effects/types.js';
export type { TagDefinition } from './tags/types.js';
export type { StateEntry, TagOutcome, TagOutcomeJson } from './state/types.js';
export type { SunobomohAPI } from './extension/api.js';
export type { SchedulerState } from './scheduler/types.js';

// Values
export { getSunobomoh } from './extension/api.js';
export { UNKNOWN_OUTCOME_SCHEMA } from './tags/types.js';

// Brand factories (consumers need these to construct typed ids)
export type { WatcherId, TagId, ResourceUri, IsoTimestamp, EntryId } from './core/brands.js';
export { unsafeWatcherId, unsafeTagId, toResourceUri, toIsoTimestamp } from './core/brands.js';

// Result helpers (consumers use these in hydrators/side-effects)
export type { Result } from './core/result.js';
export { ok, err, isOk, isErr } from './core/result.js';
