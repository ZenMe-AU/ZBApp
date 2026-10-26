/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AuthExpiredError } from "../../error/authExpired";

export function useErrorHandler(error: Error) {
  if (error instanceof AuthExpiredError) {
    // For auth errors, we can show a specific message or trigger a login flow
    console.error("Authentication error:", error.message);
    console.error("Authentication loginUrl:", error.loginUrl);
    // openAuthDialog({ message: error.message, loginUrl: error.loginUrl });
  } else {
    // Handle other types of errors
    console.error("An unexpected error occurred:", error);
  }
  throw error; // Re-throw the error after handling
}
