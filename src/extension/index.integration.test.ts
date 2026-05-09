/* eslint-disable max-lines, max-lines-per-function, complexity -- integration test file */
import { describe, it, expect, beforeEach } from 'vitest';
import { getSunobomoh, _setSunobomohInstance } from './api.js';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { Result } from '../core/result.js';
import type { SteeringOutcome } from '../steering/types.js';
import { err } from '../core/result.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { default: factory } = await import('./index.js');
 * const mockPi = createTestPiContext();
 * factory(mockPi);
 * const api = getSunobomoh();
 * expect(api).toBeDefined();
 * ```
 */
function createTestPiContext(): ExtensionAPI {
  /* eslint-disable @typescript-eslint/no-empty-function -- test stub */
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: (event: string, handler: (...args: unknown[]) => void): void => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    },
    registerTool: (): void => {},
    registerCommand: (): void => {},
    appendEntry: (): void => {},
    sendUserMessage: async (): Promise<void> => {},
    events: { on: (): void => {}, emit: (): void => {} },
    ui: { setWidget: (): void => {}, setStatus: (): void => {} },
    _getHandlers: () => handlers,
  } as unknown as ExtensionAPI;
  /* eslint-enable @typescript-eslint/no-empty-function */
}

describe('extension factory integration', () => {
  beforeEach(() => {
    _setSunobomohInstance(undefined);
  });

  it('getSunobomoh returns undefined before factory loads', () => {
    const beforeLoad = getSunobomoh();
    expect(beforeLoad).toBeUndefined();
  });

  it('getSunobomoh returns the API after factory loads', async () => {
    const { default: factory } = await import('./index.js');
    expect(typeof factory).toBe('function');

    const mockPi = createTestPiContext();
    factory(mockPi);

    const afterLoad = getSunobomoh();
    expect(afterLoad).toBeDefined();
    const state = afterLoad?.schedulerState as { running: boolean };
    expect(state.running).toBe(false);
  });

  it('registers session_start and session_shutdown handlers', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const handlers = (
      mockPi as unknown as {
        _getHandlers: () => Record<string, unknown[]>;
      }
    )._getHandlers();
    expect(handlers['session_start']).toBeDefined();
    expect(handlers['session_start']?.length).toBeGreaterThan(0);
    expect(handlers['session_shutdown']).toBeDefined();
    expect(handlers['session_shutdown']?.length).toBeGreaterThan(0);
  });

  it('exposes API methods', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    expect(api).toBeDefined();
    expect(typeof api?.registerWatcher).toBe('function');
    expect(typeof api?.registerTag).toBe('function');
    expect(typeof api?.getRegisteredWatchers).toBe('function');
    expect(typeof api?.getAvailableBuiltins).toBe('function');
    expect(typeof api?.unregisterWatcher).toBe('function');
    expect(typeof api?.query).toBe('function');
    expect(typeof api?.triggerTick).toBe('function');
    expect(typeof api?.triggerSteering).toBe('function');
  });

  it('getAvailableBuiltins returns non-empty array', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const builtins = api?.getAvailableBuiltins();
    expect(Array.isArray(builtins)).toBe(true);
    expect(builtins?.length).toBeGreaterThan(0);
  });

  it('query returns a StateQuery instance', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const query = api?.query();
    expect(query).toBeDefined();
  });
});

describe('API method coverage', () => {
  it('registerWatcher calls watcherRegistry', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const mockDefinition = {
      id: 'test-watcher',
      name: 'Test',
      description: 'Test watcher',
      configSchema: {},
      watch: (): Promise<readonly unknown[]> => Promise.resolve([]),
      extractUri: (): string => 'test:///uri',
      extractLabel: (): string => 'label',
      extractTags: (): readonly string[] => [],
    };
    expect(() => api?.registerWatcher(mockDefinition, {})).not.toThrow();
  });

  it('registerTag calls tagRegistry', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const mockTag = {
      id: 'test-tag',
      label: 'Test Tag',
      description: 'A test tag',
      defaultStatus: 'active',
      outcomeSchema: {},
      attentionWeight: 5,
    };
    expect(() => api?.registerTag(mockTag)).not.toThrow();
  });

  it('unregisterWatcher is callable', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    expect(() => api?.unregisterWatcher('test-id')).not.toThrow();
  });

  it('triggerTick returns error when scheduler not started', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const result = await api?.triggerTick();
    expect(result?.ok).toBe(false);
  });

  it('triggerSteering calls steerer', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const result = await api?.triggerSteering();
    expect(result).toBeDefined();
  });

  it('session_start handler can be called', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const handlers = (
      mockPi as unknown as { _getHandlers: () => Record<string, unknown[]> }
    )._getHandlers();
    const startHandler = handlers['session_start']?.[0] as () => Promise<void>;
    await expect(startHandler()).resolves.not.toThrow();

    const api = getSunobomoh();
    const state = api?.schedulerState;
    expect(state?.tickCount).toBe(0);
  });

  it('session_shutdown handler can be called', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const handlers = (
      mockPi as unknown as { _getHandlers: () => Record<string, unknown[]> }
    )._getHandlers();
    const shutdownHandler = handlers['session_shutdown']?.[0] as () => void;
    expect(() => {
      shutdownHandler();
    }).not.toThrow();
  });
});

describe('API edge cases', () => {
  it('triggerTick succeeds after scheduler starts', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const handlers = (
      mockPi as unknown as { _getHandlers: () => Record<string, unknown[]> }
    )._getHandlers();
    const startHandler = handlers['session_start']?.[0] as () => Promise<void>;
    await startHandler();

    const api = getSunobomoh();
    const result: Result<void> = (await api?.triggerTick()) ?? err(new Error('API undefined'));
    expect(result.ok).toBe(true);
  });

  it('getRegisteredWatchers returns empty array', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const watchers = api?.getRegisteredWatchers();
    expect(Array.isArray(watchers)).toBe(true);
    expect(watchers?.length).toBe(0);
  });

  it('triggerSteering returns ok when steerer succeeds', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const result: Result<SteeringOutcome> =
      (await api?.triggerSteering()) ?? err(new Error('API undefined'));
    expect(result.ok).toBe(true);
  });
});

describe('API error paths', () => {
  it('triggerTick returns error when scheduler not started', async () => {
    const { default: factory } = await import('./index.js');
    const mockPi = createTestPiContext();
    factory(mockPi);

    const api = getSunobomoh();
    const result: Result<void> = (await api?.triggerTick()) ?? err(new Error('API undefined'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Scheduler not started');
    }
  });
});
