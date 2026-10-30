/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.createTable("profile", {
    internal_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    external_id: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: true },
    preferred_name: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.dropTable("profile");
}
