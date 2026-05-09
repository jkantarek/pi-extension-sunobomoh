# Contract: Scheduler & Steerer

**Files**: `src/scheduler/types.ts`, `src/scheduler/should-steer.ts`, `src/scheduler/scheduler.ts`,
`src/steering/types.ts`, `src/steering/score-entry.ts`, `src/steering/classify.ts`, `src/steering/steerer.ts`

Patterns: **Self-Scheduling setTimeout** (Scheduler), **Specification** (shouldRunSteering, classify),
**Pure Function** (scoreEntry), **Strategy** (LlmSteeringStrategy), **Factory Function** (createScheduler, createSteerer).

---

## `src/scheduler/types.ts`

```typescript
import type { IsoTimestamp } from '../core/brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { DEFAULT_SCHEDULER_CONFIG } from '../scheduler/scheduler.js';
 * expect(DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(10);
 * expect(DEFAULT_SCHEDULER_CONFIG.steeringIntervalMinutes % DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(0);
 * expect(DEFAULT_SCHEDULER_CONFIG.maxConcurrentWatchers).toBe(3);
 * ```
 */
export interface SchedulerConfig {
  readonly intervalMinutes: number;           // default: 10
  readonly steeringIntervalMinutes: number;   // default: 60 — must be positive multiple of intervalMinutes
  readonly maxConcurrentWatchers: number;     // default: 3
  readonly timeoutMs: number;                 // per-watcher abort timeout; default: 30_000
}

export interface SchedulerState {
  readonly running: boolean;
  readonly lastTickAt?: IsoTimestamp;
  readonly lastSteeringAt?: IsoTimestamp;
  readonly nextTickAt?: IsoTimestamp;
  readonly tickCount: number;
}

export interface SchedulerAPI {
  start(): void;
  stop(): void;
  /** Force an immediate watcher tick (bypasses interval). */
  triggerTick(): Promise<void>;
  /** Force an immediate steering run (bypasses hourly interval). */
  triggerSteering(): Promise<void>;
  readonly state: SchedulerState;
}
```

---

## `src/scheduler/should-steer.ts` — Specification Predicate

Pattern: **Specification** — a single pure predicate extracted to its own file.
All timer-interval boundary conditions are doctestable without starting a scheduler.

```typescript
import type { IsoTimestamp } from '../core/brands.js';
import type { SchedulerConfig } from './types.js';

/**
 * Pure predicate: should a steering run fire given the last time it ran?
 * Handles the first-run case (lastSteeringAt undefined → always true).
 *
 * @example
 * ```ts @import.meta.vitest
 * import { shouldRunSteering } from '../scheduler/should-steer.js';
 * import { toIsoTimestamp } from '../core/brands.js';
 * const cfg = { intervalMinutes: 10, steeringIntervalMinutes: 60,
 *               maxConcurrentWatchers: 3, timeoutMs: 30_000 };
 * const base = new Date('2026-05-07T10:00:00Z');
 * const now  = toIsoTimestamp(base);
 *
 * // First run — no previous steering
 * expect(shouldRunSteering(undefined, now, cfg)).toBe(true);
 *
 * // Just ran — not yet due
 * expect(shouldRunSteering(now, now, cfg)).toBe(false);
 *
 * // Exactly 60 min later — due
 * const plus60 = toIsoTimestamp(new Date(base.getTime() + 60 * 60_000));
 * expect(shouldRunSteering(now, plus60, cfg)).toBe(true);
 *
 * // 59 min 59 sec later — not yet due
 * const almostDue = toIsoTimestamp(new Date(base.getTime() + (60 * 60_000 - 1000)));
 * expect(shouldRunSteering(now, almostDue, cfg)).toBe(false);
 * ```
 */
export declare const shouldRunSteering: (
  lastSteeringAt: IsoTimestamp | undefined,
  now: IsoTimestamp,
  config: SchedulerConfig,
) => boolean;
```

---

## `src/scheduler/scheduler.ts` — Factory Function

Pattern: **Self-Scheduling setTimeout** (not setInterval — avoids drift).
**Template Method via injection** — the tick structure is fixed; watcher execution and
steering are injected strategies. **Clock port** is injected — no `vi.useFakeTimers()` needed.

```typescript
import type { Result } from '../core/result.js';
import type { Clock } from '../core/ports.js';
import type { StateEntry } from '../state/types.js';
import type { WatcherId } from '../core/brands.js';

export type WatcherRunnerFn = (signal: AbortSignal) =>
  Promise<Result<readonly StateEntry[], Error>>;
export type SteeringFn = (signal: AbortSignal) =>
  Promise<Result<void, Error>>;

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMinutes: 10,
  steeringIntervalMinutes: 60,
  maxConcurrentWatchers: 3,
  timeoutMs: 30_000,
};

/**
 * @example
 * ```ts @import.meta.vitest
 * import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from '../scheduler/scheduler.js';
 * import { ok } from '../core/result.js';
 * import { toIsoTimestamp } from '../core/brands.js';
 * let ticks = 0;
 * const scheduler = createScheduler(
 *   DEFAULT_SCHEDULER_CONFIG,
 *   async () => { ticks++; return ok([]); },
 *   async () => ok(undefined),
 *   { now: () => toIsoTimestamp(new Date()) },
 * );
 * expect(scheduler.state.running).toBe(false);
 * await scheduler.triggerTick();
 * expect(ticks).toBe(1);
 * ```
 */
export declare const createScheduler: (
  config: SchedulerConfig,
  runWatchers: WatcherRunnerFn,
  runSteering: SteeringFn,
  clock: Clock,
) => SchedulerAPI;
```

**Self-scheduling pattern** (internal, not exported):
```typescript
const tick = async (): Promise<void> => {
  await runWatchers(signal);
  if (shouldRunSteering(state.lastSteeringAt, clock.now(), config)) {
    await runSteering(signal);
  }
  if (state.running) {
    timeoutHandle = setTimeout(tick, config.intervalMinutes * 60_000);
  }
};
```
This reschedules after work completes, so wall-clock drift accumulates only from
actual work duration — never from interval callback queuing lag.

---

## `src/steering/types.ts`

```typescript
import type { EntryId } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import type { Result } from '../core/result.js';

export interface SteeringConfig {
  readonly promoteThreshold: number;           // default: 60
  readonly demoteThreshold: number;            // default: 20 — must be < promoteThreshold
  readonly recencyDecayHalfLifeHours: number;  // default: 24; Infinity disables decay
  readonly llmSteering: boolean;               // default: false
  readonly llmBorderlineLimit: number;         // default: 10 — max entries sent to LLM
}

export interface AttentionScore {
  readonly entryId: EntryId;
  readonly score: number;                      // 0–100
  readonly breakdown: readonly { tagId: string; contribution: number }[];
  readonly recencyFactor: number;              // 0–1
  readonly decision: 'promote' | 'demote' | 'borderline';
}

export interface LlmOverride {
  readonly entryId: EntryId;
  readonly decision: 'promote' | 'demote';
  readonly reason: string;
}

export interface SteeringResult {
  readonly promoted:     readonly EntryId[];
  readonly demoted:      readonly EntryId[];
  readonly borderline:   readonly EntryId[];
  readonly llmOverrides: readonly LlmOverride[];
}

/**
 * Strategy type for the optional LLM path.
 * The pi-specific implementation lives only in src/extension/index.ts (the façade).
 * Domain code stays pi-agnostic.
 */
export type LlmSteeringStrategy = (
  borderlineEntries: readonly StateEntry[],
  signal: AbortSignal,
) => Promise<Result<readonly LlmOverride[], Error>>;

export interface SteererAPI {
  run(signal: AbortSignal): Promise<Result<SteeringResult, Error>>;
}
```

---

## `src/steering/score-entry.ts` — Pure Scoring Function

```typescript
import type { IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import type { TagDefinition } from '../tags/types.js';
import type { Registry } from '../core/registry.js';
import type { AttentionScore } from './types.js';

/**
 * Score one entry. Pure, deterministic, no I/O.
 * Formula: score = Σ(tag.attentionWeight × 10) × 0.5^(ageHours / halfLife)
 * Clamped to [0, 100].
 *
 * @example
 * ```ts @import.meta.vitest
 * import { scoreEntry } from '../steering/score-entry.js';
 * import { createTagRegistry } from '../tags/registry.js';
 * import { toIsoTimestamp, unsafeTagId } from '../core/brands.js';
 * import { makeTestEntry } from '../state/test-fixtures.js';
 * import { DEFAULT_STEERING_CONFIG } from '../steering/steerer.js';
 * const registry = createTagRegistry();
 * const now = toIsoTimestamp(new Date('2026-05-07T10:00:00Z'));
 * const entry = makeTestEntry({ tags: [unsafeTagId('urgent')] });
 * const score = scoreEntry(entry, registry, DEFAULT_STEERING_CONFIG, now);
 * expect(score.score).toBeGreaterThan(0);
 * expect(score.score).toBeLessThanOrEqual(100);
 * expect(score.breakdown.length).toBeGreaterThan(0);
 * ```
 */
export declare const scoreEntry: (
  entry: StateEntry,
  tagRegistry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp,
) => AttentionScore;
```

---

## `src/steering/classify.ts` — Specification Predicates

Three one-liner predicates. No `switch`, no nested ternary. Consumed directly by `steerer.ts`.

```typescript
import type { AttentionScore } from './types.js';
import type { SteeringConfig } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { isPromotable, isDemotable, isBorderline } from '../steering/classify.js';
 * const cfg = { promoteThreshold: 60, demoteThreshold: 20,
 *               recencyDecayHalfLifeHours: 24, llmSteering: false, llmBorderlineLimit: 10 };
 * const high:   AttentionScore = { entryId: 'e1' as any, score: 70, breakdown: [], recencyFactor: 1, decision: 'promote' };
 * const low:    AttentionScore = { entryId: 'e2' as any, score: 10, breakdown: [], recencyFactor: 1, decision: 'demote' };
 * const middle: AttentionScore = { entryId: 'e3' as any, score: 40, breakdown: [], recencyFactor: 1, decision: 'borderline' };
 *
 * expect(isPromotable(high, cfg)).toBe(true);
 * expect(isDemotable(low, cfg)).toBe(true);
 * expect(isBorderline(middle, cfg)).toBe(true);
 * expect(isPromotable(middle, cfg)).toBe(false);
 * expect(isDemotable(middle, cfg)).toBe(false);
 * ```
 */
export const isPromotable  = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score >= c.promoteThreshold;
export const isDemotable   = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score <= c.demoteThreshold;
export const isBorderline  = (s: AttentionScore, c: SteeringConfig): boolean =>
  !isPromotable(s, c) && !isDemotable(s, c);
```

---

## `src/steering/steerer.ts` — Factory Function

Pattern: **Strategy** for LLM path (injected, optional).
**Factory Function** — `createSteerer()` replaces a class.

```typescript
import type { Clock } from '../core/ports.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type { StateStoreAPI } from '../state/store.js';

export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  promoteThreshold: 60,
  demoteThreshold: 20,
  recencyDecayHalfLifeHours: 24,
  llmSteering: false,
  llmBorderlineLimit: 10,
};

/**
 * @example
 * ```ts @import.meta.vitest
 * import { createSteerer, DEFAULT_STEERING_CONFIG } from '../steering/steerer.js';
 * import { createTagRegistry } from '../tags/registry.js';
 * import { createStateStore } from '../state/store.js';
 * import { createNodeFileSystem, createSystemClock } from '../core/ports.js';
 * import { isOk } from '../core/result.js';
 * import { tmpdir } from 'node:os';
 * import { join } from 'node:path';
 * const store = createStateStore(join(tmpdir(), `steer-test-${Date.now()}.jsonl`),
 *   createNodeFileSystem(), createSystemClock());
 * await store.load();
 * const steerer = createSteerer(DEFAULT_STEERING_CONFIG, createTagRegistry(), store);
 * const result = await steerer.run(new AbortController().signal);
 * expect(isOk(result)).toBe(true);
 * if (isOk(result)) {
 *   expect(result.value.promoted).toHaveLength(0);
 *   expect(result.value.demoted).toHaveLength(0);
 * }
 * ```
 */
export declare const createSteerer: (
  config: SteeringConfig,
  tagRegistry: Registry<TagDefinition>,
  store: StateStoreAPI,
  llmStrategy?: LlmSteeringStrategy,   // absent = rule-only; pi impl injected in extension/index.ts
  clock?: Clock,
) => SteererAPI;
```

**Steerer run sequence**:
1. Load all entries from `store.model.byId`
2. `scoreEntry()` each → `AttentionScore[]`
3. Partition by `isPromotable / isDemotable / isBorderline`
4. If `config.llmSteering && llmStrategy && borderline.length > 0`:
   - Call `llmStrategy(borderlineEntries.slice(0, config.llmBorderlineLimit), signal)`
   - Apply overrides
5. Write `StatePatchJson` for each changed entry via `store.append()`
6. Write `SteeringRunJson` via `store.append()`
7. Return `ok(SteeringResult)`
