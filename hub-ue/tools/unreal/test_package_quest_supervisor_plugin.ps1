[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$scriptPath = Join-Path $PSScriptRoot "package_quest_supervisor_plugin.ps1"
$sourceDescriptorPath = Join-Path $repoRoot.Path "unreal\Plugins\QuestSupervisor\QuestSupervisor.uplugin"
$expectedVersionName = (Get-Content -LiteralPath $sourceDescriptorPath -Raw | ConvertFrom-Json).VersionName
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("quest-supervisor-package-test-" + [System.Guid]::NewGuid().ToString("N"))
$distDir = Join-Path $tempRoot "dist"
$extractDir = Join-Path $tempRoot "extract"

try {
    New-Item -ItemType Directory -Path $distDir, $extractDir -Force | Out-Null

    & $scriptPath -OutputDir $distDir | Out-Host

    $zip = Get-ChildItem -LiteralPath $distDir -Filter "QuestSupervisor-*.zip" -File | Select-Object -First 1
    if (-not $zip) {
        throw "Package zip was not created in '$distDir'."
    }

    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $extractDir -Force
    $pluginRoot = Join-Path $extractDir "QuestSupervisor"

    foreach ($required in @("QuestSupervisor.uplugin", "Source", "Config")) {
        $path = Join-Path $pluginRoot $required
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Required package item missing: $required"
        }
    }

    foreach ($forbidden in @("Intermediate", "Binaries", "Saved")) {
        $path = Join-Path $pluginRoot $forbidden
        if (Test-Path -LiteralPath $path) {
            throw "Forbidden package item included: $forbidden"
        }
    }

    $descriptor = Get-Content -LiteralPath (Join-Path $pluginRoot "QuestSupervisor.uplugin") -Raw | ConvertFrom-Json
    if ($descriptor.VersionName -ne $expectedVersionName) {
        throw "Unexpected VersionName: $($descriptor.VersionName)"
    }

    Write-Host "Package smoke test passed: $($zip.Name)"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
