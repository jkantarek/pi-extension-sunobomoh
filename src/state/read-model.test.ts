import { describe, it, expect } from 'vitest';
import { emptyModel, projectLine } from './read-model.js';
import { makeTestEntryJson } from './test-fixtures.js';
import type { EntryId } from '../core/brands.js';

describe('projectLine – state_entry', () => {
  it('adds entry to byId, byTag, bySourceId and increments entryCount', () => {
    const json = makeTestEntryJson({ tags: ['urgent', 'needs-review'] });
    const model = projectLine(emptyModel(), json);

    expect(model.entryCount).toBe(1);
    expect(model.byId.size).toBe(1);
    expect(model.byId.get(json.id as EntryId)?.label).toBe('Test Entry');
    expect(model.byTag.get('urgent' as never)).toContain(json.id);
    expect(model.byTag.get('needs-review' as never)).toContain(json.id);
    expect(model.bySourceId.get('test-watcher' as never)).toContain(json.id);
  });

  it('adds entry to needsAttention when needsAttention is true', () => {
    const json = makeTestEntryJson({ needsAttention: true });
    const model = projectLine(emptyModel(), json);

    expect(model.needsAttention.size).toBe(1);
    expect(model.needsAttention.has(json.id as EntryId)).toBe(true);
  });

  it('does not add to needsAttention when needsAttention is false', () => {
    const json = makeTestEntryJson({ needsAttention: false });
    const model = projectLine(emptyModel(), json);

    expect(model.needsAttention.size).toBe(0);
  });
});

describe('projectLine – state_patch', () => {
  it('patches needsAttention on existing entry', () => {
    const entryJson = makeTestEntryJson({ needsAttention: false });
    const model1 = projectLine(emptyModel(), entryJson);

    const patch = {
      type: 'state_patch' as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FBB',
      targetId: entryJson.id,
      timestamp: '2026-05-07T11:00:00Z',
      patch: { needsAttention: true },
    };
    const model2 = projectLine(model1, patch);

    expect(model2.needsAttention.has(entryJson.id as EntryId)).toBe(true);
    expect(model2.byId.get(entryJson.id as EntryId)?.needsAttention).toBe(true);
  });

  it('removes from needsAttention when patched to false', () => {
    const entryJson = makeTestEntryJson({ needsAttention: true });
    const model1 = projectLine(emptyModel(), entryJson);
    expect(model1.needsAttention.size).toBe(1);

    const patch = {
      type: 'state_patch' as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FBB',
      targetId: entryJson.id,
      timestamp: '2026-05-07T11:00:00Z',
      patch: { needsAttention: false },
    };
    const model2 = projectLine(model1, patch);

    expect(model2.needsAttention.size).toBe(0);
    expect(model2.byId.get(entryJson.id as EntryId)?.needsAttention).toBe(false);
  });

  it('ignores patch for unknown targetId', () => {
    const model = projectLine(emptyModel(), makeTestEntryJson());
    const patch = {
      type: 'state_patch' as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FBB',
      targetId: 'nonexistent-id',
      timestamp: '2026-05-07T11:00:00Z',
      patch: { needsAttention: true },
    };
    const model2 = projectLine(model, patch);
    expect(model2.entryCount).toBe(model.entryCount);
    expect(model2.needsAttention.size).toBe(0);
  });
});

describe('projectLine – applyPatch', () => {
  it('patches attentionScore on existing entry', () => {
    const entryJson = makeTestEntryJson();
    const model1 = projectLine(emptyModel(), entryJson);
    const patch = {
      type: 'state_patch' as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FDD',
      targetId: entryJson.id,
      timestamp: '2026-05-07T11:00:00Z',
      patch: { attentionScore: 0.9 },
    };
    const model2 = projectLine(model1, patch);
    expect(model2.byId.get(entryJson.id as EntryId)?.attentionScore).toBe(0.9);
  });

  it('patches tags on existing entry', () => {
    const entryJson = makeTestEntryJson({ tags: ['urgent'] });
    const model1 = projectLine(emptyModel(), entryJson);
    const patch = {
      type: 'state_patch' as const,
      id: '01ARZ3NDEKTSV4RRFFQ69G5FCC',
      targetId: entryJson.id,
      timestamp: '2026-05-07T11:00:00Z',
      patch: { tags: ['low-priority'] },
    };
    const model2 = projectLine(model1, patch);
    const updated = model2.byId.get(entryJson.id as EntryId);
    expect(updated?.tags).toContain('low-priority' as never);
    expect(updated?.tags).not.toContain('urgent' as never);
  });
});

describe('projectLine – steering/scheduler', () => {
  it('preserves lastSteeringRun when projecting a subsequent state_entry', () => {
    const steering = {
      type: 'steering_run' as const,
      id: 's1',
      timestamp: '2026-05-07T11:00:00Z',
      completedAt: '2026-05-07T11:00:01Z',
      promoted: [],
      demoted: [],
      unchanged: [],
      llmAssisted: false,
    };
    const model1 = projectLine(emptyModel(), steering);
    const model2 = projectLine(model1, makeTestEntryJson());
    expect(model2.lastSteeringRun?.id).toBe('s1');
    expect(model2.entryCount).toBe(1);
  });
});
