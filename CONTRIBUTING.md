# Contributing to claude-tutor

Thanks for your interest in contributing!

## Getting started

1. Fork and clone the repo
2. Install the plugin locally: `/plugin install /path/to/claude-tutor`
3. Run the tests: `node tests/test-hooks.js`

## What to work on

- Check [open issues](https://github.com/kirilxd/claude-tutor/issues) for bugs and feature requests
- Look for issues labeled `good first issue`

## Making changes

1. Create a branch from `main`
2. Make your changes
3. Run all tests before submitting:
   ```bash
   node tests/test-hooks.js
   node skills/dashboard/server/tests/dashboard.test.js
   ```
4. Open a pull request with a clear description of what you changed and why

## Project structure

| Directory | What's there |
|---|---|
| `skills/` | Skill instructions (SKILL.md) — the core learning logic |
| `commands/` | Slash command definitions |
| `hooks/` | PreToolUse and SessionStart hooks |
| `skills/dashboard/server/` | Express server + frontend for the web dashboard |
| `tests/` | Hook unit tests |
| `evals/` | Trigger and functional evaluations |

## Guidelines

- Keep data schemas stable — the dashboard and CLI share the same JSON files
- Don't break the PreToolUse hook validation (it prevents data corruption)
- Test with both CLI and dashboard when changing data formats
- No external service dependencies — all data stays local

## Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Claude Code version (`claude --version`)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
