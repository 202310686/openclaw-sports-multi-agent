param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$archive = Join-Path $root '.local/baseline-v01/source.zip'
$record = Get-Content (Join-Path $root '.local/baseline-v01/hash.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $archive).Hash -ne $record.Hash) { throw 'Baseline archive hash mismatch' }
if ($VerifyOnly) { Write-Host 'Baseline hash verified; no files modified'; exit 0 }
$h = $null
try { $h = Invoke-RestMethod 'http://127.0.0.1:18890/api/health' } catch {}
if ($h) { throw 'Stop the project server before source rollback' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $root ".local/pre-rollback-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($name in @('src','public','scripts','tests','package.json','README.md')) { Copy-Item -LiteralPath (Join-Path $root $name) -Destination $backup -Recurse }
Expand-Archive -LiteralPath $archive -DestinationPath $root -Force
Write-Host 'v0.1 tracked source restored. New files, task history, gateway configuration and runtime preserved.'
