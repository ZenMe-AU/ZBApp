#!/bin/bash

set +x
echo "Checking for PowerShell..."

# Check if pwsh exists
if which pwsh >/dev/null 2>&1; then
    echo "PowerShell is already installed."
else
    echo "PowerShell is not installed. Installing PowerShell..."
    # Install PowerShell
    if [ "$(uname)" = "Darwin" ]; then
        brew install powershell
    else
        sudo apt-get update
        sudo apt-get install -y powershell
    fi
fi

echo "Rechecking PowerShell installation..."
if which pwsh >/dev/null 2>&1; then
    echo "PowerShell installed successfully."
else
    echo "Failed to install PowerShell."
    exit 1
fi

echo "Continuing with deployment of local dependencies in PowerShell..."
cd "$(dirname "$0")/deploy"
pwsh -NoProfile -File ./deploy.ps1 -Stages Install-AllDevAiTools
