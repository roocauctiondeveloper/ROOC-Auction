# Customization Rules for Antigravity

- **Auto-Version Bumping on Deploy/Commit:** Whenever the user asks to commit, push, deploy, or update the production environment (e.g., "อัพ prod", "commit", "push"), you MUST always run the `npm run update` script (which executes `src/scripts/ai-commit.js`) instead of running raw Git commands directly. This ensures that the version number in `package.json` is bumped automatically.
