/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { app, type HttpHandler } from "@azure/functions";
import { addPreference, createFixtureProfile, deletePreference, deleteProfile, profileIds, readProfile, RequestError, resolveFixtureIdentityId, resolveProfileFolder, updateIdentity, updatePreference } from "./repository.ts";
import { BuddyService } from "./buddy.ts";
import { buddyAvailability, openAICompatibleBuddy } from "./buddy-provider.ts";

const buddy = new BuddyService();

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
      if (error instanceof RequestError) return { status: error.status, jsonBody: { error: error.message, ...(error.fields ? { fields: error.fields } : {}) } };
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
  route: "v1/profiles/{externalId}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { jsonBody: await readProfile(folder, id) };
  }),
});

app.http("createProfile", {
  route: "v1/profiles",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const id = await createFixtureProfile(await readJsonBody(request));
    return { status: 201, jsonBody: { profile_id: id } };
  }),
});

app.http("updatePreference", {
  route: "v1/profiles/{externalId}/preferences/{preferenceId}",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: fixtureOnly(async (request) => {
    const { externalId, preferenceId } = request.params;
    const identityId = resolveFixtureIdentityId(externalId);
    const folder = await resolveProfileFolder(identityId);
    const input = await readJsonBody(request);
    const revision = await updatePreference(folder, identityId, preferenceId, request.headers.get("if-match"), input);
    return { jsonBody: { revision } };
  }),
});

app.http("addPreference", {
  route: "v1/profiles/{externalId}/preferences", methods: ["POST"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { status: 201, jsonBody: await addPreference(folder, id, request.headers.get("if-match"), await readJsonBody(request)) };
  }),
});

app.http("deletePreference", {
  route: "v1/profiles/{externalId}/preferences/{preferenceId}", methods: ["DELETE"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { jsonBody: { revision: await deletePreference(folder, id, request.params.preferenceId!, request.headers.get("if-match")) } };
  }),
});

app.http("updateIdentity", {
  route: "v1/profiles/{externalId}/identity", methods: ["PATCH"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { jsonBody: { identity_revision: await updateIdentity(folder, id, request.headers.get("if-match"), await readJsonBody(request)) } };
  }),
});

app.http("deleteProfile", {
  route: "v1/profiles/{externalId}", methods: ["DELETE"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    await deleteProfile(await resolveProfileFolder(id), id, request.headers.get("if-match"));
    return { status: 204 };
  }),
});

app.http("buddyAvailability", {
  route: "v1/ai-assistance", methods: ["GET"], authLevel: "anonymous",
  handler: fixtureOnly(async () => ({ jsonBody: buddyAvailability() })),
});

app.http("buddyChat", {
  route: "v1/profiles/{externalId}/buddy/messages", methods: ["POST"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { jsonBody: await buddy.chat(folder, id, await readJsonBody(request), () => openAICompatibleBuddy()) };
  }),
});

app.http("approveBuddyProposal", {
  route: "v1/profiles/{externalId}/buddy/approvals", methods: ["POST"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const folder = await resolveProfileFolder(id);
    return { jsonBody: await buddy.approve(folder, id, await readJsonBody(request)) };
  }),
});

app.http("buddyMemory", {
  route: "v1/profiles/{externalId}/buddy/memory", methods: ["GET"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    return { jsonBody: await buddy.memory(await resolveProfileFolder(id), id) };
  }),
});

for (const action of ["review", "archive"] as const) app.http(`buddyProposal${action}`, {
  route: `v1/profiles/{externalId}/buddy/proposals/{proposalId}/${action}`, methods: ["POST"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    const result = await buddy[action](await resolveProfileFolder(id), id, request.params.proposalId!);
    return result ? { jsonBody: result } : { status: 204 };
  }),
});

app.http("deleteBuddyConversation", {
  route: "v1/profiles/{externalId}/buddy/conversations/{conversationId}", methods: ["DELETE"], authLevel: "anonymous",
  handler: fixtureOnly(async request => {
    const id = resolveFixtureIdentityId(request.params.externalId);
    await buddy.deleteConversation(await resolveProfileFolder(id), id, request.params.conversationId!, request.headers.get("if-match"));
    return { status: 204 };
  }),
});
