/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getOperationId } from "../monitor/telemetry";
import { AuthExpiredError } from "../error/authExpired";
import { useErrorHandler } from "../app/hooks/useErrorHandler";

export const jwtFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("appToken");
  const correlationId = getOperationId();
  console.log("Correlation ID:", correlationId);
  const headers = new Headers({
    Accept: "application/json",
    "X-Correlation-Id": correlationId ?? "",
    ...options.headers,
  });

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Auth-Token", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  });

  if (!response.ok) {
    if (response?.status === 403) {
      const { message, loginUrl } = await response.json();
      useErrorHandler(new AuthExpiredError(message, loginUrl));
    }
    const errorText = await response.text();
    useErrorHandler(new Error(`Request failed with status ${response.status}: ${errorText}`));
  }

  return response;
};
