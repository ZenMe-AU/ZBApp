/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1", port: 5181, strictPort: true,
    proxy: { "/api": { target: process.env.QFF_IDENTITY_API_URL ?? "http://127.0.0.1:7181", changeOrigin: true } },
  },
});
