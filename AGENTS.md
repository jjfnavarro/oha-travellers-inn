# OHA Traveller's Inn Development Guide

## Scope

This repository contains the foundation and operational workflows through the current Milestone 6 work, including staff authentication, audit history, Cash/GCash room charges, and stay extensions. Milestone 7 plans Owner overall and per-staff reporting. Do not add reservations, bookings, refunds, discounts, adjustments, expenses, other income, overdue charges, or `ADMIN` until a milestone explicitly requires them.

## Conventions

- Keep the React client and Express server as separate npm workspaces.
- Use strict TypeScript and avoid `any`.
- Validate server environment variables in `server/src/config/env.ts`.
- Never expose server secrets to the client.
- Keep routes small and move shared infrastructure into focused modules.
- Add focused tests for new behavior.
- Enforce role permissions on the server; hiding client controls is not authorization.
- Permanently associate staff-attributable business actions with the responsible account.
- Calculate reports from authoritative database records instead of stored counters or frontend totals.
- Preserve the price charged at transaction time so later rate changes cannot alter historical reports.
- Keep financial transactions separate from audit logs: transactions represent money movement, while audit logs represent actions.
- Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before finishing a change.
