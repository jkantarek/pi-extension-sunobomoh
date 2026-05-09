import { Type } from 'typebox';
import type { StateStoreAPI } from '../state/store.js';
import type { SteererAPI } from '../steering/types.js';
import { createStateQuery } from '../state/query.js';
import { isOk } from '../core/result.js';
import { unsafeTagId, unsafeWatcherId } from '../core/brands.js';
import { defaultIdFactory } from '../core/ids.js';

export interface ToolDefinition {
  readonly name: string;
  readonly parameters: unknown;
  execute(params: unknown): Promise<{ content: string }>;
}

/* eslint-disable max-lines-per-function -- Tool builder with query assembly */
export function buildWatchQueryTool(store: StateStoreAPI): ToolDefinition {
  return {
    name: 'watch_query',
    parameters: Type.Object({
      tagId: Type.Optional(Type.String()),
      watcherId: Type.Optional(Type.String()),
      needsAttention: Type.Optional(Type.Boolean()),
      since: Type.Optional(Type.String()),
      until: Type.Optional(Type.String()),
    }),
    execute: (params: unknown): Promise<{ content: string }> => {
      const p = params as {
        tagId?: string;
        watcherId?: string;
        needsAttention?: boolean;
        since?: string;
        until?: string;
      };
      let query = createStateQuery(store.model);
      if (p.tagId !== undefined) query = query.byTag(unsafeTagId(p.tagId));
      if (p.watcherId !== undefined) query = query.byWatcher(unsafeWatcherId(p.watcherId));
      if (p.needsAttention !== undefined) query = query.needsAttention(p.needsAttention);
      if (p.since !== undefined) query = query.since(p.since);
      if (p.until !== undefined) query = query.until(p.until);
      const results = query.execute();
      return Promise.resolve({ content: `Found ${String(results.length)} entries` });
    },
  };
}

/* eslint-disable max-lines-per-function -- Tool builder with patch construction */
export function buildMarkAttentionTool(store: StateStoreAPI): ToolDefinition {
  return {
    name: 'watch_mark_attention',
    parameters: Type.Object({
      entryIds: Type.Array(Type.String()),
      needsAttention: Type.Boolean(),
    }),
    execute: async (params: unknown): Promise<{ content: string }> => {
      const p = params as { entryIds: string[]; needsAttention: boolean };
      const nowTs = new Date().toISOString();
      const patches = p.entryIds.map((targetId) => ({
        type: 'state_patch' as const,
        id: defaultIdFactory.nextRaw(),
        targetId,
        timestamp: nowTs,
        patch: { needsAttention: p.needsAttention },
      }));
      const result = await store.append(patches);
      if (!isOk(result)) return { content: 'Failed to mark entries' };
      return { content: `Marked ${String(p.entryIds.length)} entries` };
    },
  };
}

/* eslint-disable max-lines-per-function -- Tool builder with early return pattern */
export function buildTriggerSteerTool(steerer: SteererAPI): ToolDefinition {
  return {
    name: 'watch_trigger_steer',
    parameters: Type.Object({}),
    execute: async (): Promise<{ content: string }> => {
      const result = await steerer.run(new AbortController().signal);
      if (!isOk(result)) return { content: 'Failed to run steering' };
      const { promoted, demoted, llmError } = result.value;
      const note = llmError !== undefined ? ` (LLM unavailable: ${llmError.message})` : '';
      return {
        content: `Promoted: ${String(promoted.length)}, Demoted: ${String(demoted.length)}${note}`,
      };
    },
  };
}
