import type { Clock } from '../core/ports.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type { StateStoreAPI } from '../state/store.js';
import type {
  SteeringConfig,
  SteererAPI,
  SteeringOutcome,
  LlmSteeringStrategy,
  AttentionScore,
  LlmOverride,
} from './types.js';
import { scoreEntry } from './score-entry.js';
import { isPromotable, isDemotable } from './classify.js';
import { ok, err, type Result } from '../core/result.js';
import { createSystemClock } from '../core/ports.js';
import type { EntryId, IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import { buildAllPatches, buildSteeringRun, buildOutcome } from './patches.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_STEERING_CONFIG } = await import('./steerer.js');
 * expect(DEFAULT_STEERING_CONFIG.promoteThreshold).toBeGreaterThan(DEFAULT_STEERING_CONFIG.demoteThreshold);
 * ```
 */
export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  promoteThreshold: 60,
  demoteThreshold: 20,
  recencyDecayHalfLifeHours: 24,
  llmSteering: false,
  llmBorderlineLimit: 10,
};

// eslint-disable-next-line max-lines-per-function -- Pure fold: reduce over 3-way classification
const classifyEntries = (
  scores: readonly AttentionScore[],
  config: SteeringConfig,
): { promoted: EntryId[]; demoted: EntryId[]; borderline: EntryId[] } =>
  scores.reduce(
    (acc, s) => {
      if (isPromotable(s, config)) acc.promoted.push(s.entryId);
      else if (isDemotable(s, config)) acc.demoted.push(s.entryId);
      else acc.borderline.push(s.entryId);
      return acc;
    },
    { promoted: [] as EntryId[], demoted: [] as EntryId[], borderline: [] as EntryId[] },
  );

interface LlmResult {
  readonly overrides: readonly LlmOverride[];
  readonly error?: Error;
}

// eslint-disable-next-line max-lines-per-function -- Orchestration: strategy call + limit check + map
const applyLlm = async (
  ids: readonly EntryId[],
  store: StateStoreAPI,
  strategy: LlmSteeringStrategy,
  config: SteeringConfig,
  signal: AbortSignal,
): Promise<LlmResult> => {
  const result = await strategy(
    ids
      .slice(0, config.llmBorderlineLimit)
      .map((id) => store.model.byId.get(id))
      .filter((e): e is StateEntry => e !== undefined),
    signal,
  );
  if (result.ok) return { overrides: result.value };
  const raw = result.error;
  return { overrides: [], error: raw instanceof Error ? raw : new Error(String(raw)) };
};

const scoreAllEntries = (
  store: StateStoreAPI,
  tagRegistry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp,
): AttentionScore[] =>
  Array.from(store.model.byId.values()).map((e) => scoreEntry(e, tagRegistry, config, now));

const getLlmOverrides = (
  borderline: readonly EntryId[],
  config: SteeringConfig,
  llmStrategy: LlmSteeringStrategy | undefined,
  store: StateStoreAPI,
  signal: AbortSignal,
): Promise<LlmResult> =>
  config.llmSteering && llmStrategy !== undefined && borderline.length > 0
    ? applyLlm(borderline, store, llmStrategy, config, signal)
    : Promise.resolve({ overrides: [] });

// eslint-disable-next-line max-lines-per-function -- Factory: single method in object
export const createSteerer = (
  config: SteeringConfig,
  tagRegistry: Registry<TagDefinition>,
  store: StateStoreAPI,
  llmStrategy?: LlmSteeringStrategy,
  clock: Clock = createSystemClock(),
): SteererAPI => ({
  // eslint-disable-next-line max-lines-per-function -- Orchestration: classify + llm + append + outcome
  run: async (signal: AbortSignal): Promise<Result<SteeringOutcome>> => {
    const now = clock.now();
    const { promoted, demoted, borderline } = classifyEntries(
      scoreAllEntries(store, tagRegistry, config, now),
      config,
    );
    const { overrides, error: llmError } = await getLlmOverrides(
      borderline,
      config,
      llmStrategy,
      store,
      signal,
    );
    const appendResult = await store.append([
      ...buildAllPatches(promoted, demoted, overrides, store, now),
      buildSteeringRun(promoted, demoted, borderline, overrides.length > 0, now),
    ]);
    const usedLlm = overrides.length > 0;
    return appendResult.ok
      ? ok(buildOutcome(promoted, demoted, borderline, usedLlm, llmError))
      : err(appendResult.error);
  },
});
