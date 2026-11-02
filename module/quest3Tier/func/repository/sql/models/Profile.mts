/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export default (sequelize, DataTypes) => {
  return sequelize.define(
    "Profile",
    {
      internal_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      external_id: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: true },
      preferred_name: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
    },
    { tableName: "profile", updatedAt: false }
  );
};
