import type { StateEntryJson } from './types.js';

const BASE: StateEntryJson = {
  type: 'state_entry',
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  sourceId: 'test-watcher',
  sourceUri: 'file:///test/path',
  label: 'Test Entry',
  timestamp: '2026-05-07T10:00:00.000Z',
  tags: ['urgent'],
  outcomes: {},
  data: {},
  needsAttention: false,
  metadata: { watchedAt: '2026-05-07T10:00:00.000Z' },
};

export const makeTestEntryJson = (overrides: Partial<StateEntryJson> = {}): StateEntryJson => ({
  ...BASE,
  ...overrides,
});
