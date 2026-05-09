import type { Clock } from '../core/ports.js';
import { toError } from '../core/errors.js';
import type { Registry } from '../core/registry.js';
import type { TagDefinition } from '../tags/types.js';
import type { StateStoreAPI } from '../state/store.js';
import type {
  SteeringConfig,
  SteererAPI,
  SteeringResult,
  LlmSteeringStrategy,
  AttentionScore,
  LlmOverride,
} from './types.js';
import { scoreEntry } from './score-entry.js';
import { isPromotable, isDemotable } from './classify.js';
import { ok, err, type Result } from '../core/result.js';
import { createSystemClock } from '../core/ports.js';
import { defaultIdFactory } from '../core/ids.js';
import type { EntryId, IsoTimestamp } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';
import { buildPromotions, buildDemotions, buildOverrides, type StatePatch } from './patches.js';

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

// eslint-disable-next-line max-lines-per-function -- Orchestration: strategy call + limit check + map
const applyLlm = async (
  ids: readonly EntryId[],
  store: StateStoreAPI,
  strategy: LlmSteeringStrategy,
  config: SteeringConfig,
  signal: AbortSignal,
): Promise<readonly LlmOverride[]> => {
  const result = await strategy(
    ids
      .slice(0, config.llmBorderlineLimit)
      .map((id) => store.model.byId.get(id))
      .filter((e): e is StateEntry => e !== undefined),
    signal,
  );
  return result.ok ? result.value : [];
};

interface SteeringRunLine {
  readonly type: 'steering_run';
  readonly id: string;
  readonly timestamp: IsoTimestamp;
  readonly completedAt: IsoTimestamp;
  readonly promoted: readonly EntryId[];
  readonly demoted: readonly EntryId[];
  readonly unchanged: readonly EntryId[];
  readonly llmAssisted: boolean;
}

// eslint-disable-next-line max-lines-per-function -- Pure factory: object construction with 8 fields
const buildSteeringRun = (
  p: readonly EntryId[],
  d: readonly EntryId[],
  b: readonly EntryId[],
  llm: boolean,
  n: IsoTimestamp,
): SteeringRunLine => ({
  type: 'steering_run' as const,
  id: defaultIdFactory.next(),
  timestamp: n,
  completedAt: n,
  promoted: p,
  demoted: d,
  unchanged: b,
  llmAssisted: llm,
});

const scoreAllEntries = (
  store: StateStoreAPI,
  tagRegistry: Registry<TagDefinition>,
  config: SteeringConfig,
  now: IsoTimestamp,
): AttentionScore[] =>
  Array.from(store.model.byId.values()).map((e) => scoreEntry(e, tagRegistry, config, now));

const getLlmOverrides = async (
  borderline: readonly EntryId[],
  config: SteeringConfig,
  llmStrategy: LlmSteeringStrategy | undefined,
  store: StateStoreAPI,
  signal: AbortSignal,
): Promise<readonly LlmOverride[]> =>
  config.llmSteering && llmStrategy !== undefined && borderline.length > 0
    ? await applyLlm(borderline, store, llmStrategy, config, signal)
    : [];

// eslint-disable-next-line max-lines-per-function -- Array concatenation: 3 patch builders
const buildAllPatches = (
  promoted: readonly EntryId[],
  demoted: readonly EntryId[],
  llmOverrides: readonly LlmOverride[],
  store: StateStoreAPI,
  now: IsoTimestamp,
): readonly StatePatch[] => [
  ...buildPromotions(promoted, store, now),
  ...buildDemotions(demoted, store, now),
  ...buildOverrides(llmOverrides, store, now),
];

// eslint-disable-next-line max-lines-per-function -- Factory closure pattern: state + run method
export const createSteerer = (
  config: SteeringConfig,
  tagRegistry: Registry<TagDefinition>,
  store: StateStoreAPI,
  llmStrategy?: LlmSteeringStrategy,
  clock: Clock = createSystemClock(),
): SteererAPI => ({
  // eslint-disable-next-line max-lines-per-function -- Orchestration: score + classify + llm + patch + append
  run: async (signal: AbortSignal): Promise<Result<SteeringResult>> => {
    try {
      const now = clock.now();
      const { promoted, demoted, borderline } = classifyEntries(
        scoreAllEntries(store, tagRegistry, config, now),
        config,
      );
      const llmOverrides = await getLlmOverrides(borderline, config, llmStrategy, store, signal);
      const appendResult = await store.append([
        ...buildAllPatches(promoted, demoted, llmOverrides, store, now),
        buildSteeringRun(promoted, demoted, borderline, llmOverrides.length > 0, now),
      ]);
      return appendResult.ok
        ? ok({ promoted, demoted, borderline, llmOverrides })
        : err(appendResult.error);
    } catch (e) {
      return err(toError(e));
    }
  },
});
