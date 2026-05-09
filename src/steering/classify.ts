import type { SteeringConfig, AttentionScore } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_STEERING_CONFIG } = await import('./steerer.js');
 * const { unsafeEntryId } = await import('../core/brands.js');
 *
 * const high: AttentionScore = { entryId: unsafeEntryId('e1'), score: 70, breakdown: [], recencyFactor: 1, decision: 'promote' };
 * const low: AttentionScore = { entryId: unsafeEntryId('e2'), score: 10, breakdown: [], recencyFactor: 1, decision: 'demote' };
 * const middle: AttentionScore = { entryId: unsafeEntryId('e3'), score: 40, breakdown: [], recencyFactor: 1, decision: 'borderline' };
 *
 * expect(isPromotable(high, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isDemotable(low, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isBorderline(middle, DEFAULT_STEERING_CONFIG)).toBe(true);
 * expect(isPromotable(middle, DEFAULT_STEERING_CONFIG)).toBe(false);
 * expect(isDemotable(middle, DEFAULT_STEERING_CONFIG)).toBe(false);
 * ```
 */
export const isPromotable = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score >= c.promoteThreshold;

export const isDemotable = (s: AttentionScore, c: SteeringConfig): boolean =>
  s.score <= c.demoteThreshold;

export const isBorderline = (s: AttentionScore, c: SteeringConfig): boolean =>
  !isPromotable(s, c) && !isDemotable(s, c);
