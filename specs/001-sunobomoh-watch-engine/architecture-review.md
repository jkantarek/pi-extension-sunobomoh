# Architecture Review: Pattern Assignments

**Branch**: `001-sunobomoh-watch-engine` | **Date**: 2026-05-07
**Purpose**: Explicit pattern → file mapping, duplication analysis, TypeScript constraint impacts.

---

## Verdict Summary

The domain split is correct. The main risks are:

1. **No `src/core/` shared primitives** → `Result<T,E>`, branded types, and the generic registry
   will be copy-pasted into 4+ files unless extracted first.
2. **`Record<string, V>` collides with `noPropertyAccessFromIndexSignature`** in 3 data model types.
3. **`setInterval` drifts and can't be tested without mocks** → replace with self-scheduling setTimeout.
4. **`StateQuery` fluent chain mutates state** → must be immutable accumulation to satisfy `readonly`.
5. **`SideEffectExecutor` is two concerns** (filter + run) packaged as a class → one pure function suffices.

---

## 1. New Domain: `src/core/` — Shared Primitives (add this before everything else)

Three files. All other domains import from here. **Zero duplication exists if this is written first.**

### `src/core/result.ts` — **Railway-Oriented Programming**

Every fallible domain operation returns `Result<T, E>` instead of throwing.
Eliminates identical `try/catch` blocks in WatcherRunner, HydrationPipeline,
SideEffectExecutor, and Steerer — four modules that would otherwise duplicate
the same error-wrapping pattern.

```typescript
// The entire module — ~25 non-comment lines
export type Result<T, E = Error> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok  = <T>(value: T): Result<T, never>    => ({ ok: true,  value });
export const err = <E>(error: E): Result<never, E>    => ({ ok: false, error });
export const isOk  = <T, E>(r: Result<T, E>): r is { ok: true;  value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;
```

**Rule**: Never `throw` inside domain logic. Only the extension façade (`src/extension/index.ts`)
may catch and convert errors to pi `ctx.ui.notify`.

### `src/core/brands.ts` — **Branded Primitive / Opaque Type**

Prevents mixing `string` IDs across domains at zero runtime cost.
Each brand is one line. Constructors validate once at the boundary.

```typescript
export type EntryId      = string & { readonly _brand: 'EntryId'      };
export type WatcherId    = string & { readonly _brand: 'WatcherId'     };
export type TagId        = string & { readonly _brand: 'TagId'         };
export type IsoTimestamp = string & { readonly _brand: 'IsoTimestamp'  };
export type ResourceUri  = string & { readonly _brand: 'ResourceUri'   };

// Factory / validation boundary (one per brand):
export const toIsoTimestamp = (d: Date): IsoTimestamp => d.toISOString() as IsoTimestamp;
export const toResourceUri  = (s: string): Result<ResourceUri, Error> => ...;
```

**Impact on data model**: Replace all bare `string` field types in `state/types.ts`,
`watchers/types.ts`, and `tags/types.ts` with the appropriate brand.
The JSONL serialization still writes plain strings (brands are type-only).

### `src/core/registry.ts` — **Generic Registry Factory**

`WatcherRegistry` and `TagRegistry` are structurally identical: a `Map`-backed
lookup with `register(item)`, `get(id)`, `getAll()`, `has(id)`.
Implement once as a generic factory function:

```typescript
// ~30 non-comment lines
export interface Registry<T> {
  register(item: T): void;
  get(id: string): T | undefined;
  getAll(): readonly T[];
  has(id: string): boolean;
}
export const createRegistry = <T>(getId: (t: T) => string): Registry<T> => { ... };
```

`WatcherRegistry` and `TagRegistry` become:

```typescript
// src/watchers/registry.ts — 5 non-comment lines
export const createWatcherRegistry = () => createRegistry<BoundWatcher>(w => w.definition.id);

// src/tags/registry.ts — 5 non-comment lines
export const createTagRegistry = () => createRegistry<TagDefinition>(t => t.id);
```

Both domain files now contain only domain-specific type exports + the one-liner factory wrapper.

### `src/core/ports.ts` — **Interface Segregation / Hexagonal Ports**

The no-mocks constraint requires that all I/O be behind tiny interfaces injected at
construction time. Real implementations are trivial; test implementations are inline objects.

```typescript
export interface FileSystem {
  readFile(path: string): Promise<string>;
  appendFile(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export interface Clock {
  now(): IsoTimestamp;   // wraps new Date().toISOString() cast to brand
}
```

These two interfaces are ~8 lines total. They replace the need for `vi.mock('node:fs')` entirely:
tests pass `{ readFile: async () => '...', appendFile: async () => {}, exists: async () => true }`.

---

## 2. `src/state/` — Event Sourcing + CQRS + Projection

### `src/state/types.ts` — **Value Objects + Discriminated Union**

- All interfaces are `readonly` everywhere (already in plan). ✅
- **Fix required**: `outcomes: Readonly<Record<string, TagOutcome>>` conflicts with
  `noPropertyAccessFromIndexSignature`. Change to `outcomes: ReadonlyMap<TagId, TagOutcome>`
  in the in-memory resolved representation. Keep `Record<string, TagOutcome>` **only** in the
  JSONL wire type (a separate `StateEntryJson` interface), with a `parseStateEntry()` converter
  at the deserialization boundary.
- **Discriminated Union** on `type` field already designed correctly — keep it.

### `src/state/store.ts` — **Event Sourcing + Projection (Read Model)**

The JSONL file is the **event log**. The in-memory indexes are **projections** (read models)
derived by folding the log. The pattern:

```
fold: (ReadModel, Event) => ReadModel
```

Implement as a single pure `projectLine(model: ReadModel, line: StateLineType): ReadModel`
function. `StateStore` just calls `lines.reduce(projectLine, emptyModel)` on load.

This pattern means:
- **No mutation of existing state records** — ever. Only appends + replay.
- The entire "resolve entry with patches applied" logic is one `filter + reduce` over the model.
- `StateStore` has **two concerns only**: append to disk, project from disk. Two methods.
  `CQRS` separates reads (StateQuery) from writes (StateStore).

```typescript
// store.ts public API — the whole file fits in <100 lines with this pattern
export interface StateStoreAPI {
  append(lines: readonly StateLineType[]): Promise<Result<void, Error>>;
  load():                                  Promise<Result<void, Error>>;
  readonly model: Readonly<ReadModel>;  // projection; recomputed on load
}
```

`StateQuery` consumes `model` — StateStore never needs to know about queries.

### `src/state/query.ts` — **Fluent Builder with Immutable Accumulation**

Each `.byTag()` / `.byWatcher()` / `.needsAttention()` returns a **new** `StateQuery`
instance (does not mutate). This satisfies `readonly` throughout and means every
intermediate state is an independent value that can be tested on its own.

```typescript
// The builder accumulates predicates into a readonly array:
type Predicate = (e: StateEntry) => boolean;
const addPredicate = (q: StateQuery, p: Predicate): StateQuery =>
  createStateQuery(q.model, [...q.predicates, p]);
```

Final `.execute()` is just `model.entries.filter(e => predicates.every(p => p(e)))`.
Entire file: ~60 lines.

---

## 3. `src/watchers/` — Strategy + Factory Function Coercion

### `src/watchers/types.ts` — **Strategy Pattern**

`WatcherDefinition<TConfig, TEvent>` is already a strategy. ✅
One addition: replace bare `string` with brands in the interface:

```typescript
readonly id: WatcherId;
extractUri(event: TEvent, config: TConfig): ResourceUri;
extractTags(event: TEvent, config: TConfig): readonly TagId[];
```

### `src/watchers/runner.ts` — **Pure Function + Result type**

`WatcherRunner` should be a single **pure function** (not a class):

```typescript
export const runWatcher = async (
  watcher: BoundWatcher,
  sideEffects: SideEffectExecutor,
  clock: Clock,
  signal: AbortSignal
): Promise<Result<readonly StateEntry[], WatcherRunError>> => { ... }
```

Internally:
1. Run `before_watch` side effects (halt if requested)
2. Call `watcher.definition.watch(config, signal)` inside a `withTimeout(signal, config.timeoutMs)`
3. Map events → StateEntry with `toStateEntry(event, def, config, clock)` pure coercion function
4. Run `after_watch` side effects

`toStateEntry` is a **separate exported pure function** (its own doctest-able concern):

```typescript
// 15 lines; pure, deterministic, fully doctest-able
export const toStateEntry = (
  event: unknown,
  def: WatcherDefinition,
  config: unknown,
  clock: Clock
): StateEntry => ({ ... });
```

**No class needed for WatcherRunner.** The stateful registry is separate (it just holds the Map).

---

## 4. `src/hydrators/` — Middleware Pipeline (Reduce)

### `src/hydrators/pipeline.ts` — **Middleware Pattern (async reduce)**

The entire HydrationPipeline is a single exported pure function:

```typescript
export const runHydrationPipeline = async (
  hydrators: readonly HydratorDefinition[],
  entries: readonly StateEntry[],
  signal: AbortSignal
): Promise<Result<readonly StateEntry[], HydrationError>> => {
  let current = entries;
  for (const hydrator of hydrators) {
    const result = await safeHydrate(hydrator, current, signal);
    if (!result.ok) return result;
    assertHydrationInvariants(current, result.value); // pure function, throws on violation
    current = result.value;
  }
  return ok(current);
};
```

`assertHydrationInvariants` is a **separate exported pure function** (testable independently).
`safeHydrate` wraps the call in `Result` — no try/catch duplication.

**Total file: ~50 lines.** No class. No instance state. Fully testable by passing arrays.

---

## 5. `src/side-effects/` — Chain of Responsibility (pure function, no class)

### Current plan risk: the plan implies a `SideEffectExecutor` class.

**Replace with a single pure function** — the entire executor:

```typescript
// src/side-effects/executor.ts — ~35 lines
export const runPhase = async (
  phase: CallbackPhase,
  defs: readonly SideEffectDefinition[],
  ctx: SideEffectContext
): Promise<Result<{ halted: boolean }, SideEffectError>> => {
  for (const def of defs.filter(d => d.phase === phase)) {
    const result = await safeRun(def, ctx);
    if (!result.ok) return result;           // propagate error
    if (result.value?.halt === true) return ok({ halted: true });
  }
  return ok({ halted: false });
};
```

**This is Chain of Responsibility implemented as a simple loop.**
No class, no state, fully deterministic, 100% testable by passing arrays of definitions.

The `filter(d => d.phase === phase)` step is extracted as:

```typescript
// pure, 1-liner, separately doctestable
export const phaseHandlers = (
  phase: CallbackPhase,
  defs: readonly SideEffectDefinition[]
): readonly SideEffectDefinition[] => defs.filter(d => d.phase === phase);
```

---

## 6. `src/tags/` — Null Object + Factory Function

### `src/tags/types.ts` — **Null Object for missing outcomeSchema**

Instead of `outcomeSchema?: TSchema` (optional → null checks everywhere downstream),
use a sentinel:

```typescript
export const UNKNOWN_OUTCOME_SCHEMA: TSchema = Type.Unknown();

export interface TagDefinition {
  readonly outcomeSchema: TSchema;  // never undefined — use UNKNOWN_OUTCOME_SCHEMA
  // ...
}
```

Every consumer calls `Value.Check(def.outcomeSchema, value)` without a null guard.
Validation against `Type.Unknown()` always passes, which is the correct behaviour
for free-form outcomes. The null check is eliminated system-wide.

### `src/tags/registry.ts` — **Factory Function**

```typescript
// 10 lines
export const createTagOutcome = (def: TagDefinition): TagOutcome => ({
  tagId: def.id,
  status: def.defaultStatus,
});
```

`initializeOutcomes(tagIds, registry): ReadonlyMap<TagId, TagOutcome>` is a pure function
that replaces the three places in the codebase where outcomes are constructed:

```typescript
export const initializeOutcomes = (
  tagIds: readonly TagId[],
  registry: Registry<TagDefinition>
): ReadonlyMap<TagId, TagOutcome> =>
  new Map(tagIds.map(id => [id, createTagOutcome(registry.get(id) ?? BUILTIN_TAGS[0]!)]));
//                                                                      ^^ Null Object fallback
```

---

## 7. `src/scheduler/` — Self-scheduling setTimeout + Tick Counter

### Current plan risk: `setInterval` drifts and requires `vi.useFakeTimers()` to test (a mock).

**Replace with self-scheduling setTimeout pattern:**

```typescript
// src/scheduler/scheduler.ts
// The core tick function is pure: (state, config) => SchedulerState
// The timer is injected via Clock interface (Clock.setTimeout / clearTimeout)
// Tests pass a synchronous fake clock — no vi.useFakeTimers needed.
```

**Pattern: Template Method via injected dependencies**
The tick structure is fixed. Watcher execution and steering are injected strategies:

```typescript
export const createScheduler = (
  config: SchedulerConfig,
  runWatchers: WatcherRunnerFn,  // injected — the strategy
  runSteering: SteeringFn,       // injected — the strategy
  clock: Clock,                  // injected — the port
): SchedulerAPI => { ... };
```

**Steering trigger is a pure predicate** — no second interval, no shared mutable counter:

```typescript
// src/scheduler/should-steer.ts — 5 lines, fully doctestable
export const shouldRunSteering = (
  lastSteeringAt: IsoTimestamp | undefined,
  now: IsoTimestamp,
  config: SchedulerConfig
): boolean => {
  if (lastSteeringAt === undefined) return true;
  return msElapsed(lastSteeringAt, now) >= config.steeringIntervalMinutes * 60_000;
};
```

Extracting `shouldRunSteering` to its own file enables a full battery of doctest cases
covering the boundary conditions (exactly at the interval, just under, just over, undefined).

---

## 8. `src/steering/` — Specification + Strategy + Pure Scoring

### `src/steering/score-entry.ts` — **Pure Function**

```typescript
// Pure, deterministic, no side effects — the entire scoring logic
export const scoreEntry = (
  entry: StateEntry,
  registry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp
): AttentionScore => { ... };
```

Extracting scoring as a pure function separate from the steerer means:
- Every edge case (all urgent tags, stale entry, recency decay) is a doctest
- The steerer is just `entries.map(e => scoreEntry(e, registry, config, now))`

### `src/steering/classify.ts` — **Specification Pattern**

The three decisions (promote / demote / borderline) are specifications:

```typescript
// 3 pure predicate functions — no if/else chains anywhere else
export const isPromotable  = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score >= c.promoteThreshold;
export const isDemotable   = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score <= c.demoteThreshold;
export const isBorderline  = (s: AttentionScore, c: SteeringConfig): boolean =>
  !isPromotable(s, c) && !isDemotable(s, c);
```

No `switch`, no nested ternary, no class. The steerer calls these three predicates directly.

### `src/steering/steerer.ts` — **Strategy for LLM path**

The LLM steering path is a strategy injected optionally:

```typescript
export type LlmSteeringStrategy = (
  borderline: readonly StateEntry[],
  signal: AbortSignal
) => Promise<Result<readonly LlmOverride[], Error>>;

export const createSteerer = (
  config: SteeringConfig,
  registry: Registry<TagDefinition>,
  store: StateStoreAPI,
  llmStrategy?: LlmSteeringStrategy,  // absent = rule-only mode
  clock?: Clock
): SteererAPI => { ... };
```

The pi `sendUserMessage` implementation of `LlmSteeringStrategy` lives in `src/extension/index.ts`
(the façade), keeping the domain clean of pi API dependencies.

---

## 9. `src/extension/` — Façade + Builder Functions + Adapter

### `src/extension/index.ts` — **Façade Pattern**

The only file that imports from `@mariozechner/pi-coding-agent`. It:
1. Instantiates all domain objects (DI wiring point)
2. Implements `LlmSteeringStrategy` using `pi.sendUserMessage`
3. Registers pi event handlers, tools, commands, and UI

Everything else in `src/` is pi-agnostic and testable without pi being loaded.

### `src/extension/tools.ts` — **Builder Functions**

Each tool is built by a **pure builder function** that takes domain objects and returns
a `ToolDefinition` (pi's interface):

```typescript
export const buildWatchQueryTool    = (store: StateStoreAPI): ToolDefinition => ({ ... });
export const buildMarkAttentionTool = (store: StateStoreAPI): ToolDefinition => ({ ... });
export const buildTriggerSteerTool  = (steerer: SteererAPI): ToolDefinition => ({ ... });
```

Three functions, each under 30 lines, each independently testable by calling `def.execute(...)`.

### `src/extension/ui.ts` — **Adapter Pattern**

Converts domain `ReadModel` into pi TUI-compatible line arrays.
Pure function: `renderAttentionWidget(model: ReadModel, theme: Theme): readonly string[]`.
Stateless — the widget factory just calls this function on every render.

---

## Structural Changes to the Module Map

Apply these changes to `plan.md`'s source layout:

```
src/
├── core/                  ← NEW (before all other domains)
│   ├── result.ts          # Result<T,E>, ok(), err(), isOk(), isErr()
│   ├── brands.ts          # EntryId, WatcherId, TagId, IsoTimestamp, ResourceUri
│   ├── registry.ts        # createRegistry<T>() generic factory
│   └── ports.ts           # FileSystem, Clock interfaces
│
├── watchers/
│   ├── types.ts           # WatcherDefinition, BoundWatcher (uses brands)
│   ├── registry.ts        # createWatcherRegistry() — 5 lines, wraps core registry
│   ├── runner.ts          # runWatcher() pure function + withTimeout helper
│   └── coerce.ts          # toStateEntry() pure coercion — separately testable
│
├── hydrators/
│   ├── types.ts           # HydratorDefinition
│   ├── pipeline.ts        # runHydrationPipeline() pure function
│   └── invariants.ts      # assertHydrationInvariants() pure function
│
├── side-effects/
│   ├── types.ts           # CallbackPhase, SideEffectContext, SideEffectDefinition
│   └── executor.ts        # runPhase() pure function + phaseHandlers() helper
│
├── tags/
│   ├── types.ts           # TagDefinition, TagOutcome, UNKNOWN_OUTCOME_SCHEMA, BUILTIN_TAGS
│   ├── registry.ts        # createTagRegistry() — wraps core registry
│   ├── outcomes.ts        # createTagOutcome(), initializeOutcomes() pure functions
│   └── apply.ts           # applyTagsToEntry() pure function (replaces TagRegistry.applyTags)
│
├── state/
│   ├── types.ts           # StateEntry, StatePatch, SteeringRun, SchedulerRun (wire types)
│   ├── read-model.ts      # ReadModel interface + emptyModel() + projectLine() pure function
│   ├── store.ts           # createStateStore(fs, clock) — append + load + model accessor
│   └── query.ts           # createStateQuery(model) — immutable accumulation fluent builder
│
├── scheduler/
│   ├── types.ts           # SchedulerConfig, SchedulerState, SchedulerAPI
│   ├── should-steer.ts    # shouldRunSteering() pure predicate — fully doctestable
│   └── scheduler.ts       # createScheduler(config, runWatchers, runSteering, clock)
│
├── steering/
│   ├── types.ts           # SteeringConfig, AttentionScore, SteeringResult, LlmSteeringStrategy
│   ├── score-entry.ts     # scoreEntry() pure function (tag weights + recency decay)
│   ├── classify.ts        # isPromotable(), isDemotable(), isBorderline() specifications
│   └── steerer.ts         # createSteerer(config, registry, store, llmStrategy?, clock?)
│
└── extension/
    ├── index.ts            # Façade — DI wiring, pi event handlers, LlmSteeringStrategy impl
    ├── tools.ts            # buildWatchQueryTool(), buildMarkAttentionTool(), buildTriggerSteerTool()
    ├── commands.ts         # buildWatchCommand(), buildStateCommand(), buildSteerCommand()
    └── ui.ts               # renderAttentionWidget(), createAttentionFooter() pure functions
```

**Net change**: +5 files vs original plan (core/ extracted, some files split for single-concern).
Every file is under 100 non-comment lines. Zero files approach the 150-line limit.

---

## TypeScript Constraint Impact Matrix

| Constraint | Affected types | Required fix |
|---|---|---|
| `noPropertyAccessFromIndexSignature` | `StateEntry.outcomes` (Record) | Use `ReadonlyMap<TagId, TagOutcome>` in-memory; `Record` only in JSONL wire type `StateEntryJson` |
| `noPropertyAccessFromIndexSignature` | `Registry<T>` | Use `Map<string, T>` internally; `get(id)` accessor method on public API |
| `noUncheckedIndexedAccess` | All `array[i]` accesses | Use `.at(0)`, `.find()`, or explicit `undefined` guards; never raw index access |
| `noUncheckedIndexedAccess` | `BUILTIN_TAGS[0]` in `initializeOutcomes` | Assign to a named `const` with `!` assertion justified by doctest |
| `exactOptionalPropertyTypes` | `StateEntry.hydratedData?`, `StateEntry.attentionScore?` | Never assign `undefined` explicitly; use conditional spread: `...(data ? { hydratedData: data } : {})` |
| `exactOptionalPropertyTypes` | `StateEntryMetadata.hydratedAt?` etc. | Same: omit the field rather than setting `= undefined` |
| `noImplicitOverride` | TUI components extending `Container` in `ui.ts` | Add `override` to all overriding methods (render, invalidate, handleInput) |
| `noUnusedParameters` | `runPhase` receives `ctx` even when `defs` is empty | Prefix with `_ctx` or restructure guard to always use ctx |

---

## Anti-Patterns Explicitly Forbidden

| Anti-pattern | Where it would appear | Why forbidden |
|---|---|---|
| **Abstract class** | `BaseWatcher`, `BaseHydrator` | Adds inheritance, limits composability, inflates line count |
| **Class with private state** for domain logic | `SideEffectExecutor`, `HydrationPipeline` as classes | Untestable internals; pure functions cover it in fewer lines |
| **`setInterval` for scheduler** | `scheduler.ts` | Drifts; requires `vi.useFakeTimers()` (a mock) to test |
| **`vi.mock()`** anywhere | test files | Explicitly prohibited by AGENTS.md; signals broken design |
| **`Record<string, V>` with dot access** | state store, tag registry | Compile error under `noPropertyAccessFromIndexSignature` |
| **`array[n]` without undefined guard** | any array access | Compile error under `noUncheckedIndexedAccess` |
| **Optional field set to `undefined`** | `entry.hydratedData = undefined` | Compile error under `exactOptionalPropertyTypes` |
| **Catch-all `utils.ts`** | anywhere | Prohibited by "one public concern per file" |
| **Global singleton state** | watcher/tag registries | Prevents test isolation; use factory injection |
| **Prose JSDoc** | any source file | ESLint `local/jsdoc-examples-only` will error |

---

## Pattern → File Reference Card

| Pattern | File(s) |
|---|---|
| Railway-Oriented Programming (Result<T,E>) | `src/core/result.ts` |
| Branded Primitive / Opaque Type | `src/core/brands.ts` |
| Generic Registry Factory | `src/core/registry.ts` |
| Interface Segregation (Hexagonal Ports) | `src/core/ports.ts` |
| Event Sourcing (append-only log) | `src/state/store.ts` |
| Projection / Read Model | `src/state/read-model.ts` |
| CQRS (writes vs reads separated) | `src/state/store.ts` vs `src/state/query.ts` |
| Value Objects (immutable, readonly) | `src/state/types.ts`, `src/tags/types.ts` |
| Fluent Builder + Immutable Accumulation | `src/state/query.ts` |
| Strategy Pattern | `src/watchers/types.ts`, `src/steering/steerer.ts` |
| Pure Function Coercion | `src/watchers/coerce.ts` |
| Middleware Pipeline (async reduce) | `src/hydrators/pipeline.ts` |
| Chain of Responsibility (halt-able loop) | `src/side-effects/executor.ts` |
| Null Object Pattern | `src/tags/types.ts` (`UNKNOWN_OUTCOME_SCHEMA`) |
| Factory Functions | `src/tags/outcomes.ts`, all `create*` functions |
| Specification Pattern (predicates) | `src/steering/classify.ts` |
| Pure Scoring Function | `src/steering/score-entry.ts` |
| Self-Scheduling setTimeout | `src/scheduler/scheduler.ts` |
| Pure Predicate for timer logic | `src/scheduler/should-steer.ts` |
| Façade (pi isolation boundary) | `src/extension/index.ts` |
| Adapter (domain → pi TUI) | `src/extension/ui.ts` |
| Builder Functions (domain → pi tools) | `src/extension/tools.ts` |
