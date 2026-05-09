# Contract: TUI Widget

**Files**: `src/ui/types.ts`, `src/ui/hyperlink.ts`, `src/ui/tag-emoji.ts`,
`src/ui/scheme-profile.ts`, `src/ui/temporal.ts`, `src/ui/grouping.ts`,
`src/ui/entry-line.ts`, `src/ui/widget.ts`

Patterns: **Pure Function** (all rendering), **Registry** (tag emoji map, scheme profiles),
**Null Object** (fallback emoji, fallback scheme abbreviation), **Adapter** (domain → ANSI strings).

---

## Design Principles

1. **Labels first** — `StateEntry.label` is the human text; the `sourceUri` is the click target
2. **OSC 8 hyperlinks** — label text is the hyperlink anchor; resolved URL is the destination
3. **Brightness decay** — age determines color level; `needsAttention` items stay bright
4. **Tag emoji** — first tag's emoji leads every line; full map is config-overridable
5. **Chronological order** — within any group, entries sorted oldest→newest; ULID sort is free
6. **Source abbreviation** — 2-char scheme label + short id extracted from the URI
7. **Grouping strategy** — default `none` (sequential); configurable to `source`, `tag`, `date`, or `attention`

---

## Entry Line Format

```
{emoji} {label ← OSC 8 link}  {src_abbr}  {age}
```

Rendered example (OSC 8 visible as underline in supported terminals):

```
🔴 Fix auth bug in login flow          gh#142    2m
👀 Review: Rate limiter PR             gh#138    8m
🔴 PROJ-99: Update test coverage       ji#99    45m
ℹ️  Slack: deployment window tomorrow   sl#C01   4h
🕸️  Update README links                 gh#67    3d
```

Age-brightness mapping:

| Age                    | Color level     | `theme.fg()` name   |
| ---------------------- | --------------- | ------------------- |
| < 4 h                  | full brightness | `'text'`            |
| 4 h – 24 h             | reduced         | `'muted'`           |
| > 24 h                 | dim             | `'dim'`             |
| `needsAttention: true` | always full     | `'text'` (override) |

---

## `src/ui/types.ts`

```typescript
import type { Theme } from '@mariozechner/pi-tui';

/** Config contributed by SunobomohConfig.widget and merged at widget construction. */
export interface WidgetConfig {
  /** Max total lines (entries + group headers) before truncation line. Default: 8. */
  readonly maxLines: number;
  /** How entries are grouped. Default: { type: 'none' } (sequential). */
  readonly grouping: GroupingStrategy;
  /** Tag id → emoji override map from SunobomohConfig.widget.tagEmoji. */
  readonly tagEmojiOverrides: ReadonlyMap<string, string>;
  /**
   * Scheme id → SchemeProfile override map from SunobomohConfig.widget.schemeProfiles.
   * Merged over DEFAULT_SCHEME_PROFILES.
   */
  readonly schemeProfileOverrides: ReadonlyMap<string, Partial<SchemeProfile>>;
}

export interface SchemeProfile {
  /** 2–3 char abbreviation shown after the label. e.g. 'gh', 'sl', 'ji'. */
  readonly abbr: string;
  /**
   * Convert a custom URI to a browser-openable URL for the OSC 8 hyperlink.
   * Return undefined to render the label as plain text (no hyperlink).
   */
  readonly resolveUrl: (uri: string) => string | undefined;
  /**
   * Extract a short resource identifier from the URI for the source column.
   * e.g. 'github:///owner/repo/issues/142' → '#142'
   * Return undefined to show only the abbreviation.
   */
  readonly shortId: (uri: string) => string | undefined;
}

export type AgeColorName = 'text' | 'muted' | 'dim';

/** A fully assembled single-line widget row, ready for setWidget(). */
export interface RenderedEntryLine {
  readonly raw: string; // ANSI + OSC 8 — sent to terminal
  readonly plain: string; // no ANSI — for tests / non-colour fallback
  readonly entryId: string;
}
```

---

## `src/ui/grouping.ts` — Grouping Strategy

Pattern: **Strategy** (discriminated union of grouping behaviours), **Pure Function** (`groupEntries`).

### Strategy types

```typescript
/**
 * String form used in .pi/sunobomoh.config.json and converted at parse time.
 * Extensible: add variants here as new grouping modes are needed.
 */
export type GroupingStrategyName = 'none' | 'source' | 'tag' | 'date' | 'attention';

/**
 * Resolved runtime discriminant. Kept as a union so future variants can carry options
 * (e.g., { type: 'date'; tz: string }) without changing the function signature.
 */
export type GroupingStrategy =
  | { readonly type: 'none' } // default — sequential, oldest→newest, no headers
  | { readonly type: 'source' } // one group per WatcherId, alphabetical
  | { readonly type: 'tag' } // one group per primary tag, highest weight first
  | { readonly type: 'date' } // Today / Yesterday / This week / Older
  | { readonly type: 'attention' }; // ⚠ Needs attention → then · Monitoring

export const DEFAULT_GROUPING: GroupingStrategy = { type: 'none' };

export const parseGroupingStrategy = (name: GroupingStrategyName): GroupingStrategy => ({
  type: name,
});
```

### `Group` value object

```typescript
export interface Group {
  /**
   * Rendered separator line for this group.
   * undefined only for the 'none' strategy (no header rendered, saves a line).
   */
  readonly header: string | undefined;
  /** Entries within this group, sorted ascending by ULID (oldest first). */
  readonly entries: readonly StateEntry[];
}
```

### `groupEntries()` — pure function

````typescript
import type { StateEntry } from '../state/types.js';

/**
 * Partition and order entries according to the active GroupingStrategy.
 * Pure: all inputs explicit, no I/O, no side-effects.
 *
 * Group ordering rules:
 *   'none'      → single group, no header, entries sorted by ULID ascending
 *   'source'    → one group per sourceId, groups sorted alphabetically by sourceId
 *   'tag'       → one group per first-tag, groups sorted by max attentionScore
 *               descending (proxy for tag weight without needing TagRegistry)
 *   'date'      → Today → Yesterday → This week → Older; within group ULID descending
 *               (newest at top of each date bucket)
 *   'attention' → needsAttention=true group first, then needsAttention=false group
 *
 * @example
 * ```ts @import.meta.vitest
 * import { groupEntries, DEFAULT_GROUPING, parseGroupingStrategy } from './grouping.js';
 * import { DEFAULT_TAG_EMOJI } from './tag-emoji.js';
 * import { makeTestEntry } from '../state/test-fixtures.js';
 *
 * const e1 = makeTestEntry({ tags: ['urgent' as any],       needsAttention: true  });
 * const e2 = makeTestEntry({ tags: ['needs-review' as any], needsAttention: false });
 * const entries = [e1, e2];
 * const now = Date.now();
 *
 * // 'none' → one group, no header
 * const none = groupEntries(entries, DEFAULT_GROUPING, DEFAULT_TAG_EMOJI, now);
 * expect(none).toHaveLength(1);
 * expect(none[0]?.header).toBeUndefined();
 * expect(none[0]?.entries).toHaveLength(2);
 *
 * // 'attention' → two groups, attention first
 * const byAttn = groupEntries(entries, parseGroupingStrategy('attention'), DEFAULT_TAG_EMOJI, now);
 * expect(byAttn).toHaveLength(2);
 * expect(byAttn[0]?.header).toContain('attention');
 * expect(byAttn[0]?.entries[0]?.needsAttention).toBe(true);
 *
 * // 'tag' → two groups, urgent before needs-review
 * const byTag = groupEntries(entries, parseGroupingStrategy('tag'), DEFAULT_TAG_EMOJI, now);
 * expect(byTag).toHaveLength(2);
 * expect(byTag[0]?.header).toContain('🔴');   // urgent emoji
 * expect(byTag[1]?.header).toContain('👀');   // needs-review emoji
 *
 * // Empty entries → empty groups (widget hides itself)
 * expect(groupEntries([], DEFAULT_GROUPING, DEFAULT_TAG_EMOJI, now)).toHaveLength(0);
 * ```
 */
export declare const groupEntries: (
  entries: readonly StateEntry[],
  strategy: GroupingStrategy,
  emojiMap: ReadonlyMap<string, string>,
  nowMs: number,
) => readonly Group[];
````

### Group header format

All headers follow the same `── {label} ──` separator style, themed as `'dim'`:

```
── github ───────────────────────────────────────────────────────────────
── 🔴 urgent ───────────────────────────────────────────────────────────
── Today ───────────────────────────────────────────────────────────
── ⚠ needs attention ──────────────────────────────────────────────
```

The trailing `─` fill extends to terminal width minus label. Implemented as:

```typescript
// pure, inside grouping.ts
const makeHeader = (label: string, width: number): string =>
  `── ${label} ${──'.repeat(Math.max(0, width - label.length - 4))}`;
```

---

````typescript
/**
 * Wrap text in an OSC 8 terminal hyperlink.
 * Supported by iTerm2, WezTerm, Kitty, Ghostty, and most modern terminals.
 * Falls back to plain text without styling in unsupported terminals.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { osc8Link } from './hyperlink.js';
 * const linked = osc8Link('Fix auth bug', 'https://github.com/owner/repo/issues/1');
 * expect(linked).toContain('\x1b]8;;');
 * expect(linked).toContain('Fix auth bug');
 * expect(linked).toContain('https://github.com/owner/repo/issues/1');
 *
 * // Plain text fallback when url is undefined
 * expect(osc8Link('Fix auth bug', undefined)).toBe('Fix auth bug');
 * ```
 */
export const osc8Link = (text: string, url: string | undefined): string => {
  if (url === undefined) return text;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
};
````

---

## `src/ui/tag-emoji.ts` — Tag Emoji Registry

````typescript
/**
 * @example
 * ```ts @import.meta.vitest
 * import { DEFAULT_TAG_EMOJI, createTagEmojiMap, emojiForTag } from './tag-emoji.js';
 * expect(DEFAULT_TAG_EMOJI.get('urgent')).toBe('🔴');
 * expect(DEFAULT_TAG_EMOJI.get('needs-review')).toBe('👀');
 *
 * const custom = createTagEmojiMap(new Map([['urgent', '🚨'], ['my-tag', '🎯']]));
 * expect(emojiForTag('urgent', custom)).toBe('🚨');     // override
 * expect(emojiForTag('needs-review', custom)).toBe('👀'); // default preserved
 * expect(emojiForTag('my-tag', custom)).toBe('🎯');      // custom tag
 * expect(emojiForTag('unknown', custom)).toBe('🔵');     // fallback Null Object
 * ```
 */
export const DEFAULT_TAG_EMOJI: ReadonlyMap<string, string> = new Map([
  ['urgent', '🔴'],
  ['needs-review', '👀'],
  ['informational', 'ℹ️ '],
  ['stale', '🕸️ '],
]);

/** Sentinel emoji for tags with no registered mapping — Null Object. */
export const FALLBACK_EMOJI = '🔵';

export const createTagEmojiMap = (
  overrides: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> => new Map([...DEFAULT_TAG_EMOJI, ...overrides]);

export const emojiForTag = (tagId: string, map: ReadonlyMap<string, string>): string =>
  map.get(tagId) ?? FALLBACK_EMOJI;
````

---

## `src/ui/scheme-profile.ts` — URI Resolution + Source Abbreviation

````typescript
import type { SchemeProfile } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { DEFAULT_SCHEME_PROFILES, resolveScheme, sourceLabel } from './scheme-profile.js';
 * const gh = DEFAULT_SCHEME_PROFILES.get('github')!;
 * expect(gh.abbr).toBe('gh');
 * expect(gh.resolveUrl('github:///owner/repo/issues/42'))
 *   .toBe('https://github.com/owner/repo/issues/42');
 * expect(gh.shortId('github:///owner/repo/issues/42')).toBe('#42');
 *
 * // File URIs pass through unmodified (file:// clickable in some terminals)
 * const fs = DEFAULT_SCHEME_PROFILES.get('file')!;
 * expect(fs.resolveUrl('file:///home/user/project/src/auth.ts'))
 *   .toBe('file:///home/user/project/src/auth.ts');
 * ```
 */
export const DEFAULT_SCHEME_PROFILES: ReadonlyMap<string, SchemeProfile> = new Map([
  [
    'github',
    {
      abbr: 'gh',
      resolveUrl: (uri) => uri.replace(/^github:\/\/\//, 'https://github.com/'),
      shortId: (uri) => {
        const m = uri.match(/\/(\d+)$/);
        return m ? `#${m[1]}` : undefined;
      },
    },
  ],
  [
    'slack',
    {
      abbr: 'sl',
      resolveUrl: (uri) =>
        uri.replace(/^slack:\/\/\/([^/]+)\/([^/]+)\/(.+)$/, 'https://$1.slack.com/archives/$2/p$3'),
      shortId: (uri) => {
        const m = uri.match(/\/([^/]+)\/[^/]+$/);
        return m ? `#${m[1]}` : undefined;
      },
    },
  ],
  [
    'gmail',
    {
      abbr: 'gm',
      resolveUrl: (uri) =>
        uri.replace(
          /^gmail:\/\/\/[^/]+\/thread\/(.+)$/,
          'https://mail.google.com/mail/u/0/#inbox/$1',
        ),
      shortId: (uri) => {
        const m = uri.match(/thread\/(.{8})/);
        return m ? m[1] : undefined;
      },
    },
  ],
  [
    'file',
    {
      abbr: 'fs',
      resolveUrl: (uri) => uri, // file:// is clickable in iTerm2, WezTerm
      shortId: (uri) => {
        const m = uri.match(/\/([^/]+)$/);
        return m ? m[1] : undefined;
      },
    },
  ],
  [
    'jira',
    {
      abbr: 'ji',
      resolveUrl: (uri) =>
        uri.replace(/^jira:\/\/\/([^/]+)\/browse\/(.+)$/, 'https://$1/browse/$2'),
      shortId: (uri) => {
        const m = uri.match(/\/([A-Z]+-\d+)$/);
        return m ? m[1] : undefined;
      },
    },
  ],
  [
    'browser',
    {
      abbr: 'br',
      resolveUrl: (uri) => uri.replace(/^browser:\/\/\//, 'https://'),
      shortId: (_uri) => undefined,
    },
  ],
  [
    'git',
    {
      abbr: 'git',
      resolveUrl: (uri) => uri.replace(/^git:\/\/\//, 'https://'),
      shortId: (uri) => {
        const m = uri.match(/commit\/([0-9a-f]{7})/);
        return m ? m[1] : undefined;
      },
    },
  ],
]);

/**
 * Resolve a URI to its SchemeProfile. Returns undefined for unregistered schemes.
 * Callers merge DEFAULT_SCHEME_PROFILES with config-level overrides at startup.
 */
export const resolveScheme = (
  uri: string,
  profiles: ReadonlyMap<string, SchemeProfile>,
): SchemeProfile | undefined => {
  const scheme = uri.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/)?.at(1);
  return scheme !== undefined ? profiles.get(scheme) : undefined;
};

/**
 * Format the source column: '{abbr}{shortId}' e.g. 'gh#142', 'ji#PROJ-99', 'fs:auth.ts'.
 * Returns just the abbreviation if no shortId is available.
 */
export const sourceLabel = (uri: string, profile: SchemeProfile): string => {
  const id = profile.shortId(uri);
  return id !== undefined ? `${profile.abbr}:${id}` : profile.abbr;
};
````

---

## `src/ui/temporal.ts` — Relative Time + Age Color

````typescript
import type { AgeColorName } from './types.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { relativeTime, ageColorName } from './temporal.js';
 * expect(relativeTime(30_000)).toBe('30s');
 * expect(relativeTime(90_000)).toBe('1m');
 * expect(relativeTime(7_200_000)).toBe('2h');
 * expect(relativeTime(90_000_000)).toBe('1d');
 *
 * expect(ageColorName(0)).toBe('text');
 * expect(ageColorName(3 * 3_600_000)).toBe('text');         // 3h → text
 * expect(ageColorName(5 * 3_600_000)).toBe('muted');        // 5h → muted
 * expect(ageColorName(25 * 3_600_000)).toBe('dim');         // 25h → dim
 * ```
 */
export const relativeTime = (ageMs: number): string => {
  const s = Math.floor(ageMs / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

/**
 * Map entry age to a theme foreground color name.
 * needsAttention overrides age decay — always returns 'text'.
 */
export const ageColorName = (ageMs: number, needsAttention = false): AgeColorName => {
  if (needsAttention) return 'text';
  if (ageMs < 4 * 3_600_000) return 'text';
  if (ageMs < 24 * 3_600_000) return 'muted';
  return 'dim';
};
````

---

## `src/ui/entry-line.ts` — Single-Line Assembly

Assembles one widget row from a `StateEntry`. Pure function — no I/O, no side-effects.

````typescript
import type { Theme } from '@mariozechner/pi-tui';
import type { StateEntry } from '../state/types.js';
import type { RenderedEntryLine, SchemeProfile, WidgetConfig } from './types.js';
import { osc8Link } from './hyperlink.js';
import { emojiForTag } from './tag-emoji.js';
import { resolveScheme, sourceLabel } from './scheme-profile.js';
import { relativeTime, ageColorName } from './temporal.js';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';

/**
 * @example
 * ```ts @import.meta.vitest
 * import { renderEntryLine } from './entry-line.js';
 * import { makeTestEntry }   from '../state/test-fixtures.js';
 * import { makeTestTheme }   from '../ui/test-fixtures.js';
 * import { createTagEmojiMap } from './tag-emoji.js';
 * import { DEFAULT_SCHEME_PROFILES } from './scheme-profile.js';
 * const entry = makeTestEntry({ label: 'Fix auth bug', sourceUri: 'github:///o/r/issues/42' as any });
 * const cfg = { maxLines: 8, tagEmojiOverrides: new Map(), schemeProfileOverrides: new Map() };
 * const now = new Date('2026-05-07T10:02:00Z').getTime();
 * const entryTime = new Date('2026-05-07T10:00:00Z').getTime();
 * const line = renderEntryLine(entry, cfg, makeTestTheme(), now, entryTime);
 * expect(line.plain).toContain('Fix auth bug');
 * expect(line.plain).toContain('gh:#42');
 * expect(line.plain).toContain('2m');
 * ```
 */
export declare const renderEntryLine: (
  entry: StateEntry,
  config: WidgetConfig,
  theme: Theme,
  nowMs: number,
  profiles: ReadonlyMap<string, SchemeProfile>,
) => RenderedEntryLine;
````

**Internal layout** (implemented in source, documented here for implementors):

```
Column 1: emoji (2 chars fixed — emoji + space)
Column 2: label as OSC 8 link, left-aligned, padded with spaces
Column 3: source label (abbr + shortId), right-aligned in 10 chars
Column 4: relative age, right-aligned in 4 chars

Total: emoji(2) + label(width-20) + source(10) + age(4) + gaps(4) = width
```

The `plain` field strips all ANSI codes and OSC sequences — used in tests and for
terminals that declare no colour support.

---

## `src/ui/widget.ts` — Widget + Footer Assembly

````typescript
import type { Theme } from '@mariozechner/pi-tui';
import type { ReadModel } from '../state/read-model.js';
import type { WidgetConfig } from './types.js';
import type { SchemeProfile } from './types.js';

/**
 * Render the attention widget lines for ctx.ui.setWidget().
 * Returns [] when model.needsAttention is empty (widget hides itself).
 * Entries are sorted oldest→newest so age decay creates a natural timeline.
 *
 * @example
 * ```ts @import.meta.vitest
 * import { renderAttentionWidget } from './widget.js';
 * import { emptyModel } from '../state/read-model.js';
 * import { makeTestTheme } from '../ui/test-fixtures.js';
 * const lines = renderAttentionWidget(
 *   emptyModel(),
 *   { maxLines: 8, tagEmojiOverrides: new Map(), schemeProfileOverrides: new Map() },
 *   makeTestTheme(),
 *   Date.now(),
 * );
 * expect(lines).toHaveLength(0);
 * ```
 */
export declare const renderAttentionWidget: (
  model: ReadModel,
  config: WidgetConfig,
  theme: Theme,
  nowMs: number,
) => readonly string[];

/**
 * Render the single-line footer status string for ctx.ui.setStatus().
 *
 * Format: '👁 sunobomoh · ⚠ {n} attn │ {total} entries │ ↻ {next}'
 * When running:  '👁 sunobomoh · ⚠ 3 attn │ 47 entries │ ↻ 7m'
 * When idle:     '👁 sunobomoh · ⚠ 0 attn │ 47 entries │ ○ stopped'
 *
 * @example
 * ```ts @import.meta.vitest
 * import { renderFooterStatus } from './widget.js';
 * import { emptyModel } from '../state/read-model.js';
 * import { makeTestTheme } from '../ui/test-fixtures.js';
 * const status = renderFooterStatus(emptyModel(), { running: false, tickCount: 0 }, makeTestTheme(), Date.now());
 * expect(status).toContain('sunobomoh');
 * expect(status).toContain('stopped');
 * ```
 */
export declare const renderFooterStatus: (
  model: ReadModel,
  schedulerState: import('../scheduler/types.js').SchedulerState,
  theme: Theme,
  nowMs: number,
) => string;
````

**Widget render logic** (documented for implementors):

```
1. Collect all entries from model.byId (or model.needsAttention only — see config)
2. Call groupEntries(entries, config.grouping, emojiMap, nowMs) → Group[]
3. For each Group:
   a. If group.header is defined: emit header line (counts toward maxLines)
   b. For each entry in group.entries (while line count < maxLines):
      i.  Look up scheme profile for entry.sourceUri
      ii. Build resolved URL for OSC 8
      iii.Apply ageColorName() — needsAttention entries always 'text'
      iv. renderEntryLine(entry, config, theme, nowMs, profiles)
4. If total rendered lines < total entries + headers:
   append: '── {overflow} more · /state ─'  (themed 'dim')
5. Return lines[] for ctx.ui.setWidget('sunobomoh', lines)
```

The widget always shows the **attention-filtered** view (only `needsAttention=true` entries)
when `config.grouping.type === 'none'` or `'attention'`.
For `'source'`, `'tag'`, and `'date'` groupings, all entries are shown (allowing the user
to scan the full timeline with age decay providing the visual hierarchy).

---

## Config Integration

All widget config lives under the `widget` key in `SunobomohConfig`:

```json
// .pi/sunobomoh.config.json
{
  "widget": {
    "maxLines": 8,
    "grouping": "source",
    "tagEmoji": {
      "urgent": "🚨",
      "blocked": "🚫",
      "my-tag": "🎯"
    },
    "schemeProfiles": {
      "jira": { "abbr": "ji", "baseUrl": "https://jira.corp.com" }
    }
  }
}
```

`grouping` accepts any `GroupingStrategyName` string. All fields are optional;
defaults are applied by `buildWidgetConfig()` in `src/extension/index.ts`.

---

```typescript
// .pi/sunobomoh.config.json
{
  "tagEmoji": {
    "urgent":    "🚨",       // override built-in
    "my-tag":    "🎯",       // custom tag
    "blocked":   "🚫"        // custom tag
  },
  "schemeProfiles": {
    "jira": {
      "abbr": "ji",
      "baseUrl": "https://jira.corp.com"  // used by the built-in jira resolver
    }
  }
}
```

Both maps are loaded in `initHandler`, converted to `ReadonlyMap`, and passed into
`createTagEmojiMap()` and merged over `DEFAULT_SCHEME_PROFILES` at widget construction time.

---

## Source Layout (`src/ui/`)

```
src/ui/
├── types.ts          # WidgetConfig, GroupingStrategy, SchemeProfile, AgeColorName, RenderedEntryLine
├── hyperlink.ts      # osc8Link(text, url): string
├── tag-emoji.ts      # DEFAULT_TAG_EMOJI, createTagEmojiMap(), emojiForTag()  [Registry + Null Object]
├── scheme-profile.ts # DEFAULT_SCHEME_PROFILES, resolveScheme(), sourceLabel()  [Registry + Strategy]
├── temporal.ts       # relativeTime(), ageColorName()
├── grouping.ts       # GroupingStrategy, Group, groupEntries()  [Strategy + Pure Function]
├── entry-line.ts     # renderEntryLine()  [Adapter]
└── widget.ts         # renderAttentionWidget(), renderFooterStatus()  [Adapter]
```

`src/extension/ui.ts` is removed — its responsibility moves entirely into `src/ui/`.
`src/extension/index.ts` calls `renderAttentionWidget()` and `renderFooterStatus()` directly.

---

## Terminal Compatibility

| Feature          | iTerm2 | WezTerm | Kitty | Ghostty | Standard xterm  |
| ---------------- | ------ | ------- | ----- | ------- | --------------- |
| OSC 8 hyperlinks | ✅     | ✅      | ✅    | ✅      | ❌ (plain text) |
| Emoji width      | ✅     | ✅      | ✅    | ✅      | varies          |
| file:// links    | ✅     | ✅      | ❌    | ✅      | ❌              |
| ANSI colours     | ✅     | ✅      | ✅    | ✅      | ✅              |

When OSC 8 is not supported, `osc8Link()` text still appears — the entry label is always
readable. The `plain` field in `RenderedEntryLine` enables test assertions without ANSI.
