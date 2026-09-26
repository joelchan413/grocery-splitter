# 🛒 GrocerySplit

A collaborative receipt-scanning and grocery-splitting web application designed for roommates.

## ✨ Features

- 📸 **Receipt Scanning (Gemini 3.7 Flash)**: Upload 1–3 receipt photos or choose pre-configured sample receipts (Trader Joe's, Costco).
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

### 3. Optional: Configure Gemini API Key
You can add your Google Gemini API key:
- In the in-app **Settings** modal, OR
- In a `.env.local` file:
  ```env
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
*(You can also test all features immediately without an API key using the built-in sample receipts!)*

### 🐳 Run with Docker
You can build and run the production container with Docker Compose:

```bash
docker compose up --build
```
The app will be accessible at [http://localhost:3000](http://localhost:3000).

Trip and household data live in `data/database.json` on the Docker host. Docker Compose bind-mounts this directory into the container, so it survives `docker compose down` and image rebuilds. The file is ignored by Git and excluded from the Docker image. Back it up before deploying or moving hosts.

The container makes the mounted directory writable for its non-root app user at startup. If a database write or read fails, the API returns an error rather than silently using in-memory changes or overwriting a damaged file.

If you deployed an earlier version that tracked `data/database.json`, preserve a copy outside the repository before pulling this change. Git may delete or refuse to replace a locally modified tracked file during that pull. Restore the backup to `data/database.json` before starting the new container.

## 📐 Architecture & Domain Rules

- [CONTEXT.md](./CONTEXT.md) — Canonical domain glossary and vocabulary.
- [0001-tax-attribution-and-unclaimed-splitting.md](./docs/adr/0001-tax-attribution-and-unclaimed-splitting.md) — Architectural decision record for tax and unclaimed splitting.
