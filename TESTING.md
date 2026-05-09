# Testing Standards — Agent Coding Guide

This file supplements `AGENTS.md` and `LINTING.md` with testing-specific
patterns and strategies. Every entry here was learned from a real coverage
gap or test failure during implementation — not theory.

---

## The Golden Rule

**A test that is hard to write is telling you the code has the wrong shape.**

When a branch is hard to reach through the public API, ask:

1. Is this branch dead code that should be deleted?
2. Is this branch unreachable because an error is being encoded as an
   exception instead of as data?
3. Is this branch guarding against a scenario that the design makes
   impossible — and if so, can the design be changed so the guard isn't
   needed?

Reaching for a mock, a timing trick, or `// c8 ignore` is almost always the
wrong answer. Refactoring is almost always the right one.

---

## Pattern 1: Errors as Data (not exceptions)

### The problem

Outer `try/catch` blocks in async orchestration functions are untestable
without injecting failures through every layer:

```ts
// Hard to test: what makes this catch fire?
run: async (signal) => {
  try {
    const overrides = await getLlmOverrides(...);
    const result = await store.append([...]);
    return result.ok ? ok(value) : err(result.error);
  } catch (e) {
    return err(toError(e)); // ← never exercised
  }
},
```

### The fix

Express sub-step failures as **fields on the outcome object**, not as
thrown exceptions. The outer `try/catch` disappears entirely:

```ts
interface SteeringOutcome {
  readonly promoted: readonly EntryId[];
  readonly demoted: readonly EntryId[];
  readonly usedLlm: boolean;
  readonly llmError?: Error; // failure is data — caller decides what to do
}

run: async (signal) => {
  const { overrides, error: llmError } = await getLlmOverrides(...);
  // ^ always returns, never throws — error captured as field
  const appendResult = await store.append([...]);
  return appendResult.ok
    ? ok({ promoted, demoted, usedLlm, llmError })
    : err(appendResult.error);
},
```

**Why this is better:**

- Every code path is reachable through the public API — no exceptional
  state required
- Callers get structured information even in partial-failure cases:
  "steering ran, LLM was unavailable, here are the counts"
- Tests inject a failing LLM strategy and assert `result.value.llmError`
  is set — a plain data assertion, no timing or mocking required
- The `if (result.ok)` mapping branch in the caller disappears too, since
  the return type now matches directly

---

## Pattern 2: Inject Through the Port, Not the Internals

### The problem

Testing a failure path by triggering it through I/O, environment, or
process state:

```ts
// Fragile: relies on a missing directory, file permissions, race conditions
it('handles write failure', async () => {
  const store = createStateStore('/root/no-permission.jsonl', fs, clock);
  // Hope the environment makes this fail
});
```

### The fix

The hexagonal ports (`FileSystem`, `Clock`, `StateStoreAPI`) exist precisely
to make failure injection clean and deterministic:

```ts
// Clean: inject a stub that returns err() exactly when you need it
it('handles write failure', async () => {
  const realStore = await createTmpStore('base');
  const failingStore: StateStoreAPI = {
    ...realStore,
    append: () => Promise.resolve(err(new Error('disk full'))),
  };
  const result = await steerer.run(failingStore, ...);
  expect(result.ok).toBe(false);
});
```

**Rules:**

- Stub only the method that needs to fail — spread the real implementation
  for everything else (`{ ...realStore, append: failingImpl }`)
- Never stub internals (private functions, module state, closures)
- If you cannot inject the failure through a port, the port is missing a
  method — add it (e.g., `FileSystem.mkdir`)

---

## Pattern 3: Always `load()` After `append()` in Store Tests

### The problem

A common mistake that produces silent test failures:

```ts
const store = await createTmpStore('test');
await store.append([entry]); // writes to disk
// store.model is still EMPTY — append() does not update the in-memory model
const steerer = createSteerer(config, tagRegistry, store);
await steerer.run(...); // scores 0 entries, no LLM called, no patches written
```

### The fix

```ts
const store = await createTmpStore('test');
await store.append([entry]);
await store.load(); // ← re-reads disk into store.model
// Now store.model.byId has the entry
```

**Why it happens:** `StateStore` is append-only and event-sourced. `append()`
persists lines to disk but does not re-project them into the in-memory
`ReadModel`. `load()` re-reads the file and rebuilds the projection from
scratch. Any test that needs to observe entries after writing them must call
`load()` in between.

---

## Pattern 4: Dead Code Branches Reveal Missing Abstractions

### The problem

A `?? fallback` or `|| default` that TypeScript requires but logic guarantees
will never fire:

```ts
// `order` only contains tags in `byTag` — get() can never return undefined
entries: byTag.get(tag) ?? [],  // ← dead code, untestable
```

### The fix

Change the data structure so the guarantee is encoded in the type, not
defended with a fallback. Instead of maintaining a parallel `Map` + `order`
array that must stay in sync, build a single structure where the guarantee
holds by construction:

```ts
// Now `group.entries` is always defined — no get() needed, no ?? needed
const ensureGroup = (tag: string, groups: TagGroup[], idx: Map<string, TagGroup>): TagGroup => {
  const existing = idx.get(tag);
  if (existing) return existing;
  const g: TagGroup = { tag, entries: [] };
  groups.push(g);
  idx.set(tag, g);
  return g;
};
// Caller: ensureGroup(tag, groups, idx).entries.push(entry);
```

**Rule:** If a `??` or `||` fallback is logically unreachable, the data
structure needs to be changed so the compiler can see the guarantee — not
suppressed with `/* c8 ignore */`.

---

## Pattern 5: `String(cause)` Branches Are Safely Consolidated

### The problem

The `instanceof Error ? e.message : String(cause)` pattern appears in many
catch blocks. Each instance has an untestable false branch (non-Error throws
require `prefer-promise-reject-errors` violations to inject):

```ts
// In pipeline.ts, runner.ts, steerer.ts, config/store.ts, state/store.ts
return err(cause instanceof Error ? cause : new Error(String(cause)));
```

### The fix

Extract to `core/errors.ts` once, test there, reference everywhere:

```ts
// core/errors.ts — tested once via inline doctest
export const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

// Everywhere else — no branch, just a function call
return err(toError(cause));
```

**Why this matters for coverage:** Before extraction, 5 files each had one
untestable branch from this pattern. After extraction, the pattern is tested
once in `errors.ts` (via a doctest that throws `42` and checks the message),
and all 5 callers have no branch to miss.

---

## Pattern 6: Test Through the Event, Not the Handler

### The problem

Integration tests that assert on internal state without triggering the
event that creates it:

```ts
// Tests that session_start wires things up — but never fires session_start
it('scheduler is initialized', async () => {
  factory(mockPi);
  const api = getSunobomoh();
  expect(api?.schedulerState.running).toBe(false); // passes, but incomplete
});
```

### The fix

Use `_getHandlers()` (or equivalent escape hatch) to fire the event
programmatically, exercising the full handler body:

```ts
it('session_start sets up the scheduler', async () => {
  factory(mockPi);
  const handlers = (mockPi as unknown as { _getHandlers: () => ... })._getHandlers();
  const startHandler = handlers['session_start']?.[0] as () => Promise<void>;
  await startHandler(); // fires the real handler
  expect(getSunobomoh()?.schedulerState.running).toBe(false);
});

// And test the variant where optional context is absent:
it('session_start without ui does not throw', async () => {
  const mockPi = createTestPiContext();
  delete (mockPi as unknown as Record<string, unknown>)['ui'];
  factory(mockPi);
  const startHandler = ...;
  await expect(startHandler()).resolves.not.toThrow();
});
```

---

## Pattern 7: Score-Dependent Tests Need Deterministic Time

### The pattern

Tests that depend on entry scores (steering promote/demote/borderline
classification) are sensitive to the entry's age relative to `now`. An entry
tagged `urgent` scores high; one tagged `informational` 12 hours ago scores
in the borderline range. These thresholds shift with time.

### The rule

Always use **relative dates** (`new Date(Date.now() - N * 60 * 60 * 1000)`)
rather than absolute timestamps. The test intent is "12 hours old", not
"created at 2026-05-09T10:00:00Z".

```ts
// Fragile: will fail on different dates or if default thresholds change
timestamp: '2026-05-07T10:00:00Z';

// Robust: expresses the intent, survives across any date
const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
```

For LLM-path tests specifically: after `store.append([entry])` call
`await store.load()` to ensure the entry is in `store.model`, then verify
the entry actually falls in the borderline range before asserting on
`result.value.usedLlm`. If the score lands outside borderline (e.g., the
entry is promotable), `getLlmOverrides` short-circuits and the LLM is
never called regardless of configuration.

---

## Quick Reference: Coverage Gap Diagnosis

| Symptom                                       | Root cause                                                          | Fix                                                                |
| --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Branch in `catch(e)` never covered            | Only test happy paths; no way to throw without lint violation       | Make the failure a data field on the return type; remove try/catch |
| `?? fallback` never covered                   | Dead code from type system requiring a guard logic makes impossible | Change data structure so the guarantee is type-safe                |
| `instanceof Error` false branch never covered | Non-Error throws require `prefer-promise-reject-errors` violation   | Extract `toError()` to `core/errors.ts`; test there once           |
| Store model empty after `append()`            | Forgot `store.load()` between write and read                        | Always call `await store.load()` after `store.append()` in tests   |
| Branch inside event handler never covered     | Event never fired in test                                           | Use `_getHandlers()` to fire the handler programmatically          |
| Port error path never covered                 | Real implementation never fails in dev environment                  | Inject a stub via spread: `{ ...real, method: () => err(...) }`    |
| LLM code path never executed                  | `borderline.length === 0` because model wasn't loaded               | Call `store.load()` so entries appear in classification            |
| Concurrent abort guard never covered          | Requires racing the event loop between async steps                  | Accept as structural — cooperative abort is intentional design     |
