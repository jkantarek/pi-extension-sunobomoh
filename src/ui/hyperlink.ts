/**
 * @example
 * ```ts @import.meta.vitest
 * const { osc8Link } = await import('./hyperlink.js');
 * const linked = osc8Link('Click me', 'https://example.com');
 * expect(linked).toContain('\x1b]8;;https://example.com\x1b\\');
 * expect(linked).toContain('Click me');
 * expect(linked).toContain('\x1b]8;;\x1b\\');
 *
 * const plain = osc8Link('No link', undefined);
 * expect(plain).toBe('No link');
 * expect(plain).not.toContain('\x1b]8');
 * ```
 */
export const osc8Link = (text: string, url: string | undefined): string =>
  url === undefined ? text : `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
