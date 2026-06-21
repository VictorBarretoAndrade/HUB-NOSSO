[CmdletBinding()]
param(
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$sourcePlugin = Join-Path $repoRoot.Path "unreal\Plugins\QuestSupervisor"
$descriptorPath = Join-Path $sourcePlugin "QuestSupervisor.uplugin"

if (-not (Test-Path -LiteralPath $descriptorPath)) {
    throw "QuestSupervisor.uplugin was not found at '$descriptorPath'."
}

$descriptor = Get-Content -LiteralPath $descriptorPath -Raw | ConvertFrom-Json
$versionName = $descriptor.VersionName
if ([string]::IsNullOrWhiteSpace($versionName)) {
    throw "QuestSupervisor.uplugin does not define VersionName."
}

$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $repoRoot.Path $OutputDir
}

$packageName = "QuestSupervisor-$versionName"
$packageRoot = Join-Path $resolvedOutputDir $packageName
$pluginRoot = Join-Path $packageRoot "QuestSupervisor"
$zipPath = Join-Path $resolvedOutputDir "$packageName.zip"

Write-Host "QuestSupervisor plugin packager"
Write-Host "Source:  $sourcePlugin"
Write-Host "Version: $versionName"
Write-Host "Output:  $resolvedOutputDir"

if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $pluginRoot -Force | Out-Null

Copy-Item -LiteralPath $descriptorPath -Destination (Join-Path $pluginRoot "QuestSupervisor.uplugin") -Force
Copy-Item -LiteralPath (Join-Path $sourcePlugin "Source") -Destination $pluginRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourcePlugin "Config") -Destination $pluginRoot -Recurse -Force

foreach ($forbidden in @("Intermediate", "Binaries", "Saved")) {
    $forbiddenPath = Join-Path $pluginRoot $forbidden
    if (Test-Path -LiteralPath $forbiddenPath) {
        Remove-Item -LiteralPath $forbiddenPath -Recurse -Force
    }
}

Compress-Archive -LiteralPath $pluginRoot -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Package created:"
Write-Host "- Folder: $packageRoot"
Write-Host "- Zip:    $zipPath"
Write-Host ""
Write-Host "Consumer install path:"
Write-Host "<ProjetoUnreal>\Plugins\QuestSupervisor"
