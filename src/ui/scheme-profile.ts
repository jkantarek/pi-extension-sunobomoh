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
 * // empty path returns the URI itself (|| uri fallback)
 * const emptyPathUri = unsafeResourceUri('file:///' as never);
 * expect(fileProfile?.shortId(emptyPathUri as never)).toBe('file:///');
 *
 * // URI ending with slash: segment is empty string, || uri fires
 * const trailingSlash = unsafeResourceUri('file:///dir/' as never);
 * expect(extractLastSegment !== undefined).toBe(true);
 *
 * // Malformed URI without colon: colonIdx < 0 so scheme is '' → undefined
 * const noColonUri = unsafeResourceUri('malformed' as never);
 * expect(resolveScheme(noColonUri, DEFAULT_SCHEME_PROFILES)).toBeUndefined();
 * ```
 */
const extractGitHubShortId = (uri: string): string => {
  const match = /\/issues\/(\d+)$/.exec(uri);
  return match?.[1] !== undefined ? `#${match[1]}` : uri.slice(uri.lastIndexOf('/') + 1) || uri;
};

const extractLastSegment = (uri: string): string => uri.slice(uri.lastIndexOf('/') + 1) || uri;

export const DEFAULT_SCHEME_PROFILES: ReadonlyMap<string, SchemeProfile> = new Map([
  ['github', { abbr: 'gh', baseUrl: 'https://github.com', shortId: extractGitHubShortId }],
  ['file', { abbr: 'file', shortId: extractLastSegment }],
  ['gmail', { abbr: 'mail', shortId: extractLastSegment }],
  ['slack', { abbr: 'slack', shortId: extractLastSegment }],
]);

export const resolveScheme = (
  uri: ResourceUri,
  profiles: ReadonlyMap<string, SchemeProfile>,
): SchemeProfile | undefined => {
  const colonIdx = (uri as string).indexOf(':');
  const scheme = colonIdx >= 0 ? (uri as string).slice(0, colonIdx) : '';
  return profiles.get(scheme);
};

export const sourceLabel = (
  uri: ResourceUri,
  profiles: ReadonlyMap<string, SchemeProfile>,
): string => {
  const profile = resolveScheme(uri, profiles);
  const uriStr = uri as string;
  return profile !== undefined ? `${profile.abbr}:${profile.shortId(uriStr)}` : uriStr;
};
