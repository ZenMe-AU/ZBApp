/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// The authenticated external id is the canonical Profile partition key. Q3
// relations use internal ids, so a compact internal-id index keeps them stable.

import { createHash, randomUUID } from "crypto";
import { odata } from "@azure/data-tables";
import { allowReadSideEffects, getTableClient, isNotFoundError } from "./init.mjs";

export const PROFILES_TABLE = "Profiles";
export const PROFILE_BY_INTERNAL_ID_TABLE = "ProfileByInternalId";
// Legacy read-only index. Keep it while existing profiles migrate on sign-in.
export const PROFILE_BY_EXTERNAL_ID_TABLE = "ProfileByExternalId";
export const PROFILE_DISCLOSURES_TABLE = "ProfileDisclosures";
const PROFILE_ROW_KEY = "profile";

export interface ProfileRecord {
  internalId: string;
  externalId: string;
  createdAt: string;
}

interface ProfileIndexEntity {
  partitionKey: string;
  rowKey: string;
  internal_id?: string;
  external_id?: string;
  // Read compatibility for entities created before the TypeScript migration.
  internalId?: string;
  externalId?: string;
  createdAt: string;
}

interface ProfileEntity extends ProfileIndexEntity {
  name?: string;
  preferred_name?: string;
  email?: string;
}

export interface ProfileDetails {
  name?: string;
  preferredName?: string;
  email?: string;
}

export interface ProfileListItem {
  id: string;
  name: string;
  isNameShared: boolean;
}

export interface EnsureProfileResult {
  profile: ProfileRecord;
  created: boolean;
}

export interface FriendRecord {
  internalId: string;
  name: string;
  degree: number;
  path: string[];
}

interface FriendEntity {
  partitionKey: string;
  rowKey: string;
  friend_internal_id: string;
  friend_name: string;
  createdAt: string;
}

function friendRowKey(friendInternalId: string): string {
  return `friend:${friendInternalId}`;
}

const FRIEND_ROW_KEY_START = "friend:";
const FRIEND_ROW_KEY_END = "friend;";

function anonymousName(internalId: string): string {
  const code = createHash("sha256").update(internalId).digest("hex").slice(0, 4).toUpperCase();
  return `Person ${code}`;
}

function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { statusCode?: number }).statusCode === 409;
}

function toProfileRecord(entity: ProfileIndexEntity): ProfileRecord {
  const internalId = entity.internal_id ?? entity.internalId;
  const externalId = entity.external_id ?? entity.externalId;
  if (!internalId || !externalId) throw new Error("Invalid profile entity");
  return { internalId, externalId, createdAt: entity.createdAt };
}

function toProfileEntity(profile: ProfileRecord, details: ProfileDetails): ProfileEntity {
  return {
    partitionKey: profile.externalId,
    rowKey: PROFILE_ROW_KEY,
    internal_id: profile.internalId,
    external_id: profile.externalId,
    createdAt: profile.createdAt,
    ...(details.name && { name: details.name }),
    preferred_name: details.preferredName ?? "",
    ...(details.email && { email: details.email }),
  };
}

function detailsFrom(entity: ProfileEntity | null): ProfileDetails {
  return {
    ...(entity?.name && { name: entity.name }),
    preferredName: entity?.preferred_name ?? "",
    ...(entity?.email && { email: entity.email }),
  };
}

async function getProfileEntity(partitionKey: string): Promise<ProfileEntity | null> {
  const client = await getTableClient(PROFILES_TABLE);
  try {
    const entity = await client.getEntity<ProfileEntity>(partitionKey, PROFILE_ROW_KEY);
    if (!allowReadSideEffects() && (!entity.internal_id || entity.external_id !== partitionKey)) return null;
    return entity;
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

async function getProfileEntityByInternalId(internalId: string): Promise<ProfileEntity | null> {
  const index = await getTableClient(PROFILE_BY_INTERNAL_ID_TABLE);
  try {
    const indexed = toProfileRecord(await index.getEntity<ProfileIndexEntity>(internalId, PROFILE_ROW_KEY));
    return getProfileEntity(indexed.externalId);
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  if (!allowReadSideEffects()) return null;
  const legacy = await getProfileEntity(internalId);
  if (!legacy) return null;
  const profile = await migrateLegacyProfile(toProfileRecord(legacy));
  return getProfileEntity(profile.externalId);
}

// Merge leaves a missing token claim untouched instead of clearing it.
async function upsertProfile(profile: ProfileRecord, details: ProfileDetails): Promise<void> {
  const client = await getTableClient(PROFILES_TABLE);
  await client.upsertEntity(toProfileEntity(profile, details), "Merge");
}

async function upsertInternalIdIndex(profile: ProfileRecord): Promise<void> {
  const client = await getTableClient(PROFILE_BY_INTERNAL_ID_TABLE);
  await client.upsertEntity<ProfileIndexEntity>(
    {
      partitionKey: profile.internalId,
      rowKey: PROFILE_ROW_KEY,
      internal_id: profile.internalId,
      external_id: profile.externalId,
      createdAt: profile.createdAt,
    },
    "Merge"
  );
}

async function findLegacyProfileByExternalId(externalId: string): Promise<ProfileRecord | null> {
  const client = await getTableClient(PROFILE_BY_EXTERNAL_ID_TABLE);
  try {
    return toProfileRecord(await client.getEntity<ProfileIndexEntity>(externalId, PROFILE_ROW_KEY));
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

async function migrateLegacyProfile(profile: ProfileRecord): Promise<ProfileRecord> {
  const legacy = await getProfileEntity(profile.internalId);
  await upsertProfile(profile, detailsFrom(legacy));
  await upsertInternalIdIndex(profile);
  return profile;
}

export async function ensureProfile(externalId: string, details: ProfileDetails = {}): Promise<EnsureProfileResult> {
  const existing = await getProfileEntity(externalId);
  if (existing) {
    const profile = toProfileRecord(existing);
    await upsertProfile(profile, { ...detailsFrom(existing), ...details });
    await upsertInternalIdIndex(profile);
    return { profile, created: false };
  }

  const legacy = await findLegacyProfileByExternalId(externalId);
  if (legacy) {
    await migrateLegacyProfile(legacy);
    await upsertProfile(legacy, details);
    return { profile: legacy, created: false };
  }

  const profile: ProfileRecord = {
    internalId: randomUUID(),
    externalId,
    createdAt: new Date().toISOString(),
  };
  const client = await getTableClient(PROFILES_TABLE);
  try {
    // Insert-only creation makes concurrent first sign-ins share one id.
    await client.createEntity(toProfileEntity(profile, details));
  } catch (err) {
    if (!isConflictError(err)) throw err;
    const concurrent = await getProfileEntity(externalId);
    if (!concurrent) throw err;
    const existingProfile = toProfileRecord(concurrent);
    await upsertProfile(existingProfile, { ...detailsFrom(concurrent), ...details });
    await upsertInternalIdIndex(existingProfile);
    return { profile: existingProfile, created: false };
  }

  await upsertInternalIdIndex(profile);
  return { profile, created: true };
}

export async function getProfileByInternalId(internalId: string): Promise<ProfileRecord | null> {
  const profile = await getProfileEntityByInternalId(internalId);
  return profile ? toProfileRecord(profile) : null;
}

export async function findProfileByExternalId(externalId: string): Promise<ProfileRecord | null> {
  const profile = await getProfileEntity(externalId);
  if (profile) return toProfileRecord(profile);
  if (!allowReadSideEffects()) return null;
  const legacy = await findLegacyProfileByExternalId(externalId);
  return legacy ? migrateLegacyProfile(legacy) : null;
}

export async function createProfile(externalId: string): Promise<ProfileRecord> {
  return (await ensureProfile(externalId)).profile;
}

export async function updatePreferredName(externalId: string, preferredName: string): Promise<ProfileRecord> {
  const { profile } = await ensureProfile(externalId);
  await upsertProfile(profile, { preferredName });
  return profile;
}

async function upsertFriend(owner: ProfileRecord, friend: ProfileRecord, friendName: string): Promise<void> {
  const client = await getTableClient(PROFILES_TABLE);
  await client.upsertEntity<FriendEntity>(
    {
      partitionKey: owner.internalId,
      rowKey: friendRowKey(friend.internalId),
      friend_internal_id: friend.internalId,
      friend_name: friendName,
      createdAt: new Date().toISOString(),
    },
    "Merge"
  );
}

export async function addFriend(profileId: string, friendId: string): Promise<FriendRecord> {
  if (!friendId || profileId === friendId) {
    const error = new Error("A profile cannot add itself as a friend");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const [profileEntity, friendEntity] = await Promise.all([getProfileEntityByInternalId(profileId), getProfileEntityByInternalId(friendId)]);
  if (!profileEntity || !friendEntity) {
    const error = new Error("Friend profile not found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const profile = toProfileRecord(profileEntity);
  const friend = toProfileRecord(friendEntity);
  const profileName = profileEntity.preferred_name || profileEntity.name || "";
  const friendName = friendEntity.preferred_name || friendEntity.name || "";
  // shortcut: Azure Table cannot atomically write two partitions; retrying this idempotent call repairs a partial pair.
  await Promise.all([upsertFriend(profile, friend, friendName), upsertFriend(friend, profile, profileName)]);
  return { internalId: friend.internalId, name: friendName, degree: 1, path: [profileId, friend.internalId] };
}

async function listDirectFriends(profileId: string): Promise<FriendEntity[]> {
  const client = await getTableClient(PROFILES_TABLE);
  const rows = client.listEntities<FriendEntity>({
    queryOptions: { filter: odata`PartitionKey eq ${profileId} and RowKey ge ${FRIEND_ROW_KEY_START} and RowKey lt ${FRIEND_ROW_KEY_END}` },
  });
  const friends: FriendEntity[] = [];
  for await (const row of rows) {
    if (row.friend_internal_id && row.friend_name !== undefined) friends.push(row);
  }
  return friends;
}

export async function listFriends(profileId: string): Promise<FriendRecord[]> {
  const visited = new Set([profileId]);
  const friends: FriendRecord[] = [];

  const visit = async (frontier: { internalId: string; path: string[] }[], degree: number): Promise<void> => {
    if (degree > 4 || !frontier.length) return;
    const rows = await Promise.all(frontier.map(async (item) => ({ item, friends: await listDirectFriends(item.internalId) })));
    const next: { internalId: string; path: string[] }[] = [];
    for (const { item, friends: directFriends } of rows) {
      for (const friend of directFriends) {
        if (visited.has(friend.friend_internal_id)) continue;
        visited.add(friend.friend_internal_id);
        const path = [...item.path, friend.friend_internal_id];
        const current = await getProfileEntityByInternalId(friend.friend_internal_id);
        const name = current?.preferred_name || current?.name || friend.friend_name || anonymousName(friend.friend_internal_id);
        next.push({ internalId: friend.friend_internal_id, path });
        friends.push({ internalId: friend.friend_internal_id, name, degree, path });
      }
    }
    await visit(next, degree + 1);
  };

  await visit([{ internalId: profileId, path: [profileId] }], 1);
  return friends;
}

export async function assertProfileExists(internalId: string): Promise<void> {
  if (!(await getProfileByInternalId(internalId))) {
    throw new Error(`Profile not found for profileId: ${internalId}`);
  }
}

export async function shareName(senderId: string, receiverId: string): Promise<void> {
  if (senderId === receiverId) throw new Error("A profile cannot share its name with itself");
  await assertProfileExists(receiverId);
  const client = await getTableClient(PROFILE_DISCLOSURES_TABLE);
  await client.upsertEntity({
    partitionKey: receiverId,
    rowKey: senderId,
    sharedAt: new Date().toISOString(),
  });
}

export async function listProfiles(excludeInternalId: string, limit = 200, identityBlind = false): Promise<ProfileListItem[]> {
  const client = await getTableClient(PROFILES_TABLE);
  const disclosures = await getTableClient(PROFILE_DISCLOSURES_TABLE);
  const sharedNames = new Set<string>();
  for await (const row of disclosures.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${excludeInternalId}` } })) {
    sharedNames.add(row.rowKey);
  }
  const rows = client.listEntities<ProfileEntity>({
    queryOptions: { select: ["internal_id", "internalId", "external_id", "externalId", "name", "preferred_name", "email"] },
  });
  const profiles: ProfileListItem[] = [];
  for await (const row of rows) {
    const id = row.internal_id ?? row.internalId;
    const externalId = row.external_id ?? row.externalId;
    const displayName = row.preferred_name || row.name;
    if (!id || !externalId || row.partitionKey !== externalId || !displayName || id === excludeInternalId) continue;
    const isNameShared = !identityBlind || sharedNames.has(id);
    profiles.push({ id, name: isNameShared ? displayName : anonymousName(id), isNameShared });
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}
