# Android Tablet Acceptance Testing

Complete this checklist on the physical front-desk Android tablet using the production HTTPS URL. Use Google Chrome and the installed PWA in both landscape and portrait. Record the date, tester, Android version, Chrome version, and result for each check.

The local API and database portion passed on August 8, 2026. Installation, standalone display, physical touch ergonomics, Android sleep behavior, and real-device sound behavior remain pending until the production HTTPS URL is available on the tablet. See `milestone-10.md` for the local results.

## Installation and Layout

1. Open the production URL in Chrome and confirm the login page loads without a certificate warning.
2. Use **Install app** or **Add to Home screen** and confirm **OHA Inn** appears on the Home Screen.
3. Launch the Home Screen icon and confirm standalone mode without normal browser-tab controls.
4. Verify login, sidebar, room cards, controls, dialogs, booking dates, and reports in landscape and portrait.
5. Confirm touch targets are comfortable, text is readable, dialogs fit the visible screen, and the page itself has no horizontal scrolling. Data tables may use their contained horizontal scroller when necessary.

## Operational Workflows

6. Log in with a Front Desk account and perform a Cash room check-in.
7. Confirm the countdown matches the database-backed expected checkout time.
8. Enable sound, use a controlled test stay, and confirm the five-minute visual and audible warning.
9. Confirm the overdue visual state and repeating foreground warning without creating an automatic charge or checkout.
10. Check out the stay and confirm the room changes to Cleaning, then mark it Available.
11. Perform a paid stay extension and confirm the checkout timestamp and Cash/GCash transaction update once.
12. Create, edit, view, and convert a booking into a stay.
13. Log in as Owner and verify reporting controls, totals, activity, PDF, Excel, and print views.

## Recovery and Network Safety

14. With an active stay visible, lock and unlock the tablet. Confirm the countdown and status recover from `expectedCheckoutAt`.
15. Switch to another Android application and return. Confirm authoritative rooms and bookings refresh.
16. Close and reopen the PWA, then refresh it. Confirm the session and current database state are correct.
17. Temporarily disconnect Wi-Fi and attempt a harmless test write. Confirm the system clearly refuses it and does not report success.
18. Restore Wi-Fi and confirm rooms, active stays, bookings, and reports return to authoritative server data.
19. Confirm the failed offline action was not queued and no duplicate stay, extension, payment, booking conversion, or status change exists.
20. Log out, reopen the PWA, and confirm protected data requires another login.

## Warning Limitation

In-app warnings recover when the PWA becomes visible because status is recalculated from the database `expectedCheckoutAt`. Android may suspend timers and audio while the tablet is locked or another application is active. This release does not promise background alerts and does not require notification permission. Staff must keep operational monitoring procedures in place until a separately approved Web Push design is implemented.

## Sign-Off

Acceptance is complete only when critical workflows pass on the physical tablet, financial records reconcile with the performed actions, offline attempts create no duplicates, and any failures are recorded for correction before launch.
