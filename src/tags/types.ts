import * as Type from 'typebox';
import type { TSchema } from 'typebox/type';
import type { TagId } from '../core/brands.js';

export const UNKNOWN_OUTCOME_SCHEMA: TSchema = Type.Unknown();

export interface TagDefinition {
  readonly id: TagId;
  readonly label: string;
  readonly description: string;
  readonly defaultStatus: 'pending' | 'active' | 'resolved' | 'dismissed';
  readonly outcomeSchema: TSchema;
  readonly attentionWeight: number;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const { Value } = await import('typebox/value');
 * expect(BUILTIN_TAGS.length).toBeGreaterThanOrEqual(4);
 * const urgent = BUILTIN_TAGS.find(t => t.id === 'urgent');
 * expect(urgent).toBeDefined();
 * expect(urgent?.attentionWeight).toBe(10);
 * const needsReview = BUILTIN_TAGS.find(t => t.id === 'needs-review');
 * expect(needsReview?.attentionWeight).toBe(7);
 * const informational = BUILTIN_TAGS.find(t => t.id === 'informational');
 * expect(informational?.attentionWeight).toBe(1);
 * const stale = BUILTIN_TAGS.find(t => t.id === 'stale');
 * expect(stale?.attentionWeight).toBe(0);
 * expect(Value.Check(UNKNOWN_OUTCOME_SCHEMA, 'any string')).toBe(true);
 * expect(Value.Check(UNKNOWN_OUTCOME_SCHEMA, { foo: 42 })).toBe(true);
 * expect(Value.Check(UNKNOWN_OUTCOME_SCHEMA, null)).toBe(true);
 * ```
 */
export const BUILTIN_TAGS: readonly TagDefinition[] = [
  {
    id: 'urgent' as TagId,
    label: 'Urgent',
    description: 'Requires immediate attention',
    defaultStatus: 'active',
    outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
    attentionWeight: 10,
  },
  {
    id: 'needs-review' as TagId,
    label: 'Needs Review',
    description: 'Requires review or decision',
    defaultStatus: 'pending',
    outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
    attentionWeight: 7,
  },
  {
    id: 'informational' as TagId,
    label: 'Informational',
    description: 'For awareness only',
    defaultStatus: 'pending',
    outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
    attentionWeight: 1,
  },
  {
    id: 'stale' as TagId,
    label: 'Stale',
    description: 'No longer relevant',
    defaultStatus: 'dismissed',
    outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
    attentionWeight: 0,
  },
];
