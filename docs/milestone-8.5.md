# Milestone 8.5: Operational Hardening

## Cleaning Workflow

Checkout and its audit records are atomic. A completed checkout changes the room from Active to Cleaning. Cleaning rooms cannot accept direct or booked check-ins. Staff returns the room to Available after cleaning, producing a `MARK_ROOM_AVAILABLE` audit entry.

## Arrival and Vehicle Categories

Vehicle arrivals may optionally record Motorcycle, Car, Van, Tricycle, or Other vehicle. Plate number remains optional. Walk-ins store no vehicle category or plate. Historical vehicle rows remain valid with a null category.

Owner reporting includes a vehicle-category breakdown when categories were recorded.

## Concurrent Operations

The unique nullable `Stay.activeRoomId` database column remains the final protection against two active stays for one room. Check-in uses a serializable transaction and returns HTTP 409 for a competing unique-room claim. Automated tests issue two simultaneous check-ins and verify that exactly one succeeds and only one charge is created.

Assigned booking conflict checks serialize on the selected room row before checking time overlaps.

## Recovery

Countdowns continue to derive from database `expectedCheckoutAt`, never a saved decrementing counter. Inventory refreshes after page reload, every 30 seconds, after network reconnection, and when the app becomes visible after Android tablet sleep or application switching. Bookings reload after reconnection.

The browser blocks transactional API requests while offline instead of silently queueing them. The server remains authoritative after reconnection.

## Security and Errors

- Database sessions expire after 24 hours.
- Inactive accounts are rejected on each authenticated request.
- Five failed logins for one IP/username combination trigger a 15-minute in-memory limit.
- Production cookies remain HTTP-only, Secure, and SameSite Lax.
- JSON bodies are limited to 100 KB.
- Unexpected errors are logged by the server and return a generic JSON message.
- Owner-only authorization remains enforced by backend middleware.

## Rate Auditing

Rate updates and their audit entry are saved in one transaction. Audit details contain the previous and new room-type name, description, durations, and centavo amounts. Historical financial transactions remain unchanged.
