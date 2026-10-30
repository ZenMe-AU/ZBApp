/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("followUpFilter", {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    order: { type: DataTypes.SMALLINT, allowNull: false, primaryKey: true },
    senderProfileId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { table: "profile", key: "internal_id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    refQuestionId: { type: DataTypes.UUID, allowNull: false },
    refOption: { type: DataTypes.JSON, allowNull: false },
    newQuestionId: { type: DataTypes.UUID, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("followUpFilter");
}
