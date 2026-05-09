import type { TagId } from '../../core/brands.js';
import { unsafeTagId } from '../../core/brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * expect(mapLabelsToTags(['high'])).toEqual([unsafeTagId('urgent')]);
 * expect(mapLabelsToTags(['critical'])).toEqual([unsafeTagId('urgent')]);
 * expect(mapLabelsToTags(['bug'])).toEqual([unsafeTagId('needs-review')]);
 * expect(mapLabelsToTags([])).toEqual([unsafeTagId('informational')]);
 * ```
 */
export const mapLabelsToTags = (labels: readonly string[]): readonly TagId[] => {
  if (labels.length === 0) return [unsafeTagId('informational')];
  const urgent = ['high', 'critical'];
  if (labels.some((l) => urgent.includes(l))) return [unsafeTagId('urgent')];
  return [unsafeTagId('needs-review')];
};
