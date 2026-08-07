# OHA Traveller's Inn Development Guide

## Scope

This repository currently contains only the Milestone 1 technical foundation. Do not add motel business features until a later milestone explicitly requires them.

## Conventions

- Keep the React client and Express server as separate npm workspaces.
- Use strict TypeScript and avoid `any`.
- Validate server environment variables in `server/src/config/env.ts`.
- Never expose server secrets to the client.
- Keep routes small and move shared infrastructure into focused modules.
- Add focused tests for new behavior.
- Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before finishing a change.
