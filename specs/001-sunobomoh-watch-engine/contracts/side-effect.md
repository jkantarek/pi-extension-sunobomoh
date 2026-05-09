# Contract: SideEffectDefinition (Active Record Callbacks)

**Files**: `src/side-effects/types.ts`, `src/side-effects/executor.ts`

Patterns: **Chain of Responsibility** (halt-able loop), **Pure Function** (runPhase — no class),
**Railway-Oriented Programming** (Result return).

Side effects are the Active Record callback layer. They are declared on each
`WatcherDefinition` and executed by the `runPhase()` pure function at each lifecycle phase.

---

## Callback Phases

```
before_watch      → watch() call → after_watch
before_hydrate    → hydrate()    → after_hydrate
before_steer      → steer()      → after_steer
```

Phases fire in the order shown. Within a phase, handlers run in the array order
they appear in `watcher.sideEffects`.

---

## Interfaces

```typescript
import type { WatcherId } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';

/**
 * The six lifecycle phases, modelled after Active Record callbacks.
 *
 * | Phase           | AR Analogue        | When it fires                            |
 * |-----------------|--------------------|------------------------------------------|
 * | before_watch    | before_save        | Before watcher.watch() is called         |
 * | after_watch     | after_save         | After watcher.watch() resolves           |
 * | before_hydrate  | before_validation  | Before each hydrator in the pipeline     |
 * | after_hydrate   | after_validation   | After all hydrators complete             |
 * | before_steer    | before_destroy     | Before the hourly Steerer.run()          |
 * | after_steer     | after_destroy      | After Steerer.run() completes            |
 */
export type CallbackPhase =
  | 'before_watch'
  | 'after_watch'
  | 'before_hydrate'
  | 'after_hydrate'
  | 'before_steer'
  | 'after_steer';

/**
 * Context passed to every side-effect handler.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { buildSideEffectContext } from '../side-effects/executor.js';
 * const ctx = buildSideEffectContext('before_watch', 'github', [], {}, new AbortController().signal);
 * expect(ctx.phase).toBe('before_watch');
 * expect(ctx.entries).toHaveLength(0);
 * ```
 */
export interface SideEffectContext {
  /** The phase in which this handler is being called. */
  readonly phase: CallbackPhase;
  /** Id of the watcher that owns this side effect. */
  readonly watcherId: WatcherId;
  /**
   * Entries available at this phase.
   * Empty for before_watch; populated for after_watch and later phases.
   * For before/after_steer this is the full batch being steered.
   */
  readonly entries: readonly StateEntry[];
  /** The validated watcher config. */
  readonly config: unknown;
  /** Abort signal from the current scheduler tick. */
  readonly signal: AbortSignal;
}

/**
 * Optional return from a side-effect handler.
 * Return { halt: true } to short-circuit remaining handlers in this phase
 * (analogous to throwing ActiveRecord::Rollback in a before callback).
 */
export interface SideEffectResult {
  readonly halt?: boolean;
}

/**
 * A single Active Record–style callback.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { SideEffectDefinition } from '../side-effects/types.js';
 * const effect: SideEffectDefinition = {
 *   id: 'log-after-watch',
 *   phase: 'after_watch',
 *   handler: async (ctx) => { /* log ctx.entries.length *\/ }
 * };
 * expect(effect.phase).toBe('after_watch');
 * ```
 */
export interface SideEffectDefinition {
  /** Stable unique id. Used in logs and error messages. */
  readonly id: string;
  /** The phase this handler fires in. */
  readonly phase: CallbackPhase;
  /** The callback. May be async. Must honour signal.aborted. */
  readonly handler: (ctx: SideEffectContext) => Promise<SideEffectResult | void>;
}
```

---

## `src/side-effects/executor.ts` — Pure Functions

No class. Two exported pure functions. No instance state.

```typescript
import type { Result } from '../core/result.js';
import type { WatcherId } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';

export interface PhaseRunResult {
  readonly halted: boolean;
  readonly ranCount: number;
}

export interface SideEffectError {
  readonly definitionId: string;
  readonly cause: Error;
}

/**
 * Filter definitions to a single phase. Pure, synchronous.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { phaseHandlers } from '../side-effects/executor.js';
 * const defs = [
 *   { id: 'a', phase: 'before_watch' as const, handler: async () => {} },
 *   { id: 'b', phase: 'after_watch'  as const, handler: async () => {} },
 * ];
 * expect(phaseHandlers('before_watch', defs)).toHaveLength(1);
 * expect(phaseHandlers('after_hydrate', defs)).toHaveLength(0);
 * ```
 */
export declare const phaseHandlers: (
  phase: CallbackPhase,
  defs: readonly SideEffectDefinition[],
) => readonly SideEffectDefinition[];

/**
 * Run phase-matched handlers in array order. Returns Result — never throws.
 * On { halt: true } from any handler, stops and returns { halted: true }.
 * On thrown error, records it and continues to next handler (errors ≠ halt).
 *
 * @example
 * ```ts @import.meta.vitest
 * import { runPhase } from '../side-effects/executor.js';
 * import { isOk } from '../core/result.js';
 * import { unsafeWatcherId } from '../core/brands.js';
 * const haltingDef = {
 *   id: 'halt', phase: 'before_watch' as const,
 *   handler: async () => ({ halt: true as const }),
 * };
 * const ctx = { phase: 'before_watch' as const, watcherId: unsafeWatcherId('w'),
 *               entries: [], config: {}, signal: new AbortController().signal };
 * const result = await runPhase('before_watch', [haltingDef], ctx);
 * expect(isOk(result)).toBe(true);
 * if (isOk(result)) {
 *   expect(result.value.halted).toBe(true);
 *   expect(result.value.ranCount).toBe(1);
 * }
 * ```
 */
export declare const runPhase: (
  phase: CallbackPhase,
  defs: readonly SideEffectDefinition[],
  ctx: SideEffectContext,
) => Promise<Result<PhaseRunResult, SideEffectError>>;
```

**Execution Contract**:
1. `phaseHandlers(phase, defs)` filters in O(n).
2. `runPhase` iterates the filtered list in array order.
3. Each handler receives an immutable `SideEffectContext`.
4. `{ halt: true }` → stop; return `ok({ halted: true, ranCount: n })`.
5. Thrown error → record as `SideEffectError`, continue next handler.
   (Errors do NOT halt. Only `{ halt: true }` halts.)
6. Returns `Result` — the extension façade decides whether to surface errors.

---

## Lifecycle Example (GitHub watcher with Slack notification)

```typescript
const githubWatcher: WatcherDefinition = {
  id: 'github',
  // ...
  sideEffects: [
    {
      id: 'skip-bot-events',
      phase: 'before_watch',
      // Abort the entire watch tick for this watcher when in quiet hours
      handler: async (ctx) => {
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 7) return { halt: true };
      },
    },
    {
      id: 'slack-notify-urgent',
      phase: 'after_hydrate',
      // After hydration, notify Slack for urgent entries
      handler: async (ctx) => {
        const urgent = ctx.entries.filter(e => e.tags.includes('urgent'));
        for (const entry of urgent) {
          await slackClient.post(entry.sourceUri, entry.hydratedData);
        }
      },
    },
    {
      id: 'metrics-after-steer',
      phase: 'after_steer',
      handler: async (ctx) => {
        await metricsClient.record('steer.entries', ctx.entries.length);
      },
    },
  ],
};
```
