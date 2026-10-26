# Welcome to React Router!

## Development

1. Add `env.json` with proper data

2. Choose a dev mode:

### Standard dev (host only)

```sh
pnpm run dev
```

Runs the React Router dev server. Use this when you are not working on federated remote modules.

### Module Federation dev (host + remotes)

```sh
pnpm run dev:federation
```

Starts the full micro-frontend stack in one command. It runs three processes via `concurrently`:

| Script                 | Purpose                                 | Port(s)          |
| ---------------------- | --------------------------------------- | ---------------- |
| `dev:federation`       | Runs all federation processes together  | —                |
| `mf:providers:watch`   | Rebuilds remote modules on file changes | —                |
| `mf:providers:preview` | Serves built remotes                    | 5174, 5175, 5176 |
| `mf:host:dev`          | Runs the host shell                     | 5173             |

Remotes:

- `question-ui` (quest3Tier) → http://localhost:5174
- `quest5Tier-ui` → http://localhost:5175
- `quest-ui` → http://localhost:5176 

The host loads `remoteEntry.js` from those URLs (see `vite.config.ts`). Remote URLs can be overridden with `VITE_QUEST3TIER_REMOTE_URL`, `VITE_QUEST5TIER_REMOTE_URL`, and `VITE_QUEST5TIEREG_REMOTE_URL`.

To run pieces individually (e.g. when remotes are already running elsewhere):

```sh
pnpm run mf:host:dev
```

1. Run pnpm i
1. Copy env.json.example and rename to `env.json`
1. Open MS Entra ID and create a new app registration called 'Localhost Dev App on Port 5173'
1. Copy the Application (client) ID and Directory (tenant) ID
1. Edit ui\auth\msalInstance.ts and insert the above Client ID and Tenant ID.
1. Run `pnpm run dev`

## Deployment

First, build your app for production:

```sh
pnpm run build
```

Then run the app in production mode:

```sh
pnpm start
```

Now you'll need to pick a host to deploy it to.

# ui

This folder contains the frontend application, built with React and Vite. It includes all client-side code, components, and assets.
