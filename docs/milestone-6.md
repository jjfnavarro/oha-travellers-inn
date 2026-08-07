# Milestone 6: Accountability and Financial Data Foundation

Milestone 6 extends the authentication and audit foundation delivered in Milestone 5. It prepares authoritative records for later Owner reporting without introducing the reporting dashboard itself.

## Current Implementation

- Owner and Front Desk remain the only account roles.
- Check-in requires Cash or GCash and creates an immutable room-charge transaction.
- An occupied room can be extended using any package offered for its room type.
- Extension time is added to the scheduled checkout time at the package's current price.
- Each extension captures its duration, amount, payment method, employee, previous checkout time, and new checkout time.
- The stay, extension, financial transaction, and audit event are saved atomically.
- Staff accounts are deactivated instead of deleted, and historical attribution is protected by database relationships.
- Payments that existed before the ledger are retained with an `UNKNOWN` payment method and without invented employee attribution.

## Roles and Authorization

- Continue supporting `OWNER` and `FRONT_DESK`. Add `ADMIN` only when its permissions are approved in a later scope.
- Enforce permissions in backend routes and services.
- Allow the Owner full operational, staff-management, audit, and financial access.
- Allow Admin users to manage operational administration according to the final policy.
- Restrict Front Desk users from motel-wide financial reporting by default.
- Keep individual username-and-password accounts; a PIN-based login is not currently required.

## Permanent Staff Attribution

Every important business action must save the responsible staff account at the time it occurs. Reports must not infer responsibility from the currently signed-in user.

Attribution will cover, as each workflow becomes available:

- Check-in creation
- Checkout
- Stay extension
- Payment or financial transaction handling
- Booking creation and update
- Important manual room or stay changes

Staff accounts referenced by business history should be deactivated rather than deleted. Database relationships must preserve historical attribution.

## Financial Transactions

Add a dedicated immutable financial transaction or payment model as the source of truth for money movement. Its planned data includes:

- Optional stay and future booking relationships
- Responsible staff account
- Transaction type
- Amount stored as integer centavos
- Payment method
- Optional note
- Creation timestamp

Implemented transaction types are `ROOM_CHARGE` and `EXTENSION_CHARGE`. Discounts, adjustments, and refunds remain deferred until separately approved.

The amount charged must be captured when the transaction occurs. Historical totals must never be recalculated using a current rate that may have changed.

## Pricing

Package and extension prices must come from centralized database-backed pricing. Prices must not be duplicated throughout the application. A financial transaction records the actual historical amount charged, independently of later pricing changes.

## Audit History

Audit logs represent important system actions and remain separate from financial transactions. Planned audited actions include:

- Check in and check out
- Extend stay
- Mark room available, under maintenance, or out of service
- Create, update, or cancel a booking
- Create a payment
- Apply a discount or adjustment
- Edit a stay
- Perform a manual status change

Audit entries should contain the actor, timestamp, affected entity, and structured details such as room, stay, booking, amount, previous value, and new value when applicable.

## Source of Truth and Testing

Do not maintain counters on staff accounts. Later reports will query authoritative `Stay`, `StayExtension`, `Booking`, `FinancialTransaction`, `AuditLog`, and staff records.

Add focused tests for role authorization, permanent attribution, immutable financial values, transaction creation, and audit logging as these capabilities are implemented.

## Scope Boundary

The Owner reporting dashboard and its aggregate calculations belong to Milestone 7. Bookings, `ADMIN`, discounts, adjustments, and refunds are not part of the current implementation.
