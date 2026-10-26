/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

export const QUESTION_DATA_TABLE = "QuestionData";
export const PROFILE_DISCLOSURES_TABLE = "ProfileDisclosures";

export interface TableStorageSettings {
  AzureWebJobsStorage?: string;
  AzureWebJobsStorage__tableServiceUri?: string;
  AzureWebJobsStorage__clientId?: string;
}

const clients = new Map<string, TableClient>();
let settings: TableStorageSettings | undefined;

export function configureTableStorage(tableStorageSettings: TableStorageSettings): void {
  settings = tableStorageSettings;
  clients.clear();
}

export async function getTableClient(tableName: string): Promise<TableClient> {
  let client = clients.get(tableName);
  if (!client) {
    const connectionString = settings?.AzureWebJobsStorage;
    if (connectionString) {
      client = TableClient.fromConnectionString(connectionString, tableName, {
        allowInsecureConnection: true,
      });
    } else {
      const tableServiceUri = settings?.AzureWebJobsStorage__tableServiceUri;
      if (!tableServiceUri) {
        throw new Error("Table storage is not configured: set AzureWebJobsStorage (local) or AzureWebJobsStorage__tableServiceUri.");
      }
      const credential = new DefaultAzureCredential(
        settings?.AzureWebJobsStorage__clientId ? { managedIdentityClientId: settings.AzureWebJobsStorage__clientId } : undefined
      );
      client = new TableClient(tableServiceUri, tableName, credential);
    }
    clients.set(tableName, client);
  }
  await client.createTable().catch(() => {});
  return client;
}

export function belongsToExperiment(row, profileIds, questionIds) {
  return (
    profileIds.has(row.profileId) ||
    profileIds.has(row.senderProfileId) ||
    profileIds.has(row.receiverProfileId) ||
    questionIds.has(row.questionId) ||
    questionIds.has(row.newQuestionId)
  );
}

export const isLocalAzurite = (connectionString = process.env.AzureWebJobsStorage) =>
  String(connectionString).includes("UseDevelopmentStorage=true");

export async function resetExperiment(profileIds) {
  const connectionString = process.env.AzureWebJobsStorage;
  if (!isLocalAzurite(connectionString)) {
    throw new Error("Experiment reset is allowed only for local Azurite runs");
  }
  configureTableStorage({ AzureWebJobsStorage: connectionString });

  const ids = new Set(profileIds);
  const questions = await getTableClient(QUESTION_DATA_TABLE);
  const rows = [];
  for await (const row of questions.listEntities()) rows.push(row);
  const questionIds = new Set(rows.filter((row) => ids.has(row.profileId) && row.questionText).map((row) => row.id));
  const doomed = rows.filter((row) => belongsToExperiment(row, ids, questionIds));
  await Promise.all(doomed.map((row) => questions.deleteEntity(row.partitionKey, row.rowKey)));

  const disclosures = await getTableClient(PROFILE_DISCLOSURES_TABLE);
  const disclosed = [];
  for await (const row of disclosures.listEntities()) {
    if (ids.has(row.partitionKey) || ids.has(row.rowKey)) disclosed.push(row);
  }
  await Promise.all(disclosed.map((row) => disclosures.deleteEntity(row.partitionKey, row.rowKey)));
  return { records: doomed.length, disclosures: disclosed.length };
}
