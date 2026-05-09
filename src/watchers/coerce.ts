import type { WatcherDefinition } from './types.js';
import type { StateEntry } from '../state/types.js';
import type { Clock } from '../core/ports.js';
import type { IdFactory } from '../core/ids.js';

const extractIds = <TConfig, TEvent>(
  def: WatcherDefinition<TConfig, TEvent>,
  ids: IdFactory,
  clock: Clock,
): Pick<StateEntry, 'id' | 'sourceId' | 'timestamp'> => ({
  id: ids.next(),
  sourceId: def.id,
  timestamp: clock.now(),
});

const extractData = <TConfig, TEvent>(
  def: WatcherDefinition<TConfig, TEvent>,
  event: TEvent,
  config: TConfig,
): Pick<StateEntry, 'sourceUri' | 'label' | 'tags'> => ({
  sourceUri: def.extractUri(event, config),
  label: def.extractLabel(event, config),
  tags: def.extractTags(event, config),
});

const buildCoreFields = <TConfig, TEvent>(
  def: WatcherDefinition<TConfig, TEvent>,
  event: TEvent,
  config: TConfig,
  clock: Clock,
  ids: IdFactory,
): Pick<StateEntry, 'id' | 'sourceId' | 'timestamp' | 'sourceUri' | 'label' | 'tags'> => ({
  ...extractIds(def, ids, clock),
  ...extractData(def, event, config),
});

const buildRemainingFields = (
  event: unknown,
  now: ReturnType<Clock['now']>,
): Pick<StateEntry, 'type' | 'outcomes' | 'data' | 'needsAttention' | 'metadata'> => ({
  type: 'state_entry' as const,
  outcomes: new Map(),
  data: event,
  needsAttention: false,
  metadata: { watchedAt: now },
});

const createEntry = <TConfig, TEvent>(
  def: WatcherDefinition<TConfig, TEvent>,
  event: TEvent,
  config: TConfig,
  clock: Clock,
  ids: IdFactory,
): StateEntry => ({
  ...buildCoreFields(def, event, config, clock, ids),
  ...buildRemainingFields(event, clock.now()),
});

export const toStateEntry = <TConfig, TEvent>(
  event: TEvent,
  def: WatcherDefinition<TConfig, TEvent>,
  config: TConfig,
  clock: Clock,
  ids: IdFactory,
): StateEntry => createEntry(def, event, config, clock, ids);
