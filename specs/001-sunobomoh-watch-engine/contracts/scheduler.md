# Contract: Scheduler & Steerer

**Files**: `src/scheduler/types.ts`, `src/steering/types.ts`

---

## SchedulerConfig

```typescript
/**
 * Configuration for the polling scheduler.
 * Validated by TypeBox before Scheduler.start() is called.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { DEFAULT_SCHEDULER_CONFIG } from '../scheduler/scheduler.js';
 * expect(DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(10);
 * expect(DEFAULT_SCHEDULER_CONFIG.steeringIntervalMinutes % DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(0);
 * ```
 */
export interface SchedulerConfig {
  /** Minutes between watcher polls. Default: 10. */
  readonly intervalMinutes: number;
  /**
   * Minutes between steering runs. Must be a positive integer multiple of
   * intervalMinutes. Default: 60.
   */
  readonly steeringIntervalMinutes: number;
  /**
   * Maximum number of watchers running concurrently within one tick.
   * Default: 3.
   */
  readonly maxConcurrentWatchers: number;
  /**
   * Per-watcher abort timeout in milliseconds. Default: 30_000.
   */
  readonly timeoutMs: number;
}

export interface SchedulerState {
  readonly running: boolean;
  readonly lastTickAt?: string;      // ISO 8601
  readonly lastSteeringAt?: string;  // ISO 8601
  readonly nextTickAt?: string;      // ISO 8601
  readonly tickCount: number;
}
```

---

## Scheduler Public API

```typescript
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

## SteeringConfig

```typescript
/**
 * Configuration for the attention-scoring steerer.
 *
 * Scoring formula (rule-based):
 *   score = Σ(tag.attentionWeight * 10) * recencyFactor
 *   recencyFactor = 0.5 ^ (ageHours / recencyDecayHalfLifeHours)
 *
 * Entries with score >= promoteThreshold → needsAttention = true
 * Entries with score <= demoteThreshold  → needsAttention = false
 * Entries in between → unchanged; optionally forwarded to LLM
 *
 * @example
 * ```ts @import.meta.vitest
 * import { DEFAULT_STEERING_CONFIG } from '../steering/steerer.js';
 * expect(DEFAULT_STEERING_CONFIG.promoteThreshold).toBeGreaterThan(
 *   DEFAULT_STEERING_CONFIG.demoteThreshold
 * );
 * ```
 */
export interface SteeringConfig {
  /** Score threshold above which entries get needsAttention = true. Default: 60. */
  readonly promoteThreshold: number;
  /** Score threshold below which entries get needsAttention = false. Default: 20. */
  readonly demoteThreshold: number;
  /**
   * Recency decay: score halves every N hours of age. Default: 24.
   * Set to Infinity to disable recency decay.
   */
  readonly recencyDecayHalfLifeHours: number;
  /**
   * When true, entries with scores in the borderline window
   * [demoteThreshold, promoteThreshold] are forwarded to the LLM
   * for a final attention decision via pi.sendUserMessage.
   * Default: false.
   */
  readonly llmSteering: boolean;
  /**
   * Number of borderline entries to send to LLM per steering run.
   * Prevents token overruns. Default: 10.
   */
  readonly llmBorderlineLimit: number;
}

export interface AttentionScore {
  readonly entryId: string;
  readonly score: number;
  readonly breakdown: readonly { tagId: string; contribution: number }[];
  readonly recencyFactor: number;
  readonly decision: 'promote' | 'demote' | 'borderline';
}

export interface SteeringResult {
  readonly promoted: readonly string[];
  readonly demoted: readonly string[];
  readonly borderline: readonly string[];
  readonly llmOverrides: readonly { entryId: string; decision: 'promote' | 'demote' }[];
}
```

---

## Steerer Public API

```typescript
export interface SteererAPI {
  /**
   * Score all entries and apply promotion/demotion decisions.
   * Writes StatePatch lines to StateStore for each changed entry.
   * Writes a SteeringRun line when complete.
   * Returns the SteeringResult.
   */
  run(signal: AbortSignal): Promise<SteeringResult>;
  scoreEntry(entry: StateEntry): AttentionScore;
}
```

---

## LLM Steering Protocol

When `config.llmSteering = true` and there are borderline entries, the Steerer
calls `pi.sendUserMessage` with the following structured prompt:

```
[Sunobomoh Steering Request]

The following events are borderline for attention promotion.
For each entry, respond with either "promote" or "demote" and a brief reason.

Entry github:///owner/repo/issues/42 (score: 38)
  Tags: needs-review, stale
  Data: { title: "Fix auth bug", age: "18 hours" }

Entry file:///home/user/project/src/auth.ts (score: 45)
  Tags: needs-review
  Data: { lastModified: "2026-05-06T22:00:00Z", size: 4200 }

Respond with JSON: [{"id":"<sourceUri>","decision":"promote"|"demote","reason":"..."}]
```

The Steerer parses the LLM's JSON response and applies the overrides as `StatePatch`
records with `reason` set to the LLM's rationale string.
