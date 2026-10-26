/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

interface MigrationQueryInterface {
  addColumn(tableName: string, columnName: string, definition: { type: unknown; allowNull: boolean }): Promise<unknown>;
  removeColumn(tableName: string, columnName: string): Promise<unknown>;
}

interface SequelizeDataTypes {
  STRING: unknown;
}

export async function up(queryInterface: MigrationQueryInterface): Promise<void> {
  await queryInterface.removeColumn("questionAnswer", "optionId");
}

export async function down(queryInterface: MigrationQueryInterface, Sequelize: SequelizeDataTypes): Promise<void> {
  await queryInterface.addColumn("questionAnswer", "optionId", { type: Sequelize.STRING, allowNull: true });
}
