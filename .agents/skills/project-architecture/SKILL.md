# Project Architecture Skill

## Purpose

Use this skill when architectural understanding or decisions are required.

## Project Stack

Document the actual stack here:

- Frontend:
- Backend:
- Database:
- Authentication:
- Styling:
- Deployment:

## Architecture

Document the project's major directories and responsibilities.

Example:

src/
  components/     Reusable UI
  pages/          Application routes
  services/       API/business logic
  hooks/          Shared hooks
  types/          Shared TypeScript types

server/
  routes/         API routes
  controllers/    Request handling
  services/       Business logic
  models/         Database models

## Data Flow

Document how data normally travels through the application.

UI
→ API/service
→ backend route
→ controller
→ service
→ database

Follow the existing flow instead of introducing alternative patterns.

## Architecture Rules

Before creating something new:

1. Search for an existing implementation.
2. Reuse existing abstractions where appropriate.
3. Follow neighboring modules as implementation references.
4. Do not introduce another architectural pattern without necessity.

## Investigation Strategy

Start with the module directly related to the task.

Expand investigation only to its dependencies.

Do not scan the entire repository unless the requested change is
cross-cutting.