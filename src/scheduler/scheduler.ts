import type { Result } from '../core/result.js';
import type { Clock } from '../core/ports.js';
import type { StateEntry } from '../state/types.js';
import type { SchedulerConfig, SchedulerState, SchedulerAPI } from './types.js';
import {
  updateStateAfterTick,
  updateStateAfterSteering,
  scheduleNextTick,
  checkIfSteeringDue,
} from './tick-logic.js';

export type WatcherRunnerFn = (signal: AbortSignal) => Promise<Result<readonly StateEntry[]>>;
export type SteeringFn = (signal: AbortSignal) => Promise<Result<void>>;

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMinutes: 10,
  steeringIntervalMinutes: 60,
  maxConcurrentWatchers: 3,
  timeoutMs: 30_000,
};

// eslint-disable-next-line max-lines-per-function -- Factory closure pattern: state + 4 methods
export const createScheduler = (
  config: SchedulerConfig,
  runWatchers: WatcherRunnerFn,
  runSteering: SteeringFn,
  clock: Clock,
): SchedulerAPI => {
  let state: SchedulerState = { running: false, tickCount: 0 };
  let timeoutHandle: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;

  /* eslint-disable max-lines-per-function, complexity, @typescript-eslint/no-unnecessary-condition -- Orchestration: abort checks after async */
  const tick = async (): Promise<void> => {
    const signal = abortController?.signal;
    if (!signal || !state.running) return;
    state = updateStateAfterTick(state, clock.now());
    await runWatchers(signal);
    if (signal.aborted || !state.running) return;
    if (checkIfSteeringDue(state, clock.now(), config)) {
      await runSteering(signal);
      if (signal.aborted || !state.running) return;
      state = updateStateAfterSteering(state, clock.now());
    }
    if (signal.aborted || !state.running) return;
    timeoutHandle = scheduleNextTick(timeoutHandle, tick, config.intervalMinutes * 60_000);
    state = { ...state, nextTickAt: clock.now() };
  };

  const stop = (): void => {
    state = { ...state, running: false };
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
    if (abortController !== undefined) {
      abortController.abort();
      abortController = undefined;
    }
  };

  const triggerTick = async (): Promise<void> => {
    const controller = new AbortController();
    const now = clock.now();
    await runWatchers(controller.signal);
    if (checkIfSteeringDue(state, now, config)) {
      await runSteering(controller.signal);
      state = updateStateAfterSteering(state, now);
    }
  };

  return {
    start: (): void => {
      if (!state.running) {
        state = { ...state, running: true };
        abortController = new AbortController();
        void tick();
      }
    },
    stop,
    triggerTick,
    triggerSteering: async (): Promise<void> => {
      await runSteering(new AbortController().signal);
      state = updateStateAfterSteering(state, clock.now());
    },
    get state(): SchedulerState {
      return state;
    },
  };
};
