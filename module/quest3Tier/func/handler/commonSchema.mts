/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";

const errorResponse = z.object({ success: z.literal(false), message: z.string() }).meta({ id: "ErrorResponse" });

export const apiResponses = (httpCodes: number[], returnSchema: z.ZodType) =>
  httpCodes.map((httpCode) => ({
    httpCode,
    schema: httpCode < 400 ? z.object({ success: z.literal(true), return: returnSchema }) : errorResponse,
  }));

export const commandHeaders = z.object({
  "X-Correlation-Id": z.string().optional().meta({ description: "Correlation ID for tracing the command and querying its events." }),
});

export const commandResponses = apiResponses([200, 400, 401, 403, 500], z.object({ messageId: z.uuid() }));
