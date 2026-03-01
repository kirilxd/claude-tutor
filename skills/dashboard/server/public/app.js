// --- API Client ---

const api = {
  async get(path) {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(`/api${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.errors?.join(', ') || res.statusText); }
    return res.json();
  },
  async del(path) {
    const res = await fetch(`/api${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  },
};

// --- Router ---

const app = document.getElementById('app');

function route() {
  const hash = location.hash.slice(1) || '/';
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);

  // Update nav active state
  const routePath = '/' + parts.join('/');
  document.querySelectorAll('.nav-links a').forEach(a => {
    const r = a.getAttribute('data-route');
    a.classList.toggle('active', r === routePath || (routePath === '/' && r === '/'));
  });

  if (parts[0] === 'plans' && parts[1]) return renderPlan(parts[1]);
  if (parts[0] === 'progress' && parts[1]) return renderProgress(parts[1]);
  if (parts[0] === 'quiz' && parts[1]) return renderQuiz(parts[1]);
  if (parts[0] === 'quiz') return renderQuiz();
  if (parts[0] === 'create') return renderCreate();
  if (parts[0] === 'diagnostic' && parts[1]) return renderDiagnostic(parts[1]);
  if (parts[0] === 'teach' && parts[1] && parts[2]) return renderTeach(parts[1], parts[2]);
  if (parts[0] === 'calendar') return renderCalendar();
  if (parts[0] === 'profile') return renderProfile();
  return renderDashboard();
}

window.addEventListener('hashchange', route);
window.addEventListener('load', route);

// --- Helpers ---

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

function scoreColor(score) {
  if (score == null) return '';
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

function badge(text, color) {
  return `<span class="badge badge-${color}">${text}</span>`;
}

function confirm(msg, onYes) {
  const overlay = h('div', { className: 'dialog-overlay' },
    h('div', { className: 'dialog' },
      h('h3', null, 'Confirm'),
      h('p', null, msg),
      h('div', { className: 'dialog-actions' },
        h('button', { className: 'btn', onClick: () => overlay.remove() }, 'Cancel'),
        h('button', { className: 'btn btn-danger', onClick: () => { overlay.remove(); onYes(); } }, 'Delete'),
      )
    )
  );
  document.body.appendChild(overlay);
}

// --- SSE Client Helper ---

function connectSSE(url, handlers) {
  return new Promise((resolve, reject) => {
    const evtSource = new EventSource(url);
    evtSource.addEventListener('done', () => { evtSource.close(); resolve(); });
    evtSource.addEventListener('error', (e) => {
      if (evtSource.readyState === EventSource.CLOSED) { resolve(); return; }
      evtSource.close();
      reject(new Error('SSE connection failed'));
    });
    for (const [event, handler] of Object.entries(handlers)) {
      evtSource.addEventListener(event, (e) => handler(JSON.parse(e.data)));
    }
  });
}

function postSSE(url, body, handlers) {
  return new Promise((resolve, reject) => {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(res => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resolved = false;
        function read() {
          if (resolved) return;
          reader.read().then(({ done, value }) => {
            if (done || resolved) { if (!resolved) { resolved = true; resolve(); } return; }
            buffer += decoder.decode(value, { stream: true });
            // SSE events are separated by double newlines
            const events = buffer.split('\n\n');
            buffer = events.pop(); // keep incomplete event in buffer
            for (const block of events) {
              const lines = block.split('\n');
              let eventName = null;
              let dataStr = '';
              for (const line of lines) {
                if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                else if (line.startsWith('data: ')) dataStr += line.slice(6);
              }
              if (!eventName) continue;
              if (eventName === 'done') { resolved = true; resolve(); return; }
              if (handlers[eventName]) {
                try { handlers[eventName](JSON.parse(dataStr)); }
                catch (e) { handlers[eventName](dataStr); }
              }
            }
            read();
          }).catch(e => { if (!resolved) { resolved = true; reject(e); } });
        }
        read();
      }).catch(reject);
  });
}

// --- Loading Status Rotation ---

const LOADING_MESSAGES = [
  'Starting Claude...',
  'Connecting to Claude...',
  'Researching your topic...',
  'Searching for resources...',
  'Analyzing results...',
  'Building module structure...',
  'Curating the best resources...',
  'Organizing the learning path...',
  'Almost there...',
  'Generating content...',
  'Putting it all together...',
  'Finalizing...',
];

function startLoadingRotation(elementId) {
  let idx = 0;
  const el = document.getElementById(elementId);
  if (!el) return null;
  const interval = setInterval(() => {
    idx = (idx + 1) % LOADING_MESSAGES.length;
    if (el && !el.dataset.done) el.textContent = LOADING_MESSAGES[idx];
  }, 4000);
  return interval;
}

function stopLoadingRotation(interval) {
  if (interval) clearInterval(interval);
}

// --- Data Normalizer (handles CLI schema variations) ---

function normalizeProgress(p) {
  if (!p) return p;
  // weakAreas: CLI sometimes sends [{concept:"x"}] instead of ["x"]
  if (Array.isArray(p.weakAreas)) {
    p.weakAreas = p.weakAreas.map(a => typeof a === 'object' ? (a.concept || a.name || JSON.stringify(a)) : a);
  } else {
    p.weakAreas = [];
  }
  // strongAreas: CLI sometimes sends null
  if (!Array.isArray(p.strongAreas)) p.strongAreas = [];
  p.strongAreas = p.strongAreas.map(a => typeof a === 'object' ? (a.concept || a.name || JSON.stringify(a)) : a);
  // overallScore: normalize fraction to percentage
  if (p.overallScore != null && p.overallScore > 0 && p.overallScore <= 1) {
    p.overallScore = Math.round(p.overallScore * 100);
  }
  // spacedRepetition: ensure intervalDays is a number
  if (p.spacedRepetition) {
    for (const [k, v] of Object.entries(p.spacedRepetition)) {
      if (typeof v === 'object' && v !== null) {
        if (v.intervalDays == null) v.intervalDays = 1;
        if (v.easeFactor == null) v.easeFactor = 2.5;
        if (v.repetitions == null) v.repetitions = 0;
      }
    }
  }
  return p;
}

// --- Dashboard View ---

async function renderDashboard() {
  app.innerHTML = '<h1>Loading...</h1>';
  try {
    const [stats, index, calendar, recs] = await Promise.all([
      api.get('/stats'),
      api.get('/topics'),
      api.get('/calendar'),
      api.get('/recommendations').catch(() => []),
    ]);

    const topics = Object.entries(index.topics || {});

    let html = '<h1>Dashboard</h1>';

    // Stats bar
    html += '<div class="stats-bar">';
    html += `<div class="stat-card"><div class="label">Topics</div><div class="value accent">${stats.totalTopics}</div></div>`;
    html += `<div class="stat-card"><div class="label">Quizzes</div><div class="value">${stats.totalQuizzes}</div></div>`;
    html += `<div class="stat-card"><div class="label">Avg Score</div><div class="value ${scoreColor(stats.avgScore)}">${stats.avgScore != null ? stats.avgScore + '%' : '--'}</div></div>`;
    html += `<div class="stat-card"><div class="label">Due Reviews</div><div class="value ${stats.dueCount > 0 ? 'error' : ''}">${stats.dueCount}</div></div>`;
    html += '</div>';

    // Due alert
    if (calendar.overdue.length > 0) {
      const concepts = calendar.overdue.slice(0, 5).map(c => c.concept).join(', ');
      html += `<div class="alert alert-warning">${calendar.overdue.length} concept(s) overdue for review: ${concepts}. <a href="#/calendar">View calendar</a></div>`;
    }

    // Recommendations
    if (recs.length > 0) {
      const rec = recs[0]; // Show top recommendation
      const recActions = {
        review: `<a href="#/quiz/${rec.slug}" class="btn btn-sm btn-primary">Start Review</a>`,
        weak: `<a href="#/quiz/${rec.slug}" class="btn btn-sm btn-primary">Practice</a>`,
        module: `<a href="#/teach/${rec.slug}/${rec.moduleId}" class="btn btn-sm btn-primary">Start Module</a>`,
        start: `<a href="#/quiz/${rec.slug}" class="btn btn-sm btn-primary">Take Quiz</a>`,
        complete: `<a href="#/create" class="btn btn-sm btn-primary">New Topic</a>`,
      };
      html += `<div class="card" style="border-color:var(--accent);margin-bottom:24px"><div class="flex gap-8" style="justify-content:space-between"><div><h3 style="color:var(--accent);margin-bottom:4px">Suggested Next Step</h3><span class="text-secondary">${rec.message}</span></div>${recActions[rec.type] || ''}</div></div>`;
    }

    // Topics
    if (topics.length === 0) {
      html += '<div class="empty-state"><h2>No learning topics yet</h2><p>Use the <a href="#/create">Create Topic</a> form or run <code>/learn &lt;topic&gt;</code> in Claude.</p></div>';
    } else {
      html += '<h2>Topics</h2><div class="card-grid">';
      for (const [slug, t] of topics) {
        const pct = t.overallScore != null ? t.overallScore : null;
        html += `<div class="card" id="topic-${slug}">
          <div class="card-header">
            <div class="card-title">${t.displayName || slug}</div>
            ${badge(t.level || 'beginner', 'blue')}
          </div>
          <div class="card-meta">
            Modules: ${t.modulesCompleted || 0}/${t.modulesTotal || '?'}
            &middot; Quizzes: ${t.quizzesTaken || 0}
            &middot; Score: <span class="text-mono ${scoreColor(pct)}">${pct != null ? pct + '%' : '--'}</span>
          </div>
          <div class="progress-bar"><div class="fill" style="width:${pct || 0}%"></div></div>
          <div class="card-meta text-muted">Last activity: ${t.lastActivity || t.created || '--'}</div>
          <div class="card-actions">
            <a href="#/plans/${slug}" class="btn btn-sm">Plan</a>
            <a href="#/progress/${slug}" class="btn btn-sm">Progress</a>
            <button class="btn btn-sm btn-danger" data-delete="${slug}">Delete</button>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    app.innerHTML = html;

    // Wire delete buttons
    app.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.delete;
        confirm(`Delete "${slug}" and all its data?`, async () => {
          await api.del(`/topics/${slug}`);
          renderDashboard();
        });
      });
    });
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Failed to load: ${e.message}</div>`;
  }
}

// --- Plan View ---

async function renderPlan(slug) {
  app.innerHTML = '<h1>Loading plan...</h1>';
  try {
    const [plan, topic] = await Promise.all([
      api.get(`/plans/${slug}`),
      api.get(`/topics/${slug}`).catch(() => null),
    ]);

    let html = `<h1>${plan.topic || slug}</h1>`;
    html += `<div class="card-meta mb-8">
      ${badge(plan.level || 'beginner', 'blue')}
      ${plan.depth ? badge(plan.depth, 'yellow') : ''}
      ${plan.timeCommitment ? `<span class="text-sm text-secondary">&middot; ${plan.timeCommitment}</span>` : ''}
      ${plan.totalEstimatedTime ? `<span class="text-sm text-secondary">&middot; ~${plan.totalEstimatedTime}</span>` : ''}
    </div>`;
    if (plan.goal) html += `<p class="text-secondary mb-8" style="margin-bottom:20px"><strong>Goal:</strong> ${plan.goal}</p>`;

    // Diagnostic indicator
    if (plan.diagnostic?.taken) {
      html += `<div class="mb-8">${badge('Level: ' + plan.diagnostic.calibratedLevel, 'green')} <span class="text-sm text-muted">Diagnostic: ${plan.diagnostic.score}/${plan.diagnostic.total}</span></div>`;
    }

    html += '<div class="flex gap-8 mb-8" style="margin-bottom:24px">';
    html += `<a href="#/quiz/${slug}" class="btn btn-primary">Start Quiz</a>`;
    html += `<a href="#/progress/${slug}" class="btn">View Progress</a>`;
    if (!plan.diagnostic?.taken && plan.level !== 'beginner') {
      html += `<a href="#/diagnostic/${slug}" class="btn">Test Your Level</a>`;
    }
    html += '</div>';

    html += '<h2>Modules</h2>';
    for (const [i, mod] of (plan.modules || []).entries()) {
      const concepts = (mod.keyConcepts || []).map(c => `<span class="concept-tag">${c}</span>`).join('');
      const resources = (mod.resources || []).map(r =>
        `<div class="resource-item">
          <span class="resource-type">${r.type || 'link'}</span>
          <a href="${r.url}" target="_blank">${r.title}</a>
          ${r.free === false ? badge('paid', 'yellow') : ''}
        </div>`
      ).join('');

      html += `<div class="module-card" data-module="${i}">
        <div class="module-header">
          <div class="flex gap-8">
            <span class="module-num">${mod.id || i + 1}</span>
            <span>${mod.title}</span>
          </div>
          <div class="flex gap-8">
            <span class="text-sm text-muted">${mod.estimatedTime || ''}</span>
            <button class="btn btn-sm" data-move="up" data-idx="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
            <button class="btn btn-sm" data-move="down" data-idx="${i}" title="Move down" ${i === plan.modules.length - 1 ? 'disabled' : ''}>&#9660;</button>
          </div>
        </div>
        <div class="module-body">
          ${mod.objectives ? `<h3>Objectives</h3><ul>${mod.objectives.map(o => `<li class="text-secondary text-sm">${o}</li>`).join('')}</ul>` : ''}
          ${concepts ? `<h3 class="mt-16">Key Concepts</h3><div>${concepts}</div>` : ''}
          ${resources ? `<h3 class="mt-16">Resources</h3><div>${resources}</div>` : ''}
          <div class="mt-16"><a href="#/teach/${slug}/${mod.id}" class="btn btn-sm btn-primary">Learn This Module</a></div>
        </div>
      </div>`;
    }

    app.innerHTML = html;

    // Toggle module expand
    app.querySelectorAll('.module-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('[data-move]')) return;
        header.closest('.module-card').classList.toggle('open');
      });
    });

    // Move module up/down
    app.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const dir = btn.dataset.move === 'up' ? -1 : 1;
        const modules = [...plan.modules];
        [modules[idx], modules[idx + dir]] = [modules[idx + dir], modules[idx]];
        // Re-number ids
        modules.forEach((m, i) => m.id = i + 1);
        await api.put(`/plans/${slug}/modules`, { modules });
        renderPlan(slug);
      });
    });

    // Agent buttons (legacy — kept for "Start Learning" in terminal)
    document.getElementById('btn-learn')?.addEventListener('click', () => api.post('/agent/learn', { slug }));
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Plan not found: ${e.message}</div>`;
  }
}

// --- Progress View ---

async function renderProgress(slug) {
  app.innerHTML = '<h1>Loading progress...</h1>';
  try {
    let [progress, plan] = await Promise.all([
      api.get(`/progress/${slug}`).catch(() => null),
      api.get(`/plans/${slug}`).catch(() => null),
    ]);
    if (progress) progress = normalizeProgress(progress);

    const title = plan?.topic || slug;
    let html = `<h1>${title} — Progress</h1>`;
    html += `<a href="#/plans/${slug}" class="text-sm">&larr; Back to plan</a>`;

    if (!progress) {
      html += '<div class="empty-state mt-16"><h2>No quiz data yet</h2><p>Run <code>/quiz ' + slug + '</code> to take your first quiz.</p></div>';
      app.innerHTML = html;
      return;
    }

    // Score summary
    const score = progress.overallScore;
    html += `<div class="stats-bar mt-16">
      <div class="stat-card"><div class="label">Overall</div><div class="value ${scoreColor(score)}">${score != null ? (typeof score === 'number' && score <= 1 ? Math.round(score * 100) : score) + '%' : '--'}</div></div>
      <div class="stat-card"><div class="label">Quizzes</div><div class="value">${(progress.quizzes || []).length}</div></div>
      <div class="stat-card"><div class="label">Strong</div><div class="value success">${(progress.strongAreas || []).length}</div></div>
      <div class="stat-card"><div class="label">Weak</div><div class="value error">${(progress.weakAreas || []).length}</div></div>
    </div>`;

    // Weak/Strong tags
    if (progress.strongAreas?.length) {
      html += '<div class="mb-8">' + progress.strongAreas.map(a => badge(a, 'green')).join(' ') + '</div>';
    }
    if (progress.weakAreas?.length) {
      html += '<div class="mb-8">' + progress.weakAreas.map(a => badge(a, 'red')).join(' ') + '</div>';
    }

    // Score trend chart
    const quizzes = progress.quizzes || [];
    if (quizzes.length > 1) {
      html += '<div class="section"><h2>Score Trend</h2><div class="chart-container">' + buildChart(quizzes) + '</div></div>';
    }

    // Quiz history table
    html += '<div class="section"><h2>Quiz History</h2>';
    if (quizzes.length === 0) {
      html += '<p class="text-muted">No quizzes taken yet.</p>';
    } else {
      html += '<table><thead><tr><th>Date</th><th>Score</th><th>Difficulty</th><th>Questions</th></tr></thead><tbody>';
      for (const q of quizzes) {
        const pct = q.total > 0 ? Math.round(q.score / q.total * 100) : 0;
        html += `<tr>
          <td>${q.date || '--'}</td>
          <td class="text-mono"><span class="${scoreColor(pct)}">${q.score}/${q.total} (${pct}%)</span></td>
          <td>${q.difficulty || '--'}</td>
          <td>${(q.questions || []).map(qq => qq.correct ? '<span class="badge badge-green">&#10003;</span>' : '<span class="badge badge-red">&#10007;</span>').join(' ')}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }
    html += '</div>';

    // Spaced repetition
    const sr = progress.spacedRepetition || {};
    const srEntries = Object.entries(sr);
    if (srEntries.length > 0) {
      const today = new Date().toLocaleDateString('sv-SE');
      html += '<div class="section"><h2>Spaced Repetition</h2><table><thead><tr><th>Concept</th><th>Status</th><th>Interval</th><th>Ease</th><th>Reps</th><th>Next Review</th><th></th></tr></thead><tbody>';
      for (const [concept, data] of srEntries) {
        const due = data.nextReview && data.nextReview <= today;
        html += `<tr>
          <td>${concept}</td>
          <td>${due ? badge('DUE', 'red') : badge('scheduled', 'blue')}</td>
          <td class="text-mono">${data.intervalDays || 0}d</td>
          <td class="text-mono">${(data.easeFactor || 0).toFixed(2)}</td>
          <td class="text-mono">${data.repetitions || 0}</td>
          <td class="text-mono">${data.nextReview || '--'}</td>
          <td><input type="date" class="btn-sm" value="${data.nextReview || ''}" data-sr-concept="${concept}" data-sr-slug="${slug}" style="width:auto;padding:2px 6px;font-size:12px"></td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    }

    // Actions
    html += `<div class="flex gap-8 mt-16">
      <button class="btn btn-primary" id="btn-quiz-p">Start Quiz</button>
      <button class="btn btn-danger" id="btn-reset">Reset Progress</button>
    </div>`;

    app.innerHTML = html;

    // Wire SR date overrides
    app.querySelectorAll('[data-sr-concept]').forEach(input => {
      input.addEventListener('change', async () => {
        await api.put(`/progress/${input.dataset.srSlug}/spaced-repetition/${encodeURIComponent(input.dataset.srConcept)}`, { nextReview: input.value });
      });
    });

    document.getElementById('btn-quiz-p')?.addEventListener('click', () => api.post('/agent/quiz', { slug }));
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      confirm(`Reset all progress for "${title}"?`, async () => {
        await api.del(`/progress/${slug}`);
        renderProgress(slug);
      });
    });
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// --- Score chart (SVG) ---

function buildChart(quizzes) {
  if (quizzes.length < 2) return '';
  const scores = quizzes.map(q => q.total > 0 ? Math.round(q.score / q.total * 100) : 0);
  const w = 500, h = 150, padL = 36, padR = 16, padT = 16, padB = 24;
  const chartW = w - padL - padR, chartH = h - padT - padB;
  const stepX = chartW / Math.max(1, scores.length - 1);

  const px = (i) => padL + i * stepX;
  const py = (s) => padT + chartH - (s / 100) * chartH;

  const points = scores.map((s, i) => `${px(i)},${py(s)}`).join(' ');
  const dots = scores.map((s, i) =>
    `<circle cx="${px(i)}" cy="${py(s)}" r="4" fill="var(--accent)" stroke="var(--bg-card)" stroke-width="2"/>`
  ).join('');
  const labels = scores.map((s, i) =>
    `<text x="${px(i)}" y="${py(s) - 10}" fill="var(--text-secondary)" font-family="var(--font-mono)" font-size="11" text-anchor="middle">${s}%</text>`
  ).join('');
  // Gradient fill under the line
  const areaPoints = `${px(0)},${py(0)} ${points} ${px(scores.length - 1)},${padT + chartH}`;

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${py(50)}" x2="${w - padR}" y2="${py(50)}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="4,4"/>
    <text x="${padL - 8}" y="${padT + 5}" fill="var(--text-muted)" font-family="var(--font-mono)" font-size="11" text-anchor="end">100</text>
    <text x="${padL - 8}" y="${py(50) + 4}" fill="var(--text-muted)" font-family="var(--font-mono)" font-size="11" text-anchor="end">50</text>
    <text x="${padL - 8}" y="${padT + chartH + 4}" fill="var(--text-muted)" font-family="var(--font-mono)" font-size="11" text-anchor="end">0</text>
    ${quizzes.map((q, i) => `<text x="${px(i)}" y="${h - 4}" fill="var(--text-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">${q.date?.slice(5) || ''}</text>`).join('')}
    <polygon points="${areaPoints}" fill="url(#chartGrad)"/>
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

// --- Calendar View ---

async function renderCalendar() {
  app.innerHTML = '<h1>Loading calendar...</h1>';
  try {
    const data = await api.get('/calendar');
    const now = new Date();
    const year = parseInt(location.hash.match(/year=(\d+)/)?.[1]) || now.getFullYear();
    const month = parseInt(location.hash.match(/month=(\d+)/)?.[1]) || now.getMonth();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = now.toLocaleDateString('sv-SE');

    let html = `<h1>Review Calendar</h1>`;

    // Overdue alert
    if (data.overdue.length > 0) {
      html += `<div class="alert alert-error">${data.overdue.length} concept(s) overdue for review</div>`;
    }

    // Month nav
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    html += `<div class="flex gap-16 mb-8" style="margin-bottom:16px">
      <a href="#/calendar?year=${prevYear}&month=${prevMonth}" class="btn btn-sm">&larr;</a>
      <h2 style="margin:0">${monthNames[month]} ${year}</h2>
      <a href="#/calendar?year=${nextYear}&month=${nextMonth}" class="btn btn-sm">&rarr;</a>
    </div>`;

    // Build day→concepts map
    const dayMap = {};
    for (const item of data.overdue) {
      const d = item.nextReview;
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push({ ...item, overdue: true });
    }
    for (const [date, items] of Object.entries(data.upcoming)) {
      if (!dayMap[date]) dayMap[date] = [];
      items.forEach(item => dayMap[date].push(item));
    }

    // Calendar grid
    html += '<div class="cal-grid">';
    dayNames.forEach(d => { html += `<div class="cal-header">${d}</div>`; });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const items = dayMap[dateStr] || [];

      html += `<div class="cal-cell ${isToday ? 'today' : ''}">`;
      html += `<div class="cal-date">${day}</div>`;
      items.forEach(item => {
        const cls = item.overdue || dateStr <= todayStr ? 'overdue' : 'upcoming';
        html += `<div class="cal-item ${cls}" title="${item.topic}: ${item.concept}">${item.concept}</div>`;
      });
      html += '</div>';
    }

    // Fill remaining cells
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remaining; i++) html += '<div class="cal-cell empty"></div>';

    html += '</div>';
    app.innerHTML = html;
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// --- Profile View ---

async function renderProfile() {
  app.innerHTML = '<h1>Loading profile...</h1>';
  try {
    const profile = await api.get('/profile');

    let html = '<h1>Learner Profile</h1>';
    html += `<div class="card" style="max-width:500px">
      <div class="form-row">
        <label>Learning Style</label>
        <select id="prof-style">
          <option value="">Not set</option>
          <option value="hands-on" ${profile.learningStyle === 'hands-on' ? 'selected' : ''}>Hands-on projects</option>
          <option value="reading" ${profile.learningStyle === 'reading' ? 'selected' : ''}>Reading docs & articles</option>
          <option value="videos" ${profile.learningStyle === 'videos' ? 'selected' : ''}>Watching videos</option>
          <option value="theory-first" ${profile.learningStyle === 'theory-first' ? 'selected' : ''}>Theory first</option>
        </select>
      </div>
      <div class="form-row">
        <label>Background</label>
        <input type="text" id="prof-bg" value="${profile.background || ''}" placeholder="e.g., software engineer, student">
      </div>
      <div class="form-row">
        <label>Topics Created</label>
        <p class="text-secondary">${(profile.createdTopics || []).join(', ') || 'None'}</p>
      </div>
      <button class="btn btn-primary" id="prof-save">Save</button>
    </div>`;

    app.innerHTML = html;

    document.getElementById('prof-save')?.addEventListener('click', async () => {
      await api.put('/profile', {
        learningStyle: document.getElementById('prof-style').value || null,
        background: document.getElementById('prof-bg').value || null,
      });
      renderProfile();
    });
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// --- Create Topic View ---

async function renderCreate() {
  const profile = await api.get('/profile').catch(() => ({}));

  let html = '<h1>Create Learning Plan</h1>';
  html += `<div class="card" style="max-width:600px" id="create-form">
    <div class="form-row"><label>Topic</label><input type="text" id="c-topic" placeholder="e.g., Kubernetes, Spanish Grammar, Music Theory"></div>
    <div class="form-row"><label>Level</label><select id="c-level">
      <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
    </select></div>
    <div class="form-row"><label>Goal</label><textarea id="c-goal" rows="2" placeholder="What do you want to be able to do?"></textarea></div>
    <div class="form-row"><label>Depth</label><select id="c-depth">
      <option value="high-level overview">High-level overview</option><option value="working-knowledge" selected>Working knowledge</option><option value="deep expertise">Deep expertise</option>
    </select></div>
    <div class="form-row"><label>Focus Areas (optional)</label><input type="text" id="c-focus" placeholder="e.g., security, performance, basics"></div>
    <div class="form-row"><label>Time Commitment</label><select id="c-time">
      <option value="a few hours">A few hours</option><option value="a weekend" selected>A weekend</option><option value="a week">A week</option><option value="ongoing">Ongoing</option>
    </select></div>
    <div class="form-row"><label>Learning Style</label><select id="c-style">
      <option value="hands-on" ${profile.learningStyle === 'hands-on' ? 'selected' : ''}>Hands-on projects</option>
      <option value="reading" ${profile.learningStyle === 'reading' ? 'selected' : ''}>Reading docs & articles</option>
      <option value="videos" ${profile.learningStyle === 'videos' ? 'selected' : ''}>Watching videos</option>
      <option value="theory-first" ${profile.learningStyle === 'theory-first' ? 'selected' : ''}>Theory first</option>
    </select></div>
    <button class="btn btn-primary" id="c-submit">Create Plan</button>
  </div>
  <div id="create-status" style="display:none;margin-top:20px">
    <div class="card"><div class="text-secondary" id="c-status-text">Initializing...</div>
    <div class="progress-bar mt-16"><div class="fill" id="c-progress" style="width:10%"></div></div></div>
  </div>`;

  app.innerHTML = html;

  document.getElementById('c-submit').addEventListener('click', async () => {
    const topic = document.getElementById('c-topic').value.trim();
    if (!topic) { alert('Topic is required'); return; }

    document.getElementById('create-form').style.display = 'none';
    const statusDiv = document.getElementById('create-status');
    statusDiv.style.display = 'block';
    const statusText = document.getElementById('c-status-text');
    const progressBar = document.getElementById('c-progress');

    statusText.textContent = 'Starting Claude...';
    progressBar.style.width = '20%';
    const loadingInterval = startLoadingRotation('c-status-text');

    try {
      let savedSlug = null;
      await postSSE('/api/learn/create', {
        topic,
        level: document.getElementById('c-level').value,
        goal: document.getElementById('c-goal').value,
        depth: document.getElementById('c-depth').value,
        focusAreas: document.getElementById('c-focus').value,
        timeCommitment: document.getElementById('c-time').value,
        learningStyle: document.getElementById('c-style').value,
      }, {
        status: () => { progressBar.style.width = '50%'; },
        plan: () => { stopLoadingRotation(loadingInterval); statusText.dataset.done = '1'; statusText.textContent = 'Plan generated!'; progressBar.style.width = '90%'; },
        saved: (data) => { savedSlug = data.slug; progressBar.style.width = '100%'; },
        error: (msg) => { stopLoadingRotation(loadingInterval); statusText.dataset.done = '1'; statusText.innerHTML = `<span style="color:var(--error)">Error: ${msg}</span>`; },
      });

      if (savedSlug) {
        statusText.innerHTML = `Plan saved! <a href="#/plans/${savedSlug}" class="btn btn-primary" style="margin-left:12px">View Plan</a>`;
      }
    } catch (e) {
      statusText.innerHTML = `<span style="color:var(--error)">Failed: ${e.message}</span>`;
    }
  });
}

// --- Quiz View ---

async function renderQuiz(slug) {
  // If no slug, auto-select most recent topic
  if (!slug) {
    try {
      const index = await api.get('/topics');
      const entries = Object.entries(index.topics || {});
      if (entries.length === 0) {
        app.innerHTML = '<h1>Quiz</h1><div class="empty-state"><h2>No topics yet</h2><p><a href="#/create">Create a topic</a> first.</p></div>';
        return;
      }
      entries.sort((a, b) => (b[1].lastActivity || '').localeCompare(a[1].lastActivity || ''));
      slug = entries[0][0];
    } catch (e) {
      app.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      return;
    }
  }

  // Load module info for module selector
  let moduleScores = [];
  try { moduleScores = await api.get(`/progress/${slug}/modules`); } catch (e) {}

  let html = `<h1>Quiz</h1>`;
  html += `<div class="card" style="max-width:500px" id="quiz-setup">
    <div class="form-row"><label>Topic</label><input type="text" value="${slug}" disabled></div>
    <div class="form-row"><label>Module</label><select id="q-module">
      <option value="">All modules</option>
      ${moduleScores.map(m => `<option value="${m.moduleId}">Module ${m.moduleId}: ${m.title} ${m.score != null ? '(' + m.score + '%)' : '(not started)'}</option>`).join('')}
    </select></div>
    <div class="form-row"><label>Questions</label><select id="q-count">
      <option value="3">3</option><option value="5" selected>5</option><option value="10">10</option>
    </select></div>
    <button class="btn btn-primary" id="q-start">Start Quiz</button>
  </div>
  <div id="quiz-area" style="display:none"></div>`;

  app.innerHTML = html;

  document.getElementById('q-start').addEventListener('click', async () => {
    const module = document.getElementById('q-module').value;
    const count = document.getElementById('q-count').value;
    document.getElementById('quiz-setup').style.display = 'none';
    const quizArea = document.getElementById('quiz-area');
    quizArea.style.display = 'block';
    quizArea.innerHTML = '<div class="card"><div class="text-secondary" id="quiz-loading-text">Generating questions...</div><div class="progress-bar mt-16"><div class="fill" style="width:20%"></div></div></div>';
    const quizLoadInterval = startLoadingRotation('quiz-loading-text');

    const questions = [];
    let topicInfo = {};

    try {
      const params = new URLSearchParams({ slug, count });
      if (module) params.set('module', module);

      await connectSSE(`/api/quiz/generate?${params}`, {
        topic: (data) => { topicInfo = data; },
        question: (q) => { questions.push(q); },
        status: () => {},
        error: (msg) => { quizArea.innerHTML = `<div class="alert alert-error">Error: ${msg}</div>`; },
      });

      if (questions.length === 0) {
        quizArea.innerHTML = '<div class="alert alert-error">No questions generated.</div>';
        return;
      }

      // Deliver questions one at a time
      stopLoadingRotation(quizLoadInterval);
      runQuizUI(quizArea, questions, slug, topicInfo);
    } catch (e) {
      quizArea.innerHTML = `<div class="alert alert-error">Failed: ${e.message}</div>`;
    }
  });
}

function runQuizUI(container, questions, slug, topicInfo) {
  let current = 0;
  const answers = [];

  function showQuestion() {
    const q = questions[current];
    const isLast = current === questions.length - 1;
    let html = `<div class="card" style="max-width:700px;animation:fadeUp 0.3s ease both">`;
    html += `<div class="text-muted text-mono mb-8">Q${current + 1}/${questions.length} ${q.format === 'tf' ? 'TRUE/FALSE' : 'MULTIPLE CHOICE'}</div>`;
    html += `<h2 style="font-size:16px;text-transform:none;letter-spacing:normal;margin-bottom:20px">${q.question}</h2>`;
    html += `<div id="q-options">`;
    q.options.forEach((opt, i) => {
      html += `<button class="btn" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:12px 16px" data-idx="${i}">${opt}</button>`;
    });
    html += `</div>`;
    html += `<div id="q-feedback" style="display:none;margin-top:16px"></div>`;
    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const correct = idx === q.correct;
        answers.push({ concept: q.concept, correct, format: q.format });

        // Highlight
        container.querySelectorAll('[data-idx]').forEach((b, i) => {
          b.disabled = true;
          if (i === q.correct) b.style.borderColor = 'var(--success)';
          if (i === idx && !correct) b.style.borderColor = 'var(--error)';
        });

        // Show feedback
        const fb = document.getElementById('q-feedback');
        fb.style.display = 'block';
        fb.innerHTML = `<div class="${correct ? 'text-secondary' : ''}" style="color:${correct ? 'var(--success)' : 'var(--error)'}">
          <strong>${correct ? 'Correct!' : 'Not quite.'}</strong> ${q.explanation || ''}
        </div>
        <button class="btn btn-primary mt-16" id="q-next">${isLast ? 'See Results' : 'Next →'}</button>`;

        document.getElementById('q-next').addEventListener('click', () => {
          current++;
          if (current < questions.length) showQuestion();
          else showResults();
        });
      });
    });
  }

  async function showResults() {
    const score = answers.filter(a => a.correct).length;
    const pct = Math.round(score / answers.length * 100);

    let html = `<div class="card" style="max-width:700px;animation:fadeUp 0.3s ease both">`;
    html += `<h2 style="text-transform:none;letter-spacing:normal">Results: ${topicInfo.displayName || slug}</h2>`;
    html += `<div class="stat-card" style="margin:16px 0"><div class="label">Score</div><div class="value ${scoreColor(pct)}">${score}/${answers.length} (${pct}%)</div></div>`;

    html += `<div class="mb-8">`;
    answers.forEach((a, i) => {
      html += `<span class="badge badge-${a.correct ? 'green' : 'red'}" style="margin:2px">${a.correct ? '✓' : '✗'} ${a.concept}</span> `;
    });
    html += `</div>`;

    html += `<div id="q-saving" class="text-muted">Saving progress...</div>`;
    html += `<div class="flex gap-8 mt-16">
      <a href="#/progress/${slug}" class="btn">View Progress</a>
      <a href="#/quiz/${slug}" class="btn btn-primary">Quiz Again</a>
    </div></div>`;

    container.innerHTML = html;

    // Save
    try {
      await api.post('/quiz/submit', { slug, answers });
      document.getElementById('q-saving').innerHTML = '<span style="color:var(--success)">Progress saved ✓</span>';
    } catch (e) {
      document.getElementById('q-saving').innerHTML = `<span style="color:var(--error)">Save failed: ${e.message}</span>`;
    }
  }

  showQuestion();
}

// --- Diagnostic View ---

async function renderDiagnostic(slug) {
  app.innerHTML = `<h1>Diagnostic Assessment</h1>
    <div class="card" style="max-width:600px"><div class="text-secondary">Generating 5 diagnostic questions to calibrate your level...</div>
    <div class="progress-bar mt-16"><div class="fill" style="width:20%"></div></div></div>`;

  const questions = [];
  try {
    await connectSSE(`/api/diagnostic/generate?slug=${slug}`, {
      question: (q) => questions.push(q),
      error: (msg) => { app.innerHTML = `<div class="alert alert-error">${msg}</div>`; },
    });

    if (questions.length === 0) { app.innerHTML = '<div class="alert alert-error">No questions generated.</div>'; return; }

    // Reuse quiz UI but with diagnostic submit
    const container = document.createElement('div');
    app.innerHTML = '';
    app.appendChild(container);

    let current = 0;
    const answers = [];

    function showQ() {
      const q = questions[current];
      container.innerHTML = `<div class="card" style="max-width:700px;animation:fadeUp 0.3s ease both">
        <div class="text-muted text-mono mb-8">Diagnostic ${current + 1}/5 ${current < 2 ? '(Basic)' : current < 4 ? '(Intermediate)' : '(Advanced)'}</div>
        <h2 style="font-size:16px;text-transform:none;letter-spacing:normal;margin-bottom:20px">${q.question}</h2>
        <div>${q.options.map((o, i) => `<button class="btn" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:12px 16px" data-idx="${i}">${o}</button>`).join('')}</div>
        <div id="d-feedback" style="display:none;margin-top:16px"></div></div>`;

      container.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const correct = idx === q.correct;
          answers.push({ concept: q.concept, correct });
          container.querySelectorAll('[data-idx]').forEach((b, i) => {
            b.disabled = true;
            if (i === q.correct) b.style.borderColor = 'var(--success)';
            if (i === idx && !correct) b.style.borderColor = 'var(--error)';
          });
          const fb = document.getElementById('d-feedback');
          fb.style.display = 'block';
          fb.innerHTML = `<strong style="color:${correct ? 'var(--success)' : 'var(--error)'}">${correct ? 'Correct!' : 'Not quite.'}</strong> ${q.explanation || ''}
            <br><button class="btn btn-primary mt-16" id="d-next">${current === questions.length - 1 ? 'See Results' : 'Next →'}</button>`;
          document.getElementById('d-next').addEventListener('click', () => { current++; current < questions.length ? showQ() : submitDiag(); });
        });
      });
    }

    async function submitDiag() {
      container.innerHTML = '<div class="card"><div class="text-secondary">Analyzing results...</div></div>';
      try {
        const result = await api.post('/diagnostic/submit', { slug, answers });
        container.innerHTML = `<div class="card" style="max-width:600px;animation:fadeUp 0.3s ease both">
          <h2 style="text-transform:none;letter-spacing:normal">Diagnostic Results</h2>
          <div class="stat-card" style="margin:16px 0"><div class="label">Calibrated Level</div><div class="value accent">${result.calibratedLevel}</div></div>
          <p class="text-secondary">Score: ${result.score}/${result.total}</p>
          ${result.skipModules.length > 0 ? `<p class="text-secondary">${result.skipModules.length} introductory module(s) marked as optional review.</p>` : ''}
          <a href="#/plans/${slug}" class="btn btn-primary mt-16">View Plan</a></div>`;
      } catch (e) {
        container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      }
    }

    showQ();
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">Failed: ${e.message}</div>`;
  }
}

// --- Teach View ---

async function renderTeach(slug, moduleId) {
  app.innerHTML = `<h1>Loading module...</h1>`;

  try {
    const plan = await api.get(`/plans/${slug}`);
    const mod = plan.modules.find(m => String(m.id) === String(moduleId));
    if (!mod) { app.innerHTML = '<div class="alert alert-error">Module not found</div>'; return; }

    app.innerHTML = `<div style="max-width:760px">
      <div class="flex gap-8 mb-8"><a href="#/plans/${slug}" class="text-sm">← Back to plan</a></div>
      <h1>Module ${mod.id}: ${mod.title}</h1>
      <div class="text-muted mb-8">${mod.estimatedTime || ''} · ${(mod.keyConcepts || []).join(', ')}</div>
      <div id="teach-content" class="section"></div>
      <div id="teach-status" class="card"><div class="text-secondary">Claude is preparing the lesson...</div>
        <div class="progress-bar mt-16"><div class="fill" style="width:15%"></div></div></div>
    </div>`;

    const content = document.getElementById('teach-content');
    const status = document.getElementById('teach-status');

    await connectSSE(`/api/teach/module?slug=${slug}&moduleId=${moduleId}`, {
      content: (text) => {
        status.style.display = 'none';
        const div = document.createElement('div');
        div.className = 'section';
        div.style.animation = 'fadeUp 0.3s ease both';
        // Simple markdown: headers, bold, lists, code
        div.innerHTML = text
          .replace(/### (.*)/g, '<h3 style="color:var(--accent);text-transform:none;letter-spacing:normal">$1</h3>')
          .replace(/## (.*)/g, '<h2 style="text-transform:none;letter-spacing:normal">$1</h2>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code style="background:var(--accent-dim);color:var(--accent);padding:2px 6px;border-radius:3px">$1</code>')
          .replace(/^- (.*)/gm, '<li class="text-secondary" style="margin-left:20px">$1</li>')
          .replace(/\n\n/g, '<br><br>');
        content.appendChild(div);
      },
      check: (q) => {
        const div = document.createElement('div');
        div.className = 'card mt-16';
        div.style.borderColor = 'var(--accent)';
        div.style.animation = 'fadeUp 0.3s ease both';
        div.innerHTML = `<div class="text-mono text-muted mb-8">COMPREHENSION CHECK</div>
          <h3 style="text-transform:none;letter-spacing:normal;font-size:14px;color:var(--text-primary)">${q.question}</h3>
          <div class="mt-16">${q.options.map((o, i) => `<button class="btn" style="display:block;width:100%;text-align:left;margin-bottom:6px" data-cidx="${i}">${o}</button>`).join('')}</div>
          <div class="check-fb" style="display:none;margin-top:12px"></div>`;
        content.appendChild(div);

        div.querySelectorAll('[data-cidx]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.cidx);
            const correct = idx === q.correct;
            div.querySelectorAll('[data-cidx]').forEach((b, i) => {
              b.disabled = true;
              if (i === q.correct) b.style.borderColor = 'var(--success)';
              if (i === idx && !correct) b.style.borderColor = 'var(--error)';
            });
            div.querySelector('.check-fb').style.display = 'block';
            div.querySelector('.check-fb').innerHTML = `<strong style="color:${correct ? 'var(--success)' : 'var(--error)'}">${correct ? 'Correct!' : 'Not quite.'}</strong> ${q.explanation || ''}`;
          });
        });
      },
      error: (msg) => { status.innerHTML = `<span style="color:var(--error)">${msg}</span>`; },
    });

    // Done — add quiz prompt
    const doneDiv = document.createElement('div');
    doneDiv.className = 'card mt-16';
    doneDiv.style.animation = 'fadeUp 0.3s ease both';
    doneDiv.innerHTML = `<h3 style="text-transform:none;letter-spacing:normal;color:var(--accent)">Module Complete</h3>
      <p class="text-secondary">Ready to test what you learned?</p>
      <a href="#/quiz/${slug}" class="btn btn-primary mt-16">Take a Quiz</a>`;
    content.appendChild(doneDiv);
  } catch (e) {
    app.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
