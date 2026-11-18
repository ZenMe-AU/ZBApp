/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { app, type HttpHandler } from "@azure/functions";
import { createProfile, profileIds, readProfile, RequestError, resolveProfileFolder, updatePreference } from "./repository.ts";

async function readJsonBody(request: Parameters<HttpHandler>[0]) {
  if (!request.body) throw new RequestError(400, "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64 * 1024) {
      await reader.cancel();
      throw new RequestError(413, "Request body exceeds 64 KiB.");
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new RequestError(400, "Invalid JSON request body.");
  }
}

function fixtureOnly(handler: HttpHandler): HttpHandler {
  return async (request, context) => {
    if (process.env.QFF_FIXTURE_MODE !== "1" || process.env.WEBSITE_SITE_NAME) {
      return { status: 503, jsonBody: { error: "Local fixture mode is required." } };
    }
    try {
      return await handler(request, context);
    }
    catch (error) {
      if (error instanceof RequestError) return { status: error.status, jsonBody: { error: error.message } };
      context.error(error);
      return { status: 500, jsonBody: { error: "Identity Repository request failed." } };
    }
  };
}

app.http("listProfiles", {
  route: "v1/profiles",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: fixtureOnly(async () => ({ jsonBody: { profile_ids: await profileIds() } })),
});

app.http("readProfile", {
  route: "v1/profiles/{profileId}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const id = request.params.profileId;
    const folder = await resolveProfileFolder(id);
    return { jsonBody: await readProfile(folder, id) };
  }),
});

app.http("createProfile", {
  route: "v1/profiles",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const input = await readJsonBody(request);
    if (typeof input !== "object" || input === null || Array.isArray(input) || !("identity" in input)
      || typeof input.identity !== "object" || input.identity === null || Array.isArray(input.identity)
      || !("identity_id" in input.identity) || typeof input.identity.identity_id !== "string") {
      throw new RequestError(400, "Supply an identity object with an identity_id.");
    }
    const id = input.identity.identity_id;
    await createProfile(id, input);
    return { status: 201, jsonBody: { profile_id: id } };
  }),
});

app.http("updatePreference", {
  route: "v1/profiles/{profileId}/preferences/{preferenceId}",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const { profileId, preferenceId } = request.params;
    const folder = await resolveProfileFolder(profileId);
    const input = await readJsonBody(request);
    const revision = await updatePreference(folder, profileId, preferenceId, request.headers.get("if-match"), input);
    return { jsonBody: { revision } };
  }),
});
