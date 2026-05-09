import { describe, it, expect } from 'vitest';
import { parseStateEntry } from './parse.js';

const BASE_JSON = {
  type: 'state_entry' as const,
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  sourceId: 'w1',
  sourceUri: 'file:///path',
  label: 'Test',
  timestamp: '2026-05-07T10:00:00.000Z',
  tags: [],
  outcomes: {},
  data: {},
  needsAttention: false,
  metadata: { watchedAt: '2026-05-07T10:00:00.000Z' },
};

describe('parseStateEntry – optional fields', () => {
  it('maps tag outcome optional fields when present', () => {
    const result = parseStateEntry({
      ...BASE_JSON,
      outcomes: {
        urgent: {
          tagId: 'urgent',
          status: 'resolved',
          outcome: 'fixed',
          resolvedAt: '2026-05-07T11:00:00.000Z',
          notes: 'all good',
        },
      },
    });
    const o = result.outcomes.get('urgent' as never);
    expect(o?.outcome).toBe('fixed');
    expect(o?.notes).toBe('all good');
    expect(o?.resolvedAt).toBeDefined();
  });

  it('maps metadata optional fields when present', () => {
    const result = parseStateEntry({
      ...BASE_JSON,
      metadata: {
        watchedAt: '2026-05-07T10:00:00.000Z',
        hydratedAt: '2026-05-07T10:30:00.000Z',
        lastSteeringAt: '2026-05-07T11:00:00.000Z',
        steeringDecision: 'promoted',
      },
    });
    expect(result.metadata.hydratedAt).toBeDefined();
    expect(result.metadata.lastSteeringAt).toBeDefined();
    expect(result.metadata.steeringDecision).toBe('promoted');
  });

  it('maps hydratedData and attentionScore when present', () => {
    const result = parseStateEntry({
      ...BASE_JSON,
      hydratedData: { detail: 'extra' },
      attentionScore: 0.75,
    });
    expect(result.hydratedData).toEqual({ detail: 'extra' });
    expect(result.attentionScore).toBe(0.75);
  });
});
