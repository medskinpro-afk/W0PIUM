# Quick Bug Fix

Single-command: find the bug, fix it, done.

## Workflow

1. **Understand** — read the file, grep for related code, understand the flow
2. **Identify** — find the root cause, not the symptom
3. **Fix** — minimal, focused change
4. **Verify** — check no other code breaks
5. **Commit** — `fix: <what> (<area>)`

## Standards

- One bug = one commit
- No refactoring, no scope creep
- Add gotcha to `AGENTS.md` if it's a recurring trap
- Always check for the same bug in other files (grep for similar pattern)

**Important:** I will NEVER:
- Add "Co-authored-by" or any Claude signatures
- Modify git config or user credentials
- Add any AI/assistant attribution
