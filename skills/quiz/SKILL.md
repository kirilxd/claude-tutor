---
name: quiz
description: Use when user wants to be tested or quizzed on any topic. Triggers on "quiz me", "test me", "test my knowledge", "practice questions", "check my understanding", "mock exam", "practice exam", or when asking for a quiz on something they've been learning. Also use when user finishes a learning module and wants to check understanding. Works with or without a prior learning plan.
---

# Quiz — Interactive Knowledge Testing

Use the `AskUserQuestion` tool for questions that have options (multiple choice, true/false, choosing a topic). Ask short-answer questions as a plain message and let the user type or dictate the answer — offering options would turn recall into recognition.

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

**If the plan has a `deadline`** — open the session with one status line, so the user sees where they stand before the first question:

```
[started]/[total] concepts started · [D] days left · about [N] new concepts per day to cover everything
```

`total` = every `keyConcepts` entry in the plan; `started` = those that have a `spacedRepetition` entry. Then decide what this session spends its time on:

- **Coverage on pace** → due reviews first, then new concepts.
- **Coverage behind** → new concepts first. Review only the due concepts most at risk (most misses, lowest `easeFactor`, or needed for what comes next) and let the rest slide a day or two. A late review costs less than a concept the user never saw before the deadline.
- These are judgment calls, not quotas. Tell the user in one line what you chose and why.

No `deadline` in the plan → skip this block.

### Step 3: Generate Questions

Generate a set of questions (default: 5, user can request more/fewer).

**Mix of formats:**

| Format | Use for | Proportion |
|---|---|---|
| **Multiple choice** (4 options, one correct) | Factual recall, terminology, definitions | ~40% |
| **True/False** | Common misconceptions, nuanced distinctions | ~20% |
| **Short answer** (1-3 sentences) | Conceptual understanding, explanations | ~25% |
| **Fill-in-the-blank** | Syntax, commands, formulas, key terms | ~15% |

**Match the format to how the user will use the knowledge.** The table above is the default when the plan says nothing. If the plan has an `assessment` field, or the user tells you how they will be tested, shift the mix toward that form:

- Explaining aloud or in writing (interview, oral or written exam) → mostly short answer.
- Doing (writing code, commands, calculations) → mostly "write it" and fill-in-the-blank tasks.
- A multiple-choice exam → mostly multiple choice, with some short answer, because recalling an answer builds stronger memory than recognising it (Kang, McDermott & Roediger, 2007).
- No test, just understanding → keep the default mix.

The user's stated preference always wins: if they ask for multiple choice only, give multiple choice only.

**Ask it a new way each time.** When a concept comes back for review, put it in a new scenario or ask it from a different side. The same wording trains the user to recognise the question, not to use the idea.

**Make the user work for the answer.** Effortful recall is what builds memory; a question the user can answer without thinking teaches nothing and gives you a grade you cannot trust.

- A graded question asks the user to **produce or apply** something: write it, predict what happens in a new situation, find the bug, or explain why. A question whose whole answer is one term the explanation just named is a comprehension check, not a graded question.
- **Never show the ingredients of the answer** in the question or just above it (the file path when the answer is a path built from it, the rule when the answer is that rule).
- **A concept taught in this session** gets its first graded question after a gap (other concepts in between, or the next session), and where possible combined with an older concept. Give that first grade a short interval: a right answer minutes after teaching is weak evidence.
- **Watch the run of answers.** Several in a row right without effort means the questions are too easy: raise the level (combine concepts, less familiar scenario, write instead of predict) and tell the user. Several in a row missed means step down. Aim for questions the user gets right with effort, not ones they get right at a glance.

**Question quality rules:**
- Questions should test understanding, not trick the user
- Wrong MCQ options should be plausible (common misconceptions), not obviously wrong
- Short answer questions should have clear evaluation criteria (key concepts to look for)
- Each question should map to a specific concept from the learning plan
- One ask per question. "What happens, and why?" is two questions: the user answers the first and loses the grade on the second. Ask the why as a follow-up if the answer leaves it out

### Step 4: Deliver Interactively

Ask ONE question per message. Give clear options and descriptions for multiple choice, true/false, and fill-in-the-blank; ask short answer as a plain message with no options. Wait for the user's answer before proceeding to the next.

**Question format examples:**

Multiple choice — "Q1/5 (Multiple Choice) — Which Kubernetes object ensures a specified number of pod replicas are running?" with 4 options, each with a short description.

True/False — "Q2/5 (True or False) — In TCP, the receiver sends acknowledgments for every individual packet." with True/False options, each with a clarifying description.

Fill-in-the-blank — "Q3/5 (Fill in the Blank) — The kubectl command to view all running pods is: kubectl _____ pods -n <namespace>" with 4 options.

Short answer — "Q4/5 (Short Answer) — Explain the difference between a Pod and a Deployment." No options: the user answers in their own words.

**After the user answers, give feedback:**

Grade **every** answer on four levels and show the grade — never leave an answer ungraded:

| Grade | When | Counts as |
|---|---|---|
| **Again** | Blank, wrong, or built on a misconception | incorrect |
| **Hard** | Core idea right, but a detail is wrong or missing, or the answer came with clear hesitation | correct |
| **Good** | Correct and precise | correct |
| **Easy** | Fluent, precise, and applied to a new case without effort | correct |

Read confidence from how the user answers (hedging, "I guess", a long pause they mention) — don't ask for it separately. A confident wrong answer is a misconception: name the wrong belief explicitly in the feedback, because that is the error feedback fixes best. A hesitant right answer is Hard, not Good.

If correct (Hard / Good / Easy):
> [Grade] — [1-2 sentence explanation reinforcing the concept; for Hard, name the missing detail]

If incorrect (Again):
> Again — the answer is [correct answer]. [2-3 sentence explanation helping the user understand]

**Retry an Again answer in the same session.** After 2-3 questions on other concepts, ask the missed concept once more in a new scenario, until the user gets it right once. Only the first answer sets the grade and the schedule; the retry is practice. Never retry straight after the explanation — the answer is still on screen.

**When a concept is stuck, stop quizzing it.** A concept is stuck when the user has missed it in about three sessions or more (count its `"correct": false` entries across `quizzes`). Asking the same thing again tests nothing new and only costs time. Change the approach instead:

1. **Look for a shared cause.** If several stuck concepts fail in the same way, one missing prerequisite is probably behind them. Teach that one thing first; it may clear them all.
2. **A procedure** (writing code, a command, a calculation, a derivation) — split it into parts small enough to get right one at a time, and track each part as its own concept named `[concept]: [part]`. Take each part through three stages, one stage per successful review, one stage back on a miss:
   - **Worked example** — show a full solution; the user explains why each step is there. Save with `"format": "worked-example"`.
   - **Fill the gap** — show the solution with one part missing; the user supplies it. Save with `"format": "completion"`.
   - **Alone** — the user writes it from nothing (any normal format).

   The `format` of the part's last question tells you which stage comes next.
3. **A fact or an idea** — teach it again in a different way (a new analogy, or a direct contrast with the concept it gets confused with), then return it to normal reviews.

Tell the user in one line that you are changing approach and why.

For short answers, evaluate for key concepts, not exact wording. If partially correct, say what they got right and what's missing. Be encouraging but honest.

Then immediately ask the next question — no extra text between feedback and the next question.

### Step 5: Show Results

After all questions, present a summary:

```
── Results: [Topic] ──────────────────────
Score: [correct]/[total] ([percentage]%)

[For each question:]
[✓/✗] Q[n]: [brief concept label] — [grade] → next review [date]

[If there are wrong answers:]
Weak areas: [list concepts that need review]
Suggestion: [specific actionable advice]

Session: [n] questions — [n] on new concepts, [n] reviews · [n] concepts moved forward
[If the plan has a deadline:] Coverage: [started]/[total] concepts started · [D] days left
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
          "correct": true,
          "grade": "good",
          "note": "optional — what was wrong or missing, in a few words"
        }
      ]
    }
  ],
  "weakAreas": ["concept-a", "concept-b"],
  "strongAreas": ["concept-c", "concept-d"],
  "overallScore": 80
}
```

Add a `note` to a question graded Again or Hard, saying what was wrong or missing (for example `"confused perm level with role"`). Before asking a concept again, read its last `note` and aim the new question at that exact gap. Leave `note` out for Good and Easy.

**CRITICAL format rules — the web dashboard reads these files, so the format must be exact:**

- `overallScore` is a percentage (0-100), NOT a fraction. `80` not `0.8`.
- `weakAreas` and `strongAreas` are arrays of **strings** (concept names), NOT objects.
  - CORRECT: `"weakAreas": ["DNS resolution", "CNAME records"]`
  - WRONG: `"weakAreas": [{"concept": "DNS resolution", "moduleId": 1}]`
- `spacedRepetition` keys must be **concept names** (matching the `concept` field in questions), NOT module IDs.
  - CORRECT: `"spacedRepetition": {"DNS resolution": {...}}`
  - WRONG: `"spacedRepetition": {"1": {...}, "2": {...}}`
- Each question's `grade` is one of `"again"`, `"hard"`, `"good"`, `"easy"`. `correct` is `false` for `again` and `true` for the other three. Older entries without `grade` are fine.
- All `spacedRepetition` values must have `easeFactor` (number), `intervalDays` (integer), `nextReview` (YYYY-MM-DD string), `repetitions` (integer). None can be null.

**Compute weak/strong areas (aggregate across ALL quizzes):**
- For each concept that has ever appeared in any quiz question, count total attempts and correct answers
- Concepts correct in <50% of attempts → `weakAreas` (as plain strings)
- Concepts correct in >=80% of attempts → `strongAreas` (as plain strings)
- `overallScore` = round(total correct across all quizzes / total questions across all quizzes × 100)

**Update spaced repetition schedule:**

For each concept tested in this quiz, set its next review from the grade. There is no fixed formula: the goal is to ask again just before the user would forget, and to spend no review time on what they already know. Start from these defaults, then adjust by judgment:

| Grade | Next review | Also |
|---|---|---|
| **Again** | 1 day (plus the same-session retry) — or about a quarter of the previous interval if that was long | `repetitions` = 0, `easeFactor` − 0.2 |
| **Hard** | ~3 days, or previous interval × 1.2 if longer | `repetitions` += 1, `easeFactor` − 0.15 |
| **Good** | ~1 week, or previous interval × `easeFactor` if longer | `repetitions` += 1 |
| **Easy** | ~2 weeks, or previous interval × `easeFactor` × 1.3 if longer | `repetitions` += 1, `easeFactor` + 0.15 |

`easeFactor` never goes below 1.3. `nextReview` = today + `intervalDays` (format: YYYY-MM-DD).

Adjust the default when you have a reason, and tell the user in one short line why:
- **The concept's history** — a Good after three misses is less stable than a Good on a concept never missed: shorten it. A long run of Good/Easy: lengthen it.
- **The concept itself** — a hard, easily-confused, or foundational concept comes back sooner than an isolated fact.
- **A miss is not a reset.** One slip on a well-known concept should not send it back to daily review.

- **A deadline** — no review lands after the plan's `deadline`. When the default would, bring it back so one more review falls before it; a gap of roughly 10-20% of the time left holds best for a test at that distance (Cepeda et al., 2008). Spread these final reviews over the last days instead of piling them on the day before.

A concept "moved forward" in the results when its new interval is longer than its previous one.

Only quiz a concept when its `nextReview` is today or earlier, apart from the same-session retry. Reviewing something the user still remembers well wastes their time.

For new concepts (not yet in `spacedRepetition`), start from `easeFactor: 2.5`, `intervalDays: 1`, `repetitions: 0`, then apply the grade of the first answer.

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

## Mock Exam Mode

Use when the user asks for a mock exam, practice exam, or final test (`/quiz [topic] mock`), or offer one yourself when a plan's `deadline` is close and most concepts have been started. A normal quiz teaches as it goes; a mock exam measures. It shows the user what the real test will feel like and shows you where the remaining time should go.

**How it differs from a normal quiz:**

- **Everything is in scope.** Draw questions from every module, in mixed order, whether or not the concepts are due. Include concepts not yet started — a blank there is useful information.
- **Exam format.** Use the plan's `assessment` form if there is one. Ask the user how long the real test is and how many questions it has, and mirror that; if they don't know, agree on a length together.
- **No feedback during the exam.** After each answer, say only "Noted" and ask the next question. No grades, no explanations, no retries, no hints.
- **Timed if the real test is.** State the time limit at the start and tell the user when it is over. You cannot run a clock, so ask the user to keep time.

**After the last question:**

1. Grade every answer on the four levels and show the full results, grouped by module, with the correct answer and a short explanation for each miss.
2. Reschedule every concept that was tested from its grade, as in Step 6. This is the one case where a concept's review moves although it was not due. Concepts that were not tested keep their schedule.
3. Save it as a quiz with `"difficulty": "mock"` and `"module": null`.
4. End with a plan for the time left: the modules that scored lowest, and what to do about each (new teaching, worked examples, or just reviews).

## No-Plan Quiz Mode

If a user asks to be quizzed on a topic with no existing learning plan:
- Generate questions from Claude's own knowledge
- Still deliver interactively with feedback
- Still save progress to enable tracking
- Suggest: "Want me to create a full learning plan for this topic? Use /learn [topic]"
