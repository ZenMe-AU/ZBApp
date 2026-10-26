[CmdletBinding()]
param(
    [string]$ModelDir,
    [string]$Device,
    [string]$LogLevel,
    [switch]$ViewerOnly
)

$ErrorActionPreference = 'Stop'

# Load LLM settings from local.settings.json as the single source of truth,
# falling back to environment variables or defaults when unspecified.
$localSettingsPath = Join-Path $PSScriptRoot 'local.settings.json'
$settingsValues = @{}
if (Test-Path $localSettingsPath) {
    try {
        $parsedJson = Get-Content -Raw $localSettingsPath | ConvertFrom-Json
        if ($parsedJson.Values) {
            foreach ($prop in $parsedJson.Values.PSObject.Properties) {
                $settingsValues[$prop.Name] = [string]$prop.Value
            }
        }
    }
    catch {
        Write-Warning "Could not parse local.settings.json: $($_.Exception.Message)"
    }
}

if (-not $ModelDir) {
    if ($settingsValues.ContainsKey('LLM_MODEL') -and $settingsValues['LLM_MODEL']) {
        $ModelDir = $settingsValues['LLM_MODEL']
    }
    elseif ($settingsValues.ContainsKey('OPENVINO_MODEL_DIR') -and $settingsValues['OPENVINO_MODEL_DIR']) {
        $ModelDir = $settingsValues['OPENVINO_MODEL_DIR']
    }
    elseif ($env:LLM_MODEL) {
        $ModelDir = $env:LLM_MODEL
    }
    elseif ($env:OPENVINO_MODEL_DIR) {
        $ModelDir = $env:OPENVINO_MODEL_DIR
    }
    else {
        $ModelDir = 'D:\Models\OpenVINO\Qwen3.5-9B-int4-ov'
    }
}

if (-not $Device) {
    if ($settingsValues.ContainsKey('OPENVINO_DEVICE') -and $settingsValues['OPENVINO_DEVICE']) {
        $Device = $settingsValues['OPENVINO_DEVICE']
    }
    elseif ($env:OPENVINO_DEVICE) {
        $Device = $env:OPENVINO_DEVICE
    }
    else {
        $Device = 'GPU'
    }
}

if (-not $LogLevel) {
    if ($settingsValues.ContainsKey('OPENVINO_LOG_LEVEL') -and $settingsValues['OPENVINO_LOG_LEVEL']) {
        $LogLevel = $settingsValues['OPENVINO_LOG_LEVEL']
    }
    elseif ($env:OPENVINO_LOG_LEVEL) {
        $LogLevel = $env:OPENVINO_LOG_LEVEL
    }
    else {
        $LogLevel = '4'
    }
}

$env:OPENVINO_LOG_LEVEL = $LogLevel

Write-Host "Verifying OpenVINO model directory at $ModelDir..."
if (-not (Test-Path $ModelDir)) {
    throw "Model directory '$ModelDir' does not exist. Please check the path."
}

Push-Location (Join-Path $PSScriptRoot '../..')
try {
    $savedEnvironment = @{}
    foreach ($name in @('LLM_PROVIDER', 'LLM_MODEL', 'OPENVINO_MODEL_DIR', 'OPENVINO_DEVICE', 'AGENT_RUN')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    $env:LLM_PROVIDER = 'openvino'
    $env:LLM_MODEL = $ModelDir
    $env:OPENVINO_MODEL_DIR = $ModelDir
    $env:OPENVINO_DEVICE = $Device
    $env:AGENT_RUN = '1'

    Write-Host 'Building Q3 and the agent viewer...'
    & pnpm --dir module/quest3Tier/func run build
    if ($LASTEXITCODE -ne 0) {
        throw "Q3 build failed with exit code $LASTEXITCODE."
    }
    & pnpm --dir module/dashboard run build
    if ($LASTEXITCODE -ne 0) {
        throw "Viewer build failed with exit code $LASTEXITCODE."
    }

    $viewerPort = if ($env:AGENT_VIEW_PORT) { [int]$env:AGENT_VIEW_PORT } else { 4178 }
    $viewerUrl = "http://127.0.0.1:$viewerPort"
    $viewerRunning = $false
    try {
        $viewerState = Invoke-RestMethod -Uri "$viewerUrl/api/run" -TimeoutSec 3
        $viewerRunning = $null -ne $viewerState.status
    }
    catch {
        $viewerRunning = $false
    }
    if ($viewerRunning) {
        throw "A viewer is already running at $viewerUrl. Close its Node window first, then rerun this script to see its output here."
    }

    Write-Host "Start the test from the viewer UI at $viewerUrl. The Q3 API must already be running."
    Write-Host 'Viewer and test output will appear here. Press Ctrl+C to stop the viewer.'
    & node module/dashboard/dist/viewer/server.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Viewer exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    if ($savedEnvironment) {
        foreach ($name in $savedEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
        }
    }
}
