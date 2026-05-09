/**
 * @example
 * ```ts @import.meta.vitest
 * const { ok } = await import('../core/result.js');
 *
 * // Reset singleton state for test isolation
 * _setSunobomohInstance(undefined);
 * expect(getSunobomoh()).toBe(undefined);
 *
 * const fakeApi = {
 *   registerWatcher: () => {},
 *   registerTag: () => {},
 *   getRegisteredWatchers: () => [],
 *   getAvailableBuiltins: () => [],
 *   unregisterWatcher: () => {},
 *   query: () => ({ execute: () => [] }),
 *   triggerTick: async () => ok(undefined),
 *   triggerSteering: async () => ok(undefined),
 *   schedulerState: { running: false, tickCount: 0 },
 * };
 *
 * _setSunobomohInstance(fakeApi as never);
 * expect(getSunobomoh()).toBe(fakeApi);
 *
 * // Clean up
 * _setSunobomohInstance(undefined);
 * ```
 */

let instance: SunobomohAPI | undefined;

export const getSunobomoh = (): SunobomohAPI | undefined => instance;

export const _setSunobomohInstance = (api: SunobomohAPI | undefined): void => {
  instance = api;
};

import type { Result } from '../core/result.js';
import type { SchedulerState } from '../scheduler/types.js';
import type { SteeringOutcome } from '../steering/types.js';

export interface SunobomohAPI {
  registerWatcher: (definition: unknown, config: unknown) => void;
  registerTag: (definition: unknown) => void;
  getRegisteredWatchers: () => readonly unknown[];
  getAvailableBuiltins: () => readonly unknown[];
  unregisterWatcher: (id: unknown) => void;
  query: () => unknown;
  triggerTick: () => Promise<Result<void>>;
  triggerSteering: () => Promise<Result<SteeringOutcome>>;
  schedulerState: SchedulerState;
}
