import type { StateEntry, TagOutcome } from '../state/types.js';
import type { TagId, IsoTimestamp } from '../core/brands.js';
import {
  unsafeEntryId,
  unsafeWatcherId,
  unsafeResourceUri,
  unsafeTagId,
  unsafeIsoTimestamp,
} from '../core/brands.js';

const TS: IsoTimestamp = unsafeIsoTimestamp('2026-05-08T10:00:00Z');
const OUTCOMES: ReadonlyMap<TagId, TagOutcome> = new Map<TagId, TagOutcome>();

const ENTRY_BASE: Omit<StateEntry, 'id'> = {
  type: 'state_entry',
  sourceId: unsafeWatcherId('test-watcher'),
  sourceUri: unsafeResourceUri('test:///item'),
  label: 'Test Entry',
  timestamp: TS,
  tags: [unsafeTagId('informational')],
  outcomes: OUTCOMES,
  data: { foo: 'bar' },
  needsAttention: false,
  metadata: { watchedAt: TS },
};

export const createTestEntry = (id: string): StateEntry => ({
  ...ENTRY_BASE,
  id: unsafeEntryId(id),
});
