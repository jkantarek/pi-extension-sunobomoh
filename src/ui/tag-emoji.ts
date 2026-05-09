import type { TagId } from '../core/brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_TAG_EMOJI, FALLBACK_EMOJI, createTagEmojiMap, emojiForTag } = await import('./tag-emoji.js');
 * const { unsafeTagId } = await import('../core/brands.js');
 *
 * // Built-in tags preserved
 * expect(DEFAULT_TAG_EMOJI.get('urgent')).toBe('⚠️');
 * expect(DEFAULT_TAG_EMOJI.get('needs-review')).toBe('👀');
 *
 * // Override replaces
 * const overrides = new Map([['urgent', '🚨']]);
 * const merged = createTagEmojiMap(overrides);
 * expect(merged.get('urgent')).toBe('🚨');
 * expect(merged.get('needs-review')).toBe('👀');
 *
 * // Custom tag added
 * const custom = new Map([['my-tag', '🎯']]);
 * const withCustom = createTagEmojiMap(custom);
 * expect(withCustom.get('my-tag')).toBe('🎯');
 *
 * // Unknown tag returns fallback
 * expect(emojiForTag(unsafeTagId('unknown'), DEFAULT_TAG_EMOJI)).toBe(FALLBACK_EMOJI);
 * expect(emojiForTag(unsafeTagId('urgent'), DEFAULT_TAG_EMOJI)).toBe('⚠️');
 * ```
 */
export const DEFAULT_TAG_EMOJI: ReadonlyMap<string, string> = new Map([
  ['urgent', '⚠️'],
  ['needs-review', '👀'],
  ['informational', 'ℹ️'],
  ['stale', '💤'],
]);
export const FALLBACK_EMOJI = '🔵';
export const createTagEmojiMap = (
  overrides: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> => new Map([...DEFAULT_TAG_EMOJI, ...overrides]);
export const emojiForTag = (tagId: TagId, map: ReadonlyMap<string, string>): string =>
  map.get(tagId) ?? FALLBACK_EMOJI;
