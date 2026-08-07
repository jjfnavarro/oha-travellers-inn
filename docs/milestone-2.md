# Milestone 2: Room Inventory

Milestone 2 adds the owner's actual room inventory and stay-rate configuration.

## Inventory

- Standard: Rooms 1-10 and A-C
- Deluxe: Rooms 20-27
- Suite: Rooms 28-33
- Family: Room 34
- Total: 28 rooms

## Rates

| Room type |     3 hours |     6 hours |    12 hours |  24 hours |
| --------- | ----------: | ----------: | ----------: | --------: |
| Standard  |     PHP 250 |     PHP 500 |     PHP 800 | PHP 1,000 |
| Deluxe    |     PHP 300 |     PHP 600 |     PHP 800 | PHP 1,100 |
| Suite     |     PHP 450 |     PHP 900 | Not offered | PHP 1,250 |
| Family    | Not offered | Not offered | Not offered | PHP 1,250 |

Prices are stored as integer centavos to prevent rounding errors. An absent `StayRate` row means that duration is not offered for that room type.

## Scope Boundary

This milestone manages room definitions, operational status, room types, and rates. It does not implement guest stays, occupancy, check-in, checkout, reservations, staff accounts, shifts, or reporting.
