import type { StateEntry } from '../state/types.js';
import type { RenderedEntryLine, SchemeProfile, WidgetConfig } from './types.js';
import { emojiForTag } from './tag-emoji.js';
import { osc8Link } from './hyperlink.js';
import { resolveScheme, sourceLabel as getSourceLabel } from './scheme-profile.js';
import { relativeTime, ageColorName } from './temporal.js';

// eslint-disable-next-line max-lines-per-function -- orchestration function coordinating emoji/age/profile lookups
export const renderEntryLine = (
  entry: StateEntry,
  config: WidgetConfig,
  _theme: string,
  nowMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
): RenderedEntryLine => {
  const emoji = emojiForTag(entry.tags[0] ?? ('unknown' as never), config.tagEmoji);
  const ageMs = nowMs - new Date(entry.timestamp).getTime();
  return buildRenderedLine(entry, emoji, ageMs, profiles);
};

const buildRenderedLine = (
  entry: StateEntry,
  emoji: string,
  ageMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
): RenderedEntryLine => {
  const { plain, raw } = buildLineComponents(entry, emoji, ageMs, profiles);
  return { entryId: entry.id, plain, raw };
};

// eslint-disable-next-line max-lines-per-function -- component assembly requires all formatting steps
const buildLineComponents = (
  entry: StateEntry,
  emoji: string,
  ageMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
): { plain: string; raw: string } => {
  const parts = extractLineParts(entry, ageMs, profiles);
  const linkedLabel = osc8Link(entry.label, parts.resolvedUrl);
  return {
    plain: formatPlain(emoji, entry.label, parts),
    raw: formatRaw(emoji, linkedLabel, parts),
  };
};

const extractLineParts = (
  entry: StateEntry,
  ageMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
): { age: string; source: string; colorName: string; resolvedUrl: string | undefined } => ({
  age: relativeTime(ageMs),
  source: getSourceLabel(entry.sourceUri, profiles),
  colorName: ageColorName(ageMs, entry.needsAttention),
  resolvedUrl: buildResolvedUrl(entry.sourceUri, profiles),
});

const formatPlain = (
  emoji: string,
  label: string,
  parts: { age: string; source: string; colorName: string },
): string => `${emoji} ${label} · ${parts.source} · ${parts.age} · ${parts.colorName}`;

const formatRaw = (
  emoji: string,
  linkedLabel: string,
  parts: { age: string; source: string },
): string => `${emoji} ${linkedLabel} · ${parts.source} · ${parts.age}`;

const buildResolvedUrl = (
  uri: string,
  profiles: ReadonlyMap<string, SchemeProfile>,
): string | undefined => {
  const profile = resolveScheme(uri as never, profiles);
  if (!profile?.baseUrl) return undefined;
  const path = uri.split('///')[1] ?? '';
  return `${profile.baseUrl}/${path}`;
};
