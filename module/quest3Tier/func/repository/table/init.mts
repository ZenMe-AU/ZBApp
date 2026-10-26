/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Use a connection string for local Azurite and managed identity in Azure.
// No ORM or model loader: one TableClient per table name.

import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

export interface TableStorageSettings {
  AzureWebJobsStorage?: string;
  AzureWebJobsStorage__tableServiceUri?: string;
  AzureWebJobsStorage__clientId?: string;
}

const clients = new Map<string, TableClient>();
const ensuredTables = new Set<string>();
let settings: TableStorageSettings | undefined;

export function configureTableStorage(tableStorageSettings: TableStorageSettings): void {
  settings = tableStorageSettings;
  clients.clear();
  ensuredTables.clear();
}

function buildClient(tableName: string): TableClient {
  // Local dev / Azurite: AzureWebJobsStorage is already the connection
  // string used by the Functions host itself (see local.settings.json).
  const connectionString = settings?.AzureWebJobsStorage;
  if (connectionString) {
    return TableClient.fromConnectionString(connectionString, tableName, {
      allowInsecureConnection: true,
    });
  }

  // Azure: the Function App is already configured with a table endpoint and
  // a user-assigned identity (see deploy/env/functionApps/functionApps.tf).
  const tableServiceUri = settings?.AzureWebJobsStorage__tableServiceUri;
  if (!tableServiceUri) {
    throw new Error("Table storage is not configured: set AzureWebJobsStorage (local) or AzureWebJobsStorage__tableServiceUri (Azure).");
  }
  const managedIdentityClientId = settings?.AzureWebJobsStorage__clientId;
  const credential = new DefaultAzureCredential(managedIdentityClientId ? { managedIdentityClientId } : undefined);
  return new TableClient(tableServiceUri, tableName, credential);
}

export async function getTableClient(tableName: string): Promise<TableClient> {
  let client = clients.get(tableName);
  if (!client) {
    client = buildClient(tableName);
    clients.set(tableName, client);
  }
  if (!ensuredTables.has(tableName)) {
    await client.createTable(); // TODO: RBAC non compliance, app code must not change infrastructure. Move this to a migration script that is run by a separate admin account.
    ensuredTables.add(tableName);
  }
  return client;
}

export function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { statusCode?: number }).statusCode === 404;
}
