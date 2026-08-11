param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$testDatabase = 'oha_travellers_inn_restore_test'
$containerPath = '/tmp/oha-travellers-inn-restore.sql'

Push-Location $projectRoot
try {
  $containerId = (docker compose ps -q mysql).Trim()
  if (-not $containerId) {
    throw 'The MySQL Docker container is not running.'
  }
  $mysqlUser = (docker compose exec -T mysql printenv MYSQL_USER).Trim()
  if ($mysqlUser -notmatch '^[A-Za-z0-9_]+$') {
    throw 'The container MYSQL_USER value is not safe to use in a test grant.'
  }

  $createSql = "DROP DATABASE IF EXISTS oha_travellers_inn_restore_test; CREATE DATABASE oha_travellers_inn_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON oha_travellers_inn_restore_test.* TO '$mysqlUser'@'%'; FLUSH PRIVILEGES;"
  $createSql | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot'
  if ($LASTEXITCODE -ne 0) { throw 'Creating the isolated restore database failed.' }

  docker cp $resolvedBackup "${containerId}:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw 'Copying the backup into Docker failed.' }

  docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot oha_travellers_inn_restore_test < /tmp/oha-travellers-inn-restore.sql'
  if ($LASTEXITCODE -ne 0) { throw 'Restoring the backup failed.' }

  $verificationSql = "SELECT CONCAT('Room=', COUNT(*)) FROM Room; SELECT CONCAT('StaffAccount=', COUNT(*)) FROM StaffAccount; SELECT CONCAT('Stay=', COUNT(*)) FROM Stay; SELECT CONCAT('FinancialTransaction=', COUNT(*)) FROM FinancialTransaction; SELECT CONCAT('Booking=', COUNT(*)) FROM Booking;"
  $counts = $verificationSql | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -N -uroot oha_travellers_inn_restore_test'
  if ($LASTEXITCODE -ne 0) { throw 'Restore verification queries failed.' }

  $storeTableSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'oha_travellers_inn_restore_test' AND table_name IN ('Product', 'StoreSale', 'StoreSaleItem');"
  $storeTableCount = ($storeTableSql | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -N -uroot').Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Store table detection failed.' }
  if ($storeTableCount -eq '3') {
    $storeSql = "SELECT CONCAT('Product=', COUNT(*)) FROM Product; SELECT CONCAT('StoreSale=', COUNT(*)) FROM StoreSale; SELECT CONCAT('StoreSaleItem=', COUNT(*)) FROM StoreSaleItem;"
    $storeCounts = $storeSql | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -N -uroot oha_travellers_inn_restore_test'
    if ($LASTEXITCODE -ne 0) { throw 'Store restore verification queries failed.' }
    $counts = @($counts) + @($storeCounts)
  }

  [pscustomobject]@{
    RestoredFrom = $resolvedBackup
    TestDatabase = $testDatabase
    Verification = ($counts -join '; ')
  }
}
finally {
  docker compose exec -T mysql rm -f $containerPath 2>$null | Out-Null
  Pop-Location
}
