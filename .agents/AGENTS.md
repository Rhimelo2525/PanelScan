# Project Agent Guide

This repository uses specialized agent skills.

Before performing substantial work, determine which skill best matches
the task and follow its SKILL.md instructions.

## Available Skills

### project-architecture
Use when:
- Understanding project structure
- Adding a major feature
- Changing database/API architecture
- Determining where new code belongs

### project-implementation
Use when:
- Implementing an already-defined feature
- Creating UI/components
- Adding endpoints
- Connecting existing systems

### project-debug
Use when:
- Fixing bugs
- Investigating errors
- Debugging unexpected behavior
- Resolving build/runtime failures

### project-review
Use when:
- Reviewing completed work
- Checking for regressions
- Checking security or data-flow issues
- Verifying requirements

## General Rule

Use the smallest relevant skill.

Do not perform repository-wide investigation when a targeted skill
provides enough context.

Do not invoke every skill for every task.

Inspect only the files necessary for the current task and their direct
dependencies.

Preserve existing architecture unless the task explicitly requires an
architectural change.