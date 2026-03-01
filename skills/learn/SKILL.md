---
name: learn
description: Use when user wants to learn a topic or create a study plan. Triggers on "teach me", "I want to learn", "explain X to me", "study", "help me understand", "where do I start with", "how do I get into", or any request to understand a subject in depth. Covers both technical topics (programming, system design, DevOps) and general knowledge (history, science, languages, music theory). Also use when someone asks for a "learning path", "roadmap", or "curriculum" for a topic — even if they don't explicitly say "learn".
---

# Learn — Topic Research & Learning Plan Generator

## Overview

Guide the user from a vague "I want to learn X" into a structured, researched learning plan with curated resources. Ask clarifying questions, research the topic, and produce a module-by-module plan saved to disk.

## File Storage Rules — EXACT PATHS (no deviation)

The learning system uses three separate directories. Each directory has ONE purpose:

| Directory | Stores | Allowed fields |
|---|---|---|
| `~/.claude/learning/plans/` | Learning plans ONLY | topic, slug, created, level, goal, depth, timeCommitment, modules, totalEstimatedTime, diagnostic |
| `~/.claude/learning/progress/` | Quiz progress ONLY | topic, quizzes, weakAreas, strongAreas, overallScore, spacedRepetition |
| `~/.claude/learning/` (root) | index.json + profile.json ONLY | topics (index), learningStyle/background/createdTopics (profile) |

CORRECT — saving a learning plan:    `~/.claude/learning/plans/dns-2026-03-29.json`
WRONG — saving a learning plan:      `~/.claude/learning/progress/dns.json`

CORRECT — saving quiz progress:      `~/.claude/learning/progress/dns.json`
WRONG — saving quiz progress:        `~/.claude/learning/plans/dns-2026-03-29.json`

CORRECT — saving any learning data: `~/.claude/learning/plans/dns-2026-03-29.json`
WRONG — saving to project directory: `./learning/plans/dns-2026-03-29.json`

Always use the ABSOLUTE path `~/.claude/learning/` — never a relative path like `./learning/`.
Never add quiz fields (quizzes, weakAreas, strongAreas, spacedRepetition, overallScore) to plan files.
Never add plan fields (modules, resources, goal, depth, timeCommitment) to progress files.
Verify the path is correct BEFORE writing.

## Process

### Check for Existing Topic

Before starting a new plan, check if this topic already exists.

Read `~/.claude/learning/index.json` and look for a matching topic (fuzzy match same as quiz skill: "k8s" → "kubernetes").

**If the topic exists:**
1. Read the plan file and progress file
2. Show a brief status:

```
── Resuming: [Topic] ────────────────────
Level: [level] | Modules: [completed]/[total] | Score: [score]%
Last activity: [date]
──────────────────────────────────────────
```

3. Determine the next action:
   - If no quizzes taken on any module: "Ready to start learning? I'll teach you Module 1: [title]"
   - If some modules quizzed: "You left off at Module [N]: [title]. Continue?"
   - If all modules quizzed with score >80%: "You've completed this topic! Want to retake quizzes on weak areas, or adjust the plan?"
4. If user wants to continue, teach the next incomplete module interactively (see Phase 5: Teach)
5. If user wants to adjust, load the existing plan and let them modify it

**If the topic is new:** proceed to Phase 0 (profile) and Phase 1 (scope).

### Phase 0: Load or Create Learner Profile

Read `~/.claude/learning/profile.json` if it exists.

**If profile exists:**
- Greet the user by acknowledging their learning style and background
- Skip questions about learning style and background in Phase 1 — you already know
- Still ask topic-specific questions (level, goal, focus areas)

**If no profile exists (first time):**
- During Phase 1, include the learning style question (see Phase 1 examples)
- After Phase 1, save the profile as JSON to `~/.claude/learning/profile.json` (create directory if needed):
  - `learningStyle`: the user's choice (e.g., "hands-on")
  - `background`: extracted from level + goal answers
  - `createdTopics`: array with the current topic slug

**If profile exists and this is a new topic:**
- Append the topic slug to `createdTopics` array

### Phase 1: Clarify Scope

Ask 2-5 clarifying questions, skipping any already answered by the user's initial message. One question per message — wait for the user's answer before the next.

You MUST call the AskUserQuestion tool to deliver each question. Do NOT write questions as plain text. Your response for each question must consist of a single AskUserQuestion tool call and nothing else — no text before or after it.

**Question 1 — Current level:**

Call the AskUserQuestion tool with:
- question: "What's your current experience with [topic]?"
- header: "Level"
- multiSelect: false
- options:
  - No experience (Complete beginner, starting from scratch)
  - Some basics (Familiar with core ideas but not hands-on)
  - Intermediate (Working knowledge, want to go deeper)
  - Advanced (Strong foundation, want expert-level depth)

**Question 2 — Learning goal:**

Call the AskUserQuestion tool with:
- question: "What do you want to be able to do after learning [topic]?"
- header: "Goal"
- multiSelect: false
- options: Generate 3 topic-specific goals. Each option needs a label and a description.

**Question 3 — Depth** (optional):

Call the AskUserQuestion tool with:
- question: "How deep do you want to go?"
- header: "Depth"
- multiSelect: false
- options:
  - High-level overview (Understand the big picture and key concepts)
  - Working knowledge (Enough to use it confidently day-to-day)
  - Deep expertise (Thorough understanding including edge cases)

**Question 4 — Focus areas** (optional):

Call the AskUserQuestion tool with multiSelect: true and 2-4 topic-specific subtopics. Each option needs a label and description.

**Question 5 — Time commitment** (optional):

Call the AskUserQuestion tool with:
- question: "How much time do you want to invest?"
- header: "Time"
- multiSelect: false
- options:
  - A few hours (Quick introduction to the basics)
  - A weekend (Solid foundation with practice)
  - A week (In-depth study with projects)
  - Ongoing study (Long-term learning commitment)

**If no learner profile exists**, also call the AskUserQuestion tool with:
- question: "How do you prefer to learn?"
- header: "Style"
- multiSelect: false
- options:
  - Reading docs & articles (Text-based, self-paced learning)
  - Watching videos (Visual explanations and walkthroughs)
  - Hands-on projects (Learn by building and experimenting)
  - Theory first (Understand principles, then apply them)

**Guidelines:**
- You MUST use the AskUserQuestion tool for every question — never write questions as text
- One question per tool call — don't combine multiple questions
- If a learner profile exists, skip the learning style question — use the stored preference
- Cap at 5 questions — more than that and users lose patience
- Ask at least 2 (level + goal) — without these the plan can't be properly calibrated

### Phase 1.5: Diagnostic Assessment (non-beginners only)

Skip this phase if the user said they have "no experience" or are a "complete beginner."

For users with some background, generate a 5-question diagnostic quiz to calibrate their actual level. This prevents wasting time on material they already know.

**How to run the diagnostic:**

Generate 5 questions testing foundational concepts at increasing difficulty. Deliver each question by calling the AskUserQuestion tool — one question per tool call, wait for the answer before the next.

**Example — call the AskUserQuestion tool with:**
- question: "Diagnostic Q1/5 — What does DNS stand for and what is its primary function?"
- header: "Diagnostic"
- multiSelect: false
- options:
  - Domain Name System (Translates domain names to IP addresses)
  - Digital Network Service (Manages network connections)
  - Data Name Server (Stores website data)
  - Dynamic Network System (Assigns IP addresses)

- Questions 1-2: Basic terminology and concepts (should be easy for anyone with "some basics")
- Questions 3-4: Intermediate understanding (application of concepts)
- Question 5: Advanced concept (only experts get this right)

After the diagnostic, note which level the user actually tested at:
- 0-1 correct: Suggest starting from beginner despite their self-assessment
- 2-3 correct: Confirmed intermediate — can skip introductory modules
- 4-5 correct: Confirmed advanced — compress fundamentals, focus on depth

Store the diagnostic results in the plan JSON by adding a `diagnostic` field:

```json
{
  "diagnostic": {
    "taken": true,
    "score": 3,
    "total": 5,
    "calibratedLevel": "intermediate",
    "skipModules": []
  }
}
```

Use these results in Phase 3 (Generate Learning Plan) to mark introductory modules as "skippable" or compress them into a quick review.

### Phase 2: Research

Perform **3-5 web searches** with varied queries:

1. `"[topic] learning roadmap [year]"` — find structured learning paths
2. `"best [topic] tutorial for [level]"` — find recommended resources
3. `"[topic] official documentation"` — find authoritative sources
4. `"[topic] [specific subtopic] guide"` — drill into focus areas
5. `"[topic] common mistakes beginners"` — anticipate pitfalls

For each search:
- Use the WebSearch tool
- Fetch the top 2-3 results with WebFetch
- Extract: key concepts, recommended order, good resources, common learning paths

**Synthesize** the research into a coherent structure. Don't just list links — understand what the community recommends and why.

### Phase 3: Generate Learning Plan

Create a structured plan with modules. Present it to the user in readable markdown:

```
## Learning Plan: [Topic]

**Level:** [beginner/intermediate/advanced]
**Goal:** [user's goal]
**Estimated time:** [total]

### Module 1: [Title]
**Time:** [estimate]
**Objectives:**
- [what the user will understand/be able to do]

**Key concepts:** [list]

**Resources:**
- [resource with link and type]

### Module 2: [Title]
...
```

**Rules:**
- 3-8 modules depending on topic depth
- Each module should be completable in one sitting
- Order modules from foundational to advanced
- Include a mix of resource types per module (docs, videos, tutorials, books)
- Note free vs paid resources
- Every module MUST have `keyConcepts` with at least 2 concept strings — the quiz system uses these to generate questions. A module with empty keyConcepts is broken.
- If a diagnostic was taken, mark modules covering concepts the user already knows as "Review (optional)" instead of required

Ask the user: "Does this plan look good? Want to adjust anything — add, remove, or reorder modules?"

### Phase 4: Save

After user approves the plan:

1. **Construct path**: `~/.claude/learning/plans/{topic-slug}-{YYYY-MM-DD}.json`
2. **Verify path** contains `/plans/` — NOT `/progress/`
3. **Create directory** `~/.claude/learning/plans/` if it doesn't exist (use Bash: `mkdir -p`)
4. **Save plan** as JSON to that path — use ONLY the fields listed below:

The JSON format:

```json
{
  "topic": "Topic Name",
  "slug": "topic-name",
  "created": "YYYY-MM-DD",
  "level": "beginner|intermediate|advanced",
  "goal": "user's stated goal",
  "depth": "overview|working-knowledge|deep",
  "timeCommitment": "a few hours|a weekend|a week|ongoing",
  "modules": [
    {
      "id": 1,
      "title": "Module Title",
      "objectives": ["objective 1", "objective 2"],
      "keyConcepts": ["concept1", "concept2"],
      "estimatedTime": "2 hours",
      "resources": [
        {
          "title": "Resource Name",
          "url": "https://...",
          "type": "docs|video|tutorial|book|course",
          "free": true
        }
      ]
    }
  ],
  "totalEstimatedTime": "15 hours"
}
```

3. **Update index** at `~/.claude/learning/index.json`:
   - **Read the existing file first** — do not overwrite other topics
   - If the file doesn't exist, create `{"topics":{}}`
   - Add/update ONLY this topic's entry (preserve all other topics):

```json
{
  "displayName": "Topic Name",
  "planFile": "plans/topic-name-2026-03-01.json",
  "progressFile": "progress/topic-name.json",
  "created": "2026-03-01",
  "lastActivity": "2026-03-01",
  "level": "beginner",
  "modulesCompleted": 0,
  "modulesTotal": 5,
  "quizzesTaken": 0,
  "overallScore": null
}
```

4. **Update profile** at `~/.claude/learning/profile.json`:
   - Read existing profile (or create `{}` if missing)
   - Set `learningStyle` if determined in Phase 1
   - Set `background` from the level
   - Append the topic slug to `createdTopics` array (if not already present)

5. **Confirm** to the user: "Learning plan saved! You can now use `/quiz [topic]` to test your knowledge, or `/resources [topic]` to see all resources."

### Phase 5: Teach (optional)

After saving the plan (or when resuming an existing topic), offer to teach the next incomplete module.

Ask: "Ready to start Module [N]: [title]? I can walk you through it now, or you can study on your own and come back for a quiz."

**If the user wants to be taught:**

Teach the module interactively. The goal is genuine understanding, not information dumping.

**Teaching structure for each module:**

1. **Connect to prior knowledge** — "In the last module you learned [X]. [Topic] builds on that by..." If this is Module 1 or you don't know the user's background, connect to general knowledge or the user's stated goals.

2. **Explain core concepts** — Cover each key concept from the module's `keyConcepts` list. For each concept:
   - Give a clear, concise explanation (2-3 paragraphs max)
   - Use an analogy that connects to something the user likely knows
   - Provide a concrete example
   - If the learner profile says "hands-on", emphasize examples and exercises
   - If "theory-first", lead with principles before examples

3. **Check understanding** — After every 2-3 concepts, call the AskUserQuestion tool with a quick comprehension question. This isn't a quiz — it's a "does this make sense?" check. If the user gets it wrong, re-explain differently before moving on.

4. **Reference resources** — Point to specific resources from the module: "For a deeper dive on this, check out [Resource Title] — it covers [specific aspect]."

5. **Summarize** — At the end of the module, recap the 3-5 key takeaways.

6. **Bridge to next** — "Next up is Module [N+1]: [title], which builds on [concept] you just learned."

7. **Suggest quiz** — "Want to test what you've learned? Run `/quiz [topic]` (and mention the module you just covered) to check your understanding."

**Teaching guidelines:**
- Keep explanations conversational, not textbook-like
- Never go more than 3-4 paragraphs without an interaction point
- If the user seems to be struggling (wrong answers on comprehension checks), slow down and add more examples
- If the user is breezing through, pick up the pace and add depth
- Use the learner profile's learning style to adapt your approach

**If the user declines teaching:**
- Suggest: "No problem! Study at your own pace using the resources in the plan. When you're ready, run `/quiz [topic]` to test your knowledge."

## Topic Slug Convention

Convert topic to kebab-case for filenames: "Kubernetes Networking" → "kubernetes-networking", "Spanish Grammar" → "spanish-grammar". Use lowercase, replace spaces with hyphens, remove special characters.
