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
8. Sign in as a front-desk employee and confirm a real occupied room enters checkout-soon status and sounds its warning at 10 minutes remaining.
9. Confirm the 10-second buzzer repeats every minute until the room is checked out.
10. Sign in as the Owner and confirm checkout status remains visible without sound controls or audible alarms.
11. Confirm the overdue visual state and repeating foreground warning without creating an automatic charge or checkout.
12. Check out the stay and confirm the room changes to Cleaning, then mark it Available.
13. Perform a paid stay extension and confirm the checkout timestamp and Cash/GCash transaction update once.
14. Create, edit, view, and convert a booking into a stay.
15. Log in as Owner and verify reporting controls, totals, activity, PDF, Excel, and print views.
16. As Owner, create one Store product with an uploaded image and one Extra charge, then edit a product price and confirm both square cards appear in the sales view.
17. As Front Desk, purchase two units using Cash, link the sale to an active room, and confirm only one sale and one matching ledger transaction are saved.
18. Purchase the Extra charge using GCash without a room link and confirm it is recorded once.
19. Change the product price, refresh, and confirm old sales and reports retain their original names, categories, quantities, and charged prices.
20. As Owner, select Store within Reports and verify Overall and By Staff views, all period/shift/payment filters, product totals, revenue charts, PDF, Excel, and print.
21. Deactivate a product and confirm it disappears from the purchase catalog but remains in historical Store Reports.

## Mobile Owner Checks

20. Repeat Owner dashboard and report navigation on a supported mobile phone in portrait and landscape.
21. Confirm the sidebar opens and closes without covering inaccessible controls and each report filter and revenue chart can be reached without page-level horizontal scrolling.
22. Confirm metric values, product names, activity entries, and export controls wrap cleanly and remain readable at narrow widths.
23. Open Store product management and confirm product forms, price inputs, image previews, and action buttons fit the viewport and have comfortable touch targets.

## Recovery and Network Safety

24. With an active stay visible, lock and unlock the tablet. Confirm the countdown and status recover from `expectedCheckoutAt`.
25. Switch to another Android application and return. Confirm authoritative rooms and bookings refresh.
26. Close and reopen the PWA, then refresh it. Confirm the session and current database state are correct.
27. Temporarily disconnect Wi-Fi and attempt a harmless test write, including a store purchase. Confirm the system clearly refuses it and does not report success.
28. Restore Wi-Fi and confirm rooms, active stays, bookings, products, and reports return to authoritative server data.
29. Confirm the failed offline action was not queued and no duplicate stay, extension, payment, store sale, booking conversion, or status change exists.
30. Log out, reopen the PWA, and confirm protected data requires another login.

## Warning Limitation

In-app warnings recover when the PWA becomes visible because status is recalculated from the database `expectedCheckoutAt`. Android may suspend timers and audio while the tablet is locked or another application is active. This release does not promise background alerts and does not require notification permission. Staff must keep operational monitoring procedures in place until a separately approved Web Push design is implemented.

## Sign-Off

Acceptance is complete only when critical workflows pass on the physical tablet, financial records reconcile with the performed actions, offline attempts create no duplicates, and any failures are recorded for correction before launch.
