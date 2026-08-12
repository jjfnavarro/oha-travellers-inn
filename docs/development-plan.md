# Development Plan

## Completed

- Milestones 1-7: foundation, rooms, stays, shifts, authentication, financial ledger, and Owner reporting
- Milestone 8: bookings, conflict protection, status workflow, and booking-to-stay conversion
- Milestone 8.5: cleaning, vehicle categories, concurrency verification, reconnect recovery, and security/error hardening
- Milestone 9: installable PWA, production/HTTPS guidance, and tested backup/restore

## Next Required Phase: Milestone 10

The isolated database-backed workflow, permissions verification, financial reconciliation, report export, and backup restoration checks are complete. See `milestone-10.md`.

Remaining launch acceptance:

- Run the Android Chrome PWA checklist on the physical front-desk tablet.
- Complete a real Day/Night operating-day simulation and compare hand-recorded transactions with Owner totals.
- Record final Owner sign-off and any launch-blocking corrections.

Shift close and cash reconciliation remains optional and requires separate approval.

## Store Milestone

Implemented scope includes product management, store and extra-charge purchases, Cash/GCash collection, optional stay linking, idempotent atomic writes, historical price snapshots, financial-ledger integration, and overall/per-staff Owner reporting. Inventory and cost/profit accounting remain deferred.
