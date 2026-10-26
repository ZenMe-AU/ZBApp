/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic", // this is just a workaround for not having tsconfig.json set up yet
  },
  build: {
    target: "esnext",
    minify: false,
    modulePreload: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5186,
    strictPort: true,
  },
});
