# OHA Traveller's Inn Development Guide

## Scope

This repository contains the Milestone 1 technical foundation, Milestone 2 room inventory, and Milestone 3 active stays. Do not add reservations, reporting, shifts, authentication, refunds, or overdue charges until a later milestone explicitly requires them.

## Conventions

- Keep the React client and Express server as separate npm workspaces.
- Use strict TypeScript and avoid `any`.
- Validate server environment variables in `server/src/config/env.ts`.
- Never expose server secrets to the client.
- Keep routes small and move shared infrastructure into focused modules.
- Add focused tests for new behavior.
- Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before finishing a change.
