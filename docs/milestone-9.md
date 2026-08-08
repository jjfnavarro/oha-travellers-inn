# Milestone 9: PWA and Production Preparation

## Installable Application

Production builds include:

- `manifest.webmanifest`
- Standalone display mode
- OHA 192px and 512px icons
- Maskable 512px icon
- Android Chrome installation support and optional Apple compatibility metadata
- Neutral OHA theme and background colors
- A production-only service worker

The primary front-desk platform is an Android tablet running Google Chrome. Open the HTTPS production site in Chrome and choose **Install app** or **Add to Home screen**. Launching the Home Screen icon opens the system in standalone mode. Desktop, laptop, mobile, and optional iOS browser compatibility remain supported.

## Network Policy

The service worker caches the frontend shell, logo, icons, and static frontend assets. It does not intercept API requests or non-GET requests. Check-ins, booking changes, payments, extensions, checkout, staff changes, rates, and room-status changes require a working network connection and are never silently queued.

When offline, the interface reports the state and rejects transactional writes. After reconnect, Android tablet wake, PWA reopen, or return from another application, the app refreshes authoritative database data. Checkout state is recalculated from `expectedCheckoutAt` rather than an elapsed in-memory counter.

Audible warnings require the employee to enable sound after opening the PWA. Android may suspend browser audio while the tablet is locked or the PWA is in the background, so in-app audio is not a guaranteed background notification. Notifications and offline transaction synchronization are not part of Milestone 9.

## Deployment

Cloud hosting with managed MySQL is recommended first because it supports Owner mobile access and managed availability. A local motel server remains documented as an alternative. Both require HTTPS, private MySQL access, secure environment variables, and off-machine backups.

No public deployment or hosting account was created in this milestone.

## Backup and Restore

PowerShell scripts create Docker MySQL backups without embedding credentials and restore only to the fixed isolated test database. The completed local drill verified database row counts and successfully read the restored data through the application API.

See `deployment.md` and `backup-and-restore.md` for the complete procedures.
