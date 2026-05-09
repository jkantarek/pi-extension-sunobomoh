import { monotonicFactory } from 'ulid';
import type { EntryId } from './brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const seeded = createIdFactory(() => 0.12345);
 * const id1 = seeded.next();
 * const id2 = seeded.next();
 * expect(typeof id1).toBe('string');
 * expect(id1).toHaveLength(26);
 * expect(id2 > id1).toBe(true);
 *
 * expect(seeded.nextRaw()).toHaveLength(26);
 *
 * const prod = createIdFactory();
 * expect(prod.next()).toHaveLength(26);
 * ```
 */
export interface IdFactory {
  next(): EntryId;
  nextRaw(): string;
}

export const createIdFactory = (prng?: () => number): IdFactory => {
  const generate = monotonicFactory(prng);
  return {
    next: () => generate() as EntryId,
    nextRaw: () => generate(),
  };
};

export const defaultIdFactory: IdFactory = createIdFactory();
