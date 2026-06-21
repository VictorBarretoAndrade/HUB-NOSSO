[CmdletBinding(SupportsShouldProcess = $true)]
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

$project = Resolve-UnrealProject -Path $ProjectPath
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$sourcePlugin = Join-Path $repoRoot.Path "unreal\Plugins\QuestSupervisor"
$targetPlugin = Join-Path $project.ProjectDir "Plugins\QuestSupervisor"

if (-not (Test-Path -LiteralPath (Join-Path $sourcePlugin "QuestSupervisor.uplugin"))) {
    throw "Canonical plugin was not found at '$sourcePlugin'."
}

Write-Host "QuestSupervisor plugin installer"
Write-Host "Project: $($project.UProject)"
Write-Host "Source:  $sourcePlugin"
Write-Host "Target:  $targetPlugin"

if ($PSCmdlet.ShouldProcess($targetPlugin, "Install or update QuestSupervisor plugin")) {
    New-Item -ItemType Directory -Path $targetPlugin -Force | Out-Null

    $targetSource = Join-Path $targetPlugin "Source"
    $targetConfig = Join-Path $targetPlugin "Config"
    if (Test-Path -LiteralPath $targetSource) {
        Remove-Item -LiteralPath $targetSource -Recurse -Force
    }
    if (Test-Path -LiteralPath $targetConfig) {
        Remove-Item -LiteralPath $targetConfig -Recurse -Force
    }

    Copy-Item -LiteralPath (Join-Path $sourcePlugin "Source") -Destination $targetPlugin -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $sourcePlugin "Config") -Destination $targetPlugin -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $sourcePlugin "QuestSupervisor.uplugin") -Destination (Join-Path $targetPlugin "QuestSupervisor.uplugin") -Force
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Open the Unreal project and rebuild if prompted."
Write-Host "2. Configure Edit > Project Settings > Plugins > Quest Supervisor."
Write-Host "3. Add QuestSupervisorCommandBridgeActor to the map or use Quest Supervisor Component in Blueprint."
Write-Host "4. Run tools\unreal\check_quest_supervisor_project.ps1 -ProjectPath `"$($project.ProjectDir)`"."
