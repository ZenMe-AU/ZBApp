/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { findProfileByExternalId, getProfileByInternalId } from "../repository/table/profileRepository.mjs";

export async function toExternalProfileId(internalId: string): Promise<string> {
  const profile = await getProfileByInternalId(internalId);
  if (!profile) throw new Error(`Profile not found for profileId: ${internalId}`);
  return profile.externalId;
}

export async function toInternalProfileId(externalId: string): Promise<string> {
  const profile = await findProfileByExternalId(externalId);
  if (!profile) throw new Error(`Profile not found for externalId: ${externalId}`);
  return profile.internalId;
}
