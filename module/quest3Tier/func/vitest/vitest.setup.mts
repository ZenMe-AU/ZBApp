/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import fs from "fs";
import net from "net";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll } from "vitest";

const filePath = path.join(__dirname, "..", "local.settings.json");
const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));

Object.assign(process.env, settings.Values);

const AZURITE_HOST = "127.0.0.1";
const AZURITE_TABLE_PORT = 10002;
const repoDir = path.resolve(__dirname, "..", "..", "..", "..");
const azuriteBin = path.join(repoDir, "node_modules", "azurite", "dist", "src", "azurite.js");
let azuriteProcess: ChildProcess | undefined;

function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const close = (isOpen: boolean) => {
      socket.destroy();
      resolve(isOpen);
    };

    socket.once("connect", () => close(true));
    socket.once("error", () => close(false));
    socket.setTimeout(500, () => close(false));
  });
}

async function waitForPort(port: number, host: string, attempts: number): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isPortOpen(port, host)) return;
    if (azuriteProcess?.exitCode !== null && azuriteProcess?.exitCode !== undefined) {
      throw new Error(`Azurite exited before opening ${host}:${port} (code ${azuriteProcess.exitCode})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Azurite Table service did not start on ${host}:${port}`);
}

beforeAll(async () => {
  if (process.env.AzureWebJobsStorage !== "UseDevelopmentStorage=true") return;
  if (await isPortOpen(AZURITE_TABLE_PORT, AZURITE_HOST)) return;

  azuriteProcess = spawn(process.execPath, [
    azuriteBin,
    "--location",
    repoDir,
    "--tableHost",
    AZURITE_HOST,
    "--tablePort",
    String(AZURITE_TABLE_PORT),
    "--silent",
  ], {
    cwd: repoDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  azuriteProcess.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  azuriteProcess.stderr?.on("data", (chunk) => { output += chunk.toString(); });
  let startupError: Error | undefined;
  azuriteProcess.once("error", (error) => {
    startupError = error;
  });
  try {
    await waitForPort(AZURITE_TABLE_PORT, AZURITE_HOST, 50);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${output ? `: ${output.trim()}` : ""}`, { cause: error });
  }
  if (startupError) throw startupError;
}, 10_000);

afterAll(() => {
  if (azuriteProcess && !azuriteProcess.killed) {
    azuriteProcess.kill();
    azuriteProcess = undefined;
  }
});
