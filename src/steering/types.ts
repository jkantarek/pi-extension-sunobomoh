import type { EntryId } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import type { Result } from '../core/result.js';

export interface SteeringConfig {
  readonly promoteThreshold: number;
  readonly demoteThreshold: number;
  readonly recencyDecayHalfLifeHours: number;
  readonly llmSteering: boolean;
  readonly llmBorderlineLimit: number;
}

export interface AttentionScore {
  readonly entryId: EntryId;
  readonly score: number;
  readonly breakdown: readonly { tagId: string; contribution: number }[];
  readonly recencyFactor: number;
  readonly decision: 'promote' | 'demote' | 'borderline';
}

export interface LlmOverride {
  readonly entryId: EntryId;
  readonly decision: 'promote' | 'demote';
  readonly reason: string;
}

export interface SteeringOutcome {
  readonly promoted: readonly EntryId[];
  readonly demoted: readonly EntryId[];
  readonly borderline: readonly EntryId[];
  readonly usedLlm: boolean;
  readonly llmError?: Error;
}

export type LlmSteeringStrategy = (
  borderlineEntries: readonly StateEntry[],
  signal: AbortSignal,
) => Promise<Result<readonly LlmOverride[]>>;

export interface SteererAPI {
  run(signal: AbortSignal): Promise<Result<SteeringOutcome>>;
}
