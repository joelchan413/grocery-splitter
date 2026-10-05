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

## 📐 Architecture & Domain Rules

- [CONTEXT.md](./CONTEXT.md) — Canonical domain glossary and vocabulary.
- [0001-tax-attribution-and-unclaimed-splitting.md](./docs/adr/0001-tax-attribution-and-unclaimed-splitting.md) — Architectural decision record for tax and unclaimed splitting.
