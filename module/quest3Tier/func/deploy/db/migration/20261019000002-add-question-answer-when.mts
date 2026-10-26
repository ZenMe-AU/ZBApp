/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

interface MigrationQueryInterface {
  addColumn(tableName: string, columnName: string, attribute: unknown): Promise<unknown>;
  removeColumn(tableName: string, columnName: string): Promise<unknown>;
}

interface SequelizeDataTypes {
  STRING: unknown;
}

export async function up(queryInterface: MigrationQueryInterface, Sequelize: SequelizeDataTypes): Promise<void> {
  await queryInterface.addColumn("questionAnswer", "when", { type: Sequelize.STRING, allowNull: true });
}

export async function down(queryInterface: MigrationQueryInterface): Promise<void> {
  await queryInterface.removeColumn("questionAnswer", "when");
}
