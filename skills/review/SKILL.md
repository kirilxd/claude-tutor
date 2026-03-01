---
name: review
description: Use when user asks about their learning progress or wants study guidance. Triggers on "how am I doing", "my progress", "what should I study next", "show my scores", "what are my weak areas", "review my learning", "how well do I know X", or any request to see quiz results, track improvement, or decide what to focus on next. Also use when the user seems unsure what to study — this skill provides data-driven recommendations.
---

# Review — Learning Progress Dashboard

## Overview

Show the user their learning progress across all topics or for a specific topic. Display quiz scores, module completion, weak areas, score trends, and actionable next steps.

## Data Schemas

The review skill reads data written by the learn and quiz skills. Here are the formats you'll encounter:

**index.json** (`~/.claude/learning/index.json`) — master registry:
```json
{
  "topics": {
    "topic-slug": {
      "displayName": "Topic Name",
      "planFile": "plans/topic-slug-2026-03-01.json",
      "progressFile": "progress/topic-slug.json",
      "created": "2026-03-01",
      "lastActivity": "2026-03-01",
      "level": "beginner",
      "modulesCompleted": 0,
      "modulesTotal": 5,
      "quizzesTaken": 1,
      "overallScore": 0.8
    }
  }
}
```

**Plan files** (`~/.claude/learning/plans/<slug>-<date>.json`) — contain `modules[]` with `id`, `title`, `objectives`, `keyConcepts`, `estimatedTime`, `resources[]`.

**Progress files** (`~/.claude/learning/progress/<slug>.json`) — contain `quizzes[]` (each with `date`, `module`, `score`, `total`, `questions[]`), `weakAreas[]`, `strongAreas[]`, `overallScore` (percentage 0-100, not fraction).

Progress files now also contain `spacedRepetition` — a map of concept labels to SM-2 scheduling data (`easeFactor`, `intervalDays`, `nextReview`, `repetitions`). Concepts with `nextReview` at or before today are due for review.

## Process

### Step 1: Load Data

Read `~/.claude/learning/index.json`.

**If file doesn't exist or is empty:**
- Tell the user: "No learning data found yet. Use /learn <topic> to start your first topic!"
- Stop here.

**If user specified a topic** (e.g., `/review kubernetes`):
- Load that topic's plan and progress files
- Show detailed single-topic view

**If no topic specified:**
- Load all topics from index
- Show overview of all topics

### Step 2: Display Progress

**All-topics overview format:**

```
── Learning Progress ─────────────────────────────

[Topic Name] (started [date])
  Module 1: [Title]    [progress bar] [score]%  ([N] quizzes)
  Module 2: [Title]    [progress bar] not started
  ...
  Weak areas: [list]
  Next step: [actionable suggestion]

[Topic Name 2] ...

── Due for Review ────────────────────────────────
  [Topic]: [N] concepts due ([list top 3 concept names])
  [Topic 2]: [N] concepts due ([list top 3])

  Run /quiz [topic] to review these concepts.
──────────────────────────────────────────────────

── Summary ───────────────────────────────────────
  Active topics: [N]
  Total quizzes taken: [N]
  Average score: [N]%
  Suggested focus: [topic — reason]
──────────────────────────────────────────────────
```

**Due for review section:**

If any concepts have `nextReview` at or before today across any topic, show the "Due for Review" block between the per-topic details and the Summary (as shown above). If no concepts are due, omit this block entirely.

**Progress bar rendering:**
- Use Unicode block characters: `█` for filled, `░` for empty
- 10 characters wide
- Based on quiz scores for that module (no quizzes = all empty)

**Single-topic detailed format:**
- Show all modules with per-module quiz history
- Show score trend if multiple quizzes (e.g., "Module 1: 60% → 75% → 90%")
- List all weak and strong areas
- Show total time estimated vs modules completed
- Suggest specific module to focus on next

### Step 3: Recommend Next Action

Always end with one clear, actionable suggestion:

- If concepts are due for review (nextReview <= today): "You have [N] concepts due for review in [topic]. Run `/quiz [topic]` to keep them fresh — spaced repetition works best when you review on schedule."
- If a topic has weak areas: "Retake the quiz on [topic] focusing on [weak area]. Use `/quiz [topic]`"
- If a module is unstarted: "Start Module [N]: [title]. Check `/resources [topic]` for study materials"
- If all modules are strong: "Great work on [topic]! Consider exploring a related topic or increasing the difficulty"
- If multiple topics exist: prioritize the one with lowest score or most staleness
