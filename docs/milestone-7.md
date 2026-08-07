# Milestone 7: Owner Overall and Per-Staff Reporting

Milestone 7 will provide Owner-only operational and financial reporting calculated by backend services from saved database records.

## Reporting Modes

The Owner can switch between:

- **Overall:** combined results from all staff and authoritative motel records.
- **By Staff:** results attributable to one selected active registered staff account.

The selected staff member is a report filter. Statistics must use staff IDs stored on the underlying transactions and actions, not the user currently viewing the report.

## Period and Shift Filters

Supported reporting periods will include:

- Current shift
- Previous shift
- Today
- Specific date
- This week
- This month
- Custom date range

Reports can also include Day shift only, Night shift only, or all shifts. Operational-day calculations retain the 8:00 AM boundary in `Asia/Manila` established in Milestone 4.

## Operational Statistics

Overall reporting will include:

- Total check-ins, completed stays, and active stays
- Total room uses and unique rooms used
- Guest/stay count and room usage by room
- Package counts for 3, 6, 12, and 24 hours
- Stay extension count
- Walk-in count
- Vehicle count and vehicle-type breakdown when vehicle types are supported
- Overdue checkout count

The By Staff view will show the equivalent attributable check-ins, stays, room uses, packages, extensions, and activity for the selected employee.

## Financial Statistics

Financial totals will be calculated from immutable financial transactions and include:

- Gross room revenue
- Revenue by 3, 6, 12, and 24-hour package
- Extension revenue
- Discounts
- Adjustments
- Refunds when supported
- Net revenue
- Total amount collected

The By Staff view will calculate only the transactions handled by the selected staff member. Financial logic belongs in backend services, not React.

## Detailed Activity

The staff report will include a chronological activity log. Entries should show, when applicable:

- Date and time
- Staff user
- Action
- Room number
- Stay ID
- Booking ID
- Financial amount
- Previous and new values

## Owner Interface

The iPad and desktop interface will provide a reporting-period control, shift filter, Overall/By Staff segmented control, and staff selector when By Staff is active. It will present concise summary metrics followed by package, room, vehicle, and financial breakdowns and the detailed activity log.

The backend must enforce Owner access for report data and exports. React visibility rules are supplemental only.

## Exports and Testing

Screen, PDF, and Excel reports must use the same backend calculations and selected filters.

Tests will cover:

- Reporting calculations and historical price accuracy
- Overall versus per-staff filtering
- Date-range and shift-boundary behavior
- Financial transaction type handling
- Owner authorization and denial for restricted roles
- Consistency between screen and exported report data

## Scope Boundary

Reports will not use manually maintained counters or derive historical revenue solely from stay duration and current pricing. Expenses and other income remain outside scope unless a later requirement explicitly adds them.
