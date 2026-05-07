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

## Decision 4: Side-Effect Model — Active Record Callbacks

**Decision**: Each `WatcherDefinition` carries a `sideEffects: SideEffectDefinition[]`
array. `SideEffectExecutor` filters by phase and runs matching handlers in array order.
Six phases: `before_watch`, `after_watch`, `before_hydrate`, `after_hydrate`,
`before_steer`, `after_steer`.

**Rationale**:
- Self-contained per watcher: a GitHub watcher can declare its own Slack notification
  side-effect without any global registry magic.
- Configurable order: index in the array is execution order within a phase.
- Mirrors Active Record's `before_save`, `after_save` pattern but at the function level.
- Returning `{ halt: true }` from any handler short-circuits the remaining handlers
  in that phase (mirrors `throw ActiveRecord::Rollback`).

**Alternatives considered**:
- Global event bus side-effects: harder to reason about which watcher triggered what;
  makes testing require global state.
- Decorator-style (`@BeforeHydrate`): TypeScript decorators are still experimental
  for methods; conflicts with strict tsconfig.

---

## Decision 5: URI Scheme — RFC 3986 with Custom Schemes

**Decision**: All `sourceUri` and external resource links are RFC 3986 URIs.
Custom schemes registered per watcher type:

| Source | URI Scheme | Example |
|--------|-----------|---------|
| GitHub | `github:` | `github:///owner/repo/issues/123` |
| Gmail | `gmail:` | `gmail:///user@example.com/thread/abc123` |
| Slack | `slack:` | `slack:///workspace/C01ABC/p1234567890` |
| Filesystem | `file:` | `file:///home/user/project/src/main.ts` |
| Browser tab | `browser:` | `browser:///chrome/tab/12345` |
| Git | `git:` | `git:///github.com/owner/repo.git/commit/abc` |

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

## Decision 7: Tag Outcomes — TypeBox Schemas per TagDefinition

**Decision**: Each `TagDefinition` carries an optional `outcomeSchema: TSchema` (TypeBox).
When a new `StateEntry` is tagged with a tag that has an `outcomeSchema`, its
`outcomes[tagId]` is initialized with the schema's default values. Mutations are
validated against the schema before being written.

**Rationale**:
- Enables per-tag typed outcomes (e.g., a "pr-review" tag can have
  `{ reviewer: string; approved: boolean }` while a "gmail-thread" tag has
  `{ replied: boolean; snoozedUntil: string }`).
- TypeBox is already imported by pi extensions for tool parameter schemas.
- Runtime validation prevents schema drift between watcher versions.

**Alternatives considered**:
- `zod` for schemas: would add a dependency; TypeBox is already available in the pi runtime.
- `unknown` outcomes with no validation: violates the "structured object" requirement in the brief.

---

## Decision 8: Scheduler State — pi.appendEntry for Heartbeats

**Decision**: After each scheduler tick, `pi.appendEntry('sunobomoh:scheduler_tick', { ... })`
is called to persist the run record. The StateStore ALSO writes a `scheduler_run` line
to the JSONL file for long-term history. The pi session entry serves only as a
recovery checkpoint for the current session.

**Rationale**:
- `pi.appendEntry` is designed for exactly this: durable extension state per session.
- On `session_start`, the extension reads the last `sunobomoh:scheduler_tick` entry
  to determine whether to fire an immediate catch-up run.
- Long-term history lives in the JSONL state file, not the session tree.

---

## Decision 9: Coverage Strategy — Pure Functions + Dependency Injection

**Decision**: All domain logic (StateStore, WatcherRunner, HydrationPipeline,
SideEffectExecutor, Steerer, Scheduler) receives its dependencies via constructor
injection. Filesystem I/O is abstracted behind thin `FileSystem` and `Clock` interfaces
injected at the point of use. Tests use real implementations against temp files /
`Date.now()` stubs (no `vi.mock`).

**Rationale**:
- No mocks required: AGENTS.md prohibits them.
- 98% coverage is achievable because every path is reachable through the public API.
- `FileSystem` interface is tiny (3 methods) — not a "utils catch-all".

---

## Open Questions (resolved)

| Question | Resolution |
|----------|-----------|
| One state file per project or per watcher? | One per project at `.pi/sunobomoh-state.jsonl` |
| Are watchers bundled or external packages? | Bundled reference impls; extension authors add their own |
| Auth model for external watchers? | Config object per watcher; API keys via env vars |
| Max state file size? | Configurable `maxBytes` (default 50 MB); old entries archived to `.pi/sunobomoh-archive/` |
| Should needsAttention persist across sessions? | Yes — it lives in the JSONL file, not session tree |
| Tag outcomes typed or free-form? | Typed per-tag via TypeBox schema; `unknown` if no schema |
