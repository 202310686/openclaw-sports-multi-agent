param([ValidateSet('start','stop','status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pidFile = Join-Path $root '.local/server.pid'
$runtime = Join-Path $HOME '.openclaw/runtime/node-v26.10.0/node.exe'
if (-not (Test-Path -LiteralPath $runtime)) { $runtime = (Get-Command node -ErrorAction Stop).Source }
$owned = $null
if (Test-Path -LiteralPath $pidFile) {
  $saved = Get-Content -LiteralPath $pidFile -Raw
  if ($saved.Trim() -match '^\d+$') {
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$($saved.Trim())"
    $entry = Join-Path $root 'src/server.mjs'
    if ($candidate -and $candidate.CommandLine.Contains($entry)) { $owned = $candidate }
  }
}
if ($Action -eq 'status') {
  if ($owned) { Write-Host "Project server PID $($owned.ProcessId)" } else { Write-Host 'No verified managed project process' }
  try { Invoke-RestMethod 'http://127.0.0.1:18890/api/health' | ConvertTo-Json } catch { Write-Host 'Project health endpoint offline' }
  exit 0
}
if ($Action -eq 'stop') {
  if ($owned) {
    $health = Invoke-RestMethod 'http://127.0.0.1:18890/api/health'
    if ($health.pid -ne $owned.ProcessId -or $health.service -ne 'sports-prototype') { throw 'Process identity check failed' }
    if ($health.busy) { throw 'Cancel or finish the active task in the browser before stopping' }
    Stop-Process -Id $owned.ProcessId
    Write-Host 'Project stopped. Shared OpenClaw gateway and files preserved.'
  } else { Write-Host 'No verified project process to stop' }
  exit 0
}
try {
  $health = Invoke-RestMethod 'http://127.0.0.1:18890/api/health'
  if ($health.service -eq 'sports-prototype') { Write-Host 'Already running: http://127.0.0.1:18890/'; exit 0 }
  throw 'Port is occupied by another service'
} catch {
  if ($_.Exception.Message -eq 'Port is occupied by another service') { throw }
}
New-Item -ItemType Directory -Force (Join-Path $root '.local') | Out-Null
$entry = Join-Path $root 'src/server.mjs'
$p = Start-Process -FilePath $runtime -ArgumentList ('"' + $entry + '"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.local/server.stdout.log') -RedirectStandardError (Join-Path $root '.local/server.stderr.log') -PassThru
$p.Id | Set-Content -LiteralPath $pidFile
for ($i=0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try { $h = Invoke-RestMethod 'http://127.0.0.1:18890/api/health'; if ($h.pid -eq $p.Id) { Write-Host 'Started: http://127.0.0.1:18890/'; exit 0 } } catch {}
  if ($p.HasExited) { throw 'Server exited; inspect .local/server.stderr.log' }
}
throw 'Startup timed out; inspect local logs before retrying'
