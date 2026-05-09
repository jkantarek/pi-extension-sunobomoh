import type { EntryId } from '../core/brands.js';

export interface SteeringConfig {
  readonly promoteThreshold: number;
  readonly demoteThreshold: number;
  readonly recencyDecayHalfLifeHours: number;
  readonly llmSteering: boolean;
  readonly llmBorderlineLimit: number;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * expect(DEFAULT_STEERING_CONFIG.promoteThreshold).toBe(60);
 * expect(DEFAULT_STEERING_CONFIG.demoteThreshold).toBe(20);
 * expect(DEFAULT_STEERING_CONFIG.recencyDecayHalfLifeHours).toBe(24);
 * expect(DEFAULT_STEERING_CONFIG.promoteThreshold > DEFAULT_STEERING_CONFIG.demoteThreshold).toBe(true);
 * ```
 */
export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  promoteThreshold: 60,
  demoteThreshold: 20,
  recencyDecayHalfLifeHours: 24,
  llmSteering: false,
  llmBorderlineLimit: 10,
};

export interface AttentionScore {
  readonly entryId: EntryId;
  readonly score: number;
  readonly tags: readonly string[];
}

export interface LlmOverride {
  readonly entryId: EntryId;
  readonly needsAttention: boolean;
  readonly reason?: string;
}

export interface SteeringResult {
  readonly promoted: readonly EntryId[];
  readonly demoted: readonly EntryId[];
  readonly unchanged: readonly EntryId[];
  readonly llmAssisted: boolean;
}

export type LlmSteeringStrategy = (
  borderlineEntries: readonly AttentionScore[],
  signal: AbortSignal,
) => Promise<readonly LlmOverride[]>;
