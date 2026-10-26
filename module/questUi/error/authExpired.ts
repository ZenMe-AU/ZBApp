/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export class AuthExpiredError extends Error {
  loginUrl?: string;
  status?: number;

  constructor(message?: string, loginUrl?: string) {
    super(message ?? "AUTH_EXPIRED");
    this.name = "AuthExpiredError";
    this.loginUrl = loginUrl;
    this.status = 403;
  }
}
