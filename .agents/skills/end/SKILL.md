---
name: end
description: Wrap up a work session on Exploding Catan — update WORK_NOTES.md, update/create memory files, update AGENTS.md, and provide a restart prompt for the next session.
user-invocable: true
disable-model-invocation: true
---

Wrap up the current session:

1. **Update `WORK_NOTES.md`** with what was done this session:
   - Group new info by topic (intersperse into existing sections, don't create a new chronological block)
   - Date-stamp time-sensitive facts inline: `> **26/10/22 update:** Fixed in commit abc1234.`
   - Update status of any items that changed; record the *why* and *how to undo* for anything parked
   - Session sections are ONLY for session-specific context (decisions, things Sameer said). Reference material goes into topical sections.

2. **Update memory files** in `~/.Codex/projects/-Users-Sameer-Documents-Coding-Exploding-Catan/memory/` (or the `-Users-Sameer-Documents-Coding` directory if that is where this session's memory lives):
   - Review the session for new decisions, feedback, preferences, or external references
   - Create new memory files or update existing ones as needed
   - Update `MEMORY.md` index

3. **Update `AGENTS.md`** if any of the following changed:
   - Current focus / active work status
   - Next steps
   - Branch / PR status
   - Known bugs or parked items

4. **Check the tree**: `git status` should be clean or the remaining changes named in the restart prompt. Never leave attribution trailers in commits.

5. **Provide a restart prompt**: 3–5 sentences Sameer can paste into a new session to pick up where we left off:

   ```
   Last session (DD/MM): [what was done]. Branch `xxx` is [status]; PR #n is [open/merged, CI state].
   [Open question / blocker]. Next: [specific task].
   ```
