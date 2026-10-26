/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

interface MigrationQueryInterface {
  addColumn(tableName: string, columnName: string, attribute: unknown): Promise<unknown>;
  removeColumn(tableName: string, columnName: string): Promise<unknown>;
}

interface SequelizeDataTypes {
  UUID: unknown;
}

export async function up(queryInterface: MigrationQueryInterface, Sequelize: SequelizeDataTypes): Promise<void> {
  await queryInterface.addColumn("questionShare", "questionId", { type: Sequelize.UUID, allowNull: true });
}

export async function down(queryInterface: MigrationQueryInterface): Promise<void> {
  await queryInterface.removeColumn("questionShare", "questionId");
}
