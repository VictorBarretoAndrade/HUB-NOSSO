[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

function Resolve-UnrealProject {
    param([string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $item = Get-Item -LiteralPath $resolved.Path

    if (-not $item.PSIsContainer) {
        if ($item.Extension -ne ".uproject") {
            throw "ProjectPath must point to an Unreal project directory or .uproject file."
        }
        return @{
            ProjectDir = $item.Directory.FullName
            UProject = $item.FullName
        }
    }

    $uprojects = @(Get-ChildItem -LiteralPath $item.FullName -Filter *.uproject -File)
    if ($uprojects.Count -eq 0) {
        throw "No .uproject file found in '$($item.FullName)'."
    }
    if ($uprojects.Count -gt 1) {
        throw "Multiple .uproject files found in '$($item.FullName)'. Pass the exact .uproject path."
    }

    return @{
        ProjectDir = $item.FullName
        UProject = $uprojects[0].FullName
    }
}

function Read-IniValue {
    param(
        [string]$Content,
        [string]$Key
    )

    $match = [regex]::Match($Content, "(?m)^\s*$([regex]::Escape($Key))\s*=\s*(.*?)\s*$")
    if ($match.Success) {
        return $match.Groups[1].Value
    }
    return $null
}

function Format-OptionalValue {
    param(
        [AllowNull()]
        [string]$Value,
        [string]$Fallback
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Fallback
    }
    return $Value
}

$project = Resolve-UnrealProject -Path $ProjectPath
$pluginDir = Join-Path $project.ProjectDir "Plugins\QuestSupervisor"
$pluginFile = Join-Path $pluginDir "QuestSupervisor.uplugin"
$defaultGame = Join-Path $project.ProjectDir "Config\DefaultGame.ini"

Write-Host "QuestSupervisor project check"
Write-Host "Project: $($project.UProject)"
Write-Host ""

if (Test-Path -LiteralPath $pluginFile) {
    Write-Host "[OK] Plugin installed: $pluginDir"
} else {
    Write-Host "[WARN] Plugin not found at: $pluginDir"
    Write-Host "       Run tools\unreal\install_quest_supervisor_plugin.ps1 first."
}

if (-not (Test-Path -LiteralPath $defaultGame)) {
    Write-Host "[WARN] Config\DefaultGame.ini not found."
    exit 0
}

$content = Get-Content -LiteralPath $defaultGame -Raw
if ($content -notmatch "\[/Script/QuestSupervisor\.QuestSupervisorSettings\]") {
    Write-Host "[WARN] QuestSupervisorSettings section not found in Config\DefaultGame.ini."
    Write-Host "       Configure Edit > Project Settings > Plugins > Quest Supervisor."
    exit 0
}

Write-Host "[OK] QuestSupervisorSettings section found."

$endpoint = Read-IniValue -Content $content -Key "SupervisorEndpoint"
$autoConnect = Read-IniValue -Content $content -Key "bAutoConnectOnStartup"
$autoAck = Read-IniValue -Content $content -Key "bAutoAckCommands"

Write-Host "SupervisorEndpoint: $(Format-OptionalValue -Value $endpoint -Fallback '<empty>')"
Write-Host "AutoConnectOnStartup: $(Format-OptionalValue -Value $autoConnect -Fallback '<missing>')"
Write-Host "AutoAckCommands: $(Format-OptionalValue -Value $autoAck -Fallback '<missing>')"

if ($endpoint -and $endpoint.StartsWith("ws://")) {
    Write-Host "[WARN] Use host:port without ws://. Example: 127.0.0.1:8787"
}
if ($autoConnect -ne "True") {
    Write-Host "[WARN] bAutoConnectOnStartup should be True for drop-in startup."
}

Write-Host ""
Write-Host "Recommended endpoints:"
Write-Host "- Editor on same PC: 127.0.0.1:8787"
Write-Host "- Meta Quest on LAN: 192.168.x.x:8787"
Write-Host ""
Write-Host "Next validation commands:"
Write-Host ".\.venv\Scripts\biofeedback-doctor"
Write-Host ".\.venv\Scripts\biofeedback-command --action pause-session --arg reason=doctor-test"
