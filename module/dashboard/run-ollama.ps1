[CmdletBinding()]
param(
    [string]$Model,
    [string]$OllamaUrl,
    [switch]$SmokeOnly,
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

if (-not $OllamaUrl) {
    if ($settingsValues.ContainsKey('LLM_BASE_URL') -and $settingsValues['LLM_BASE_URL']) {
        $OllamaUrl = $settingsValues['LLM_BASE_URL'].TrimEnd('/').Replace('/v1', '')
    }
    elseif ($env:LLM_BASE_URL) {
        $OllamaUrl = $env:LLM_BASE_URL.TrimEnd('/').Replace('/v1', '')
    }
    else {
        $OllamaUrl = 'http://localhost:11434'
    }
}

if (-not $Model) {
    if ($settingsValues.ContainsKey('AGENT_MODEL') -and $settingsValues['AGENT_MODEL']) {
        $Model = $settingsValues['AGENT_MODEL']
    }
    elseif ($settingsValues.ContainsKey('LLM_MODEL') -and $settingsValues['LLM_MODEL']) {
        $Model = $settingsValues['LLM_MODEL']
    }
    elseif ($env:AGENT_MODEL) {
        $Model = $env:AGENT_MODEL
    }
    elseif ($env:LLM_MODEL) {
        $Model = $env:LLM_MODEL
    }
    else {
        $Model = 'qwen2.5:3b'
    }
}

$baseUrl = $OllamaUrl.TrimEnd('/')

Write-Host "Checking Ollama at $baseUrl..."
try {
    $models = Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 10
}
catch {
    throw "Cannot reach Ollama at $baseUrl. Start Ollama (ollama serve), then retry. $($_.Exception.Message)"
}
if ($Model -notin $models.models.name) {
    throw "Model '$Model' is not installed. Run: ollama pull $Model"
}

Write-Host "Testing $Model through the OpenAI-compatible endpoint..."
$request = @{
    model = $Model
    messages = @(
        @{ role = 'system'; content = 'Reply with only one JSON object that matches this JSON Schema, no other text: {"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}' }
        @{ role = 'user'; content = 'Return {"ok":true}.' }
    )
} | ConvertTo-Json -Depth 10
$response = Invoke-RestMethod -Uri "$baseUrl/v1/chat/completions" -Method Post -ContentType 'application/json' -Body $request -TimeoutSec 180
$text = [string]$response.choices[0].message.content
$firstBrace = $text.IndexOf('{')
$lastBrace = $text.LastIndexOf('}')
if ($firstBrace -lt 0 -or $lastBrace -lt $firstBrace) {
    throw "Ollama did not return a JSON object: $text"
}
$reply = $text.Substring($firstBrace, $lastBrace - $firstBrace + 1) | ConvertFrom-Json
if ($reply.ok -ne $true) {
    throw "Ollama JSON smoke test failed: $text"
}
Write-Host 'Ollama JSON smoke test passed.'
if ($SmokeOnly) { return }

$savedEnvironment = @{}
foreach ($name in @('LLM_BASE_URL', 'LLM_API_KEY', 'AGENT_MODEL', 'JUDGE_MODEL', 'AGENT_RUN')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
Push-Location (Join-Path $PSScriptRoot '../..')
try {
    $env:LLM_BASE_URL = "$baseUrl/v1"
    $env:AGENT_MODEL = $Model
    $env:JUDGE_MODEL = $Model
    $env:AGENT_RUN = '1'
    Remove-Item Env:LLM_API_KEY -ErrorAction SilentlyContinue
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
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
}