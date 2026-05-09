import type { StateEntry } from '../state/types.js';

export interface HydratorDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  hydrate(entries: readonly StateEntry[], signal: AbortSignal): Promise<readonly StateEntry[]>;
}
