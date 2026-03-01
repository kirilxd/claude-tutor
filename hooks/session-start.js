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

    if (topicDue > 0) {
      dueCount += topicDue;
      dueTopics.push(`${topic.displayName || slug} (${topicDue})`);
    }
  }

  if (dueCount > 0) {
    const topicList = dueTopics.join(', ');
    console.log(`You have ${dueCount} concept(s) due for review: ${topicList}. Run /review to see details or /quiz to practice.`);
  }
} catch (e) {
  // Silently exit — don't block session start for data issues
  process.exit(0);
}
