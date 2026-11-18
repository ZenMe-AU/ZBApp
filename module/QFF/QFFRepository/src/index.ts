/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { app } from "@azure/functions";
import { openDataset } from "./repository.ts";

app.http("readCatalogue", {
  route: "v1/catalogue",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (_request, context) => {
    if (process.env.QFF_FIXTURE_MODE !== "1" || process.env.WEBSITE_SITE_NAME) {
      return { status: 503, jsonBody: { error: "Local fixture mode is required." } };
    }
    try {
      const db = await openDataset();
      const catalogue = await db.openTable("catalogue");
      const concepts = await db.openTable("concepts");
      const [version] = await catalogue.query().limit(1).toArray();
      if (!version) throw new Error("Missing catalogue version.");
      const rows = await concepts.query().limit(101).toArray();
      return {
        jsonBody: {
          version: version.version,
          concepts: rows.slice(0, 100).map(row => row.toJSON()),
          truncated: rows.length > 100,
          // Phase 1 never refreshes derived data.
          derived_data_stale: true,
        },
      };
    }
    catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { error: "QFF Repository request failed." } };
    }
  },
});
