/**
 * @example
 * ```ts @import.meta.vitest
 * // String passthrough
 * expect(resolveEnvRefs('plain', {})).toBe('plain');
 *
 * // $VAR resolution
 * expect(resolveEnvRefs('$TOKEN', { TOKEN: 'secret' })).toBe('secret');
 *
 * // Missing var returns ''
 * expect(resolveEnvRefs('$MISSING', {})).toBe('');
 *
 * // Nested object traversal
 * const config = { api: { key: '$API_KEY' } };
 * const env = { API_KEY: '123' };
 * const result = resolveEnvRefs(config, env);
 * expect(result).toEqual({ api: { key: '123' } });
 *
 * // Array traversal
 * const arr = ['$VAR1', '$VAR2'];
 * const envArr = { VAR1: 'a', VAR2: 'b' };
 * expect(resolveEnvRefs(arr, envArr)).toEqual(['a', 'b']);
 * ```
 */
/* eslint-disable complexity, max-lines-per-function -- Recursive resolver */
export function resolveEnvRefs(config: unknown, env?: Record<string, string>): unknown {
  const envMap = env ?? {};
  if (typeof config === 'string')
    return config.startsWith('$') ? (envMap[config.slice(1)] ?? '') : config;
  if (Array.isArray(config)) return config.map((item) => resolveEnvRefs(item, envMap));
  if (typeof config === 'object' && config !== null) {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config))
      resolved[key] = resolveEnvRefs(value, envMap);
    return resolved;
  }
  return config;
}
