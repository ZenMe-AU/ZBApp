/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ".codingstandards/vitestGlobalSetup.ts",
    environment: "node",
    fileParallelism: false,
    include: ["**/*.test.{js,cjs,mjs,ts,cts,mts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
