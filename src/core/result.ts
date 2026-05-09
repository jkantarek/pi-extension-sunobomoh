/**
 * @example
 * ```ts @import.meta.vitest
 * const success = ok(42);
 * expect(isOk(success)).toBe(true);
 * expect(isErr(success)).toBe(false);
 * if (isOk(success)) expect(success.value).toBe(42);
 *
 * const failure = err(new Error('boom'));
 * expect(isErr(failure)).toBe(true);
 * if (isErr(failure)) expect(failure.error.message).toBe('boom');
 * ```
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;
