# Ralph Progress Log

Feature: 001-sunobomoh-watch-engine
Started: 2026-05-08 20:05:45

## Codebase Patterns

[Patterns discovered during implementation - updated by agent]

---

---

## Iteration 1 - 2026-05-08T20:06:43-05:00

**User Story**: P001 Setup — Package identity, domain scaffold, quality gates
**Tasks Completed**:

- [x] P001F001T001: Renamed package to `pi-extension-sunobomoh`, added runtime deps (ulid, typebox, @mariozechner/pi-coding-agent)
- [x] P001F001T002: Added `pi.extensions` manifest key, ran `pnpm install`
- [x] P001F002T001: Deleted placeholder `src/index.ts` and `src/index.test.ts`
- [x] P001F002T002: Created all domain dirs with `.gitkeep` (core, state, watchers, hydrators, side-effects, tags, config, ui, scheduler, steering, extension)
- [x] P001F003T001: All quality gates pass (typecheck, lint, format:check, test)
      **Tasks Remaining in Story**: None — story complete
      **Commit**: cc9d9f9
      **Files Changed**:
- package.json
- pnpm-lock.yaml
- vitest.config.ts
- src/extension/index.ts (created — minimal `export {};` to satisfy TS18003)
- src/{core,state,watchers,hydrators,side-effects,tags,config,ui,scheduler,steering}/.gitkeep
- src/index.ts (deleted)
- src/index.test.ts (deleted)
- specs/001-sunobomoh-watch-engine/tasks.md (tasks marked [x])
  **Learnings**:
- TypeScript TS18003 fires when `include: ["src"]` has zero `.ts` files; fixed by creating minimal `src/extension/index.ts` with `export {};` (also referenced in the `pi` manifest)
- Vitest exits code 1 with no test files by default; `passWithNoTests: true` in vitest.config.ts resolves this
- Commitlint `subject-case` rule requires all-lowercase subject (no sentence-case)
- `pnpm format` auto-fixed 21 spec/markdown files that had trailing-whitespace issues from the spec generation phase
- `@mariozechner/pi-coding-agent` is deprecated in favour of `@earendil-works/pi-coding-agent` but the tasks spec it explicitly, so the deprecated version was used

---

---

## Iteration 2 - 2026-05-08T20:11:28-05:00

**User Story**: P002 Foundation — `src/core/`
**Tasks Completed**:

- [x] P002F001T001: Wrote inline doctests for ok, err, isOk, isErr in result.ts (stubs threw → RED)
- [x] P002F001T002: Implemented Result<T,E>, ok, err, isOk, isErr in result.ts
- [x] P002F002T001: Wrote inline doctests for toIsoTimestamp, toResourceUri, unsafe casts in brands.ts (RED)
- [x] P002F002T002: Implemented branded types + factory/cast functions in brands.ts
- [x] P002F003T001: Wrote inline doctests for createIdFactory in ids.ts (RED)
- [x] P002F003T002: Implemented IdFactory, createIdFactory(prng?), defaultIdFactory using ulid
- [x] P002F004T001: Wrote inline doctest for createRegistry in registry.ts (RED)
- [x] P002F004T002: Implemented Registry<T> interface, createRegistry<T> factory
- [x] P002F005T001: Wrote inline doctests for createNodeFileSystem and createSystemClock in ports.ts (RED)
- [x] P002F005T002: Implemented FileSystem, Clock, createNodeFileSystem, createSystemClock
      **Tasks Remaining in Story**: None — story complete
      **Commit**: cb8de92
      **Files Changed**:
- src/core/result.ts (created)
- src/core/brands.ts (created)
- src/core/ids.ts (created)
- src/core/registry.ts (created)
- src/core/ports.ts (created)
- package.json (added @types/node, --no-warn-ignored to lint-staged)
- eslint.config.mjs (added .pi/** to ignores)
  **Learnings\*\*:
- Inline doctests in vite-plugin-doctest do NOT support static `import` statements — they are compiled into async test bodies where `import` is invalid. Use the module's own exported symbols directly (no import needed for same-file exports), or use `await import('...')` for external modules.
- ULID `monotonicFactory` only controls the random suffix; the timestamp prefix is always from `Date.now()`. Two factories with the same prng seed will produce different ULIDs if created at different times.
- `max-lines-per-function: 10` in ESLint applies to the whole arrow function body. Multi-line statement-body arrow functions inside object literals also need explicit return types (`@typescript-eslint/explicit-function-return-type`). Use `void expr` trick to keep single-expression form: `register: (item: T): void => void map.set(...)`.
- Prettier auto-expands `{ singleStatement; }` multi-line when the line is long. Use expression bodies (no braces) or the `void` operator trick to prevent this.
- `access(path).then(() => true, () => false)` is idiomatic for `exists()` without async/try-catch — keeps function under the 10-line limit.
- `.pi/**` must be added to ESLint ignores; lint-staged needs `--no-warn-ignored` flag to suppress "File ignored" warnings when ignored files are explicitly staged.
- Pre-commit hook (lint-staged + husky) runs BOTH prettier --check AND eslint on staged .ts files — all staged files must pass.

---

---

## Iteration 3 - 2026-05-08

**User Story**: P003 Event State Store — coverage gap fix
**Tasks Completed**:

- [x] P003F001T001–T002: types.ts wire interfaces + type guards
- [x] P003F002T001–T002: parseStateEntry + in-memory domain types
- [x] P003F003T001–T002: emptyModel() + ReadModel
- [x] P003F004T001–T002: projectLine() for state_entry and state_patch
- [x] P003F005T001–T002: projectLine() for steering_run and scheduler_run
- [x] P003F006T001–T002: StateStore.load() + JSONL projection
- [x] P003F007T001–T002: StateStore.append()
- [x] P003F008T001–T003: StateQuery fluent builder

**Tasks Remaining in Story**: None — story complete
**Commit**: e0d8b5d
**Files Changed**:

- src/state/types.ts (created)
- src/state/parse.ts (created)
- src/state/parse.test.ts (created)
- src/state/read-model.ts (created)
- src/state/read-model.test.ts (created)
- src/state/store.ts (created)
- src/state/store.test.ts (created)
- src/state/query.ts (created)
- src/state/query.test.ts (created)
- src/state/test-fixtures.ts (created)

**Coverage**: 100% stmts/funcs/lines, 98.41% branches (≥98% threshold)
**Tests**: 41 pass

**Learnings**:

- `@typescript-eslint/prefer-promise-reject-errors` (from strictTypeChecked) prevents `Promise.reject('string')` in test files — cannot test non-Error branches of `e instanceof Error` guards without eslint-disable; accept as uncoverable (1/63 branches, 98.41% ≥ 98%).
- `max-lines-per-function: 60` applies to test file `describe` callbacks (not just `it` blocks); large describe blocks need splitting into separate `describe` calls.
- Blank lines count toward the 150 non-comment `max-lines` limit in test files (only `skipComments: true`, not `skipBlankLines: true`).
- V8 branch counting for `a || b || c || d` chains counts each operator as 2 branches (true/false short-circuit); a 3-operator OR chain = 8 branches total (not 6).
- `commitlint subject-case` rule requires all-lowercase subject — "P003 event state store" fails; use "p003 event state store".
