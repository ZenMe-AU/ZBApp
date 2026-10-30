$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\deploymentModule.psm1') -Force
$module = Get-Module deploymentModule
$previousHome = $env:HERMES_HOME
$previousUserHome = [Environment]::GetEnvironmentVariable('HERMES_HOME', 'User')
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('hermes-installer-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    & $module {
        param($testRoot)
        $script:IsWindows = $true
        Set-InstallBaseFolder -Path (Join-Path $testRoot 'models with spaces')
        $script:TestInstallerPath = $null
        function Invoke-WebRequest {
            param($Uri, $OutFile, $ErrorAction)
            if ($Uri -ne 'https://hermes-agent.nousresearch.com/install.ps1') {
                throw "Unexpected installer URL: $Uri"
            }
            $script:TestInstallerPath = $OutFile
            @'
param([string]$HermesHome, [string]$InstallDir, [switch]$NonInteractive)
if (-not $NonInteractive) { throw 'Onboarding must be skipped in automation.' }
if ($InstallDir -ne (Join-Path $HermesHome 'hermes-agent')) { throw 'Wrong source directory.' }
New-Item -ItemType Directory -Path $HermesHome -Force | Out-Null
Set-Content -LiteralPath (Join-Path $HermesHome 'installer-ran') -Value $InstallDir
'@ | Set-Content -LiteralPath $OutFile
        }
        Install-HermesAgent
        $expectedHome = Join-Path $testRoot 'models with spaces\hermes'
        if (-not (Test-Path -LiteralPath (Join-Path $expectedHome 'installer-ran'))) {
            throw 'The installer did not receive the configured base folder.'
        }
        if ($env:HERMES_HOME -ne $expectedHome -or [Environment]::GetEnvironmentVariable('HERMES_HOME', 'User') -ne $expectedHome) {
            throw 'The custom Hermes home was not persisted.'
        }
        if (Test-Path -LiteralPath $script:TestInstallerPath) {
            throw 'The downloaded installer was not cleaned up.'
        }

        function Invoke-WebRequest {
            param($Uri, $OutFile, $ErrorAction)
            $script:TestInstallerPath = $OutFile
            Set-Content -LiteralPath $OutFile -Value 'exit 7'
        }
        $failed = $false
        try {
            Install-HermesAgent
        } catch {
            if ($_ -notmatch 'installation failed with exit code 7') { throw }
            $failed = $true
        }
        if (-not $failed) { throw 'Installer failure was reported as success.' }
        if (Test-Path -LiteralPath $script:TestInstallerPath) {
            throw 'A failed installer was not cleaned up.'
        }
    } $testRoot
    Write-Output 'Hermes installer checks passed: custom path, non-interactive setup, exit code propagation, cleanup.'
} finally {
    $env:HERMES_HOME = $previousHome
    [Environment]::SetEnvironmentVariable('HERMES_HOME', $previousUserHome, 'User')
    Remove-Item -LiteralPath $testRoot -Recurse -Force
    Remove-Module deploymentModule
}
