/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("questionShareCmd", {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    correlationId: { type: DataTypes.UUID, allowNull: true },
    senderProfileId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    action: { type: DataTypes.STRING, allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("questionShareCmd");
}
