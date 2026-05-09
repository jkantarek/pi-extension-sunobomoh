import type { EntryId, WatcherId, TagId, IsoTimestamp, ResourceUri } from '../core/brands.js';

export interface StateEntryMetadataJson {
  readonly watchedAt: string;
  readonly hydratedAt?: string;
  readonly lastSteeringAt?: string;
  readonly steeringDecision?: 'promoted' | 'demoted' | 'unchanged';
}

export interface TagOutcomeJson {
  readonly tagId: string;
  readonly status: 'pending' | 'active' | 'resolved' | 'dismissed';
  readonly outcome?: unknown;
  readonly resolvedAt?: string;
  readonly notes?: string;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const line: unknown = {
 *   type: 'state_entry', id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sourceId: 'github',
 *   sourceUri: 'github:///owner/repo/issues/1', label: 'Issue #1',
 *   timestamp: '2026-05-07T10:00:00Z', tags: ['needs-review'], outcomes: {},
 *   data: {}, needsAttention: false, metadata: { watchedAt: '2026-05-07T10:00:00Z' },
 * };
 * expect(isStateEntryJson(line)).toBe(true);
 * expect(isStateEntryJson({ type: 'other' })).toBe(false);
 * ```
 */
export interface StateEntryJson {
  readonly type: 'state_entry';
  readonly id: string;
  readonly sourceId: string;
  readonly sourceUri: string;
  readonly label: string;
  readonly timestamp: string;
  readonly tags: readonly string[];
  readonly outcomes: Readonly<Record<string, TagOutcomeJson>>;
  readonly data: unknown;
  readonly hydratedData?: unknown;
  readonly needsAttention: boolean;
  readonly attentionScore?: number;
  readonly metadata: StateEntryMetadataJson;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const p: unknown = {
 *   type: 'state_patch', id: '01ARZ3NDEKTSV4RRFFQ69G5FBB',
 *   targetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   timestamp: '2026-05-07T11:00:00Z', patch: { needsAttention: true },
 * };
 * expect(isStatePatchJson(p)).toBe(true);
 * expect(isStatePatchJson({ type: 'state_entry' })).toBe(false);
 * ```
 */
export interface StatePatchJson {
  readonly type: 'state_patch';
  readonly id: string;
  readonly targetId: string;
  readonly timestamp: string;
  readonly patch: Partial<
    Pick<StateEntryJson, 'needsAttention' | 'attentionScore' | 'outcomes' | 'tags'>
  >;
  readonly reason?: string;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const r: unknown = {
 *   type: 'steering_run', id: '01ARZ3NDEKTSV4RRFFQ69G5FCC',
 *   timestamp: '2026-05-07T11:00:00Z', completedAt: '2026-05-07T11:00:01Z',
 *   promoted: [], demoted: [], unchanged: [], llmAssisted: false,
 * };
 * expect(isSteeringRunJson(r)).toBe(true);
 * expect(isSteeringRunJson(null)).toBe(false);
 * ```
 */
export interface SteeringRunJson {
  readonly type: 'steering_run';
  readonly id: string;
  readonly timestamp: string;
  readonly completedAt: string;
  readonly promoted: readonly string[];
  readonly demoted: readonly string[];
  readonly unchanged: readonly string[];
  readonly llmAssisted: boolean;
  readonly summary?: string;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const r: unknown = {
 *   type: 'scheduler_run', id: '01ARZ3NDEKTSV4RRFFQ69G5FDD',
 *   timestamp: '2026-05-07T10:00:00Z', watchersRun: ['github'],
 *   entriesCreated: 3, errored: [], durationMs: 420,
 * };
 * expect(isSchedulerRunJson(r)).toBe(true);
 * expect(isSchedulerRunJson(undefined)).toBe(false);
 * ```
 */
export interface SchedulerRunJson {
  readonly type: 'scheduler_run';
  readonly id: string;
  readonly timestamp: string;
  readonly watchersRun: readonly string[];
  readonly entriesCreated: number;
  readonly errored: readonly { readonly watcherId: string; readonly error: string }[];
  readonly durationMs: number;
}

export type StateLineJson = StateEntryJson | StatePatchJson | SteeringRunJson | SchedulerRunJson;

export interface StateEntryMetadata {
  readonly watchedAt: IsoTimestamp;
  readonly hydratedAt?: IsoTimestamp;
  readonly lastSteeringAt?: IsoTimestamp;
  readonly steeringDecision?: 'promoted' | 'demoted' | 'unchanged';
}

export interface TagOutcome {
  readonly tagId: TagId;
  readonly status: 'pending' | 'active' | 'resolved' | 'dismissed';
  readonly outcome?: unknown;
  readonly resolvedAt?: IsoTimestamp;
  readonly notes?: string;
}

export interface StateEntry {
  readonly type: 'state_entry';
  readonly id: EntryId;
  readonly sourceId: WatcherId;
  readonly sourceUri: ResourceUri;
  readonly label: string;
  readonly timestamp: IsoTimestamp;
  readonly tags: readonly TagId[];
  readonly outcomes: ReadonlyMap<TagId, TagOutcome>;
  readonly data: unknown;
  readonly hydratedData?: unknown;
  readonly needsAttention: boolean;
  readonly attentionScore?: number;
  readonly metadata: StateEntryMetadata;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const isStateEntryJson = (v: unknown): v is StateEntryJson =>
  isObject(v) && v['type'] === 'state_entry';

export const isStatePatchJson = (v: unknown): v is StatePatchJson =>
  isObject(v) && v['type'] === 'state_patch';

export const isSteeringRunJson = (v: unknown): v is SteeringRunJson =>
  isObject(v) && v['type'] === 'steering_run';

export const isSchedulerRunJson = (v: unknown): v is SchedulerRunJson =>
  isObject(v) && v['type'] === 'scheduler_run';
