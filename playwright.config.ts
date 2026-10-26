/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { viewports } from "./zeninstallerPvt/ui/pwtests/testInit.js";

process.env.NODE_ENV = process.env.NODE_ENV || "dev";
// Enable Playwright API logs for normal and coverage runs, preserving other namespaces.
process.env.DEBUG = [process.env.DEBUG, "pw:api"].filter(Boolean).join(",");
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.resolve(currentDirectory, ".env")
  ],
});

export default defineConfig({
  testDir: ".",
  outputDir: "./pwtest-results",
  updateSnapshots: process.env.CI ? "none" : "missing",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    // A terminal reporter is what streams worker stdout/stderr (incl. pw:api) to the console.
    ["line"], 
    ["./zeninstallerPvt/ui/pwtests/coverage/coverage-reporter.ts"],
  ],
  timeout: 60_000,
  expect: {
    timeout: 10_000,

    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
      pathTemplate: "{testDir}/{arg}{ext}",
    },
  },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-id",
  },

  projects: [
    // {
    //   name: "Desktop",
    //   testMatch: "**/pwtests/**/*.{spec,setup}.{ts,mts}",
    //   fullyParallel: false,
    //   workers: 1,
    //   retries: 1,
    //   use: {
    //     ...devices["Desktop Chrome"],
    //     viewport: viewports.Desktop,
    //   },
    // },
    // {
    //   name: "Mobile",
    //   testMatch: "**/pwtests/**/*.{spec,setup}.{ts,mts}",
    //   fullyParallel: false,
    //   workers: 1,
    //   retries: 1,
    //   use: {
    //     ...devices["Desktop Chrome"],
    //     viewport: viewports.Mobile,
    //   },
    // },
    {
      name: "Desktop and Mobile",
      testMatch: "**/pwtests/**/*.{spec,setup}.{ts,mts}",
      fullyParallel: true,
      workers: 2,
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: viewports.Desktop,
      },
    },
  ],

  /**
   * Start the server automatically
   */
  webServer: {
    command: "pnpm --dir ./zeninstallerPvt/ui run dev",
    url: process.env.BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
