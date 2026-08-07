# OHA Traveller's Inn Management System

This repository contains the Milestone 1 technical foundation for a future front-desk system for OHA Traveller's Inn. It currently proves that the React client can reach the Express API and that the API can reach MySQL through Prisma.

Room management, check-ins, stays, reservations, reports, and staff login are not part of this milestone.

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
```

Milestone 1 does not define motel business tables. Prisma is used to run a small connectivity query for the health endpoint.

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

## Quality Checks

Run the complete local verification suite:

```powershell
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
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
