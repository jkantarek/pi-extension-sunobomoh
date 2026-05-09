import type { WatcherDefinition } from './types.js';
import type { SideEffectDefinition } from '../side-effects/types.js';
import type { HydratorDefinition } from '../hydrators/types.js';
import type { TagId, ResourceUri } from '../core/brands.js';
import { Type } from 'typebox';
import { unsafeWatcherId, unsafeTagId, unsafeResourceUri } from '../core/brands.js';

export interface TestEvent {
  readonly id: number;
  readonly label: string;
}

interface TestWatcherOptions {
  readonly hydrators?: readonly HydratorDefinition[];
  readonly sideEffects?: readonly SideEffectDefinition[];
}

type TWatcher = WatcherDefinition<object, TestEvent>;

const extractUri = (e: TestEvent): ResourceUri => unsafeResourceUri(`test://${String(e.id)}`);
const extractLabel = (e: TestEvent): string => e.label;
const extractTags = (): readonly TagId[] => [unsafeTagId('informational')];

const makeBase = (id: string, events: readonly TestEvent[]): TWatcher => ({
  id: unsafeWatcherId(id),
  name: `Test Watcher ${id}`,
  description: `Test watcher for ${id}`,
  configSchema: Type.Object({}),
  watch: (): Promise<readonly TestEvent[]> => Promise.resolve(events),
  extractUri,
  extractLabel,
  extractTags,
});

export const createFailingWatcher = (): TWatcher => ({
  id: unsafeWatcherId('failing'),
  name: 'Failing Watcher',
  description: 'Watcher that always rejects',
  configSchema: Type.Object({}),
  watch: (): Promise<readonly TestEvent[]> => Promise.reject(new Error('Watch failed')),
  extractUri,
  extractLabel,
  extractTags,
});

export const createTestWatcher = (
  id: string,
  events: readonly TestEvent[],
  opts?: TestWatcherOptions,
): TWatcher => ({
  ...makeBase(id, events),
  ...(opts?.hydrators ? { hydrators: opts.hydrators } : {}),
  ...(opts?.sideEffects ? { sideEffects: opts.sideEffects } : {}),
});
