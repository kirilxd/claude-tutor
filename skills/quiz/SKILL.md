---
name: quiz
description: Use when user wants to be tested or quizzed on any topic. Triggers on "quiz me", "test me", "test my knowledge", "practice questions", "check my understanding", or when asking for a quiz on something they've been learning. Also use when user finishes a learning module and wants to check understanding. Works with or without a prior learning plan.
---

# Quiz — Interactive Knowledge Testing

**ALWAYS** use the `AskUserQuestion` tool when asking the user questions, in any context. If you have too many questions for the tool, split them up into multiple calls.

Generate and deliver mixed-format quiz questions based on the user's learning plan. Ask one question at a time, give immediate feedback, track scores, and adapt difficulty based on prior performance.

## File Storage Rules — EXACT PATHS (no deviation)

Quiz progress is saved to ONE specific directory:

    ~/.claude/learning/progress/{topic-slug}.json

CORRECT path for quiz progress: `~/.claude/learning/progress/dns.json`
WRONG path for quiz progress:   `~/.claude/learning/plans/dns-2026-03-29.json`

CORRECT — saving any learning data: `~/.claude/learning/progress/dns.json`
WRONG — saving to project directory: `./learning/progress/dns.json`

Always use the ABSOLUTE path `~/.claude/learning/` — never a relative path like `./learning/`.
Never write quiz data (quizzes, weakAreas, strongAreas, spacedRepetition, overallScore) to plan files.
Never add extra fields beyond those defined in Step 6's schema.
Verify the path contains `/progress/` before writing.

## Process

### Step 1: Determine Topic & Module

**If the user specified a topic** (e.g., `/quiz kubernetes`):
- Read `~/.claude/learning/index.json`
- Find matching topic (fuzzy match: "k8s" → "kubernetes", "Spanish" → "spanish-grammar")
- If ambiguous, ask the user to clarify

**If no topic specified** (just `/quiz`):
- Read index.json, find topic with most recent `lastActivity`
- Confirm with user: "Quiz you on [topic]?"

**If no learning plans exist:**
- Tell the user: "No learning plans found. Use /learn <topic> to create one first, or tell me a topic and I'll quiz you on general knowledge."
- If user provides a topic without a plan, generate questions from Claude's knowledge (no plan file needed)

**Module targeting:**
- If user says "test me on module 2" or "quiz me on deployments", target that specific module
- Otherwise, quiz across all modules, weighting toward weak areas if prior quiz data exists

### Step 2: Load Prior Performance

You MUST read `~/.claude/learning/progress/[topic-slug].json` before generating questions. This file contains quiz history, weak/strong areas, and spaced repetition schedules. If you skip this step, the quiz won't adapt to the user's level.

**Adaptive difficulty — mention your adjustments to the user:**
- No prior data → generate questions at the plan's level
- Prior overall score > 80% → tell the user "Your score is high, so I'm asking harder, more conceptual questions" and increase difficulty
- Prior overall score < 50% → tell the user "Let's focus on the fundamentals" and decrease difficulty
- Weight questions toward `weakAreas` from prior quizzes
- If `spacedRepetition` data exists, check for concepts where `nextReview` is today or in the past. These are overdue for review — tell the user "You have N concepts due for review" and include them in the quiz

### Step 3: Generate Questions

Generate a set of questions (default: 5, user can request more/fewer).

**Mix of formats:**

| Format | Use for | Proportion |
|---|---|---|
| **Multiple choice** (4 options, one correct) | Factual recall, terminology, definitions | ~40% |
| **True/False** | Common misconceptions, nuanced distinctions | ~20% |
| **Short answer** (1-3 sentences) | Conceptual understanding, explanations | ~25% |
| **Fill-in-the-blank** | Syntax, commands, formulas, key terms | ~15% |

**Question quality rules:**
- Questions should test understanding, not trick the user
- Wrong MCQ options should be plausible (common misconceptions), not obviously wrong
- Short answer questions should have clear evaluation criteria (key concepts to look for)
- Each question should map to a specific concept from the learning plan

### Step 4: Deliver Interactively

Ask ONE question per message. Use multiple choice with clear options and descriptions for every question. Wait for the user's answer before proceeding to the next.

**Question format examples:**

Multiple choice — "Q1/5 (Multiple Choice) — Which Kubernetes object ensures a specified number of pod replicas are running?" with 4 options, each with a short description.

True/False — "Q2/5 (True or False) — In TCP, the receiver sends acknowledgments for every individual packet." with True/False options, each with a clarifying description.

Fill-in-the-blank — "Q3/5 (Fill in the Blank) — The kubectl command to view all running pods is: kubectl _____ pods -n <namespace>" with 4 options.

Short answer — "Q4/5 (Short Answer) — Explain the difference between a Pod and a Deployment. Pick the closest answer." with 2-3 options plus "Other (None of these match my understanding)".

**After the user answers, give feedback:**

If correct:
> Correct! [1-2 sentence explanation reinforcing the concept]

If incorrect:
> Not quite. The answer is [correct answer]. [2-3 sentence explanation helping the user understand]

For short answers, evaluate for key concepts, not exact wording. If partially correct, say what they got right and what's missing. Be encouraging but honest.

Then immediately ask the next question — no extra text between feedback and the next question.

### Step 5: Show Results

After all questions, present a summary:

```
── Results: [Topic] ──────────────────────
Score: [correct]/[total] ([percentage]%)

[For each question:]
[✓/✗] Q[n]: [brief concept label]

[If there are wrong answers:]
Weak areas: [list concepts that need review]
Suggestion: [specific actionable advice]
──────────────────────────────────────────
```

### Step 6: Save Progress

The progress file at `~/.claude/learning/progress/{topic-slug}.json` is the **single source of truth** for quiz data. The web dashboard also reads and writes this file. Always read the existing file first, then append/update — never overwrite from scratch.

1. **Construct path**: `~/.claude/learning/progress/{topic-slug}.json`
2. **Verify path** contains `/progress/` — NOT `/plans/`
3. **Create directory** `~/.claude/learning/progress/` if it doesn't exist
4. **Read the existing file** — if it exists, load its current data and append to it. If it doesn't exist, create a new object
5. **Append** the new quiz to the `quizzes` array (do not replace existing quizzes)
6. **Recompute** `weakAreas`, `strongAreas`, and `overallScore` from ALL quizzes (not just the latest)
7. **Update** `spacedRepetition` for each concept tested
8. **Write** the file using ONLY the fields listed below — no extra fields:

```json
{
  "topic": "topic-slug",
  "quizzes": [
    {
      "date": "YYYY-MM-DD",
      "module": null,
      "score": 4,
      "total": 5,
      "difficulty": "beginner",
      "questions": [
        {
          "format": "mcq",
          "concept": "concept-label",
          "correct": true
        }
      ]
    }
  ],
  "weakAreas": ["concept-a", "concept-b"],
  "strongAreas": ["concept-c", "concept-d"],
  "overallScore": 80
}
```

**CRITICAL format rules — the web dashboard reads these files, so the format must be exact:**

- `overallScore` is a percentage (0-100), NOT a fraction. `80` not `0.8`.
- `weakAreas` and `strongAreas` are arrays of **strings** (concept names), NOT objects.
  - CORRECT: `"weakAreas": ["DNS resolution", "CNAME records"]`
  - WRONG: `"weakAreas": [{"concept": "DNS resolution", "moduleId": 1}]`
- `spacedRepetition` keys must be **concept names** (matching the `concept` field in questions), NOT module IDs.
  - CORRECT: `"spacedRepetition": {"DNS resolution": {...}}`
  - WRONG: `"spacedRepetition": {"1": {...}, "2": {...}}`
- All `spacedRepetition` values must have `easeFactor` (number), `intervalDays` (integer), `nextReview` (YYYY-MM-DD string), `repetitions` (integer). None can be null.

**Compute weak/strong areas (aggregate across ALL quizzes):**
- For each concept that has ever appeared in any quiz question, count total attempts and correct answers
- Concepts correct in <50% of attempts → `weakAreas` (as plain strings)
- Concepts correct in >=80% of attempts → `strongAreas` (as plain strings)
- `overallScore` = round(total correct across all quizzes / total questions across all quizzes × 100)

**Update spaced repetition schedule:**

For each concept tested in this quiz, update the `spacedRepetition` field in the progress file using the SM-2 algorithm:

**For each concept:**
1. Determine quality score (0-5): correct on first try = 5, correct after hesitation = 4, incorrect but close = 2, incorrect = 0
2. If quality >= 3 (correct):
   - If first review (`repetitions` was 0): `intervalDays` = 1
   - If second review (`repetitions` was 1): `intervalDays` = 6
   - Subsequent: `intervalDays` = round(previous interval × `easeFactor`)
   - `repetitions` += 1
3. If quality < 3 (incorrect):
   - Reset: `intervalDays` = 1, `repetitions` = 0
4. Update ease factor: `easeFactor` = max(1.3, easeFactor + 0.1 - (5 - quality) × (0.08 + (5 - quality) × 0.02))
5. Compute `nextReview` = today + `intervalDays` (format: YYYY-MM-DD)

For new concepts (not yet in `spacedRepetition`), initialize with `easeFactor: 2.5`, `intervalDays: 1`, `repetitions: 0`, `nextReview: today + 1 day`.

**Validation before writing:** Every SR entry must have all 4 fields set to non-null values. If any field would be null, use the default: `easeFactor: 2.5`, `intervalDays: 1`, `repetitions: 0`, `nextReview: tomorrow`.

**Updated progress JSON structure:**

```json
{
  "topic": "topic-slug",
  "quizzes": [...],
  "weakAreas": [...],
  "strongAreas": [...],
  "overallScore": 80,
  "spacedRepetition": {
    "concept-label": {
      "easeFactor": 2.5,
      "intervalDays": 6,
      "nextReview": "2026-03-26",
      "repetitions": 2
    }
  }
}
```

This is backwards-compatible — if `spacedRepetition` is missing, treat all concepts as unscheduled.

9. **Update index.json** at `~/.claude/learning/index.json`:
   - Read existing index first
   - Set `topics[slug].quizzesTaken` = total number of quizzes in the progress file
   - Set `topics[slug].overallScore` = the computed overallScore (percentage, 0-100)
   - Set `topics[slug].lastActivity` = today's date (YYYY-MM-DD)

## No-Plan Quiz Mode

If a user asks to be quizzed on a topic with no existing learning plan:
- Generate questions from Claude's own knowledge
- Still deliver interactively with feedback
- Still save progress to enable tracking
- Suggest: "Want me to create a full learning plan for this topic? Use /learn [topic]"
