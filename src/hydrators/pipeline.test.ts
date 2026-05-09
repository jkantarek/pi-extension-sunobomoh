import { describe, it, expect } from 'vitest';
import { runHydrationPipeline } from './pipeline.js';
import type { HydratorDefinition } from './types.js';
import type { StateEntry } from '../state/types.js';
import { ok } from '../core/result.js';
import { createTestEntry } from './test-fixtures.js';

describe('runHydrationPipeline - empty hydrators', () => {
  it('returns ok(entries) when hydrators array is empty', async () => {
    const entries = [createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV')];
    const signal = new AbortController().signal;
    const result = await runHydrationPipeline([], entries, signal);
    expect(result).toEqual(ok(entries));
  });
});

describe('runHydrationPipeline - single hydrator', () => {
  it('enriches hydratedData when hydrator succeeds', async () => {
    const hydrator: HydratorDefinition = {
      id: 'enrich',
      name: 'Enricher',
      description: 'Adds extra field',
      hydrate: (entries: readonly StateEntry[]): Promise<readonly StateEntry[]> =>
        Promise.resolve(entries.map((e) => ({ ...e, hydratedData: { enriched: true } }))),
    };
    const entries = [createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV')];
    const signal = new AbortController().signal;
    const result = await runHydrationPipeline([hydrator], entries, signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.hydratedData).toEqual({ enriched: true });
    }
  });
});

describe('runHydrationPipeline - error handling', () => {
  it('returns err with entriesAtFailure when hydrator fails', async () => {
    const hydrator: HydratorDefinition = {
      id: 'fail',
      name: 'Failer',
      description: 'Throws error',
      hydrate: (): Promise<readonly StateEntry[]> => Promise.reject(new Error('boom')),
    };
    const entries = [createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV')];
    const signal = new AbortController().signal;
    const result = await runHydrationPipeline([hydrator], entries, signal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.hydratorId).toBe('fail');
      expect(result.error.entriesAtFailure).toEqual(entries);
      expect(result.error.message).toContain('boom');
    }
  });
  it('uses String() for non-Error thrown values', async () => {
    const throwNonError = (): Promise<readonly StateEntry[]> => {
      const n: unknown = 42;
      return Promise.reject(n); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
    };
    const h: HydratorDefinition = { id: 'x', name: 'x', description: 'x', hydrate: throwNonError };
    const r = await runHydrationPipeline([h], [], new AbortController().signal);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('42');
  });
});

describe('runHydrationPipeline - abort signal', () => {
  it('respects abort signal', async () => {
    const controller = new AbortController();
    const hydrator: HydratorDefinition = {
      id: 'slow',
      name: 'Slow',
      description: 'Checks signal',
      hydrate: (
        entries: readonly StateEntry[],
        signal: AbortSignal,
      ): Promise<readonly StateEntry[]> => {
        if (signal.aborted) return Promise.reject(new Error('aborted'));
        return Promise.resolve(entries);
      },
    };
    const entries = [createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV')];
    controller.abort();
    const result = await runHydrationPipeline([hydrator], entries, controller.signal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('aborted');
    }
  });
});

describe('runHydrationPipeline - multiple hydrators', () => {
  it('runs hydrators in sequence and preserves entry count', async () => {
    const h1: HydratorDefinition = {
      id: 'h1',
      name: 'H1',
      description: 'First',
      hydrate: (entries: readonly StateEntry[]): Promise<readonly StateEntry[]> =>
        Promise.resolve(entries.map((e) => ({ ...e, hydratedData: { step: 1 } }))),
    };
    const h2: HydratorDefinition = {
      id: 'h2',
      name: 'H2',
      description: 'Second',
      hydrate: (entries: readonly StateEntry[]): Promise<readonly StateEntry[]> =>
        Promise.resolve(
          entries.map((e) => ({
            ...e,
            hydratedData: { ...(e.hydratedData as object), step2: true },
          })),
        ),
    };
    const entries = [
      createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FBB'),
    ];
    const signal = new AbortController().signal;
    const result = await runHydrationPipeline([h1, h2], entries, signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.hydratedData).toMatchObject({ step: 1, step2: true });
    }
  });

  it('short-circuits: second hydrator skipped when first fails', async () => {
    let secondCalled = false;
    const fail: HydratorDefinition = {
      id: 'fail',
      name: 'F',
      description: 'd',
      hydrate: (): Promise<readonly never[]> => Promise.reject(new Error('first failed')),
    };
    const skip: HydratorDefinition = {
      id: 'skip',
      name: 'S',
      description: 'd',
      hydrate: (es: readonly StateEntry[]): Promise<readonly StateEntry[]> => {
        secondCalled = true;
        return Promise.resolve(es);
      },
    };
    const result = await runHydrationPipeline(
      [fail, skip],
      [createTestEntry('01ARZ3NDEKTSV4RRFFQ69G5FAV')],
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    expect(secondCalled).toBe(false);
  });
});
