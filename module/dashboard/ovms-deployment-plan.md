# OVMS Baremetal Deployment and Startup Plan for Dashboard

## Overview

Deploy OpenVINO Model Server (OVMS) baremetal on Windows 11 into `D:\Program Files\ovms` to serve local GenAI LLM models (stored in `D:\Models\OpenVINO`) through OpenAI-compatible REST endpoints (`/v3/chat/completions` and `/v1/models`), configured dynamically from `module/dashboard/local.settings.json`.

---

## 1. Technical Findings & Prerequisites

### 1.1 Package & Version Details
- **OVMS Windows Version**: `v2026.4.1` (Latest official release from `openvinotoolkit/model_server`).
- **Archive Flavor**: `ovms_windows_2026.4.1_python_on.zip` (Required for LLM chat templates and Jinja2 tokenizers).
- **Download URL**: `https://github.com/openvinotoolkit/model_server/releases/download/v2026.4.1/ovms_windows_2026.4.1_python_on.zip` (~140 MB).
- **Target Installation Directory**: `D:\Program Files\ovms`

### 1.2 Python Runtime & Dependencies
- **System Python Tooling**: `pymanager` / `py` launcher is installed on the host.
- **Python Version Required**: **Python 3.12 (64-bit)** (`python312.dll` is embedded and linked by OVMS Windows binaries).
  - Python 3.12.10 has already been installed via `py install -y 3.12`.
  - The embedded package contains `python.exe`, `python312.dll`, `pyovms.pyd`, `Jinja2 (3.1.6)`, `MarkupSafe (3.0.2)`, `setuptools (80.9.0)`, and `pip (26.2.1)`.
  - Additional pip package required for OpenVINO Python calculators/nodes: `numpy` (tested and installs cleanly via `python -m pip install numpy`).

### 1.3 Environment & Runtime Initialization
- Running `setupvars.ps1` in the extracted `ovms` directory (`D:\Program Files\ovms`) sets:
  - `$env:OVMS_DIR = $PSScriptRoot`
  - `$env:PYTHONHOME = "$env:OVMS_DIR\python"`
  - `$env:SCRIPTS = "$env:OVMS_DIR\python\Scripts"`
  - `$env:PATH = "$env:OVMS_DIR;$env:PYTHONHOME;$env:SCRIPTS;$env:PATH"`
  - `$env:ESPEAK_DATA_PATH = "$env:OVMS_DIR\espeak-ng-data"`

### 1.4 Model Repository & Configuration
- **Model Path**: Models reside in `D:\Models\OpenVINO` (e.g. `D:\Models\OpenVINO\Qwen3.5-9B-int4-ov`).
- **Configuration Source**: `module/dashboard/local.settings.json`:
  - `Values.LLM_MODEL`: e.g. `D:\Models\OpenVINO\Qwen3.5-9B-int4-ov`
  - `Values.OPENVINO_DEVICE`: `GPU` (or `CPU`, `NPU`)
  - `Values.OPENVINO_LOG_LEVEL`: `5` (or mapped to OVMS log levels: `INFO`, `DEBUG`, `ERROR`)
  - `Values.OVMS_REST_PORT` / `Values.OVMS_PORT`: default REST port `8000`, gRPC port `9000`.

---

## 2. File Specifications

### 2.1 `module/dashboard/DeployOvms.ps1`

**Purpose**: Download, extract, verify, and configure OVMS baremetal into `D:\Program Files\ovms`. Automatically self-elevates to Administrator if not already elevated.

**Parameters**:
- `[string]$InstallDir = "D:\Program Files\ovms"`
- `[string]$Version = "2026.4.1"`
- `[switch]$Force` (re-download and re-extract if already present).
- `[switch]$SkipPythonCheck`

**Steps**:
1. **Self-Elevation**:
   - Check if current process identity has Administrator rights:
     ```powershell
     $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
     ```
   - If not elevated, restart the script with `-Verb RunAs` via `Start-Process pwsh` (or `powershell.exe`), forwarding all bound arguments, wait for exit, and propagate exit code.
2. **Python Check**:
   - Verify `py -3.12 --version` or Python 3.12 availability.
   - If missing, trigger `py install -y 3.12` via `pymanager`.
3. **Directory Creation & Extraction**:
   - Ensure target directory `D:\Program Files\ovms` exists.
   - If `$InstallDir\ovms.exe` is absent or `$Force` is specified:
     - Download `ovms_windows_${Version}_python_on.zip` from GitHub Releases to `$env:TEMP`.
     - Extract package directly into `D:\Program Files\ovms`.
4. **Dependency Setup**:
   - Execute `& "$InstallDir\python\python.exe" -m pip install numpy` inside the embedded Python runtime.
   - Confirm setupvars script is valid and callable.
5. **Smoke Test & Verification**:
   - Execute `& "$InstallDir\ovms.exe" --version` and display build/backend info.
   - Output confirmation of successful installation.

---

### 2.2 `module/dashboard/StartOvms.ps1`

**Purpose**: Start the OVMS process serving the active GenAI model defined in `local.settings.json`.

**Parameters**:
- `[string]$InstallDir = "D:\Program Files\ovms"`
- `[string]$ModelDir` (optional override; defaults to `local.settings.json` -> `LLM_MODEL` or `OPENVINO_MODEL_DIR`).
- `[string]$ModelName` (optional override; defaults to leaf folder name of `$ModelDir`).
- `[string]$Device` (optional override; defaults to `local.settings.json` -> `OPENVINO_DEVICE` or `GPU`).
- `[int]$RestPort = 8000` (optional override; defaults to `OVMS_REST_PORT` or `8000`).
- `[int]$Port = 9000` (optional gRPC port; defaults to `0` or `9000`).
- `[string]$LogLevel = "INFO"` (mapped from `OPENVINO_LOG_LEVEL`).
- `[switch]$Background` (start as background job or persistent console).

**Steps**:
1. **Load Configuration**:
   - Read `$PSScriptRoot\local.settings.json`.
   - Parse `Values.LLM_MODEL`, `Values.OPENVINO_MODEL_DIR`, `Values.OPENVINO_DEVICE`, and `Values.OPENVINO_LOG_LEVEL`.
2. **Validate Model & Binaries**:
   - Verify `D:\Program Files\ovms\ovms.exe` exists (prompt user to run `DeployOvms.ps1` if missing).
   - Validate model directory exists in `D:\Models\OpenVINO` (e.g. `D:\Models\OpenVINO\Qwen3.5-9B-int4-ov`).
   - Extract servable model name (e.g. `Qwen3.5-9B-int4-ov`).
3. **Environment Setup**:
   - Invoke `D:\Program Files\ovms\setupvars.ps1` to set `PATH`, `PYTHONHOME`, `ESPEAK_DATA_PATH`.
4. **Launch Command**:
   - Construct and execute OVMS command:
     ```powershell
     & "$InstallDir\ovms.exe" `
         --model_path "$ModelDir" `
         --model_name "$ModelName" `
         --task text_generation `
         --target_device "$Device" `
         --rest_port $RestPort `
         --port $Port `
         --log_level "$LogLevel"
     ```
5. **Health Check**:
   - Query endpoint `http://127.0.0.1:$RestPort/v1/config` or `/v1/models/$ModelName` until HTTP 200 is returned.

---

### 2.3 Integration with Dashboard & VS Code

1. **System Path / Repository Independence**:
   - Deploying directly to `D:\Program Files\ovms` keeps large binaries and runtime files entirely external to the git repository.
2. **VS Code Tasks (`module/dashboard/.vscode/tasks.json`)**:
   - Add task `Deploy OVMS`: `pwsh -NoProfile -File "${workspaceFolder}/DeployOvms.ps1"`
   - Add task `Start OVMS`: `pwsh -NoProfile -File "${workspaceFolder}/StartOvms.ps1"`
3. **Dashboard LLM Provider Integration**:
   - Allows `OpenaiCompatibleProvider` to connect directly to OVMS via `http://localhost:8000/v3` (OpenAI API spec `/chat/completions`).
