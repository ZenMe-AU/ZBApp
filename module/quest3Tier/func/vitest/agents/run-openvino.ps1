[CmdletBinding()]
param(
    [string]$ModelDir = 'D:\Models\Qwen2.5-Coder-3B-Instruct-int4-ov',
    [string]$Device = 'GPU',
    [switch]$SmokeOnly,
    [switch]$ViewerOnly
)

$ErrorActionPreference = 'Stop'

Write-Host "Verifying OpenVINO model directory at $ModelDir..."
if (-not (Test-Path $ModelDir)) {
    throw "Model directory '$ModelDir' does not exist. Please check the path."
}

Write-Host "Testing OpenVINO model in-process on $Device with openvino-genai-node..."
$testScript = @"
const path = require('node:path');
const { existsSync } = require('node:fs');

async function smokeTest() {
  const modelDir = process.env.OPENVINO_MODEL_DIR;
  const preferredDevice = process.env.OPENVINO_DEVICE || 'GPU';
  let genaiNode;
  try {
    genaiNode = require('openvino-genai-node');
  } catch {
    genaiNode = require(path.resolve(__dirname || process.cwd(), 'module/quest3Tier/func/node_modules/openvino-genai-node'));
  }
  const { LLMPipeline, StructuredOutputConfig } = genaiNode;

  console.log('[Smoke] Initializing pipeline on ' + preferredDevice + '...');
  let pipe;
  try {
    pipe = await LLMPipeline(modelDir, preferredDevice);
  } catch (err) {
    if (preferredDevice !== 'CPU') {
      console.warn('[Smoke] Failed on ' + preferredDevice + ' (' + (err && err.message || err) + '). Retrying on CPU...');
      pipe = await LLMPipeline(modelDir, 'CPU');
    } else {
      throw err;
    }
  }

  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok']
  };

  const structConfig = new StructuredOutputConfig({ json_schema: JSON.stringify(schema) });
  const prompt = '<|im_start|>system\nReply with only one JSON object matching this schema:\n' + JSON.stringify(schema) + '<|im_end|>\n<|im_start|>user\nReturn {\"ok\":true}.<|im_end|>\n<|im_start|>assistant\n';

  const res = await pipe.generate(prompt, {
    max_new_tokens: 32,
    structured_output_config: structConfig
  });

  const text = res.texts && res.texts[0] ? res.texts[0].trim() : '';
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Model did not return JSON: ' + text);
  }
  const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
  if (parsed.ok !== true) {
    throw new Error('Model JSON smoke test returned unexpected value: ' + text);
  }
  console.log('[Smoke] OpenVINO JSON smoke test passed.');
}

smokeTest().catch((err) => {
  console.error('[Smoke Error]', err);
  process.exit(1);
});
"@

$env:OPENVINO_MODEL_DIR = $ModelDir
$env:OPENVINO_DEVICE = $Device

Push-Location (Join-Path $PSScriptRoot '../../../../..')
try {
    node -e $testScript
    if ($LASTEXITCODE -ne 0) {
        throw "OpenVINO smoke test failed."
    }
    if ($SmokeOnly) { return }

    $savedEnvironment = @{}
    foreach ($name in @('LLM_PROVIDER', 'OPENVINO_MODEL_DIR', 'OPENVINO_DEVICE', 'AGENT_RUN')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    $env:LLM_PROVIDER = 'openvino'
    $env:OPENVINO_MODEL_DIR = $ModelDir
    $env:OPENVINO_DEVICE = $Device
    $env:AGENT_RUN = '1'

    Write-Host 'Building Q3 and the agent viewer...'
    & pnpm --dir module/quest3Tier/func run build
    if ($LASTEXITCODE -ne 0) {
        throw "Q3 build failed with exit code $LASTEXITCODE."
    }
    & pnpm exec tsc --project module/quest3Tier/func/vitest/agents/tsconfig.json
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
    & node module/quest3Tier/func/dist/vitest/agents/viewer/server.mjs
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
