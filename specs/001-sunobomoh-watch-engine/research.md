# Research: Sunobomoh Watch Engine

**Branch**: `001-sunobomoh-watch-engine` | **Date**: 2026-05-07

All `NEEDS CLARIFICATION` items from Technical Context have been resolved here.

---

## Decision 1: State Persistence Format

**Decision**: Append-only JSONL file per project at `.pi/sunobomoh-state.jsonl`
(configurable via `sunobomoh.stateFile` in `.pi/settings.json`).

**Rationale**:

- pi itself uses JSONL for session storage — same tooling familiarity
- Append-only means no lock contention between watcher runs
- Trivial to `tail -f`, grep, or pipe into any other tool
- No migration headaches: new line types just add new schemas
- Index built in-memory at load time for O(1) lookups by id

**Alternatives considered**:

- SQLite: higher fidelity queries but adds a native dependency (`better-sqlite3`),
  conflicts with pi's no-native-deps posture, and is overkill for thousands of entries.
- JSON single file: rewriting on every append kills performance and creates race conditions.
- pi session entries only (`pi.appendEntry`): too coupled to pi session lifetime;
  state should outlive pi sessions.

**Hybrid**: Scheduler heartbeats (tiny blobs) DO use `pi.appendEntry()` so they survive
`/fork`, `/resume`, and restart-recovery within pi's own session tree.

---

## Decision 2: Watcher Plugin Model — Objects Not Classes

**Decision**: Watcher plugins are plain TypeScript objects satisfying the
`WatcherDefinition<TConfig, TEvent>` interface. No abstract base class.

**Rationale**:

- Composable: hydrators and side-effects are arrays, not inheritance chains.
- Independently testable: each function in the object can be tested in isolation.
- TypeBox schema for `configSchema` gives runtime validation for free.
- Matches pi's own tool registration pattern (`pi.registerTool(def)` takes a plain object).

**Alternatives considered**:

- Abstract class `BaseWatcher`: adds coupling, makes tree-shaking harder, and conflicts
  with the AGENTS.md "one public concern per file" rule (base class bleeds concerns).

---

## Decision 3: Hydration Ordering — Serial, Not Parallel

**Decision**: Hydrators in `watcher.hydrators[]` run serially in declaration order.
Each hydrator receives the entries array as enriched by all previous hydrators.

**Rationale**:

- Avoids race conditions where hydrator B overwrites hydrator A's `hydratedData`.
- Simpler error propagation: if hydrator N fails, hydrators N+1..M are skipped.
- Predictable for the user: order in the array is execution order.

**Alternatives considered**:

- Parallel hydration with merge: complex merge semantics, easy to create lost-update bugs.
- DAG-based hydration: necessary only if hydrators have declared dependencies —
  YAGNI until a concrete use case demands it.

---

## Decision 4: Side-Effect Model — Active Record Callbacks via Pure Function

**Decision**: Each `WatcherDefinition` carries a `sideEffects: SideEffectDefinition[]`
array. Two pure functions execute them: `phaseHandlers(phase, defs)` (filter) and
`runPhase(phase, defs, ctx)` (Chain of Responsibility loop). No `SideEffectExecutor` class.

**Rationale**:

- Self-contained per watcher: a GitHub watcher can declare its own Slack notification
  side-effect without any global registry magic.
- Configurable order: index in the array is execution order within a phase.
- Mirrors Active Record's `before_save`, `after_save` pattern but at the function level.
- `{ halt: true }` short-circuits remaining handlers (mirrors `throw ActiveRecord::Rollback`).
- **Pure function, not a class**: `runPhase` has no instance state. All inputs are arguments;
  all outputs are in the `Result` return. Directly testable by passing arrays of definitions.

**Alternatives considered**:

- Global event bus side-effects: harder to reason about which watcher triggered what;
  makes testing require global state.
- Decorator-style (`@BeforeHydrate`): TypeScript decorators are still experimental
  for methods; conflicts with strict tsconfig.
- `SideEffectExecutor` class: adds instance state with no benefit; constructor injection
  would be needed anyway, making it equivalent to a plain function.

---

## Decision 5: URI Scheme — RFC 3986 with Custom Schemes

**Decision**: All `sourceUri` and external resource links are RFC 3986 URIs.
Custom schemes registered per watcher type:

| Source      | URI Scheme | Example                                       |
| ----------- | ---------- | --------------------------------------------- |
| GitHub      | `github:`  | `github:///owner/repo/issues/123`             |
| Gmail       | `gmail:`   | `gmail:///user@example.com/thread/abc123`     |
| Slack       | `slack:`   | `slack:///workspace/C01ABC/p1234567890`       |
| Filesystem  | `file:`    | `file:///home/user/project/src/main.ts`       |
| Browser tab | `browser:` | `browser:///chrome/tab/12345`                 |
| Git         | `git:`     | `git:///github.com/owner/repo.git/commit/abc` |

**Rationale**:

- RFC 3986 gives a well-defined syntax that is not HTTP-limited.
- Custom schemes are legal per the spec and clearly communicate the resource type.
- String type is sufficient — no need for a `URL` object at the domain level.
- JSONL stores them as plain strings; no special serialization.

**Alternatives considered**:

- Opaque string IDs: loses semantics, hard to deep-link from TUI/browser.
- Forcing `https://` with custom paths: conflicts with the brief's explicit "not HTTP limited".

---

## Decision 6: Steering Intelligence — Rule-Based Default + Opt-in LLM

**Decision**:

- **Default**: Steerer uses a configurable scoring function. Score = sum of per-tag
  weights + recency decay. Entries above `config.promoteThreshold` get
  `needsAttention = true`; entries below `config.demoteThreshold` get `needsAttention = false`.
- **Opt-in LLM**: when `config.llmSteering = true`, the Steerer calls
  `pi.sendUserMessage(summary, { deliverAs: "steer" })` after rule-based scoring,
  asking the LLM to review borderline cases and override scores.

**Rationale**:

- Rule-based works offline and is deterministic — good for CI/automation.
- LLM adds value for ambiguous entries (e.g., "is this PR review actually urgent?").
- `deliverAs: "steer"` ensures the steering message is processed between tool calls
  without blocking the main user workflow.

**Alternatives considered**:

- LLM-only steering: too slow for 10-minute polling cycles; fails offline.
- No LLM integration: misses the core value of a pi extension (AI augmentation).

---

## Decision 7: Tag Outcomes — Null Object for Missing Schema

**Decision**: `TagDefinition.outcomeSchema` is **always present** — never `undefined`.
When no specific outcome shape is needed, set it to `UNKNOWN_OUTCOME_SCHEMA = Type.Unknown()`
(a TypeBox sentinel that accepts any value). All downstream consumers call
`Value.Check(def.outcomeSchema, value)` without a null guard.

**Rationale**:

- Null Object pattern: eliminates `if (def.outcomeSchema)` guards throughout the codebase.
- `Type.Unknown()` always passes validation, which is correct for free-form outcomes.
- TypeBox is already imported; the sentinel is one line.
- Built-in tags (`urgent`, `needs-review`, etc.) all use `UNKNOWN_OUTCOME_SCHEMA` — no
  change required at their call sites if a specific schema is later added.

**Alternatives considered**:

- Optional field `outcomeSchema?: TSchema`: forces null checks in every consumer.
- Separate tagged union for "typed" vs "untyped" TagDefinition: overengineers what
  is a one-line sentinel value.

---

## Decision 8: Scheduler State — Self-Scheduling setTimeout + pi.appendEntry Heartbeats

**Decision**:

- **Timer**: Self-scheduling `setTimeout` (not `setInterval`). After each tick completes,
  the next timeout is queued. Drift = only the actual work duration, not interval callback lag.
- **Clock injection**: The `Clock` port (`src/core/ports.ts`) is injected into `createScheduler()`.
  Tests pass a synchronous fake clock; no `vi.useFakeTimers()` needed.
- **Steering trigger**: `shouldRunSteering(lastSteeringAt, now, config): boolean` is a pure
  predicate in `src/scheduler/should-steer.ts`. No second interval, no shared mutable counter.
- **Persistence**: After each tick, `pi.appendEntry('sunobomoh:scheduler_tick', { ... })` persists
  a recovery checkpoint. The StateStore also writes a `scheduler_run` line for long-term history.

**Rationale**:

- `setInterval` drifts and requires `vi.useFakeTimers()` — a mock — to test. Both are prohibited.
- `shouldRunSteering` in its own file means all boundary conditions are doctest-able without
  starting a real scheduler.
- `pi.appendEntry` is designed for exactly this: durable extension state that survives
  `/fork`, `/resume`, and session restart.

**Alternatives considered**:

- `setInterval` with a second interval for steering: two timers drifting independently;
  requires fake timers to test.
- Polling a cron expression: adds a dependency; more complexity than a single predicate.

---

## Decision 9: Coverage Strategy — Pure Functions + Dependency Injection via Core Ports

**Decision**: All domain logic receives its dependencies via the `src/core/ports.ts` interfaces
(`FileSystem`, `Clock`) injected at factory-function construction time. No global singletons.
Tests pass real inline implementations (3-5 line objects) against temp files and fixed dates.

**Rationale**:

- No mocks required: AGENTS.md prohibits them. Every I/O seam is behind a 1–3 method interface.
- 98% coverage is achievable because every code path is reachable through the public API.
- Inline test implementations are self-documenting — no hidden `__mocks__` directories.

---

## Decision 10: Railway-Oriented Programming — Result<T, E>

**Decision**: Every fallible domain function returns `Result<T, E>` from `src/core/result.ts`.
Only `src/extension/index.ts` (the façade) catches errors and converts them to
`ctx.ui.notify` calls.

**Rationale**:

- Eliminates identical `try/catch` blocks in four modules (WatcherRunner, HydrationPipeline,
  SideEffectExecutor, Steerer).
- Makes all failure paths explicit and statically typed.
- The extension façade is the single error boundary — consistent user-facing error messages.

**Alternatives considered**:

- Throwing typed errors: forces `try/catch` in every caller; TypeScript does not type
  thrown exceptions, so callers cannot know what errors to expect.
- `neverthrow` or `fp-ts`: external dependencies; `Result<T,E>` is 6 lines, not a package.

---

## Decision 11: Branded Primitive Types

**Decision**: Domain identifiers, timestamps, and URIs use branded types (`EntryId`, `WatcherId`,
`TagId`, `IsoTimestamp`, `ResourceUri`) from `src/core/brands.ts`. Validation happens once
at the parse/construction boundary. Plain `string` in JSONL wire types only.

**Rationale**:

- Prevents ID mix-ups (passing a `WatcherId` where `EntryId` is expected) at compile time.
- Zero runtime cost — brands are type-level only.
- Eliminates defensive re-validation code scattered across domain functions.
- `toResourceUri()` validates RFC 3986 syntax once; all downstream code trusts the brand.

**Alternatives considered**:

- Plain `string` everywhere: no compile-time protection; defensive checks spread throughout.
- Runtime wrapper objects (`class EntryId { constructor(readonly value: string) {} }`):
  adds serialization complexity; JSON.stringify produces `{"value":"..."}` not `"..."`.

---

## Decision 12: Generic Registry Factory

**Decision**: `WatcherRegistry` and `TagRegistry` both use `createRegistry<T>()` from
`src/core/registry.ts`. Domain-specific registry files are ~8-line wrappers.

**Rationale**:

- The two registries are structurally identical: a `Map`-backed `register/get/getAll/has` API.
- Implementing twice would be a direct AGENTS.md violation (duplication trigger).
- `createRegistry<T>(getId)` is 10 lines; the domain wrappers add only the type constraint.

**Alternatives considered**:

- Separate implementations per domain: identical boilerplate, violates DRY.
- Class-based registry: adds `new` instantiation with no benefit over a factory function.

---

## Decision 13: Wire Type / In-Memory Type Split for StateEntry

**Decision**: Two separate TypeScript interfaces exist for the same logical entity:
`StateEntryJson` (JSONL wire — `Record<string, TagOutcomeJson>`, plain `string` fields) and
`StateEntry` (in-memory — `ReadonlyMap<TagId, TagOutcome>`, branded fields).
`parseStateEntry()` is the single conversion point, called only inside `StateStore.load()`.

**Rationale**:

- `noPropertyAccessFromIndexSignature` forbids `entry.outcomes[tagId]` on a `Record`-typed
  field. `ReadonlyMap<TagId, TagOutcome>` uses `.get(tagId)` — always legal.
- Brands cannot be serialised directly to JSON without a conversion step.
- A single conversion boundary is easier to audit than scattered casts.

**Alternatives considered**:

- Single type with `Record` and `as` casts: compiles but hides the constraint violation.
- `Map` in JSONL: not JSON-serialisable natively; requires custom replacer/reviver.

---

## Decision 14: Null Object for Tag Outcome Schema

See Decision 7 (revised above) — this is the formal decision record for the Null Object
application to `TagDefinition.outcomeSchema`.

## Decision 15: ULID with Monotonic Factory over UUID v4

**Decision**: All generated identifiers (`EntryId`, patch ids, run ids) use ULIDs produced by
`monotonicFactory()` from the `ulid` package. The PRNG is an injectable parameter
(the "extended randomness variable") supplied via the `IdFactory` port in `src/core/ids.ts`.

**Rationale**:

- **Time-sortable**: ULID's 48-bit millisecond prefix means JSONL entries sort
  lexicographically in insertion order — no secondary sort by timestamp needed.
- **Monotonic within a millisecond**: burst inserts during one scheduler tick are
  ordered. The 80-bit random portion increments by 1 within the same ms rather than
  re-randomising, giving sub-ms ordering. This is the "extended" in "extended randomness"
  — the random bits extend the timestamp resolution beyond milliseconds.
- **Shorter**: 26 Crockford base32 chars vs 36 UUID chars (with dashes) — 28% smaller
  on every JSONL line.
- **Testable without mocks**: the `prng` parameter (the randomness variable) is injectable.
  Tests pass `() => 0.12345` for a deterministic sequence. No `vi.useFakeTimers()` needed,
  consistent with the no-mocks constraint.
- **Offline-safe**: generated without network or coordination, like UUID v4.

**"Extended randomness variable"** specifically means the `prng: () => number` parameter
to `monotonicFactory()`. By making it injectable, the full ID generation pipeline becomes
a port — the same pattern as `FileSystem` and `Clock`. `IdFactory` is injected alongside
`Clock` into every function that creates identifiers (`toStateEntry`, `createStateStore`, etc.).

**Implementation**: `ulid` added to `dependencies` (not `devDependencies`) in `package.json`.
`defaultIdFactory` is a process-level singleton using `crypto.getRandomValues`.

**Alternatives considered**:

- **UUID v4** (`crypto.randomUUID()`): no temporal ordering, 36 chars, no injectable prng in
  Node's built-in — would require `vi.useFakeTimers()` or a separate abstraction for tests.
- **NanoID**: shorter but not time-sortable; no monotonic mode.
- **KSUID**: time-sortable, but 27 chars, less ecosystem support in Node.
- **Sequential integer**: ordering without randomness — collision risk in concurrent ticks.

---

## Open Questions (resolved)

| Question                                       | Resolution                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| One state file per project or per watcher?     | One per project at `.pi/sunobomoh-state.jsonl`                                            |
| Are watchers bundled or external packages?     | Bundled reference impls; extension authors add their own                                  |
| Auth model for external watchers?              | Config object per watcher; API keys via env vars                                          |
| Max state file size?                           | Configurable `maxBytes` (default 50 MB); old entries archived to `.pi/sunobomoh-archive/` |
| Should needsAttention persist across sessions? | Yes — it lives in the JSONL file, not session tree                                        |
| Tag outcomes typed or free-form?               | Typed per-tag via TypeBox schema; `unknown` if no schema                                  |
