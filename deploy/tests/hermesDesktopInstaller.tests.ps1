$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\deploymentModule.psm1') -Force
$module = Get-Module deploymentModule
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('hermes-desktop-test-' + [guid]::NewGuid())
$previousHome = $env:HERMES_HOME
New-Item -ItemType Directory -Path (Join-Path $testRoot 'hermes\hermes-agent') -Force | Out-Null
try {
    & $module {
        param($testRoot)
        Set-InstallBaseFolder -Path $testRoot
        $script:TestLauncher = Join-Path $testRoot 'hermes.ps1'
        @'
if ($args.Count -ne 4 -or $args[0] -ne 'desktop' -or $args[1] -ne '--hermes-root' -or $args[3] -ne '--build-only') {
    throw 'Unexpected desktop install arguments.'
}
if ($args[2] -ne (Join-Path $env:HERMES_HOME 'hermes-agent')) { throw 'Wrong desktop source root.' }
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $script:TestLauncher
        function Get-Command {
            param($Name, $ErrorAction)
            [pscustomobject]@{ Source = $script:TestLauncher }
        }
        $before = $env:HERMES_HOME
        foreach ($windows in @($true, $false)) {
            $script:IsWindows = $windows
            Install-HermesDesktop
            if ($env:HERMES_HOME -ne $before) { throw 'Hermes home was not restored.' }
        }
        Set-Content -LiteralPath $script:TestLauncher -Value '$global:LASTEXITCODE = 7'
        $failed = $false
        try { Install-HermesDesktop } catch {
            if ($_ -notmatch 'installation failed with exit code 7') { throw }
            $failed = $true
        }
        if (-not $failed) { throw 'Desktop build failure was reported as success.' }
        if ($env:HERMES_HOME -ne $before) { throw 'Hermes home was not restored after failure.' }
        function Get-Command { param($Name, $ErrorAction) }
        $failed = $false
        try { Install-HermesDesktop } catch {
            if ($_ -notmatch 'Run Install-HermesAgent') { throw }
            $failed = $true
        }
        if (-not $failed) { throw 'Missing Agent was not reported.' }
    } $testRoot
    Write-Output 'Hermes Desktop checks passed: platform branches, arguments, failure propagation, environment restoration, missing Agent.'
} finally {
    $env:HERMES_HOME = $previousHome
    Remove-Item -LiteralPath $testRoot -Recurse -Force
    Remove-Module deploymentModule
}
