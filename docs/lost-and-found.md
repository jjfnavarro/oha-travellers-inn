# Lost & Found

Lost & Found is an authenticated operational module available to Owner and
Front Desk accounts. A record requires an item name, room, and found time. A
recent completed stay may be linked only when staff can identify it reliably.

## Workflow

1. Record an item manually from Lost & Found or use **Report found item** on a
   room in Cleaning.
2. Search by item, description, or exact room number and filter by status,
   room, or operational date period.
3. Mark an Unclaimed item Claimed when it is returned. The processing staff,
   time, optional recipient name, and notes are preserved.
4. Only the Owner may mark an Unclaimed item Disposed or permanently delete an
   obviously mistaken duplicate. A deletion requires a reason.

Status transitions are one-way from Unclaimed to Claimed or Disposed. All
creates, edits, claims, disposals, and deletions are audit logged. Recording an
item never blocks Cleaning to Available and has no financial effect.
