const express = require('express');
const fs = require('fs');
const path = require('path');
const { validatePlan, validateProgress, updateSM2, computeWeakStrong, getModuleScores, toSlug } = require('./validate');
const { sendEvent, initSSE, streamClaude, extractJSON } = require('./sse');

const router = express.Router();
const LEARNING_DIR = path.join(process.env.HOME, '.claude', 'learning');

// --- Helpers ---

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function getIndex() {
  return readJson(path.join(LEARNING_DIR, 'index.json')) || { topics: {} };
}

function findPlanFile(slug) {
  const index = getIndex();
  const topic = index.topics[slug];
  if (topic && topic.planFile) {
    const abs = path.join(LEARNING_DIR, topic.planFile);
    if (fs.existsSync(abs)) return abs;
  }
  // Fallback: glob for slug-*.json
  const plansDir = path.join(LEARNING_DIR, 'plans');
  if (!fs.existsSync(plansDir)) return null;
  const files = fs.readdirSync(plansDir)
    .filter(f => f.startsWith(slug + '-') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(plansDir, files[0]) : null;
}

// --- Stats ---

router.get('/stats', (req, res) => {
  const index = getIndex();
  const topics = Object.values(index.topics || {});
  const today = new Date().toISOString().split('T')[0];
  let dueCount = 0;

  for (const topic of topics) {
    const progPath = path.join(LEARNING_DIR, topic.progressFile || `progress/${topic.slug || 'unknown'}.json`);
    const prog = readJson(progPath);
    if (!prog || !prog.spacedRepetition) continue;
    for (const sr of Object.values(prog.spacedRepetition)) {
      if (sr.nextReview && sr.nextReview <= today) dueCount++;
    }
  }

  res.json({
    totalTopics: topics.length,
    totalQuizzes: topics.reduce((s, t) => s + (t.quizzesTaken || 0), 0),
    avgScore: topics.length > 0
      ? Math.round(topics.filter(t => t.overallScore != null).reduce((s, t) => s + (t.overallScore || 0), 0) / Math.max(1, topics.filter(t => t.overallScore != null).length))
      : null,
    dueCount,
  });
});

// --- Topics ---

router.get('/topics', (req, res) => {
  res.json(getIndex());
});

router.get('/topics/:slug', (req, res) => {
  const index = getIndex();
  const topic = index.topics[req.params.slug];
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  res.json({ slug: req.params.slug, ...topic });
});

router.delete('/topics/:slug', (req, res) => {
  const index = getIndex();
  const slug = req.params.slug;
  const topic = index.topics[slug];
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  // Delete plan file
  if (topic.planFile) {
    const planPath = path.join(LEARNING_DIR, topic.planFile);
    if (fs.existsSync(planPath)) fs.unlinkSync(planPath);
  }
  // Delete progress file
  if (topic.progressFile) {
    const progPath = path.join(LEARNING_DIR, topic.progressFile);
    if (fs.existsSync(progPath)) fs.unlinkSync(progPath);
  }
  // Remove from index
  delete index.topics[slug];
  writeJson(path.join(LEARNING_DIR, 'index.json'), index);
  res.json({ deleted: slug });
});

// --- Plans ---

router.get('/plans/:slug', (req, res) => {
  const planFile = findPlanFile(req.params.slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });
  res.json(readJson(planFile));
});

router.put('/plans/:slug/modules', (req, res) => {
  const planFile = findPlanFile(req.params.slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });

  const plan = readJson(planFile);
  plan.modules = req.body.modules;

  const { valid, errors } = validatePlan(plan);
  if (!valid) return res.status(400).json({ errors });

  writeJson(planFile, plan);
  res.json(plan);
});

router.put('/plans/:slug/modules/:moduleId/resources', (req, res) => {
  const planFile = findPlanFile(req.params.slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });

  const plan = readJson(planFile);
  const mod = plan.modules.find(m => String(m.id) === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  mod.resources = req.body.resources;

  const { valid, errors } = validatePlan(plan);
  if (!valid) return res.status(400).json({ errors });

  writeJson(planFile, plan);
  res.json(plan);
});

// --- Progress ---

router.get('/progress/:slug', (req, res) => {
  const progPath = path.join(LEARNING_DIR, 'progress', `${req.params.slug}.json`);
  const data = readJson(progPath);
  if (!data) return res.status(404).json({ error: 'Progress not found' });
  res.json(data);
});

router.delete('/progress/:slug', (req, res) => {
  const slug = req.params.slug;
  const progPath = path.join(LEARNING_DIR, 'progress', `${slug}.json`);
  if (fs.existsSync(progPath)) fs.unlinkSync(progPath);

  // Reset index entry
  const index = getIndex();
  if (index.topics[slug]) {
    index.topics[slug].quizzesTaken = 0;
    index.topics[slug].overallScore = null;
    index.topics[slug].modulesCompleted = 0;
    writeJson(path.join(LEARNING_DIR, 'index.json'), index);
  }
  res.json({ reset: slug });
});

router.put('/progress/:slug/spaced-repetition/:concept', (req, res) => {
  const slug = req.params.slug;
  const concept = decodeURIComponent(req.params.concept);
  const progPath = path.join(LEARNING_DIR, 'progress', `${slug}.json`);
  const data = readJson(progPath);
  if (!data) return res.status(404).json({ error: 'Progress not found' });

  if (!data.spacedRepetition || !data.spacedRepetition[concept]) {
    return res.status(404).json({ error: `Concept "${concept}" not found` });
  }

  if (req.body.nextReview) data.spacedRepetition[concept].nextReview = req.body.nextReview;
  if (req.body.intervalDays != null) data.spacedRepetition[concept].intervalDays = req.body.intervalDays;
  if (req.body.repetitions != null) data.spacedRepetition[concept].repetitions = req.body.repetitions;

  const { valid, errors } = validateProgress(data);
  if (!valid) return res.status(400).json({ errors });

  writeJson(progPath, data);
  res.json(data.spacedRepetition[concept]);
});

// --- Calendar ---

router.get('/calendar', (req, res) => {
  const index = getIndex();
  const today = new Date().toISOString().split('T')[0];
  const overdue = [];
  const upcoming = {};

  for (const [slug, topic] of Object.entries(index.topics || {})) {
    const progPath = path.join(LEARNING_DIR, topic.progressFile || `progress/${slug}.json`);
    const prog = readJson(progPath);
    if (!prog || !prog.spacedRepetition) continue;

    for (const [concept, sr] of Object.entries(prog.spacedRepetition)) {
      if (!sr.nextReview) continue;
      const entry = {
        topic: topic.displayName || slug,
        slug,
        concept,
        easeFactor: sr.easeFactor,
        intervalDays: sr.intervalDays,
        repetitions: sr.repetitions,
        nextReview: sr.nextReview,
      };
      if (sr.nextReview <= today) {
        overdue.push(entry);
      } else {
        if (!upcoming[sr.nextReview]) upcoming[sr.nextReview] = [];
        upcoming[sr.nextReview].push(entry);
      }
    }
  }

  res.json({ overdue, upcoming, today });
});

// --- Profile ---

router.get('/profile', (req, res) => {
  const data = readJson(path.join(LEARNING_DIR, 'profile.json'));
  res.json(data || { learningStyle: null, background: null, createdTopics: [] });
});

router.put('/profile', (req, res) => {
  const data = readJson(path.join(LEARNING_DIR, 'profile.json')) || {};
  if (req.body.learningStyle !== undefined) data.learningStyle = req.body.learningStyle;
  if (req.body.background !== undefined) data.background = req.body.background;
  writeJson(path.join(LEARNING_DIR, 'profile.json'), data);
  res.json(data);
});

// --- Learn: Create Plan ---

router.post('/learn/create', (req, res) => {
  const { topic, level, goal, depth, focusAreas, timeCommitment, learningStyle } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const slug = toSlug(topic);
  const today = new Date().toLocaleDateString('sv-SE');
  const focusStr = focusAreas ? `Focus especially on: ${focusAreas}.` : '';

  const prompt = `Research "${topic}" and create a structured learning plan.

Level: ${level || 'beginner'}
Goal: ${goal || 'Understand the topic thoroughly'}
Depth: ${depth || 'working-knowledge'}
Time: ${timeCommitment || 'a weekend'}
${focusStr}

Do 3-5 web searches to find the best resources. Then output a JSON learning plan with this EXACT structure (no other text, ONLY the JSON):
{
  "topic": "${topic}",
  "slug": "${slug}",
  "created": "${today}",
  "level": "${level || 'beginner'}",
  "goal": "${goal || ''}",
  "depth": "${depth || 'working-knowledge'}",
  "timeCommitment": "${timeCommitment || 'a weekend'}",
  "modules": [
    {
      "id": 1,
      "title": "Module Title",
      "objectives": ["objective 1"],
      "keyConcepts": ["concept1", "concept2"],
      "estimatedTime": "2 hours",
      "resources": [{"title": "Name", "url": "https://...", "type": "docs|video|tutorial|book|course", "free": true}]
    }
  ],
  "totalEstimatedTime": "X hours"
}

Include 3-8 modules. Each module should have 2-5 keyConcepts and 1-3 resources with real URLs.`;

  streamClaude(res, prompt, {
    onStatus: (msg, r) => sendEvent(r, 'status', msg),
    onComplete: (output, r) => {
      const plan = extractJSON(output);
      if (!plan || !plan.modules) {
        sendEvent(r, 'error', 'Failed to generate plan — Claude did not return valid JSON');
        return;
      }

      // Validate and save
      const { valid, errors } = validatePlan(plan);
      if (!valid) {
        sendEvent(r, 'error', `Invalid plan: ${errors.join(', ')}`);
        return;
      }

      // Save plan
      const planFile = `plans/${slug}-${today}.json`;
      writeJson(path.join(LEARNING_DIR, planFile), plan);

      // Update index
      const index = getIndex();
      index.topics[slug] = {
        displayName: topic,
        planFile,
        progressFile: `progress/${slug}.json`,
        created: today,
        lastActivity: today,
        level: level || 'beginner',
        modulesCompleted: 0,
        modulesTotal: plan.modules.length,
        quizzesTaken: 0,
        overallScore: null,
      };
      writeJson(path.join(LEARNING_DIR, 'index.json'), index);

      // Update profile
      const profilePath = path.join(LEARNING_DIR, 'profile.json');
      const profile = readJson(profilePath) || { createdTopics: [] };
      if (learningStyle) profile.learningStyle = learningStyle;
      if (level) profile.background = level;
      if (!profile.createdTopics) profile.createdTopics = [];
      if (!profile.createdTopics.includes(slug)) profile.createdTopics.push(slug);
      writeJson(profilePath, profile);

      sendEvent(r, 'plan', plan);
      sendEvent(r, 'saved', { slug, planFile });
    },
  });
});

// --- Quiz: Generate ---

router.get('/quiz/generate', (req, res) => {
  let { slug, count, module: modId } = req.query;
  count = parseInt(count) || 5;

  // Default to most recent topic
  if (!slug) {
    const index = getIndex();
    const entries = Object.entries(index.topics || {});
    if (entries.length === 0) {
      return res.status(404).json({ error: 'No topics found' });
    }
    entries.sort((a, b) => (b[1].lastActivity || '').localeCompare(a[1].lastActivity || ''));
    slug = entries[0][0];
  }

  const planFile = findPlanFile(slug);
  const plan = planFile ? readJson(planFile) : null;
  const progPath = path.join(LEARNING_DIR, 'progress', `${slug}.json`);
  const progress = readJson(progPath);
  const today = new Date().toLocaleDateString('sv-SE');

  // Build context for Claude
  let conceptsContext = '';
  if (plan) {
    let modules = plan.modules || [];
    if (modId) modules = modules.filter(m => String(m.id) === String(modId));
    const concepts = modules.flatMap(m => m.keyConcepts || []);
    conceptsContext = `The topic has these key concepts: ${concepts.join(', ')}.`;
  } else {
    conceptsContext = `No learning plan exists. Generate questions about "${slug}" from your general knowledge.`;
  }

  let adaptiveContext = '';
  if (progress) {
    const weak = (progress.weakAreas || []).join(', ');
    const strong = (progress.strongAreas || []).join(', ');
    const score = progress.overallScore;
    if (weak) adaptiveContext += ` Weak areas (ask more about these): ${weak}.`;
    if (strong) adaptiveContext += ` Strong areas: ${strong}.`;
    if (score != null) adaptiveContext += ` Prior score: ${score}%.`;
    if (score > 80) adaptiveContext += ' Increase difficulty — more conceptual questions.';
    if (score != null && score < 50) adaptiveContext += ' Decrease difficulty — more straightforward questions.';

    // SR priority
    const dueConcepts = [];
    for (const [c, sr] of Object.entries(progress.spacedRepetition || {})) {
      if (sr.nextReview && sr.nextReview <= today) dueConcepts.push(c);
    }
    if (dueConcepts.length > 0) {
      adaptiveContext += ` PRIORITY — these concepts are due for spaced repetition review, include them: ${dueConcepts.join(', ')}.`;
    }
  }

  const prompt = `Generate exactly ${count} quiz questions about "${plan?.topic || slug}".

${conceptsContext}
${adaptiveContext}

Mix of formats: ~60% multiple choice (4 options), ~40% true/false.

Output ONLY a JSON array with this structure (no other text):
[
  {
    "question": "Full question text",
    "format": "mcq" or "tf",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "concept": "concept-name",
    "explanation": "Why this answer is correct (1-2 sentences)"
  }
]

For true/false, options should be ["True", "False"] and correct is 0 or 1.
Each question must have a "concept" field matching one of the key concepts.`;

  initSSE(res);
  sendEvent(res, 'topic', { slug, displayName: plan?.topic || slug, hasPlan: !!plan });

  streamClaude(res, prompt, {
    onStatus: (msg, r) => sendEvent(r, 'status', msg),
    onComplete: (output, r) => {
      const questions = extractJSON(output);
      if (!Array.isArray(questions) || questions.length === 0) {
        sendEvent(r, 'error', 'Failed to generate questions');
        return;
      }
      for (const q of questions) {
        sendEvent(r, 'question', q);
      }
    },
  });
});

// --- Quiz: Submit ---

router.post('/quiz/submit', (req, res) => {
  const { slug, answers } = req.body;
  if (!slug || !answers) return res.status(400).json({ error: 'slug and answers required' });

  const progPath = path.join(LEARNING_DIR, 'progress', `${slug}.json`);
  const progress = readJson(progPath) || { topic: slug, quizzes: [], spacedRepetition: {} };
  const today = new Date().toLocaleDateString('sv-SE');

  // Build quiz entry
  const score = answers.filter(a => a.correct).length;
  const quiz = {
    date: today,
    module: req.body.module || null,
    score,
    total: answers.length,
    difficulty: 'adaptive',
    questions: answers.map(a => ({ format: a.format || 'mcq', concept: a.concept, correct: a.correct })),
  };
  progress.quizzes.push(quiz);

  // Update SM-2 for each concept
  if (!progress.spacedRepetition) progress.spacedRepetition = {};
  for (const a of answers) {
    progress.spacedRepetition[a.concept] = updateSM2(progress.spacedRepetition[a.concept], a.correct);
  }

  // Compute weak/strong
  const { weakAreas, strongAreas, overallScore } = computeWeakStrong(progress.quizzes);
  progress.weakAreas = weakAreas;
  progress.strongAreas = strongAreas;
  progress.overallScore = overallScore;

  writeJson(progPath, progress);

  // Update index
  const index = getIndex();
  if (index.topics[slug]) {
    index.topics[slug].quizzesTaken = progress.quizzes.length;
    index.topics[slug].overallScore = overallScore;
    index.topics[slug].lastActivity = today;
    writeJson(path.join(LEARNING_DIR, 'index.json'), index);
  }

  res.json({ progress, summary: { score, total: answers.length, overallScore, weakAreas, strongAreas } });
});

// --- Diagnostic: Generate ---

router.get('/diagnostic/generate', (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug required' });

  const planFile = findPlanFile(slug);
  const plan = planFile ? readJson(planFile) : null;
  const concepts = plan ? plan.modules.flatMap(m => m.keyConcepts || []) : [];

  const prompt = `Generate exactly 5 diagnostic questions about "${plan?.topic || slug}" at increasing difficulty.

Key concepts to test: ${concepts.join(', ') || slug}

Questions 1-2: Basic terminology (should be easy for anyone with some background)
Questions 3-4: Intermediate application of concepts
Question 5: Advanced concept (only experts get this right)

Output ONLY a JSON array:
[{"question":"...", "format":"mcq", "options":["A","B","C","D"], "correct":0, "concept":"concept-name", "explanation":"..."}]`;

  streamClaude(res, prompt, {
    onComplete: (output, r) => {
      const questions = extractJSON(output);
      if (!Array.isArray(questions)) { sendEvent(r, 'error', 'Failed to generate diagnostic'); return; }
      for (const q of questions) sendEvent(r, 'question', q);
    },
  });
});

// --- Diagnostic: Submit ---

router.post('/diagnostic/submit', (req, res) => {
  const { slug, answers } = req.body;
  if (!slug || !answers) return res.status(400).json({ error: 'slug and answers required' });

  const score = answers.filter(a => a.correct).length;
  const calibratedLevel = score <= 1 ? 'beginner' : score <= 3 ? 'intermediate' : 'advanced';

  // Determine which modules to skip
  const planFile = findPlanFile(slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });

  const plan = readJson(planFile);
  const skipModules = [];
  if (calibratedLevel !== 'beginner' && plan.modules) {
    // Skip first N introductory modules based on level
    const skipCount = calibratedLevel === 'advanced' ? Math.floor(plan.modules.length / 2) : Math.min(2, plan.modules.length - 1);
    for (let i = 0; i < skipCount; i++) skipModules.push(plan.modules[i].id);
  }

  plan.diagnostic = { taken: true, score, total: answers.length, calibratedLevel, skipModules };
  writeJson(planFile, plan);

  res.json({ calibratedLevel, skipModules, score, total: answers.length });
});

// --- Teach: Module ---

router.get('/teach/module', (req, res) => {
  const { slug, moduleId } = req.query;
  if (!slug || !moduleId) return res.status(400).json({ error: 'slug and moduleId required' });

  const planFile = findPlanFile(slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });

  const plan = readJson(planFile);
  const mod = plan.modules.find(m => String(m.id) === String(moduleId));
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  const profile = readJson(path.join(LEARNING_DIR, 'profile.json'));
  const style = profile?.learningStyle || 'hands-on';

  const prompt = `Teach me about "${mod.title}" from a course on "${plan.topic}".

Key concepts to cover: ${(mod.keyConcepts || []).join(', ')}
Objectives: ${(mod.objectives || []).join('; ')}
Learning style preference: ${style}

Structure your teaching as follows:
1. Start with a brief connection to what I should already know
2. Explain each key concept clearly (2-3 paragraphs each)
3. Use analogies and concrete examples
4. After every 2-3 concepts, include a comprehension check question

For comprehension checks, output them on their own line in this exact format:
COMPREHENSION_CHECK: {"question":"...", "format":"mcq", "options":["A","B","C","D"], "correct":0, "concept":"...", "explanation":"..."}

Write in a conversational, engaging tone. Use markdown formatting.`;

  streamClaude(res, prompt, {
    onComplete: (output, r) => {
      // Split output into content chunks and comprehension checks
      const lines = output.split('\n');
      let contentBuffer = '';

      for (const line of lines) {
        if (line.startsWith('COMPREHENSION_CHECK:')) {
          // Flush content buffer
          if (contentBuffer.trim()) {
            sendEvent(r, 'content', contentBuffer.trim());
            contentBuffer = '';
          }
          // Parse and send check
          try {
            const checkJson = JSON.parse(line.replace('COMPREHENSION_CHECK:', '').trim());
            sendEvent(r, 'check', checkJson);
          } catch (e) {
            contentBuffer += line + '\n';
          }
        } else {
          contentBuffer += line + '\n';
        }
      }
      if (contentBuffer.trim()) sendEvent(r, 'content', contentBuffer.trim());
    },
  });
});

// --- Resources: Search ---

router.get('/resources/search', (req, res) => {
  const { topic, query } = req.query;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const searchQuery = query || topic;
  const prompt = `Search for learning resources about "${searchQuery}".

Do 2-3 web searches. Find high-quality resources: documentation, tutorials, videos, courses, books.

Output ONLY a JSON array of resources:
[{"title":"Resource Name", "url":"https://...", "type":"docs|video|tutorial|book|course", "free":true, "description":"One-line description"}]

Include 5-10 resources. Mix of types. Note free vs paid. Use real URLs.`;

  streamClaude(res, prompt, {
    onComplete: (output, r) => {
      const resources = extractJSON(output);
      if (!Array.isArray(resources)) { sendEvent(r, 'error', 'Failed to find resources'); return; }
      for (const resource of resources) sendEvent(r, 'resource', resource);
    },
  });
});

// --- Recommendations (server-computed, no Claude) ---

router.get('/recommendations', (req, res) => {
  const index = getIndex();
  const today = new Date().toLocaleDateString('sv-SE');
  const recs = [];

  for (const [slug, topic] of Object.entries(index.topics || {})) {
    // Check SR due
    const progPath = path.join(LEARNING_DIR, topic.progressFile || `progress/${slug}.json`);
    const prog = readJson(progPath);
    if (prog?.spacedRepetition) {
      const dueConcepts = Object.entries(prog.spacedRepetition)
        .filter(([, sr]) => sr.nextReview && sr.nextReview <= today)
        .map(([c]) => c);
      if (dueConcepts.length > 0) {
        recs.push({ type: 'review', slug, topic: topic.displayName || slug, message: `${dueConcepts.length} concept(s) due for review`, concepts: dueConcepts, priority: 1 });
      }
    }

    // Check weak areas
    if (prog?.weakAreas?.length > 0) {
      recs.push({ type: 'weak', slug, topic: topic.displayName || slug, message: `Focus on weak areas: ${prog.weakAreas.join(', ')}`, priority: 2 });
    }

    // Check unstarted modules
    const planFile = findPlanFile(slug);
    const plan = planFile ? readJson(planFile) : null;
    if (plan && prog) {
      const moduleScores = getModuleScores(plan, prog);
      const unstarted = moduleScores.find(m => m.score === null);
      if (unstarted) {
        recs.push({ type: 'module', slug, topic: topic.displayName || slug, message: `Start Module ${unstarted.moduleId}: ${unstarted.title}`, moduleId: unstarted.moduleId, priority: 3 });
      }
    }

    // No progress at all
    if (!prog && topic.quizzesTaken === 0) {
      recs.push({ type: 'start', slug, topic: topic.displayName || slug, message: 'Take your first quiz!', priority: 4 });
    }
  }

  // All strong
  if (Object.keys(index.topics || {}).length > 0 && recs.length === 0) {
    recs.push({ type: 'complete', message: 'Great work! All topics are strong. Consider learning something new.', priority: 5 });
  }

  recs.sort((a, b) => a.priority - b.priority);
  res.json(recs);
});

// --- Module Scores ---

router.get('/progress/:slug/modules', (req, res) => {
  const slug = req.params.slug;
  const planFile = findPlanFile(slug);
  if (!planFile) return res.status(404).json({ error: 'Plan not found' });

  const plan = readJson(planFile);
  const progPath = path.join(LEARNING_DIR, 'progress', `${slug}.json`);
  const progress = readJson(progPath) || { quizzes: [] };

  res.json(getModuleScores(plan, progress));
});

// --- Agent launch ---

router.post('/agent/:action', (req, res) => {
  const { action } = req.params;
  const { slug } = req.body || {};
  const commands = { quiz: `/quiz ${slug || ''}`, learn: `/learn ${slug || ''}`, review: '/review' };
  const cmd = commands[action];
  if (!cmd) return res.status(400).json({ error: `Unknown action: ${action}` });

  const pluginDir = path.resolve(__dirname, '..', '..', '..');
  const script = `claude --plugin-dir "${pluginDir}" -p "${cmd.trim()}"`;

  // Open in a new terminal window (macOS)
  const { exec } = require('child_process');
  exec(`osascript -e 'tell application "Terminal" to do script "${script.replace(/"/g, '\\"')}"'`);
  res.json({ launched: action, command: cmd.trim() });
});

module.exports = router;
