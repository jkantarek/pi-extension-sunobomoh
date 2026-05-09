# Tasks: Sunobomoh Watch Engine

**Input**: Design documents from `/specs/001-sunobomoh-watch-engine/`
**Prerequisites**: plan.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

> **No spec.md present** — user stories derived from `plan.md` phased delivery sections.

**TDD Policy**: TDD operates at the **task level**. Each `F###` group is one logical concern.
`T001` writes the test/doctest (🔴 RED — must FAIL). `T002` implements it (🟢 GREEN — must PASS).
`T003` refactors (🔵 BLUE — optional). For type-only files with no logic, a single `T001` suffices.
Never start `T002` until `T001` is confirmed failing. Never open the next `F###` until the current
group is GREEN.

---

## Phase 1 (P001): Setup

**Purpose**: Wire runtime dependencies, rename package, remove placeholder, establish `src/` structure.
All quality gates must pass on a clean slate before any domain code is written.

### P001F001 — Package identity and runtime dependencies

- [x] P001F001T001 Rename package `"name"` to `"pi-extension-sunobomoh"` and add runtime `dependencies` block (`ulid`, `typebox`, `@mariozechner/pi-coding-agent`) to `package.json`
- [x] P001F001T002 Add `"pi": { "extensions": ["./src/extension/index.ts"] }` manifest key to `package.json` and run `pnpm install` to lock new deps

### P001F002 — Remove placeholder source, scaffold `src/` domains

- [x] P001F002T001 Delete `src/index.ts` and `src/index.test.ts` (placeholder scaffold — not part of the extension)
- [x] P001F002T002 Create empty `src/core/`, `src/state/`, `src/watchers/`, `src/hydrators/`, `src/side-effects/`, `src/tags/`, `src/config/`, `src/ui/`, `src/scheduler/`, `src/steering/`, `src/extension/` directories each with a `.gitkeep`

### P001F003 — Verify quality gates on clean slate

- [x] P001F003T001 Run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` — all must pass with zero source files (empty domain dirs are fine)

### Exit Criteria: Phase 1

| Gate       | Command             | Required                                  |
| ---------- | ------------------- | ----------------------------------------- |
| TypeScript | `pnpm typecheck`    | Zero errors                               |
| Lint       | `pnpm lint`         | Zero warnings                             |
| Format     | `pnpm format:check` | All files pass                            |
| Tests      | `pnpm test`         | All pass (no tests yet — zero is passing) |

---

## Phase 2 (P002): Foundation — `src/core/`

**Purpose**: `src/core/` is imported by every other domain. It must be complete and green before
any user story begins. No domain code outside `src/core/` can be written until this phase passes.

**⚠️ CRITICAL**: All user story phases (P003+) depend on this phase.

### P002F001 — `result.ts` — Railway-Oriented `Result<T,E>`

- [x] P002F001T001 Write inline doctests for `ok`, `err`, `isOk`, `isErr` in `src/core/result.ts` (file exists with stubs — doctests must FAIL)
- [x] P002F001T002 Implement `Result<T,E>`, `ok()`, `err()`, `isOk()`, `isErr()` in `src/core/result.ts`

### P002F002 — `brands.ts` — Branded primitive types

- [x] P002F002T001 Write inline doctests for `toIsoTimestamp`, `toResourceUri` (valid and invalid URI), and unsafe cast functions in `src/core/brands.ts` (doctests must FAIL)
- [x] P002F002T002 Implement `EntryId`, `WatcherId`, `TagId`, `IsoTimestamp`, `ResourceUri` branded types and all factory/cast functions in `src/core/brands.ts`

### P002F003 — `ids.ts` — ULID monotonic factory

- [x] P002F003T001 Write inline doctests for `createIdFactory(prng)`: verify 26-char output, monotonic ordering, deterministic sequence from seeded prng in `src/core/ids.ts` (must FAIL)
- [x] P002F003T002 Implement `IdFactory` interface, `createIdFactory(prng?)`, `defaultIdFactory` in `src/core/ids.ts` using `monotonicFactory` from `ulid`

### P002F004 — `registry.ts` — Generic Registry factory

- [x] P002F004T001 [P] Write inline doctest for `createRegistry<T>`: register, get, has, getAll, overwrite in `src/core/registry.ts` (must FAIL)
- [x] P002F004T002 [P] Implement `Registry<T>` interface and `createRegistry<T>(getId)` factory in `src/core/registry.ts`

### P002F005 — `ports.ts` — `FileSystem` and `Clock` hexagonal ports

- [x] P002F005T001 [P] Write inline doctest for `createNodeFileSystem` (appendFile + exists + readFile roundtrip against `tmpdir`) and `createSystemClock` in `src/core/ports.ts` (must FAIL)
- [x] P002F005T002 [P] Implement `FileSystem` interface, `Clock` interface, `createNodeFileSystem()`, `createSystemClock()` in `src/core/ports.ts` using `node:fs/promises`

### Exit Criteria: Phase 2

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: `src/core/` is complete. All domain work can now begin.

---

## Phase 3 (P003): User Story 1 — Event State Store (Priority: P1) 🎯 MVP

**Goal**: Append watcher events to `.pi/sunobomoh-state.jsonl` and query them. No watchers
run yet — just the persistence layer. Independently usable as a standalone JSONL store.

**Independent Test**: Create a `StateStore`, append a `StateEntryJson`, reload, and assert the
entry appears in `model.byId` with correct fields. Query with `StateQuery` and assert filtering.

> **TDD Rule**: Each F### group is ONE concern. T001 writes failing doctest/test. T002 implements.

### P003F001 — Wire type guards for all JSONL line types

- [x] P003F001T001 Write inline doctests for `isStateEntryJson`, `isStatePatchJson`, `isSteeringRunJson`, `isSchedulerRunJson` and define `StateLineJson` union in `src/state/types.ts` (doctests must FAIL)
- [x] P003F001T002 Implement all wire interfaces (`StateEntryJson`, `StatePatchJson`, `SteeringRunJson`, `SchedulerRunJson`) and their type-guard functions in `src/state/types.ts`

### P003F002 — In-memory domain types

- [x] P003F002T001 Write inline doctest for `parseStateEntry(json: StateEntryJson): StateEntry` in `src/state/types.ts` — assert branded types, `ReadonlyMap` outcomes (must FAIL)
- [x] P003F002T002 Implement in-memory types (`StateEntry`, `TagOutcome`, `StateEntryMetadata`) and `parseStateEntry()` conversion function in `src/state/types.ts`

### P003F003 — `emptyModel()` and `ReadModel` shape

- [x] P003F003T001 [P] Write inline doctest for `emptyModel()` — assert all maps empty, entryCount zero, lastSteeringRun undefined in `src/state/read-model.ts` (must FAIL)
- [x] P003F003T002 [P] Implement `ReadModel` interface and `emptyModel()` factory in `src/state/read-model.ts`

### P003F004 — `projectLine()` for `state_entry` and `state_patch`

- [x] P003F004T001 Write black-box test for `projectLine` with `state_entry` (entry appears in `byId`, `byTag`, `bySourceId`; `needsAttention` set correctly) and with `state_patch` (patch mutates `needsAttention` on resolved entry) in `src/state/read-model.test.ts` (must FAIL)
- [x] P003F004T002 Implement `projectLine()` for `state_entry` and `state_patch` cases in `src/state/read-model.ts`

### P003F005 — `projectLine()` for `steering_run` and `scheduler_run`

- [x] P003F005T001 [P] Write inline doctests for `projectLine` with `steering_run` (sets `lastSteeringRun`) and `scheduler_run` (no model change) in `src/state/read-model.ts` (must FAIL)
- [x] P003F005T002 [P] Implement `projectLine()` for `steering_run` and `scheduler_run` cases in `src/state/read-model.ts`

### P003F006 — `StateStore.load()` — reads JSONL and builds projection

- [x] P003F006T001 Write black-box test for `createStateStore`: `load()` on a pre-written JSONL file produces correct `ReadModel` (test against real tmpdir file) in `src/state/store.test.ts` (must FAIL)
- [x] P003F006T002 Implement `createStateStore(filePath, fs, clock)`: `load()` reads all lines, reduces via `projectLine`, exposes `model` in `src/state/store.ts`

### P003F007 — `StateStore.append()` — atomic JSONL write

- [x] P003F007T001 Write black-box test for `append()`: written lines are readable after a fresh `load()` call; returns `ok(undefined)` on success, `err(Error)` on write failure (injected failing fs) in `src/state/store.test.ts` (must FAIL)
- [x] P003F007T002 Implement `append(lines)` in `src/state/store.ts` using `fs.appendFile` with newline-delimited JSON serialisation

### P003F008 — `StateQuery` fluent builder

- [x] P003F008T001 Write inline doctests for `createStateQuery(model)`: `byTag`, `byWatcher`, `needsAttention`, `since`, `until`, `count`, `execute` — all returning new instances (immutability) in `src/state/query.ts` (must FAIL)
- [x] P003F008T002 Implement `StateQuery` with immutable predicate accumulation and `execute()` as a single `filter` pass in `src/state/query.ts`
- [x] P003F008T003 Refactor `src/state/query.ts` if file approaches 150 non-comment lines — split predicate builders into private helpers

### Exit Criteria: Phase 3 (US1)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**ESLint contract constraints**: All source files ≤ 150 non-comment lines · JSDoc = `@example` only · no `@ts-ignore`

**Checkpoint**: State layer is fully functional. Entries can be appended and queried without any watcher running.

---

## Phase 4 (P004): User Story 2 — Watcher Pipeline (Priority: P1)

**Goal**: Define, register, and execute a single watcher through the full pipeline — collect events,
coerce to `StateEntry`, apply tags, run hydrators, execute side-effect callbacks, and persist to the
store. Independently testable by injecting a fake `WatcherDefinition` with no network calls.

**Independent Test**: Construct a `WatcherDefinition` that returns a fixed event array. Call
`runWatcher()` and assert that `StateEntry` objects appear in the store with correct `label`,
`tags`, `sourceUri`, and `hydratedData`.

### P004F001 — Tag domain types: `TagDefinition`, `UNKNOWN_OUTCOME_SCHEMA`, `BUILTIN_TAGS`

- [ ] P004F001T001 [P] Write inline doctest asserting `BUILTIN_TAGS` contains `urgent`, `needs-review`, `informational`, `stale` with correct `attentionWeight` values and that `UNKNOWN_OUTCOME_SCHEMA` validates any value in `src/tags/types.ts` (must FAIL)
- [ ] P004F001T002 [P] Implement `TagDefinition`, `TagOutcome`, `UNKNOWN_OUTCOME_SCHEMA`, `BUILTIN_TAGS` constant in `src/tags/types.ts`

### P004F002 — `createTagRegistry()`

- [ ] P004F002T001 [P] Write inline doctest for `createTagRegistry()`: pre-registers all `BUILTIN_TAGS`, custom tags can be added, `has` and `get` work correctly in `src/tags/registry.ts` (must FAIL)
- [ ] P004F002T002 [P] Implement `createTagRegistry()` as a thin wrapper over `createRegistry<TagDefinition>()` that pre-populates built-in tags in `src/tags/registry.ts`

### P004F003 — `createTagOutcome()` and `initializeOutcomes()`

- [ ] P004F003T001 [P] Write inline doctests for `createTagOutcome(def)` and `initializeOutcomes(tagIds, registry)` — assert outcome map size, default status, fallback to `BUILTIN_TAGS[0]` for unknown ids in `src/tags/outcomes.ts` (must FAIL)
- [ ] P004F003T002 [P] Implement `createTagOutcome()` and `initializeOutcomes()` as pure functions in `src/tags/outcomes.ts`

### P004F004 — `applyTagsToEntry()`

- [ ] P004F004T001 [P] Write inline doctest for `applyTagsToEntry(entry, tagIds, registry)` — assert `outcomes` map populated, unknown tagIds handled gracefully in `src/tags/apply.ts` (must FAIL)
- [ ] P004F004T002 [P] Implement `applyTagsToEntry()` pure function in `src/tags/apply.ts`

### P004F005 — `WatcherDefinition` and `BoundWatcher` types + `createWatcherRegistry()`

- [ ] P004F005T001 [P] Write inline doctest for `createWatcherRegistry()`: register a watcher, `get` by `WatcherId`, `has`, `getAll` in `src/watchers/registry.ts` (must FAIL)
- [ ] P004F005T002 [P] Define `WatcherDefinition<TConfig, TEvent>` and `BoundWatcher<TConfig>` interfaces in `src/watchers/types.ts` and implement `createWatcherRegistry()` wrapping `createRegistry` in `src/watchers/registry.ts`

### P004F006 — `toStateEntry()` pure coercion

- [ ] P004F006T001 Write inline doctest for `toStateEntry(event, def, config, clock, ids)`: assert `label`, `sourceUri`, `tags`, `id` length (26), `needsAttention: false`, `timestamp` is ISO string in `src/watchers/coerce.ts` (must FAIL)
- [ ] P004F006T002 Implement `toStateEntry()` in `src/watchers/coerce.ts` using `ids.next()`, `clock.now()`, `def.extractUri/Label/Tags`

### P004F007 — `HydratorDefinition` types + `assertHydrationInvariants()`

- [ ] P004F007T001 [P] Write inline doctests for `assertHydrationInvariants(id, before, after)`: pass on unchanged entries, throw `HydrationInvariantError` on wrong length, throw on changed `id` in `src/hydrators/invariants.ts` (must FAIL)
- [ ] P004F007T002 [P] Define `HydratorDefinition` interface in `src/hydrators/types.ts` and implement `assertHydrationInvariants()` + `HydrationInvariantError` in `src/hydrators/invariants.ts`

### P004F008 — `runHydrationPipeline()`

- [ ] P004F008T001 Write black-box tests for `runHydrationPipeline()`: empty hydrators returns `ok(entries)`, single hydrator enriches `hydratedData`, failing hydrator returns `err(HydrationError)` with `entriesAtFailure`, abort signal respected in `src/hydrators/pipeline.test.ts` (must FAIL)
- [ ] P004F008T002 Implement `runHydrationPipeline(hydrators, entries, signal)` as a serial `for...of` loop calling `assertHydrationInvariants` after each step in `src/hydrators/pipeline.ts`

### P004F009 — `phaseHandlers()` and `runPhase()`

- [ ] P004F009T001 Write inline doctests for `phaseHandlers(phase, defs)` (filters correctly) and `runPhase(phase, defs, ctx)` (runs in order, halts on `{ halt: true }`, continues on error) in `src/side-effects/executor.ts` (must FAIL)
- [ ] P004F009T002 Implement `phaseHandlers()` and `runPhase()` pure functions in `src/side-effects/executor.ts`; define `CallbackPhase`, `SideEffectContext`, `SideEffectResult`, `SideEffectDefinition` in `src/side-effects/types.ts`

### P004F010 — `runWatcher()` pure orchestration function

- [ ] P004F010T001 Write black-box tests for `runWatcher(watcher, sideEffects, clock, ids, signal)` in `src/watchers/runner.test.ts`: happy path returns `ok(StateEntry[])` with correct fields; `before_watch` halt returns empty ok; `watch()` rejection returns `err(WatcherRunError)`; abort signal propagated (must FAIL)
- [ ] P004F010T002 Implement `runWatcher()` in `src/watchers/runner.ts`: call `runPhase('before_watch')`, call `watcher.watch()` in `withTimeout()`, map events via `toStateEntry()`, run `runHydrationPipeline()`, `applyTagsToEntry()`, `runPhase('after_watch'/'after_hydrate')`

### P004F011 — Full pipeline integration test

- [ ] P004F011T001 Write integration test in `src/watchers/pipeline.integration.test.ts`: fake watcher returns 2 events → `runWatcher()` → `store.append()` → reload store → assert both entries in `model.byId` with correct `label`, `tags`, `hydratedData` (must FAIL)
- [ ] P004F011T002 Fix any wiring issues uncovered by the integration test in the relevant source files under `src/watchers/`, `src/hydrators/`, `src/side-effects/`, or `src/state/` — no new files

### Exit Criteria: Phase 4 (US2)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: A watcher can be defined, executed by hand, and its events persisted and queried. No scheduler needed yet.

---

## Phase 5 (P005): User Story 3 — Scheduler + Steering (Priority: P2)

**Goal**: The engine polls watchers autonomously every N minutes and runs an hourly steering step
that scores entries and toggles `needsAttention`. Independently testable by injecting fake clock
and watcher/steering functions.

**Independent Test**: Construct a `Scheduler` with a fake clock and a fake watcher function.
Call `triggerTick()` and assert `runWatchers` was called once. Call `triggerSteering()` and assert
`attentionScore` updated on relevant entries.

### P005F001 — Scheduler config and state types

- [ ] P005F001T001 [P] Write inline doctest asserting `DEFAULT_SCHEDULER_CONFIG.intervalMinutes === 10` and `steeringIntervalMinutes % intervalMinutes === 0` in `src/scheduler/scheduler.ts` (must FAIL)
- [ ] P005F001T002 [P] Define `SchedulerConfig`, `SchedulerState`, `SchedulerAPI` interfaces in `src/scheduler/types.ts` and `DEFAULT_SCHEDULER_CONFIG` constant in `src/scheduler/scheduler.ts`

### P005F002 — `shouldRunSteering()` pure predicate

- [ ] P005F002T001 Write inline doctests for all four boundary cases of `shouldRunSteering(lastSteeringAt, now, config)`: first run (undefined), just ran, exactly due, not yet due in `src/scheduler/should-steer.ts` (must FAIL)
- [ ] P005F002T002 Implement `shouldRunSteering()` pure predicate in `src/scheduler/should-steer.ts`

### P005F003 — `createScheduler()` factory

- [ ] P005F003T001 Write black-box tests for `createScheduler(config, runWatchers, runSteering, clock)` in `src/scheduler/scheduler.test.ts`: `state.running` starts false; `triggerTick()` calls `runWatchers` once; `triggerSteering()` calls `runSteering` once; `stop()` prevents further ticks (must FAIL)
- [ ] P005F003T002 Implement `createScheduler()` with self-scheduling `setTimeout` pattern (not `setInterval`) in `src/scheduler/scheduler.ts`; inject `clock` and strategies

### P005F004 — Steering config and score types

- [ ] P005F004T001 [P] Write inline doctest asserting `DEFAULT_STEERING_CONFIG.promoteThreshold > DEFAULT_STEERING_CONFIG.demoteThreshold` in `src/steering/steerer.ts` (must FAIL)
- [ ] P005F004T002 [P] Define `SteeringConfig`, `AttentionScore`, `LlmOverride`, `SteeringResult`, `LlmSteeringStrategy` types in `src/steering/types.ts` and `DEFAULT_STEERING_CONFIG` constant in `src/steering/steerer.ts`

### P005F005 — `scoreEntry()` pure scoring function

- [ ] P005F005T001 Write inline doctests for `scoreEntry(entry, tagRegistry, config, now)`: urgent tag produces high score, stale tag produces near-zero, score decays with age, clamps to [0, 100] in `src/steering/score-entry.ts` (must FAIL)
- [ ] P005F005T002 Implement `scoreEntry()` using formula `Σ(tag.attentionWeight × 10) × 0.5^(ageHours / halfLife)` clamped to [0, 100] in `src/steering/score-entry.ts`

### P005F006 — `isPromotable`, `isDemotable`, `isBorderline` specifications

- [ ] P005F006T001 [P] Write inline doctests for all three predicates (high score promotes, low score demotes, mid score is borderline, non-overlapping cases) in `src/steering/classify.ts` (must FAIL)
- [ ] P005F006T002 [P] Implement `isPromotable`, `isDemotable`, `isBorderline` as one-liner exported functions in `src/steering/classify.ts`

### P005F007 — `createSteerer()` factory

- [ ] P005F007T001 Write black-box test for `createSteerer(config, tagRegistry, store)` in `src/steering/steerer.test.ts`: empty store runs without error; high-scoring entry gets promoted (`needsAttention = true` patch appended); low-scoring entry gets demoted; `SteeringRun` line appended; `LlmSteeringStrategy` called for borderline entries (must FAIL)
- [ ] P005F007T002 Implement `createSteerer()` orchestrating `scoreEntry()`, `isPromotable/isDemotable/isBorderline()`, `store.append(patches + steeringRun)` in `src/steering/steerer.ts`

### P005F008 — Scheduler + steerer integration

- [ ] P005F008T001 Write integration test in `src/scheduler/scheduler-steering.integration.test.ts`: `createScheduler` with `shouldRunSteering` returning true → `triggerTick()` calls both watcher runner AND steerer → store has both `scheduler_run` and `steering_run` entries (must FAIL)
- [ ] P005F008T002 Wire `shouldRunSteering` check into `createScheduler` tick execution in `src/scheduler/scheduler.ts` to call `runSteering` when due

### Exit Criteria: Phase 5 (US3)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: Engine runs autonomously. Entries accumulate, scoring fires, `needsAttention` toggles.

---

## Phase 6 (P006): User Story 4 — Config + Extension API (Priority: P2)

**Goal**: Users add/remove watchers via `/sunobomoh:config`. The extension registers itself with pi,
exposes `getSunobomoh()`, and wires all domain objects at startup. Config is persisted to JSON.

**Independent Test**: Call `createConfigStore`, `addWatcher`, reload — assert the entry is present.
Call `getSunobomoh()` before and after `_setSunobomohInstance` — assert undefined then defined.

### P006F001 — Config domain types

- [ ] P006F001T001 [P] Write inline doctest for `isWidgetUserConfig` type-guard (valid and missing-field cases) in `src/config/types.ts` (must FAIL)
- [ ] P006F001T002 [P] Define `SunobomohConfig`, `WidgetUserConfig`, `WatcherConfigEntry`, `RegisteredWatcherInfo`, `BuiltinWatcherEntry`, `GroupingStrategyName` types and `isWidgetUserConfig` guard in `src/config/types.ts`

### P006F002 — `resolveEnvRefs()` pure function

- [ ] P006F002T001 [P] Write inline doctests for `resolveEnvRefs(config, env)`: string passthrough, `$VAR` resolution, missing var returns `''`, nested object and array traversal in `src/config/env-resolve.ts` (must FAIL)
- [ ] P006F002T002 [P] Implement `resolveEnvRefs(config, env?)` recursive pure function in `src/config/env-resolve.ts`

### P006F003 — `createConfigStore()` — load, save, addWatcher, removeWatcher

- [ ] P006F003T001 Write black-box tests for `createConfigStore(path, fs)` in `src/config/store.test.ts`: `load()` on non-existent file returns default config; `addWatcher` persists and returns updated config; duplicate `addWatcher` replaces; `removeWatcher` deletes; `removeWatcher` on unknown id is a no-op `ok` (must FAIL)
- [ ] P006F003T002 Implement `createConfigStore()` in `src/config/store.ts` using injected `FileSystem`; atomic write via tmp-file-then-rename pattern

### P006F004 — `isSecretField()` heuristic

- [ ] P006F004T001 [P] Write inline doctest for `isSecretField`: `token`, `apiKey`, `clientSecret`, `password`, `credential` → true; `owner`, `repoName`, `baseUrl` → false in `src/config/schema-form.ts` (must FAIL)
- [ ] P006F004T002 [P] Implement `isSecretField(fieldName): boolean` and stub `collectSchemaValues` declaration in `src/config/schema-form.ts`

### P006F005 — `SunobomohAPI` singleton: `getSunobomoh` + `_setSunobomohInstance`

- [ ] P006F005T001 [P] Write inline doctest for `getSunobomoh()` → undefined initially; after `_setSunobomohInstance(fake)` → returns fake in `src/extension/api.ts` (must FAIL)
- [ ] P006F005T002 [P] Implement module-level singleton, `getSunobomoh()`, `_setSunobomohInstance()`, and `SunobomohAPI` interface (with all methods including the three added in review: `getRegisteredWatchers`, `getAvailableBuiltins`, `unregisterWatcher`) in `src/extension/api.ts`

### P006F006 — `createBuiltinWatcherBundle()`

- [ ] P006F006T001 [P] Write inline doctest for `createBuiltinWatcherBundle()`: bundle is non-empty, `has('filesystem')`, each entry has `id === key` and `definition.watch` is a function in `src/extension/builtin-bundle.ts` (must FAIL)
- [ ] P006F006T002 [P] Implement `createBuiltinWatcherBundle()` returning a `ReadonlyMap<string, BuiltinWatcherEntry>` with a placeholder `filesystem` entry (real implementation deferred to P008) in `src/extension/builtin-bundle.ts`

### P006F007 — pi LLM tools: `buildWatchQueryTool`, `buildMarkAttentionTool`, `buildTriggerSteerTool`

- [ ] P006F007T001 Write black-box tests for all three tool builder functions in `src/extension/tools.test.ts`: each returns a valid tool definition with correct `name`, `parameters` schema, and `execute` function that returns `content` (must FAIL)
- [ ] P006F007T002 Implement `buildWatchQueryTool(store)`, `buildMarkAttentionTool(store)`, `buildTriggerSteerTool(steerer)` in `src/extension/tools.ts`

### P006F008 — pi commands: config, watch, state, steer

- [ ] P006F008T001 Write black-box tests for `buildConfigCommand`, `buildWatchCommand`, `buildStateCommand`, `buildSteerCommand` in `src/extension/commands.test.ts`: each returns a `CommandDefinition` with correct `name` and `handler` function (must FAIL)
- [ ] P006F008T002 Implement all four command builder functions in `src/extension/commands.ts` using pi's `ctx.ui.select`, `ctx.ui.input`, `ctx.ui.confirm`, `ctx.ui.notify` (no custom TUI needed)

### P006F009 — `extension/index.ts` DI wiring and pi factory

- [ ] P006F009T001 Write integration test in `src/extension/index.integration.test.ts` verifying that after loading the factory, `getSunobomoh()` is defined and `schedulerState.running` is false (must FAIL)
- [ ] P006F009T002 Implement the pi extension default export factory in `src/extension/index.ts`: instantiate all domain objects, call `_setSunobomohInstance`, register `session_start`/`session_shutdown` handlers, register commands, tools, and implement `LlmSteeringStrategy` via `pi.sendUserMessage`

### Exit Criteria: Phase 6 (US4)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: Extension loads into pi, watcher config is persisted, `/sunobomoh:config` runs interactively.

---

## Phase 7 (P007): User Story 5 — TUI Widget (Priority: P3)

**Goal**: The pi widget above the editor shows attention entries in information-dense lines with
emoji tags, OSC 8 hyperlinks, age-based brightness, and configurable grouping. Independently
testable as pure rendering functions with no pi runtime.

**Independent Test**: Call `renderAttentionWidget(model, config, theme, nowMs)` with a populated
model and assert returned lines contain emoji, label text, source abbreviation, and relative age.

### P007F001 — Widget and grouping types

- [ ] P007F001T001 [P] Define `WidgetConfig`, `SchemeProfile`, `AgeColorName`, `RenderedEntryLine`, `GroupingStrategy`, `Group` interfaces and `DEFAULT_GROUPING` constant in `src/ui/types.ts` (no logic — types only)

### P007F002 — `osc8Link()`

- [ ] P007F002T001 [P] Write inline doctest for `osc8Link(text, url)`: contains OSC sequence and text; `osc8Link(text, undefined)` returns plain text in `src/ui/hyperlink.ts` (must FAIL)
- [ ] P007F002T002 [P] Implement `osc8Link(text: string, url: string | undefined): string` in `src/ui/hyperlink.ts`

### P007F003 — Tag emoji registry

- [ ] P007F003T001 [P] Write inline doctests for `createTagEmojiMap(overrides)`: built-in preserved, override replaces, custom tag added; `emojiForTag` returns `FALLBACK_EMOJI` for unknown tag in `src/ui/tag-emoji.ts` (must FAIL)
- [ ] P007F003T002 [P] Implement `DEFAULT_TAG_EMOJI`, `FALLBACK_EMOJI`, `createTagEmojiMap()`, `emojiForTag()` in `src/ui/tag-emoji.ts`

### P007F004 — Scheme profiles and URI resolution

- [ ] P007F004T001 [P] Write inline doctests for `DEFAULT_SCHEME_PROFILES`: github resolves to `https://github.com/...`, `shortId` extracts `#42`; file URI passes through; `resolveScheme` returns profile for known scheme, undefined for unknown; `sourceLabel` formats `gh:#42` in `src/ui/scheme-profile.ts` (must FAIL)
- [ ] P007F004T002 [P] Implement `DEFAULT_SCHEME_PROFILES` map, `resolveScheme()`, `sourceLabel()` in `src/ui/scheme-profile.ts`

### P007F005 — Temporal utilities

- [ ] P007F005T001 [P] Write inline doctests for `relativeTime(ms)` (all thresholds: s, m, h, d) and `ageColorName(ms, needsAttention)` (all three color levels + needsAttention override) in `src/ui/temporal.ts` (must FAIL)
- [ ] P007F005T002 [P] Implement `relativeTime()` and `ageColorName()` in `src/ui/temporal.ts`

### P007F006 — `groupEntries()` Strategy

- [ ] P007F006T001 Write inline doctests for `groupEntries()` for all five strategies: `none` produces one group with no header; `attention` produces two groups attention-first; `tag` produces per-tag groups sorted by max score desc; `source` produces per-sourceId groups alphabetically; empty entries returns `[]` in `src/ui/grouping.ts` (must FAIL)
- [ ] P007F006T002 Implement `groupEntries(entries, strategy, emojiMap, nowMs)` pure function with all five strategy branches in `src/ui/grouping.ts`
- [ ] P007F006T003 Refactor `src/ui/grouping.ts` if file exceeds 100 non-comment lines — extract per-strategy logic as private unexported helper functions within the same file

### P007F007 — `renderEntryLine()`

- [ ] P007F007T001 Write black-box tests for `renderEntryLine(entry, config, theme, nowMs, profiles)` in `src/ui/entry-line.test.ts`: `plain` field contains label text, source abbreviation, relative age; `raw` field contains OSC 8 sequence for known scheme; `entryId` matches entry (must FAIL)
- [ ] P007F007T002 Implement `renderEntryLine()` assembling emoji + OSC 8-linked label + source column + age column with `ageColorName` applied to the entire line in `src/ui/entry-line.ts`

### P007F008 — `renderAttentionWidget()` and `renderFooterStatus()`

- [ ] P007F008T001 Write black-box tests in `src/ui/widget.test.ts`: `renderAttentionWidget(emptyModel, ...)` returns `[]`; populated model returns lines with correct count up to `maxLines`; overflow produces truncation line; `renderFooterStatus` contains `'sunobomoh'` and `'stopped'` when not running (must FAIL)
- [ ] P007F008T002 Implement `renderAttentionWidget()` (calls `groupEntries`, renders headers + entry lines, truncation) and `renderFooterStatus()` in `src/ui/widget.ts`
- [ ] P007F008T003 Wire `renderAttentionWidget` and `renderFooterStatus` into `src/extension/index.ts` `session_start` handler using `ctx.ui.setWidget('sunobomoh', lines)` and `ctx.ui.setStatus('sunobomoh', statusLine)`

### Exit Criteria: Phase 7 (US5)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: Widget renders correctly from pure functions. pi integration wires it to the live model.

---

## Phase 8 (P008): User Story 6 — Reference Watchers (Priority: P3)

**Goal**: Two concrete watcher implementations — filesystem and GitHub — work end-to-end through
the full pipeline. These validate the entire system with real I/O. Both can be activated via config.

**Independent Test**: Activate `FilesystemWatcher` pointing to a tmp dir, write a `.ts` file,
call `runWatcher()`, and assert a `StateEntry` appears with `sourceUri` starting `file:///`.

### P008F001 — `FilesystemWatcher`

- [ ] P008F001T001 Write black-box tests for `filesystemWatcher` in `src/watchers/filesystem/filesystem-watcher.test.ts`: `watch()` against a tmp dir with one `.ts` file returns one event; `extractLabel` returns filename; `extractUri` returns valid `file://` URI; `extractTags` includes `informational` (must FAIL)
- [ ] P008F001T002 Implement `FilesystemConfig`, `FilesystemEvent`, and `filesystemWatcher: WatcherDefinition` in `src/watchers/filesystem/filesystem-watcher.ts` using `node:fs/promises` glob/readdir
- [ ] P008F001T003 Register `filesystemWatcher` in `createBuiltinWatcherBundle()` in `src/extension/builtin-bundle.ts` (replaces placeholder)

### P008F002 — `GitHubWatcher`

- [ ] P008F002T001 Write black-box tests for `githubWatcher` in `src/watchers/github/github-watcher.test.ts`: inject a fake `fetch` that returns a fixture issues array; assert `extractLabel` returns `"#N: title"` format; `extractUri` returns `github:///` URI; `extractTags` maps `high`/`critical` priority to `urgent` (must FAIL)
- [ ] P008F002T002 Implement `GitHubConfig`, `GitHubIssue`, and `githubWatcher: WatcherDefinition` in `src/watchers/github/github-watcher.ts` using the injected `fetch` abstraction (add `fetch` to `GitHubConfig` or default to global `fetch`)
- [ ] P008F002T003 [P] Implement `mapLabelsToTags(labels: string[]): readonly TagId[]` pure function in `src/watchers/github/label-map.ts` with doctest; register `githubWatcher` in `createBuiltinWatcherBundle()`

### P008F003 — End-to-end pipeline integration with real watchers

- [ ] P008F003T001 Write integration test in `src/watchers/e2e.integration.test.ts`: create real `StateStore` against tmpdir + real `FilesystemWatcher` pointing to another tmpdir with one file → `runWatcher()` → reload store → assert one `state_entry` with `sourceUri` matching `file:///` and correct `label` (must FAIL)
- [ ] P008F003T002 Fix any integration issues discovered in `src/watchers/e2e.integration.test.ts` — patch existing source files under `src/watchers/filesystem/` or `src/state/` as needed, no new files

### Exit Criteria: Phase 8 (US6)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |

**Checkpoint**: Two real watchers work end-to-end. Activating via `sunobomoh.config.json` produces live state entries.

---

## Phase 9 (P009): Polish & Cross-Cutting Concerns

**Purpose**: Public package surface, README, final integration verification, `script/ci` green.

### P009F001 — Public package exports (`src/index.ts`)

- [ ] P009F001T001 [P] Write a test in `src/index.test.ts` importing `getSunobomoh`, `UNKNOWN_OUTCOME_SCHEMA`, `unsafeWatcherId`, `ok`, `err` from `src/index.ts` and asserting each is defined (must FAIL)
- [ ] P009F001T002 [P] Implement `src/index.ts` re-exporting all public types, values, and brand helpers per `contracts/extension-api.md` "Public Package Exports" section

### P009F002 — Package name and `pi` manifest verification

- [ ] P009F002T001 [P] Verify `package.json` has `"name": "pi-extension-sunobomoh"`, `"pi": { "extensions": ["./src/extension/index.ts"] }`, `"dependencies"` includes `ulid`, `typebox`, and `@mariozechner/pi-coding-agent`; confirm `pnpm build` produces no errors

### P009F003 — Final `script/ci` full pass

- [ ] P009F003T001 Run `script/ci` (mirrors CI pipeline: typecheck + lint + format + test + coverage + build) — must exit 0

### P009F004 — `README.md` update

- [ ] P009F004T001 [P] Update `README.md` to reference `quickstart.md`, list the three registration paths, document the `widget.grouping` config option with all five strategy names, and show the JSONL state file format

### Exit Criteria: Phase 9 (Polish)

| Gate             | Command              | Required         |
| ---------------- | -------------------- | ---------------- |
| TypeScript       | `pnpm typecheck`     | Zero errors      |
| Lint             | `pnpm lint`          | Zero warnings    |
| Format           | `pnpm format:check`  | All files pass   |
| Tests + Doctests | `pnpm test`          | All pass         |
| Coverage         | `pnpm test:coverage` | ≥98% all metrics |
| Build            | `pnpm build`         | Zero errors      |
| CI script        | `script/ci`          | Exits 0          |

---

## Global Quality Gates

| Gate                      | Command              | Threshold                          |
| ------------------------- | -------------------- | ---------------------------------- |
| TypeScript strict         | `pnpm typecheck`     | Zero errors                        |
| ESLint                    | `pnpm lint`          | Zero warnings (`--max-warnings 0`) |
| Prettier                  | `pnpm format:check`  | All files formatted                |
| Vitest (tests + doctests) | `pnpm test`          | All pass                           |
| Coverage                  | `pnpm test:coverage` | ≥98% lines/fns/branches/stmts      |
| Build (final phase)       | `pnpm build`         | Zero errors                        |

**ESLint contract** (violations are errors — block every gate):

- All source files ≤ 150 non-comment lines
- JSDoc = `@example` blocks with ` ```ts @import.meta.vitest ` fences only
- No `@ts-ignore` / `@ts-expect-error` without adjacent `@example` doctest
- No unused locals or parameters

---

## Dependencies & Execution Order

### Phase Dependencies

```
P001 (Setup)
  └─► P002 (Foundation — src/core/)
        └─► P003, P004, P005, P006, P007, P008 (can proceed after P002)
              P003 (State)  ──────────────────────────────────────────┐
              P004 (Pipeline) — depends on P003 (needs store.append)  │
              P005 (Scheduler+Steering) — depends on P003, P004       │
              P006 (Config+API) — depends on P003, P004, P005         │
              P007 (TUI Widget) — depends on P003 only                │
              P008 (Reference Watchers) — depends on P004             │
              └─► P009 (Polish) ◄────────────────────────────────────┘
```

### Recommended Sequential Order (single developer)

```
P001 → P002 → P003 → P004 → P005 → P006 → P007 → P008 → P009
```

### Parallel Opportunities (two developers)

```
After P004 completes:
  Dev A: P005 (Scheduler + Steering)
  Dev B: P007 (TUI Widget)   ← no dependency on P005
After both complete: P006 → P008 → P009
```

### Within Each User Story (task-level TDD)

1. Open `F001` — write `T001` (doctest or test), run `pnpm test` → must **FAIL**
2. Write `T002` (implementation), run `pnpm test` → must **PASS**
3. Optional `T003` (refactor), run `pnpm test` → must still **PASS**
4. Open `F002` — repeat RED → GREEN → BLUE
5. After all F groups GREEN → run Exit Criteria → commit

---

## Composability Pass Results

Traced all cross-phase artifact dependencies before writing this file:

| Check                                                                                     | Result                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| `src/core/ids.ts` (`IdFactory`) consumed by `toStateEntry()` in P004                      | ✅ P002F003 completes before P004F006       |
| `parseStateEntry()` in P003 consumed by `projectLine()` in P003                           | ✅ F002 before F004, same phase             |
| `runPhase()` in P004 consumed by `runWatcher()` in P004                                   | ✅ F009 before F010, same phase             |
| `store.append()` in P003 consumed by integration test in P004F011                         | ✅ P003 completes before P004               |
| `shouldRunSteering()` in P005 consumed by `createScheduler()` in P005                     | ✅ F002 before F003, same phase             |
| `createSteerer()` in P005 consumed by `buildTriggerSteerTool()` in P006                   | ✅ P005 completes before P006               |
| `groupEntries()` in P007 consumed by `renderAttentionWidget()` in P007                    | ✅ F006 before F008, same phase             |
| `renderAttentionWidget()` wired into `extension/index.ts` in P007F008T003                 | ✅ P007 after P006 (index.ts exists)        |
| `filesystemWatcher` registered in `builtin-bundle.ts` in P008F001T003                     | ✅ P008 after P006F006                      |
| `[P]` markers in P002 F004/F005 — both touch different files with no inter-dep            | ✅ registry.ts and ports.ts are independent |
| P004 F001–F006 all marked `[P]` — tags and watcher types have no dependency on each other | ✅ confirmed separate files                 |

**No gaps found.** Every artifact produced in phase N is consumed correctly in N+1 without requiring revisiting completed tasks.

---

## Implementation Strategy

### MVP Scope (P001 → P003 only)

After P003, you have a fully functional JSONL state store that can be appended to and queried.
This is the data backbone. Deliver and validate before building the pipeline.

### Incremental Delivery

1. **P001 + P002** → Foundation ready
2. **P003** → State store functional — entries can be appended/queried manually
3. **P004** → Watcher pipeline functional — run any `WatcherDefinition` by hand
4. **P005** → Autonomous polling + steering active
5. **P006** → pi extension loads, `/sunobomoh:config` works, users can add watchers
6. **P007** → TUI widget visible in pi with grouping + hyperlinks
7. **P008** → Two reference implementations usable out of the box
8. **P009** → `pi install` works, README complete, `script/ci` green
