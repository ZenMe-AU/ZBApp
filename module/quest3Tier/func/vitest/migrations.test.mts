/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readdir } from "node:fs/promises";
import { Sequelize } from "@sequelize/core";
import { PostgresDialect } from "@sequelize/postgres";
import { expect, it, vi } from "vitest";

interface Migration {
  up(queryInterface: Sequelize["queryInterface"]): Promise<void>;
  down(queryInterface: Sequelize["queryInterface"]): Promise<void>;
}

it("creates one complete table per migration in foreign-key order and drops them in reverse order", async () => {
  const migrationDir = new URL("../deploy/db/migration/", import.meta.url);
  const names = (await readdir(migrationDir)).filter((name) => name.endsWith(".mts")).sort();
  const expectedTables = [
    "profile", "question", "questionAnswer", "questionShare", "logQuestion", "questionAction",
    "followUpCmd", "followUpEvent", "followUpFilter", "questionShareCmd", "questionShareEvent", "profileFriend",
  ];
  expect(names).toHaveLength(expectedTables.length);
  expect(names.map((name) => name.match(/-create-(.+)-table\.mts$/)?.[1])).toEqual(expectedTables);

  const sequelize = new Sequelize({ dialect: PostgresDialect, logging: false });
  const query = vi.spyOn(sequelize, "queryRaw").mockResolvedValue([[], {}]);
  const migrations: Migration[] = [];
  const createSql = new Map<string, string>();
  try {
    for (const [index, name] of names.entries()) {
      const migration: Migration = await import(new URL(name, migrationDir).href);
      migrations.push(migration);
      query.mockClear();
      await migration.up(sequelize.queryInterface);
      expect(query).toHaveBeenCalledTimes(1);
      const sql = query.mock.calls[0][0];
      expect(typeof sql).toBe("string");
      if (typeof sql !== "string") throw new Error("Expected generated SQL to be a string");
      const table = expectedTables[index];
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      for (const reference of sql.matchAll(/REFERENCES "([^"]+)"/g)) {
        expect([...createSql.keys(), table]).toContain(reference[1]);
      }
      createSql.set(table, sql);
    }

    expect(createSql.get("profile")).toContain('"preferred_name" VARCHAR(255) NOT NULL DEFAULT \'\'');
    expect(createSql.get("profile")).toContain('"name" VARCHAR(255)');
    expect(createSql.get("question")).toContain('"optionList" JSON');
    expect(createSql.get("questionAnswer")).toContain('"optionAnswerList" JSON');
    expect(createSql.get("questionAnswer")).toContain('"when" VARCHAR(255)');
    expect(createSql.get("questionAnswer")).toContain('"recipientProfileId" UUID REFERENCES "profile" ("internal_id")');
    expect(createSql.get("questionAnswer")).toContain('"pairwiseId" VARCHAR(64)');
    expect(createSql.get("questionShare")).toContain('"questionId" UUID');
    expect(createSql.get("questionShare")).toContain('REFERENCES "question" ("id") ON DELETE CASCADE');
    expect(createSql.get("logQuestion")).toContain('"lastEventId" UUID REFERENCES "logQuestion" ("id")');
    expect(createSql.get("followUpFilter")).toContain('PRIMARY KEY ("id", "order")');
    expect(createSql.get("profileFriend")).toContain('PRIMARY KEY ("profileId", "friendProfileId")');
    expect(createSql.get("profileFriend")?.match(/ON DELETE CASCADE ON UPDATE CASCADE/g)).toHaveLength(2);
    for (const table of expectedTables.filter((table) => table !== "profile" && table !== "profileFriend")) {
      expect(createSql.get(table)).toContain('REFERENCES "profile" ("internal_id") ON DELETE RESTRICT ON UPDATE CASCADE');
    }

    for (const [index, migration] of migrations.reverse().entries()) {
      query.mockClear();
      await migration.down(sequelize.queryInterface);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        `DROP TABLE IF EXISTS "${expectedTables[expectedTables.length - 1 - index]}"`,
        undefined
      );
    }
  } finally {
    query.mockRestore();
    await sequelize.close();
  }
});
