# Personal Finance Dashboard

A private, install-to-home-screen finance dashboard. You sign in with **your own username and
password**, and **all your data lives in your own Google Drive** — encrypted with that password
before it ever leaves the device. There is no server and no third-party database.

- Username + password login; the password derives the AES-256-GCM key that encrypts your file
- Accounts (bank / cash / credit card / wallet) with live balances
- Income, expense and transfer transactions with categories
- Monthly budgets vs actual spend
- Investments: stocks, mutual funds, NPS, EPF/EPFO, FD, gold
- Loans with EMI calculator and payoff progress
- Insurance policies (LIC, health, term, accident) with premiums, cover and nominee
- Gifts & donations register per financial year, with 80G receipts
- Recurring bills with due/overdue reminders
- Dashboard charts and net-worth tracking
- Reports: full PDF statement + CSV exports, plus JSON backup/restore
- Works offline (PWA) and syncs to Drive when you're back online

## How the login works

1. **Your credentials** — on first run you choose a username and password. The password is never
   stored or transmitted: PBKDF2-SHA256 (310,000 iterations) turns it into an AES-GCM key, and a
   wrong password simply fails to decrypt. It **cannot be reset** — if you lose it the file is
   unreadable, so keep a copy of it and of the JSON backup.
2. **Google Drive** — a one-time "Connect Drive" grant lets the app write the encrypted file to
   `PFD_KB/finance-data.json`. Google stores ciphertext only. The `drive.file` scope means the app
   can never see your other Drive files.
3. On another device, connect Drive, then sign in with the same username and password.

## Import the Excel workbook

The `Karthik_Bammidi_Personal_Finance_Dashboard_FY_*.xlsx` workbook can be converted
straight into the app's data file:

```powershell
npm run import:xlsx -- "D:\path\to\Karthik_Bammidi_Personal_Finance_Dashboard_FY_2026_27.xlsx"
```

This writes `finance-data.json` containing:

| Workbook sheet | Becomes |
| --- | --- |
| Account Balance Ledger | Accounts with their opening balances |
| Income & Expenses | Monthly income / expense / investment transactions |
| Stocks Portfolio | Stock holdings with sector and sub-sector |
| Mutual Fund Portfolio | Mutual fund holdings with fund category |
| NPS Portfolio | NPS holdings per asset class and pension fund manager |
| Networth Tracker (PF, Gold) | EPF/EPFO and gold holdings |
| Networth Tracker + loan ledgers | Home, personal and gold loans with EMI, rate and tenure |
| Networth Tracker (monthly payments) | Recurring bills such as the chit |
| Policy Details | Insurance policies |

Load it with **Settings → Backup & restore → Restore from file**, then let it sync to Drive.
Re-run the command whenever the workbook is updated. `finance-data.json` and `*.xlsx` are
git-ignored so your figures never leave your machine.

## 1. Create a Google OAuth client (one time, ~2 minutes)

1. Open <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library** → search "Google Drive API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**, fill in app name and your email.
   - Add the single scope `https://www.googleapis.com/auth/drive.file`.
   - Press **Publish app**. `drive.file` is a non-sensitive scope, so no Google review is
     required — and publishing avoids the 7-day token expiry that "Testing" mode imposes.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorised JavaScript origins** — add every URL you'll open the app from:
     - `http://localhost:5173`
     - your deployed URL, e.g. `https://my-finance.vercel.app`
   - No redirect URI is needed (the app uses the token flow).
5. Copy the **Client ID** (`...apps.googleusercontent.com`).

Paste that client ID into **Settings → Account & sync** in the app (it is stored in your
browser), or copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID`.

> The client ID is not a secret — it's safe in a public build. `drive.file` is the only scope
> requested, so the app can *only* read and write the one file it created, and it never reads
> your name, email or any other Drive content.

## 2. Run locally

Requires [Node.js](https://nodejs.org/) 18+ (LTS recommended).

```powershell
npm install
npm run dev
```

Open <http://localhost:5173>.

## 3. Deploy to Vercel

The repo already contains [vercel.json](vercel.json) (Vite build, `dist` output, security and
cache headers), so deploying is just an import:

1. Go to <https://vercel.com/kb-pfd> → **Add New… → Project**.
2. **Import Git Repository** → `kb3369personalfinance-prog/KB_PFD` (authorise GitHub if asked).
3. Leave the detected settings as they are — framework *Vite*, build `npm run build`, output `dist`.
4. Optional: under **Environment Variables** add `VITE_GOOGLE_CLIENT_ID` with your client ID so
   you never have to paste it on the login screen. (It is a public identifier, not a secret.)
5. **Deploy**. Every push to `main` redeploys automatically.

Prefer the CLI instead?

```powershell
npx vercel login          # browser device-code login
npx vercel link --scope kb-pfd
npx vercel --prod
```

### After the first deploy

Add the deployment URL (e.g. `https://kb-pfd.vercel.app`) to **Authorised JavaScript origins**
in the Google Cloud OAuth client from step 1 — otherwise Google sign-in is rejected. Keep
`http://localhost:5173` there too for local development.

Any other static host works as well: build with `npm run build` and publish the `dist` folder.

## 4. Use it on your phone

Open the deployed URL in Chrome/Safari → **Add to Home Screen**. It launches full screen
like a native app, and stays usable offline (changes sync to Drive on reconnect).

## Where is my data?

`My Drive → PFD_KB → finance-data.json`.

You can open, download or back it up yourself at any time. **Settings → Backup & restore**
also lets you download a JSON copy or restore from one.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Type-check and produce `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only |

## Security notes

- Your data file is encrypted client-side with AES-256-GCM; the key comes from your password via
  PBKDF2-SHA256 (310,000 iterations) and is never written to disk.
- Only the `drive.file` OAuth scope is requested — the app cannot see your other Drive files.
- The Google access token is kept in `sessionStorage` and is revoked on sign out.
- The offline copy in `localStorage` is the same encrypted blob, so a stolen laptop still needs
  your password. **Sign out & forget this device** removes it.
- There is no backend, so there is no shared database to breach.
- Passwords cannot be recovered. Keep a JSON backup (Settings → Backup & restore) somewhere safe.
