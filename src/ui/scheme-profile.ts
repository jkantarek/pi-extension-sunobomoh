import type { ResourceUri } from '../core/brands.js';
import type { SchemeProfile } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { DEFAULT_SCHEME_PROFILES, resolveScheme, sourceLabel } = await import('./scheme-profile.js');
 * const { unsafeResourceUri } = await import('../core/brands.js');
 *
 * // GitHub resolves to https://github.com/...
 * const ghProfile = DEFAULT_SCHEME_PROFILES.get('github');
 * expect(ghProfile).toBeDefined();
 * expect(ghProfile?.abbr).toBe('gh');
 * expect(ghProfile?.baseUrl).toBe('https://github.com');
 *
 * // shortId extracts #42 from github:///owner/repo/issues/42
 * const ghUri = unsafeResourceUri('github:///owner/repo/issues/42');
 * expect(ghProfile?.shortId(ghUri)).toMatch(/#42/);
 *
 * // GitHub URI without /issues/ pattern falls back to last segment
 * const ghPrUri = unsafeResourceUri('github:///owner/repo/pull/123');
 * expect(ghProfile?.shortId(ghPrUri)).toBe('123');
 *
 * // file URI passes through
 * const fileUri = unsafeResourceUri('file:///tmp/test.ts');
 * const fileProfile = resolveScheme(fileUri, DEFAULT_SCHEME_PROFILES);
 * expect(fileProfile).toBeDefined();
 * expect(fileProfile?.abbr).toBe('file');
 *
 * // Gmail scheme uses default shortId
 * const gmailUri = unsafeResourceUri('gmail:///thread/abc123');
 * const gmailProfile = DEFAULT_SCHEME_PROFILES.get('gmail');
 * expect(gmailProfile?.shortId(gmailUri)).toBe('abc123');
 *
 * // Slack scheme uses default shortId
 * const slackUri = unsafeResourceUri('slack:///channel/C123');
 * const slackProfile = DEFAULT_SCHEME_PROFILES.get('slack');
 * expect(slackProfile?.shortId(slackUri)).toBe('C123');
 *
 * // Unknown scheme returns undefined
 * const unknownUri = unsafeResourceUri('unknown:///test');
 * expect(resolveScheme(unknownUri, DEFAULT_SCHEME_PROFILES)).toBeUndefined();
 *
 * // sourceLabel formats gh:#42
 * expect(sourceLabel(ghUri, DEFAULT_SCHEME_PROFILES)).toMatch(/gh:/);
 * expect(sourceLabel(ghUri, DEFAULT_SCHEME_PROFILES)).toMatch(/#42/);
 *
 * // sourceLabel for unknown scheme returns URI as-is
 * expect(sourceLabel(unknownUri, DEFAULT_SCHEME_PROFILES)).toBe('unknown:///test');
 *
 * // Empty path returns empty string
 * const emptyPathUri = unsafeResourceUri('file:///' as never);
 * expect(fileProfile?.shortId(emptyPathUri as never)).toBe('');
 *
 * // Malformed URI without colon returns undefined scheme
 * const noColonUri = unsafeResourceUri('malformed' as never);
 * expect(resolveScheme(noColonUri, DEFAULT_SCHEME_PROFILES)).toBeUndefined();
 * ```
 */
const extractGitHubShortId = (uri: string): string => {
  const regex = /\/issues\/(\d+)$/;
  const match = regex.exec(uri);
  return match?.[1] !== undefined ? `#${match[1]}` : (uri.split('/').pop() ?? uri);
};

const extractFileShortId = (uri: string): string => uri.split('/').pop() ?? uri;

export const DEFAULT_SCHEME_PROFILES: ReadonlyMap<string, SchemeProfile> = new Map([
  ['github', { abbr: 'gh', baseUrl: 'https://github.com', shortId: extractGitHubShortId }],
  ['file', { abbr: 'file', shortId: extractFileShortId }],
  ['gmail', { abbr: 'mail', shortId: (uri: string): string => uri.split('/').pop() ?? uri }],
  ['slack', { abbr: 'slack', shortId: (uri: string): string => uri.split('/').pop() ?? uri }],
]);

export const resolveScheme = (
  uri: ResourceUri,
  profiles: ReadonlyMap<string, SchemeProfile>,
): SchemeProfile | undefined => {
  const scheme = (uri as string).split(':')[0];
  return scheme !== undefined ? profiles.get(scheme) : undefined;
};

export const sourceLabel = (
  uri: ResourceUri,
  profiles: ReadonlyMap<string, SchemeProfile>,
): string => {
  const profile = resolveScheme(uri, profiles);
  const uriStr = uri as string;
  return profile !== undefined ? `${profile.abbr}:${profile.shortId(uriStr)}` : uriStr;
};
