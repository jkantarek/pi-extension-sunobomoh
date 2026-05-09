import type { AgeColorName } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { relativeTime, ageColorName } = await import('./temporal.js');
 *
 * // relativeTime thresholds: s, m, h, d
 * expect(relativeTime(30_000)).toBe('30s');
 * expect(relativeTime(90_000)).toBe('2m');
 * expect(relativeTime(3_900_000)).toBe('1h');
 * expect(relativeTime(90_000_000)).toBe('1d');
 * expect(relativeTime(180_000_000)).toBe('2d');
 *
 * // ageColorName: fresh < 5m, recent < 1h, stale >= 1h
 * expect(ageColorName(60_000, false)).toBe('fresh');
 * expect(ageColorName(600_000, false)).toBe('recent');
 * expect(ageColorName(7_200_000, false)).toBe('stale');
 *
 * // needsAttention overrides to fresh
 * expect(ageColorName(7_200_000, true)).toBe('fresh');
 * ```
 */
const formatTime = (value: number, unit: string): string => `${String(Math.round(value))}${unit}`;

export const relativeTime = (ageMs: number): string => {
  const seconds = ageMs / 1000;
  if (seconds < 60) return formatTime(seconds, 's');
  const minutes = seconds / 60;
  if (minutes < 60) return formatTime(minutes, 'm');
  const hours = minutes / 60;
  if (hours < 24) return formatTime(hours, 'h');
  return formatTime(hours / 24, 'd');
};

export const ageColorName = (ageMs: number, needsAttention: boolean): AgeColorName => {
  if (needsAttention) return 'fresh';
  const minutes = ageMs / 60_000;
  if (minutes < 5) return 'fresh';
  if (minutes < 60) return 'recent';
  return 'stale';
};
