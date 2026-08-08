# OHA Traveller's Inn Development Guide

## Scope

This repository contains the foundation and operational workflows through Milestone 9, including staff authentication, audit history, Cash/GCash room charges, stay extensions, Owner reporting, bookings, cleaning status, vehicle categories, operational hardening, PWA installation, deployment guidance, and tested backup/restore procedures. Do not add refunds, discounts, adjustments, expenses, other income, overdue charges, or `ADMIN` until a milestone explicitly requires them.

## Target Platform

- Build a responsive Progressive Web App primarily for an Android tablet running Google Chrome and installed in standalone mode.
- Continue supporting desktop, laptop, and mobile browsers without converting the project into a native Android application.
- Keep critical transactions network-only. Never queue or simulate successful financial or operational writes while offline.
- Treat `expectedCheckoutAt` from authoritative database data as the source of truth after refresh, reconnection, sleep, or application switching.
- Retain harmless iOS compatibility metadata, but do not describe iPad, iOS, or Safari as the primary deployment platform.

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
