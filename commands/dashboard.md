---
description: Launch the learning dashboard web UI to view and edit plans, progress, and spaced repetition data
allowed-tools: Bash(node *), Bash(npm *), Bash(cd *)
---

# /dashboard

Launch the claude-tutor dashboard web UI.

1. Install dependencies if needed:
   ```
   cd ${CLAUDE_PLUGIN_ROOT}/skills/dashboard/server && npm install --silent
   ```

2. Start the server:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/skills/dashboard/server/index.js
   ```

3. Tell the user: "Dashboard running at http://localhost:3847 — press Ctrl+C to stop."
