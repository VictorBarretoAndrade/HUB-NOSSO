param(
    [int]$HubPort = 8788,
    [int]$DashboardPort = 5173,
    [string]$HostAddress = "127.0.0.1",
    [switch]$NoClients,
    [switch]$SkipLogger,
    [switch]$SkipHrv
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RuntimeDir = Join-Path $RepoRoot "data\runtime"
$PidFile = Join-Path $RuntimeDir "demo-processes.json"
$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$SimExe = Join-Path $RepoRoot ".venv\Scripts\biofeedback-sim.exe"

function Test-PortFree {
    param(
        [int]$Port,
        [string]$Name
    )

    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        $owners = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
        $ownerList = ($owners -join ", ")
        throw "$Name port $Port is already in use by PID(s): $ownerList. Stop that process or choose another port."
    }
}

function Start-DemoProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [hashtable]$Environment = @{}
    )

    $stdout = Join-Path $RuntimeDir "$Name.out.log"
    $stderr = Join-Path $RuntimeDir "$Name.err.log"
    $envBackup = @{}

    foreach ($key in $Environment.Keys) {
        $envBackup[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
    }

    try {
        $process = Start-Process `
            -FilePath $FilePath `
            -ArgumentList $ArgumentList `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -PassThru
    }
    finally {
        foreach ($key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $envBackup[$key], "Process")
        }
    }

    [pscustomobject]@{
        Name = $Name
        Pid = $process.Id
        LogOut = $stdout
        LogErr = $stderr
        StartedAt = (Get-Date).ToString("o")
    }
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [string]$Name
    )

    $deadline = (Get-Date).AddSeconds(20)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    throw "$Name did not become ready at $Url. Check logs in $RuntimeDir."
}

function Add-PortOwnerProcesses {
    param(
        [object[]]$Processes,
        [int[]]$Ports
    )

    $knownPids = @{}
    foreach ($process in $Processes) {
        $knownPids[[int]$process.Pid] = $true
    }

    $allProcesses = @($Processes)
    foreach ($port in $Ports) {
        $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($listener in @($listeners)) {
            $ownerPid = [int]$listener.OwningProcess
            if (-not $knownPids.ContainsKey($ownerPid)) {
                $knownPids[$ownerPid] = $true
                $allProcesses += [pscustomobject]@{
                    Name = "port-$port-owner"
                    Pid = $ownerPid
                    LogOut = $null
                    LogErr = $null
                    StartedAt = (Get-Date).ToString("o")
                }
            }
        }
    }

    $allProcesses
}

if (-not (Test-Path $PythonExe)) {
    throw "Missing Python venv at $PythonExe. Create it and install the hub with: python -m venv .venv; .\.venv\Scripts\python -m pip install -e apps\hub"
}

if (-not $NoClients -and -not (Test-Path $SimExe)) {
    throw "Missing biofeedback-sim.exe at $SimExe. Install the hub with: .\.venv\Scripts\python -m pip install -e apps\hub"
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Test-PortFree -Port $HubPort -Name "Hub"
Test-PortFree -Port $DashboardPort -Name "Dashboard"

$processes = @()
$processes += Start-DemoProcess `
    -Name "hub-demo" `
    -FilePath $PythonExe `
    -ArgumentList @("-m", "biofeedback_hub.main") `
    -Environment @{ BIOFEEDBACK_HUB_PORT = $HubPort; BIOFEEDBACK_HUB_HOST = "0.0.0.0" }

$processes += Start-DemoProcess `
    -Name "dashboard-demo" `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "-w", "@quest-supervisor/dashboard", "--", "--host", $HostAddress, "--port", "$DashboardPort")

$hubWsUrl = "ws://$HostAddress`:$HubPort/ws"
if (-not $NoClients) {
    $processes += Start-DemoProcess -Name "unreal-sim-demo" -FilePath $SimExe -ArgumentList @("--mode", "unreal", "--url", $hubWsUrl)

    if (-not $SkipHrv) {
        $processes += Start-DemoProcess -Name "hrv-sim-demo" -FilePath $SimExe -ArgumentList @("--mode", "hrv", "--url", $hubWsUrl)
    }

    if (-not $SkipLogger) {
        $processes += Start-DemoProcess -Name "logger-sim-demo" -FilePath $SimExe -ArgumentList @("--mode", "logger", "--url", $hubWsUrl)
    }
}

$hubHealthUrl = "http://$HostAddress`:$HubPort/health"
$dashboardUrl = "http://$HostAddress`:$DashboardPort/"
Wait-HttpOk -Url $hubHealthUrl -Name "Hub"
Wait-HttpOk -Url $dashboardUrl -Name "Dashboard"

$processes = Add-PortOwnerProcesses -Processes $processes -Ports @($HubPort, $DashboardPort)
$processes | ConvertTo-Json -Depth 4 | Set-Content -Path $PidFile -Encoding utf8

Write-Host ""
Write-Host "Biofeedback Hub demo is running."
Write-Host "Dashboard URL: $dashboardUrl"
Write-Host "Hub health: $hubHealthUrl"
Write-Host "Diagnostics endpoint = http://$HostAddress`:$HubPort"
Write-Host "Manual Unreal simulator: .\.venv\Scripts\biofeedback-sim.exe --mode unreal --url $hubWsUrl"
Write-Host "Logs: $RuntimeDir"
Write-Host "PID file: $PidFile"
Write-Host "Stop with: npm run dev:demo:stop"
