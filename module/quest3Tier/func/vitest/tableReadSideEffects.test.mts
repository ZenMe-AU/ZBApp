/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TableClient } from "@azure/data-tables";
import { configureTableStorage, getTableClient } from "../repository/table/init.mjs";
import { findProfileByExternalId, getProfileByInternalId, listFriends } from "../repository/table/profileRepository.mjs";

const settings = { AzureWebJobsStorage: "UseDevelopmentStorage=true", allowReadSideEffects: false };
const current = { partitionKey: "external", rowKey: "profile", internal_id: "internal", external_id: "external", createdAt: "2026-11-16" };
const missing = Object.assign(new Error("Not found"), { statusCode: 404 });
let reads: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  configureTableStorage(settings);
  for (const method of ["createTable", "createEntity", "upsertEntity", "updateEntity", "deleteEntity"] as const) {
    vi.spyOn(TableClient.prototype, method).mockRejectedValue(new Error("Unexpected write"));
  }
  reads = vi.spyOn(TableClient.prototype, "getEntity").mockRejectedValue(missing);
});

afterEach(() => {
  for (const method of ["createTable", "createEntity", "upsertEntity", "updateEntity", "deleteEntity"] as const) {
    expect(TableClient.prototype[method]).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
  configureTableStorage({ AzureWebJobsStorage: "UseDevelopmentStorage=true" });
});

it("reads canonical profiles without creating tables or rewriting rows", async () => {
  reads.mockResolvedValue(current);
  expect(await findProfileByExternalId("external")).toMatchObject({ internalId: "internal" });
  expect(await getProfileByInternalId("internal")).toMatchObject({ externalId: "external" });
});

it("does not consult the legacy index or migrate an internal-keyed profile", async () => {
  expect(await findProfileByExternalId("legacy-external")).toBeNull();
  expect(reads).toHaveBeenCalledTimes(1);
  expect(reads.mock.instances[0].tableName).toBe("Profiles");
  reads.mockClear();
  expect(await getProfileByInternalId("legacy-internal")).toBeNull();
  expect(reads).toHaveBeenCalledTimes(1);
  expect(reads.mock.instances[0].tableName).toBe("ProfileByInternalId");
});

it("does not accept legacy profile field names as current data", async () => {
  reads.mockResolvedValue({ partitionKey: "external", rowKey: "profile", internalId: "internal", externalId: "external" });
  expect(await findProfileByExternalId("external")).toBeNull();
});

it("propagates storage failures instead of treating them as missing profiles", async () => {
  reads.mockRejectedValue(new Error("Storage unavailable"));
  await expect(findProfileByExternalId("external")).rejects.toThrow("Storage unavailable");
});

it("keeps network traversal read-only when a friend profile is missing", async () => {
  vi.spyOn(TableClient.prototype, "listEntities").mockImplementation(function () {
    const client = this;
    const rows = (async function* () {
      if (client.tableName === "Profiles") {
        yield { partitionKey: "internal", rowKey: "friend:missing-friend", etag: "test",
          friend_internal_id: "missing-friend", friend_name: "Friend" };
      }
    })();
    return Object.assign(rows, {
      [Symbol.asyncIterator]() { return this; },
      byPage() { throw new Error("Pagination is not used by this read"); },
    });
  });
  expect(await listFriends("internal")).toEqual([
    { internalId: "missing-friend", name: "Friend", degree: 1, path: ["internal", "missing-friend"] },
  ]);
  expect(await getTableClient("Profiles")).toBe(await getTableClient("Profiles"));
});
