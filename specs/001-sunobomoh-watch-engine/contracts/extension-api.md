# Contract: Public Extension API

**Files**: `src/extension/api.ts`, `src/extension/index.ts`

Patterns: **Façade** (api.ts is the only public surface), **Module-level singleton**
(no `pi` argument threading required), **Registry** (BuiltinWatcherBundle).

---

## How Plugins Are Added — Three Paths

```
Path 1: Config file (built-in watchers only)
  .pi/sunobomoh.config.json  →  BuiltinWatcherBundle  →  WatcherRegistry

Path 2: Programmatic (custom watcher definitions)
  sibling pi extension  →  getSunobomoh().registerWatcher()  →  WatcherRegistry

Path 3: Watcher package (future, Phase 4)
  pi install @org/sunobomoh-github  →  sibling pi extension  →  Path 2
```

All three converge on the same `WatcherRegistry`. The scheduler sees no difference between
a built-in watcher activated by config and a custom watcher registered programmatically.

---

## Module-Level Singleton (`src/extension/api.ts`)

Pattern: **Module-level singleton** via Node.js module cache.

Because pi extensions run in the same Node.js process, a module-level variable in
`@your-org/pi-extension-sunobomoh` is shared between the sunobomoh factory and any
consumer extension that imports from the same package. No `pi` argument threading needed.

```typescript
/**
 * @example
 * ```ts @import.meta.vitest
 * import { getSunobomoh, _setSunobomohInstance } from '../extension/api.js';
 * expect(getSunobomoh()).toBeUndefined();
 * const fakeApi = {} as SunobomohAPI;
 * _setSunobomohInstance(fakeApi);
 * expect(getSunobomoh()).toBe(fakeApi);
 * ```
 */
let INSTANCE: SunobomohAPI | undefined;

/**
 * Called once by sunobomoh's own factory function, BEFORE any session_start fires.
 * Not part of the public API — prefixed _ to signal package-internal use.
 */
export const _setSunobomohInstance = (api: SunobomohAPI): void => {
  INSTANCE = api;
};

/**
 * Public accessor for consumer extensions.
 * Returns undefined if sunobomoh loaded AFTER the caller's factory (rare, see load order).
 * Always defined by the time any session_start handler runs.
 */
export const getSunobomoh = (): SunobomohAPI | undefined => INSTANCE;
```

---

## `SunobomohAPI` Interface

```typescript
import type { WatcherDefinition } from '../watchers/types.js';
import type { TagDefinition } from '../tags/types.js';
import type { StateQueryAPI } from '../state/query.js';
import type { SchedulerState } from '../scheduler/types.js';
import type { Result } from '../core/result.js';

/**
 * The full public surface of the sunobomoh engine.
 * Obtained via getSunobomoh() — never instantiated directly by consumers.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { getSunobomoh, _setSunobomohInstance } from '../extension/api.js';
 * import { makeFakeSunobomohAPI } from '../extension/test-fixtures.js';
 * _setSunobomohInstance(makeFakeSunobomohAPI());
 * const api = getSunobomoh()!;
 * expect(api.schedulerState.running).toBe(false);
 * ```
 */
export interface SunobomohAPI {
  /**
   * Register a custom watcher definition with its validated config.
   * MUST be called during session_start (or before the first scheduler tick).
   * Calling after the first tick logs a warning and is a no-op.
   * Safe to call on every session_start — re-registration replaces the previous binding.
   */
  registerWatcher<TConfig, TEvent>(
    definition: WatcherDefinition<TConfig, TEvent>,
    config: TConfig,
  ): void;

  /**
   * Register a custom tag. Built-in tags (urgent, needs-review, informational, stale)
   * are pre-registered. Custom tags must be registered before any watcher that uses them.
   * Safe to re-register on every session_start.
   */
  registerTag(definition: TagDefinition): void;

  /** Build a query over the current ReadModel snapshot. */
  query(): StateQueryAPI;

  /** Force an immediate watcher tick, bypassing the interval. Returns when complete. */
  triggerTick(): Promise<Result<void, Error>>;

  /** Force an immediate steering run, bypassing the hourly interval. Returns when complete. */
  triggerSteering(): Promise<Result<void, Error>>;

  /**
   * All currently registered watchers with runtime status.
   * Includes both config-driven ('config') and programmatically registered ('programmatic') watchers.
   */
  getRegisteredWatchers(): readonly RegisteredWatcherInfo[];

  /**
   * All entries in the BuiltinWatcherBundle — both already-registered and available.
   * The /sunobomoh:config Add flow filters out entries whose id is already registered.
   */
  getAvailableBuiltins(): readonly BuiltinWatcherEntry[];

  /**
   * Live-remove a watcher from the registry. Any in-flight tick for this watcher is aborted.
   * Does NOT write to the config file — callers must call ConfigStore.removeWatcher() separately.
   * No-op if the id is not registered.
   */
  unregisterWatcher(id: WatcherId): void;

  /** Current scheduler state — safe to read at any time. */
  readonly schedulerState: SchedulerState;
}
```

---

## Registration Lifecycle

```
pi loads extensions (factories run, async ones are awaited, in install order)
  │
  ├── sunobomoh factory runs:
  │     _setSunobomohInstance(createSunobomohApi(...))   ← INSTANCE set here
  │     pi.on('session_start', initHandler)
  │     pi.on('session_shutdown', shutdownHandler)
  │
  └── consumer factory runs:
        (nothing — does not call getSunobomoh() here, just registers its own session_start)

pi fires session_start (in extension load order)
  │
  ├── sunobomoh initHandler:
  │     load .pi/sunobomoh.config.json
  │     register built-in watchers from config (Path 1)
  │     registration window OPENS
  │
  ├── consumer session_start:
  │     const api = getSunobomoh()!   ← always defined by this point
  │     api.registerWatcher(myDef, myConfig)   ← Path 2
  │     api.registerTag(myTag)
  │
  └── (all session_start handlers complete)
        registration window CLOSES
        scheduler.start()             ← first tick in intervalMinutes (default 10 min)
```

**Key guarantee**: The scheduler starts AFTER all `session_start` handlers complete, so
every watcher registered in any `session_start` is visible on the first tick.

**On `/reload`** (session_start fires again with `reason: "reload"`):
- The `initHandler` clears the WatcherRegistry and TagRegistry (except built-in tags)
- All `registerWatcher` / `registerTag` calls in consumer `session_start` re-execute
- The scheduler is restarted with a fresh tick timer

**On `session_shutdown`**:
- Scheduler stops; any in-flight tick is aborted via AbortController
- WatcherRegistry and TagRegistry are cleared
- `INSTANCE` is NOT set to undefined (it outlives sessions; the next session_start reinitialises its internal state)

---

## Path 1: Config-Driven Activation (Built-in Watchers)

```json
// .pi/sunobomoh.config.json
{
  "watchers": [
    { "id": "github",     "config": { "owner": "...", "repo": "...", "token": "GITHUB_TOKEN" } },
    { "id": "filesystem", "config": { "paths": ["./src"], "extensions": [".ts"] } }
  ]
}
```

Internally, sunobomoh's `initHandler` calls:

```typescript
const bundle = createBuiltinWatcherBundle();  // Map<string, WatcherDefinition>
for (const { id, config } of sunobomohConfig.watchers) {
  const definition = bundle.get(id);
  if (definition === undefined) {
    ctx.ui.notify(`Unknown built-in watcher id: "${id}"`, 'error');
    continue;
  }
  api.registerWatcher(definition, config);
}
```

`createBuiltinWatcherBundle()` lives in `src/extension/builtin-bundle.ts` — a `Map`
of id → `WatcherDefinition` for all Phase 3/4 reference implementations.

---

## Path 2: Programmatic Registration (Custom Watchers)

Write a sibling pi extension and install it alongside sunobomoh:

```typescript
// .pi/extensions/my-watchers.ts   (or a separate pi package)
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getSunobomoh } from '@your-org/pi-extension-sunobomoh';
import { myWatcher } from './watchers/my-watcher.js';

export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async (_event, ctx) => {
    const sunobomoh = getSunobomoh();
    if (sunobomoh === undefined) {
      ctx.ui.notify('sunobomoh not loaded — my-watchers will not run', 'warning');
      return;
    }
    sunobomoh.registerWatcher(myWatcher, {
      token: process.env.MY_API_TOKEN ?? '',
    });
  });
}
```

---

## Path 3: Watcher Package (Phase 4)

A watcher plugin is distributed as a pi package whose extension entry point is Path 2:

```json
// package.json of @org/sunobomoh-github
{
  "name": "@org/sunobomoh-github",
  "keywords": ["pi-package", "sunobomoh-watcher"],
  "pi": { "extensions": ["./src/register.ts"] }
}
```

```typescript
// ./src/register.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getSunobomoh } from '@your-org/pi-extension-sunobomoh';
import { githubWatcher } from './github-watcher.js';

export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async () => {
    getSunobomoh()?.registerWatcher(githubWatcher, loadGithubConfig());
  });
}
```

Install:

```bash
pi install -l @org/sunobomoh-github
```

No mechanism changes — this is simply Path 2 wrapped in a distributable package.

---

## Public Package Exports (`src/index.ts`)

Everything a consumer needs to write a watcher plugin:

```typescript
// Types
export type { WatcherDefinition, BoundWatcher }       from './watchers/types.js';
export type { HydratorDefinition }                    from './hydrators/types.js';
export type { SideEffectDefinition, CallbackPhase,
              SideEffectContext, SideEffectResult }    from './side-effects/types.js';
export type { TagDefinition, TagOutcome }              from './tags/types.js';
export type { StateEntry, TagOutcomeJson }             from './state/types.js';
export type { SunobomohAPI }                          from './extension/api.js';
export type { SchedulerState }                        from './scheduler/types.js';

// Values
export { getSunobomoh }                               from './extension/api.js';
export { UNKNOWN_OUTCOME_SCHEMA }                     from './tags/types.js';

// Brand factories (consumers need these to construct typed ids)
export type { WatcherId, TagId, ResourceUri,
              IsoTimestamp, EntryId }                 from './core/brands.js';
export { unsafeWatcherId, unsafeTagId,
         toResourceUri, toIsoTimestamp }              from './core/brands.js';

// Result helpers (consumers use these in hydrators/side-effects)
export type { Result }                                from './core/result.js';
export { ok, err, isOk, isErr }                       from './core/result.js';
```

Everything else in `src/` is package-internal. Consumers MUST NOT import from deep paths
(e.g., `@your-org/pi-extension-sunobomoh/src/state/store.js`).
