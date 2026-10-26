/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

interface MigrationQueryInterface {
  addColumn(tableName: string, columnName: string, attribute: unknown): Promise<unknown>;
  removeColumn(tableName: string, columnName: string): Promise<unknown>;
}

interface SequelizeDataTypes {
  JSON: unknown;
}

export async function up(queryInterface: MigrationQueryInterface, Sequelize: SequelizeDataTypes): Promise<void> {
  await queryInterface.addColumn("question", "optionList", { type: Sequelize.JSON, allowNull: true });
}

export async function down(queryInterface: MigrationQueryInterface): Promise<void> {
  await queryInterface.removeColumn("question", "optionList");
}
