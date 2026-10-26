/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { jwtFetch } from "./jwtFetch";
import { getConfig, loadConfig } from "../config/loadConfig";

export interface ShareFriend {
  id: string;
  name: string;
  degree: number;
}

export async function getMyProfileId(): Promise<string> {
  await loadConfig();
  const response = await jwtFetch(`${getConfig("QUEST3TIER_DOMAIN")}/profile/me`, { method: "GET" });
  if (!response.ok) throw new Error("Failed to load current profile");
  const data = await response.json();
  return data.return.id;
}

export async function getShareFriends(): Promise<ShareFriend[]> {
  await loadConfig();
  const response = await jwtFetch(`${getConfig("QUEST3TIER_DOMAIN")}/profile/me/friends`, { method: "GET" });
  if (!response.ok) throw new Error("Failed to fetch friends list");
  const data = await response.json();
  return data.return.list;
}

export async function addFriend(profileId: string): Promise<ShareFriend> {
  await loadConfig();
  const response = await jwtFetch(`${getConfig("QUEST3TIER_DOMAIN")}/profile/me/friends/${encodeURIComponent(profileId)}`, { method: "PUT" });
  if (!response.ok) throw new Error("Failed to add friend");
  const data = await response.json();
  return data.return;
}
