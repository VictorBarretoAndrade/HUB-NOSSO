[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$TestPinnedDownload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")).Path
}

$Installer = Join-Path $PSScriptRoot "install_quest_supervisor.ps1"
$Checker = Join-Path $RepoRoot "tools\unreal\check_quest_supervisor_project.ps1"
$TestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("quest-supervisor-skill-tests-" + [guid]::NewGuid().ToString("N"))
$script:Passed = 0

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Equal {
    param(
        [AllowNull()]$Actual,
        [AllowNull()]$Expected,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if ($Actual -ne $Expected) {
        throw "Assertion failed: $Message. Expected '$Expected', got '$Actual'."
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Message
    )
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "Assertion failed: $Message. Unexpected error: $($_.Exception.Message)"
        }
        return
    }
    throw "Assertion failed: $Message. No error was raised."
}

function Complete-Test {
    param([Parameter(Mandatory = $true)][string]$Name)
    $script:Passed++
    Write-Host "[PASS] $Name"
}

function New-TestProject {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$EngineAssociation = "5.7",
        [string]$DefaultGameContent = "",
        [string]$DefaultEngineContent = ""
    )

    $projectDir = Join-Path $TestRoot $Name
    New-Item -ItemType Directory -Path (Join-Path $projectDir "Config") -Force | Out-Null
    $uproject = Join-Path $projectDir "$Name.uproject"
    $projectJson = [ordered]@{
        FileVersion = 3
        EngineAssociation = $EngineAssociation
        Category = ""
        Description = "QuestSupervisor skill test"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText($uproject, $projectJson, [System.Text.UTF8Encoding]::new($false))
    if (-not [string]::IsNullOrEmpty($DefaultGameContent)) {
        [System.IO.File]::WriteAllText((Join-Path $projectDir "Config\DefaultGame.ini"), $DefaultGameContent, [System.Text.UTF8Encoding]::new($false))
    }
    if (-not [string]::IsNullOrEmpty($DefaultEngineContent)) {
        [System.IO.File]::WriteAllText((Join-Path $projectDir "Config\DefaultEngine.ini"), $DefaultEngineContent, [System.Text.UTF8Encoding]::new($false))
    }
    return [pscustomobject]@{
        Dir = $projectDir
        UProject = $uproject
    }
}

function Read-ConfigValue {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $match = [regex]::Match($Content, "(?m)^\s*$([regex]::Escape($Key))\s*=\s*(.*?)\s*$")
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups[1].Value
}

try {
    New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null

    Assert-Throws -Action {
        & $Installer -ProjectPath (Join-Path $TestRoot "missing") -SourcePath $RepoRoot -WhatIf
    } -Pattern ".+" -Message "Nonexistent project must be rejected"
    Complete-Test "nonexistent project"

    $emptyDir = Join-Path $TestRoot "empty"
    New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
    Assert-Throws -Action {
        & $Installer -ProjectPath $emptyDir -SourcePath $RepoRoot -WhatIf
    } -Pattern "No .uproject" -Message "Directory without project must be rejected"
    Complete-Test "zero uproject files"

    $multipleDir = Join-Path $TestRoot "multiple"
    New-Item -ItemType Directory -Path $multipleDir -Force | Out-Null
    foreach ($name in @("One", "Two")) {
        [System.IO.File]::WriteAllText((Join-Path $multipleDir "$name.uproject"), '{"FileVersion":3,"EngineAssociation":"5.7"}', [System.Text.UTF8Encoding]::new($false))
    }
    Assert-Throws -Action {
        & $Installer -ProjectPath $multipleDir -SourcePath $RepoRoot -WhatIf
    } -Pattern "Multiple .uproject" -Message "Ambiguous project directory must be rejected"
    Complete-Test "multiple uproject files"

    $untested = New-TestProject -Name "UntestedEngine" -EngineAssociation "5.6"
    Assert-Throws -Action {
        & $Installer -ProjectPath $untested.UProject -SourcePath $RepoRoot -WhatIf
    } -Pattern "not the validated version 5.7" -Message "Untested Unreal version must require approval"
    & $Installer -ProjectPath $untested.UProject -SourcePath $RepoRoot -AllowUntestedEngineVersion -WhatIf
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $untested.Dir "Plugins\QuestSupervisor"))) -Message "Approved preview must remain read-only"
    Complete-Test "Unreal version guard"

    $endpointProject = New-TestProject -Name "EndpointValidation"
    foreach ($invalidEndpoint in @("ws://127.0.0.1:8787/ws", "127.0.0.1", "localhost:99999")) {
        Assert-Throws -Action {
            & $Installer -ProjectPath $endpointProject.UProject -SourcePath $RepoRoot -Endpoint $invalidEndpoint -WhatIf
        } -Pattern "Endpoint|port" -Message "Invalid endpoint '$invalidEndpoint' must be rejected"
    }
    foreach ($loopback in @("127.0.0.1:8787", "127.0.0.2:8787", "localhost:8787", "[::1]:8787", "[::]:8787", "224.0.0.1:8787", "255.255.255.255:8787")) {
        Assert-Throws -Action {
            & $Installer -ProjectPath $endpointProject.UProject -SourcePath $RepoRoot -Target Quest -Endpoint $loopback -WhatIf
        } -Pattern "Quest requires" -Message "Quest loopback '$loopback' must be rejected"
    }
    Assert-Throws -Action {
        & $Installer -ProjectPath $endpointProject.UProject -SourcePath $RepoRoot -Target Quest -Endpoint "bad_host:8787" -WhatIf
    } -Pattern "not a valid IP address or hostname" -Message "Invalid Quest hostname must be rejected"
    Assert-Throws -Action {
        & $Installer -ProjectPath $endpointProject.UProject -SourcePath $RepoRoot -Target Quest -WhatIf
    } -Pattern "Endpoint is required" -Message "Quest must require an explicit endpoint"
    Assert-Throws -Action {
        & $Installer -ProjectPath $endpointProject.UProject -SourcePath $RepoRoot -AppId "bad`nvalue" -WhatIf
    } -Pattern "AppId may contain" -Message "AppId must not allow INI injection"
    Complete-Test "endpoint validation"

    Assert-Throws -Action {
        & $Installer -ProjectPath $endpointProject.UProject
    } -Pattern "SourcePath was not provided" -Message "A real run must require a local source or download authorization"
    & $Installer -ProjectPath $endpointProject.UProject -WhatIf
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $endpointProject.Dir "Plugins\QuestSupervisor"))) -Message "Pinned download preview must not download or install files"
    $incompleteSource = Join-Path $TestRoot "incomplete-source"
    New-Item -ItemType Directory -Path $incompleteSource -Force | Out-Null
    Assert-Throws -Action {
        & $Installer -ProjectPath $endpointProject.UProject -SourcePath $incompleteSource -WhatIf
    } -Pattern "source is incomplete" -Message "Incomplete plugin source must be rejected"
    Complete-Test "source authorization and completeness"

    $duplicateSections = New-TestProject -Name "DuplicateSections" -DefaultGameContent "[/Script/QuestSupervisor.QuestSupervisorSettings]`nSupervisorEndpoint=127.0.0.1:8787`n`n[/Script/QuestSupervisor.QuestSupervisorSettings]`nSupervisorEndpoint=10.0.0.1:8787`n"
    Assert-Throws -Action {
        & $Installer -ProjectPath $duplicateSections.UProject -SourcePath $RepoRoot -WhatIf
    } -Pattern "more than one QuestSupervisorSettings section" -Message "Duplicate settings sections must be rejected before changes"
    Complete-Test "duplicate settings section guard"

    $junctionProject = New-TestProject -Name "JunctionGuard"
    $externalPluginTarget = Join-Path $TestRoot "junction-external-target"
    New-Item -ItemType Directory -Path $externalPluginTarget -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $externalPluginTarget "sentinel.txt"), "safe", [System.Text.UTF8Encoding]::new($false))
    $junctionPath = Join-Path $junctionProject.Dir "Plugins"
    try {
        New-Item -ItemType Junction -Path $junctionPath -Target $externalPluginTarget | Out-Null
        Assert-Throws -Action {
            & $Installer -ProjectPath $junctionProject.UProject -SourcePath $RepoRoot -WhatIf
        } -Pattern "symbolic link or junction" -Message "Reparse points in write paths must be rejected"
    } finally {
        if (Test-Path -LiteralPath $junctionPath) {
            [System.IO.Directory]::Delete($junctionPath)
        }
    }
    Assert-Equal -Actual (Get-Content -LiteralPath (Join-Path $externalPluginTarget "sentinel.txt") -Raw) -Expected "safe" -Message "Junction target must remain untouched"
    Complete-Test "junction guard"

    $whatIf = New-TestProject -Name "WhatIfProject" -DefaultGameContent "[/Script/Other.Settings]`nKeep=Yes`n"
    $beforeWhatIf = (Get-FileHash -LiteralPath (Join-Path $whatIf.Dir "Config\DefaultGame.ini") -Algorithm SHA256).Hash
    & $Installer -ProjectPath $whatIf.UProject -SourcePath $RepoRoot -Target Editor -WhatIf
    $afterWhatIf = (Get-FileHash -LiteralPath (Join-Path $whatIf.Dir "Config\DefaultGame.ini") -Algorithm SHA256).Hash
    Assert-Equal -Actual $afterWhatIf -Expected $beforeWhatIf -Message "WhatIf must preserve DefaultGame.ini"
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $whatIf.Dir "Plugins\QuestSupervisor"))) -Message "WhatIf must not install the plugin"
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $whatIf.Dir "Saved\CodexBackups"))) -Message "WhatIf must not create backups"
    Complete-Test "WhatIf has no side effects"

    $initialIni = @"
[/Script/Other.Settings]
Keep=Yes

[/Script/QuestSupervisor.QuestSupervisorSettings]
bSupervisorEnabled=False
bAutoConnectOnStartup=False
SupervisorEndpoint=10.0.0.5:1111
DeviceId=device-kept
DeviceLabel=Friendly Rig
AppId=existing-app
AppVersion=old-version
HeadsetModel=Old Device
bAutoAckCommands=True
HeartbeatIntervalSeconds=7.0
InitialReconnectDelaySeconds=4.0
MaxReconnectDelaySeconds=8.0
AuthToken=secret-must-remain
UnknownFutureSetting=preserve-me
"@
    $initial = New-TestProject -Name "InitialInstall" -DefaultGameContent $initialIni -DefaultEngineContent "[/Script/EngineSettings.GameMapsSettings]`nGameDefaultMap=/Game/Maps/TestMap`nEditorStartupMap=/Game/Maps/TestMap`n"
    $uprojectBeforeInstall = (Get-FileHash -LiteralPath $initial.UProject -Algorithm SHA256).Hash
    & $Installer -ProjectPath $initial.UProject -SourcePath $RepoRoot -Target Editor
    $installedDescriptor = Join-Path $initial.Dir "Plugins\QuestSupervisor\QuestSupervisor.uplugin"
    Assert-True -Condition (Test-Path -LiteralPath $installedDescriptor) -Message "Initial installation must copy the plugin"
    $configuredIni = Get-Content -LiteralPath (Join-Path $initial.Dir "Config\DefaultGame.ini") -Raw
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "Keep") -Expected "Yes" -Message "Unrelated INI sections must be preserved"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "UnknownFutureSetting") -Expected "preserve-me" -Message "Unknown plugin settings must be preserved"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "AuthToken") -Expected "secret-must-remain" -Message "AuthToken must be preserved"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "DeviceId") -Expected "device-kept" -Message "DeviceId must be preserved"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "DeviceLabel") -Expected "Friendly Rig" -Message "DeviceLabel must be preserved"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "AppId") -Expected "existing-app" -Message "Existing AppId must be preserved without an override"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "SupervisorEndpoint") -Expected "127.0.0.1:8787" -Message "Editor endpoint must be configured"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "HeadsetModel") -Expected "Editor" -Message "Editor headset model must be explicit"
    Assert-Equal -Actual (Read-ConfigValue -Content $configuredIni -Key "bAutoAckCommands") -Expected "False" -Message "Automatic ACK must be disabled"
    Assert-Equal -Actual (Get-FileHash -LiteralPath $initial.UProject -Algorithm SHA256).Hash -Expected $uprojectBeforeInstall -Message "The uproject must not be modified"
    Complete-Test "initial installation and INI preservation"

    $accentedText = "Descri$([char]0x00E7)$([char]0x00E3)o=S$([char]0x00E3)o Jos$([char]0x00E9)"
    $encodingCases = @(
        [pscustomobject]@{ Name = "Utf8NoBom"; Encoding = [System.Text.UTF8Encoding]::new($false, $true); HasBom = $false },
        [pscustomobject]@{ Name = "Utf8Bom"; Encoding = [System.Text.UTF8Encoding]::new($true, $true); HasBom = $true },
        [pscustomobject]@{ Name = "Utf16Le"; Encoding = [System.Text.UnicodeEncoding]::new($false, $true, $true); HasBom = $true }
    )
    foreach ($encodingCase in $encodingCases) {
        $encodingProject = New-TestProject -Name $encodingCase.Name
        $encodingIni = Join-Path $encodingProject.Dir "Config\DefaultGame.ini"
        [System.IO.File]::WriteAllText($encodingIni, "[/Script/Other.Settings]`r`n$accentedText`r`n", $encodingCase.Encoding)
        & $Installer -ProjectPath $encodingProject.UProject -SourcePath $RepoRoot -Target Editor
        $decoded = [System.IO.File]::ReadAllText($encodingIni, $encodingCase.Encoding)
        Assert-True -Condition $decoded.Contains($accentedText) -Message "$($encodingCase.Name) accents must remain intact"
        $resultBytes = [System.IO.File]::ReadAllBytes($encodingIni)
        $hasUtf8Bom = $resultBytes.Length -ge 3 -and $resultBytes[0] -eq 0xEF -and $resultBytes[1] -eq 0xBB -and $resultBytes[2] -eq 0xBF
        $hasUtf16LeBom = $resultBytes.Length -ge 2 -and $resultBytes[0] -eq 0xFF -and $resultBytes[1] -eq 0xFE
        if ($encodingCase.Name -eq "Utf8NoBom") {
            Assert-True -Condition (-not $hasUtf8Bom) -Message "UTF-8 without BOM must remain without BOM"
        } elseif ($encodingCase.Name -eq "Utf8Bom") {
            Assert-True -Condition $hasUtf8Bom -Message "UTF-8 BOM must be preserved"
        } else {
            Assert-True -Condition $hasUtf16LeBom -Message "UTF-16 LE BOM must be preserved"
        }
    }
    Complete-Test "INI encoding and accents"

    $otherPlugin = Join-Path $initial.Dir "Plugins\OtherPlugin"
    New-Item -ItemType Directory -Path $otherPlugin -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $otherPlugin "keep.txt"), "untouched", [System.Text.UTF8Encoding]::new($false))
    foreach ($generatedName in @("Binaries", "Intermediate")) {
        $generatedDir = Join-Path $initial.Dir "Plugins\QuestSupervisor\$generatedName"
        New-Item -ItemType Directory -Path $generatedDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $generatedDir "stale.bin"), "stale", [System.Text.UTF8Encoding]::new($false))
    }
    Start-Sleep -Milliseconds 10
    & $Installer -ProjectPath $initial.UProject -SourcePath $RepoRoot -Target Quest -Endpoint "192.168.10.25:8787" -AppId "orientation-lab"
    $backupRoot = Join-Path $initial.Dir "Saved\CodexBackups\QuestSupervisor"
    $backups = @(Get-ChildItem -LiteralPath $backupRoot -Directory | Sort-Object LastWriteTime)
    Assert-True -Condition ($backups.Count -ge 2) -Message "Install and update must create recoverable backups"
    $latestBackup = $backups[-1].FullName
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $latestBackup "QuestSupervisor.zip")) -Message "Update backup must contain the previous plugin"
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $latestBackup "DefaultGame.ini")) -Message "Update backup must contain DefaultGame.ini"
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $latestBackup "InitialInstall.uproject")) -Message "Update backup must contain the uproject"
    $manifestPath = Join-Path $latestBackup "backup-manifest.json"
    Assert-True -Condition (Test-Path -LiteralPath $manifestPath) -Message "Update backup must contain a manifest"
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Assert-True -Condition ([bool]$manifest.pluginExisted) -Message "Backup manifest must record the previous plugin"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $backupArchive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $latestBackup "QuestSupervisor.zip"))
    try {
        $entryNames = @($backupArchive.Entries | ForEach-Object { $_.FullName.Replace("\\", "/") })
        Assert-True -Condition ($entryNames -contains "QuestSupervisor.uplugin") -Message "Backup archive must restore directly into the plugin directory"
        Assert-True -Condition (-not ($entryNames | Where-Object { $_ -like "QuestSupervisor/*" })) -Message "Backup archive must not introduce a nested QuestSupervisor directory"
    } finally {
        $backupArchive.Dispose()
    }
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $initial.Dir "Plugins\QuestSupervisor\Binaries"))) -Message "Stale plugin Binaries must be removed"
    Assert-True -Condition (-not (Test-Path -LiteralPath (Join-Path $initial.Dir "Plugins\QuestSupervisor\Intermediate"))) -Message "Stale plugin Intermediate must be removed"
    Assert-Equal -Actual (Get-Content -LiteralPath (Join-Path $otherPlugin "keep.txt") -Raw) -Expected "untouched" -Message "Other plugins must not be changed"
    $questIni = Get-Content -LiteralPath (Join-Path $initial.Dir "Config\DefaultGame.ini") -Raw
    Assert-Equal -Actual (Read-ConfigValue -Content $questIni -Key "SupervisorEndpoint") -Expected "192.168.10.25:8787" -Message "Quest endpoint must be applied"
    Assert-Equal -Actual (Read-ConfigValue -Content $questIni -Key "AppId") -Expected "orientation-lab" -Message "Explicit AppId must be applied"
    Assert-Equal -Actual (Read-ConfigValue -Content $questIni -Key "AuthToken") -Expected "secret-must-remain" -Message "Update must preserve AuthToken"
    Complete-Test "update backup and restricted cleanup"

    & $Checker -ProjectPath $initial.UProject
    Complete-Test "official checker accepts generated project"

    if ($TestPinnedDownload) {
        $downloadProject = New-TestProject -Name "PinnedDownload"
        & $Installer -ProjectPath $downloadProject.UProject -AllowDownload -Target Editor
        Assert-True -Condition (Test-Path -LiteralPath (Join-Path $downloadProject.Dir "Plugins\QuestSupervisor\QuestSupervisor.uplugin")) -Message "Pinned download must install the plugin"
        Complete-Test "pinned GitHub download"
    }

    Write-Host ""
    Write-Host "All $script:Passed QuestSupervisor installer tests passed."
} finally {
    if (Test-Path -LiteralPath $TestRoot) {
        $resolvedTestRoot = (Resolve-Path -LiteralPath $TestRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
        if (-not $resolvedTestRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove test data outside the system temporary directory: $resolvedTestRoot"
        }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
