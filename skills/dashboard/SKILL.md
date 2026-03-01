---
name: dashboard
description: Use only when user explicitly asks to "open dashboard", "show dashboard", "launch dashboard", or "learning UI". Opens a local web interface for viewing and editing learning plans, quiz progress, and spaced repetition data.
---

# Dashboard — Learning Data Web UI

The dashboard is a local web server that provides a visual interface for the learning data stored in `~/.claude/learning/`.

To launch: run `/dashboard` or tell the user to run `/dashboard`.

The dashboard runs at `http://localhost:3847` and supports:
- Viewing all topics, plans, and progress
- Editing module order and resources
- Viewing and overriding spaced repetition schedules
- Calendar view of upcoming reviews
- Resetting progress or deleting topics
- Launching quiz/learn sessions in Claude Code
