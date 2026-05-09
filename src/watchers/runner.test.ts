import type { HydratorDefinition } from '../hydrators/types.js';
import { describe, it, expect } from 'vitest';
import type { SideEffectDefinition } from '../side-effects/types.js';
import type { Clock } from '../core/ports.js';
import type { IdFactory } from '../core/ids.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import { runWatcher } from './runner.js';
import { createSystemClock } from '../core/ports.js';
import { createIdFactory } from '../core/ids.js';
import { createTagRegistry } from '../tags/registry.js';
import { isOk, isErr } from '../core/result.js';
import { createTestWatcher, createFailingWatcher } from './test-fixtures.js';

interface RunDefaults {
  readonly config: object;
  readonly sideEffects: readonly SideEffectDefinition[];
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly tagRegistry: Registry<TagDefinition>;
  readonly signal: AbortSignal;
}

const defaults = (): RunDefaults => ({
  config: {},
  sideEffects: [] as readonly SideEffectDefinition[],
  clock: createSystemClock(),
  ids: createIdFactory(),
  tagRegistry: createTagRegistry(),
  signal: new AbortController().signal,
});

describe('runWatcher – happy path', () => {
  it('returns ok with StateEntry array when watcher succeeds', async () => {
    const d = defaults();
    const events = [
      { id: 1, label: 'First Event' },
      { id: 2, label: 'Second Event' },
    ];
    const result = await runWatcher({ watcher: createTestWatcher('w', events), ...d });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.label).toBe('First Event');
      expect(result.value[0]?.needsAttention).toBe(false);
    }
  });

  it('returns empty ok when no events are produced', async () => {
    const d = defaults();
    const result = await runWatcher({ watcher: createTestWatcher('empty', []), ...d });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toHaveLength(0);
  });
});

describe('runWatcher – before_watch halt', () => {
  it('returns empty ok when before_watch side-effect halts', async () => {
    const d = defaults();
    const halt: SideEffectDefinition = {
      id: 'halt-before',
      phase: 'before_watch',
      handler: (): Promise<{ readonly halt: true }> => Promise.resolve({ halt: true }),
    };
    const watcher = createTestWatcher('halt', [{ id: 1, label: 'E' }], {
      sideEffects: [halt],
    });
    const result = await runWatcher({ watcher, ...d });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toHaveLength(0);
  });
});

describe('runWatcher – side effect ordering', () => {
  it('calls before_watch and after_watch side-effects in order', async () => {
    const d = defaults();
    const callOrder: string[] = [];
    const before: SideEffectDefinition = {
      id: 'before',
      phase: 'before_watch',
      handler: (): Promise<undefined> => {
        callOrder.push('before');
        return Promise.resolve(undefined);
      },
    };
    const after: SideEffectDefinition = {
      id: 'after',
      phase: 'after_watch',
      handler: (): Promise<undefined> => {
        callOrder.push('after');
        return Promise.resolve(undefined);
      },
    };
    const watcher = createTestWatcher('order', [{ id: 1, label: 'E' }], {
      sideEffects: [before, after],
    });
    await runWatcher({ watcher, ...d });
    expect(callOrder).toEqual(['before', 'after']);
  });
});

describe('runWatcher – hydration failure', () => {
  it('returns err when a hydrator fails', async () => {
    const d = defaults();
    const failHydrator: HydratorDefinition = {
      id: 'fail-hydrate',
      name: 'Failing Hydrator',
      description: 'Always rejects',
      hydrate: (): Promise<readonly never[]> => Promise.reject(new Error('hydration failed')),
    };
    const watcher = createTestWatcher('h-fail', [{ id: 1, label: 'E' }], {
      hydrators: [failHydrator],
    });
    const result = await runWatcher({ watcher, ...d });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain('hydration failed');
  });
});

describe('runWatcher – error handling', () => {
  it('returns err when watch() rejects', async () => {
    const d = defaults();
    const result = await runWatcher({ watcher: createFailingWatcher(), ...d });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.watcherId).toBe('failing');
      expect(result.error.message).toContain('Watch failed');
    }
  });
});
