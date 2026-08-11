# System Requirements

## Implemented

- 28-room inventory and database-backed package rates
- Authenticated Owner and Front Desk workflows
- Check-in, extensions, alerts, overdue state, and manual checkout
- Mandatory front-desk checkout buzzer after the browser's first user interaction; Owner monitoring remains silent
- Cash and GCash financial transactions
- Automatic Day and Night shifts with an 8:00 AM operational-day boundary
- Stay history with operational Today/This week/This month filters, audit history, and Owner overall/per-staff reporting
- PDF, Excel, and print exports
- Reservations with optional room assignment and booking-to-stay conversion
- Checkout-to-cleaning workflow and explicit return to Available
- Optional Motorcycle, Car, Van, Tricycle, and Other vehicle categories
- Database-enforced active-stay uniqueness and concurrent request tests
- Reconnect, visibility-return, and periodic active-data refresh
- Offline transactional write prevention
- Login throttling, deactivated-session enforcement, and safe server errors
- Atomic rate changes with complete before/after audit values
- Android Chrome-installable PWA manifest, branded icons, and standalone mode
- Network-only API operations with no offline financial write queue
- HTTPS and production environment guidance
- Cloud-managed and local-server deployment options
- Tested Docker MySQL backup and isolated restore scripts
- Android tablet-first responsive layouts with desktop, laptop, and mobile support
- Configurable Mini Store and extra-charge catalog with Owner-only management
- Cash/GCash store purchases with optional active-stay linking
- Idempotent, atomic store sales with immutable product and price snapshots
- Owner Overall, Rooms, and Store reporting with period, shift, staff, and Cash/GCash filters; responsive revenue charts; PDF charts; and Excel trend data

## Next Acceptance Work

- Complete physical Android tablet acceptance testing
- Complete a real Day/Night motel operating-day simulation and Owner sign-off

## Deferred

Inventory quantities, product costs, profit, suppliers, discounts, refunds, adjustments, expenses, unrelated other income, overdue charges, `ADMIN`, offline transaction queues, and shift cash reconciliation are not implemented.
