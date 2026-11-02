/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("profileFriend", {
    profileId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    friendProfileId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    friendName: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("profileFriend");
}
