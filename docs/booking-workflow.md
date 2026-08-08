# Booking Workflow

## Create a Booking

1. Open **Bookings** from the sidebar.
2. Select the booking date.
3. Press **Add booking**.
4. Enter the expected duration and any known guest details.
5. Assign a room now or leave it as **Room not assigned**.
6. Save the booking.

Guest name, room, arrival time, contact number, vehicle information, reference, and notes are optional. The duration must be a package currently offered by the motel. If a room is assigned, that room type must offer the selected duration.

## Room Conflicts

The server checks booking conflicts. Pending, Confirmed, and Arrived bookings block overlapping time windows for the same room. Cancelled, No-show, and Completed bookings do not.

Two bookings are allowed to touch at their boundary. For example, a booking ending at 8:00 PM does not conflict with one beginning at 8:00 PM.

Bookings without both a room and estimated arrival time cannot be checked for overlap. They are validated again when the guest arrives.

## Guest Arrival

1. Find the booking and press **Arrived**.
2. Select an available room if one is not already usable.
3. Confirm Walk-in or Vehicle arrival.
4. Select Cash or GCash.
5. Confirm arrival.

The server verifies the booking status, room status, room occupancy, and current valid rate. It then creates the stay, room-charge transaction, booking update, and audit entry in one database transaction. If any write fails, the complete conversion is rolled back.

The booking becomes **Arrived**. When its linked stay is checked out, the booking becomes **Completed**.

## Status Rules

- Pending can be edited, confirmed, cancelled, marked no-show, or checked in.
- Confirmed can be edited, cancelled, marked no-show, or checked in.
- Arrived is preserved while its stay is active.
- Completed, Cancelled, and No-show are historical terminal states.
