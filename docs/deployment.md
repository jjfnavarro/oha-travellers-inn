# Production Deployment

Do not expose the development servers or Docker MySQL port directly to the public internet. Production access must use HTTPS.

The primary client is an Android tablet with Google Chrome running the installed responsive PWA:

```text
Android tablet
      |
Chrome / installed PWA
      |
HTTPS
      |
React frontend
      |
Express API
      |
Prisma
      |
MySQL
```

The same web deployment supports desktop, laptop, and mobile browsers. Do not package it as a native Android application.

Product records store image paths or URLs only. The built-in upload endpoint writes validated JPEG, PNG, and WebP files to `PRODUCT_IMAGE_DIR`. In production, this directory must point to a persistent mounted disk. A managed object-storage adapter or reputable image CDN remains the preferred option when the final hosting provider is selected. Never use ephemeral application-server storage or MySQL binary columns for production uploads. If an image is unavailable, the client displays the bundled OHA fallback image.

## Recommended: Cloud Application and Managed MySQL

The recommended first production design is:

- Static React frontend behind HTTPS
- Node/Express backend behind HTTPS
- Managed MySQL database on a private connection
- One application domain, with `/api` routed to the backend when possible

This supports the Owner checking reports from a phone outside the motel, removes dependence on one motel computer remaining online, and lets the database provider manage availability and automated backups. Tradeoffs are a monthly cost, internet dependency, and the need to maintain hosting accounts.

Use one domain or same-site subdomains so secure cookie authentication remains predictable. Set CORS to the exact frontend HTTPS origin. Never use `*` with credentialed requests.

### Testing deployment on Railway

The repository includes a production `Dockerfile` and `railway.json`. The container serves the built React PWA and Express API from one HTTPS origin, which keeps session cookies reliable on mobile devices.

Create a Railway project with:

- One application service connected to this GitHub repository
- One private MySQL service
- One application volume mounted at `/data/product-images`
- Public networking enabled only for the application service
- Health check path `/api/health`

Set these application variables:

```text
NODE_ENV=production
DATABASE_URL=<private MySQL connection URL>
CLIENT_URL=https://<generated application domain>
PRODUCT_IMAGE_DIR=/data/product-images
BUSINESS_TIMEZONE=Asia/Manila
```

`VITE_API_URL` is intentionally omitted for this single-origin deployment; the production client uses `/api`. Railway runs committed Prisma migrations before starting the application. On the first deployment only, open a trusted application-service shell and run `npm run prisma:seed` followed by `npm run users:seed` with strong initial password variables. Do not repeat these seed commands automatically on every deployment because the room seed contains the original configured rates and the user seed resets passwords.

Railway provides an HTTPS domain automatically and supports private service networking and persistent volumes. Product images will be lost on redeploy if the application volume is omitted.

## Alternative: Local Motel Server

A dedicated always-on computer may run the built application and MySQL on the motel network. It needs:

- A UPS and automatic startup after power loss
- A fixed local network address
- HTTPS from a trusted local or public certificate setup
- Firewall rules that do not expose MySQL port 3306
- Off-machine automated backups
- Secure remote access if the Owner needs reports away from the motel

This avoids recurring cloud database costs but makes power, hardware, internet routing, security updates, and remote access the motel's responsibility. A normal employee workstation should not be the production server.

## Production Variables

Backend runtime variables:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=mysql://USER:PASSWORD@PRIVATE_HOST:3306/DATABASE
SHADOW_DATABASE_URL=mysql://MIGRATION_USER:PASSWORD@PRIVATE_HOST:3306/SHADOW_DATABASE
CLIENT_URL=https://your-app-domain.example
PRODUCT_IMAGE_DIR=/persistent-storage/oha-product-images
BUSINESS_TIMEZONE=Asia/Manila
```

Frontend build variable:

```text
VITE_API_URL=https://your-app-domain.example/api
```

The current authentication design uses random session tokens whose SHA-256 hashes are stored in MySQL. It does not use a signing secret. Production passwords, database URLs, and `.env` files must be stored in the hosting platform's secret manager and never committed.

If migrations run from a separate trusted deployment job, keep `SHADOW_DATABASE_URL` out of the normal backend runtime environment when the platform permits it. Prisma migration commands still require the migration configuration.

## Build and Start

From a trusted deployment environment:

```powershell
npm.cmd ci
npm.cmd run prisma:generate
Set-Location server
..\node_modules\.bin\prisma.cmd migrate deploy
Set-Location ..
npm.cmd run build
npm.cmd run start --workspace server
```

Serve `client\dist` as the static frontend. Do not run Vite's development server or `tsx watch` in production.

## HTTPS and Network Rules

- Redirect HTTP to HTTPS.
- Allow public access only to the HTTPS frontend/backend entry point.
- Keep MySQL private to the backend and administrative network.
- Preserve secure cookies through the reverse proxy.
- Forward the real client IP only from a trusted proxy.
- Set `CLIENT_URL` to one exact HTTPS origin.

## Release Checklist

1. Run formatting, linting, type checks, tests, and builds.
2. Create and verify a database backup.
3. Apply migrations before starting the new backend.
4. Verify health, login, room board, booking list, Store purchase, and Owner reports.
5. On the physical Android tablet, install from Chrome and test standalone portrait and landscape operation.
6. Verify an offline write is blocked.
7. Monitor server errors after release.

## Android Installation

1. Open the production HTTPS URL in Google Chrome on the front-desk tablet.
2. Use Chrome's **Install app** or **Add to Home screen** option.
3. Launch **OHA Inn** from the Android Home Screen.
4. Confirm that it opens without normal browser-tab controls in standalone mode.
5. Complete the device checks in `acceptance-testing.md` before live operation.

Service workers and installation are enabled only in production builds. Vite development mode is not the final PWA installation test. The production host must serve the manifest, service worker, and PNG icons with valid content types over HTTPS.

Deployment is intentionally not automated by Milestone 9. Hosting credentials and the final provider require separate Owner approval.
