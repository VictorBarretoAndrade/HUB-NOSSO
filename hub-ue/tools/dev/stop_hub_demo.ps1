$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RuntimeDir = Join-Path $RepoRoot "data\runtime"
$PidFile = Join-Path $RuntimeDir "demo-processes.json"

if (-not (Test-Path $PidFile)) {
    Write-Host "No demo PID file found at $PidFile."
    return
}

$processes = Get-Content $PidFile -Raw | ConvertFrom-Json
if ($null -eq $processes) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Host "Removed empty demo PID file."
    return
}

foreach ($process in @($processes)) {
    $running = Get-Process -Id $process.Pid -ErrorAction SilentlyContinue
    if ($null -eq $running) {
        Write-Host "Already stopped: $($process.Name) PID $($process.Pid)"
        continue
    }

    Write-Host "Stopping $($process.Name) PID $($process.Pid)"
    Stop-Process -Id $process.Pid -Force
}

Remove-Item -LiteralPath $PidFile -Force
Write-Host "Stopped registered demo processes. Logs remain in $RuntimeDir."
