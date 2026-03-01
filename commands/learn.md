---
description: Start learning a new topic — asks clarifying questions, researches resources, and creates a structured learning plan
argument-hint: <topic>
allowed-tools: AskUserQuestion, WebSearch, WebFetch, Read, Write, Bash(mkdir *)
---

# /learn

The user wants to learn about: $ARGUMENTS

Follow the `learn` skill instructions to:
1. Check if a plan already exists for this topic (resume if so)
2. Load or create learner profile
3. Ask clarifying questions about scope, level, and goals (one at a time, 2-5 max)
4. If not a beginner, run a diagnostic assessment
5. Research the topic with 3-5 web searches
6. Generate a structured learning plan with modules and curated resources
7. Present the plan for user approval
8. Save to ~/.claude/learning/plans/ and update index.json
9. Offer to start teaching Module 1
