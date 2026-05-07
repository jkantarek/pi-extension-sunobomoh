# Contract: State Types

**File**: `src/state/types.ts`

The canonical JSONL state store schema. All writes to `.pi/sunobomoh-state.jsonl`
must conform to one of the discriminated union members below.

---

## Discriminated Union

```typescript
export type StateLineType =
  | StateEntry
  | StatePatch
  | SteeringRun
  | SchedulerRun;
```

---

## StateEntry

```typescript
/**
 * Primary event record. One line per observed event.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { isStateEntry } from '../state/types.js';
 * const line: unknown = {
 *   type: 'state_entry', id: 'abc', sourceId: 'github',
 *   sourceUri: 'github:///owner/repo/issues/1',
 *   timestamp: '2026-05-07T10:00:00Z',
 *   tags: ['needs-review'], outcomes: {},
 *   data: {}, needsAttention: false,
 *   metadata: { watchedAt: '2026-05-07T10:00:00Z' },
 * };
 * expect(isStateEntry(line)).toBe(true);
 * ```
 */
export interface StateEntry {
  readonly type: 'state_entry';
  readonly id: string;                         // UUID v4
  readonly sourceId: string;                   // WatcherDefinition.id
  readonly sourceUri: string;                  // RFC 3986 URI (any scheme)
  readonly timestamp: string;                  // ISO 8601
  readonly tags: readonly string[];            // ≥ 1 tag id
  readonly outcomes: Readonly<Record<string, TagOutcome>>;
  readonly data: unknown;
  readonly hydratedData?: unknown;
  readonly needsAttention: boolean;
  readonly attentionScore?: number;            // 0–100; set by Steerer
  readonly metadata: StateEntryMetadata;
}

export interface StateEntryMetadata {
  readonly watchedAt: string;
  readonly hydratedAt?: string;
  readonly lastSteeringAt?: string;
  readonly steeringDecision?: 'promoted' | 'demoted' | 'unchanged';
}

export interface TagOutcome {
  readonly tagId: string;
  readonly status: 'pending' | 'active' | 'resolved' | 'dismissed';
  readonly outcome?: unknown;
  readonly resolvedAt?: string;
  readonly notes?: string;
}
```

---

## StatePatch

```typescript
/**
 * Mutation record applied on top of a StateEntry. The effective current state
 * of an entry is computed by StateStore.resolve(id): apply all patches in
 * chronological order over the original entry.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { isStatePatch } from '../state/types.js';
 * const p = { type: 'state_patch', id: 'p1', targetId: 'e1',
 *   timestamp: '2026-05-07T11:00:00Z', patch: { needsAttention: true } };
 * expect(isStatePatch(p)).toBe(true);
 * ```
 */
export interface StatePatch {
  readonly type: 'state_patch';
  readonly id: string;
  readonly targetId: string;
  readonly timestamp: string;
  readonly patch: Partial<Pick<
    StateEntry,
    'needsAttention' | 'attentionScore' | 'outcomes' | 'tags'
  >>;
  readonly reason?: string;
}
```

---

## SteeringRun

```typescript
/**
 * Written after each hourly steering pass.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { isSteeringRun } from '../state/types.js';
 * const r = { type: 'steering_run', id: 'r1',
 *   timestamp: '2026-05-07T11:00:00Z', completedAt: '2026-05-07T11:00:01Z',
 *   promoted: [], demoted: [], unchanged: [], llmAssisted: false };
 * expect(isSteeringRun(r)).toBe(true);
 * ```
 */
export interface SteeringRun {
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
```

---

## SchedulerRun

```typescript
/**
 * Written after each N-minute scheduler tick.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { isSchedulerRun } from '../state/types.js';
 * const r = { type: 'scheduler_run', id: 'r2',
 *   timestamp: '2026-05-07T10:00:00Z', watchersRun: ['github'],
 *   entriesCreated: 3, errored: [], durationMs: 420 };
 * expect(isSchedulerRun(r)).toBe(true);
 * ```
 */
export interface SchedulerRun {
  readonly type: 'scheduler_run';
  readonly id: string;
  readonly timestamp: string;
  readonly watchersRun: readonly string[];
  readonly entriesCreated: number;
  readonly errored: readonly SchedulerRunError[];
  readonly durationMs: number;
}

export interface SchedulerRunError {
  readonly watcherId: string;
  readonly error: string;
}
```

---

## StateStore Public API

```typescript
/** Append-only JSONL state store. */
export interface StateStoreAPI {
  /** Append one or more lines atomically (single write call). */
  append(lines: readonly StateLineType[]): Promise<void>;
  /** Load all lines and rebuild in-memory indexes. */
  load(): Promise<void>;
  /** Resolve effective state of one entry (original + all patches applied). */
  resolve(id: string): StateEntry | undefined;
  /** Query entries by predicate. Returns resolved state for each match. */
  query(predicate: (entry: StateEntry) => boolean): readonly StateEntry[];
  /** All entries where needsAttention = true (resolved). */
  readonly attentionEntries: readonly StateEntry[];
  /** Total entry count (excludes patches, runs). */
  readonly entryCount: number;
}
```

---

## StateQuery Public API

```typescript
/** Composable query builder over StateStoreAPI. */
export interface StateQueryAPI {
  byTag(tagId: string): StateQueryAPI;
  byWatcher(watcherId: string): StateQueryAPI;
  needsAttention(value?: boolean): StateQueryAPI;
  since(timestamp: string): StateQueryAPI;
  until(timestamp: string): StateQueryAPI;
  execute(): readonly StateEntry[];
  count(): number;
}
```
