import type { SchedulerState } from './types.js';
import type { IsoTimestamp } from '../core/brands.js';
import { shouldRunSteering } from './should-steer.js';
import type { SchedulerConfig } from './types.js';

export const updateStateAfterTick = (state: SchedulerState, now: IsoTimestamp): SchedulerState => ({
  ...state,
  lastTickAt: now,
  tickCount: state.tickCount + 1,
});

export const updateStateAfterSteering = (
  state: SchedulerState,
  now: IsoTimestamp,
): SchedulerState => ({
  ...state,
  lastSteeringAt: now,
});

export const scheduleNextTick = (
  handle: NodeJS.Timeout | undefined,
  tick: () => Promise<void>,
  intervalMs: number,
): NodeJS.Timeout => {
  if (handle !== undefined) clearTimeout(handle);
  return setTimeout(() => void tick(), intervalMs);
};

export const checkIfSteeringDue = (
  state: SchedulerState,
  now: IsoTimestamp,
  config: SchedulerConfig,
): boolean => shouldRunSteering(state.lastSteeringAt, now, config);
