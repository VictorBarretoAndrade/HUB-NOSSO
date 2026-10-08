[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [string]$SourcePath,

    [ValidateSet("Editor", "Quest")]
    [string]$Target = "Editor",

    [string]$Endpoint,

    [string]$AppId,

    [switch]$AllowDownload,

    [switch]$AllowUntestedEngineVersion
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PinnedRepository = "Viperpog/hub-ue"
$PinnedCommit = "bcb99ddb95c15b6a36d7494e30d4799ffe38bc73"
$PinnedArchiveUrl = "https://api.github.com/repos/$PinnedRepository/zipball/$PinnedCommit"
$SettingsSection = "[/Script/QuestSupervisor.QuestSupervisorSettings]"
$temporarySourceRoot = $null
$backupDir = $null
$installMutex = $null
$mutexHeld = $false

function Resolve-UnrealProject {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $item = Get-Item -LiteralPath $resolved.Path
    if (-not $item.PSIsContainer) {
        if ($item.Extension -ne ".uproject") {
            throw "ProjectPath must point to an Unreal project directory or .uproject file."
        }
        return [pscustomobject]@{
            ProjectDir = $item.Directory.FullName
            UProject = $item.FullName
        }
    }

    $uprojects = @(Get-ChildItem -LiteralPath $item.FullName -Filter *.uproject -File)
    if ($uprojects.Count -eq 0) {
        throw "No .uproject file was found in '$($item.FullName)'."
    }
    if ($uprojects.Count -gt 1) {
        throw "Multiple .uproject files were found in '$($item.FullName)'. Pass the exact .uproject path."
    }

    return [pscustomobject]@{
        ProjectDir = $item.FullName
        UProject = $uprojects[0].FullName
    }
}

function Get-EngineAssociation {
    param([Parameter(Mandatory = $true)][string]$UProject)

    try {
        $projectJson = Get-Content -LiteralPath $UProject -Raw | ConvertFrom-Json
    } catch {
        throw "The .uproject file is not valid JSON: $UProject"
    }

    $association = [string]$projectJson.EngineAssociation
    if ([string]::IsNullOrWhiteSpace($association)) {
        return "<not declared>"
    }
    return $association.Trim()
}

function Assert-EngineVersion {
    param(
        [Parameter(Mandatory = $true)][string]$EngineAssociation,
        [switch]$AllowUntested
    )

    if ($EngineAssociation -eq "5.7") {
        return
    }
    if (-not $AllowUntested) {
        throw "Unreal Engine '$EngineAssociation' is not the validated version 5.7. Continue only after explicit approval with -AllowUntestedEngineVersion."
    }
}

function Assert-Endpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][string]$TargetMode
    )

    if ($Value -match "\s" -or $Value -match "://" -or $Value.Contains("/") -or $Value.Contains("\\")) {
        throw "Endpoint must use only host:port, without protocol, path or spaces."
    }

    $match = [regex]::Match($Value, "^(?<host>\[[0-9A-Fa-f:]+\]|[^:]+):(?<port>\d{1,5})$")
    if (-not $match.Success) {
        throw "Endpoint '$Value' is invalid. Use host:port, for example 127.0.0.1:8787."
    }

    $port = [int]$match.Groups["port"].Value
    if ($port -lt 1 -or $port -gt 65535) {
        throw "Endpoint port must be between 1 and 65535."
    }

    $hostName = $match.Groups["host"].Value.Trim("[", "]")
    $parsedAddress = $null
    $isIpAddress = [System.Net.IPAddress]::TryParse($hostName, [ref]$parsedAddress)
    if (-not $isIpAddress -and $hostName -notmatch "^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$") {
        throw "Endpoint host '$hostName' is not a valid IP address or hostname."
    }

    if ($TargetMode -eq "Quest") {
        $isUnavailableAddress = $hostName.Equals("localhost", [System.StringComparison]::OrdinalIgnoreCase)
        if ($isIpAddress) {
            $bytes = $parsedAddress.GetAddressBytes()
            $isIpv4Multicast = $bytes.Length -eq 4 -and $bytes[0] -ge 224 -and $bytes[0] -le 239
            $isIpv6Multicast = $bytes.Length -eq 16 -and $bytes[0] -eq 255
            $isUnavailableAddress = $isUnavailableAddress -or
                [System.Net.IPAddress]::IsLoopback($parsedAddress) -or
                $parsedAddress.Equals([System.Net.IPAddress]::Any) -or
                $parsedAddress.Equals([System.Net.IPAddress]::IPv6Any) -or
                $parsedAddress.Equals([System.Net.IPAddress]::Broadcast) -or
                $isIpv4Multicast -or
                $isIpv6Multicast
        }
        if ($isUnavailableAddress) {
            throw "Quest requires the computer LAN address. Loopback, wildcard, broadcast and multicast addresses are not valid."
        }
    }
}

function Assert-AppId {
    param([AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }
    if ($Value.Length -gt 128 -or $Value -notmatch "^[A-Za-z0-9._-]+$") {
        throw "AppId may contain only letters, numbers, dots, underscores and hyphens."
    }
}

function Assert-NoReparsePoints {
    param([Parameter(Mandatory = $true)][string]$ProjectDir)

    $pathsToCheck = @(
        $ProjectDir,
        (Join-Path $ProjectDir "Config"),
        (Join-Path $ProjectDir "Config\DefaultGame.ini"),
        (Join-Path $ProjectDir "Plugins"),
        (Join-Path $ProjectDir "Plugins\QuestSupervisor"),
        (Join-Path $ProjectDir "Plugins\QuestSupervisor\Binaries"),
        (Join-Path $ProjectDir "Plugins\QuestSupervisor\Intermediate"),
        (Join-Path $ProjectDir "Saved"),
        (Join-Path $ProjectDir "Saved\CodexBackups"),
        (Join-Path $ProjectDir "Saved\CodexBackups\QuestSupervisor")
    )
    foreach ($path in $pathsToCheck) {
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }
        $item = Get-Item -LiteralPath $path -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Installation path uses a symbolic link or junction and cannot be changed safely: $path"
        }
    }
}

function Get-ProjectMutexName {
    param([Parameter(Mandatory = $true)][string]$ProjectDir)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($ProjectDir.ToLowerInvariant())
        $hash = [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "")
        return "Local\QuestSupervisorInstall-$hash"
    } finally {
        $sha.Dispose()
    }
}

function Assert-PinnedLocalSource {
    param([Parameter(Mandatory = $true)][string]$Root)

    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $git) {
        throw "A local SourcePath must be a verifiable hub-ue Git clone, but Git was not found. Use -AllowDownload for the pinned source."
    }

    & $git.Source -C $Root rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "SourcePath is not a hub-ue Git clone. Use a valid clone or -AllowDownload for the pinned source."
    }
    & $git.Source -C $Root cat-file -e "$PinnedCommit`^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "The local clone does not contain pinned commit $PinnedCommit. Fetch it or use -AllowDownload."
    }

    $protectedPaths = @(
        "unreal/Plugins/QuestSupervisor",
        "tools/unreal/install_quest_supervisor_plugin.ps1",
        "tools/unreal/check_quest_supervisor_project.ps1"
    )
    & $git.Source -C $Root diff --quiet $PinnedCommit -- @protectedPaths
    if ($LASTEXITCODE -ne 0) {
        throw "The local QuestSupervisor source differs from pinned V0.4 commit $PinnedCommit. Use a clean matching clone or -AllowDownload."
    }
    $workingChanges = @(& $git.Source -C $Root status --porcelain --untracked-files=all -- @protectedPaths)
    if ($LASTEXITCODE -ne 0 -or $workingChanges.Count -gt 0) {
        throw "The local QuestSupervisor source has uncommitted changes. Use a clean matching clone or -AllowDownload."
    }
}

function Get-SourceLayout {
    param([Parameter(Mandatory = $true)][string]$Root)

    $resolvedRoot = Resolve-Path -LiteralPath $Root -ErrorAction Stop
    $pluginDir = Join-Path $resolvedRoot.Path "unreal\Plugins\QuestSupervisor"
    $descriptor = Join-Path $pluginDir "QuestSupervisor.uplugin"
    $sourceDir = Join-Path $pluginDir "Source"
    $configDir = Join-Path $pluginDir "Config"
    $installer = Join-Path $resolvedRoot.Path "tools\unreal\install_quest_supervisor_plugin.ps1"
    $checker = Join-Path $resolvedRoot.Path "tools\unreal\check_quest_supervisor_project.ps1"

    foreach ($requiredPath in @($descriptor, $sourceDir, $configDir, $installer, $checker)) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "The QuestSupervisor source is incomplete. Missing: $requiredPath"
        }
    }

    return [pscustomobject]@{
        Root = $resolvedRoot.Path
        PluginDir = $pluginDir
        Descriptor = $descriptor
        Installer = $installer
        Checker = $checker
    }
}

function Get-PluginVersion {
    param([Parameter(Mandatory = $true)][string]$Descriptor)

    try {
        $pluginJson = Get-Content -LiteralPath $Descriptor -Raw | ConvertFrom-Json
    } catch {
        throw "QuestSupervisor.uplugin is not valid JSON: $Descriptor"
    }
    if ([string]::IsNullOrWhiteSpace([string]$pluginJson.VersionName)) {
        throw "QuestSupervisor.uplugin does not declare VersionName."
    }
    return ([string]$pluginJson.VersionName).Trim()
}

function Get-SafeAppId {
    param([Parameter(Mandatory = $true)][string]$ProjectName)

    $slug = $ProjectName.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
    $slug = $slug.Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = "unreal-project"
    }
    return "quest-supervisor-$slug"
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            Content = ""
            Encoding = [System.Text.UTF8Encoding]::new($false)
        }
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $offset = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $encoding = [System.Text.UTF8Encoding]::new($true, $true)
        $offset = 3
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $encoding = [System.Text.UnicodeEncoding]::new($false, $true, $true)
        $offset = 2
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        $encoding = [System.Text.UnicodeEncoding]::new($true, $true, $true)
        $offset = 2
    } else {
        try {
            $encoding = [System.Text.UTF8Encoding]::new($false, $true)
            $null = $encoding.GetString($bytes)
        } catch {
            $encoding = [System.Text.Encoding]::Default
        }
    }

    return [pscustomobject]@{
        Content = $encoding.GetString($bytes, $offset, $bytes.Length - $offset)
        Encoding = $encoding
    }
}

function Read-IniSectionValues {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory = $true)][string]$Section
    )

    $values = [ordered]@{}
    $lines = [regex]::Split($Content, "\r?\n")
    $insideSection = $false
    foreach ($line in $lines) {
        if ($line.Trim() -eq $Section) {
            $insideSection = $true
            continue
        }
        if ($insideSection -and $line -match "^\s*\[.+\]\s*$") {
            break
        }
        if ($insideSection -and $line -match "^\s*([^;#][^=]*?)\s*=\s*(.*)$") {
            $key = $matches[1].Trim()
            if (-not $values.Contains($key)) {
                $values[$key] = $matches[2]
            }
        }
    }
    return $values
}

function Get-IniSectionCount {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory = $true)][string]$Section
    )

    $count = 0
    foreach ($line in [regex]::Split($Content, "\r?\n")) {
        if ($line.Trim() -eq $Section) {
            $count++
        }
    }
    return $count
}

function Set-IniSectionValues {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Section,
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Values
    )

    $textFile = Read-TextFile -Path $Path
    $content = $textFile.Content
    $newline = if ($content.Contains("`r`n")) { "`r`n" } elseif ($content.Contains("`n")) { "`n" } else { [Environment]::NewLine }
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in [regex]::Split($content, "\r?\n")) {
        $lines.Add($line)
    }

    $sectionStart = -1
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].Trim() -eq $Section) {
            $sectionStart = $index
            break
        }
    }

    if ($sectionStart -lt 0) {
        while ($lines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($lines[$lines.Count - 1])) {
            $lines.RemoveAt($lines.Count - 1)
        }
        if ($lines.Count -gt 0) {
            $lines.Add("")
        }
        $lines.Add($Section)
        foreach ($key in $Values.Keys) {
            $lines.Add("$key=$($Values[$key])")
        }
    } else {
        $sectionEnd = $lines.Count
        for ($index = $sectionStart + 1; $index -lt $lines.Count; $index++) {
            if ($lines[$index] -match "^\s*\[.+\]\s*$") {
                $sectionEnd = $index
                break
            }
        }

        $replacement = [System.Collections.Generic.List[string]]::new()
        $replacement.Add($Section)
        $writtenKeys = @{}
        for ($index = $sectionStart + 1; $index -lt $sectionEnd; $index++) {
            $line = $lines[$index]
            if ($line -match "^\s*([^;#][^=]*?)\s*=\s*(.*)$") {
                $key = $matches[1].Trim()
                if ($Values.Contains($key)) {
                    if (-not $writtenKeys.ContainsKey($key)) {
                        $replacement.Add("$key=$($Values[$key])")
                        $writtenKeys[$key] = $true
                    }
                    continue
                }
            }
            $replacement.Add($line)
        }
        foreach ($key in $Values.Keys) {
            if (-not $writtenKeys.ContainsKey([string]$key)) {
                $replacement.Add("$key=$($Values[$key])")
            }
        }

        $lines.RemoveRange($sectionStart, $sectionEnd - $sectionStart)
        $lines.InsertRange($sectionStart, [string[]]$replacement)
    }

    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $normalized = ([string]::Join($newline, $lines)).TrimEnd() + $newline
    [System.IO.File]::WriteAllText($Path, $normalized, $textFile.Encoding)
}

function Get-DefaultMaps {
    param([Parameter(Mandatory = $true)][string]$ProjectDir)

    $defaultEngine = Join-Path $ProjectDir "Config\DefaultEngine.ini"
    $result = [ordered]@{
        GameDefaultMap = "<not declared>"
        EditorStartupMap = "<not declared>"
    }
    if (-not (Test-Path -LiteralPath $defaultEngine)) {
        return $result
    }

    $content = (Read-TextFile -Path $defaultEngine).Content
    foreach ($key in @("GameDefaultMap", "EditorStartupMap")) {
        $match = [regex]::Match($content, "(?m)^\s*$key\s*=\s*(.*?)\s*$")
        if ($match.Success -and -not [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
            $result[$key] = $match.Groups[1].Value.Trim()
        }
    }
    return $result
}

function New-QuestSupervisorBackup {
    param(
        [Parameter(Mandatory = $true)][pscustomobject]$Project,
        [Parameter(Mandatory = $true)][string]$PluginDir,
        [Parameter(Mandatory = $true)][string]$DefaultGame
    )

    $backupDir = Join-Path $Project.ProjectDir ("Saved\CodexBackups\QuestSupervisor\" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    if (Test-Path -LiteralPath $PluginDir) {
        $archivePath = Join-Path $backupDir "QuestSupervisor.zip"
        Compress-Archive -Path (Join-Path $PluginDir "*") -DestinationPath $archivePath -CompressionLevel Optimal
    }
    if (Test-Path -LiteralPath $DefaultGame) {
        Copy-Item -LiteralPath $DefaultGame -Destination (Join-Path $backupDir "DefaultGame.ini") -Force
    }
    Copy-Item -LiteralPath $Project.UProject -Destination (Join-Path $backupDir (Split-Path $Project.UProject -Leaf)) -Force
    $manifest = [ordered]@{
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        project = $Project.UProject
        pluginExisted = (Test-Path -LiteralPath $PluginDir)
        defaultGameExisted = (Test-Path -LiteralPath $DefaultGame)
        pluginArchive = if (Test-Path -LiteralPath (Join-Path $backupDir "QuestSupervisor.zip")) { "QuestSupervisor.zip" } else { $null }
        defaultGameBackup = if (Test-Path -LiteralPath (Join-Path $backupDir "DefaultGame.ini")) { "DefaultGame.ini" } else { $null }
        uprojectBackup = Split-Path $Project.UProject -Leaf
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $backupDir "backup-manifest.json"), $manifest, [System.Text.UTF8Encoding]::new($false))
    return $backupDir
}

function Assert-InstalledState {
    param(
        [Parameter(Mandatory = $true)][string]$PluginDir,
        [Parameter(Mandatory = $true)][string]$DefaultGame,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$ExpectedSettings
    )

    $descriptor = Join-Path $PluginDir "QuestSupervisor.uplugin"
    foreach ($requiredPath in @($descriptor, (Join-Path $PluginDir "Source"), (Join-Path $PluginDir "Config"), $DefaultGame)) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Post-install validation failed. Missing: $requiredPath"
        }
    }
    $installedVersion = Get-PluginVersion -Descriptor $descriptor
    if ($installedVersion -ne $ExpectedVersion) {
        throw "Post-install validation failed. Installed version '$installedVersion' differs from '$ExpectedVersion'."
    }

    $content = (Read-TextFile -Path $DefaultGame).Content
    if ((Get-IniSectionCount -Content $content -Section $SettingsSection) -ne 1) {
        throw "Post-install validation failed. QuestSupervisorSettings must exist exactly once."
    }
    $actualSettings = Read-IniSectionValues -Content $content -Section $SettingsSection
    foreach ($key in $ExpectedSettings.Keys) {
        if (-not $actualSettings.Contains($key) -or [string]$actualSettings[$key] -ne [string]$ExpectedSettings[$key]) {
            throw "Post-install validation failed for setting '$key'."
        }
    }
}

function Get-PinnedSource {
    $downloadRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("quest-supervisor-source-" + [guid]::NewGuid().ToString("N"))
    $archivePath = Join-Path $downloadRoot "hub-ue.zip"
    $extractPath = Join-Path $downloadRoot "source"
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

    Write-Host "Downloading pinned QuestSupervisor source: $PinnedCommit"
    $headers = @{
        Accept = "application/vnd.github+json"
        "User-Agent" = "Codex-QuestSupervisor-Installer"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($null -ne $gh) {
        $githubToken = (& $gh.Source auth token 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$githubToken)) {
            $headers["Authorization"] = "Bearer $githubToken"
        }
    }
    $invokeParameters = @{
        Uri = $PinnedArchiveUrl
        OutFile = $archivePath
        Headers = $headers
    }
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        $invokeParameters["UseBasicParsing"] = $true
    }
    $downloadSucceeded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest @invokeParameters
            $downloadSucceeded = $true
            break
        } catch {
            if ($attempt -eq 3) {
                throw "Could not download pinned QuestSupervisor source after 3 attempts. Check the network and GitHub authentication, or use SourcePath with a clean local clone. $($_.Exception.Message)"
            }
            $delaySeconds = [math]::Pow(2, $attempt - 1)
            Write-Warning "Pinned source download attempt $attempt failed. Retrying in $delaySeconds second(s)."
            Start-Sleep -Seconds $delaySeconds
        }
    }
    if (-not $downloadSucceeded) {
        throw "Pinned QuestSupervisor source download did not complete."
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
    $roots = @(Get-ChildItem -LiteralPath $extractPath -Directory)
    if ($roots.Count -ne 1) {
        throw "The downloaded archive has an unexpected structure."
    }
    return [pscustomobject]@{
        Root = $roots[0].FullName
        TemporaryRoot = $downloadRoot
    }
}

try {
    $project = Resolve-UnrealProject -Path $ProjectPath
    $engineAssociation = Get-EngineAssociation -UProject $project.UProject
    Assert-EngineVersion -EngineAssociation $engineAssociation -AllowUntested:$AllowUntestedEngineVersion
    Assert-NoReparsePoints -ProjectDir $project.ProjectDir

    if ([string]::IsNullOrWhiteSpace($Endpoint)) {
        if ($Target -eq "Quest") {
            throw "Endpoint is required for Target Quest. Use the computer LAN address, for example 192.168.0.20:8787."
        }
        $Endpoint = "127.0.0.1:8787"
    }
    $Endpoint = $Endpoint.Trim()
    Assert-Endpoint -Value $Endpoint -TargetMode $Target
    Assert-AppId -Value $AppId

    $runningEditors = @(Get-Process -Name "UnrealEditor", "UnrealEditor-Cmd" -ErrorAction SilentlyContinue)
    if ($runningEditors.Count -gt 0 -and -not $WhatIfPreference) {
        throw "Unreal Editor is running. Close it before installing or updating QuestSupervisor."
    }

    $defaultGame = Join-Path $project.ProjectDir "Config\DefaultGame.ini"
    $existingConfigFile = Read-TextFile -Path $defaultGame
    if ((Get-IniSectionCount -Content $existingConfigFile.Content -Section $SettingsSection) -gt 1) {
        throw "DefaultGame.ini contains more than one QuestSupervisorSettings section. Consolidate it before installation."
    }

    if (-not $WhatIfPreference) {
        $installMutex = [System.Threading.Mutex]::new($false, (Get-ProjectMutexName -ProjectDir $project.ProjectDir))
        $mutexHeld = $installMutex.WaitOne(0)
        if (-not $mutexHeld) {
            throw "Another QuestSupervisor installation is already running for this project."
        }
    }

    $sourceLayout = $null
    $sourceDescription = $null
    if (-not [string]::IsNullOrWhiteSpace($SourcePath)) {
        $sourceLayout = Get-SourceLayout -Root $SourcePath
        Assert-PinnedLocalSource -Root $sourceLayout.Root
        $sourceDescription = "verified local clone matching $PinnedCommit`: $($sourceLayout.Root)"
    } elseif ($WhatIfPreference) {
        $sourceDescription = "pinned download (not downloaded during WhatIf): $PinnedRepository@$PinnedCommit"
    } elseif ($AllowDownload) {
        $downloaded = Get-PinnedSource
        $temporarySourceRoot = $downloaded.TemporaryRoot
        $sourceLayout = Get-SourceLayout -Root $downloaded.Root
        $sourceDescription = "pinned download: $PinnedRepository@$PinnedCommit"
    } else {
        throw "SourcePath was not provided. Obtain download authorization and run with -AllowDownload, or provide a local hub-ue clone."
    }

    $projectName = [System.IO.Path]::GetFileNameWithoutExtension($project.UProject)
    $targetPlugin = Join-Path $project.ProjectDir "Plugins\QuestSupervisor"
    $targetDescriptor = Join-Path $targetPlugin "QuestSupervisor.uplugin"
    $maps = Get-DefaultMaps -ProjectDir $project.ProjectDir
    $pluginVersion = if ($null -ne $sourceLayout) { Get-PluginVersion -Descriptor $sourceLayout.Descriptor } else { "<read after authorized download>" }
    $installedVersion = if (Test-Path -LiteralPath $targetDescriptor) { Get-PluginVersion -Descriptor $targetDescriptor } else { "<not installed>" }

    Write-Host ""
    Write-Host "QuestSupervisor installation preview"
    Write-Host "Project:            $($project.UProject)"
    Write-Host "Unreal Engine:      $engineAssociation"
    Write-Host "Target:             $Target"
    Write-Host "Endpoint:           $Endpoint"
    Write-Host "Source:             $sourceDescription"
    Write-Host "Source version:     $pluginVersion"
    Write-Host "Installed version:  $installedVersion"
    Write-Host "Destination:        $targetPlugin"
    Write-Host "Game default map:   $($maps.GameDefaultMap)"
    Write-Host "Editor startup map: $($maps.EditorStartupMap)"
    if ($runningEditors.Count -gt 0) {
        Write-Warning "Unreal Editor is running. The real installation will stop until it is closed."
    }
    Write-Host ""
    Write-Host "Only Plugins\QuestSupervisor and the QuestSupervisorSettings section will be changed."
    Write-Host "Maps, Blueprints, other plugins and authentication tokens will not be changed or displayed."

    if ($WhatIfPreference) {
        $null = $PSCmdlet.ShouldProcess($targetPlugin, "Back up, install and configure QuestSupervisor")
        Write-Host "WhatIf completed. No files were downloaded or changed."
        return
    }

    if ($null -eq $sourceLayout) {
        throw "QuestSupervisor source could not be resolved."
    }

    if ($PSCmdlet.ShouldProcess($targetPlugin, "Back up, install and configure QuestSupervisor")) {
        $backupDir = New-QuestSupervisorBackup -Project $project -PluginDir $targetPlugin -DefaultGame $defaultGame

        foreach ($generatedDirName in @("Binaries", "Intermediate")) {
            $generatedDir = Join-Path $targetPlugin $generatedDirName
            if (Test-Path -LiteralPath $generatedDir) {
                Remove-Item -LiteralPath $generatedDir -Recurse -Force
            }
        }

        & $sourceLayout.Installer -ProjectPath $project.UProject -Confirm:$false
        $copiedVersion = Get-PluginVersion -Descriptor $targetDescriptor
        if ($copiedVersion -ne $pluginVersion) {
            throw "Installed plugin version '$copiedVersion' does not match source version '$pluginVersion'. Backup was preserved at '$backupDir'."
        }

        $existingContent = (Read-TextFile -Path $defaultGame).Content
        $existingValues = Read-IniSectionValues -Content $existingContent -Section $SettingsSection
        $resolvedAppId = if (-not [string]::IsNullOrWhiteSpace($AppId)) {
            $AppId.Trim()
        } elseif ($existingValues.Contains("AppId") -and -not [string]::IsNullOrWhiteSpace([string]$existingValues["AppId"])) {
            ([string]$existingValues["AppId"]).Trim()
        } else {
            Get-SafeAppId -ProjectName $projectName
        }

        $settings = [ordered]@{
            bSupervisorEnabled = "True"
            bAutoConnectOnStartup = "True"
            SupervisorEndpoint = $Endpoint
            DeviceId = if ($existingValues.Contains("DeviceId")) { [string]$existingValues["DeviceId"] } else { "" }
            DeviceLabel = if ($existingValues.Contains("DeviceLabel")) { [string]$existingValues["DeviceLabel"] } else { "" }
            AppId = $resolvedAppId
            AppVersion = $pluginVersion
            HeadsetModel = if ($Target -eq "Editor") { "Editor" } else { "Meta Quest 3" }
            bAutoAckCommands = "False"
            HeartbeatIntervalSeconds = "2.0"
            InitialReconnectDelaySeconds = "1.0"
            MaxReconnectDelaySeconds = "30.0"
            AuthToken = if ($existingValues.Contains("AuthToken")) { [string]$existingValues["AuthToken"] } else { "" }
        }
        Set-IniSectionValues -Path $defaultGame -Section $SettingsSection -Values $settings
        Assert-InstalledState -PluginDir $targetPlugin -DefaultGame $defaultGame -ExpectedVersion $pluginVersion -ExpectedSettings $settings

        Write-Host ""
        Write-Host "Running the official project checker..."
        & $sourceLayout.Checker -ProjectPath $project.UProject
    }

    Write-Host ""
    Write-Host "QuestSupervisor installation completed."
    Write-Host "Version:  $pluginVersion"
    Write-Host "Project:  $($project.UProject)"
    Write-Host "Endpoint: $Endpoint"
    Write-Host "Backup:   $backupDir"
    Write-Host "Map suggested for manual bridge setup: $($maps.GameDefaultMap)"
    Write-Host "Next step: open the project and add QuestSupervisorCommandBridgeActor to the chosen map after operator confirmation."
} catch {
    if (-not [string]::IsNullOrWhiteSpace([string]$backupDir)) {
        Write-Warning "Installation stopped after changes began. No automatic rollback was performed."
        Write-Warning "Backup preserved at: $backupDir"
        Write-Warning "Review references\integration-workflow.md and confirm the backup before restoring it."
    }
    throw
} finally {
    if ($mutexHeld -and $null -ne $installMutex) {
        $installMutex.ReleaseMutex()
    }
    if ($null -ne $installMutex) {
        $installMutex.Dispose()
    }
    if ($null -ne $temporarySourceRoot -and (Test-Path -LiteralPath $temporarySourceRoot)) {
        Remove-Item -LiteralPath $temporarySourceRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
