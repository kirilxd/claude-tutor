---
description: Quiz yourself on a topic from your learning plan with adaptive difficulty and mixed question formats
argument-hint: [topic] [--module N] [--count N]
allowed-tools: AskUserQuestion, Read, Write, Bash(mkdir *)
---

# /quiz

The user wants to be quizzed. Arguments: $ARGUMENTS

Follow the `quiz` skill instructions to:
1. Determine the topic and module (from arguments or most recent plan)
2. Load prior performance from ~/.claude/learning/progress/
3. Generate mixed-format questions adapted to their level
4. Deliver questions one at a time with immediate feedback
5. Show results summary and save progress
