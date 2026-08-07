# Milestone 4: History, Reports, and Automatic Shifts

## Operational Day

Reports use an 8:00 AM boundary in `Asia/Manila`. An operational day contains the Day shift beginning at 8:00 AM and the Night shift ending at 8:00 AM the following morning.

## Shifts

- Day: 8:00 AM-8:00 PM
- Night: 8:00 PM-8:00 AM
- Shift records are created automatically.
- A stay belongs to the shift in which it was checked in, even if checkout happens later.

## Reports

Daily reports include room-payment totals, stay counts, arrival counts, room-type usage, and early/overdue checkout counts. The same server-side data powers the screen, printable view, PDF, and Excel workbook.

Only room payments are included. Expenses, other income, employee attribution, refunds, and overdue charges remain deferred.
