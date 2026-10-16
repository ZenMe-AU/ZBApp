#
# @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
# @license SPDX-License-Identifier: MIT
#
# This module provide functions to set the desired state for local tools that allow the other scripts to function.
#

function Install-DevTools {
    Install-SelectedTools @(
        [pscustomobject]@{ Name = 'Node.js and npm';        Command = 'Install-NodeJsAndNpm';         Default = $true }
        [pscustomobject]@{ Name = 'pnpm';                   Command = 'Install-Pnpm';                 Default = $true }
        [pscustomobject]@{ Name = 'Terraform';              Command = 'Install-Terraform';            Default = $true }
        [pscustomobject]@{ Name = 'PostgreSQL';             Command = 'Install-PostgreSql';           Default = $true }
        [pscustomobject]@{ Name = 'AWS CLI';                Command = 'Install-AwsCli';               Default = $true }
        [pscustomobject]@{ Name = 'Azure CLI';              Command = 'Install-AzureCli';             Default = $true }
        [pscustomobject]@{ Name = 'Azure Storage Explorer'; Command = 'Install-AzureStorageExplorer'; Default = $true }
        [pscustomobject]@{ Name = 'GitHub CLI';             Command = 'Install-GitHubCli';            Default = $true }
    )
}

function Install-DevAiTools {
    Install-SelectedTools @(
        [pscustomobject]@{ Name = 'Node.js and npm';        Command = 'Install-NodeJsAndNpm';         Default = $true }
        [pscustomobject]@{ Name = 'pnpm';                   Command = 'Install-Pnpm';                 Default = $true }
        [pscustomobject]@{ Name = 'Terraform';              Command = 'Install-Terraform';            Default = $true }
        [pscustomobject]@{ Name = 'AWS CLI';                Command = 'Install-AwsCli';               Default = $true }
        [pscustomobject]@{ Name = 'Azure CLI';              Command = 'Install-AzureCli';             Default = $true }
        [pscustomobject]@{ Name = 'Azure Storage Explorer'; Command = 'Install-AzureStorageExplorer'; Default = $true }
        [pscustomobject]@{ Name = 'ripgrep';                Command = 'Install-Ripgrep';              Default = $true }
        [pscustomobject]@{ Name = 'fd';                     Command = 'Install-Fd';                   Default = $true }
        [pscustomobject]@{ Name = 'jq';                     Command = 'Install-Jq';                   Default = $true }
        [pscustomobject]@{ Name = 'yq';                     Command = 'Install-Yq';                   Default = $true }
        [pscustomobject]@{ Name = 'PostgreSQL';             Command = 'Install-PostgreSql';           Default = $false }
        [pscustomobject]@{ Name = 'GitHub CLI';             Command = 'Install-GitHubCli';            Default = $true }
        [pscustomobject]@{ Name = 'GitHub Copilot CLI';     Command = 'Install-GitHubCopilotCli';     Default = $false }
        [pscustomobject]@{ Name = 'Claude Code';            Command = 'Install-ClaudeCode';           Default = $false }
        [pscustomobject]@{ Name = 'Packer';                 Command = 'Install-Packer';               Default = $false }
        [pscustomobject]@{ Name = 'Docker CLI';             Command = 'Install-DockerCli';            Default = $false }
        [pscustomobject]@{ Name = 'Ollama';                 Command = 'Install-Ollama';               Default = $false }
        [pscustomobject]@{ Name = 'Ollama models';          Command = 'Install-OllamaModels';         Default = $false }
    )
}

function Install-Pnpm {
    # Ensure pnpm is installed and setup
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Output "pnpm is not installed. Installing pnpm globally using npm..."
        if ($script:IsMacOS) {
            Write-Output "MacOS requires sudo to globally install: npm install -g pnpm"
            Write-Output "Please enter your password."
            sudo npm install -g pnpm
        } elseif ($script:IsUbuntu) {
            Write-Output "Ubuntu requires sudo to globally install pnpm: npm install -g pnpm"
            sudo npm install -g pnpm
        } else {
            npm install -g pnpm
        }
        if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
            Write-Error "pnpm installation failed. Please install pnpm manually."
            return 1
        }
    }
    Write-Output "pnpm is installed."
    # Check if pnpm is properly set up by running 'pnpm setup'
    try {
        pnpm setup --help > $null 2>&1
    } catch {
        Write-Output "pnpm is installed but not properly set up. Running 'pnpm setup'..."
        pnpm setup
        if ($LASTEXITCODE -ne 0) {
            Write-Error "pnpm setup failed. Please run 'pnpm setup' manually."
            return 1
        }
    }
    Write-Output "Check pnpm version"
    $pnpmRequiredVersion = [version]"10.20.0"
    $pnpmVersionOutput = pnpm --version 2>$null
    if ($pnpmVersionOutput) {
        $pnpmVersion = [version]($pnpmVersionOutput.Trim())
        if ($pnpmVersion -lt $pnpmRequiredVersion) {
            Write-Output "pnpm version $pnpmVersion is less than required $pnpmRequiredVersion. Upgrading pnpm globally using npm..."
            npm install -g pnpm
            $pnpmVersionOutput = & pnpm --version 2>$null
            $pnpmVersion = [version]($pnpmVersionOutput.Trim())
            if ($pnpmVersion -lt $pnpmRequiredVersion) {
                Write-Error "pnpm upgrade failed or version is still less than $pnpmRequiredVersion. Please upgrade pnpm manually."
                return 1
            }
        } else {
            Write-Output "pnpm is installed and version $pnpmVersion meets the minimum required version $pnpmRequiredVersion."
        }
    }
    Install-PnpmCompletion
}

function Install-PnpmCompletion {
    try {
        if ($script:IsWindows) {
            $shellName = 'pwsh'
        } elseif ($script:IsMacOS) {
            $shellName = if ($env:SHELL) { Split-Path $env:SHELL -Leaf } else { 'zsh' }
        } elseif ($script:IsUbuntu) {
            $shellName = if ($env:SHELL) { Split-Path $env:SHELL -Leaf } else { 'bash' }
        } else {
            Write-Warning "Unsupported OS for automatic pnpm completion setup. Please run 'pnpm completion <shell>' manually."
            return
        }

        switch ($shellName) {
            'zsh'  { $profilePath = Join-Path $HOME '.zshrc';  $completionFile = Join-Path $HOME '.pnpm-completion.zsh' }
            'bash' { $profilePath = Join-Path $HOME $(if ($script:IsMacOS) { '.bash_profile' } else { '.bashrc' }); $completionFile = Join-Path $HOME '.pnpm-completion.bash' }
            'pwsh' { $profilePath = $PROFILE;                  $completionFile = Join-Path $HOME '.pnpm-completion.ps1' }
            default {
                Write-Warning "Unsupported shell '$shellName' for pnpm completion. Please run 'pnpm completion <shell>' manually."
                return
            }
        }

        Write-Output "Installing pnpm completion for $shellName..."
        $generated = (pnpm completion $shellName) -join "`n"
        if ($LASTEXITCODE -ne 0 -or -not $generated) { throw "pnpm completion $shellName failed" }

        if ($shellName -eq 'pwsh') {
            $marker = '$RequestComp="$Program completion-server"'
            $filterAware = @'
$Filter = $null
    $FilterDir = $null
    $Tokens = "$Arguments" -split '\s+'
    for ($i = 0; $i -lt $Tokens.Count; $i++) {
        if (($Tokens[$i] -eq '--filter' -or $Tokens[$i] -eq '-F') -and $i + 1 -lt $Tokens.Count) { $Filter = $Tokens[$i + 1] }
        elseif ($Tokens[$i] -like '--filter=*') { $Filter = $Tokens[$i].Substring(9) }
    }
    if ($Filter) { $FilterDir = pnpm --filter $Filter ls --depth -1 --parseable 2>$null | Select-Object -First 1 }
    $RequestComp = if ($FilterDir) { "Push-Location -LiteralPath '$($FilterDir -replace "'", "''")'; $Program completion-server; Pop-Location" } else { "$Program completion-server" }
'@
            $sourceLine = ". `"$completionFile`""
        } else {
            $marker = 'pnpm completion-server'
            $filterAware = '_pnpm_filter_aware_completion_server'
            $wrapper = @'

_pnpm_filter_aware_completion_server() {
  local filter="" prev="" word dir
  for word in "$@"; do
    case "$prev" in --filter|-F) filter="$word" ;; esac
    case "$word" in --filter=*) filter="${word#--filter=}" ;; esac
    prev="$word"
  done
  if [ -n "$filter" ]; then
    dir=$(pnpm --filter "$filter" ls --depth -1 --parseable 2>/dev/null | head -n 1)
    if [ -n "$dir" ]; then
      (cd "$dir" && pnpm completion-server "$@")
      return
    fi
  fi
  pnpm completion-server "$@"
}
'@
            $sourceLine = "[ -f `"$completionFile`" ] && source `"$completionFile`""
        }

        if ($generated.Contains($marker)) {
            $generated = $generated.Replace($marker, $filterAware)
            if ($shellName -ne 'pwsh') { $generated += $wrapper }
        } else {
            Write-Warning "pnpm's completion template changed; installing plain completion without --filter support."
        }
        [System.IO.File]::WriteAllText($completionFile, $generated + "`n")

        if (-not (Test-Path $profilePath)) {
            New-Item -ItemType File -Path $profilePath -Force | Out-Null
        }
        if (Select-String -Path $profilePath -SimpleMatch $completionFile -Quiet) {
            Write-Output "pnpm completion already registered in $profilePath (regenerated $completionFile)."
        } else {
            Add-Content -Path $profilePath -Value "`n$sourceLine"
            Write-Output "Added pnpm completion to $profilePath. Open a new terminal to use it."
        }
    } catch {
        Write-Warning "pnpm shell completion was not installed: $_"
    }
}


function Get-RootFolder {
    $env:ROOT_FOLDER = Resolve-Path -Path ".."
    Write-Output "Set ROOT_FOLDER to $env:ROOT_FOLDER"
    Set-Location $env:ROOT_FOLDER
}

function Get-SudoPrefix {
    if ($env:USER -eq 'root') {
        return ''
    }
    return 'sudo '
}

# Ensure Node.js and npm is installed on Win and MacOs. If not, install with winget or homebrew.
# Check if Node.js and npm are installed
# TODO: Add nvm install first, then node, then npm, then pnpm.
function Install-NodeJsAndNpm {
    $nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
    $npmInstalled = Get-Command npm -ErrorAction SilentlyContinue
    $requiredNodeVersion = [version]"24.19.0"
    $nodeNeedsInstallOrUpgrade = $false
    if (-not $nodeInstalled -or -not $npmInstalled) {
        $nodeNeedsInstallOrUpgrade = $true
        Write-Output "Node.js or npm not found. Will install Node.js."
    } else {
        # Check Node.js version
        try {
            $nodeVersionOutput = node --version 2>$null
            if ($nodeVersionOutput) {
                Write-Output "Node.js version output: $nodeVersionOutput"
                $nodeVersionString = $nodeVersionOutput.TrimStart("vV").Trim()
                $nodeVersion = [version]$nodeVersionString
                if ($nodeVersion -lt $requiredNodeVersion) {
                    Write-Output "Node.js version $nodeVersion is less than required $requiredNodeVersion. Will upgrade Node.js."
                    $nodeNeedsInstallOrUpgrade = $true
                } else {
                    Write-Output "Node.js version $nodeVersion meets the minimum required version $requiredNodeVersion."
                }
            } else {
                Write-Output "Unable to determine Node.js version. Will install Node.js."
                $nodeNeedsInstallOrUpgrade = $true
            }
        } catch {
            Write-Output "Error checking Node.js version. Will install Node.js."
            $nodeNeedsInstallOrUpgrade = $true
        }
    }

    if ($nodeNeedsInstallOrUpgrade) {
        if ($script:IsWindows) {
            Write-Output "Installing or upgrading Node.js using winget..."
            winget install OpenJS.NodeJS.LTS --version 24.19.0 -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "Installing or upgrading Node.js using Homebrew..."
            Invoke-Brew install node@24
            Invoke-Brew link --overwrite --force node@24
        } elseif ($script:IsUbuntu) {
            Write-Output "Installing or upgrading Node.js using NodeSource on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc @"
            sudo apt-get purge nodejs -y
            sudo apt-get autoremove -y
            $sudo apt-get update -y && $sudo apt-get install -y curl ca-certificates gnupg
            curl -fsSL https://deb.nodesource.com/setup_24.x | $sudo -E bash -
            $sudo apt-get install -y nodejs
            which node && node --version
"@
        } else {
            Write-Warning "Unsupported OS for automatic Node.js installation. Please install Node.js version 24 manually."
            return 1
        }
        # Get the updated path from environment
        $Env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        # Re-check installation
        $nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
        $npmInstalled = Get-Command npm -ErrorAction SilentlyContinue
        if (-not $nodeInstalled -or -not $npmInstalled) {
            Write-Error "Node.js or npm installation failed. Please install them manually. Visit https://nodejs.org/en/download/ for installation instructions."
            return 1
        }
        # Confirm version
        $nodeVersionOutput = node --version 2>$null
        if ($nodeVersionOutput) {
            $nodeVersionString = $nodeVersionOutput.TrimStart("vV").Trim()
            $nodeVersion = [version]$nodeVersionString
            if ($nodeVersion -lt $requiredNodeVersion) {
                Write-Error "Node.js upgrade failed or version is still less than $requiredNodeVersion. Please upgrade Node.js manually."
                return 1
            }
        }
    }
    Write-Output "Node.js and npm are installed and meet the required version."
}

# Ensure Terraform is installed
function Install-Terraform {
    $terraformInstalled = Get-Command terraform -ErrorAction SilentlyContinue
    if (-not $terraformInstalled) {
        if ($script:IsWindows) {
            Write-Output "Terraform not found. Installing Terraform using winget..."
            winget install Hashicorp.Terraform -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "Terraform not found. Installing Terraform using Homebrew..."
            Invoke-Brew tap hashicorp/tap
            Invoke-Brew install hashicorp/tap/terraform
        } elseif ($script:IsUbuntu) {
            Write-Output "Terraform not found. Installing Terraform using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y gnupg software-properties-common curl"
            bash -lc "curl -fsSL https://apt.releases.hashicorp.com/gpg | $sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg"
            bash -lc "echo 'deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main' | $sudo tee /etc/apt/sources.list.d/hashicorp.list"
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y terraform"
        } else {
            Write-Warning "Unsupported OS for automatic Terraform installation. Please install Terraform manually."
            return 1
        }
        # Re-check installation
        $terraformInstalled = Get-Command terraform -ErrorAction SilentlyContinue
        if (-not $terraformInstalled) {
            Write-Error "Terraform installation failed. Please install it manually. Visit https://www.terraform.io/downloads.html for instructions."
            return 1
        }
    } else {
        Write-Output "Terraform is already installed."
    }
}

# Ensure Packer is installed
function Install-Packer {
    $packerInstalled = Get-Command packer -ErrorAction SilentlyContinue
    if (-not $packerInstalled) {
        if ($script:IsWindows) {
            Write-Output "Packer not found. Installing Packer using winget..."
            winget install -e --id Hashicorp.Packer
        } elseif ($script:IsMacOS) {
            # Future placeholder: install Packer using Homebrew.
            # Invoke-Brew tap hashicorp/tap
            # Invoke-Brew install hashicorp/tap/packer
        } elseif ($script:IsUbuntu) {
            # Future placeholder: install Packer using apt on Ubuntu.
            # $sudo = Get-SudoPrefix
            # bash -lc "$sudo apt-get update -y && $sudo apt-get install -y gnupg software-properties-common curl"
            # bash -lc "curl -fsSL https://apt.releases.hashicorp.com/gpg | $sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg"
            # bash -lc "echo 'deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main' | $sudo tee /etc/apt/sources.list.d/hashicorp.list"
            # bash -lc "$sudo apt-get update -y && $sudo apt-get install -y packer"
        } else {
            Write-Warning "Unsupported OS for automatic Packer installation. Please install Packer manually."
            return 1
        }
        # Re-check installation
        $packerInstalled = Get-Command packer -ErrorAction SilentlyContinue
        if (-not $packerInstalled) {
            Write-Error "Packer installation failed. Please install it manually. Visit https://developer.hashicorp.com/packer/downloads for instructions."
            return 1
        }
    } else {
        Write-Output "Packer is already installed."
    }
}

# Ensure Docker CLI is installed
function Install-DockerCli {
    $dockerCliInstalled = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCliInstalled) {
        if ($script:IsWindows) {
            Write-Output "Docker CLI not found. Installing Docker CLI using winget..."
            winget install Docker.DockerCLI
        } elseif ($script:IsMacOS) {
            # Future placeholder: install Docker CLI using Homebrew.
            # Invoke-Brew install docker
        } elseif ($script:IsUbuntu) {
            # Future placeholder: install Docker CLI using apt on Ubuntu.
            # $sudo = Get-SudoPrefix
            # bash -lc "$sudo apt-get update -y && $sudo apt-get install -y docker-cli"
        } else {
            Write-Warning "Unsupported OS for automatic Docker CLI installation. Please install Docker CLI manually."
            return 1
        }
        # Re-check installation
        $dockerCliInstalled = Get-Command docker -ErrorAction SilentlyContinue
        if (-not $dockerCliInstalled) {
            Write-Error "Docker CLI installation failed. Please install it manually. Visit https://docs.docker.com/engine/install/ for instructions."
            return 1
        }
    } else {
        Write-Output "Docker CLI is already installed."
    }
}

function Install-PostgreSql {
    # the default password is postgres
    if ($script:IsWindows) {
        $postgresqlInstalled = (Get-Service *postgres* -ErrorAction SilentlyContinue).Count -gt 0
    } else {
        $postgresqlInstalled = Get-Command psql -ErrorAction SilentlyContinue
    }
    if (-not $postgresqlInstalled) {
        if ($script:IsWindows) {
            Write-Output "postgresql not found. Installing postgresql using winget..."
            winget install PostgreSQL.PostgreSQL.18 -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "postgresql not found. Installing postgresql using Homebrew..."
            Invoke-Brew install postgresql
        } elseif ($script:IsUbuntu) {
            Write-Output "postgresql not found. Installing postgresql using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y postgresql"
        } else {
            Write-Warning "Unsupported OS for automatic postgresql installation. Please install postgresql manually."
            return 1
        }
        # Re-check installation
        $postgresqlInstalled = Get-Command psql -ErrorAction SilentlyContinue
        if (-not $postgresqlInstalled) {
            Write-Error "postgresql installation failed. Please install it manually. Visit https://www.postgresql.org/download/ for instructions."
            return 1
        }
    } else {
        Write-Output "postgresql is already installed."
    }
}

# Ensures AWS CLI is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-AwsCli {
    $awsCli = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $awsCli) {
        if ($script:IsWindows) {
            Write-Output "AWS CLI not found. Installing AWS CLI using winget..."
            winget install Amazon.AWSCLI -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "AWS CLI not found. Installing AWS CLI using Homebrew..."
            Invoke-Brew install awscli
        } elseif ($script:IsUbuntu) {
            Write-Output "AWS CLI not found. Installing AWS CLI using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y awscli"
        } else {
            Write-Warning "Unsupported OS for automatic AWS CLI installation. Please install AWS CLI manually."
            return 1
        }
        # Re-check installation
        $awsCli = Get-Command aws -ErrorAction SilentlyContinue
        if (-not $awsCli) {
            Write-Error "AWS CLI installation failed. Please install it manually. Visit https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html for instructions."
            return 1
        }
    } else {
        Write-Output "AWS CLI is already installed."
    }
}

# Ensures Azure CLI is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-AzureCli {
    $azCli = Get-Command az -ErrorAction SilentlyContinue
    if (-not $azCli) {
        if ($script:IsWindows) {
            Write-Output "Azure CLI not found. Installing Azure CLI using winget..."
            winget install Microsoft.AzureCLI -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "Azure CLI not found. Installing Azure CLI using Homebrew..."
            Invoke-Brew install azure-cli
        } elseif ($script:IsUbuntu) {
            Write-Output "Azure CLI not found. Installing Azure CLI using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "curl -sL https://aka.ms/InstallAzureCLIDeb | $sudo bash"
        } else {
            Write-Warning "Unsupported OS for automatic Azure CLI installation. Please install Azure CLI manually."
            return 1
        }
        # Re-check installation
        $azCli = Get-Command az -ErrorAction SilentlyContinue
        if (-not $azCli) {
            Write-Error "Azure CLI installation failed. Please install it manually. Visit https://learn.microsoft.com/cli/azure/install-azure-cli for instructions."
            return 1
        }
    } else {
        Write-Output "Azure CLI is already installed."
    }

    # Ensure 'account' extension is installed
    try {
        $accountExt = az extension show --name account 2>$null
    } catch {
        $accountExt = $null
    }
    if (-not $accountExt) {
        Write-Output "Azure CLI 'account' extension not found. Installing..."
        az extension add --name account
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install Azure CLI 'account' extension."
            return 1
        }
    } else {
        Write-Output "Azure CLI 'account' extension is already installed."
    }
}

# Ensures Azure Storage Explorer is installed (Windows: winget, Mac: brew)
function Install-AzureStorageExplorer {
    if ($script:IsWindows) {
        $installed = winget list --id Microsoft.AzureStorageExplorer -e --accept-source-agreements 2>$null
        if ($LASTEXITCODE -ne 0 -or -not ($installed -match 'Microsoft\.AzureStorageExplorer')) {
            Write-Output "Azure Storage Explorer not found. Installing using winget..."
            winget install --id Microsoft.Azure.StorageExplorer -e --silent --accept-source-agreements --accept-package-agreements
        } else {
            Write-Output "Azure Storage Explorer is already installed."
        }
    } elseif ($script:IsMacOS) {
        $installed = Invoke-Brew list --cask microsoft-azure-storage-explorer 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Output "Azure Storage Explorer not found. Installing using Homebrew..."
            Invoke-Brew install --cask microsoft-azure-storage-explorer
        } else {
            Write-Output "Azure Storage Explorer is already installed."
        }
    } else {
        Write-Warning "Automatic Azure Storage Explorer installation is not configured for this OS. Please install it manually from https://azure.microsoft.com/products/storage/storage-explorer/."
    }
}

# Ensures ripgrep (rg) is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-Ripgrep {
    $rg = Get-Command rg -ErrorAction SilentlyContinue
    if (-not $rg) {
        if ($script:IsWindows) {
            Write-Output "ripgrep (rg) not found. Installing ripgrep using winget..."
            winget install -e --id BurntSushi.ripgrep.MSVC --verbose
            if ($LASTEXITCODE -eq -1978335189) { $LASTEXITCODE = 0 } # Ignore "Package is already installed" error
        } elseif ($script:IsMacOS) {
            Write-Output "ripgrep (rg) not found. Installing ripgrep using Homebrew..."
            Invoke-Brew install ripgrep
        } elseif ($script:IsUbuntu) {
            Write-Output "ripgrep (rg) not found. Installing ripgrep using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y ripgrep"
        } else {
            Write-Warning "Unsupported OS for automatic ripgrep installation. Please install ripgrep manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        # Re-check installation
        $rg = Get-Command rg -ErrorAction SilentlyContinue
        if (-not $rg) {
            Write-Error "ripgrep installation failed. Please install it manually. Visit https://github.com/BurntSushi/ripgrep for instructions."
            return 1
        }
    } else {
        Write-Output "ripgrep (rg) is already installed."
    }
}

# Ensures fd is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-Fd {
    $fd = Get-Command fd -ErrorAction SilentlyContinue
    if (-not $fd) {
        if ($script:IsWindows) {
            Write-Output "fd not found. Installing fd using winget..."
            winget install sharkdp.fd -e --silent
            if ($LASTEXITCODE -eq -1978335189) { $LASTEXITCODE = 0 } # Ignore "Package is already installed" error
        } elseif ($script:IsMacOS) {
            Write-Output "fd not found. Installing fd using Homebrew..."
            Invoke-Brew install fd
        } elseif ($script:IsUbuntu) { # Note: fd is called fd-find in Debian and Ubuntu. Uncomment lines below if we want fd/fd-find to be necessary on Ubuntu
            # Write-Output "fd not found. Installing fd using apt on Ubuntu..."
            # $sudo = Get-SudoPrefix
            # bash -lc "$sudo apt-get update -y && $sudo apt-get install -y fd-find"
        } else {
            Write-Warning "Unsupported OS for automatic fd installation. Please install fd manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        # Re-check installation
        $fd = Get-Command fd -ErrorAction SilentlyContinue
        if (-not $fd) {
            Write-Error "fd installation failed. Please install it manually. Visit https://github.com/sharkdp/fd for instructions."
            return 1
        }
    } else {
        Write-Output "fd is already installed."
    }
}

# Ensures jq is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-Jq {
    $jq = Get-Command jq -ErrorAction SilentlyContinue
    if (-not $jq) {
        if ($script:IsWindows) {
            Write-Output "jq not found. Installing jq using winget..."
            winget install jqlang.jq -e --silent
            if ($LASTEXITCODE -eq -1978335189) { $LASTEXITCODE = 0 } # Ignore "Package is already installed" error
        } elseif ($script:IsMacOS) {
            Write-Output "jq not found. Installing jq using Homebrew..."
            Invoke-Brew install jq
        } elseif ($script:IsUbuntu) {
            Write-Output "jq not found. Installing jq using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt-get update -y && $sudo apt-get install -y jq"
        } else {
            Write-Warning "Unsupported OS for automatic jq installation. Please install jq manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        # Re-check installation
        $jq = Get-Command jq -ErrorAction SilentlyContinue
        if (-not $jq) {
            Write-Error "jq installation failed. Please install it manually. Visit https://jqlang.org/ for instructions."
            return 1
        }
    } else {
        Write-Output "jq is already installed."
    }
}

# Ensures yq is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-Yq {
    $yq = Get-Command yq -ErrorAction SilentlyContinue
    if (-not $yq) {
        if ($script:IsWindows) {
            Write-Output "yq not found. Installing yq using winget..."
            winget install MikeFarah.yq -e --silent
            if ($LASTEXITCODE -eq -1978335189) { $LASTEXITCODE = 0 } # Ignore "Package is already installed" error
        } elseif ($script:IsMacOS) {
            Write-Output "yq not found. Installing yq using Homebrew..."
            Invoke-Brew install yq
        } elseif ($script:IsUbuntu) {
            Write-Output "yq not found. Installing yq using snap on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo snap install yq"
        } else {
            Write-Warning "Unsupported OS for automatic yq installation. Please install yq manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        # Re-check installation
        $yq = Get-Command yq -ErrorAction SilentlyContinue
        if (-not $yq) {
            Write-Error "yq installation failed. Please install it manually. Visit https://github.com/mikefarah/yq for instructions."
            return 1
        }
    } else {
        Write-Output "yq is already installed."
    }
}

# Ensures GitHub CLI (gh) is installed, and installs if missing (Windows: winget, Mac: brew)
function Install-GitHubCli {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        if ($script:IsWindows) {
            Write-Output "GitHub CLI (gh) not found. Installing GitHub CLI using winget..."
            winget install GitHub.cli -e --silent
            if ($LASTEXITCODE -eq -1978335189) { $LASTEXITCODE = 0 } # Ignore "Package is already installed" error
        } elseif ($script:IsMacOS) {
            Write-Output "GitHub CLI (gh) not found. Installing GitHub CLI using Homebrew..."
            Invoke-Brew install gh
        } elseif ($script:IsUbuntu) {
            Write-Output "GitHub CLI (gh) not found. Installing GitHub CLI using apt on Ubuntu..."
            $sudo = Get-SudoPrefix
            bash -lc "$sudo apt update && $sudo apt install gh"
        } else {
            Write-Warning "Unsupported OS for automatic GitHub CLI installation. Please install GitHub CLI manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        # Re-check installation
        $gh = Get-Command gh -ErrorAction SilentlyContinue
        if (-not $gh) {
            Write-Error "GitHub CLI installation failed. Please install it manually. Visit https://cli.github.com/ for instructions."
            return 1
        }
    } else {
        Write-Output "GitHub CLI (gh) is already installed."
    }
}

# Ensures GitHub Copilot CLI is installed.
function Install-GitHubCopilotCli {
    $copilotCli = Get-Command copilot -ErrorAction SilentlyContinue
    if (-not $copilotCli) {
        if ($script:IsWindows) {
            Write-Output "GitHub Copilot CLI not found. Installing using WinGet..."
            winget install GitHub.Copilot -e --silent
        } elseif ($script:IsMacOS) {
            Write-Output "GitHub Copilot CLI not found. Installing using Homebrew..."
            Invoke-Brew install --cask copilot-cli
        } elseif ($script:IsUbuntu) {
            Write-Output "GitHub Copilot CLI not found. Installing using npm..."
            curl -fsSL https://gh.io/copilot-install | bash
        } else {
            Write-Warning "Unsupported OS for automatic GitHub Copilot CLI installation. Please install it manually."
            return 1
        }
        Update-ProcessPathFromEnvironment
        $copilotCli = Get-Command copilot -ErrorAction SilentlyContinue
        if (-not $copilotCli) {
            Write-Error "GitHub Copilot CLI installation failed. Please install it manually. Visit https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli for instructions."
            return 1
        }
    } else {
        Write-Output "GitHub Copilot CLI is already installed."
    }
}

function Install-ClaudeCode {
    if (Get-Command claude -ErrorAction SilentlyContinue) {
        Write-Output "Claude Code is already installed."
        return
    }
    if (-not $script:IsWindows) {
        Write-Warning "Automatic Claude Code installation using winget is only supported on Windows."
        return 1
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget is not installed. Please install App Installer before installing Claude Code."
        return 1
    }
    Write-Output "Claude Code not found. Installing Claude Code using winget..."
    winget install --id Anthropic.ClaudeCode -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        Write-Error "Claude Code installation failed with exit code $LASTEXITCODE."
        return 1
    }
    Update-ProcessPathFromEnvironment
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        Write-Error "Claude Code was not found after installation. Please restart your terminal or install it manually."
        return 1
    }
    Write-Output "Claude Code is installed."
}

function Install-Ollama {
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Output "Ollama is already installed."
        return
    }
    if (-not $script:IsWindows) {
        Write-Warning "Automatic Ollama installation using winget is only supported on Windows."
        return 1
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget is not installed. Please install App Installer before installing Ollama."
        return 1
    }
    Write-Output "Ollama not found. Installing Ollama using winget..."
    winget install --id Ollama.Ollama -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        Write-Error "Ollama installation failed with exit code $LASTEXITCODE."
        return 1
    }
    Update-ProcessPathFromEnvironment
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Error "Ollama was not found after installation. Please restart your terminal or install it manually."
        return 1
    }
    Write-Output "Ollama is installed."
}

function Install-OllamaModels {
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Error "Ollama is not installed. Run Install-Ollama before downloading models."
        return 1
    }
    try {
        ollama pull qwen2.5:3b
        if ($LASTEXITCODE -ne 0) { throw "Failed to download qwen2.5:3b (exit code $LASTEXITCODE)." }
        ollama pull qwen2.5:7b
        if ($LASTEXITCODE -ne 0) { throw "Failed to download qwen2.5:7b (exit code $LASTEXITCODE)." }
    } catch {
        Write-Error "$_ Ensure Ollama is running and retry."
        return 1
    }
    Write-Output "Ollama models are installed."
}

function Set-TerraformEnvironmentType {
    param(
        [string]$type = "dev"
    )
    # If no type parameter is passed, try to read it from environment variable TF_VAR_env_type
    # If still no value, or the value is not in the valid list, default to "dev"
    # Set environment variable TF_VAR_env_type with the value
    $validTypes = @("dev", "test", "prod")
    if (-not $type) {
        $type = $env:TF_VAR_env_type
        if ($type) {
            Write-Output "type parameter not set, using TF_VAR_env_type environment variable value: $type"
        }
    }
    if (-not $type -or $type -notin $validTypes) {
        Write-Warning "type is not set to a valid value ($($validTypes -join ', ')). Defaulting to 'dev'."
        $type = "dev"
    }
    $env:TF_VAR_env_type = $type
    Write-Output "TF_VAR_env_type was set to $env:TF_VAR_env_type"
}

# set a root folder environment variable to one folder above the current folder.
function Set-ProjectRootFolder {
    $moduleFolder = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
    $rootPath = Resolve-Path -Path (Join-Path $moduleFolder '..')
    $env:ROOT_FOLDER = $rootPath.Path
    Write-Output "Set ROOT_FOLDER to $env:ROOT_FOLDER"
    Set-Location $env:ROOT_FOLDER
}

# Install dependencies
function Install-ProjectDependencies {
    Write-Output "Install dependencies with pnpm install"
    pnpm install
}

#Initialise the resource group that will contain all components and setup minimal components to support the Terraform backend.
function Initialize-ResourceGroupBootstrap {
    Write-Output "Initialise the resource group that will contain all components and setup minimal components to support the Terraform backend."
    Set-Location $env:ROOT_FOLDER\deploy\initEnv
    node ./initEnvironment.cjs --envDir="$env:ROOT_FOLDER/deploy" --auto-approve
    if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
}

#Deploy the main environment, databases, securitye, etc.
function Publish-MainEnvironment {
    Write-Output "Deploy the main environment, databases, security, etc."
    Set-Location $env:ROOT_FOLDER\deploy\deployEnv
    node ./deployEnvironment.js --auto-approve
    if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
}

# Deploy modules by looping through their paths
function Publish-ModuleDeployments {
    $moduleRoot = Join-Path $env:ROOT_FOLDER 'module'
    $moduleFolders = Get-ChildItem -Path $moduleRoot -Directory | ForEach-Object { $_.Name }
    foreach ($modulePath in $moduleFolders) {
        Write-Output "Deploy the $modulePath module"
        $deployFolder = Join-Path $moduleRoot "$modulePath\func\deploy"
        if (Test-Path $deployFolder) {
            Set-Location $deployFolder
            if (Test-Path './deployModule.ps1') {
                ./deployModule.ps1
                if ($LASTEXITCODE -ne 0) { Write-Warning "Module $modulePath deployment failed" }
            } else {
                Write-Warning "deployModule.ps1 not found in $deployFolder"
            }
        } else {
            Write-Warning "Deploy folder not found for module $modulePath"
        }
    }
}

#Deploy the UI module
function Publish-UserInterface {
    Write-Output "Deploy the UI module"
    $uiDeployFolder = Join-Path $env:ROOT_FOLDER 'ui/deploy'
    if (Test-Path $uiDeployFolder) {
        Set-Location $uiDeployFolder
        if (Test-Path './deployUi.ps1') {
            ./deployUi.ps1
            if ($LASTEXITCODE -ne 0) { Write-Warning "UI deployment failed" }
        } else {
            Write-Warning "deployUi.ps1 not found in $uiDeployFolder"
        }
    } else {
        Write-Warning "UI deploy folder not found: $uiDeployFolder"
    }
}

# Check if the .env file exists and contains the TARGET_ENV variable. If not, prompt the user to run initEnv.
function Test-InitializationEnvironment {
    Write-Output "Checking .env file"
    $envFile = Join-Path $env:ROOT_FOLDER "deploy\.env"
    if (-not (Test-Path $envFile)) {
        throw ".env file not found. Please run node ./deploy/initEnv/build.mjs and execute it with admin."
    }
    $content = Get-Content $envFile -Raw
    if ($content -notmatch "^TARGET_ENV\s*=\s*.+") {
        throw "TARGET_ENV is missing or empty. Please run node ./deploy/initEnv/build.mjs and execute it with admin."
    }
    $match = [regex]::Match($content, "^TARGET_ENV\s*=\s*(.+)", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $targetEnv = $match.Groups[1].Value.Trim()
    Write-Output ".env TARGET_ENV was set to $targetEnv"
}

function Update-ProcessPathFromEnvironment {
    if ($script:IsWindows) {
        $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $combinedPath = @($machinePath, $userPath) -join ";"
        if ($combinedPath) {
            $env:Path = $combinedPath
        }
        # Winget often shims executables in this folder for the current user.
        $wingetLinksPath = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"
        if ((Test-Path $wingetLinksPath) -and ($env:Path -notlike "*$wingetLinksPath*")) {
            $env:Path = "$env:Path;$wingetLinksPath"
        }
    }
}

function Initialize-PlatformState {
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        Write-Warning "You are using a Windows only version of powershell, upgrade to Powerhsell Core when possible"
        Set-Variable -Name IsWindows -Value ($env:OS -eq 'Windows_NT') -Scope Script
        Set-Variable -Name IsMacOS -Value $false -Scope Script
        Set-Variable -Name IsUbuntu -Value $false -Scope Script
        if ($env:OSTYPE -eq 'darwin') { Set-Variable -Name IsMacOS -Value $true -Scope Script }
        elseif ((Get-Command uname -ErrorAction SilentlyContinue) -and (uname) -eq 'Darwin') { Set-Variable -Name IsMacOS -Value $true -Scope Script }
    } else {
        # PowerShell 6+ (Core) cross-platform means this could be Windows or any other OS that supports powershell core.
        # Check for Windows        
        $isWin = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
        Set-Variable -Name IsWindows -Value $isWin -Scope Script

        # Check for MacOS
        $isMac = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
        Set-Variable -Name IsMacOS -Value $isMac -Scope Script
        # Check for Ubuntu
        $isUbuntu = $false
        if (-not $isWin -and -not $isMac) {
            if ((Get-Command lsb_release -ErrorAction SilentlyContinue) -and ((& lsb_release '-is' 2>$null).Trim() -eq 'Ubuntu')) {
                $isUbuntu = $true
            } elseif (Test-Path '/etc/os-release') {
                $osRelease = Get-Content '/etc/os-release' -ErrorAction SilentlyContinue
                if ($osRelease -match '^ID=ubuntu$' -or $osRelease -match '^ID="ubuntu"$') {
                    $isUbuntu = $true
                }
            }
        }
        Set-Variable -Name IsUbuntu -Value $isUbuntu -Scope Script
        # Detect Apple Silicon (true even when running under Rosetta 2)
        $isAppleSilicon = $false
        if ($isMac) {
            $armSupport = & sysctl -n hw.optional.arm64 2>$null
            $isAppleSilicon = ($armSupport -eq "1")
        }
        Set-Variable -Name IsAppleSilicon -Value $isAppleSilicon -Scope Script


        $isLinux = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux)
        Set-Variable -Name IsLinux -Value $isLinux -Scope Script

        # Ubuntu detection by reading /etc/os-release
        $isUbuntu = $false
        if ($isLinux) {
            try {
                $osRelease = Get-Content -Path /etc/os-release -ErrorAction SilentlyContinue -Raw
                if ($osRelease -and ($osRelease -match '(^|\n)ID=\"?ubuntu\"?(\n|$)' -or $osRelease -match 'Ubuntu')) {
                    $isUbuntu = $true
                }
            } catch { }
        }
        Set-Variable -Name IsUbuntu -Value $isUbuntu -Scope Script
    }
}
# Determine the OS type and set variables in script scope
Initialize-PlatformState

# Wrapper for brew that forces ARM64 mode on Apple Silicon to avoid Rosetta 2 conflicts
function Invoke-Brew {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    if ($script:IsAppleSilicon) {
        arch -arm64 /opt/homebrew/bin/brew @Arguments
    } else {
        /usr/local/bin/brew @Arguments
    }
}

function Read-ToolSelection {
    param([object[]]$Tools, [bool[]]$Selected)
    $cursor = 0
    Write-Host ""
    Write-Host "Select tools to install: Up/Down to move, Space to toggle, 'a' all, 'n' none, Enter to install, Esc to cancel."
    $draw = {
        for ($i = 0; $i -lt $Tools.Count; $i++) {
            $pointer = if ($i -eq $cursor) { '>' } else { ' ' }
            $mark = if ($Selected[$i]) { 'x' } else { ' ' }
            $line = "{0} [{1}] {2}" -f $pointer, $mark, $Tools[$i].Name
            if ($i -eq $cursor) { Write-Host $line -ForegroundColor Cyan } else { Write-Host $line }
        }
    }
    & $draw
    $useAnsi = $PSVersionTable.PSVersion.Major -ge 6
    if (-not $useAnsi) { $top = [Console]::CursorTop - $Tools.Count }
    try { [Console]::CursorVisible = $false } catch {}
    try {
        while ($true) {
            $key = [Console]::ReadKey($true)
            switch ($key.Key) {
                'UpArrow'   { $cursor = ($cursor - 1 + $Tools.Count) % $Tools.Count }
                'DownArrow' { $cursor = ($cursor + 1) % $Tools.Count }
                'Spacebar'  { $Selected[$cursor] = -not $Selected[$cursor] }
                'A'         { for ($i = 0; $i -lt $Tools.Count; $i++) { $Selected[$i] = $true } }
                'N'         { for ($i = 0; $i -lt $Tools.Count; $i++) { $Selected[$i] = $false } }
                'Enter' {
                    $count = @($Selected | Where-Object { $_ }).Count
                    $prompt = if ($count -eq 0) { "No tools selected. Enter to skip installing, any other key to go back." } else { "Install $count tool(s)? Enter to confirm, any other key to go back." }
                    Write-Host $prompt -ForegroundColor Yellow
                    if ([Console]::ReadKey($true).Key -eq 'Enter') { return $true }
                    if ($useAnsi) {
                        [Console]::Write("$([char]27)[1A`r$([char]27)[2K")
                    } else {
                        [Console]::SetCursorPosition(0, $top + $Tools.Count)
                        [Console]::Write(' ' * ([Console]::WindowWidth - 1))
                        [Console]::SetCursorPosition(0, $top + $Tools.Count)
                    }
                }
                'Escape'    { return $false }
            }
            if ($useAnsi) { [Console]::Write("$([char]27)[$($Tools.Count)A`r") } else { [Console]::SetCursorPosition(0, $top) }
            & $draw
        }
    } finally {
        try { [Console]::CursorVisible = $true } catch {}
    }
}

function Select-Tools {
    param([object[]]$Tools)
    [bool[]]$selected = @($Tools | ForEach-Object { [bool]$_.Default })
    if (-not [Console]::IsInputRedirected) {
        try {
            if (-not (Read-ToolSelection $Tools $selected)) {
                for ($i = 0; $i -lt $selected.Count; $i++) { $selected[$i] = $false }
            }
        } catch {
            Write-Warning "Interactive selection is not available in this host ($_). Installing the default selection."
            [bool[]]$selected = @($Tools | ForEach-Object { [bool]$_.Default })
        }
    }
    for ($i = 0; $i -lt $Tools.Count; $i++) {
        if ($selected[$i]) { $Tools[$i] }
    }
}

function Install-SelectedTools {
    param([object[]]$Tools)
    $chosen = @(Select-Tools $Tools)
    Write-Host ""
    if ($chosen.Count -eq 0) {
        Write-Host "No tools selected; nothing to install."
        return
    }
    Write-Host "Installing: $(($chosen | ForEach-Object { $_.Name }) -join ', ')"
    foreach ($tool in $chosen) {
        & $tool.Command
    }
}

Export-ModuleMember -Function Initialize-PlatformState,Install-Pnpm,Install-NodeJsAndNpm,Install-Terraform,Install-Packer,Install-DockerCli,Install-PostgreSql,Install-AwsCli,Install-AzureCli,Install-AzureStorageExplorer,Install-Ripgrep,Install-Fd,Install-Jq,Install-Yq,Install-GitHubCli,Install-GitHubCopilotCli,Install-ClaudeCode,Install-Ollama,Set-TerraformEnvironmentType,Set-ProjectRootFolder,Install-ProjectDependencies,Initialize-ResourceGroupBootstrap,Publish-MainEnvironment,Publish-ModuleDeployments,Publish-UserInterface,Test-InitializationEnvironment,Install-DevTools,Install-DevAiTools,Install-PnpmCompletion
