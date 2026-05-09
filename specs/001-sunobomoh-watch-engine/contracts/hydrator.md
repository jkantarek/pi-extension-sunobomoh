# Contract: HydratorDefinition

**Files**: `src/hydrators/types.ts`, `src/hydrators/pipeline.ts`, `src/hydrators/invariants.ts`

Patterns: **Middleware Pipeline** (identical `(entries, signal) => entries` shape for all hydrators),
**Pure Function** (runHydrationPipeline — a `for...of` loop, no class),
**Railway-Oriented Programming** (Result return).

---

## `src/hydrators/types.ts`

````typescript
import type { StateEntry } from '../state/types.js';

/**
 * Pluggable enrichment step. All hydrators share an identical signature — this is
 * the Middleware pattern. runHydrationPipeline() threads them serially.
 *
 * @example
 * ```ts @import.meta.vitest
 * import type { HydratorDefinition } from '../hydrators/types.js';
 * import { makeTestEntry } from '../state/test-fixtures.js';
 * const noOp: HydratorDefinition = {
 *   id: 'noop', name: 'No-op', description: 'passes through unchanged',
 *   hydrate: async (entries) => entries,
 * };
 * const input = [makeTestEntry()];
 * const result = await noOp.hydrate(input, new AbortController().signal);
 * expect(result).toHaveLength(1);
 * expect(result[0]?.id).toBe(input[0]?.id);
 * ```
 */
export interface HydratorDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * Enrich entries. Receives the full tick batch. Returns same-length batch.
   *
   * INVARIANTS (enforced by assertHydrationInvariants after each step):
   *   - result.length === entries.length
   *   - result[i].id        === entries[i].id        for all i
   *   - result[i].sourceId  === entries[i].sourceId  for all i
   *   - result[i].sourceUri === entries[i].sourceUri for all i
   *   - result[i].timestamp === entries[i].timestamp for all i
   *
   * MAY set: hydratedData, metadata.hydratedAt
   * MUST NOT change: id, sourceId, sourceUri, timestamp
   * MUST honour signal.aborted — reject with AbortError.
   */
  hydrate(entries: readonly StateEntry[], signal: AbortSignal): Promise<readonly StateEntry[]>;
}
````

---

## `src/hydrators/pipeline.ts` — Pure Pipeline Function

The entire pipeline is one exported pure function. No class, no instance state.
Internally a `for...of` loop; each step receives the output of the previous.

````typescript
import type { Result } from '../core/result.js';
import type { StateEntry } from '../state/types.js';
import type { HydratorDefinition } from './types.js';

export interface HydrationError {
  readonly hydratorId: string;
  readonly cause: Error;
  readonly entriesAtFailure: readonly StateEntry[];
}

/**
 * Run hydrators serially. Returns Result — never throws.
 * On failure, entriesAtFailure contains the batch as of the last successful step.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { runHydrationPipeline } from '../hydrators/pipeline.js';
 * import { makeTestEntry } from '../state/test-fixtures.js';
 * import { isOk } from '../core/result.js';
 * const entries = [makeTestEntry(), makeTestEntry()];
 * const noOp = { id: 'noop', name: 'No-op', description: '', hydrate: async (e: any) => e };
 * const result = await runHydrationPipeline([noOp], entries, new AbortController().signal);
 * expect(isOk(result)).toBe(true);
 * if (isOk(result)) expect(result.value).toHaveLength(2);
 * ```
 */
export declare const runHydrationPipeline: (
  hydrators: readonly HydratorDefinition[],
  entries: readonly StateEntry[],
  signal: AbortSignal,
) => Promise<Result<readonly StateEntry[], HydrationError>>;
````

---

## `src/hydrators/invariants.ts` — Pure Assertion Function

Extracted separately so invariant logic is independently testable.
Called by `runHydrationPipeline` after every hydrator step.

````typescript
import type { StateEntry } from '../state/types.js';

export class HydrationInvariantError extends Error {
  constructor(
    public readonly hydratorId: string,
    public readonly violation: string,
  ) {
    super(`Hydration invariant violated by "${hydratorId}": ${violation}`);
  }
}

/**
 * @example
 * ```ts @import.meta.vitest
 * import { assertHydrationInvariants, HydrationInvariantError } from '../hydrators/invariants.js';
 * import { makeTestEntry } from '../state/test-fixtures.js';
 * const before = [makeTestEntry()];
 * const after  = [{ ...before[0]! }];
 * expect(() => assertHydrationInvariants('h1', before, after)).not.toThrow();
 *
 * const wrongLength = [...before, makeTestEntry()];
 * expect(() => assertHydrationInvariants('h1', before, wrongLength))
 *   .toThrow(HydrationInvariantError);
 *
 * const changedId = [{ ...before[0]!, id: 'tampered' as any }];
 * expect(() => assertHydrationInvariants('h1', before, changedId))
 *   .toThrow(HydrationInvariantError);
 * ```
 */
export declare const assertHydrationInvariants: (
  hydratorId: string,
  before: readonly StateEntry[],
  after: readonly StateEntry[],
) => void;
````

---

## Pipeline Execution Flow

```
entries (original batch)
  │
  ▼  assertHydrationInvariants('h0', entries, result0)
hydrators[0].hydrate(entries, signal) → Result<StateEntry[], Error>
  │  err → return HydrationError{ entriesAtFailure: entries }
  ▼
enriched_0
  │
  ▼  assertHydrationInvariants('h1', enriched_0, result1)
hydrators[1].hydrate(enriched_0, signal) → Result<StateEntry[], Error>
  │  err → return HydrationError{ entriesAtFailure: enriched_0 }
  ▼
...
  ▼
final enriched batch → ok(batch)
```

If `hydrators` is empty, `runHydrationPipeline` returns `ok(entries)` immediately.
