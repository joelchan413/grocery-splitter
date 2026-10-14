# 🛒 GrocerySplit

A collaborative receipt-scanning and grocery-splitting web application designed for roommates.

## ✨ Features

- 📸 **Receipt Scanning (Codex CLI)**: Upload 1–3 receipt photos or choose pre-configured sample receipts (Trader Joe's, Costco).
- 🏷️ **Proportional Tax Attribution (ADR 0001)**: Sales tax applies **only** to roommates who claimed taxable items, weighted proportionally by their taxable item subtotal.
- 🏡 **Household Shared Staples**: Unclaimed items and leftover quantities automatically split 4 ways across all household roommates.
- 👥 **1-Tap Collaborative Claiming**: Claim individual items, specific counts (e.g. 2 of 3 avocados), or split with custom sub-groups.
- ✅ **"Ready" Check-in**: Track roommate progress with celebratory feedback.
- ⚡ **Venmo Deep Links**: 1-tap "Pay with Venmo" buttons pre-loaded with recipient handle, exact dollar balance, and note.
- 📋 **Group Chat Summary**: Copy formatted markdown/text summaries for iMessage or WhatsApp in one tap.
- 📜 **Trip History Archive**: Look back at past grocery runs and their item breakdowns.

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Sign in to Codex for receipt scanning

Install the same CLI version used by Docker and sign in as the user running Next.js:

```bash
npm install -g @openai/codex@0.160.1
codex -c 'cli_auth_credentials_store="file"' login
```

The app uses the saved server login through `codex exec`; it does not require a Gemini or OpenAI API key. Sample receipts work without signing in. Settings shows whether the server has a saved login. This checks the local login, not model availability or remaining account usage.

The CLI selects its default model unless `RECEIPT_CODEX_MODEL` is set in the server environment. Other user CLI configuration is ignored for receipt scans. For local Next.js development, put this optional setting in `.env.local`. On Windows, install the native executable and set `RECEIPT_CODEX_BIN` to its absolute path if `codex` resolves to an npm `.cmd` wrapper.

JPEG, PNG, and WebP photos are supported, up to 8 MB each. Each scan runs in a separate temporary directory with a read-only sandbox, shell commands and web search disabled, and a two-minute timeout. Temporary photos are deleted after each attempt. One scan runs at a time; overlapping requests receive a retry message. Receipt photos are sent to OpenAI and scans count toward the signed-in account's Codex limits. Authentication may occasionally need to be renewed.

### 🐳 Run with Docker
You can build and run the production container with Docker Compose:

```bash
docker compose up -d --build
```
The app will be accessible at [http://localhost:3000](http://localhost:3000).

Sign in once inside the running container using its app user:

```bash
docker compose exec --user nextjs grocery-splitter \
  codex -c 'cli_auth_credentials_store="file"' login --device-auth
```

Enable device code login in your ChatGPT account's security settings if needed, open the link printed by Codex, and enter the one-time code. Verify the saved login with:

```bash
docker compose exec --user nextjs grocery-splitter \
  codex -c 'cli_auth_credentials_store="file"' login status
```

On servers where your user cannot access Docker directly, prefix Docker commands with `sudo`. The bind mount `./codex-home:/app/codex-home` and `CODEX_HOME=/app/codex-home` keep credentials and refreshed tokens across container rebuilds. The entrypoint sets ownership for the app user and restricts the folder's permissions. This folder is ignored by Git and excluded from builds; protect it like a password and do not share its contents.

For a custom model, set `RECEIPT_CODEX_MODEL` in `.env` or `.env.local` and recreate the container with `docker compose up -d`. Old Gemini API keys and browser model preferences are no longer used. The Settings dialog lets any roommate check the server login without seeing credentials.

Trip and household data live in `data/database.json` on the Docker host. Docker Compose bind-mounts this directory into the container, so it survives `docker compose down` and image rebuilds. The file is ignored by Git and excluded from the Docker image. Back it up before deploying or moving hosts.

The container makes the mounted directory writable for its non-root app user at startup. If a database write or read fails, the API returns an error rather than silently using in-memory changes or overwriting a damaged file.

If you deployed an earlier version that tracked `data/database.json`, preserve a copy outside the repository before pulling this change. Git may delete or refuse to replace a locally modified tracked file during that pull. Restore the backup to `data/database.json` before starting the new container.

### Automated redeployment

On the Linux Docker host, redeploy an existing running Compose installation with:

```bash
bash scripts/redeploy.sh --check
bash scripts/redeploy.sh
```

Run both commands with `sudo` if Docker or the persistent folders require it. The
script needs Bash, Docker Compose v2, `flock`, `realpath`, and `tar`. It resolves
the checkout from its own location, so automation can invoke it by absolute path.
Schedule all deployments under the same OS account so they share its lock.

The script deploys the current checkout. Update and review the code before running
it. It validates the existing container's bind mounts, builds a separate image
while the app stays online, stops the app, and archives `data` and `codex-home`.
It then recreates the service and checks the home page, household API, and trip
history API inside the container. Expect a short outage during backup and startup.
These checks do not verify your reverse proxy or external network access.

If the build fails, the existing app keeps running. If backup fails, the original
container restarts. If replacement or HTTP checks fail, the script redeploys the
previous image and exits with a failure status, even when rollback succeeds.
Image rollback uses the current Compose configuration and keeps the live data.
Deploy changes to mounts, environment, or database format separately with a
compatible recovery plan. The script does not automatically restore a database
backup, which could overwrite writes accepted by the new container.

Backups default to `../grocery-splitter-backups` outside the checkout. Each private
run directory contains `persistent-state.tar.gz`, the resolved Compose config,
the image override, and the previous image ID. These files contain login tokens
and may contain environment secrets. Restrict access and retain them according
to your backup policy. Tagged candidate and previous images are also retained;
the script does not prune images or delete backups.

Set `BACKUP_ROOT` to another directory outside the checkout and `HEALTH_TIMEOUT`
to a startup timeout in seconds, from 1 to 9999. For example:

```bash
BACKUP_ROOT=/srv/private/grocery-backups HEALTH_TIMEOUT=180 \
  bash /srv/grocery-splitter/scripts/redeploy.sh
```

`--check` validates Docker access, the running deployment, mounts, and Compose
configuration. Actual backup permissions and free space are checked by the backup
operation, before the container is replaced. Catchable interruptions trigger
recovery; a host crash or `SIGKILL` requires manual recovery. To test the deployment
failure paths without Docker, run `bash tests/redeploy.test.sh`.

## 📐 Architecture & Domain Rules

- [CONTEXT.md](./CONTEXT.md) — Canonical domain glossary and vocabulary.
- [0001-tax-attribution-and-unclaimed-splitting.md](./docs/adr/0001-tax-attribution-and-unclaimed-splitting.md) — Architectural decision record for tax and unclaimed splitting.
