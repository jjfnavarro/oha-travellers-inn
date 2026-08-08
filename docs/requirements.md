# System Requirements

## Implemented

- 28-room inventory and database-backed package rates
- Authenticated Owner and Front Desk workflows
- Check-in, extensions, alerts, overdue state, and manual checkout
- Cash and GCash financial transactions
- Automatic Day and Night shifts with an 8:00 AM operational-day boundary
- Stay history, audit history, and Owner overall/per-staff reporting
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

## Next Acceptance Work

- Complete physical Android tablet acceptance testing
- Complete a real Day/Night motel operating-day simulation and Owner sign-off

## Deferred

Discounts, refunds, adjustments, expenses, other income, overdue charges, `ADMIN`, offline transaction queues, and shift cash reconciliation are not implemented.
