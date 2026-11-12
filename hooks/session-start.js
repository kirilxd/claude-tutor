const fs = require('fs');
const path = require('path');

try {
  const learningDir = path.join(process.env.HOME, '.claude', 'learning');
  const indexPath = path.join(learningDir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    process.exit(0);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const today = new Date().toISOString().split('T')[0];
  let dueCount = 0;
  const dueTopics = [];
  const deadlines = [];

  for (const [slug, topic] of Object.entries(index.topics || {})) {
    const progressPath = path.join(learningDir, topic.progressFile);
    if (!fs.existsSync(progressPath)) continue;

    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    const sr = progress.spacedRepetition || {};
    let topicDue = 0;

    for (const concept of Object.values(sr)) {
      if (concept.nextReview && concept.nextReview <= today) {
        topicDue++;
      }
    }

    const planPath = topic.planFile && path.join(learningDir, topic.planFile);
    if (planPath && fs.existsSync(planPath)) {
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      const daysLeft = Math.round((new Date(plan.deadline) - new Date(today)) / 86400000);
      if (daysLeft >= 0) {
        const concepts = (plan.modules || []).flatMap(m => m.keyConcepts || []);
        const notStarted = concepts.filter(c => !sr[c]).length;
        deadlines.push(`${topic.displayName || slug}: ${notStarted} of ${concepts.length} concepts not started, ${daysLeft} day(s) to the deadline.`);
      }
    }

    if (topicDue > 0) {
      dueCount += topicDue;
      dueTopics.push(`${topic.displayName || slug} (${topicDue})`);
    }
  }

  if (dueCount > 0) {
    const topicList = dueTopics.join(', ');
    console.log(`You have ${dueCount} concept(s) due for review: ${topicList}. Run /review to see details, /quiz to practice, or /study for a guided session.`);
  }
  for (const line of deadlines) console.log(line);
} catch (e) {
  // Silently exit — don't block session start for data issues
  process.exit(0);
}
