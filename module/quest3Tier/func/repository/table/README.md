# Q3 Azure Table repositories

Q3 uses three Azure tables:

| Table | Purpose |
|---|---|
| `Profiles` | Profiles keyed by internal profile ID, with display names and reciprocal friend edges |
| `ProfileByExternalId` | External-to-internal profile ID lookup |
| `QuestionData` | Questions, answers (including recipient and pairwise IDs), and shares |

`QuestionData` uses `PartitionKey = profileId` and record-prefixed RowKeys
such as `question:<questionId>` and `answer:<questionId>:<answerId>`.

Local clients use the `AzureWebJobsStorage` Azurite connection string. Azure
clients use `AzureWebJobsStorage__tableServiceUri` and the Function App's
managed identity.

Run `pnpm run build`, `pnpm run test:profile`, and `pnpm run test:table` from
`module/quest3Tier/func` after changing a repository.
