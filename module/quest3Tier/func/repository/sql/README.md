# Sequelize Repository

 This is the Sequelize reporistory for this function. It can connect to any SQL based data store.

## API schema parity

SQL schema changes are managed by `deploy/db/migration`. `questionAnswer` stores
the recipient profile and pairwise ID returned by the answer APIs, and
`profileFriend` stores the reciprocal edges used by the profile friend APIs.
### Fresh-database baseline

The migrations are consolidated into twelve creation migrations, one per table.
They include all current columns and foreign keys, with `profile` created first.
Each migration creates its table and constraints in one statement; rollback drops
tables in reverse dependency order. Legacy data backfills are no longer needed.

This baseline requires an empty database (including an empty migration history).
It is not an upgrade path for a database using the old migrations. After recreating
the local database, run `pnpm run dbmigrate:local` from the function directory using
a schema-admin account. `build:deploy-db` clears its generated `dist/migrate`
directory before compiling so obsolete migrations cannot run alongside the baseline.
The application build also refreshes its compiled migrations so startup checks use
the same baseline as the migration runner.
The runtime application account should not have schema-changing permissions.

## Repository tests

Run the SQL and Azure Table contracts from the repository root:

```powershell
pnpm --dir module\quest3Tier\func exec vitest --root ..\..\.. run module\quest3Tier\func\vitest\testRepositories.test.mts
```

The SQL database must be migrated and the Table emulator available using the
function's local settings. The root uses Vite 7 with `@vitejs/plugin-react` 5;
plugin 6 requires Vite 8 and causes `vite/internal` import failures during VS Code
test discovery. After dependency changes, reload the VS Code window if discovery
still reports the old version.

# TODO
1. This folder is incorrectly called model, it should be called Sequelize based on the data store type that's used for this repository.


## Design decisions
1. The repository folder has an interface file that defines its public interface.
2. Any data storage dependencies must be defined in the data storage specific subfolder, for example the sequelize subfolder is a copy of the repository dedicated to dealing with backend SQL data storage. Other backend storage technologies may be added as subfolder here later.
3. Use singular for folders that contain many items of a type.
