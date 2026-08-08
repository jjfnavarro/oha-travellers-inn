# Database Overview

The application uses MySQL through Prisma. Amounts are stored as integer centavos.

## Core Records

- `RoomType`, `Room`, and `StayRate`: room inventory and current prices
- `Stay` and `StayExtension`: occupancy and extensions
- `Booking`: reservations and their conversion link to a stay
- `FinancialTransaction`: authoritative room and extension payments
- `StaffAccount` and `Session`: accounts and login sessions
- `AuditLog`: staff actions
- `Shift`: automatic Day and Night shift windows

## Booking Relationships

A booking may have a room and may later have one converted stay. It permanently records the creating staff account and the most recent updating staff account. Staff and historical booking relations use restricted deletion.

`bookingDate` is stored as a MySQL date. `estimatedArrivalAt` is nullable and is used with `expectedDurationHours` for overlap checks. Booking conversion uses the room's current `StayRate`; the charged amount is copied into the resulting `FinancialTransaction`.

`Stay.vehicleType` and `Booking.vehicleType` are nullable. Null means the category was not recorded, including historical vehicle arrivals created before Milestone 8.5.

## Active-Stay Protection

`Stay.activeRoomId` is nullable and unique. Active stays set it to the room ID; completed stays clear it. This database constraint prevents two active stays for one room even when requests happen concurrently.

## Cleaning

Room operational status includes Active, Cleaning, Maintenance, and Inactive. Checkout clears `activeRoomId` and changes the room to Cleaning in the same transaction. Staff must explicitly change Cleaning to Active before the next stay.

## Local Inspection

With Docker MySQL running, open Prisma Studio from the project root:

```powershell
npm.cmd run prisma:studio
```

Use Prisma migrations for schema changes. Never edit production rows or migration history manually.
