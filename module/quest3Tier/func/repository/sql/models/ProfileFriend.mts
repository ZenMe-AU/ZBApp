/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export default (sequelize, DataTypes) =>
  sequelize.define(
    "ProfileFriend",
    {
      profileId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      friendProfileId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      friendName: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
    },
    { tableName: "profileFriend", updatedAt: false }
  );
