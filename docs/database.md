# Database Overview

The application uses MySQL through Prisma. Amounts are stored as integer centavos.

## Core Records

- `RoomType`, `Room`, and `StayRate`: room inventory and current prices
- `Stay` and `StayExtension`: occupancy and extensions
- `Booking`: reservations and their conversion link to a stay
- `Product`, `StoreSale`, and `StoreSaleItem`: current catalog and immutable sale snapshots
- `FinancialTransaction`: authoritative room, extension, store, and extra-charge payments
- `StaffAccount` and `Session`: accounts and login sessions
- `AuditLog`: staff actions
- `LostFoundItem`: operational records for belongings found in rooms
- `Shift`: automatic Day and Night shift windows

## Booking Relationships

A booking may have a room and may later have one converted stay. It permanently records the creating staff account and the most recent updating staff account. Staff and historical booking relations use restricted deletion.

`bookingDate` is stored as a MySQL date. `estimatedArrivalAt` is nullable and is used with `expectedDurationHours` for overlap checks. Booking conversion uses the room's current `StayRate`; the charged amount is copied into the resulting `FinancialTransaction`.

`Stay.vehicleType` and `Booking.vehicleType` are nullable. Null means the category was not recorded, including historical vehicle arrivals created before Milestone 8.5.

## Active-Stay Protection

`Stay.activeRoomId` is nullable and unique. Active stays set it to the room ID; completed stays clear it. This database constraint prevents two active stays for one room even when requests happen concurrently.

## Cleaning

Room operational status includes Active, Cleaning, Maintenance, and Inactive. Checkout clears `activeRoomId` and changes the room to Cleaning in the same transaction. Staff must explicitly change Cleaning to Active before the next stay.

## Store and Extra Charges

`Product` contains the current Owner-managed name, category, selling price, optional image path or URL, and active status. Products are deactivated instead of deleted so old relations remain intact.

Each purchase creates one `StoreSale`, one or more `StoreSaleItem` records, and one matching `FinancialTransaction` in a single database transaction. The sale has a unique UUID idempotency key so retrying the same request cannot create another charge. A sale may optionally reference an active stay; the room is reached through that stay and is not duplicated on the sale.

Each item copies the product name, category, unit price, quantity, and line total used at purchase time. These snapshots and the ledger amount remain unchanged when the Owner later edits the product. Uploaded product images are stored in the configured filesystem directory and only their paths are stored in MySQL. Image binary data is never stored in MySQL.

## Lost & Found

`LostFoundItem` requires a room and may optionally reference a completed stay
when staff can identify it reliably. It permanently records the staff account
that created the entry and any account that later processes a claim or
disposal. Room, stay, and staff foreign keys use restricted deletion so
operational history remains available after a room is archived or an account
is deactivated.

Lost & Found statuses move from Unclaimed to either Claimed or Disposed. These
records never create financial transactions and do not affect revenue,
expenses, payment-method totals, or reports.

## Local Inspection

With Docker MySQL running, open Prisma Studio from the project root:

```powershell
npm.cmd run prisma:studio
```

Use Prisma migrations for schema changes. Never edit production rows or migration history manually.
