# Backup and Restore

A Docker volume protects data when containers restart, but it is not a backup. A backup must also exist outside the computer running MySQL.

## Create a Local Backup

Start Docker Desktop and run this from the project root:

```powershell
.\scripts\backup-database.ps1
```

The script uses the credentials already inside the MySQL container. It does not place a password in the command or backup documentation. It saves a timestamped SQL file under `backups\` and prints its size and SHA-256 hash.

`backups\` is ignored by Git. Never commit database backups because they may contain guest and staff information.

## Storage and Retention

Keep:

- 14 daily backups
- 8 weekly backups
- 12 monthly backups

Maintain at least one encrypted copy on a separate device or reputable cloud storage account. Restrict access to the Owner and authorized developer. Do not store the only backup on the motel server or its internal drive.

For live use, schedule `backup-database.ps1` daily with Windows Task Scheduler. Check the task result and backup file size regularly; a scheduled command is not successful merely because it ran.

## Restore to an Isolated Test Database

Never test restoration over the live database. Run:

```powershell
.\scripts\restore-backup-to-test.ps1 -BackupPath .\backups\oha-travellers-inn-YYYYMMDD-HHMMSS.sql
```

The script recreates only the fixed `oha_travellers_inn_restore_test` database and prints row counts for rooms, staff, stays, financial transactions, and bookings. It does not change `oha_travellers_inn`.

Verify:

1. The script reports no error.
2. Room count is expected, normally 28.
3. Staff, stays, bookings, and financial counts are plausible.
4. Point a temporary test `DATABASE_URL` at the restore database and open the app.
5. Confirm rooms, active stays, history, bookings, and Owner totals.

Delete the test database only after verification is complete. Never change the normal application `DATABASE_URL` to the restore database without recording that change.

## Managed Production MySQL

Enable automated backups and point-in-time recovery from the database provider when available. Also create periodic independent SQL exports. Provider snapshots must have documented retention and must be restored into a separate test database at least quarterly.

## Emergency Recovery

1. Stop check-ins and financial writes.
2. Record the failure time and preserve the affected database and logs.
3. Select the newest verified backup from before the failure.
4. Restore it into an isolated database first.
5. Verify row counts and important Owner totals.
6. Change the production connection only after verification.
7. Record any transactions that occurred after the backup and re-enter them through normal workflows when approved by the Owner.

Database restoration is not considered tested until the application can read the restored records successfully.

## Verified Local Drill

On August 8, 2026, the backup script created a SQL export and the restore script loaded it into `oha_travellers_inn_restore_test`. Verification returned 28 rooms, 3 staff accounts, 16 stays, 17 financial transactions, and 2 bookings. A temporary API connected with the normal application database user, authenticated the Owner account, and read the restored rooms and bookings successfully.
