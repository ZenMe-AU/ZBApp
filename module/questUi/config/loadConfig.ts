/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

let config: Record<string, string> | null = null;

export async function loadConfig(): Promise<Record<string, string> | null> {
  if (config) return config;

  const res = await fetch("/env.json");
  if (!res.ok) {
    throw new Error("Failed to load runtime config");
  }

  config = await res.json();
  console.log("Config loaded:", config);
  return config;
}

export function getConfig(key: string): string | null {
  if (!config) {
    throw new Error("Config not loaded yet. Call loadConfig() first.");
  }
  if (!(key in config)) {
    throw new Error(`Config key "${key}" not found`);
  }
  return config[key];
}
