/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { DataTypes, type Sequelize } from "@sequelize/core";

export async function up(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.removeColumn("questionAnswer", "optionId");
}

export async function down(queryInterface: Sequelize["queryInterface"]): Promise<void> {
  await queryInterface.addColumn("questionAnswer", "optionId", { type: DataTypes.STRING, allowNull: true });
}
