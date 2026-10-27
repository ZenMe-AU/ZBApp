/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("logQuestion", {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    questionId: { type: DataTypes.UUID, allowNull: false, references: { table: "question", key: "id" } },
    action: { type: DataTypes.STRING, allowNull: false },
    profileId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    originalData: { type: DataTypes.JSON, allowNull: true },
    actionData: { type: DataTypes.JSON, allowNull: false },
    lastEventId: { type: DataTypes.UUID, allowNull: true, references: { table: "logQuestion", key: "id" } },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("logQuestion");
}
