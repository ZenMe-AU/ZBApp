/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { clip, type ILlmProvider, type LlmProviderConfig, type LlmRequest } from "./contract.mjs";

const execFileAsync = promisify(execFile);
const installerBin = path.join(os.homedir(), ".local/bin/claude");

export interface ClaudeCommandResult {
  stdout: string | Buffer;
  stderr?: string | Buffer;
}

export type ClaudeRunnerFn = (
  file: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
  }
) => Promise<ClaudeCommandResult>;

export interface ClaudeProviderConfig extends LlmProviderConfig {
  binPath?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: ClaudeRunnerFn;
}

interface ChildProcessError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: number | string;
  killed?: boolean;
}

export class ClaudeProvider implements ILlmProvider {
  readonly name = "claude";
  readonly config: ClaudeProviderConfig;

  constructor(config: ClaudeProviderConfig = {}) {
    this.config = config;
  }

  get localModelDir(): string | undefined {
    return this.config.localModelDir;
  }

  get modelName(): string | undefined {
    return this.config.modelName;
  }

  get binPath(): string {
    return this.config.binPath ?? process.env.CLAUDE_BIN ?? (existsSync(installerBin) ? installerBin : "claude");
  }

  get cliEnv(): NodeJS.ProcessEnv {
    if (this.config.cliEnv) {
      return this.config.cliEnv;
    }
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.VSCODE_INSPECTOR_OPTIONS;
    return env;
  }

  private async executeCommand(file: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string }): Promise<ClaudeCommandResult> {
    if (this.config.runner) {
      return await this.config.runner(file, args, options);
    }

    const run = execFileAsync(file, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 3 * 60 * 1000,
      killSignal: "SIGKILL",
    });

    if (options.input !== undefined) {
      const child = (run as { child?: { stdin?: { end: (input: string) => void } } }).child;
      child?.stdin?.end(options.input);
    }

    return await run;
  }

  async assertReady(): Promise<void> {
    const result = await this.executeCommand(this.binPath, ["auth", "status", "--json"], {
      env: this.cliEnv,
    }).catch((error: ChildProcessError) => ({
      stdout: error.stdout,
      error,
    }));

    const status = (() => {
      try {
        return JSON.parse(String(result.stdout));
      } catch {
        const errorMsg = "error" in result && (result as { error?: Error }).error?.message ? (result as { error?: Error }).error?.message : "no output";
        throw new Error(`Claude CLI check failed: ${errorMsg}`);
      }
    })();

    if (!status.loggedIn) {
      throw new Error("Claude CLI is not logged in. Run `claude /login` in the VS Code terminal, then start the test again.");
    }
  }

  async completeJson<TOutput = unknown>(request: LlmRequest): Promise<TOutput> {
    const startedAt = performance.now();
    const effort = (request.options?.effort as string | undefined) ?? "low";
    const thinking = Boolean(request.options?.thinking);

    const args = ["-p", "--system-prompt", request.systemPrompt];
    const model = request.model || this.modelName;
    if (model) {
      args.push("--model", model);
    }
    args.push("--effort", effort);
    if (!thinking) args.push("--settings", JSON.stringify({ alwaysThinkingEnabled: false }));
    args.push("--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence");
    args.push("--output-format", "json", "--json-schema", JSON.stringify(request.schema));

    const { stdout } = await this.executeCommand(this.binPath, args, {
      cwd: request.sandbox,
      env: this.cliEnv,
      input: JSON.stringify(request.input),
    }).catch((error: ChildProcessError) => {
      if (error.killed) throw new Error("claude timed out");
      const cause = (() => {
        try {
          return JSON.parse(String(error.stdout)).result;
        } catch {
          return String(error.stderr ?? "").trim() || "no output";
        }
      })();
      throw new Error(`claude exited ${error.code}: ${clip(cause, 300)}`);
    });

    const out = JSON.parse(String(stdout));
    if (out.is_error) throw new Error(out.result || "Claude CLI error");
    if (!out.structured_output) throw new Error(`no structured output: ${out.subtype} ${clip(out.result, 200)}`);
    const outputTokens = out.usage?.output_tokens;
    if (typeof outputTokens === "number") {
      request.onMetrics?.({ outputTokens, elapsedMs: performance.now() - startedAt });
    }

    return out.structured_output as TOutput;
  }
}
