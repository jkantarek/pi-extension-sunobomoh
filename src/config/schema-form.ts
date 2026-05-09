const SECRET_PATTERNS = ['token', 'key', 'secret', 'password', 'credential'] as const;

/**
 * @example
 * ```ts @import.meta.vitest
 * expect(isSecretField('token')).toBe(true);
 * expect(isSecretField('apiKey')).toBe(true);
 * expect(isSecretField('clientSecret')).toBe(true);
 * expect(isSecretField('password')).toBe(true);
 * expect(isSecretField('credential')).toBe(true);
 * expect(isSecretField('owner')).toBe(false);
 * expect(isSecretField('repoName')).toBe(false);
 * expect(isSecretField('baseUrl')).toBe(false);
 * ```
 */
export const isSecretField = (fieldName: string): boolean =>
  SECRET_PATTERNS.some((p) => fieldName.toLowerCase().includes(p));

export const collectSchemaValues = (_schema: unknown, _ctx: unknown): Promise<never> => {
  throw new Error('Not implemented');
};
