[CmdletBinding()]
param(
    [string]$InstallDir = 'D:\Program Files\ovms',
    [string]$Version = '2026.4.1'
)

$ErrorActionPreference = 'Stop'

# 1. Self-elevation check
$currentUser = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host 'Administrator privileges required. Relaunching with elevation...' -ForegroundColor Yellow
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
        $scriptPath = Join-Path $PSScriptRoot 'DeployOvms.ps1'
    }

    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$scriptPath`"")
    if ($PSBoundParameters.ContainsKey('InstallDir')) { $argList += '-InstallDir'; $argList += "`"$InstallDir`"" }
    if ($PSBoundParameters.ContainsKey('Version'))    { $argList += '-Version';    $argList += "`"$Version`"" }

    $powershellExe = (Get-Process -Id $PID).Path
    $process = Start-Process -FilePath $powershellExe -ArgumentList $argList -Verb RunAs -PassThru -Wait
    exit $process.ExitCode
}

Write-Host "=== OpenVINO Model Server (OVMS) Deployment ===" -ForegroundColor Cyan
Write-Host "Target Directory : $InstallDir"
Write-Host "OVMS Version     : $Version"

# 2. Python 3.12 Check / Installation via Python Install Manager (pymanager / py)
Write-Host "`nChecking Python 3.12 (64-bit) runtime..." -ForegroundColor Cyan
$py312Found = $false

try {
    $checkOutput = & py -3.12 --version 2>&1
    if ($LASTEXITCODE -eq 0 -and $checkOutput -match 'Python 3\.12') {
        $py312Found = $true
        Write-Host "Found: $checkOutput" -ForegroundColor Green
    }
}
catch {
    $py312Found = $false
}

if (-not $py312Found) {
    Write-Host "Python 3.12 not detected. Attempting install via Python manager (py install -y 3.12)..." -ForegroundColor Yellow
    if (Get-Command 'py' -ErrorAction SilentlyContinue) {
        & py install -y 3.12
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Python 3.12 installation returned exit code $LASTEXITCODE. Proceeding with embedded OVMS runtime."
        } else {
            Write-Host "Python 3.12 installed successfully." -ForegroundColor Green
        }
    } else {
        Write-Warning "'py' launcher not found on PATH. Proceeding with embedded OVMS Python runtime."
    }
}

# 3. Create target directory
if (-not (Test-Path $InstallDir)) {
    Write-Host "Creating installation directory: $InstallDir"
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$ovmsExePath = Join-Path $InstallDir 'ovms.exe'
$alreadyInstalled = (Test-Path $ovmsExePath)

if ($alreadyInstalled) {
    Write-Host "OVMS binary already present at $ovmsExePath. Skipping download and extraction." -ForegroundColor Yellow
} else {
    $downloadUrl = "https://github.com/openvinotoolkit/model_server/releases/download/v${Version}/ovms_windows_${Version}_python_on.zip"
    $tempZip = Join-Path $env:TEMP "ovms_windows_${Version}_python_on.zip"

    Write-Host "`nDownloading OVMS v${Version} package (with Python support)..." -ForegroundColor Cyan
    Write-Host "URL: $downloadUrl"

    # Use curl.exe or Invoke-WebRequest for reliable large download
    if (Get-Command 'curl.exe' -ErrorAction SilentlyContinue) {
        & curl.exe -fL "$downloadUrl" -o "$tempZip"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to download OVMS package via curl (exit code $LASTEXITCODE)."
        }
    } else {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    }

    Write-Host "Extracting package to temporary staging..." -ForegroundColor Cyan
    $stagingDir = Join-Path $env:TEMP "ovms_stage_$([guid]::NewGuid().ToString('N'))"
    if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }

    Expand-Archive -Path $tempZip -DestinationPath $stagingDir -Force

    # OVMS archive contains an 'ovms' root folder
    $sourceDir = if (Test-Path (Join-Path $stagingDir 'ovms\ovms.exe')) {
        Join-Path $stagingDir 'ovms'
    } else {
        $stagingDir
    }

    Write-Host "Copying files to $InstallDir..." -ForegroundColor Cyan
    Copy-Item -Path "$sourceDir\*" -Destination $InstallDir -Recurse -Force

    # Clean up temporary archive and staging directory
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 4. Install required Python packages inside embedded Python runtime
$embeddedPython = Join-Path $InstallDir 'python\python.exe'
if (Test-Path $embeddedPython) {
    Write-Host "`nVerifying embedded Python packages (numpy, jinja2, markupsafe)..." -ForegroundColor Cyan
    & "$embeddedPython" -m pip install numpy "Jinja2==3.1.6" "MarkupSafe==3.0.2" --quiet --no-warn-script-location
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Embedded Python dependencies verified." -ForegroundColor Green
    } else {
        Write-Warning "Pip install completed with exit code $LASTEXITCODE."
    }
} else {
    Write-Warning "Embedded Python executable not found at $embeddedPython."
}

# 5. Smoke test OVMS binary
Write-Host "`nVerifying OVMS executable..." -ForegroundColor Cyan
$setupvarsScript = Join-Path $InstallDir 'setupvars.ps1'
if (Test-Path $setupvarsScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "
        Set-Location -LiteralPath '$InstallDir'
        . .\setupvars.ps1
        .\ovms.exe --version
    "
} else {
    & "$ovmsExePath" --version
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== OVMS deployed successfully to $InstallDir ===" -ForegroundColor Green
} else {
    throw "OVMS verification failed with exit code $LASTEXITCODE."
}

Read-Host 'Press Enter to close this window'
