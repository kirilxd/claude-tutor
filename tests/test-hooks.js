#!/usr/bin/env node
/**
 * Unit tests for enforce-paths.js hook.
 * Run: node tests/test-hooks.js
 */

const { execSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'hooks', 'enforce-paths.js');
const HOME = process.env.HOME;
let pass = 0;
let fail = 0;

function runHook(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${HOOK}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() || '' };
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    fail++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Quiz data → plans/ (should BLOCK) ---

console.log('\nBlocking quiz data in plans/:');

test('blocks quizzes field in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"quizzes": [], "weakAreas": ["tcp"]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('progress'), `Should suggest progress/ path`);
});

test('blocks weakAreas field in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/k8s-2026-03-29.json`,
    content: '{"topic": "k8s", "weakAreas": ["pods"]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks spacedRepetition field in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"spacedRepetition": {"dns-basics": {}}}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks overallScore field in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"overallScore": 0.8}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

// --- Plan data → progress/ (should BLOCK) ---

console.log('\nBlocking plan data in progress/:');

test('blocks modules field in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"modules": [{"id": 1}]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('plans/'), `Should suggest plans/ path`);
});

test('blocks resources field in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"resources": [{"title": "MDN"}]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks timeCommitment field in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"timeCommitment": "a weekend"}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

// --- Correct writes (should ALLOW) ---

console.log('\nAllowing correct writes:');

test('allows plan data in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"topic": "DNS", "modules": [{"id": 1}], "totalEstimatedTime": "10h"}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

test('allows quiz data in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"quizzes": [], "overallScore": 80, "spacedRepetition": {}}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

test('allows index.json in root', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/index.json`,
    content: '{"topics": {}}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

test('allows profile.json in root', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/profile.json`,
    content: '{"learningStyle": "hands-on"}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

// --- Root directory protection ---

console.log('\nBlocking unexpected files in root:');

test('blocks random json in learning root', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/quiz-history.json`,
    content: '{"history": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('index.json'), `Should mention allowed files`);
});

// --- Non-learning paths (should ALLOW) ---

console.log('\nIgnoring non-learning paths:');

test('allows writes outside learning directory', () => {
  const r = runHook({
    file_path: '/tmp/anything.json',
    content: '{"quizzes": [], "modules": []}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

test('allows writes to other .claude paths', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/settings.json`,
    content: '{"hooks": {}}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

// --- Edit tool (new_string instead of content) ---

console.log('\nEdit tool (new_string field):');

test('blocks quiz data via Edit tool in plans/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    new_string: '"quizzes": [{"date": "2026-03-29"}]',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

// --- Schema validation: wrong field names ---

console.log('\nBlocking wrong field names in progress/:');

test('blocks quiz_history instead of quizzes in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"topic": "dns", "quiz_history": [{"date": "2026-03-29"}]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('quiz_history'), `Should mention the wrong field`);
  assert(r.stderr.includes('quizzes'), `Should suggest correct field name`);
});

test('blocks results instead of quizzes in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"topic": "dns", "results": [1, 2, 3]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks history instead of quizzes in progress/', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"topic": "dns", "history": [], "scores": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('allows correct progress schema', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"topic": "dns", "quizzes": [], "weakAreas": [], "strongAreas": [], "overallScore": 80, "spacedRepetition": {}}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

test('blocks overallScore as fraction (0.8 instead of 80)', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/progress/dns.json`,
    content: '{"topic": "dns", "quizzes": [], "overallScore": 0.8}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('percentage'), `Should mention percentage`);
});

console.log('\nBlocking wrong field names in plans/:');

test('blocks quiz_history in plan files', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"topic": "DNS", "slug": "dns", "quiz_history": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks scores in plan files', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"topic": "DNS", "slug": "dns", "scores": [80, 90]}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('allows correct plan schema', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"topic": "DNS", "slug": "dns", "created": "2026-03-29", "level": "beginner", "goal": "learn", "modules": []}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

// --- Blocking project-directory writes ---

console.log('\nBlocking project-directory writes:');

test('blocks relative path learning/plans/', () => {
  const r = runHook({
    file_path: 'learning/plans/dns-2026-03-29.json',
    content: '{"topic": "DNS", "modules": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('~/.claude/learning/'), `Should suggest correct path`);
});

test('blocks ./learning/progress/ relative path', () => {
  const r = runHook({
    file_path: './learning/progress/dns.json',
    content: '{"quizzes": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('blocks absolute project path /Users/.../learning/plans/', () => {
  const r = runHook({
    file_path: '/Users/kiril/Documents/claude-tutor/learning/plans/dns-2026-03-29.json',
    content: '{"topic": "DNS", "modules": []}',
  });
  assert(r.exitCode === 2, `Expected exit 2, got ${r.exitCode}`);
});

test('still allows correct ~/.claude/learning/plans/ path', () => {
  const r = runHook({
    file_path: `${HOME}/.claude/learning/plans/dns-2026-03-29.json`,
    content: '{"topic": "DNS", "slug": "dns", "modules": []}',
  });
  assert(r.exitCode === 0, `Expected exit 0, got ${r.exitCode}`);
});

// --- Summary ---

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
