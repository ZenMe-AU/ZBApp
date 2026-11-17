/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import container from "../di/diContainer.mjs";
import { requestHandler } from "../handler/handlerWrapper.mjs";
import profileHandler from "../handler/profileHandler.mjs";
import { updateMyProfileSchema } from "../handler/updateMyProfileSchema.mjs";
import { ensureProfile, updatePreferredName } from "../service/profile.mjs";

const ensureRepositoryProfile = vi.fn();
const updateRepositoryPreferredName = vi.fn();
const repository = { ensureProfile: ensureRepositoryProfile, updatePreferredName: updateRepositoryPreferredName };

describe("ensureProfile", () => {
  beforeEach(() => {
    ensureRepositoryProfile.mockReset();
    updateRepositoryPreferredName.mockReset();
    container.singletons.set("repository", repository);
    container.singletons.delete("authProvider");
  });

  it("creates a profile when its external id is new", async () => {
    const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
    const profile = { id: "63fddfe4-b1c2-4314-a65c-f4f3fba185b6", externalId };
    ensureRepositoryProfile.mockResolvedValue({ profile, created: true });

    await expect(ensureProfile(externalId)).resolves.toEqual({ profile, created: true });
    expect(ensureRepositoryProfile).toHaveBeenCalledWith(externalId, {});
  });

  it("reuses a profile for the same external id", async () => {
    const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
    const profile = { id: "63fddfe4-b1c2-4314-a65c-f4f3fba185b6", externalId };
    ensureRepositoryProfile.mockResolvedValue({ profile, created: false });

    await expect(ensureProfile(externalId)).resolves.toEqual({ profile, created: false });
  });

  it("rejects a missing authenticated profile id", async () => {
    await expect(ensureProfile("")).rejects.toMatchObject({ status: 401 });
    expect(ensureRepositoryProfile).not.toHaveBeenCalled();
  });

  it("updates only the authenticated profile's preferred name", async () => {
    const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
    const profile = { id: "63fddfe4-b1c2-4314-a65c-f4f3fba185b6", externalId };
    updateRepositoryPreferredName.mockResolvedValue(profile);

    await expect(updatePreferredName(externalId, "Josh")).resolves.toEqual(profile);
    expect(updateRepositoryPreferredName).toHaveBeenCalledWith(externalId, "Josh");
  });

  it("passes the stable Q3 internal profile id to an authenticated handler", async () => {
    const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
    const internalId = "63fddfe4-b1c2-4314-a65c-f4f3fba185b6";
    ensureRepositoryProfile.mockResolvedValue({ profile: { id: internalId, externalId }, created: false });
    container.singletons.set("authProvider", { decode: vi.fn().mockResolvedValue({ oid: externalId, name: "Josh Kim" }) });

    const handler = requestHandler(async (request) => ({
      return: { profileId: request.userData.profileId, profileCreated: request.userData.profileCreated },
    }));
    const response = await handler(
      {
        method: "GET",
        url: "http://localhost/profile",
        headers: new Headers({ authorization: "Bearer valid-test-token", "X-Correlation-Id": "0123456789abcdef0123456789abcdef" }),
      },
      { invocationId: "profile-test", functionName: "EnsureProfileTest" }
    );

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ success: true, return: { profileId: internalId, profileCreated: false } });
    expect(ensureRepositoryProfile).toHaveBeenCalledWith(externalId, { name: "Josh Kim" });
  });

  it("accepts one short preferred name from the authenticated user", async () => {
    const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
    const internalId = "63fddfe4-b1c2-4314-a65c-f4f3fba185b6";
    ensureRepositoryProfile.mockResolvedValue({ profile: { id: internalId, externalId }, created: false });
    updateRepositoryPreferredName.mockResolvedValue({ id: internalId, externalId });
    container.singletons.set("authProvider", { decode: vi.fn().mockResolvedValue({ oid: externalId }) });
    const handler = requestHandler(profileHandler.UpdateMyProfile, { schemas: [updateMyProfileSchema] });

    const response = await handler(
      {
        method: "PUT",
        url: "http://localhost/profile/me",
        headers: new Headers({ authorization: "Bearer valid-test-token", "content-type": "application/json" }),
        json: async () => ({ preferredName: "Josh" }),
      },
      { invocationId: "profile-test", functionName: "UpdateMyProfileTest" }
    );

    expect(response.jsonBody).toEqual({ success: true, return: { id: externalId, preferredName: "Josh" } });
    expect(updateRepositoryPreferredName).toHaveBeenCalledWith(externalId, "Josh");
  });
});
