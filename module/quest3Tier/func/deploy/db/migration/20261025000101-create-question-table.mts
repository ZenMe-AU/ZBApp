/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("question", {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    profileId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    title: { type: DataTypes.STRING, allowNull: true },
    questionText: { type: DataTypes.TEXT, allowNull: false },
    option: { type: DataTypes.JSON, allowNull: true },
    optionList: { type: DataTypes.JSON, allowNull: true },
    eventId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("question");
}
