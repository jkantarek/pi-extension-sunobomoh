import type { SteeringConfig } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_STEERING_CONFIG } = await import('./types.js');
 *
 * expect(isPromotable(70, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isPromotable(60, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isPromotable(59, DEFAULT_STEERING_CONFIG)).toBe(false);
 *
 * expect(isDemotable(15, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isDemotable(20, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isDemotable(21, DEFAULT_STEERING_CONFIG)).toBe(false);
 *
 * expect(isBorderline(30, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isBorderline(50, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isBorderline(19, DEFAULT_STEERING_CONFIG)).toBe(false);
 * expect(isBorderline(61, DEFAULT_STEERING_CONFIG)).toBe(false);
 * ```
 */
export const isPromotable = (score: number, config: SteeringConfig): boolean =>
  score >= config.promoteThreshold;

export const isDemotable = (score: number, config: SteeringConfig): boolean =>
  score <= config.demoteThreshold;

export const isBorderline = (score: number, config: SteeringConfig): boolean =>
  score > config.demoteThreshold && score < config.promoteThreshold;
