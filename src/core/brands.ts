import type { Result } from './result.js';
import { ok, err, isOk } from './result.js';

export type EntryId = string & { readonly _brand: 'EntryId' };
export type WatcherId = string & { readonly _brand: 'WatcherId' };
export type TagId = string & { readonly _brand: 'TagId' };
export type IsoTimestamp = string & { readonly _brand: 'IsoTimestamp' };
export type ResourceUri = string & { readonly _brand: 'ResourceUri' };

export { isOk };

/**
 * @example
 * ```ts @import.meta.vitest
 * const ts = toIsoTimestamp(new Date('2026-05-07T10:00:00Z'));
 * expect(typeof ts).toBe('string');
 * expect(ts).toBe('2026-05-07T10:00:00.000Z');
 *
 * const uri = toResourceUri('github:///owner/repo/issues/1');
 * expect(isOk(uri)).toBe(true);
 *
 * const bad = toResourceUri('not a uri!!');
 * expect(isOk(bad)).toBe(false);
 *
 * expect(typeof unsafeEntryId('01ABCDEF')).toBe('string');
 * expect(typeof unsafeWatcherId('01ABCDEF')).toBe('string');
 * expect(typeof unsafeTagId('urgent')).toBe('string');
 * ```
 */
export const toIsoTimestamp = (d: Date): IsoTimestamp => d.toISOString() as IsoTimestamp;

export const toResourceUri = (s: string): Result<ResourceUri> => {
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(s)) return ok(s as ResourceUri);
  return err(new Error(`Invalid ResourceUri: "${s}"`));
};

export const unsafeEntryId = (s: string): EntryId => s as EntryId;
export const unsafeWatcherId = (s: string): WatcherId => s as WatcherId;
export const unsafeTagId = (s: string): TagId => s as TagId;
