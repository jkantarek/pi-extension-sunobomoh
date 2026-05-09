# Data Model: Sunobomoh Watch Engine

**Branch**: `001-sunobomoh-watch-engine` | **Date**: 2026-05-07
**Updated**: architecture-review.md codified — branded types, wire/in-memory split, ReadModel,
Null Object for outcomeSchema, pure-function entity shapes.

---

## Entity Overview

```
src/core/ (write first — no domain deps)
  Result<T,E> · EntryId · WatcherId · TagId · IsoTimestamp · ResourceUri
  Registry<T> · FileSystem · Clock
                    │ imported by all domains below
                    ▼
WatcherDefinition ──► runWatcher() ──► toStateEntry() ──► StateEntry (in-memory)
  │ hydrators[]         pure fn           pure fn              │
  │ sideEffects[]                                              │
  │                                                            ▼
  └─► runHydrationPipeline()        projectLine(model, line): ReadModel
        pure fn (for...of reduce)              │
  │                                      StateStore
  └─► runPhase()                     (append JSONL · load · expose ReadModel)
        pure fn (chain of resp.)            │
                                      StateQuery
TagRegistry ──► initializeOutcomes()  (immutable fluent builder over ReadModel)
                  pure fn
                    │
              applyTagsToEntry()
                  pure fn
```

---

## Two Representations of StateEntry

There are two distinct shapes, kept separate to satisfy `noPropertyAccessFromIndexSignature`
and to isolate JSON serialisation from domain logic.

| Shape      | Type name        | Location             | `outcomes` field                 | Use                                |
| ---------- | ---------------- | -------------------- | -------------------------------- | ---------------------------------- |
| JSONL wire | `StateEntryJson` | `src/state/types.ts` | `Record<string, TagOutcomeJson>` | Written to / read from disk        |
| In-memory  | `StateEntry`     | `src/state/types.ts` | `ReadonlyMap<TagId, TagOutcome>` | All domain logic, queries, scoring |

Conversion: `parseStateEntry(json: StateEntryJson): StateEntry` at the disk boundary only.

The same two-representation pattern applies to `StatePatch.patch` and the read model indexes.

---

## JSONL Wire Types (disk format)

Every line in `.pi/sunobomoh-state.jsonl` is one of these. Discriminated on `type`.
All id/uri/timestamp fields are plain `string` here — brands are type-level only.

### `state_entry` wire

```typescript
export interface StateEntryJson {
  readonly type: 'state_entry';
  readonly id: string; // ULID (monotonic)
  readonly sourceId: string; // WatcherDefinition.id
  readonly sourceUri: string; // RFC 3986 URI (any scheme)
  readonly label: string; // from WatcherDefinition.extractLabel()
  readonly timestamp: string; // ISO 8601
  readonly tags: readonly string[];
  readonly outcomes: Readonly<Record<string, TagOutcomeJson>>;
  readonly data: unknown;
  readonly hydratedData?: unknown;
  readonly needsAttention: boolean;
  readonly attentionScore?: number;
  readonly metadata: StateEntryMetadataJson;
}

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
```

### `state_patch` wire

```typescript
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
```

### `steering_run` wire

```typescript
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
```

### `scheduler_run` wire

```typescript
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
```

---

## In-Memory Domain Types

Used by all domain logic after deserialisation. All ids/timestamps/uris are branded.

### `StateEntry` (in-memory)

```typescript
import type { EntryId, WatcherId, TagId, IsoTimestamp, ResourceUri } from '../core/brands.js';

export interface StateEntry {
  readonly type: 'state_entry';
  readonly id: EntryId;
  readonly sourceId: WatcherId;
  readonly sourceUri: ResourceUri;
  readonly label: string; // human-readable display name for TUI
  readonly timestamp: IsoTimestamp;
  readonly tags: readonly TagId[];
  readonly outcomes: ReadonlyMap<TagId, TagOutcome>; // Map, not Record
  readonly data: unknown;
  readonly hydratedData?: unknown;
  readonly needsAttention: boolean;
  readonly attentionScore?: number;
  readonly metadata: StateEntryMetadata;
}

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
```

### `ReadModel` (in-memory projection)

The `StateStore` exposes this after replaying the JSONL log via `projectLine()`.
All indexes use `Map` — never `Record` — to satisfy `noPropertyAccessFromIndexSignature`.

```typescript
export interface ReadModel {
  readonly byId: ReadonlyMap<EntryId, StateEntry>;
  readonly byTag: ReadonlyMap<TagId, readonly EntryId[]>;
  readonly bySourceId: ReadonlyMap<WatcherId, readonly EntryId[]>;
  readonly needsAttention: ReadonlySet<EntryId>;
  readonly lastSteeringRun?: SteeringRunJson;
  readonly entryCount: number;
}

export const emptyModel = (): ReadModel => ({
  byId: new Map(),
  byTag: new Map(),
  bySourceId: new Map(),
  needsAttention: new Set(),
  entryCount: 0,
});

// Pure fold function — the entire state reconstitution logic.
// StateStore calls: lines.reduce(projectLine, emptyModel())
export declare const projectLine: (model: ReadModel, line: StateLineJson) => ReadModel;
```

---

## Domain Entities

### WatcherDefinition

Pattern: **Strategy**. One plain object per watcher file — no base class.

```typescript
import type { TSchema } from 'typebox';
import type { WatcherId, TagId, ResourceUri } from '../core/brands.js';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';

export interface WatcherDefinition<TConfig = unknown, TEvent = unknown> {
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  readonly configSchema: TSchema;
  watch(config: TConfig, signal: AbortSignal): Promise<readonly TEvent[]>;
  extractUri(event: TEvent, config: TConfig): ResourceUri;
  extractLabel(event: TEvent, config: TConfig): string;
  extractTags(event: TEvent, config: TConfig): readonly TagId[];
  readonly hydrators?: readonly HydratorDefinition[];
  readonly sideEffects?: readonly SideEffectDefinition[];
}

export interface BoundWatcher<TConfig = unknown> {
  readonly definition: WatcherDefinition<TConfig>;
  readonly config: TConfig;
}
```

**WatcherRunner state machine** (`src/watchers/runner.ts` — pure function):

```
before_watch side-effects
  │ halt? → skip tick for this watcher
  ▼
watch() → Result<TEvent[], Error>
  │ err → record in SchedulerRun.errored, return
  ▼
toStateEntry() × N → StateEntry[]   [pure coercion, src/watchers/coerce.ts]
  ▼
after_watch side-effects
  ▼
runHydrationPipeline() → Result<StateEntry[], HydrationError>
  ▼
before_hydrate / after_hydrate side-effects (wrapped around pipeline)
  ▼
initializeOutcomes() + applyTagsToEntry()
  ▼
Result<readonly StateEntry[], Error>
```

### TagDefinition

Pattern: **Null Object** for `outcomeSchema` — field is always present, never optional.
Eliminates `if (def.outcomeSchema)` guards throughout the codebase.

```typescript
import type { TSchema } from 'typebox';
import { Type } from 'typebox';
import type { TagId } from '../core/brands.js';

/** Sentinel schema — accepts any value. Used when no specific outcome shape is needed. */
export const UNKNOWN_OUTCOME_SCHEMA: TSchema = Type.Unknown();

export interface TagDefinition {
  readonly id: TagId;
  readonly label: string;
  readonly description: string;
  readonly defaultStatus: TagOutcome['status'];
  /** Always present. Set to UNKNOWN_OUTCOME_SCHEMA if no specific shape is needed. */
  readonly outcomeSchema: TSchema;
  readonly attentionWeight: number; // 0–10; used in scoring
}
```

**Built-in tags** (registered by `createTagRegistry()` automatically):

| id              | label         | weight | outcomeSchema            |
| --------------- | ------------- | ------ | ------------------------ |
| `urgent`        | Urgent        | 10     | `UNKNOWN_OUTCOME_SCHEMA` |
| `needs-review`  | Needs Review  | 7      | `UNKNOWN_OUTCOME_SCHEMA` |
| `informational` | Informational | 1      | `UNKNOWN_OUTCOME_SCHEMA` |
| `stale`         | Stale         | 0      | `UNKNOWN_OUTCOME_SCHEMA` |

### SideEffectDefinition

Pattern: **Chain of Responsibility**. `runPhase()` is a pure function — no class.
`{ halt: true }` maps to `throw ActiveRecord::Rollback`.

```typescript
import type { WatcherId } from '../core/brands.js';

export type CallbackPhase =
  | 'before_watch'
  | 'after_watch'
  | 'before_hydrate'
  | 'after_hydrate'
  | 'before_steer'
  | 'after_steer';

export interface SideEffectContext {
  readonly phase: CallbackPhase;
  readonly watcherId: WatcherId;
  readonly entries: readonly StateEntry[];
  readonly config: unknown;
  readonly signal: AbortSignal;
}

export interface SideEffectResult {
  readonly halt?: boolean;
}

export interface SideEffectDefinition {
  readonly id: string;
  readonly phase: CallbackPhase;
  readonly handler: (ctx: SideEffectContext) => Promise<SideEffectResult | void>;
}
```

**Active Record analogy**:

| Active Record                  | Sunobomoh               |
| ------------------------------ | ----------------------- |
| `before_save`                  | `before_watch`          |
| `after_save`                   | `after_watch`           |
| `before_validation`            | `before_hydrate`        |
| `after_validation`             | `after_hydrate`         |
| `before_destroy`               | `before_steer`          |
| `after_destroy`                | `after_steer`           |
| `throw ActiveRecord::Rollback` | `return { halt: true }` |

### HydratorDefinition

Pattern: **Middleware**. All hydrators share identical `(entries, signal) => entries` shape.
`runHydrationPipeline()` is a pure function — a simple `for...of` loop, no class.

```typescript
export interface HydratorDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  hydrate(entries: readonly StateEntry[], signal: AbortSignal): Promise<readonly StateEntry[]>;
}
```

**Invariants** (enforced by `assertHydrationInvariants()` in `src/hydrators/invariants.ts`):

- `result.length === input.length`
- `result[i].id === input[i].id` for all `i`
- `result[i].sourceId`, `.sourceUri`, `.timestamp` unchanged

### SchedulerConfig

```typescript
export interface SchedulerConfig {
  readonly intervalMinutes: number; // default: 10
  readonly steeringIntervalMinutes: number; // default: 60 — must be multiple of intervalMinutes
  readonly maxConcurrentWatchers: number; // default: 3
  readonly timeoutMs: number; // per-watcher, default: 30_000
}
```

**Scheduler pattern**: Self-scheduling `setTimeout` (not `setInterval`) with injected `Clock`.
Steering trigger: `shouldRunSteering(lastSteeringAt, now, config): boolean` — pure predicate
in `src/scheduler/should-steer.ts`.

### SteeringConfig

```typescript
import type { LlmSteeringStrategy } from '../steering/types.js';

export interface SteeringConfig {
  readonly promoteThreshold: number; // default: 60
  readonly demoteThreshold: number; // default: 20
  readonly recencyDecayHalfLifeHours: number; // default: 24
  readonly llmSteering: boolean; // default: false
  readonly llmBorderlineLimit: number; // default: 10
}
```

**Scoring formula**: `score = Σ(tag.attentionWeight × 10) × 0.5^(ageHours / halfLife)`

**Specification predicates** (`src/steering/classify.ts`):

- `isPromotable(score, config): boolean`
- `isDemotable(score, config): boolean`
- `isBorderline(score, config): boolean`

**LLM strategy** is an injected function type — pi-specific impl lives only in `src/extension/index.ts`.

### SunobomohConfig

The shape of `.pi/sunobomoh.config.json` on disk. Plain strings only — no branded types.
`$ENV_VAR` references in `config` values are resolved at runtime by `resolveEnvRefs()`.

```typescript
export interface SunobomohConfig {
  readonly stateFile?: string;
  readonly scheduler?: Partial<SchedulerConfig>;
  readonly steering?: Partial<SteeringConfig>;
  readonly watchers: readonly WatcherConfigEntry[];
  /** All widget-related config in one place. */
  readonly widget?: WidgetUserConfig;
}

export interface WidgetUserConfig {
  /** Max total rendered lines (entries + group headers). Default: 8. */
  readonly maxLines?: number;
  /**
   * Grouping strategy. Default: 'none' (sequential by time).
   *   'none'       — flat list, oldest→newest, no group headers
   *   'source'     — one section per watcher source, alphabetical
   *   'tag'        — one section per primary tag, highest attention weight first
   *   'date'       — Today / Yesterday / This week / Older
   *   'attention'  — ⚠ Needs attention first, then · Monitoring
   */
  readonly grouping?: GroupingStrategyName;
  /**
   * Tag id → emoji overrides merged over DEFAULT_TAG_EMOJI.
   * Custom tag types must be listed here or they render as FALLBACK_EMOJI (🔵).
   * Example: { "urgent": "🚨", "blocked": "🚫", "my-tag": "🎯" }
   */
  readonly tagEmoji?: Readonly<Record<string, string>>;
  /**
   * Scheme id → partial profile overrides merged over DEFAULT_SCHEME_PROFILES.
   * Used to configure base URLs for on-prem tools (Jira, GitLab, self-hosted GitHub, etc.).
   * Example: { "jira": { "abbr": "ji", "baseUrl": "https://jira.corp.com" } }
   */
  readonly schemeProfiles?: Readonly<Record<string, { abbr?: string; baseUrl?: string }>>;
}

/** String form of GroupingStrategy used in JSON config. */
export type GroupingStrategyName = 'none' | 'source' | 'tag' | 'date' | 'attention';
```

**Default `WidgetUserConfig`** (applied by `buildWidgetConfig()` in `extension/index.ts`):

| Field            | Default                                           |
| ---------------- | ------------------------------------------------- |
| `maxLines`       | `8`                                               |
| `grouping`       | `'none'`                                          |
| `tagEmoji`       | `{}` (empty — DEFAULT_TAG_EMOJI used as-is)       |
| `schemeProfiles` | `{}` (empty — DEFAULT_SCHEME_PROFILES used as-is) |

````

### RegisteredWatcherInfo

Runtime view of one watcher as seen by `SunobomohAPI.getRegisteredWatchers()`.
Combines WatcherRegistry data with ReadModel stats for display in `/sunobomoh:config`.

```typescript
export interface RegisteredWatcherInfo {
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  /** 'config' = activated via config file; can be removed by /sunobomoh:config.
   *  'programmatic' = registered by a sibling pi extension; cannot be removed by /sunobomoh:config. */
  readonly source: 'config' | 'programmatic';
  /** Present when source === 'programmatic'. Extension display name for user guidance. */
  readonly managedBy?: string;
  readonly lastRunAt?: IsoTimestamp;
  readonly lastRunError?: string;
  readonly entryCount: number;
}
````

### BuiltinWatcherEntry

One entry in the `BuiltinWatcherBundle` map. Used by the Add flow in `/sunobomoh:config`.

```typescript
export interface BuiltinWatcherEntry {
  readonly id: string; // matches WatcherDefinition.id
  readonly name: string; // display name
  readonly description: string; // one sentence for the selection list
  readonly definition: WatcherDefinition;
}
```

---

## Validation Rules

| Field                                     | Rule                                            | Where enforced                                  |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `StateEntry.id`                           | ULID (monotonic, 26-char Crockford base32)      | `parseStateEntry()` at deserialisation boundary |
| `StateEntry.sourceUri`                    | RFC 3986 via `toResourceUri()`                  | `toStateEntry()` coercion in `coerce.ts`        |
| `StateEntry.timestamp`                    | Valid ISO 8601 via `toIsoTimestamp()`           | `toStateEntry()`                                |
| `StateEntry.tags`                         | Non-empty; each TagId in TagRegistry            | `applyTagsToEntry()`                            |
| `StateEntry.attentionScore`               | 0–100                                           | `scoreEntry()`                                  |
| `TagOutcome.status`                       | One of four literals                            | TypeBox at outcome initialisation               |
| `TagOutcome.outcome`                      | Validates against `TagDefinition.outcomeSchema` | `initializeOutcomes()`                          |
| `SchedulerConfig.steeringIntervalMinutes` | Positive multiple of `intervalMinutes`          | `createScheduler()`                             |
| `SteeringConfig.promoteThreshold`         | > `demoteThreshold`                             | `createSteerer()`                               |

---

## In-Memory Indexes

All `Map` — never `Record` — to satisfy `noPropertyAccessFromIndexSignature`.

| Index                       | Type                           | Key        | Purpose                      |
| --------------------------- | ------------------------------ | ---------- | ---------------------------- |
| `ReadModel.byId`            | `Map<EntryId, StateEntry>`     | entry id   | O(1) patch lookup, mark tool |
| `ReadModel.byTag`           | `Map<TagId, EntryId[]>`        | tag id     | O(1) tag filtering           |
| `ReadModel.bySourceId`      | `Map<WatcherId, EntryId[]>`    | watcher id | O(1) per-watcher history     |
| `ReadModel.needsAttention`  | `Set<EntryId>`                 | —          | O(1) widget count            |
| `ReadModel.lastSteeringRun` | `SteeringRunJson \| undefined` | —          | steering interval check      |
