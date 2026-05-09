import type { IsoTimestamp } from '../core/brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_SCHEDULER_CONFIG } = await import('../scheduler/scheduler.js');
 * expect(DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(10);
 * expect(DEFAULT_SCHEDULER_CONFIG.steeringIntervalMinutes % DEFAULT_SCHEDULER_CONFIG.intervalMinutes).toBe(0);
 * expect(DEFAULT_SCHEDULER_CONFIG.maxConcurrentWatchers).toBe(3);
 * ```
 */
export interface SchedulerConfig {
  readonly intervalMinutes: number;
  readonly steeringIntervalMinutes: number;
  readonly maxConcurrentWatchers: number;
  readonly timeoutMs: number;
}

export interface SchedulerState {
  readonly running: boolean;
  readonly lastTickAt?: IsoTimestamp;
  readonly lastSteeringAt?: IsoTimestamp;
  readonly nextTickAt?: IsoTimestamp;
  readonly tickCount: number;
}

export interface SchedulerAPI {
  start(): void;
  stop(): void;
  triggerTick(): Promise<void>;
  triggerSteering(): Promise<void>;
  readonly state: SchedulerState;
}
