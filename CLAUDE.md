# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin that turns Claude into a personal tutor with spaced repetition. Users install it via the plugin marketplace and interact through slash commands (`/learn`, `/quiz`, `/review`, `/resources`, `/dashboard`) or natural language.

## Testing

```bash
node tests/test-hooks.js                              # Hook unit tests (27 tests, instant)
./evals/run-trigger-eval.sh                           # Natural language trigger routing (17 prompts)
./evals/run-functional-eval.sh                        # End-to-end workflows (21 checks)
node skills/dashboard/server/tests/dashboard.test.js  # Dashboard tests (30 scenarios)
```

Run hook tests after any change to `hooks/enforce-paths.js` or data schemas.

## Architecture

The plugin has three layers that work independently:

**Skills** (`skills/*/SKILL.md`) — Markdown instructions that Claude follows. Not code. Each skill defines a multi-phase workflow (e.g., learn: clarify scope → research → generate plan → save). Skills reference data paths and schemas but don't enforce them.

**Hooks** (`hooks/`) — Node.js scripts that enforce data integrity at write time:
- `enforce-paths.js` — PreToolUse hook on Write/Edit. Blocks wrong paths, schema leakage between plan/progress files, unknown fields, and score format errors. This is the safety net for when Claude invents field names.
- `session-start.js` — SessionStart hook. Reads spaced repetition data and prints overdue review reminders.

**Dashboard** (`skills/dashboard/server/`) — Express server at localhost:3847. Reads/writes the same JSON files as the CLI. Has its own validation (`validate.js`) that mirrors the hook logic plus SM-2 algorithm implementation.

## Data Layout

All user data lives in `~/.claude/learning/` (absolute path, never relative):

| Path | Purpose | Allowed top-level fields |
|---|---|---|
| `~/.claude/learning/index.json` | Topic registry | `topics` (map of slug → metadata) |
| `~/.claude/learning/profile.json` | Learner preferences | `learningStyle`, `background`, `createdTopics` |
| `~/.claude/learning/plans/<slug>-<date>.json` | Learning plans | `topic`, `slug`, `created`, `level`, `goal`, `depth`, `timeCommitment`, `modules`, `totalEstimatedTime`, `diagnostic` |
| `~/.claude/learning/progress/<slug>.json` | Quiz progress | `topic`, `quizzes`, `weakAreas`, `strongAreas`, `overallScore`, `spacedRepetition` |

**The critical rule:** Plan fields and progress fields must never cross directories. The hook blocks this, but skills must also get the paths right. `overallScore` is a percentage (0-100), not a fraction (0-1).

## Command → Skill → Tool Chain

Each command (`commands/*.md`) defines `allowed-tools` that restrict what Claude can do:
- `/learn` — AskUserQuestion, WebSearch, WebFetch, Read, Write, Bash(mkdir)
- `/quiz` — AskUserQuestion, Read, Write, Bash(mkdir)
- `/review` — Read only
- `/resources` — WebSearch, WebFetch, Read
- `/dashboard` — Bash(node/npm/cd)

When modifying a skill, check the matching command's `allowed-tools` — the skill can't use tools the command doesn't allow.

## Dashboard Server

The server (`skills/dashboard/server/`) shares data with the CLI via the same JSON files. Key modules:
- `api.js` — REST routes (`/api/stats`, `/api/topics`, `/api/plans/:slug`, `/api/progress/:slug`, etc.)
- `validate.js` — Schema validation + SM-2 algorithm (`updateSM2`, `computeWeakStrong`, `getModuleScores`)
- `sse.js` — Server-sent events for streaming Claude responses to the browser
- `public/app.js` — Vanilla JS SPA (no framework, hash-based routing)

Dashboard runs on port 3847. To run manually: `cd skills/dashboard/server && npm install && node index.js`

## Common Pitfalls

- Claude invents field names like `quiz_history`, `results`, `history` instead of `quizzes` — the hook catches this but skills should use correct names
- Writing to `./learning/` (relative) instead of `~/.claude/learning/` (absolute) — hook blocks this
- Putting quiz data in plan files or vice versa — hook blocks this
- `overallScore: 0.85` instead of `overallScore: 85` — hook blocks this
- Skills reference `AskUserQuestion` tool — each skill has a line enforcing its use, but the model may still fall back to plain text in some Claude Code versions
