---
name: start
description: Start a work session on Exploding Catan — read notes, memories, and repo state, then summarize where we left off. Use at the beginning of a conversation.
user-invocable: true
---

Start a new session by doing the following:

1. Read `WORK_NOTES.md` for project context, decisions, parked items, and next steps.
2. Read the memory files (check `MEMORY.md` index first). Sessions have been opened from two directories, so look in both:
   - `~/.Codex/projects/-Users-Sameer-Documents-Coding-Exploding-Catan/memory/`
   - `~/.Codex/projects/-Users-Sameer-Documents-Coding/memory/` (the `project_exploding_catan.md` and `feedback_*` files)
3. Check `git status`, `git log --oneline -10`, the current branch, and `gh pr list --repo samc24/Exploding-Catan` for open PRs and their checks.
4. Read the "Current Focus" and "Next Steps" sections of `AGENTS.md`.
5. Provide a concise summary of:
   - Current branch, uncommitted state, and PR / CI status
   - What was last worked on
   - Outstanding blockers or next steps that are actionable now
6. Ask Sameer what he wants to work on today.

Keep the summary short and direct. Don't restate things Sameer already knows — focus on what's changed or what's actionable.
