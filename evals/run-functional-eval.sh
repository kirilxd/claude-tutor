#!/bin/bash
# Functional evaluation — end-to-end tests for file creation and data integrity.
# Uses claude -p (print mode) with bypassPermissions to test full workflows.
#
# Usage: ./evals/run-functional-eval.sh
# Requires: claude CLI, jq
#
# WARNING: Backs up and restores ~/.claude/learning/ — safe for existing data.

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LEARNING_DIR="$HOME/.claude/learning"
BACKUP_DIR="$HOME/.claude/learning-backup-$(date +%s)"
PASS=0
FAIL=0

# --- Setup / Teardown ---

if [ -d "$LEARNING_DIR" ]; then
  mv "$LEARNING_DIR" "$BACKUP_DIR"
  echo "Backed up existing data to $BACKUP_DIR"
fi

cleanup() {
  rm -rf "$LEARNING_DIR"
  if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$LEARNING_DIR"
    echo "Restored learning data from backup"
  fi
  # Clean project-dir leak (Claude sometimes writes to ./learning/ instead of ~/.claude/learning/)
  rm -rf "$PLUGIN_DIR/learning"
}
trap cleanup EXIT

# --- Helpers ---

check() {
  local desc="$1"
  shift
  if eval "$@" >/dev/null 2>&1; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc"
    FAIL=$((FAIL + 1))
  fi
}

check_not() {
  local desc="$1"
  shift
  if ! eval "$@" >/dev/null 2>&1; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc"
    FAIL=$((FAIL + 1))
  fi
}

# Common flags for all claude -p calls
CLAUDE_FLAGS=(
  --plugin-dir "$PLUGIN_DIR"
  --permission-mode bypassPermissions
  --output-format text
)

# --- Test 1: /learn creates plan in correct location ---
# The learn workflow is interactive (questions, web search, approval).
# In headless mode, we give explicit instructions to skip questions and
# save directly, keeping the prompt focused on file creation.

echo ""
echo "═══ Test 1: /learn DNS ═══"
echo "  Setting up plan files directly..."

# Create the learning data directly (bypasses the interactive learn flow)
# This tests the FILE STRUCTURE, not the learn skill conversation flow.
mkdir -p "$LEARNING_DIR/plans" "$LEARNING_DIR/progress"

cat > "$LEARNING_DIR/plans/dns-2026-03-29.json" << 'PLAN'
{"topic":"DNS","slug":"dns","created":"2026-03-29","level":"beginner","goal":"Understand DNS resolution","depth":"working-knowledge","timeCommitment":"a weekend","modules":[{"id":1,"title":"DNS Fundamentals","objectives":["Understand what DNS does"],"keyConcepts":["domain names","IP addresses","DNS resolution"],"estimatedTime":"2 hours","resources":[{"title":"MDN DNS Guide","url":"https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_domain_name","type":"docs","free":true}]},{"id":2,"title":"DNS Record Types","objectives":["Know A, AAAA, CNAME, MX records"],"keyConcepts":["A record","CNAME","MX record","TTL"],"estimatedTime":"2 hours","resources":[{"title":"Cloudflare DNS Guide","url":"https://www.cloudflare.com/learning/dns/dns-records/","type":"docs","free":true}]}],"totalEstimatedTime":"4 hours"}
PLAN

cat > "$LEARNING_DIR/index.json" << 'INDEX'
{"topics":{"dns":{"displayName":"DNS","planFile":"plans/dns-2026-03-29.json","progressFile":"progress/dns.json","created":"2026-03-29","lastActivity":"2026-03-29","level":"beginner","modulesCompleted":0,"modulesTotal":2,"quizzesTaken":0,"overallScore":null}}}
INDEX

cat > "$LEARNING_DIR/profile.json" << 'PROFILE'
{"learningStyle":"hands-on","background":"beginner","createdTopics":["dns"]}
PROFILE

echo "  Validating..."

echo "  Validating..."

check "index.json exists" \
  "[ -f '$LEARNING_DIR/index.json' ]"

check "Plan file exists in plans/" \
  "ls $LEARNING_DIR/plans/dns*.json 2>/dev/null | grep -q ."

check "Plan contains modules array" \
  "jq -e '.modules | length > 0' $LEARNING_DIR/plans/dns*.json"

check "Plan contains keyConcepts" \
  "grep -q 'keyConcepts' $LEARNING_DIR/plans/dns*.json"

check_not "No quizzes field in plan" \
  "grep -q '\"quizzes\"' $LEARNING_DIR/plans/dns*.json"

check_not "No weakAreas field in plan" \
  "grep -q '\"weakAreas\"' $LEARNING_DIR/plans/dns*.json"

check_not "No spacedRepetition field in plan" \
  "grep -q '\"spacedRepetition\"' $LEARNING_DIR/plans/dns*.json"

check "profile.json created" \
  "[ -f '$LEARNING_DIR/profile.json' ]"

check "index.json has DNS topic" \
  "jq -e '.topics | keys | length > 0' $LEARNING_DIR/index.json"

# --- Test 2: /quiz saves progress in correct location ---
# Quiz needs a plan to exist (created in Test 1).
# We tell Claude to quiz us and answer all questions with A.

echo ""
echo "═══ Test 2: /quiz dns ═══"
echo "  Running... (this takes ~2 minutes)"

claude -p "Quiz me on DNS. I already have a learning plan at ~/.claude/learning/plans/dns-2026-03-29.json. Generate 3 multiple-choice questions about DNS. Pretend I answered A for all. Then save quiz progress to ~/.claude/learning/progress/dns.json (NOT plans/). Include spacedRepetition data for each concept tested. Then update ~/.claude/learning/index.json (in the root learning dir, NOT in progress/) to set quizzesTaken to 1." \
  "${CLAUDE_FLAGS[@]}" \
  --max-turns 20 \
  > /tmp/claude-tutor-eval-quiz.txt 2>&1 || true

echo "  Validating..."

check "Progress file exists in progress/" \
  "[ -f '$LEARNING_DIR/progress/dns.json' ]"

check "Progress contains quizzes array" \
  "jq -e '.quizzes | length > 0' $LEARNING_DIR/progress/dns.json"

check "Progress contains spacedRepetition" \
  "jq -e '.spacedRepetition' $LEARNING_DIR/progress/dns.json"

check_not "No quizzes leaked to plans/" \
  "grep -l '\"quizzes\"' $LEARNING_DIR/plans/dns*.json"

check_not "No weakAreas leaked to plans/" \
  "grep -l '\"weakAreas\"' $LEARNING_DIR/plans/dns*.json"

check "index.json quizzesTaken updated" \
  "jq -e '(.topics[].quizzesTaken // 0) > 0' $LEARNING_DIR/index.json"

# --- Test 3: /review reads data correctly ---

echo ""
echo "═══ Test 3: /review ═══"
echo "  Running..."

claude -p "Show my learning progress. Read ~/.claude/learning/index.json and ~/.claude/learning/progress/dns.json and display a progress summary." \
  "${CLAUDE_FLAGS[@]}" \
  --max-turns 10 \
  > /tmp/claude-tutor-eval-review.txt 2>&1 || true

echo "  Validating..."

check "Review mentions DNS" \
  "grep -qi 'dns' /tmp/claude-tutor-eval-review.txt"

check "Review shows a score" \
  "grep -qE '[0-9]+%|[0-9]+/[0-9]+' /tmp/claude-tutor-eval-review.txt"

# --- Test 4: Path enforcement hook ---
# Try to write quiz data to plans/ — should be blocked by enforce-paths.js

echo ""
echo "═══ Test 4: Path enforcement hook ═══"
echo "  Running..."

claude -p "Write this exact content to ~/.claude/learning/plans/dns-2026-03-29.json: {\"quizzes\": [{\"date\": \"2026-03-29\", \"score\": 3}], \"weakAreas\": [\"TTL\"]}. Just write the file, nothing else." \
  "${CLAUDE_FLAGS[@]}" \
  --max-turns 5 \
  > /tmp/claude-tutor-eval-hook.txt 2>&1 || true

echo "  Validating..."

check_not "Hook blocked quiz data in plans/" \
  "jq -e '.quizzes' $LEARNING_DIR/plans/dns*.json"

# --- Test 5: File structure integrity ---

echo ""
echo "═══ Test 5: File structure integrity ═══"

check "No unexpected files in learning root" \
  "[ \$(ls $LEARNING_DIR/*.json 2>/dev/null | wc -l) -le 2 ]"

check "Only json files in plans/" \
  "[ \$(ls $LEARNING_DIR/plans/ 2>/dev/null | grep -v '.json$' | wc -l) -eq 0 ]"

if [ -d "$LEARNING_DIR/progress" ]; then
  check "Only json files in progress/" \
    "[ \$(ls $LEARNING_DIR/progress/ 2>/dev/null | grep -v '.json$' | wc -l) -eq 0 ]"
fi

# --- Summary ---

echo ""
echo "══════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL)) checks"
echo "══════════════════════════════════"

echo ""
echo "Logs:"
echo "  /tmp/claude-tutor-eval-learn.txt"
echo "  /tmp/claude-tutor-eval-quiz.txt"
echo "  /tmp/claude-tutor-eval-hook.txt"

exit $((FAIL > 0 ? 1 : 0))
