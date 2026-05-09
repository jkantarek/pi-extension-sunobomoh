# Linting Standards — Agent Coding Guide

This file supplements `AGENTS.md` with lint-specific patterns and anti-patterns.
Every rule here corresponds to an enforced ESLint error. Treat violations as
design signals, not obstacles to route around.

---

## The Golden Rule

**If you are fighting a lint rule to make code fit, the lint rule is telling you
the code needs to be restructured — not suppressed or tricked.**

Lint rules in this project encode design decisions. When a rule fires, the
correct response is to ask _why the rule exists_ and refactor accordingly.

---

## Anti-Patterns by Rule

### `sonarjs/void-use` — Do not use `void` to satisfy return types

**Forbidden:**

```ts
// Squeezing an arrow function onto one line by discarding the return value
register: ((item: T): void => void map.set(id, item),
  // Suppressing a TypeScript assignment-in-constructor warning with void
  void (this.name = 'MyError'));
```

**Why it fires:** You are using `void` as a syntactic trick to avoid a block
body `{ ... }`, usually because you are fighting the `max-lines-per-function`
limit. The `void` operator is for intentionally ignoring a returned Promise
(`void asyncFn()`). Using it to coerce a return type or compress a function
body is surprising to readers and masks what the code is doing.

**What to do instead:**

If you reach for `void` to stay under `max-lines-per-function`, that is the
rule signalling that your function has too many responsibilities. Extract a
named helper or split the concern into a separate module.

```ts
// Correct — explicit block body
register: (item: T): void => { map.set(id, item); },

// Also correct — contextual void.
// When the surrounding return type supplies 'void' (e.g. implementing a typed
// interface), TypeScript's contextual typing lets the expression arrow return
// the Map without an explicit annotation. No void operator needed.
register: (item) => map.set(id, item),  // void inferred from Registry<T>

// Correct — plain assignment in a constructor
this.name = 'MyError';
```

---

### `complexity` / `sonarjs/cognitive-complexity` — Do not suppress, extract

**Forbidden:**

```ts
// eslint-disable-next-line complexity
export const runEverything = async (...) => { ... };
```

**Why it fires:** The function does too many things. Cyclomatic complexity > 7
or cognitive complexity > 15 means the function has too many independent
decision paths to reason about, test, or review in isolation.

**What to do instead:** Identify each decision path and extract it into a
named pure function. Name the extracted functions after _what they decide_,
not _what they do_. Each extracted function should be independently testable.

---

### `max-lines-per-function` — Do not compress code to fit, decompose it

**Forbidden:**

```ts
// Combining two declarations onto one line to save a line count
const fx = [...(p.watcher.sideEffects ?? []), ...p.sideEffects],
  b = buildBaseCtx(p);

// Using void, ternary chains, or comma expressions to avoid block bodies
const f = (x: T): void => void ((a = x), doThing(a));
```

**Why it fires:** The function is doing more than one thing. A source function
over 10 non-comment lines is a decomposition signal. A test function over 60
lines is a readability signal.

**What to do instead:** Extract. The name you give the extracted function
reveals the missing domain concept. If you cannot name it, you have not
identified the right boundary yet.

---

### `sonarjs/pseudo-random` — Use `crypto.randomUUID()`, not `Math.random()`

**Forbidden:**

```ts
const path = join(tmpdir(), `file-${Math.random()}.json`);
```

**Why it fires:** `Math.random()` is not cryptographically secure. Even in
test code, using it normalises the pattern and risks it appearing in
production paths.

**What to do instead:**

```ts
import { randomUUID } from 'node:crypto';
const path = join(tmpdir(), `file-${randomUUID()}.json`);
```

This applies in test files too. `randomUUID()` is just as convenient and
establishes the correct habit.

---

### `sonarjs/no-nested-conditional` — Flatten nested ternaries

**Forbidden:**

```ts
const result = isA(x) ? 'a' : isB(x) ? 'b' : 'c';
```

**Why it fires:** Nested ternaries require the reader to hold multiple
evaluation contexts simultaneously. They are also resistant to adding a new
branch cleanly.

**What to do instead:**

```ts
// Option 1: if/else chain (clearest intent)
if (isA(x)) return 'a';
if (isB(x)) return 'b';
return 'c';

// Option 2: early-return guard functions
const classify = (x: T): string => {
  if (isA(x)) return 'a';
  if (isB(x)) return 'b';
  return 'c';
};
```

---

## How to Respond to a Lint Failure

1. **Read the rule name and message.** It describes _what pattern was detected_.
2. **Ask why the rule exists.** The rules in this project encode real design
   constraints — complexity limits exist because complex code is hard to test
   and reason about; `void-use` exists because it obscures intent.
3. **Do not reach for `// eslint-disable`.** An inline disable hides the
   problem for the next reader. It also prevents the rule from catching future
   regressions in the same area.
4. **Refactor to remove the root cause.** If a function is too long, split it.
   If complexity is too high, extract decision logic. If you need `void`,
   reconsider the return type or the structure.
5. **The exception:** legitimately uncoverable code paths (e.g. `String(cause)`
   in a catch block for a non-Error that cannot be injected without a lint
   violation) may use a single targeted `// eslint-disable-next-line` with a
   comment explaining _why_ it is unavoidable. This requires a code review
   comment and should be rare.

---

## Quick Reference

| Rule                                    | Signal                                 | Correct response                                   |
| --------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `sonarjs/void-use`                      | You are using `void` as a trick        | Remove `void`, use a block body or restructure     |
| `max-lines-per-function`                | Function has too many responsibilities | Extract a named helper                             |
| `max-lines`                             | File has too many concerns             | Split into domain modules                          |
| `complexity`                            | Too many decision paths                | Extract each path as a named pure function         |
| `sonarjs/cognitive-complexity`          | Nesting too deep                       | Flatten with early returns or extracted predicates |
| `sonarjs/no-nested-conditional`         | Ternary inside ternary                 | Use if/else chain                                  |
| `sonarjs/pseudo-random`                 | `Math.random()` in code                | Use `crypto.randomUUID()`                          |
| `sonarjs/publicly-writable-directories` | Hardcoded `/tmp`                       | Use `os.tmpdir()`                                  |
| `max-params`                            | Function takes too many arguments      | Group related params into a typed object           |
