import type { Result } from '../core/result.js';
import { ok, err, isOk } from '../core/result.js';
import { toError } from '../core/errors.js';
import type { StateEntry } from '../state/types.js';
import type { HydratorDefinition } from './types.js';
import { assertHydrationInvariants } from './invariants.js';

export interface HydrationError {
  readonly hydratorId: string;
  readonly message: string;
  readonly entriesAtFailure: readonly StateEntry[];
}

const toHydrationError = (
  hydratorId: string,
  cause: unknown,
  entries: readonly StateEntry[],
): HydrationError => ({
  hydratorId,
  message: toError(cause).message,
  entriesAtFailure: entries,
});

const runStep = async (
  h: HydratorDefinition,
  before: readonly StateEntry[],
  signal: AbortSignal,
): Promise<readonly StateEntry[]> => {
  const after = await h.hydrate(before, signal);
  assertHydrationInvariants(h.id, before, after);
  return after;
};

const onStepFail =
  (h: HydratorDefinition, es: readonly StateEntry[]) =>
  (e: unknown): Result<readonly StateEntry[], HydrationError> =>
    err(toHydrationError(h.id, e, es));

const stepReduce = async (
  acc: Promise<Result<readonly StateEntry[], HydrationError>>,
  h: HydratorDefinition,
  signal: AbortSignal,
): Promise<Result<readonly StateEntry[], HydrationError>> => {
  const prev = await acc;
  if (!isOk(prev)) return prev;
  return runStep(h, prev.value, signal).then(ok, onStepFail(h, prev.value));
};

export const runHydrationPipeline = (
  hydrators: readonly HydratorDefinition[],
  entries: readonly StateEntry[],
  signal: AbortSignal,
): Promise<Result<readonly StateEntry[], HydrationError>> =>
  hydrators.reduce(
    (acc, h) => stepReduce(acc, h, signal),
    Promise.resolve(ok(entries) as Result<readonly StateEntry[], HydrationError>),
  );
