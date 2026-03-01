// Schema validation for learning data — mirrors enforce-paths.js logic

const PLAN_FIELDS = ['topic', 'slug', 'created', 'level', 'goal', 'depth', 'timeCommitment', 'modules', 'totalEstimatedTime', 'diagnostic'];
const PROGRESS_FIELDS = ['topic', 'quizzes', 'weakAreas', 'strongAreas', 'overallScore', 'spacedRepetition'];
const QUIZ_FIELDS = ['quizzes', 'weakAreas', 'strongAreas', 'spacedRepetition', 'overallScore'];
const PLAN_ONLY_FIELDS = ['modules', 'resources', 'timeCommitment', 'totalEstimatedTime'];

function validatePlan(data) {
  const errors = [];
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Data must be a JSON object'] };
  }
  const keys = Object.keys(data);
  const unknown = keys.filter(k => !PLAN_FIELDS.includes(k));
  if (unknown.length > 0) {
    errors.push(`Unknown fields in plan: ${unknown.join(', ')}. Allowed: ${PLAN_FIELDS.join(', ')}`);
  }
  const leaked = keys.filter(k => QUIZ_FIELDS.includes(k));
  if (leaked.length > 0) {
    errors.push(`Quiz fields found in plan: ${leaked.join(', ')}. These belong in progress/, not plans/`);
  }
  return { valid: errors.length === 0, errors };
}

function validateProgress(data) {
  const errors = [];
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Data must be a JSON object'] };
  }
  const keys = Object.keys(data);
  const unknown = keys.filter(k => !PROGRESS_FIELDS.includes(k));
  if (unknown.length > 0) {
    errors.push(`Unknown fields in progress: ${unknown.join(', ')}. Allowed: ${PROGRESS_FIELDS.join(', ')}. Use "quizzes" not "quiz_history".`);
  }
  const leaked = keys.filter(k => PLAN_ONLY_FIELDS.includes(k));
  if (leaked.length > 0) {
    errors.push(`Plan fields found in progress: ${leaked.join(', ')}. These belong in plans/, not progress/`);
  }
  if (data.spacedRepetition && typeof data.spacedRepetition === 'object') {
    for (const [concept, sr] of Object.entries(data.spacedRepetition)) {
      if (typeof sr !== 'object' || sr === null) {
        errors.push(`spacedRepetition.${concept} must be an object with {easeFactor, intervalDays, nextReview, repetitions}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// --- SM-2 Spaced Repetition ---

function updateSM2(existing, correct) {
  const quality = correct ? 5 : 0;
  let ef = existing?.easeFactor || 2.5;
  let interval = existing?.intervalDays || 1;
  let reps = existing?.repetitions || 0;

  if (quality >= 3) {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ef);
  } else {
    reps = 0;
    interval = 1;
  }
  ef = Math.max(1.3, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  const next = new Date();
  next.setDate(next.getDate() + interval);

  return {
    easeFactor: Math.round(ef * 100) / 100,
    intervalDays: interval,
    repetitions: reps,
    nextReview: next.toLocaleDateString('sv-SE'),
  };
}

// --- Weak/Strong Area Computation ---

function computeWeakStrong(quizzes) {
  const stats = {};
  for (const quiz of quizzes || []) {
    for (const q of quiz.questions || []) {
      if (!stats[q.concept]) stats[q.concept] = { correct: 0, total: 0 };
      stats[q.concept].total++;
      if (q.correct) stats[q.concept].correct++;
    }
  }
  return {
    weakAreas: Object.entries(stats).filter(([, s]) => s.correct / s.total < 0.5).map(([c]) => c),
    strongAreas: Object.entries(stats).filter(([, s]) => s.correct / s.total >= 0.8).map(([c]) => c),
    overallScore: Math.round(
      Object.values(stats).reduce((s, v) => s + v.correct, 0) /
      Math.max(1, Object.values(stats).reduce((s, v) => s + v.total, 0)) * 100
    ),
  };
}

// --- Per-Module Scores ---

function getModuleScores(plan, progress) {
  return (plan.modules || []).map(mod => {
    const concepts = new Set(mod.keyConcepts || []);
    let correct = 0, total = 0;
    for (const quiz of progress.quizzes || []) {
      for (const q of quiz.questions || []) {
        if (concepts.has(q.concept)) { total++; if (q.correct) correct++; }
      }
    }
    return {
      moduleId: mod.id, title: mod.title, correct, total,
      score: total > 0 ? Math.round(correct / total * 100) : null,
    };
  });
}

// --- Topic Slug ---

function toSlug(topic) {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = {
  validatePlan, validateProgress, PLAN_FIELDS, PROGRESS_FIELDS,
  updateSM2, computeWeakStrong, getModuleScores, toSlug,
};
