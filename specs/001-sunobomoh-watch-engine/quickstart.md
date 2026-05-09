# Quickstart: Sunobomoh Watch Engine

**Branch**: `001-sunobomoh-watch-engine` | **Date**: 2026-05-07

---

## Install as a pi package

```bash
# Project-local (recommended for team use)
pi install -l git:github.com/your-org/pi-extension-sunobomoh

# Global (all projects)
pi install git:github.com/your-org/pi-extension-sunobomoh
```

After install, restart pi or run `/reload`. You should see:

```
● Extensions loaded: sunobomoh-watch-engine
```

---

## Two Ways to Add a Watcher

| Path             | When to use                                          | Code required                 |
| ---------------- | ---------------------------------------------------- | ----------------------------- |
| **Config file**  | Built-in watchers (github, filesystem, slack, gmail) | Zero — edit JSON              |
| **Programmatic** | Custom watcher definitions                           | One sibling pi extension file |

---

## Path 1: Config File (Built-in Watchers)

Create `.pi/sunobomoh.config.json` in your project root.

```json
{
  "stateFile": ".pi/sunobomoh-state.jsonl",
  "scheduler": {
    "intervalMinutes": 10,
    "steeringIntervalMinutes": 60,
    "maxConcurrentWatchers": 3,
    "timeoutMs": 30000
  },
  "steering": {
    "promoteThreshold": 60,
    "demoteThreshold": 20,
    "recencyDecayHalfLifeHours": 24,
    "llmSteering": false,
    "llmBorderlineLimit": 10
  },
  "watchers": [
    {
      "id": "github",
      "config": {
        "owner": "your-org",
        "repo": "your-repo",
        "token": "$GITHUB_TOKEN"
      }
    },
    {
      "id": "filesystem",
      "config": {
        "paths": ["./src", "./docs"],
        "extensions": [".ts", ".md"]
      }
    }
  ],
  "widget": {
    "maxLines": 8,
    "grouping": "tag",
    "tagEmoji": {
      "urgent": "🚨",
      "blocked": "🚫"
    },
    "schemeProfiles": {
      "jira": { "abbr": "ji", "baseUrl": "https://jira.corp.com" }
    }
  }
}
```

> **Secret values**: Use `$ENV_VAR_NAME` strings for tokens and keys. They are resolved
> from the environment at runtime — never store raw secrets in the config file.

---

## Path 2: Custom Watcher (Programmatic Registration)

Write a `WatcherDefinition` object and a sibling pi extension that registers it.

### Step 1 — Define the watcher

```typescript
// .pi/watchers/my-jira-watcher.ts
import type { WatcherDefinition } from '@your-org/pi-extension-sunobomoh';
import {
  unsafeWatcherId,
  unsafeTagId,
  toResourceUri,
  isOk,
} from '@your-org/pi-extension-sunobomoh';
import { Type } from 'typebox';

interface JiraConfig {
  baseUrl: string;
  token: string;
  projectKey: string;
}

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  updated: string;
}

export const jiraWatcher: WatcherDefinition<JiraConfig, JiraIssue> = {
  id: unsafeWatcherId('jira'),
  name: 'Jira Issues',
  description: 'Polls open Jira issues assigned to you',

  configSchema: Type.Object({
    baseUrl: Type.String(),
    token: Type.String(),
    projectKey: Type.String(),
  }),

  async watch(config, signal) {
    const resp = await fetch(`${config.baseUrl}/rest/api/3/search?jql=assignee=currentUser()`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal,
    });
    const body = (await resp.json()) as { issues: JiraIssue[] };
    return body.issues;
  },

  extractUri(issue, config) {
    const raw = `jira:///${config.baseUrl}/browse/${issue.key}`;
    const result = toResourceUri(raw);
    if (!isOk(result)) throw result.error;
    return result.value;
  },

  extractLabel(issue) {
    return `${issue.key}: ${issue.summary}`;
  },

  extractTags(issue) {
    const tags = [unsafeTagId('needs-review')];
    if (issue.priority === 'High' || issue.priority === 'Critical') {
      tags.push(unsafeTagId('urgent'));
    }
    return tags;
  },

  // Optional: enrich entries with additional data after collection
  hydrators: [
    {
      id: 'jira-description-hydrator',
      name: 'Jira Description',
      description: 'Fetches full issue description from Jira',
      async hydrate(entries, _signal) {
        return entries.map((entry) => ({
          ...entry,
          hydratedData: { description: `Full description for ${(entry.data as JiraIssue).key}` },
          metadata: {
            ...entry.metadata,
            // toIsoTimestamp ensures the branded IsoTimestamp type
            hydratedAt: entry.metadata.watchedAt,
          },
        }));
      },
    },
  ],

  // Active Record–style callbacks
  sideEffects: [
    {
      id: 'skip-weekends',
      phase: 'before_watch',
      async handler(_ctx) {
        const day = new Date().getDay();
        if (day === 0 || day === 6) return { halt: true };
      },
    },
    {
      id: 'log-urgent',
      phase: 'after_hydrate',
      async handler(ctx) {
        const urgent = ctx.entries.filter((e) => e.tags.includes(unsafeTagId('urgent')));
        if (urgent.length > 0) {
          console.warn(`[sunobomoh] ${urgent.length} urgent Jira issues`);
        }
      },
    },
  ],
};
```

### Step 2 — Register via a sibling pi extension

`getSunobomoh()` is a module-level getter — **no `pi` argument**.
Call it inside `session_start`, where sunobomoh is guaranteed to be initialised.

```typescript
// .pi/extensions/register-watchers.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getSunobomoh } from '@your-org/pi-extension-sunobomoh';
import { jiraWatcher } from './watchers/my-jira-watcher.js';

export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async (_event, ctx) => {
    const sunobomoh = getSunobomoh();
    if (sunobomoh === undefined) {
      ctx.ui.notify('sunobomoh not loaded', 'warning');
      return;
    }
    sunobomoh.registerWatcher(jiraWatcher, {
      baseUrl: 'https://jira.corp.com',
      token: process.env['JIRA_TOKEN'] ?? '',
      projectKey: 'PROJ',
    });
  });
}
```

pi discovers `.pi/extensions/` automatically — no further configuration needed.

### Step 3 — Register custom tags (if your watcher uses non-built-in tags)

```typescript
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  getSunobomoh,
  UNKNOWN_OUTCOME_SCHEMA,
  unsafeTagId,
} from '@your-org/pi-extension-sunobomoh';
import { Type } from 'typebox';

export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async (_event, _ctx) => {
    const sunobomoh = getSunobomoh();
    if (sunobomoh === undefined) return;

    // Tag with a typed outcome schema
    sunobomoh.registerTag({
      id: unsafeTagId('jira-issue'),
      label: 'Jira Issue',
      description: 'An open Jira issue assigned to me',
      defaultStatus: 'pending',
      attentionWeight: 6,
      outcomeSchema: Type.Object({
        key: Type.String(),
        priority: Type.String(),
        resolved: Type.Boolean(),
      }),
    });

    // Tag with free-form outcome (no specific schema needed)
    sunobomoh.registerTag({
      id: unsafeTagId('mention'),
      label: 'Mention',
      description: 'I was @mentioned',
      defaultStatus: 'pending',
      attentionWeight: 5,
      outcomeSchema: UNKNOWN_OUTCOME_SCHEMA,
    });
  });
}
```

---

## Registration Lifecycle

```
pi loads
  └─► sunobomoh factory: INSTANCE created (before session_start)
  └─► consumer factory:  registers session_start handler

pi fires session_start
  └─► sunobomoh session_start: loads config, registers built-in watchers
  └─► consumer session_start:  getSunobomoh()!.registerWatcher(...)  ← always safe here

registration window closes → scheduler.start() → first tick in 10 min
```

The scheduler **always** starts after all `session_start` handlers complete, so every
watcher registered by any extension is visible on the first tick.

On `/reload`, `session_start` fires again and all registrations re-execute cleanly.

---

## Commands

| Command             | Description                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `/sunobomoh:config` | **Add or remove watchers interactively** — discover built-ins, collect config, live-apply |
| `/watch`            | Show registered watchers, last-run times, entry counts                                    |
| `/state`            | Query and display current state (supports `--tag`, `--attention`, `--watcher`)            |
| `/hydrate`          | Manually trigger a hydration pass for all or a specific watcher                           |
| `/steer`            | Manually trigger the steering step (rule-based + optional LLM)                            |

Examples:

```
/state --attention          # show only needsAttention entries
/state --tag urgent         # show all entries tagged 'urgent'
/state --watcher github     # show all GitHub entries
/watch                      # show scheduler status and watcher health
/steer                      # run steering now (don't wait for hourly tick)
```

---

## LLM Tools (callable by pi's model)

| Tool                   | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `watch_query`          | Query state by tags, watcher, attention status, time range |
| `watch_mark_attention` | Manually promote/demote an entry to/from needsAttention    |
| `watch_trigger_steer`  | Trigger a steering run and return the result               |

Example LLM interaction:

```
You: What GitHub issues need my attention right now?

pi: [calls watch_query({ watcher: "github", needsAttention: true })]
    → 3 entries found:
      github:///owner/repo/issues/42  "Fix auth bug"        [urgent, needs-review]
      github:///owner/repo/issues/51  "Add rate limiting"   [needs-review]
      github:///owner/repo/issues/67  "Update README"       [needs-review]
```

---

## TUI Widgets

The extension adds two persistent UI elements.

**Footer status** (always visible, from `renderFooterStatus()`):

```
👁 sunobomoh · ⚠ 3 attn │ 47 entries │ ↻ 7m
```

**Attention widget** above the editor (when `needsAttention` count > 0, from `renderAttentionWidget()`).
Each entry line: `{emoji} {label — OSC 8 clickable link}  {source}  {age}`.
Age-based brightness decay: full color < 4h · muted 4–24h · dim > 24h.

Default grouping (`"grouping": "none"` — sequential):

```
🔴 Fix auth bug in login flow          gh:#142    2m
👀 Review: Rate limiter PR             gh:#138    8m
🔴 PROJ-99: Increase test coverage     ji:PROJ-99 45m
ℹ️  Deployment window tomorrow          sl:#C01    4h
── 43 more · /state ──────────────────────────────
```

With `"grouping": "tag"`:

```
── 🔴 urgent ──────────────────────────────────────
🔴 Fix auth bug in login flow          gh:#142    2m
🔴 PROJ-99: Increase test coverage     ji:PROJ-99 45m
── 👀 needs-review ────────────────────────────────
👀 Review: Rate limiter PR             gh:#138    8m
── ℹ️  informational ──────────────────────────────
ℹ️  Deployment window tomorrow          sl:#C01    4h
```

Labels are OSC 8 hyperlinks in supported terminals (iTerm2, WezTerm, Kitty, Ghostty).
Clicking a label opens the resolved URL in the browser. Non-supporting terminals show
the label as plain readable text — no functionality is lost.

---

## State File Format

Each line is a JSONL record. IDs are 26-character ULIDs (lexicographically time-sortable).
The `label` field is the human-readable display name used in the TUI widget.

```jsonl
{"type":"state_entry","id":"01HWZK5RQMN1K7XVTGFP0J3NDE","sourceId":"github","sourceUri":"github:///owner/repo/issues/42","label":"Fix auth bug in login flow","timestamp":"2026-05-07T10:00:00Z","tags":["urgent","needs-review"],"outcomes":{"urgent":{"tagId":"urgent","status":"active"},"needs-review":{"tagId":"needs-review","status":"pending"}},"data":{"title":"Fix auth bug in login flow","number":42},"hydratedData":{"body":"..."},"needsAttention":true,"attentionScore":85,"metadata":{"watchedAt":"2026-05-07T10:00:00Z","hydratedAt":"2026-05-07T10:00:03Z"}}
{"type":"scheduler_run","id":"01HWZK5RQMN1K7XVTGFP0J3NEF","timestamp":"2026-05-07T10:00:00Z","watchersRun":["github","jira"],"entriesCreated":5,"errored":[],"durationMs":2100}
{"type":"steering_run","id":"01HWZK5RQMN1K7XVTGFP0J3NFG","timestamp":"2026-05-07T11:00:00Z","completedAt":"2026-05-07T11:00:01Z","promoted":["01HWZK5RQMN1K7XVTGFP0J3NDE"],"demoted":[],"unchanged":["01HWZK5RQMN1K7XVTGFP0J3NGH"],"llmAssisted":false}
{"type":"state_patch","id":"01HWZK5RQMN1K7XVTGFP0J3NHI","targetId":"01HWZK5RQMN1K7XVTGFP0J3NDE","timestamp":"2026-05-07T12:30:00Z","patch":{"outcomes":{"needs-review":{"tagId":"needs-review","status":"resolved","resolvedAt":"2026-05-07T12:30:00Z"}}},"reason":"PR merged"}
```
