/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// From Eslint v8.21.0, .eslintrc* is no longer used. eslint.config.js is the default config file name.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import licenseheader from "eslint-plugin-license-header";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";
import jsonc from "eslint-plugin-jsonc";

export default [
  {
    ignores: ["**/dist/**", "**/build/**", "**/.next/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...stylistic.configs.recommended,
    files: ["**/*.{ts,tsx,mts,cts}", "**/*.{js,jsx,mjs,cjs}"],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}", "**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        // ...add more globals as needed
      },
    },
    plugins: {
      licenseheader,
    },
    rules: {
      "@stylistic/quotes": ["error", "double"],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/max-statements-per-line": ["warn", { max: 2 }],
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-explicit-any": ["warn", { fixToUnknown: true, ignoreRestArgs: false }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "licenseheader/header": [
        "warn",
        [
          "/**",
          " * @license SPDX-FileCopyrightText: © " + new Date().getFullYear() + " Zenme Pty Ltd <info@zenme.com.au>",
          " * @license SPDX-License-Identifier: MIT",
          " */",
        ],
      ],
      "linebreak-style": "off", // Do not check line endings
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    settings: {},
  },
  {
    files: ["**/*.json"],
    plugins: {
      jsonc,
    },
    language: "jsonc/json",
    rules: {
      "jsonc/array-bracket-newline": ["error", "never"],
      "jsonc/array-element-newline": ["error", "never"],
    },
  },
  {
    files: ["**/*.cjs", "**/*.cts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
