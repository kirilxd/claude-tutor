---
name: study
description: Use when the user wants a guided study session and leaves the planning to you. Triggers on "let's start a session", "study session", "I have 30 minutes", "let's study", "continue my studies", "mentor me on", or any request to sit down and study a topic that already has a learning plan. One session mixes due reviews with new teaching inside the user's time budget.
---

# Study — One Guided Session

The user sits down for a fixed time and you run the session: you decide what to review, what to teach, and when to stop. The user should not have to plan anything. A session that only quizzes, or only lectures, or ends early, wastes their time.

This skill is the session's frame. The detailed rules live in two other skills, and you follow them here:

- **Questions, grading, scheduling, saving progress** → the `quiz` skill (Steps 3, 4 and 6). Load it if it is not already in context.
- **Teaching a concept** → the `learn` skill (Phase 5: Teach).

No plan for the topic yet → run the `learn` skill first, then come back.

## 1. Open

1. **Time.** If the user did not say how long they have, ask. If you can run commands, read the clock now (`date +%H:%M`) and note when the session ends; otherwise ask the user to tell you when five minutes are left.
2. **State.** Read the plan (`~/.claude/learning/plans/`) and the progress file (`~/.claude/learning/progress/{topic-slug}.json`), as in the quiz skill's Steps 1-2.
3. **Say the plan in one or two lines** before the first question: where the user stands (concepts started out of total, concepts due, days to the deadline if there is one) and how this session's time will be split between reviews and new material, with the reason.

How to split is a judgment call, not a formula. What to weigh:

- Unstarted concepts against the time left to the goal. Far behind → new material gets most of the session and only the due reviews most at risk are asked.
- How many reviews are due and how shaky they are (see each concept's last `note` and its misses).
- What the user asks for. Their preference wins.

## 2. Run

Alternate between reviewing and teaching; do not do all of one and then all of the other. A typical stretch:

1. One or two due reviews.
2. A new concept: an ungraded guess first, then teach it. Teach **one concept at a time**, small enough to hold in mind: one mechanism per lesson. Its limits, its sibling feature and the list of alternatives are lessons of their own. A long lesson with five new facts uses up the session and leaves nothing to practise with.
3. Check that it landed, right away and ungraded, with one ask: the user explains the mechanism in their own words, or, for something they will have to write, writes it once with the lesson in view. Ask about the core idea (what it does, when it runs), not an edge case or a "why not". Shaky answer, or the user says the lesson did not make sense → teach it again smaller and from another angle, then check again. Good enough (not perfect) → move on. Reading a lesson and jumping straight to another topic leaves the user feeling they learned nothing. A trivial concept can skip this.
4. Something else (another review, or the next guess).
5. The first graded question on the new concept, after that gap. Size it to what the user has practised: do not ask for code from memory that they have never written once. If no gap fits in the time left, do not grade it today: give it a `spacedRepetition` entry due tomorrow.

Keep going by how the answers come:

- Answers come easily → raise the level or move to new material sooner, and say so.
- A miss → the quiz skill's Again rules: short re-teach, retry later in the session.
- Several misses with the **same cause** (for example, each one mixed up two names that had to match) → name the pattern to the user. It is worth more than the individual corrections.
- The user asks for an explanation → give it. It is their session. Then pick the plan back up, and do not grade a question whose answer you have just explained.

## 3. Close

**Check the clock before you wrap up. Never end the session on a guess of how much time has passed.** If time is left, use it: another review, another new concept, or an ungraded guess that sets up the next session. Start closing about two minutes before the end.

1. Show the results as in the quiz skill's Step 5, plus a short list of what was taught but not yet graded.
2. Save progress as in the quiz skill's Step 6.
3. Say in one line what the next session will open with.
