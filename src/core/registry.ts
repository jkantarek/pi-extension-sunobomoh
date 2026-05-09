/**
 * @example
 * ```ts @import.meta.vitest
 * const reg = createRegistry<{ id: string; value: number }>(x => x.id);
 * reg.register({ id: 'a', value: 1 });
 * expect(reg.has('a')).toBe(true);
 * expect(reg.get('a')?.value).toBe(1);
 * expect(reg.getAll()).toHaveLength(1);
 * reg.register({ id: 'a', value: 2 });
 * expect(reg.get('a')?.value).toBe(2);
 * expect(reg.has('missing')).toBe(false);
 * expect(reg.get('missing')).toBeUndefined();
 * ```
 */
export interface Registry<T> {
  register(item: T): void;
  get(id: string): T | undefined;
  getAll(): readonly T[];
  has(id: string): boolean;
}

export const createRegistry = <T>(getId: (t: T) => string): Registry<T> => {
  const map = new Map<string, T>();
  return {
    register: (item: T): void => void map.set(getId(item), item),
    get: (id: string) => map.get(id),
    getAll: () => Array.from(map.values()),
    has: (id: string) => map.has(id),
  };
};
