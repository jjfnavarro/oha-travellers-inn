# OHA Traveller's Inn Management System

This repository contains the technical foundation and front-desk workflows through staff authentication, audit history, room inventory, active stays, bookings, reports, and automatic shifts.

Refunds, discounts, adjustments, expenses, other income, and overdue charges are not implemented yet. Staff login and initial Owner/Front Desk authorization were completed in Milestone 5. Milestone 6 adds Cash/GCash payment records and paid stay extensions.

## Development Roadmap

The completed work is documented in `docs/milestone-1.md` through `docs/milestone-5.md`.

- Milestone 6 establishes permanent staff attribution and an immutable financial transaction ledger. The current scope supports Owner and Front Desk accounts, Cash/GCash room charges, and paid stay extensions; the `ADMIN` role remains deferred.
- Milestone 7 adds Owner-only overall and per-staff reporting, period and shift filters, financial and operational breakdowns, activity history, and matching PDF and Excel exports.
- Milestone 8 adds dated bookings, optional room assignment, overlap protection, status management, and atomic booking arrival conversion into a paid stay.
- Milestone 8.5 adds checkout-to-cleaning, optional vehicle categories, concurrent check-in verification, reconnect recovery, offline write protection, login throttling, safe production errors, and atomic rate auditing.
- Milestone 9 adds installable PWA metadata and icons, a network-required service worker, deployment and HTTPS guidance, and tested MySQL backup/restore scripts.
- Milestone 10 acceptance is in progress. The isolated database-backed workflow, permissions, financial reconciliation, report exports, and restore reset have passed; physical Android tablet and full Day/Night operating-day sign-off remain.

Milestone 7 reports calculate money from immutable financial transactions and enforce Owner access on the backend. Booking actions appear in audit and Owner activity history, but bookings create no revenue until converted into a stay. Discounts, adjustments, refunds, vehicle subtypes, and the `ADMIN` role remain deferred.

## Prerequisites

Install these tools before starting:

- [Node.js](https://nodejs.org/) 20 or newer (the current LTS release is recommended)
- npm, which is included with Node.js
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose
- A terminal such as Windows PowerShell

Check that they are available:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## First-Time Setup

Run all commands from the project root:

```powershell
cd C:\Users\Justin\oha-travellers-inn
npm install
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

If PowerShell reports that `npm.ps1` cannot run because scripts are disabled, use `npm.cmd` in place of `npm` for every npm command. You do not need to change your execution policy.

The example credentials are only for local development. Never use them in production or commit a real `.env` file.

## Start MySQL

Make sure Docker Desktop is running, then start MySQL in the background:

```powershell
docker compose up -d
docker compose ps
```

The container can take several seconds to become healthy on its first start. View its logs with:

```powershell
docker compose logs mysql
```

## Set Up Prisma

Generate Prisma Client:

```powershell
npm run prisma:generate
```

Create or apply the development migration:

```powershell
npm run prisma:migrate
npm run prisma:seed
```

The seed command adds the 28 rooms and room rates provided by the owner. It is safe to run again because it updates the known inventory instead of duplicating it.

To create the three staff accounts, set private passwords of at least eight characters in `server/.env`:

```text
OWNER_INITIAL_PASSWORD=your-private-owner-password
DAY_STAFF_INITIAL_PASSWORD=your-private-day-password
NIGHT_STAFF_INITIAL_PASSWORD=your-private-night-password
```

Then run:

```powershell
npm.cmd run users:seed
```

This creates `Zack`, `Dodong`, and `Along`. Clear the three password values from `server/.env` afterward; the stored database passwords are securely hashed.

Prisma Migrate uses the separate `oha_travellers_inn_shadow` database configured for local development. The Docker initialization script creates it automatically on a new MySQL volume.

## Start The Applications

Start the client and server together:

```powershell
npm run dev
```

The applications are available at:

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:4000>
- Health endpoint: <http://localhost:4000/api/health>

Keep the terminal running while using the applications. Press `Ctrl+C` to stop both development servers.

## Test The Health Endpoint

With MySQL and the development servers running, open another PowerShell window and run:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

A successful response contains:

```text
status    : ok
database  : connected
timestamp : 2026-01-01T00:00:00.000Z
```

Open <http://localhost:5173>. The page should display:

```text
OHA Traveller's Inn
System Connected
```

The Rooms view displays all 28 configured rooms and their live occupancy. Employees can check guests in, check them out early, and monitor countdowns, five-minute warnings, and overdue stays. Select **Enable sound** once per browser session to permit audible warnings. The Rates view displays and edits offered stay durations.

Checkout changes the room to **Cleaning**. After cleaning, staff must change its operational status to **Available** before another check-in. Cleaning, Maintenance, and Out-of-service rooms reject check-in on the backend.

Active room data refreshes every 30 seconds, after browser reconnection, and when the app becomes visible after tablet sleep or application switching. Transactional writes are blocked while the browser reports that it is offline, and unreachable-server failures are reported without pretending a write succeeded.

The primary front-desk device is an Android tablet running Google Chrome. Open the production HTTPS URL in Chrome and choose **Install app** or **Add to Home screen**. The installed PWA launches in standalone mode and still requires a network connection for check-ins, payments, booking changes, and other writes. Desktop, laptop, and mobile browsers remain supported. See `docs/deployment.md`, `docs/acceptance-testing.md`, and `docs/backup-and-restore.md` before live use.

The Bookings view lets Owner and Front Desk accounts select a date, create or edit a booking, assign a room optionally, confirm, cancel, mark no-show, and convert an arrival into a paid stay. Room overlap validation is enforced by the backend. See `docs/booking-workflow.md` for the operating rules.

Stay History provides date, room, room-type, status, and arrival filters. Reports use the motel's 8:00 AM operational-day boundary and support browser printing, PDF downloads, and Excel downloads. Day and Night shift records are assigned automatically using `Asia/Manila`.

## Quality Checks

Run the complete local verification suite:

```powershell
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

## Database Backup

Create a local Docker MySQL backup:

```powershell
.\scripts\backup-database.ps1
```

Restore and verify it in the isolated test database:

```powershell
.\scripts\restore-backup-to-test.ps1 -BackupPath .\backups\oha-travellers-inn-YYYYMMDD-HHMMSS.sql
```

## Stop MySQL

Stop the container without deleting its saved database data:

```powershell
docker compose down
```

To delete the local database volume and start from an empty database, use `docker compose down --volumes`. This permanently removes local database data.

## Environment Variables

Backend settings live in `server/.env`. The server validates them at startup and exits with a clear error if a required value is invalid or missing.

Frontend settings live in `client/.env`. Only variables beginning with `VITE_` are available to browser code. Never put passwords or `DATABASE_URL` in the client environment.

After changing an environment file, restart `npm run dev`.

## Troubleshooting

### Docker is not recognized

Install and start Docker Desktop, then open a new PowerShell window. Confirm it works with `docker compose version`.

### Port 3306 is already in use

Another MySQL installation may already be running. Stop that service before starting Docker MySQL. Check the container error with `docker compose logs mysql`.

### Port 4000 or 5173 is already in use

Stop the process already using the port. In PowerShell, inspect a port with:

```powershell
Get-NetTCPConnection -LocalPort 4000,5173 -ErrorAction SilentlyContinue
```

### The API reports that the database is unavailable

Check that the MySQL container is healthy:

```powershell
docker compose ps
docker compose logs mysql
```

Also confirm that `server/.env` matches the database name, user, password, host, and port in `docker-compose.yml`.

### The frontend reports that the system is unavailable

First test <http://localhost:4000/api/health>. If it fails, inspect the server terminal. If it succeeds, confirm `client/.env` contains `VITE_API_URL=http://localhost:4000/api`, then restart the development servers.

### Prisma Client is missing or outdated

Regenerate it after installing packages or changing `schema.prisma`:

```powershell
npm run prisma:generate
```
