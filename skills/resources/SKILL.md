---
name: resources
description: Use when user asks for learning resources, recommendations, or materials on any topic. Triggers on "find me resources", "what should I read about", "best tutorials for", "recommend a book on", "good courses for", "where can I learn more about", "any videos on", or any request for curated study materials. Also use when user wants to browse what's available before committing to a full learning plan — this skill works with or without an existing plan.
---

# Resources — Curated Learning Materials

**ALWAYS** use the `AskUserQuestion` tool when asking the user questions, in any context. If you have too many questions for the tool, split them up into multiple calls.

## Overview

Provide curated external resources for a topic, either from an existing learning plan or via fresh web research. Group by type, note free vs paid, and organize by module when a plan exists.

## Data Schemas

The resources skill reads data written by the learn skill. Here are the formats:

**index.json** (`~/.claude/learning/index.json`) — look up `topics[slug].planFile` to find the plan path.

**Plan files** (`~/.claude/learning/plans/<slug>-<date>.json`) — contain `modules[]`, each with `resources[]` where each resource has `title`, `url`, `type` (docs|video|tutorial|book|course), and `free` (boolean).

## Process

### Step 1: Check for Existing Plan

Read `~/.claude/learning/index.json` and look for the requested topic.

**If a plan exists:**
- Read the plan JSON from `~/.claude/learning/plans/[file]`
- Extract all resources organized by module
- Present them grouped by type within each module

**If no plan exists:**
- Perform fresh web research (3-5 searches, same as the learn skill's research phase)
- Curate and present results

### Step 2: Present Resources

**With existing plan — organize by module:**

```
── Resources: [Topic] ────────────────────────────

### Module 1: [Title]

📖 Documentation
  • [Title] — [url]
    [one-line description if helpful]

🎥 Videos & Courses
  • [Title] — [url] (free|$paid)

📝 Tutorials
  • [Title] — [url]

📚 Books
  • [Title] — [author] (free|$paid)

### Module 2: [Title]
...
──────────────────────────────────────────────────
```

**Without plan — organize by type:**

```
── Resources: [Topic] ────────────────────────────

📖 Official Documentation
  • ...

🎥 Video Courses
  • ...

📝 Tutorials & Articles
  • ...

📚 Books
  • ...

💡 Tip: Use /learn [topic] to create a structured learning
   plan that organizes these resources into modules.
──────────────────────────────────────────────────
```

### Resource Quality Rules

- Prefer official documentation and well-known sources
- Always note free vs paid
- Include a mix of formats (not all videos, not all text)
- For subtopic-specific requests, focus resources narrowly
- If resources from the plan are stale or broken, supplement with fresh search
