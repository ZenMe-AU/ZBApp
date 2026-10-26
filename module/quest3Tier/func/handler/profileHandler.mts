/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { updatePreferredName } from "../service/profile.mjs";
import { getRepository } from "../repository/getRepository.mjs";
import { toExternalProfileId, toInternalProfileId } from "./profileId.mjs";

async function GetMyProfile(request, context) {
  return { return: { id: request.userData.externalId } };
}

async function UpdateMyProfile(request, context) {
  const { preferredName } = request.clientParams;
  const profile = await updatePreferredName(request.userData.externalId, preferredName);
  return { return: { id: request.userData.externalId, preferredName } };
}

async function AddMyFriend(request, context) {
  const friend = await getRepository().addFriend(request.userData.profileId, await toInternalProfileId(request.params.id));
  return { return: { ...friend, id: await toExternalProfileId(friend.id) } };
}

async function GetMyFriends(request, context) {
  const friends = await getRepository().listFriends(request.userData.profileId);
  return { return: { list: await Promise.all(friends.map(async (friend) => ({ ...friend, id: await toExternalProfileId(friend.id) }))) } };
}

export default {
  GetMyProfile,
  UpdateMyProfile,
  AddMyFriend,
  GetMyFriends,
};
