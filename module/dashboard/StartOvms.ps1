[CmdletBinding()]
param(
    [string]$InstallDir = 'D:\Program Files\ovms',
    [string]$ModelDir = 'D:\Models\OpenVINO\Qwen2.5-Coder-3B-Instruct-int4-ov',
    [string]$ModelName,
    [string]$Device,
    [int]$RestPort,
    [int]$Port,
    [ValidateSet('DEBUG', 'INFO', 'ERROR')]
    [string]$LogLevel,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$settingsPath = Join-Path $PSScriptRoot 'local.settings.json'
if (-not (Test-Path -LiteralPath $settingsPath)) {
    throw "Dashboard settings not found: $settingsPath"
}

$settings = (Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json).Values
if (-not $settings) {
    throw "No Values object found in $settingsPath"
}

if (-not $ModelDir) {
    $ModelDir = $settings.LLM_MODEL
    if (-not $ModelDir) { $ModelDir = $settings.OPENVINO_MODEL_DIR }
}
if (-not $ModelDir) {
    throw "Set LLM_MODEL or OPENVINO_MODEL_DIR in $settingsPath."
}
if (-not $ModelName) { $ModelName = Split-Path -Path $ModelDir -Leaf }
if (-not $Device) { $Device = $settings.OPENVINO_DEVICE ?? 'GPU' }
if ($RestPort -le 0) {
    $RestPort = if ($settings.OVMS_REST_PORT) { [int]$settings.OVMS_REST_PORT } else { 8000 }
}
if ($Port -le 0) {
    $Port = if ($settings.OVMS_PORT) { [int]$settings.OVMS_PORT } else { 9000 }
}

if (-not $LogLevel) {
    $configuredLogLevel = [string]$settings.OPENVINO_LOG_LEVEL
    if ($configuredLogLevel -match '^(DEBUG|INFO|ERROR)$') {
        $LogLevel = $configuredLogLevel.ToUpperInvariant()
    } elseif ($configuredLogLevel -match '^\d+$') {
        $numericLogLevel = [int]$configuredLogLevel
        $LogLevel = if ($numericLogLevel -ge 4) { 'DEBUG' } elseif ($numericLogLevel -ge 3) { 'INFO' } else { 'ERROR' }
    } else {
        $LogLevel = 'INFO'
    }
}

$ovmsExe = Join-Path $InstallDir 'ovms.exe'
$setupvars = Join-Path $InstallDir 'setupvars.ps1'
if (-not (Test-Path -LiteralPath $ovmsExe)) {
    throw "OVMS was not found at $ovmsExe. Run DeployOvms.ps1 first."
}
if (-not (Test-Path -LiteralPath $ModelDir -PathType Container)) {
    throw "Model directory does not exist: $ModelDir"
}
if (-not (Test-Path -LiteralPath $setupvars)) {
    throw "OVMS environment setup script not found: $setupvars"
}

$tcpClient = [System.Net.Sockets.TcpClient]::new()
try {
    $tcpClient.Connect('127.0.0.1', $RestPort)
    throw "REST port $RestPort is already in use. Stop the existing service or choose another OVMS_REST_PORT."
} catch [System.Net.Sockets.SocketException] {
    # A refused connection means the REST port is available.
} finally {
    $tcpClient.Dispose()
}

. $setupvars

$arguments = @(
    '--model_path', "`"$ModelDir`"",
    '--model_name', $ModelName,
    '--task', 'text_generation',
    '--target_device', $Device,
    '--rest_port', [string]$RestPort,
    '--port', [string]$Port,
    '--log_level', $LogLevel,
    '--tool_parser', 'hermes3',
    '--cache_dir', "D:\models\.ov_cache",
    '--enable_prefix_caching', 'true'
)

Write-Host "Starting OVMS with model '$ModelName' on $Device..." -ForegroundColor Cyan
Write-Host "REST endpoint: http://127.0.0.1:$RestPort"
$process = Start-Process -FilePath $ovmsExe -ArgumentList $arguments -WorkingDirectory $InstallDir -NoNewWindow -PassThru

$ready = $false
$deadline = [DateTime]::UtcNow.AddMinutes(5)
$healthEndpoints = @(
    "http://127.0.0.1:$RestPort/v1/config",
    "http://127.0.0.1:$RestPort/v1/models",
    "http://127.0.0.1:$RestPort/v3/models"
)
while ([DateTime]::UtcNow -lt $deadline) {
    if ($process.HasExited) {
        throw "OVMS exited during startup with code $($process.ExitCode)."
    }
    foreach ($endpoint in $healthEndpoints) {
        try {
            $null = Invoke-WebRequest -Uri $endpoint -TimeoutSec 2 -UseBasicParsing
            $ready = $true
            break
        } catch {
            # Keep polling while OVMS initializes the model and REST server.
        }
    }
    if ($ready) { break }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    throw "OVMS did not become ready within five minutes. Check startup output and model/device compatibility."
}

Write-Host "OVMS is ready at http://127.0.0.1:$RestPort" -ForegroundColor Green
if (-not $Background) {
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "OVMS exited with code $($process.ExitCode)."
    }
}
