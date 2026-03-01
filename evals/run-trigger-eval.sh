#!/bin/bash
# Trigger evaluation — tests whether skills trigger on expected prompts.
# Uses claude -p (print mode) with --max-turns 1 to check routing only.
#
# Usage: ./evals/run-trigger-eval.sh [--verbose]
# Requires: claude CLI, jq

set -u

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EVAL_FILE="$(dirname "$0")/evals.json"
VERBOSE="${1:-}"
PASS=0
FAIL=0
TOTAL=0

if ! command -v claude &>/dev/null; then
  echo "Error: claude CLI not found" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq not found" >&2
  exit 1
fi

run_test() {
  local id="$1"
  local prompt="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))

  # Run claude in print mode with --verbose (required for stream-json)
  # --max-turns 1: just check if skill triggers, don't execute
  local output
  output=$(claude -p "$prompt" \
    --plugin-dir "$PLUGIN_DIR" \
    --output-format stream-json \
    --verbose \
    --max-turns 1 \
    2>/dev/null) || true

  # Check if the expected skill was triggered.
  # In stream-json, a Skill tool_use looks like:
  #   "name":"Skill","input":{"skill":"claude-tutor:learn",...}
  # The skill name is prefixed with "claude-tutor:" by the plugin system.
  local triggered=false

  # Primary: Check for Skill tool_use with matching skill name
  if echo "$output" | grep -q "\"name\":\"Skill\"" 2>/dev/null; then
    # Match "claude-tutor:learn" or just "learn" in the skill field
    if echo "$output" | grep -qE "\"skill\":\"(claude-tutor:)?$expected\"" 2>/dev/null; then
      triggered=true
    fi
  fi

  # Fallback: Check permission_denials (skill triggered but was denied)
  if [ "$triggered" = false ]; then
    if echo "$output" | grep -q "permission_denials" 2>/dev/null; then
      if echo "$output" | grep -qE "\"skill\":\"(claude-tutor:)?$expected\"" 2>/dev/null; then
        triggered=true
      fi
    fi
  fi

  if [ "$triggered" = true ]; then
    echo "  ✓ #$id: '$prompt' → $expected"
    PASS=$((PASS + 1))
  else
    echo "  ✗ #$id: '$prompt' → expected $expected (not triggered)"
    FAIL=$((FAIL + 1))
    if [ "$VERBOSE" = "--verbose" ]; then
      echo "    Output (first 200 chars): $(echo "$output" | head -c 200)"
    fi
  fi
}

echo "Trigger Evaluation — claude-tutor"
echo "Plugin: $PLUGIN_DIR"
echo ""

# Read evals from JSON and run each
EVAL_COUNT=$(jq '.trigger_evals | length' "$EVAL_FILE")
for i in $(seq 0 $((EVAL_COUNT - 1))); do
  id=$(jq -r ".trigger_evals[$i].id" "$EVAL_FILE")
  prompt=$(jq -r ".trigger_evals[$i].prompt" "$EVAL_FILE")
  expected=$(jq -r ".trigger_evals[$i].should_trigger" "$EVAL_FILE")
  run_test "$id" "$prompt" "$expected"
done

echo ""
echo "Results: $PASS/$TOTAL passed ($FAIL failed)"
exit $((FAIL > 0 ? 1 : 0))
