# Data Model: Sunobomoh Watch Engine

**Branch**: `001-sunobomoh-watch-engine` | **Date**: 2026-05-07

---

## Entity Overview

```
WatcherDefinition
  ├── hydrators: HydratorDefinition[]
  └── sideEffects: SideEffectDefinition[]
                          │
                          ▼
                   WatcherRunner
                          │ produces
                          ▼
                    StateEntry ──────────────────────────► StateStore (JSONL)
                          │                                      │
                    TagRegistry                           SteeringRun (JSONL)
                  applies TagOutcome                     SchedulerRun (JSONL)
                          │
                    HydrationPipeline
                  enriches hydratedData
                          │
                    SideEffectExecutor
                  runs callbacks per phase
```

---

## JSONL Line Types

The state file is append-only JSONL. Every line is a discriminated union on the `type` field.

### `state_entry`

The primary unit. One line per event observed by any watcher.

```typescript
interface StateEntry {
  readonly type: 'state_entry';

  // Identity
  readonly id: string;                        // UUID v4 — stable across steering runs
  readonly sourceId: string;                  // WatcherDefinition.id that produced this

  // External resource link
  readonly sourceUri: string;                 // RFC 3986 URI — any scheme (github:, file:, slack:, etc.)

  // Timing
  readonly timestamp: string;                 // ISO 8601 — when the event was observed by the watcher
  readonly metadata: {
    readonly watchedAt: string;               // ISO 8601 — same as timestamp (denormalized for clarity)
    readonly hydratedAt?: string;             // ISO 8601 — when last hydration completed
    readonly lastSteeringAt?: string;         // ISO 8601 — when last steering decision was applied
    readonly steeringDecision?: 'promoted' | 'demoted' | 'unchanged';
  };

  // Classification
  readonly tags: readonly string[];           // ordered; first tag is "primary"
  readonly outcomes: Readonly<Record<string, TagOutcome>>;  // keyed by tag id

  // Payload
  readonly data: unknown;                     // raw watcher event (watcher-specific shape)
  readonly hydratedData?: unknown;            // post-hydration enrichment (hydrator-specific shape)

  // Attention
  readonly needsAttention: boolean;
  readonly attentionScore?: number;           // 0-100 score used by Steerer
}
```

### `tag_outcome`

Embedded inside `StateEntry.outcomes[tagId]`. Not a top-level line.

```typescript
interface TagOutcome {
  readonly tagId: string;
  readonly status: 'pending' | 'active' | 'resolved' | 'dismissed';
  readonly outcome?: unknown;                 // typed by TagDefinition.outcomeSchema if present
  readonly resolvedAt?: string;               // ISO 8601
  readonly notes?: string;
}
```

### `steering_run`

Written once per hourly steering pass.

```typescript
interface SteeringRun {
  readonly type: 'steering_run';
  readonly id: string;                        // UUID v4
  readonly timestamp: string;                 // ISO 8601 — when steering started
  readonly completedAt: string;               // ISO 8601
  readonly promoted: readonly string[];       // StateEntry ids moved to needsAttention = true
  readonly demoted: readonly string[];        // StateEntry ids moved to needsAttention = false
  readonly unchanged: readonly string[];      // StateEntry ids reviewed but not changed
  readonly llmAssisted: boolean;
  readonly summary?: string;                  // LLM-generated summary if llmAssisted
}
```

### `scheduler_run`

Written after each scheduler tick (every N minutes).

```typescript
interface SchedulerRun {
  readonly type: 'scheduler_run';
  readonly id: string;
  readonly timestamp: string;                 // ISO 8601
  readonly watchersRun: readonly string[];    // WatcherDefinition ids executed
  readonly entriesCreated: number;
  readonly errored: readonly { watcherId: string; error: string }[];
  readonly durationMs: number;
}
```

### `state_patch`

Written when a StateEntry is mutated post-creation (e.g., outcome update, manual attention toggle).
The state store computes the effective current state by replaying patches over the original entry.

```typescript
interface StatePatch {
  readonly type: 'state_patch';
  readonly id: string;                        // UUID v4 for the patch itself
  readonly targetId: string;                  // StateEntry.id being patched
  readonly timestamp: string;                 // ISO 8601
  readonly patch: Partial<Pick<StateEntry, 'needsAttention' | 'attentionScore' | 'outcomes' | 'tags'>>;
  readonly reason?: string;
}
```

---

## Domain Entities

### WatcherDefinition

```typescript
interface WatcherDefinition<TConfig = unknown, TEvent = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly configSchema: TSchema;             // TypeBox; validated before watch() is called
  watch(config: TConfig, signal: AbortSignal): Promise<readonly TEvent[]>;
  extractUri(event: TEvent, config: TConfig): string;
  extractTags(event: TEvent, config: TConfig): readonly string[];
  readonly hydrators?: readonly HydratorDefinition[];
  readonly sideEffects?: readonly SideEffectDefinition[];
}
```

**State transitions** (internal WatcherRunner FSM):

```
idle → watching → hydrating → tagging → persisting → idle
                     ↓ (error)
                   errored → idle (next tick)
```

### TagDefinition

```typescript
interface TagDefinition {
  readonly id: string;                        // unique slug, e.g. "pr-review"
  readonly label: string;                     // display name
  readonly description: string;
  readonly defaultStatus: TagOutcome['status'];
  readonly outcomeSchema?: TSchema;           // TypeBox; if absent, outcome is `unknown`
  readonly attentionWeight: number;           // 0–10; used in rule-based steering
}
```

**Built-in tags** (always registered, weight defaults):

| id | label | weight |
|----|-------|--------|
| `urgent` | Urgent | 10 |
| `needs-review` | Needs Review | 7 |
| `informational` | Informational | 1 |
| `stale` | Stale | 0 |

### SideEffectDefinition

```typescript
type CallbackPhase =
  | 'before_watch'   | 'after_watch'
  | 'before_hydrate' | 'after_hydrate'
  | 'before_steer'   | 'after_steer';

interface SideEffectContext {
  readonly phase: CallbackPhase;
  readonly watcherId: string;
  readonly entries: readonly StateEntry[];    // available after watch; empty in before_watch
  readonly config: unknown;                  // watcher's validated config
  readonly signal: AbortSignal;
}

interface SideEffectResult {
  readonly halt?: boolean;                   // if true, skip remaining handlers in this phase
}

interface SideEffectDefinition {
  readonly id: string;
  readonly phase: CallbackPhase;
  readonly handler: (ctx: SideEffectContext) => Promise<SideEffectResult | void>;
}
```

**Active Record analogy**:

| Active Record | Sunobomoh |
|--------------|-----------|
| `before_save` | `before_watch` |
| `after_save` | `after_watch` |
| `before_validation` | `before_hydrate` |
| `after_validation` | `after_hydrate` |
| `before_destroy` | `before_steer` |
| `after_destroy` | `after_steer` |
| `throw ActiveRecord::Rollback` | `return { halt: true }` |

### HydratorDefinition

```typescript
interface HydratorDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  hydrate(
    entries: readonly StateEntry[],
    signal: AbortSignal
  ): Promise<readonly StateEntry[]>;
}
```

**Invariant**: A hydrator MUST return the same number of entries it receives. It MAY
mutate `hydratedData` and `metadata.hydratedAt` on each entry. It MUST NOT change
`id`, `sourceId`, `sourceUri`, or `timestamp`.

### SchedulerConfig

```typescript
interface SchedulerConfig {
  readonly intervalMinutes: number;           // default: 10
  readonly steeringIntervalMinutes: number;   // default: 60; must be a multiple of intervalMinutes
  readonly maxConcurrentWatchers: number;     // default: 3
  readonly timeoutMs: number;                 // per-watcher timeout; default: 30_000
}
```

### SteeringConfig

```typescript
interface SteeringConfig {
  readonly promoteThreshold: number;          // default: 60 (0-100 score)
  readonly demoteThreshold: number;           // default: 20
  readonly recencyDecayHalfLifeHours: number; // default: 24 — score halves every N hours
  readonly llmSteering: boolean;              // default: false
  readonly llmBorderlineWindow: number;       // entries within ±10 of thresholds go to LLM
}
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| `StateEntry.id` | Must be UUID v4 |
| `StateEntry.sourceUri` | Must satisfy RFC 3986 syntax |
| `StateEntry.timestamp` | Must be valid ISO 8601 |
| `StateEntry.tags` | Must be non-empty array; each tag must exist in TagRegistry |
| `StateEntry.attentionScore` | If present, must be in [0, 100] |
| `TagOutcome.status` | Must be one of the four status literals |
| `TagOutcome.outcome` | If `TagDefinition.outcomeSchema` exists, must validate against it |
| `SchedulerConfig.steeringIntervalMinutes` | Must be a positive multiple of `intervalMinutes` |
| `SteeringConfig.promoteThreshold` | Must be > `demoteThreshold` |

---

## Indexes (in-memory, rebuilt on load)

| Index | Key | Purpose |
|-------|-----|---------|
| `byId` | `StateEntry.id` | O(1) lookup for patches, steering, mark tools |
| `byTag` | `tag → StateEntry.id[]` | O(1) tag filtering in queries |
| `bySourceId` | `watcher.id → StateEntry.id[]` | O(1) per-watcher history |
| `needsAttention` | `Set<StateEntry.id>` | O(1) for UI widget count |
| `lastSteeringRun` | single `SteeringRun` | fast access for steering scheduler |
