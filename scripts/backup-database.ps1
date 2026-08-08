param(
  [string]$OutputDirectory = "$(Split-Path -Parent $PSScriptRoot)\backups"
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

Push-Location $projectRoot
try {
  $containerId = (docker compose ps -q mysql).Trim()
  if (-not $containerId) {
    throw 'The MySQL Docker container is not running.'
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $filename = "oha-travellers-inn-$timestamp.sql"
  $outputPath = Join-Path $resolvedOutput $filename
  $containerPath = '/tmp/oha-travellers-inn-backup.sql'

  docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --single-transaction --no-tablespaces --routines --triggers --default-character-set=utf8mb4 -u"$MYSQL_USER" "$MYSQL_DATABASE" > /tmp/oha-travellers-inn-backup.sql'
  if ($LASTEXITCODE -ne 0) { throw 'mysqldump failed.' }

  docker cp "${containerId}:$containerPath" $outputPath
  if ($LASTEXITCODE -ne 0) { throw 'Copying the backup from Docker failed.' }

  docker compose exec -T mysql rm -f $containerPath | Out-Null
  if ((Get-Item -LiteralPath $outputPath).Length -eq 0) {
    throw 'The backup file is empty.'
  }
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath

  [pscustomobject]@{
    Backup = $outputPath
    Bytes = (Get-Item -LiteralPath $outputPath).Length
    SHA256 = $hash.Hash
  }
}
finally {
  Pop-Location
}
