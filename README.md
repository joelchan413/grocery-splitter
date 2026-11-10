# 🛒 GrocerySplit

A collaborative receipt-scanning and grocery-splitting web application designed for roommates.

## ✨ Features

- 📸 **Receipt Scanning (Codex CLI)**: Upload 1–3 receipt photos.
- 🏷️ **Proportional Tax Attribution (ADR 0001)**: Sales tax applies **only** to roommates who claimed taxable items, weighted proportionally by their taxable item subtotal.
- 🏡 **Household Shared Staples**: Unclaimed items and leftover quantities automatically split 4 ways across all household roommates.
- 👥 **1-Tap Collaborative Claiming**: Claim individual items, specific counts (e.g. 2 of 3 avocados), or split with custom sub-groups.
- ✅ **"Ready" Check-in**: Track roommate progress with celebratory feedback.
- ⚡ **Venmo Deep Links**: 1-tap "Pay with Venmo" buttons pre-loaded with recipient handle, exact dollar balance, and note.
- 📋 **Group Chat Summary**: Copy formatted markdown/text summaries for iMessage or WhatsApp in one tap.
- 📜 **Trip History Archive**: Look back at past grocery runs and their item breakdowns.
- 🔔 **Push Notifications**: New trips, everyone done claiming, payments received, shares that grew after paying, and daily reminders to claim and pay.

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

The app uses the saved server login through `codex exec`; it does not require a Gemini or OpenAI API key. Settings shows whether the server has a saved login. This checks the local login, not model availability or remaining account usage.

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

### 🔔 Push notifications

Notifications use web push, which needs HTTPS (a Cloudflare Tunnel works). They stay off until the server has a key pair. Generate one once and add it to `.env` (or `.env.local`):

```bash
npx web-push generate-vapid-keys
```

```
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:you@example.com
REMINDER_TIME_ZONE=America/New_York
```

Recreate the container with `docker compose up -d`. No rebuild is needed: the key is read when the server starts. Keep the private key secret, and keep the same pair afterward, because changing it disconnects every subscribed phone. `REMINDER_TIME_ZONE` is the household's IANA time zone; reminders are only sent between 9am and 9pm there. Without it, the server's time zone is used, which is UTC in Docker.

Each roommate turns notifications on in **Settings** and picks whose phone it is. On iPhone and iPad, the app must first be added to the home screen (Share → Add to Home Screen) and opened from there.

| Notification | Sent to | When |
| --- | --- | --- |
| New trip | Everyone except the payer | The payer confirms the receipt |
| Everyone's done claiming | Everyone, with what they owe | Every roommate has marked themselves done (after 30 seconds, so a mistaken tap can be undone) |
| Payment received | Whoever got paid | A payment is marked paid, combined across the trips it covers |
| Share went up | The roommate who had paid | Claims change after they paid so they owe more (3 minutes after the edits stop) |
| Reminder | Roommates with something to do | A day after a trip is submitted (to claim, for up to a week) or a day after everyone is done (to pay); at most once a day |

### 🧾 Food spending log (529)

One roommate can have their share of each trip logged to their own Google Sheet, with the receipt photos saved to a Drive folder. A row is written about a minute after a trip is fully paid: every roommate has paid the payer back (or, on a trip nobody owes on, everyone has finished claiming).

Each row holds the date, store, receipt photo, that roommate's whole share with tax, their food share before tax, their non-food share before tax, and a note. Food means untaxed items, which matches grocery receipts in states that don't tax groceries, such as Iowa. Taxed food (candy, soda) counts as non-food, and untaxed non-food (bottle deposits) counts as food, so check those by hand. If the claims on a trip change after it was logged and it is paid again, its row is updated in place.

Trips that were already fully paid when logging was first turned on are skipped, so rows you entered by hand aren't duplicated.

Setup: open the spreadsheet, choose Extensions → Apps Script, and follow the steps at the top of [`scripts/food-tracker.gs`](scripts/food-tracker.gs). The script runs as you, so the app never gets access to your Google account. Then add to `.env`:

```
FOOD_TRACKER_URL=<web app URL from the Apps Script deployment>
FOOD_TRACKER_SECRET=<the same SECRET as in the script>
FOOD_TRACKER_PARTICIPANT=<your name or id in the household>
```

Recreate the container with `docker compose up -d`. The server logs `Food tracker: logged …` after each row, and retries failed sends every hour.

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

## Performance and storage format

Receipt photos now live in immutable files under `data/receipt-photos`; the first
save preserves an old-format database as `data/database.v1-backup.json`. Back up
the entire `data` directory. Older app versions require a legacy export before
rollback after migration. See [migration, rollback, browser caching, and benchmark
instructions](docs/performance/README.md).
