# Contract: Core Primitives

**Files**: `src/core/result.ts`, `src/core/brands.ts`, `src/core/ids.ts`, `src/core/registry.ts`, `src/core/ports.ts`

Write this domain **before all others**. Every other domain imports from here.
This is the single source of the five patterns that prevent cross-module duplication.

---

## `src/core/result.ts` — Railway-Oriented Programming

Pattern: **Railway-Oriented Programming** (`Result<T, E>`)

Every fallible domain operation returns `Result` instead of throwing. This eliminates
identical `try/catch` wrappers in WatcherRunner, HydrationPipeline, SideEffectExecutor,
and Steerer — four modules that would otherwise duplicate the same error-wrapping shape.

````typescript
/**
 * Discriminated union for fallible operations.
 * Domain functions return Result; only the extension façade (src/extension/index.ts)
 * converts errors to pi ctx.ui.notify calls.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { ok, err, isOk, isErr } from './result.js';
 * const success = ok(42);
 * expect(isOk(success)).toBe(true);
 * expect(isErr(success)).toBe(false);
 * if (isOk(success)) expect(success.value).toBe(42);
 *
 * const failure = err(new Error('boom'));
 * expect(isErr(failure)).toBe(true);
 * if (isErr(failure)) expect(failure.error.message).toBe('boom');
 * ```
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;
````

**Rule**: Never `throw` inside domain logic (`src/` outside `extension/`).
The façade is the single catch boundary.

---

## `src/core/brands.ts` — Branded Primitive / Opaque Type

Pattern: **Branded Primitive**

Prevents mixing `string` IDs across domains at zero runtime cost.
Validation happens once at the parse/construction boundary; downstream code never
re-validates. All brands are plain strings in JSON — no special serialization.

````typescript
/**
 * @example
 * ```ts @import.meta.vitest
 * import { toIsoTimestamp, toResourceUri, isOk } from './brands.js';
 * const ts = toIsoTimestamp(new Date('2026-05-07T10:00:00Z'));
 * expect(typeof ts).toBe('string');
 *
 * const uri = toResourceUri('github:///owner/repo/issues/1');
 * expect(isOk(uri)).toBe(true);
 *
 * const bad = toResourceUri('not a uri!!');
 * expect(isOk(bad)).toBe(false);
 * ```
 */
export type EntryId = string & { readonly _brand: 'EntryId' };
export type WatcherId = string & { readonly _brand: 'WatcherId' };
export type TagId = string & { readonly _brand: 'TagId' };
export type IsoTimestamp = string & { readonly _brand: 'IsoTimestamp' };
export type ResourceUri = string & { readonly _brand: 'ResourceUri' };

import type { Result } from './result.js';
import { ok, err } from './result.js';

/** Cast a Date to IsoTimestamp. Accepts only Date objects — not raw strings. */
export const toIsoTimestamp = (d: Date): IsoTimestamp => d.toISOString() as IsoTimestamp;

/** Validate and brand a string as ResourceUri (RFC 3986, any scheme). */
export const toResourceUri = (s: string): Result<ResourceUri> => {
  // Minimal RFC 3986 check: must have a scheme followed by ':'
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(s)) return ok(s as ResourceUri);
  return err(new Error(`Invalid ResourceUri: "${s}"`));
};

/** Unsafe cast — use only at trust boundaries (e.g., deserialising validated JSONL). */
export const unsafeEntryId = (s: string): EntryId => s as EntryId;
export const unsafeWatcherId = (s: string): WatcherId => s as WatcherId;
export const unsafeTagId = (s: string): TagId => s as TagId;
````

---

## `src/core/ids.ts` — ULID Monotonic Factory

Pattern: **Monotonic ULID** with injectable PRNG (extended randomness variable).

All generated identifiers (`EntryId`, patch ids, run ids) use ULIDs rather than UUID v4.
The PRNG parameter is the "extended randomness variable" — it makes ID generation a port,
enabling deterministic test sequences without mocks or fake timers.

**Why ULID over UUID v4:**

| Property            | UUID v4                | ULID (monotonic)                         |
| ------------------- | ---------------------- | ---------------------------------------- |
| Sortable by time    | ✗                      | ✓ (48-bit ms timestamp prefix)           |
| Sub-ms ordering     | ✗                      | ✓ (random bits increment within same ms) |
| JSONL natural order | random                 | insertion order = lexicographic order    |
| Length              | 36 chars (with dashes) | 26 chars (Crockford base32)              |
| Collision safety    | 122 random bits        | 80 random bits + monotonic counter       |
| Offline generation  | ✓                      | ✓                                        |

**"Extended randomness variable"**: The 80-bit random portion in a monotonic ULID serves
dual duty — collision avoidance (randomness) and sub-millisecond ordering (counter).
The random bits _extend_ the 48-bit millisecond timestamp into finer-grained ordering,
hence "extended randomness." The `prng` parameter injects the random source, making
the entire generation pipeline testable without `vi.useFakeTimers()`.

**Dependency**: `ulid` npm package (`dependencies`, not `devDependencies`).

````typescript
import { monotonicFactory } from 'ulid';
import type { EntryId } from './brands.js';

/**
 * Opaque factory type. Create one per scope (process-level or test-level).
 * The prng parameter is the extended randomness variable:
 *   - omit (default)  → crypto.getRandomValues — suitable for production
 *   - provide fn      → deterministic sequence — suitable for tests
 *
 * @example
 * ```ts @import.meta.vitest
 * import { createIdFactory } from './ids.js';
 *
 * // Deterministic factory for tests: seeded prng gives predictable output
 * const seeded = createIdFactory(() => 0.12345);
 * const id1 = seeded.next();
 * const id2 = seeded.next();
 * expect(typeof id1).toBe('string');
 * expect(id1).toHaveLength(26);          // Crockford base32
 * expect(id2 > id1).toBe(true);          // monotonically increasing
 *
 * // Same seed → same sequence (deterministic)
 * const seeded2 = createIdFactory(() => 0.12345);
 * expect(seeded2.next()).toBe(id1);
 *
 * // Production factory (no seed)
 * const prod = createIdFactory();
 * expect(prod.next()).toHaveLength(26);
 * ```
 */
export interface IdFactory {
  next(): EntryId;
  nextRaw(): string; // unbranded — for patch ids, run ids in wire types
}

export const createIdFactory = (prng?: () => number): IdFactory => {
  const generate = monotonicFactory(prng);
  return {
    next: () => generate() as EntryId,
    nextRaw: () => generate(),
  };
};

/** Process-level default factory. Use in production; inject createIdFactory(prng) in tests. */
export const defaultIdFactory: IdFactory = createIdFactory();
````

**Usage pattern in domain code**:

```typescript
// toStateEntry() receives an IdFactory — injected, not imported directly
export const toStateEntry = <TConfig, TEvent>(
  event: TEvent,
  definition: WatcherDefinition<TConfig, TEvent>,
  config: TConfig,
  clock: Clock,
  ids: IdFactory, // ← injected alongside Clock
): StateEntry => ({
  type: 'state_entry',
  id: ids.next(),
  // ...
});
```

---

Pattern: **Generic Registry Factory**

`WatcherRegistry` and `TagRegistry` are structurally identical Map-backed lookups.
Implement once; domain files become 5-line wrappers.

````typescript
/**
 * @example
 * ```ts @import.meta.vitest
 * import { createRegistry } from './registry.js';
 * const reg = createRegistry<{ id: string; value: number }>(x => x.id);
 * reg.register({ id: 'a', value: 1 });
 * expect(reg.has('a')).toBe(true);
 * expect(reg.get('a')?.value).toBe(1);
 * expect(reg.getAll()).toHaveLength(1);
 * reg.register({ id: 'a', value: 2 }); // overwrite
 * expect(reg.get('a')?.value).toBe(2);
 * ```
 */
export interface Registry<T> {
  register(item: T): void;
  get(id: string): T | undefined;
  getAll(): readonly T[];
  has(id: string): boolean;
}

export const createRegistry = <T>(getId: (t: T) => string): Registry<T> => {
  const map = new Map<string, T>();
  return {
    register: (item) => {
      map.set(getId(item), item);
    },
    get: (id) => map.get(id),
    getAll: () => Array.from(map.values()),
    has: (id) => map.has(id),
  };
};
````

---

## `src/core/ports.ts` — Interface Segregation (Hexagonal Ports)

Pattern: **Interface Segregation** / Hexagonal Ports

The only I/O seams in the entire domain. Inject real implementations in production;
inject inline objects in tests. **No `vi.mock()` is ever needed.**

````typescript
import type { IsoTimestamp } from './brands.js';

/**
 * Minimal filesystem abstraction. Three methods — no more.
 *
 * Production: import { createNodeFileSystem } from './ports.js'
 * Tests:      pass { readFile: async () => '...', appendFile: async () => {}, exists: async () => true }
 *
 * @example
 * ```ts @import.meta.vitest
 * import { createNodeFileSystem } from './ports.js';
 * import { tmpdir } from 'node:os';
 * import { join } from 'node:path';
 * const fs = createNodeFileSystem();
 * const path = join(tmpdir(), `test-${Date.now()}.txt`);
 * await fs.appendFile(path, 'hello');
 * expect(await fs.exists(path)).toBe(true);
 * expect(await fs.readFile(path)).toBe('hello');
 * ```
 */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  appendFile(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/**
 * Minimal time abstraction. One method — returns branded IsoTimestamp.
 * Tests pass { now: () => toIsoTimestamp(new Date('2026-01-01T00:00:00Z')) }.
 */
export interface Clock {
  now(): IsoTimestamp;
}

/** Node.js production implementations. */
export const createNodeFileSystem = (): FileSystem => {
  /* node:fs/promises impl */
};
export const createSystemClock = (): Clock => ({ now: () => toIsoTimestamp(new Date()) });
````

---

## Dependency Rule

```
Src/core/       ← no imports from other src/ domains
src/state/      ← imports from core/
src/watchers/   ← imports from core/, state/
src/hydrators/  ← imports from core/, state/
src/side-effects/ ← imports from core/, state/
src/tags/       ← imports from core/
src/scheduler/  ← imports from core/, state/, watchers/, steering/
src/steering/   ← imports from core/, state/, tags/
src/extension/  ← imports from all domains; only file that imports @mariozechner/pi-coding-agent
```

Additionally: `src/core/ids.ts` depends on the `ulid` npm package — the only
non-Node-built-in runtime dependency in `src/core/`.
All other `src/core/` files have zero runtime dependencies.
