# DOST Caraga procurement system: CI/CD and production deployment

This repository contains continuous integration and a guarded automatic production
deployment. CI runs for every push and pull request. CD runs only after CI succeeds
for `main` and `PRODUCTION_DEPLOY_ENABLED` is set to `true`.

## Pipeline

CI (`.github/workflows/ci.yml`) performs:

1. Frontend locked install, ESLint, TypeScript checking, production build, and an
   HTTP smoke test of the built TanStack Start server.
2. Backend Composer validation and the complete PHPUnit suite against disposable
   PostgreSQL 16 and PostgreSQL 18 databases.

CD (`.github/workflows/deploy-production.yml`) performs:

1. Checks out the exact commit that passed CI.
2. Joins the private tailnet with the official Tailscale GitHub Action.
3. Connects with a dedicated SSH key and a verified host key.
4. Creates a separate release worktree, installs dependencies, and builds it.
5. Backs up PostgreSQL and Laravel storage before running migrations.
6. Atomically changes the `current` symlink, restarts services, and checks both apps.
7. Restores the previous code release if activation or health checks fail. Database
   migrations are not automatically reversed; use the backup for migration recovery.

Production secrets are never copied into GitHub. The Laravel `.env`, `APP_KEY`,
database credentials, and uploaded files stay under the server's shared directory.

## Production layout

The one-time bootstrap changes the application to this layout:

```text
/home/talinoserver2/apps/dost-caraga-pr/
├── current -> releases/<full-git-sha>
├── releases/<full-git-sha>/
├── shared/backend.env
├── shared/storage/
└── backups/<timestamp>-<full-git-sha>/
```

The source repository remains at
`/home/talinoserver2/Documents/dost-caraga-pr` and supplies Git worktrees. Deployments
do not remove old releases automatically.

Nginx continues listening on `127.0.0.1:5173`, so the existing Cloudflare tunnel
origin does not change. Nginx routes `/api/*` to Laravel on port 8000 and everything
else to the production TanStack server on port 5175.

Locked installs explicitly use npm 11.10.0. The project has one direct SheetJS tarball
from the vendor CDN; npm 12 blocks remote tarballs by default. Pinning the installer
preserves the existing lockfile without weakening npm 12's policy for future packages.

## Required security step

Rotate the Cloudflare tunnel token before enabling CD. It was stored directly in the
existing systemd command and was exposed during server inspection. Do not put the
replacement token in this repository or in the GitHub deployment workflow. Store it
using a protected systemd environment file or a Cloudflare-managed tunnel credential.

## One-time server bootstrap

Do these steps from the server console or a trusted SSH session. Review production
environment values first:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://pr.dostcaraga.ph
FRONTEND_URL=https://pr.dostcaraga.ph
APP_TIMEZONE=Asia/Manila
LOG_LEVEL=warning
VITE_API_BASE_URL=/api/v1
```

Keep the existing `APP_KEY`, database settings, mail settings, and storage. The current
`QUEUE_CONNECTION=sync` is supported; the bootstrap only installs a queue worker when
the connection is `database`, `redis`, or `sqs`.

Update the checkout to the tested `main` revision, then run:

```bash
cd /home/talinoserver2/Documents/dost-caraga-pr
bash scripts/bootstrap-production.sh --apply
```

The command deliberately requires `--apply`. It causes brief downtime, copies the
current `.env` and storage into the shared area, makes an initial backup, builds the
release, installs the systemd/Nginx configuration, and checks ports 8000, 5175, and
5173. It does not alter the Cloudflare tunnel configuration.

The templates assume the deployment user is `talinoserver2`, npm is
`/usr/local/bin/npm`, and the paths above are unchanged. Edit the tracked templates
before bootstrap if an assumption changes.

## GitHub configuration

Create a GitHub environment named `production`. An approval rule is recommended for
the first few deployments.

Create a dedicated Ed25519 deployment key. Put only its public key in the server user's
`~/.ssh/authorized_keys`; store its private key in GitHub. Verify the server SSH host
key over a trusted connection before storing `known_hosts`—do not blindly trust an
unverified `ssh-keyscan` result.

Create a Tailscale OAuth client allowed to advertise the deployment tag, and permit
that tag to reach SSH on this server in the tailnet ACL. Configure these GitHub
environment secrets:

| Secret | Value |
| --- | --- |
| `TS_OAUTH_CLIENT_ID` | Dedicated Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Dedicated Tailscale OAuth client secret |
| `DEPLOY_SSH_PRIVATE_KEY` | Private half of the dedicated deployment key |
| `DEPLOY_SSH_KNOWN_HOSTS` | Verified `known_hosts` line for the deployment host |

Configure these repository variables (the enable flag must be repository-level because
GitHub evaluates it before the deployment environment starts):

| Variable | Value |
| --- | --- |
| `TAILSCALE_TAG` | `tag:github-actions` (or the tag authorized in the tailnet) |
| `PRODUCTION_DEPLOY_HOST` | `100.72.4.80` |
| `PRODUCTION_DEPLOY_USER` | `talinoserver2` |
| `PRODUCTION_SOURCE_PATH` | `/home/talinoserver2/Documents/dost-caraga-pr` |
| `PRODUCTION_DEPLOY_ROOT` | `/home/talinoserver2/apps/dost-caraga-pr` |
| `PRODUCTION_DEPLOY_ENABLED` | Keep `false` through bootstrap and review; then set `true` |

No deployment job runs while `PRODUCTION_DEPLOY_ENABLED` is absent or not exactly
`true`. After it is enabled, each successful CI run for `main` deploys automatically.

## Recovery and operation

Backups are written before every migration to the server-only `backups` directory.
Each contains a custom-format PostgreSQL dump and `storage.tar.gz`. Restore a database
dump only after reviewing the failed migration and taking a fresh copy of current state.

Useful checks on the server:

```bash
systemctl status dost-caraga-pr-backend.service --no-pager
systemctl status dost-caraga-pr-frontend.service --no-pager
systemctl status dost-caraga-pr-scheduler.service --no-pager
curl --fail http://127.0.0.1:8000/up
curl --fail http://127.0.0.1:5175/login
curl --fail -H 'Host: pr.dostcaraga.ph' http://127.0.0.1:5173/login
```

To stop automatic deployments without changing code, set
`PRODUCTION_DEPLOY_ENABLED` to `false`. CI continues to run.
