# Debugging Skill

## Objective

Find the root cause and implement the smallest safe fix.

## Workflow

1. Reproduce or understand the reported failure.
2. Identify the subsystem responsible.
3. Inspect the closest relevant files.
4. Trace direct dependencies only as needed.
5. Form a likely root cause.
6. Implement the smallest correct fix.
7. Verify the affected behavior.
8. Stop.

## Rules

Do not refactor unrelated code while debugging.

Do not repeatedly inspect files unless new information requires it.

Do not fix unrelated warnings discovered during investigation.

Do not redesign architecture to solve a localized bug.

Prefer evidence from runtime errors, logs, types, tests, and actual code
over speculative investigation.

If the fix passes the relevant verification, consider the debugging task
complete.