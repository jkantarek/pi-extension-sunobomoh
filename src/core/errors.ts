/**
 * @example
 * ```ts @import.meta.vitest
 * const { toError } = await import('./errors.js');
 *
 * // Error instances pass through unchanged
 * const e = new Error('boom');
 * expect(toError(e)).toBe(e);
 *
 * // Non-Error values are wrapped
 * expect(toError('string cause').message).toBe('string cause');
 * expect(toError(42).message).toBe('42');
 * expect(toError(null).message).toBe('null');
 * expect(toError({ code: 1 }).message).toBe('[object Object]');
 * ```
 */
export const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));
