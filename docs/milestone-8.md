# Milestone 8: Reservations and Bookings

Milestone 8 adds a touch-friendly booking workflow for Owner and Front Desk accounts.

## Implemented Scope

- Select a date and view that date's bookings
- View today's bookings and future bookings
- Create and edit bookings with an optional guest name and room
- Optional arrival time, contact number, arrival type, plate number, reference, and notes
- Pending, Confirmed, Arrived, Completed, Cancelled, and No-show statuses
- Confirm, cancel, and mark no-show actions
- Backend room, operational-status, rate, and overlap validation
- Atomic conversion from a booking to a paid stay using the current room rate
- Cash or GCash collection at arrival
- Booking data reused for the stay instead of being retyped
- Permanent creator and updater attribution
- Booking audit actions and Owner report activity IDs
- Responsive Android tablet, desktop, and mobile layouts

## Scope Boundary

Bookings do not collect deposits or create financial transactions. Revenue is created only when a booking is converted to a stay. Cleaning status, vehicle subtypes, offline writes, PWA installation, and shift reconciliation remain later work.
