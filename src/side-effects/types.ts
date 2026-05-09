import type { WatcherId } from '../core/brands.js';
import type { StateEntry } from '../state/types.js';

export type CallbackPhase =
  | 'before_watch'
  | 'after_watch'
  | 'before_hydrate'
  | 'after_hydrate'
  | 'before_steer'
  | 'after_steer';

export interface SideEffectContext {
  readonly phase: CallbackPhase;
  readonly watcherId: WatcherId;
  readonly entries: readonly StateEntry[];
  readonly config: unknown;
  readonly signal: AbortSignal;
}

export interface SideEffectResult {
  readonly halt?: boolean;
}

export interface SideEffectDefinition {
  readonly id: string;
  readonly phase: CallbackPhase;
  readonly handler: (ctx: SideEffectContext) => Promise<SideEffectResult | undefined>;
}
