import { type Result, ok } from '../core/result.js';
import type { CallbackPhase, SideEffectContext, SideEffectDefinition } from './types.js';

export interface PhaseRunResult {
  readonly halted: boolean;
  readonly ranCount: number;
}

export interface SideEffectError {
  readonly definitionId: string;
  readonly cause: Error;
}

/**
 * @example
 * ```ts @import.meta.vitest
 * const defs = [
 *   { id: 'a', phase: 'before_watch' as const, handler: async () => {} },
 *   { id: 'b', phase: 'after_watch' as const, handler: async () => {} },
 * ];
 * expect(phaseHandlers('before_watch', defs)).toHaveLength(1);
 * expect(phaseHandlers('after_watch', defs)).toHaveLength(1);
 * expect(phaseHandlers('after_hydrate' as const, defs)).toHaveLength(0);
 * ```
 */
export const phaseHandlers = (
  phase: CallbackPhase,
  defs: readonly SideEffectDefinition[],
): readonly SideEffectDefinition[] => defs.filter((d) => d.phase === phase);

const runHandler = async (def: SideEffectDefinition, ctx: SideEffectContext): Promise<boolean> => {
  try {
    const result = await def.handler(ctx);
    return result?.halt === true;
  } catch {
    return false;
  }
};

/**
 * @example
 * ```ts @import.meta.vitest
 * const { isOk } = await import('../core/result.js');
 * const { unsafeWatcherId } = await import('../core/brands.js');
 *
 * // Test 1: runs handlers in order
 * const order: string[] = [];
 * const defs1 = [
 *   { id: 'first', phase: 'before_watch' as const, handler: async () => { order.push('a'); } },
 *   { id: 'second', phase: 'before_watch' as const, handler: async () => { order.push('b'); } },
 * ];
 * const ctx1 = { phase: 'before_watch' as const, watcherId: unsafeWatcherId('w'),
 *   entries: [], config: {}, signal: new AbortController().signal };
 * const result1 = await runPhase('before_watch', defs1, ctx1);
 * expect(isOk(result1)).toBe(true);
 * if (isOk(result1)) {
 *   expect(result1.value.halted).toBe(false);
 *   expect(result1.value.ranCount).toBe(2);
 *   expect(order).toEqual(['a', 'b']);
 * }
 *
 * // Test 2: halts on { halt: true }
 * const haltingDef = {
 *   id: 'halt', phase: 'before_watch' as const,
 *   handler: async () => ({ halt: true as const }),
 * };
 * const afterHalt = {
 *   id: 'after', phase: 'before_watch' as const,
 *   handler: async () => { throw new Error('should not run'); },
 * };
 * const ctx2 = { phase: 'before_watch' as const, watcherId: unsafeWatcherId('w'),
 *   entries: [], config: {}, signal: new AbortController().signal };
 * const result2 = await runPhase('before_watch', [haltingDef, afterHalt], ctx2);
 * expect(isOk(result2)).toBe(true);
 * if (isOk(result2)) {
 *   expect(result2.value.halted).toBe(true);
 *   expect(result2.value.ranCount).toBe(1);
 * }
 *
 * // Test 3: continues on error
 * const order3: string[] = [];
 * const throwingDef = {
 *   id: 'throw', phase: 'before_watch' as const,
 *   handler: async () => { order3.push('x'); throw new Error('test error'); },
 * };
 * const continuesDef = {
 *   id: 'continues', phase: 'before_watch' as const,
 *   handler: async () => { order3.push('y'); },
 * };
 * const ctx3 = { phase: 'before_watch' as const, watcherId: unsafeWatcherId('w'),
 *   entries: [], config: {}, signal: new AbortController().signal };
 * const result3 = await runPhase('before_watch', [throwingDef, continuesDef], ctx3);
 * expect(isOk(result3)).toBe(true);
 * if (isOk(result3)) {
 *   expect(result3.value.halted).toBe(false);
 *   expect(result3.value.ranCount).toBe(2);
 *   expect(order3).toEqual(['x', 'y']);
 * }
 * ```
 */
const countPhase = async (
  hs: readonly SideEffectDefinition[],
  c: SideEffectContext,
): Promise<{ readonly n: number; readonly halted: boolean }> => {
  let n = 0;
  for (const h of hs)
    if (await runHandler(h, c)) return { n: ++n, halted: true };
    else n++;
  return { n, halted: false };
};

export const runPhase = async (
  p: CallbackPhase,
  d: readonly SideEffectDefinition[],
  c: SideEffectContext,
): Promise<Result<PhaseRunResult, SideEffectError>> => {
  const { n, halted } = await countPhase(phaseHandlers(p, d), c);
  return ok({ halted, ranCount: n });
};
