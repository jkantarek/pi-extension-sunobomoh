import type { IsoTimestamp } from '../core/brands.js';
import type { SchedulerConfig } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { toIsoTimestamp } = await import('../core/brands.js');
 * const cfg = { intervalMinutes: 10, steeringIntervalMinutes: 60,
 *               maxConcurrentWatchers: 3, timeoutMs: 30_000 };
 * const base = new Date('2026-05-07T10:00:00Z');
 * const now  = toIsoTimestamp(base);
 *
 * // First run — no previous steering
 * expect(shouldRunSteering(undefined, now, cfg)).toBe(true);
 *
 * // Just ran — not yet due
 * expect(shouldRunSteering(now, now, cfg)).toBe(false);
 *
 * // Exactly 60 min later — due
 * const plus60 = toIsoTimestamp(new Date(base.getTime() + 60 * 60_000));
 * expect(shouldRunSteering(now, plus60, cfg)).toBe(true);
 *
 * // 59 min 59 sec later — not yet due
 * const almostDue = toIsoTimestamp(new Date(base.getTime() + (60 * 60_000 - 1000)));
 * expect(shouldRunSteering(now, almostDue, cfg)).toBe(false);
 * ```
 */
export const shouldRunSteering = (
  lastSteeringAt: IsoTimestamp | undefined,
  now: IsoTimestamp,
  config: SchedulerConfig,
): boolean => {
  if (lastSteeringAt === undefined) return true;
  const intervalMs = config.steeringIntervalMinutes * 60_000;
  return new Date(now).getTime() - new Date(lastSteeringAt).getTime() >= intervalMs;
};
