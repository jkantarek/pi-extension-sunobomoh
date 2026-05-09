# Contract: WatcherDefinition

**Files**: `src/watchers/types.ts`, `src/watchers/registry.ts`,
`src/watchers/runner.ts`, `src/watchers/coerce.ts`

Patterns: **Strategy** (WatcherDefinition), **Generic Registry** (thin wrapper over `src/core/registry.ts`),
**Pure Function** (runWatcher, toStateEntry), **Railway-Oriented Programming** (Result return).

---

## `src/watchers/types.ts`

````typescript
import type { TSchema } from 'typebox';
import type { WatcherId, TagId, ResourceUri } from '../core/brands.js';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';

/**
 * Plugin contract for a data-source watcher.
 * One plain object per file — no abstract base class, no inheritance.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { Type } from 'typebox';
 * import { unsafeWatcherId, unsafeTagId, toResourceUri, isOk } from '../core/brands.js';
 * import type { WatcherDefinition } from '../watchers/types.js';
 * const w: WatcherDefinition = {
 *   id: unsafeWatcherId('test'),
 *   name: 'Test', description: 'desc',
 *   configSchema: Type.Object({}),
 *   watch: async () => [],
 *   extractUri: () => { const r = toResourceUri('file:///test'); return isOk(r) ? r.value : (() => { throw new Error() })(); },
 *   extractTags: () => [unsafeTagId('informational')],
 * };
 * expect(w.id).toBe('test');
 * ```
 */
export interface WatcherDefinition<TConfig = unknown, TEvent = unknown> {
  /** Stable unique identifier. Becomes StateEntry.sourceId. */
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  /** TypeBox schema. Validated by createWatcherRegistry() before watch() is called. */
  readonly configSchema: TSchema;
  /** Pull-model: resolves array (never streams). Must honour signal.aborted. */
  watch(config: TConfig, signal: AbortSignal): Promise<readonly TEvent[]>;
  /** Must return a valid ResourceUri. Called once per event. */
  extractUri(event: TEvent, config: TConfig): ResourceUri;
  /**
   * Derive a short human-readable label for TUI display.
   * Should be < 60 chars — truncated automatically to fit terminal width.
   * Examples: GitHub issue title, Slack message preview, filename.
   */
  extractLabel(event: TEvent, config: TConfig): string;
  /** Must return ≥ 1 TagId. Called once per event. */
  extractTags(event: TEvent, config: TConfig): readonly TagId[];
  readonly hydrators?: readonly HydratorDefinition[];
  readonly sideEffects?: readonly SideEffectDefinition[];
}

/** Validated config bound to its definition — passed to runWatcher(). */
export interface BoundWatcher<TConfig = unknown> {
  readonly definition: WatcherDefinition<TConfig>;
  readonly config: TConfig;
}
````

---

## `src/watchers/registry.ts`

Pattern: **Generic Registry** — thin wrapper over `createRegistry<T>` from `src/core/registry.ts`.
The entire file is ~8 non-comment lines.

```typescript
import { createRegistry } from '../core/registry.js';
import type { BoundWatcher } from './types.js';

export const createWatcherRegistry = () => createRegistry<BoundWatcher>((w) => w.definition.id);
```

---

## `src/watchers/runner.ts` — Pure Function

Pattern: **Pure Function** + **Railway-Oriented Programming**.
`runWatcher` is a standalone exported function — no class, no instance state.

````typescript
import type { Result } from '../core/result.js';
import type { Clock } from '../core/ports.js';
import type { StateEntry } from '../state/types.js';
import type { BoundWatcher } from './types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';

export interface WatcherRunError {
  readonly watcherId: string;
  readonly cause: Error;
}

/**
 * Execute one watcher tick: side-effects → watch → coerce → side-effects → hydrate.
 * Returns Result — never throws.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { runWatcher } from '../watchers/runner.js';
 * import { createSystemClock } from '../core/ports.js';
 * import { isOk } from '../core/result.js';
 * import { Type } from 'typebox';
 * import { unsafeWatcherId, unsafeTagId, toResourceUri } from '../core/brands.js';
 * const watcher = {
 *   definition: {
 *     id: unsafeWatcherId('noop'), name: 'Noop', description: '',
 *     configSchema: Type.Object({}),
 *     watch: async () => [],
 *     extractUri: () => toResourceUri('file:///x').value!,
 *     extractTags: () => [unsafeTagId('informational')],
 *   },
 *   config: {},
 * };
 * const result = await runWatcher(watcher, [], createSystemClock(), new AbortController().signal);
 * expect(isOk(result)).toBe(true);
 * if (isOk(result)) expect(result.value).toHaveLength(0);
 * ```
 */
export declare const runWatcher: (
  watcher: BoundWatcher,
  sideEffects: readonly SideEffectDefinition[],
  clock: Clock,
  signal: AbortSignal,
) => Promise<Result<readonly StateEntry[], WatcherRunError>>;
````

---

## `src/watchers/coerce.ts` — Pure Coercion Function

Extracted separately so it can be doctested independently of the runner's async complexity.

````typescript
import type { Clock } from '../core/ports.js';
import type { IdFactory } from '../core/ids.js';
import type { WatcherDefinition } from './types.js';
import type { StateEntry } from '../state/types.js';

/**
 * Convert one raw watcher event to a StateEntry value object.
 * Pure, synchronous, no side-effects.
 * Receives IdFactory so callers control ULID generation (deterministic in tests).
 *
 * @example
 * ```ts @import.meta.vitest
 * import { toStateEntry } from '../watchers/coerce.js';
 * import { createSystemClock } from '../core/ports.js';
 * import { createIdFactory } from '../core/ids.js';
 * import { unsafeWatcherId, unsafeTagId, toResourceUri } from '../core/brands.js';
 * import { Type } from 'typebox';
 * const def = {
 *   id: unsafeWatcherId('gh'),
 *   name: 'GitHub', description: '',
 *   configSchema: Type.Object({}),
 *   watch: async () => [],
 *   extractUri: () => toResourceUri('github:///owner/repo/issues/1').value!,
 *   extractLabel: (_event: unknown) => 'Fix auth bug',
 *   extractTags: () => [unsafeTagId('needs-review')],
 * };
 * const entry = toStateEntry({ number: 1, title: 'Fix auth bug' }, def, {},
 *   createSystemClock(), createIdFactory(() => 0.5));
 * expect(entry.sourceId).toBe('gh');
 * expect(entry.label).toBe('Fix auth bug');
 * expect(entry.id).toHaveLength(26);       // ULID
 * expect(entry.tags).toContain('needs-review');
 * expect(entry.needsAttention).toBe(false);
 * ```
 */
export declare const toStateEntry: <TConfig, TEvent>(
  event: TEvent,
  definition: WatcherDefinition<TConfig, TEvent>,
  config: TConfig,
  clock: Clock,
  ids: IdFactory,
) => StateEntry;
````

---

## Guarantees

- `watch()` MUST return an array (empty is valid).
- `extractUri()` MUST return a `ResourceUri` brand (validated at construction time).
- `extractTags()` MUST return a non-empty array of `TagId` brands.
- Watcher MUST NOT mutate any argument.
- All async operations MUST honour `signal.aborted`.

---

## Error Handling

- `runWatcher()` returns `Result<readonly StateEntry[], WatcherRunError>` — never throws.
- `WatcherRunError` is recorded in `SchedulerRun.errored`; execution continues with next watcher.
- `extractUri()` or `extractTags()` errors cause that event to be dropped and logged.
