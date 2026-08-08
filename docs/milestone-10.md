# Milestone 10: Acceptance and Launch Preparation

Milestone 10 is in progress. Local automated and isolated database-backed acceptance passed on August 8, 2026. Physical Android tablet testing and a complete real Day/Night operating-day simulation remain required before launch sign-off.

## Isolated Workflow Result

A fresh backup of the normal database was restored into `oha_travellers_inn_restore_test`. A temporary API on port 4001 connected only to that isolated database. The live database was not used for acceptance transactions.

The following workflow passed:

1. Owner and Front Desk authentication.
2. Backend denial of Owner reports to Front Desk with HTTP 403.
3. Three-hour Standard room check-in by Dodong using Cash.
4. Three-hour extension by Dodong using GCash.
5. Exact three-hour movement of `expectedCheckoutAt`.
6. Early checkout with no refund and room transition to Cleaning.
7. Manual transition from Cleaning to Available.
8. Booking creation, date-list visibility, confirmation, and cancellation.
9. Owner report, PDF export, and Excel export generation.

## Financial and Attribution Reconciliation

The isolated stay produced exactly two immutable transactions:

- Room charge: PHP 250 Cash
- Extension charge: PHP 250 GCash
- Expected and reported gross-revenue increase: PHP 500

The stay stored Dodong as both check-in and checkout employee, recorded one three-hour extension, and retained Check-in, Extend stay, Checkout, and Cleaning audit actions. The booking stored Dodong as creator and ended Cancelled. The database contained no duplicate non-null active-room claims.

## Recovery Result

The pre-test backup was 36,342 bytes with SHA-256:

```text
16E1E1FB5C9FE934422767F7003A6FCA2E79CD889239C25F38B28A0128935528
```

After acceptance, the temporary API was stopped and the isolated database was restored again from that backup. Final restored counts were:

- 28 rooms
- 3 staff accounts
- 16 stays
- 17 financial transactions
- 2 bookings

Acceptance test transactions therefore do not remain in the isolated restore database. Local backup files remain ignored by Git.

## Remaining Sign-Off

- Complete every physical-device step in `acceptance-testing.md` on the front-desk Android tablet over HTTPS.
- Run a complete real Day and Night operating-day simulation.
- Reconcile manual Cash/GCash notes with screen, PDF, Excel, per-staff, shift, and overall totals.
- Record the Android version, Chrome version, tester, failures, corrections, and final Owner approval.

Background sound while Android suspends the PWA remains a documented platform limitation. Notification or Web Push work requires separate approval and is not a Milestone 10 launch requirement.
