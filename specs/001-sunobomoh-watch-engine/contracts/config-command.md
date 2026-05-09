# Contract: Config Command

**Files**: `src/config/types.ts`, `src/config/store.ts`, `src/config/env-resolve.ts`,
`src/config/schema-form.ts`, `src/extension/builtin-bundle.ts`, `src/extension/commands.ts`

Patterns: **Thin Repository** (ConfigStore), **Pure Function** (resolveEnvRefs),
**Sequential Collector** (collectSchemaValues — pi dialogs, no custom TUI),
**Data-Driven Form** (TypeBox schema → field prompts).

---

## The Problem This Solves

Config-driven watchers (Path 1) are stored in `.pi/sunobomoh.config.json`. There was no
way to edit that file interactively — the user had to hand-edit JSON, know the exact
watcher `id` string, and understand the TypeBox config schema. `/sunobomoh:config`
replaces all of that with guided discovery and collection.

---

## `src/config/types.ts`

```typescript
import type { WatcherId, IsoTimestamp } from '../core/brands.js';
import type { SchedulerConfig } from '../scheduler/types.js';
import type { SteeringConfig } from '../steering/types.js';

/** Shape of .pi/sunobomoh.config.json on disk. Plain strings — no brands. */
export interface SunobomohConfig {
  readonly stateFile?: string;
  readonly scheduler?: Partial<SchedulerConfig>;
  readonly steering?: Partial<SteeringConfig>;
  readonly watchers: readonly WatcherConfigEntry[];
  readonly widget?: WidgetUserConfig;
}

/** All widget-related config under one key. See contracts/ui-widget.md for field semantics. */
export interface WidgetUserConfig {
  readonly maxLines?: number;                                                 // default: 8
  readonly grouping?: 'none' | 'source' | 'tag' | 'date' | 'attention';    // default: 'none'
  readonly tagEmoji?: Readonly<Record<string, string>>;                      // tag overrides
  readonly schemeProfiles?: Readonly<Record<string, { abbr?: string; baseUrl?: string }>>;
}

/**
 * One entry in SunobomohConfig.watchers.
 * Config values may contain "$ENV_VAR" references — resolved at runtime by resolveEnvRefs().
 */
export interface WatcherConfigEntry {
  readonly id: string;
  readonly config: Record<string, unknown>;
}

/**
 * Runtime view of one registered watcher — combines registry data with read-model stats.
 * Returned by SunobomohAPI.getRegisteredWatchers().
 */
export interface RegisteredWatcherInfo {
  readonly id: WatcherId;
  readonly name: string;
  readonly description: string;
  /**
   * 'config'       — activated via .pi/sunobomoh.config.json (can be removed by /sunobomoh:config)
   * 'programmatic' — registered by a sibling pi extension (cannot be removed by /sunobomoh:config)
   */
  readonly source: 'config' | 'programmatic';
  /**
   * If source === 'programmatic', the display name of the registering extension.
   * Used to tell the user how to disable the watcher (pi config, not /sunobomoh:config).
   */
  readonly managedBy?: string;
  readonly lastRunAt?: IsoTimestamp;
  readonly lastRunError?: string;
  readonly entryCount: number;
}

/** Shape exposed by BuiltinWatcherBundle for the Add flow. */
export interface BuiltinWatcherEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly definition: import('../watchers/types.js').WatcherDefinition;
}
```

---

## `src/config/store.ts` — Thin Repository

Pattern: **Thin Repository** — read/write config file only. Does not touch the
WatcherRegistry or the scheduler. Callers apply changes live after calling store methods.

```typescript
import type { Result } from '../core/result.js';
import type { FileSystem } from '../core/ports.js';

export interface ConfigStoreAPI {
  /** Load and parse config file. Returns default config if file does not exist. */
  load(): Promise<Result<SunobomohConfig, Error>>;
  /** Write entire config to disk atomically (write to tmp, rename). */
  save(config: SunobomohConfig): Promise<Result<void, Error>>;
  /**
   * Append a watcher entry, or replace an existing entry with the same id.
   * Loads current config, splices, saves. Returns the updated config.
   */
  addWatcher(entry: WatcherConfigEntry): Promise<Result<SunobomohConfig, Error>>;
  /**
   * Remove a watcher entry by id.
   * No-op (ok) if the id is not in the config.
   */
  removeWatcher(id: string): Promise<Result<SunobomohConfig, Error>>;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * import { createConfigStore } from '../config/store.js';
 * import { createNodeFileSystem } from '../core/ports.js';
 * import { tmpdir } from 'node:os';
 * import { join } from 'node:path';
 * import { isOk } from '../core/result.js';
 * const path = join(tmpdir(), `cfg-test-${Date.now()}.json`);
 * const store = createConfigStore(path, createNodeFileSystem());
 * const loaded = await store.load();
 * expect(isOk(loaded)).toBe(true);
 * if (isOk(loaded)) expect(loaded.value.watchers).toHaveLength(0);
 *
 * const added = await store.addWatcher({ id: 'github', config: { owner: 'x', token: '$GH' } });
 * expect(isOk(added)).toBe(true);
 * if (isOk(added)) expect(added.value.watchers).toHaveLength(1);
 *
 * const removed = await store.removeWatcher('github');
 * expect(isOk(removed)).toBe(true);
 * if (isOk(removed)) expect(removed.value.watchers).toHaveLength(0);
 * ```
 */
export declare const createConfigStore: (
  filePath: string,
  fs: FileSystem,
) => ConfigStoreAPI;
```

**Default config** (returned when file does not exist):
```typescript
const DEFAULT_CONFIG: SunobomohConfig = {
  watchers: [],
};
```

---

## `src/config/env-resolve.ts` — Pure Function

Walks a config value tree, replacing `"$FOO"` string tokens with `process.env['FOO'] ?? ''`.
Pure except for `process.env` read — injected in tests via the `env` parameter.

```typescript
/**
 * Replace "$ENV_VAR" references in a config value tree with their runtime values.
 * Walks objects and arrays recursively. Non-string primitives pass through unchanged.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { resolveEnvRefs } from '../config/env-resolve.js';
 * const env = { GITHUB_TOKEN: 'ghp_abc', OWNER: 'my-org' };
 * expect(resolveEnvRefs('$GITHUB_TOKEN', env)).toBe('ghp_abc');
 * expect(resolveEnvRefs('plain-string', env)).toBe('plain-string');
 * expect(resolveEnvRefs(42, env)).toBe(42);
 * expect(resolveEnvRefs({ token: '$GITHUB_TOKEN', owner: '$OWNER' }, env))
 *   .toEqual({ token: 'ghp_abc', owner: 'my-org' });
 * expect(resolveEnvRefs(['$GITHUB_TOKEN', '$OWNER'], env))
 *   .toEqual(['ghp_abc', 'my-org']);
 * expect(resolveEnvRefs('$MISSING', env)).toBe('');
 * ```
 */
export declare const resolveEnvRefs: (
  config: unknown,
  env?: Record<string, string | undefined>,  // defaults to process.env
) => unknown;
```

---

## `src/config/schema-form.ts` — Data-Driven Form Collector

Iterates the `properties` of a TypeBox `TObject` schema and collects each field's value
using pi's built-in `ctx.ui.input()` and `ctx.ui.select()` dialogs. No custom TUI component.

```typescript
import type { TSchema, TObject } from 'typebox';
import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import type { Result } from '../core/result.js';

/**
 * Detect fields that likely contain secrets (token, key, secret, password, credential).
 * Used to show "$ENV_VAR" hint in the prompt description.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { isSecretField } from '../config/schema-form.js';
 * expect(isSecretField('token')).toBe(true);
 * expect(isSecretField('apiKey')).toBe(true);
 * expect(isSecretField('clientSecret')).toBe(true);
 * expect(isSecretField('owner')).toBe(false);
 * expect(isSecretField('repoName')).toBe(false);
 * ```
 */
export declare const isSecretField: (fieldName: string) => boolean;

/**
 * Collect config values for one TypeBox TObject schema using sequential pi dialogs.
 * For each property in the schema, prompts the user with ctx.ui.input() or ctx.ui.select().
 * Returns null (cancelled) if the user presses Escape on any required field.
 *
 * Field type mapping:
 *   Type.String()  → ctx.ui.input(fieldName, description)       → string
 *   Type.Number()  → ctx.ui.input(...) parsed as float           → number
 *   Type.Boolean() → ctx.ui.select(fieldName, ['true','false'])  → boolean
 *   Type.Array(Type.String()) → ctx.ui.input(...) comma-split    → string[]
 *   Optional field → user may submit empty string to skip        → field omitted
 *   Secret field   → description appended with "(or $ENV_VAR)"
 *
 * @example
 * ```ts @import.meta.vitest
 * import { collectSchemaValues } from '../config/schema-form.js';
 * import { Type } from 'typebox';
 * // collectSchemaValues requires a live ctx — tested via integration test in commands.test.ts
 * // Doctest verifies the module imports cleanly:
 * expect(typeof collectSchemaValues).toBe('function');
 * ```
 */
export declare const collectSchemaValues: (
  schema: TObject,
  ctx: ExtensionCommandContext,
) => Promise<Result<Record<string, unknown>, 'cancelled' | Error>>;
```

**Why sequential `ctx.ui.input()` calls, not a custom TUI component:**
- Stays within the 150-line file limit
- Re-uses pi's own keyboard handling, theming, and IME support
- Each field can be individually cancelled via Escape
- Custom TUI component would be needed only if we want inline multi-field editing — a Phase 3 enhancement

---

## `src/extension/builtin-bundle.ts`

The canonical map from config `id` strings to `WatcherDefinition` objects for all
reference implementations. New built-in watchers are added here and nowhere else.

```typescript
import type { BuiltinWatcherEntry } from '../config/types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { createBuiltinWatcherBundle } from '../extension/builtin-bundle.js';
 * const bundle = createBuiltinWatcherBundle();
 * expect(bundle.size).toBeGreaterThan(0);
 * expect(bundle.has('filesystem')).toBe(true);
 * for (const [id, entry] of bundle) {
 *   expect(entry.id).toBe(id);
 *   expect(typeof entry.name).toBe('string');
 *   expect(typeof entry.definition.watch).toBe('function');
 * }
 * ```
 */
export declare const createBuiltinWatcherBundle: () =>
  ReadonlyMap<string, BuiltinWatcherEntry>;
```

**Bundle contents by phase:**

| Phase | id | Name |
|---|---|---|
| 3 | `filesystem` | Filesystem |
| 3 | `github` | GitHub |
| 4 | `gmail` | Gmail |
| 4 | `slack` | Slack |
| 4 | `browser` | Browser Tabs |

---

## `SunobomohAPI` Additions (update to `contracts/extension-api.md`)

Three new methods added to the existing `SunobomohAPI` interface:

```typescript
/**
 * All currently registered watchers with runtime status.
 * Includes both config-driven and programmatically registered watchers.
 * Safe to call at any time.
 */
getRegisteredWatchers(): readonly RegisteredWatcherInfo[];

/**
 * All entries in the BuiltinWatcherBundle.
 * Used by /sunobomoh:config Add flow to show available options.
 * Entries already registered (by id) are included — the command filters them out.
 */
getAvailableBuiltins(): readonly BuiltinWatcherEntry[];

/**
 * Live-remove a watcher from the registry.
 * Any in-flight tick for this watcher is aborted immediately.
 * Does NOT modify the config file — callers must call ConfigStore.removeWatcher() separately.
 * No-op if the id is not registered.
 */
unregisterWatcher(id: WatcherId): void;
```

---

## `/sunobomoh:config` Command Flow

Implemented in `src/extension/commands.ts` using only pi's built-in dialogs
(`ctx.ui.select`, `ctx.ui.input`, `ctx.ui.confirm`, `ctx.ui.notify`).

### Entry point

```
/sunobomoh:config
  │
  ctx.waitForIdle()
  │
  ▼
ctx.ui.select('Sunobomoh · Watcher Config',
  ['Add watcher', 'Remove watcher', 'Cancel'])
  │
  ├── 'Add watcher'    → ADD FLOW
  ├── 'Remove watcher' → REMOVE FLOW
  └── 'Cancel' / null  → return
```

### Add flow

```
ADD FLOW
  │
  getAvailableBuiltins()
  filter out already-registered ids
  │
  ├── empty → ctx.ui.notify('All built-in watchers are already active', 'info') → return
  │
  ▼
ctx.ui.select('Add Watcher · Select type',
  entries.map(e => `${e.name} — ${e.description}`))
  │ null → return
  │
  selected entry
  │
  ▼
collectSchemaValues(entry.definition.configSchema, ctx)
  │ 'cancelled' → return
  │ err        → ctx.ui.notify(error.message, 'error') → return
  │
  resolved config values (raw, may contain "$ENV_VAR" strings)
  │
  ▼
ConfigStore.addWatcher({ id: entry.id, config: resolvedValues })
  │ err → ctx.ui.notify(error.message, 'error') → return
  │
  ▼
resolveEnvRefs(resolvedValues)  ← runtime resolution for immediate registration
  │
  ▼
api.registerWatcher(entry.definition, runtimeConfig)
  │
  ▼
ctx.ui.notify(`✓ ${entry.name} watcher added`, 'success')
```

### Remove flow

```
REMOVE FLOW
  │
  getRegisteredWatchers()
  filter to source === 'config'
  │
  ├── empty → ctx.ui.notify('No config-managed watchers to remove.\n' +
  │             'Programmatic watchers are managed by their pi extensions.', 'info')
  │           → return
  │
  ▼
ctx.ui.select('Remove Watcher · Select',
  configWatchers.map(w => `${w.name} (${w.id}) · ${w.entryCount} entries`))
  │ null → return
  │
  selected watcher id
  │
  ▼
ctx.ui.confirm('Remove Watcher', `Remove "${selectedName}"? This stops collection only — existing state entries are kept.`)
  │ false → return
  │
  ▼
api.unregisterWatcher(selectedId)          ← live removal from registry
ConfigStore.removeWatcher(selectedId)       ← persist to config file
  │ err → ctx.ui.notify(error.message, 'error') → return
  │
  ▼
ctx.ui.notify(`✓ ${selectedName} watcher removed`, 'success')
```

### Programmatic watcher guard

The Remove flow shows only `source === 'config'` watchers. If the user tries to remove
a programmatic watcher, they see a clear message:

```
ctx.ui.notify(
  `"${id}" is managed by "${managedBy}". ` +
  `Use \`pi config\` to disable the extension that registers it.`,
  'info'
)
```

---

## Live-Apply Guarantee

Both flows apply changes **without requiring `/reload`**:

| Operation | Config file | Registry | Scheduler |
|---|---|---|---|
| Add | `ConfigStore.addWatcher()` | `api.registerWatcher()` | Picks up watcher on next tick |
| Remove | `ConfigStore.removeWatcher()` | `api.unregisterWatcher()` | Aborts in-flight tick for that watcher |

The config file is the source of truth on disk. The registry change takes effect immediately
in the running process. A subsequent `/reload` or pi restart will re-read the config file
and arrive at the same registry state.

---

## Source Layout Additions (update to plan.md)

```
src/
├── config/                  ← NEW domain
│   ├── types.ts             # SunobomohConfig, WatcherConfigEntry, RegisteredWatcherInfo, BuiltinWatcherEntry
│   ├── store.ts             # createConfigStore(filePath, fs): ConfigStoreAPI
│   ├── env-resolve.ts       # resolveEnvRefs() pure function
│   └── schema-form.ts       # collectSchemaValues(), isSecretField()
│
└── extension/
    ├── builtin-bundle.ts    ← NEW — createBuiltinWatcherBundle(): ReadonlyMap<string, BuiltinWatcherEntry>
    └── ...existing files
```

---

## Dependency Rule Addition

```
src/config/   imports from: core/, (no state/, watchers/, etc.)
              — ConfigStore is I/O only; it does not touch domain registries

src/extension/commands.ts   imports from: config/, extension/api.ts, core/
              — the command is the only place that coordinates ConfigStore + SunobomohAPI
```

`src/config/` MUST NOT import from `src/state/`, `src/watchers/`, or `src/extension/`.
Keeping config I/O isolated from domain logic means ConfigStore is independently testable
with just a `FileSystem` mock-free stub.
