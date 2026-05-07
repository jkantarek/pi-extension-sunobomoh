# Contract: WatcherDefinition

**File**: `src/watchers/types.ts`

The `WatcherDefinition<TConfig, TEvent>` interface is the plugin contract all
watcher implementations must satisfy. A watcher is a plain TypeScript object
(not a class) — one `WatcherDefinition` per file.

---

## Interface

```typescript
import type { TSchema } from 'typebox';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';
import type { StateEntry } from '../state/types.js';

/**
 * Full definition of a pluggable watcher.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { validateWatcherDefinition } from '../watchers/registry.js';
 * const w = { id: 'test', name: 'Test', description: 'desc',
 *   configSchema: Type.Object({}),
 *   watch: async () => [],
 *   extractUri: () => 'file:///test',
 *   extractTags: () => ['informational'] };
 * expect(validateWatcherDefinition(w)).toBe(true);
 * ```
 */
export interface WatcherDefinition<TConfig = unknown, TEvent = unknown> {
  /** Stable unique identifier. Used as StateEntry.sourceId. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** One-sentence description shown in /watch command output. */
  readonly description: string;
  /**
   * TypeBox schema for the config object passed to watch().
   * Validated by WatcherRegistry before watch() is invoked.
   */
  readonly configSchema: TSchema;

  /**
   * Collect events from the data source.
   * Must resolve (never stream — pull model) within the scheduler timeout.
   * Must honour signal.aborted and reject with AbortError when cancelled.
   */
  watch(config: TConfig, signal: AbortSignal): Promise<readonly TEvent[]>;

  /**
   * Derive a RFC 3986 URI (any scheme) identifying the external resource.
   * Used as StateEntry.sourceUri.
   */
  extractUri(event: TEvent, config: TConfig): string;

  /**
   * Return one or more tag ids that apply to this event.
   * Tags must be registered in TagRegistry before the first watch tick.
   * At least one tag is required.
   */
  extractTags(event: TEvent, config: TConfig): readonly string[];

  /**
   * Ordered hydrators applied after watch(). Each receives the full batch
   * of StateEntries produced by this watcher's current tick.
   */
  readonly hydrators?: readonly HydratorDefinition[];

  /**
   * Active Record–style callbacks. Executed by SideEffectExecutor at each phase.
   * Multiple definitions for the same phase run in array order.
   * Return { halt: true } to skip remaining handlers in that phase.
   */
  readonly sideEffects?: readonly SideEffectDefinition[];
}

/** Validated watcher config + its definition, bundled for the runner. */
export interface BoundWatcher<TConfig = unknown> {
  readonly definition: WatcherDefinition<TConfig>;
  readonly config: TConfig;
}
```

---

## Guarantees

- `watch()` MUST return an array (empty is valid; never `undefined` or `null`).
- `extractUri()` MUST return a syntactically valid RFC 3986 URI string.
- `extractTags()` MUST return a non-empty array.
- A watcher MUST NOT mutate any argument passed to it.
- All async operations MUST be abortable via `signal`.

---

## Error Handling

- If `watch()` rejects, `WatcherRunner` catches the error, writes an error entry to
  `SchedulerRun.errored`, emits `sunobomoh:watch_error` on `pi.events`, and continues
  with the next watcher. It does NOT rethrow.
- If `extractUri()` or `extractTags()` throw, the event is dropped and logged.
