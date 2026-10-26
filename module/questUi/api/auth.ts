/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { jwtFetch } from "./jwtFetch";
import { getConfig, loadConfig } from "../config/loadConfig";

// const apiDomain = import.meta.env.VITE_PROFILE_DOMAIN;
// const apiDomain = getConfig("PROFILE_DOMAIN");

export const login = async (userId: string) => {
  try {
    await loadConfig();
    const apiDomain = getConfig("PROFILE_DOMAIN");
    const response = await jwtFetch(`${apiDomain}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) throw new Error("Login failed");

    const data = await response.json();
    return data.return;
  } catch (err) {
    console.error("Login API error:", err);
    throw err;
  }
};

export const authVerify = async () => {
  try {
    await loadConfig();
    const apiDomain = getConfig("PROFILE_DOMAIN");
    const response = await jwtFetch(`${apiDomain}/auth/verify`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to verify token");
    }

    const data = await response.json();
    return data.return.detail;
  } catch (err) {
    console.error("Verify API error:", err);
    throw err;
  }
};
