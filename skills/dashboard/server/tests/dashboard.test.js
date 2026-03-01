/**
 * Dashboard end-to-end tests using Playwright MCP.
 *
 * Prerequisites:
 *   - Server running: node skills/dashboard/server/index.js
 *   - Playwright MCP plugin installed in Claude Code
 *
 * Usage:
 *   Run from Claude Code with Playwright MCP available.
 *   These tests are designed to be executed by Claude using the
 *   Playwright MCP tools (browser_navigate, browser_click, etc.)
 *
 * Test data:
 *   Tests seed their own data in ~/.claude/learning/ and clean up after.
 */

// --- Test Scenarios ---

const SCENARIOS = [
  // === RENDERING ===
  {
    id: 'R1',
    name: 'Dashboard home — stats bar renders with correct data',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Take snapshot',
      'Verify: heading "Dashboard" exists',
      'Verify: 4 stat cards visible (Topics, Quizzes, Avg Score, Due Reviews)',
      'Verify: Topics shows "1", Quizzes shows "2", Avg Score shows "80%", Due Reviews shows "1"',
    ],
  },
  {
    id: 'R2',
    name: 'Dashboard home — overdue alert banner',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Verify: alert containing "overdue" and "CNAME" is visible',
      'Verify: "View calendar" link points to #/calendar',
    ],
  },
  {
    id: 'R3',
    name: 'Dashboard home — topic card with correct metadata',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Verify: card with title "DNS" exists',
      'Verify: "BEGINNER" badge visible',
      'Verify: "Modules: 0/3" text present',
      'Verify: "Quizzes: 2" text present',
      'Verify: "Score: 80%" text present',
      'Verify: Plan, Progress, Delete buttons visible',
    ],
  },
  {
    id: 'R4',
    name: 'Plan view — header and modules',
    steps: [
      'Navigate to http://localhost:3847/#/plans/dns',
      'Verify: heading "DNS" exists',
      'Verify: "BEGINNER" and "WORKING-KNOWLEDGE" badges visible',
      'Verify: goal text "Understand DNS resolution" present',
      'Verify: "Start Learning", "Start Quiz", "View Progress" buttons exist',
      'Verify: 3 module cards visible with titles "DNS Fundamentals", "DNS Record Types", "DNS Tools"',
      'Verify: each module shows estimated time',
      'Verify: module 1 has up button disabled, module 3 has down button disabled',
    ],
  },
  {
    id: 'R5',
    name: 'Plan view — module expand shows details',
    steps: [
      'Navigate to http://localhost:3847/#/plans/dns',
      'Click module 1 header ("DNS Fundamentals")',
      'Verify: objectives list visible ("Understand what DNS does", "Know the DNS hierarchy")',
      'Verify: concept tags visible ("domain names", "IP addresses", "DNS resolution")',
      'Verify: resource "Cloudflare DNS Guide" with type "DOCS" visible',
    ],
  },
  {
    id: 'R6',
    name: 'Progress view — stats, badges, quiz history, SR table',
    steps: [
      'Navigate to http://localhost:3847/#/progress/dns',
      'Verify: heading "DNS — Progress"',
      'Verify: "Back to plan" link exists',
      'Verify: stat cards show Overall 80%, Quizzes 2, Strong 4, Weak 1',
      'Verify: green badges for strong areas (DOMAIN-NAMES, DNS-RESOLUTION, TTL, A-RECORD)',
      'Verify: red badge for weak area (CNAME)',
      'Verify: Score Trend chart container visible',
      'Verify: Quiz History table with 2 rows (2026-04-03 3/5, 2026-04-05 4/5)',
      'Verify: Spaced Repetition table with 5 rows',
      'Verify: CNAME row shows "DUE" badge, others show "SCHEDULED"',
      'Verify: date picker inputs present in SR table',
      'Verify: "Start Quiz" and "Reset Progress" buttons at bottom',
    ],
  },
  {
    id: 'R7',
    name: 'Calendar view — monthly grid with overdue and upcoming',
    steps: [
      'Navigate to http://localhost:3847/#/calendar',
      'Verify: heading "Review Calendar"',
      'Verify: overdue alert "1 concept(s) overdue for review"',
      'Verify: month/year header "APRIL 2026" with prev/next arrows',
      'Verify: 7 day headers (SUN through SAT)',
      'Verify: today cell (Apr 6) has highlight',
      'Verify: Apr 4 cell contains "CNAME" in red/overdue style',
      'Verify: Apr 11 cell contains 4 concepts in cyan/upcoming style',
    ],
  },
  {
    id: 'R8',
    name: 'Profile view — displays current profile data',
    steps: [
      'Navigate to http://localhost:3847/#/profile',
      'Verify: heading "Learner Profile"',
      'Verify: Learning Style dropdown shows "Hands-on projects"',
      'Verify: Background input shows "beginner"',
      'Verify: Topics Created shows "dns"',
      'Verify: Save button exists',
    ],
  },
  {
    id: 'R9',
    name: 'Empty state — no topics',
    steps: [
      'Clear all topics from index.json (PUT /api empty index or delete all)',
      'Navigate to http://localhost:3847/#/',
      'Verify: "No learning topics yet" message visible',
      'Verify: /learn command suggestion visible',
      'Restore test data after',
    ],
  },

  // === WRITE OPERATIONS ===
  {
    id: 'W1',
    name: 'Module reorder — move module 2 up',
    steps: [
      'Navigate to http://localhost:3847/#/plans/dns',
      'Note current order: 1=DNS Fundamentals, 2=DNS Record Types, 3=DNS Tools',
      'Click the up arrow button on module 2 (DNS Record Types)',
      'Verify: page re-renders with new order: 1=DNS Record Types, 2=DNS Fundamentals, 3=DNS Tools',
      'Verify: GET /api/plans/dns returns modules in new order',
      'Restore original order (click up on module 2 again)',
    ],
  },
  {
    id: 'W2',
    name: 'SR date override — change nextReview date',
    steps: [
      'Navigate to http://localhost:3847/#/progress/dns',
      'Find the date picker input for "CNAME" concept',
      'Change the date to "2026-04-20"',
      'Verify: GET /api/progress/dns shows spacedRepetition.CNAME.nextReview = "2026-04-20"',
      'Restore original date "2026-04-04"',
    ],
  },
  {
    id: 'W3',
    name: 'Profile save — change learning style',
    steps: [
      'Navigate to http://localhost:3847/#/profile',
      'Change Learning Style dropdown to "Reading docs & articles"',
      'Click Save button',
      'Verify: GET /api/profile returns learningStyle = "reading"',
      'Restore to "hands-on"',
    ],
  },
  {
    id: 'W4',
    name: 'Delete topic — removes plan, progress, and index entry',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Click Delete button on DNS topic card',
      'Verify: confirm dialog appears with "Delete" and "Cancel" buttons',
      'Click "Delete" in dialog',
      'Verify: topic card disappears, empty state shows',
      'Verify: GET /api/topics returns empty topics object',
      'Verify: plan and progress files deleted from disk',
      'Restore test data after',
    ],
  },
  {
    id: 'W5',
    name: 'Reset progress — clears quiz data but keeps plan',
    steps: [
      'Navigate to http://localhost:3847/#/progress/dns',
      'Click "Reset Progress" button',
      'Verify: confirm dialog appears',
      'Click "Delete" in dialog',
      'Verify: page shows "No quiz data yet" empty state',
      'Verify: GET /api/topics/dns shows quizzesTaken=0, overallScore=null',
      'Verify: plan file still exists',
      'Restore progress data after',
    ],
  },

  // === NAVIGATION ===
  {
    id: 'N1',
    name: 'Calendar month navigation — prev and next',
    steps: [
      'Navigate to http://localhost:3847/#/calendar',
      'Verify: shows "APRIL 2026"',
      'Click left arrow (prev month)',
      'Verify: shows "MARCH 2026"',
      'Click right arrow twice (back to April, then to May)',
      'Verify: shows "MAY 2026"',
      'Navigate back to April',
    ],
  },
  {
    id: 'N2',
    name: 'Navigation between views via links',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Click "Plan" on DNS topic card',
      'Verify: URL is #/plans/dns, plan view renders',
      'Click "View Progress" button',
      'Verify: URL is #/progress/dns, progress view renders',
      'Click "Back to plan" link',
      'Verify: URL is #/plans/dns',
      'Click "Dashboard" in nav sidebar',
      'Verify: URL is #/, dashboard renders',
    ],
  },
  {
    id: 'N3',
    name: 'Nav sidebar active state updates',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Verify: "Overview" nav link has active styling',
      'Click "Calendar" in nav',
      'Verify: "Calendar" nav link has active styling, "Overview" does not',
      'Click "Profile" in nav',
      'Verify: "Profile" nav link has active styling',
    ],
  },

  // === ERROR HANDLING ===
  {
    id: 'E1',
    name: 'Plan not found — shows error',
    steps: [
      'Navigate to http://localhost:3847/#/plans/nonexistent',
      'Verify: error alert "Plan not found" is visible',
    ],
  },
  {
    id: 'E2',
    name: 'Progress not found — shows empty state',
    steps: [
      'Delete progress file for dns',
      'Navigate to http://localhost:3847/#/progress/dns',
      'Verify: "No quiz data yet" empty state visible',
      'Verify: /quiz dns command suggestion visible',
      'Restore progress file',
    ],
  },

  // === INTERACTIVE FEATURES ===
  {
    id: 'I1',
    name: 'Create Topic form — renders all fields',
    steps: [
      'Navigate to http://localhost:3847/#/create',
      'Verify: heading "Create Learning Plan"',
      'Verify: Topic text input exists',
      'Verify: Level dropdown (beginner/intermediate/advanced)',
      'Verify: Goal textarea exists',
      'Verify: Depth dropdown (high-level/working knowledge/deep)',
      'Verify: Focus Areas text input exists',
      'Verify: Time Commitment dropdown',
      'Verify: Learning Style dropdown (pre-filled from profile)',
      'Verify: "Create Plan" button exists',
    ],
  },
  {
    id: 'I2',
    name: 'Create Topic — validates required fields',
    steps: [
      'Navigate to http://localhost:3847/#/create',
      'Click "Create Plan" without entering a topic',
      'Verify: alert or validation error appears',
    ],
  },
  {
    id: 'I3',
    name: 'Quiz setup — renders with module selector',
    steps: [
      'Navigate to http://localhost:3847/#/quiz/dns',
      'Verify: heading "Quiz"',
      'Verify: Topic shows "dns"',
      'Verify: Module dropdown with "All modules" + per-module options',
      'Verify: Questions dropdown (3/5/10)',
      'Verify: "Start Quiz" button exists',
    ],
  },
  {
    id: 'I4',
    name: 'Quiz auto-select — no slug defaults to most recent topic',
    steps: [
      'Navigate to http://localhost:3847/#/quiz',
      'Verify: quiz setup renders (not error)',
      'Verify: Topic field shows a slug (most recent from index)',
    ],
  },
  {
    id: 'I5',
    name: 'Plan view — shows Start Quiz and Learn Module buttons',
    steps: [
      'Navigate to http://localhost:3847/#/plans/dns',
      'Verify: "Start Quiz" link points to #/quiz/dns',
      'Verify: "View Progress" link points to #/progress/dns',
      'Click to expand module 1',
      'Verify: "Learn This Module" button visible inside expanded module',
      'Verify: "Learn This Module" link points to #/teach/dns/1',
    ],
  },
  {
    id: 'I6',
    name: 'Plan view — diagnostic button shown for non-beginner topics',
    steps: [
      'Create a topic with level "intermediate" (via API or test data)',
      'Navigate to #/plans/<slug>',
      'Verify: "Test Your Level" button visible',
      'Verify: button links to #/diagnostic/<slug>',
      'For beginner topics, verify button is NOT shown',
      'Clean up test topic',
    ],
  },
  {
    id: 'I7',
    name: 'Dashboard — recommendations card shows correct action',
    steps: [
      'Seed data with overdue SR concepts',
      'Navigate to http://localhost:3847/#/',
      'Verify: "Suggested Next Step" card visible',
      'Verify: card message mentions "due for review"',
      'Verify: "Start Review" button links to #/quiz/<slug>',
    ],
  },
  {
    id: 'I8',
    name: 'Dashboard — nav has New Topic and Quiz links',
    steps: [
      'Navigate to http://localhost:3847/#/',
      'Verify: nav sidebar contains "New Topic" link to #/create',
      'Verify: nav sidebar contains "Quiz" link to #/quiz',
      'Click "New Topic" — verify create form renders',
      'Click "Quiz" — verify quiz setup renders',
    ],
  },
  {
    id: 'I9',
    name: 'Recommendations endpoint — returns correct priorities',
    steps: [
      'GET /api/recommendations',
      'Verify: returns array sorted by priority',
      'Verify: SR due concepts have priority 1',
      'Verify: weak areas have priority 2',
      'Verify: each recommendation has type, slug, message',
    ],
  },
  {
    id: 'I10',
    name: 'Quiz submit — saves progress with SM-2 and weak/strong',
    steps: [
      'POST /api/quiz/submit with {slug: "dns", answers: [{concept: "test-concept", correct: true}]}',
      'Verify: response contains progress with quizzes array',
      'Verify: response contains spacedRepetition with updated SM-2 data',
      'Verify: response contains weakAreas and strongAreas',
      'Verify: GET /api/topics/dns shows updated quizzesTaken and overallScore',
      'Clean up: remove quiz entry from progress',
    ],
  },
  {
    id: 'I11',
    name: 'Module scores endpoint — returns per-module quiz data',
    steps: [
      'GET /api/progress/dns/modules',
      'Verify: returns array of module objects',
      'Verify: each module has moduleId, title, correct, total, score',
      'Verify: modules with no quiz data have score: null',
    ],
  },
];

// Export for documentation / runner
if (typeof module !== 'undefined') {
  module.exports = { SCENARIOS };
}

// Pretty print if run directly
if (typeof require !== 'undefined' && require.main === module) {
  console.log(`Dashboard Test Scenarios: ${SCENARIOS.length} total\n`);
  for (const s of SCENARIOS) {
    console.log(`[${s.id}] ${s.name}`);
    s.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
    console.log();
  }
  const byCategory = {
    Rendering: SCENARIOS.filter(s => s.id.startsWith('R')),
    'Write Operations': SCENARIOS.filter(s => s.id.startsWith('W')),
    Navigation: SCENARIOS.filter(s => s.id.startsWith('N')),
    'Error Handling': SCENARIOS.filter(s => s.id.startsWith('E')),
    'Interactive Features': SCENARIOS.filter(s => s.id.startsWith('I')),
  };
  console.log('Summary:');
  for (const [cat, tests] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${tests.length} scenarios`);
  }
}
