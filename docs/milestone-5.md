# Milestone 5: Staff Authentication and Accountability

## Accounts

- `Zack`: Owner
- `Dodong`: Front desk
- `Along`: Front desk

All accounts use individual usernames and passwords. Passwords are hashed and never stored or returned as plain text.

## Access

The Owner can access reports, daily/weekly/monthly statistics, rate management, room creation, staff management, and audit history. Front-desk accounts can use the room board, check guests in and out, update operational room status, and view guest/vehicle history. Financial endpoints enforce Owner access on the server.

## Sessions

Sessions use random tokens in HTTP-only cookies and expire after 24 hours. There is no inactivity timer. Logout invalidates the database session immediately.

## Initial Setup

Set the three `*_INITIAL_PASSWORD` values in ignored `server/.env`, using at least eight characters for each, then run `npm.cmd run users:seed`. Clear those three values after the accounts have been created.

## Accountability Foundation

Check-in and checkout records save the responsible staff account when the action is performed by an authenticated user. Important implemented actions are also written to the audit log. Owner-only financial endpoints enforce authorization on the server.

## Deferred

The `ADMIN` role, stay extensions, bookings, complete transaction attribution, a dedicated financial transaction ledger, and overall/per-staff Owner reporting are planned for Milestones 6 and 7. Milestone 5 reports still use the amount captured on each stay and are not the final financial reporting design.
