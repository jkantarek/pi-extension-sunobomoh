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

## Configure a watcher

Create `.pi/sunobomoh.config.json` in your project root:

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
        "token": "GITHUB_TOKEN"
      }
    },
    {
      "id": "filesystem",
      "config": {
        "paths": ["./src", "./docs"],
        "extensions": [".ts", ".md"]
      }
    }
  ]
}
```

---

## Write your first watcher

```typescript
// .pi/watchers/my-jira-watcher.ts
import type { WatcherDefinition } from '@your-org/pi-extension-sunobomoh';
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
  id: 'jira',
  name: 'Jira Issues',
  description: 'Polls open Jira issues assigned to you',

  configSchema: Type.Object({
    baseUrl: Type.String(),
    token: Type.String(),
    projectKey: Type.String(),
  }),

  async watch(config, signal) {
    const resp = await fetch(
      `${config.baseUrl}/rest/api/3/search?jql=assignee=currentUser()`,
      { headers: { Authorization: `Bearer ${config.token}` }, signal }
    );
    const body = await resp.json() as { issues: JiraIssue[] };
    return body.issues;
  },

  extractUri(issue, config) {
    return `jira:///${config.baseUrl}/browse/${issue.key}`;
  },

  extractTags(issue) {
    const tags: string[] = ['needs-review'];
    if (issue.priority === 'High' || issue.priority === 'Critical') {
      tags.push('urgent');
    }
    return tags;
  },

  // Hydrator: fetch full issue description
  hydrators: [
    {
      id: 'jira-description-hydrator',
      name: 'Jira Description',
      description: 'Fetches full description for each issue',
      async hydrate(entries, signal) {
        return Promise.all(
          entries.map(async (entry) => ({
            ...entry,
            hydratedData: { summary: (entry.data as JiraIssue).summary },
            metadata: { ...entry.metadata, hydratedAt: new Date().toISOString() },
          }))
        );
      },
    },
  ],

  // Side effects (Active Record callbacks)
  sideEffects: [
    {
      id: 'skip-resolved',
      phase: 'before_watch',
      async handler(ctx) {
        // Abort the watch tick on weekends
        const day = new Date().getDay();
        if (day === 0 || day === 6) return { halt: true };
      },
    },
    {
      id: 'log-urgent-after-hydrate',
      phase: 'after_hydrate',
      async handler(ctx) {
        const urgent = ctx.entries.filter(e => e.tags.includes('urgent'));
        if (urgent.length > 0) {
          console.warn(`[sunobomoh] ${urgent.length} urgent Jira issues found`);
        }
      },
    },
  ],
};
```

Register it in your pi extension or AGENTS.md skill:

```typescript
// .pi/extensions/register-watchers.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getSunobomoh } from '@your-org/pi-extension-sunobomoh';
import { jiraWatcher } from './watchers/my-jira-watcher.js';

export default function (pi: ExtensionAPI) {
  const sunobomoh = getSunobomoh(pi);
  sunobomoh.registerWatcher(jiraWatcher, {
    owner: 'your-org',
    repo: 'your-repo',
    token: process.env.JIRA_TOKEN ?? '',
    projectKey: 'PROJ',
  });
}
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/watch` | Show registered watchers, last-run times, entry counts |
| `/state` | Query and display current state (supports `--tag`, `--attention`, `--watcher`) |
| `/hydrate` | Manually trigger a hydration pass for all or a specific watcher |
| `/steer` | Manually trigger the steering step (rule-based + optional LLM) |

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

| Tool | Description |
|------|-------------|
| `watch_query` | Query state by tags, watcher, attention status, time range |
| `watch_mark_attention` | Manually promote/demote an entry to/from needsAttention |
| `watch_trigger_steer` | Trigger a steering run and return the result |

Example LLM interaction:

```
You: What GitHub issues need my attention right now?

pi: [calls watch_query({ watcher: "github", needsAttention: true })]
    → 3 entries found:
      github:///owner/repo/issues/42  "Fix auth bug"  [urgent, needs-review]
      github:///owner/repo/issues/51  "Add rate limiting"  [needs-review]
      github:///owner/repo/issues/67  "Update README"  [needs-review]
```

---

## TUI Widgets

The extension adds two persistent UI elements:

**Footer status** (always visible):
```
cwd: ~/project  session: abc123  ...  ● sunobomoh: 3 watchers | next: 7m | ⚠ 2 need attention
```

**Widget above editor** (when `needsAttention` count > 0):
```
┌─ Sunobomoh ──────────────────────────────────────────┐
│ ⚠  2 items need attention                            │
│    github:///owner/repo/issues/42  [urgent]          │
│    jira:///jira.corp.com/browse/PROJ-99  [urgent]    │
└──────────────────────────────────────────────────────┘
```

---

## State File Format

```jsonl
{"type":"state_entry","id":"a1b2c3","sourceId":"github","sourceUri":"github:///owner/repo/issues/42","timestamp":"2026-05-07T10:00:00Z","tags":["urgent","needs-review"],"outcomes":{"urgent":{"tagId":"urgent","status":"active"},"needs-review":{"tagId":"needs-review","status":"pending"}},"data":{"title":"Fix auth bug","number":42},"hydratedData":{"body":"..."},"needsAttention":true,"attentionScore":85,"metadata":{"watchedAt":"2026-05-07T10:00:00Z","hydratedAt":"2026-05-07T10:00:03Z"}}
{"type":"scheduler_run","id":"r1","timestamp":"2026-05-07T10:00:00Z","watchersRun":["github","jira"],"entriesCreated":5,"errored":[],"durationMs":2100}
{"type":"steering_run","id":"s1","timestamp":"2026-05-07T11:00:00Z","completedAt":"2026-05-07T11:00:01Z","promoted":["a1b2c3"],"demoted":[],"unchanged":["d4e5f6"],"llmAssisted":false}
{"type":"state_patch","id":"p1","targetId":"a1b2c3","timestamp":"2026-05-07T12:30:00Z","patch":{"outcomes":{"needs-review":{"tagId":"needs-review","status":"resolved","resolvedAt":"2026-05-07T12:30:00Z"}}},"reason":"PR merged"}
```
