const fs = require('fs');

try {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const filePath = input.tool_input?.file_path || '';
  const content = input.tool_input?.content || input.tool_input?.new_string || '';

  // Block writes to relative learning/ paths (project directory instead of ~/.claude/learning/)
  // Matches: learning/plans/..., learning/progress/..., ./learning/plans/..., or
  // absolute project paths like /Users/.../project/learning/plans/...
  const hasLearningSubdir = filePath.includes('/learning/plans/') || filePath.includes('/learning/progress/') ||
    filePath.startsWith('learning/plans/') || filePath.startsWith('learning/progress/');
  if (hasLearningSubdir && !filePath.includes('/.claude/learning/')) {
    process.stderr.write(
      `BLOCKED: Learning data must be saved to ~/.claude/learning/, not the project directory. ` +
      `Use the absolute path ~/.claude/learning/plans/ or ~/.claude/learning/progress/.`
    );
    process.exit(2);
  }

  // Only check ~/.claude/learning/ directory writes from here on
  if (!filePath.includes('/.claude/learning/')) {
    process.exit(0);
  }

  const quizFields = ['"quizzes"', '"weakAreas"', '"strongAreas"', '"spacedRepetition"', '"overallScore"'];
  const planFields = ['"modules"', '"resources"', '"timeCommitment"', '"totalEstimatedTime"'];
  const hasQuizData = quizFields.some(f => content.includes(f));
  const hasPlanData = planFields.some(f => content.includes(f));

  // Block quiz data written to plans directory
  if (filePath.includes('/learning/plans/') && hasQuizData) {
    const slug = filePath.split('/').pop().replace(/-\d{4}-\d{2}-\d{2}\.json$/, '');
    process.stderr.write(
      `BLOCKED: Quiz progress must be saved to ~/.claude/learning/progress/${slug}.json, not to plans/. ` +
      `Never add quizzes, weakAreas, strongAreas, spacedRepetition, or overallScore to plan files.`
    );
    process.exit(2);
  }

  // Block plan data written to progress directory
  if (filePath.includes('/learning/progress/') && hasPlanData) {
    process.stderr.write(
      `BLOCKED: Plan data (modules, resources) must be saved to ~/.claude/learning/plans/, not progress/. ` +
      `Never add modules or resources to progress files.`
    );
    process.exit(2);
  }

  // Validate schema: progress files must use correct field names
  if (filePath.includes('/learning/progress/') && content.trim().startsWith('{')) {
    const allowedProgressFields = ['topic', 'quizzes', 'weakAreas', 'strongAreas', 'overallScore', 'spacedRepetition'];
    try {
      const parsed = JSON.parse(content);
      const topKeys = Object.keys(parsed);
      const unknownKeys = topKeys.filter(k => !allowedProgressFields.includes(k));
      if (unknownKeys.length > 0) {
        process.stderr.write(
          `BLOCKED: Progress file contains unknown fields: ${unknownKeys.join(', ')}. ` +
          `Allowed fields are: ${allowedProgressFields.join(', ')}. ` +
          `Use "quizzes" (not "quiz_history", "results", "history", etc).`
        );
        process.exit(2);
      }
      // Validate overallScore is percentage (0-100), not fraction (0-1)
      if (parsed.overallScore != null && parsed.overallScore > 0 && parsed.overallScore <= 1) {
        process.stderr.write(
          `BLOCKED: overallScore must be a percentage (0-100), not a fraction. ` +
          `Got ${parsed.overallScore} — did you mean ${Math.round(parsed.overallScore * 100)}?`
        );
        process.exit(2);
      }
    } catch (e) {
      // Not valid JSON yet (partial edit) — allow it
    }
  }

  // Validate schema: plan files must use correct field names
  if (filePath.includes('/learning/plans/') && content.trim().startsWith('{')) {
    const allowedPlanFields = ['topic', 'slug', 'created', 'level', 'goal', 'depth', 'timeCommitment', 'modules', 'totalEstimatedTime', 'diagnostic'];
    try {
      const parsed = JSON.parse(content);
      const topKeys = Object.keys(parsed);
      const unknownKeys = topKeys.filter(k => !allowedPlanFields.includes(k));
      if (unknownKeys.length > 0) {
        process.stderr.write(
          `BLOCKED: Plan file contains unknown fields: ${unknownKeys.join(', ')}. ` +
          `Allowed fields are: ${allowedPlanFields.join(', ')}. ` +
          `Quiz data (quizzes, weakAreas, etc) belongs in progress/, not plans/.`
        );
        process.exit(2);
      }
    } catch (e) {
      // Not valid JSON yet (partial edit) — allow it
    }
  }

  // Block any learning data written to root (except index.json and profile.json)
  const isRootFile = filePath.match(/\/\.claude\/learning\/[^/]+$/);
  const allowedRootFiles = ['index.json', 'profile.json'];
  if (isRootFile) {
    const fileName = filePath.split('/').pop();
    if (!allowedRootFiles.includes(fileName)) {
      process.stderr.write(
        `BLOCKED: Only index.json and profile.json belong in ~/.claude/learning/. ` +
        `Plans go in plans/, progress goes in progress/.`
      );
      process.exit(2);
    }
  }

  process.exit(0);
} catch (e) {
  // Don't block on hook errors
  process.exit(0);
}
