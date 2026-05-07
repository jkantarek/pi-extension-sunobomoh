# Contract: HydratorDefinition

**File**: `src/hydrators/types.ts`

A hydrator enriches a batch of `StateEntry` objects after they are produced by a
watcher. Hydrators run serially in the order declared on `WatcherDefinition.hydrators`.

---

## Interface

```typescript
import type { StateEntry } from '../state/types.js';

/**
 * Pluggable enrichment step. Receives a batch, returns the same-length
 * batch with hydratedData and/or metadata.hydratedAt populated.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { createNoOpHydrator } from '../hydrators/pipeline.js';
 * const h = createNoOpHydrator('test');
 * const entries = [makeTestEntry()];
 * const result = await h.hydrate(entries, new AbortController().signal);
 * expect(result).toHaveLength(1);
 * expect(result[0]?.id).toBe(entries[0]?.id);
 * ```
 */
export interface HydratorDefinition {
  /** Stable unique identifier. */
  readonly id: string;
  /** Human-readable name for logging and TUI display. */
  readonly name: string;
  /** One-sentence description of what this hydrator adds. */
  readonly description: string;

  /**
   * Enrich entries. Called once per watcher tick with the full batch.
   *
   * INVARIANTS (enforced by HydrationPipeline at runtime):
   *   - return.length === entries.length
   *   - return[i].id === entries[i].id (identity preserved)
   *   - return[i].sourceId === entries[i].sourceId
   *   - return[i].sourceUri === entries[i].sourceUri
   *   - return[i].timestamp === entries[i].timestamp
   *
   * ALLOWED mutations:
   *   - hydratedData: set to any value
   *   - metadata.hydratedAt: set to ISO 8601 timestamp
   *
   * MUST honour signal.aborted and reject with AbortError.
   */
  hydrate(
    entries: readonly StateEntry[],
    signal: AbortSignal
  ): Promise<readonly StateEntry[]>;
}
```

---

## Pipeline Execution Contract

`HydrationPipeline` calls each hydrator in order:

```
entries (original batch)
  │
  ▼ hydrators[0].hydrate(entries, signal)
  │
  ▼ hydrators[1].hydrate(enriched_0, signal)   ← receives output of previous
  │
  ▼ hydrators[N].hydrate(enriched_N-1, signal)
  │
  ▼ final enriched batch → StateStore
```

If any hydrator rejects, the pipeline halts and the batch is persisted with
`hydratedData` in whatever state it was after the last successful hydrator.

---

## Error Handling

- Invariant violations cause `HydrationPipeline` to throw `HydrationInvariantError`.
- Network/API failures inside `hydrate()` should reject; the pipeline logs and halts.
- AbortError propagation is mandatory.
