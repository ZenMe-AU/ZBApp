# Infrastructure deployment

This folder contains deployment scripts, environment setup files, and infrastructure automation resources.

## Hermes Agent

Install the official Hermes Agent runtime and source under `<InstallBaseFolder>/hermes`
(the base folder defaults to your home directory):

```powershell
Import-Module .\deploy\deploymentModule.psm1 -Force
Set-InstallBaseFolder -Path 'D:\models'
Install-HermesAgent
```

The wrapper uses the upstream PowerShell installer on Windows and the shell
installer via bash on macOS/Linux. It skips interactive onboarding so installation
can run from automation; run `hermes setup` afterward in a terminal. The
`Install-AllDevAiTools` stage also honors `-InstallBaseFolder` for Hermes Agent.
The wrapper sets `HERMES_HOME` for the current process and persists it as a user
environment variable on Windows. On macOS/Linux, persist the printed `HERMES_HOME`
value in your shell environment before opening another terminal.

## Hermes Desktop

With Hermes Agent installed, use the same base folder:

```powershell
Import-Module .\deploy\deploymentModule.psm1 -Force
Set-InstallBaseFolder -Path 'D:\models'
Install-HermesDesktop
```

This uses the [official CLI installation method](https://hermes-agent.nousresearch.com/desktop):
`hermes desktop --build-only`. It installs workspace dependencies and builds the
native app for Windows, macOS, or Linux under the existing Hermes source checkout,
without launching a window. Run `hermes desktop` afterward to launch it.
On macOS/Linux, the Hermes CLI must be available on `PATH`.
The `Install-AllDevAiTools` stage installs Desktop after Hermes Agent.
