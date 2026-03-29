# LoonieLog — Setup & Deployment Guide

**Last updated: 2026-03-29**

---

## Status Overview

| Section | Status |
|---|---|
| §2 — License Server | ✅ Deployed |
| §3 — Stripe | ⬜ **TODO — do this next** |
| §4 — Wire add-on to license server | ✅ Done (`Config.gs` has correct URL) |
| §5 — Add-on + template sheet | ✅ Done (copy-sheet MVP install) |
| §6 — loonielog.ca hosting | ⬜ **TODO** |
| §7 — Google Workspace Marketplace | ⬜ Post-MVP |

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [License Server](#2-license-server)
3. [Configure Stripe](#3-configure-stripe) ← **Next action**
4. [Wire the Add-on](#4-wire-the-add-on)
5. [Deploy the Add-on](#5-deploy-the-add-on)
6. [Set Up loonielog.ca Hosting](#6-set-up-loonielogca-hosting) ← **Needed before public launch**
7. [Publish to Google Workspace Marketplace](#7-publish-to-google-workspace-marketplace) ← **Post-MVP**
8. [End-to-End Test Checklist](#8-end-to-end-test-checklist)
9. [Go-Live Cutover](#9-go-live-cutover)
10. [Pending Tasks & Known Gaps](#10-pending-tasks--known-gaps)
11. [Key Reference Values](#11-key-reference-values)

---

## 1. Prerequisites

- [x] Google account (developer account — sends license emails, owns license sheet)
- [x] Access to [script.google.com](https://script.google.com)
- [ ] [Stripe](https://dashboard.stripe.com) account — needed for §3
- [ ] `loonielog.ca` DNS pointed to Netlify — needed for §6
- [x] LoonieLog codebase at `03-Dev-Projects/LoonieLog/`

---

## 2. License Server ✅ DONE

**Active deployment:**
- **Script ID:** `1rDQM4RAczBCqsUTT-7vWXtsstR_dfPuS_letqHuPVUk`
- **Web App URL:** `https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec`
- **Verify test:** `[above URL]?action=verify&key=CORE-TEST2-TEST3-TEST4`
- **Waitlist test:** `[above URL]?action=waitlist&email=test@example.com&plan=core_diy`

**Handles:**
- `GET ?action=verify` — key validation from add-on
- `GET ?action=waitlist` — waitlist signups from UpgradePrompt modal
- `GET ?action=checkout_success` — post-Stripe-payment redirect
- `POST ?auth=TOKEN` — Stripe webhooks

**When you need to redeploy** (after code changes):
1. Open the license server Apps Script project
2. **Deploy → Manage deployments → pencil icon**
3. Version: **New version** → Deploy
4. Same URL — no changes needed in `Config.gs`

> ⚠️ License emails currently send from your personal Gmail. Fix this before public launch — see §9.

---

## 3. Configure Stripe ⬜ TODO — DO THIS NEXT

### 3.1 Create the Product

1. Log into [Stripe Dashboard](https://dashboard.stripe.com) → **Test mode ON**
2. **Products** → **Add product**
3. Fill in:
   - **Name:** `LoonieLog Core DIY`
   - **Description:** `50 receipts/month · AI-powered CRA T2125 expense tracking`
   - **Pricing model:** Recurring
   - **Price:** `$4.99 CAD` / month
4. Save — note the **Price ID** (`price_XXXXXXXX`)

### 3.2 Create a Payment Link

1. **Payment Links** → **Create payment link**
2. Add the LoonieLog Core DIY product
3. Under **After payment** → Redirect URL:
   ```
   https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec?action=checkout_success&session_id={CHECKOUT_SESSION_ID}
   ```
   Stripe fills in `{CHECKOUT_SESSION_ID}` automatically.
4. Create the link — copy the `https://buy.stripe.com/...` URL
5. **TODO after this:** Update the Core DIY pricing button in `index.html`:
   - Find the "Coming Soon" button in the pricing section
   - Replace with: `<a href="YOUR_STRIPE_PAYMENT_LINK" class="btn btn-glow btn-lg" ...>Get Core DIY →</a>`

### 3.3 Create a Webhook

1. **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL:
   ```
   https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec?auth=YOUR_WEBHOOK_AUTH_TOKEN
   ```
   Use the `WEBHOOK_AUTH_TOKEN` you set in the license server Script Properties.
3. Events: `checkout.session.completed` + `customer.subscription.deleted`
4. Save

### 3.4 Enable Customer Portal

1. **Settings** → **Billing** → **Customer portal** → **Activate**
2. Enable: **Customers can cancel subscriptions**
3. Save — cancellation fires `customer.subscription.deleted` → auto-revokes the license key

---

## 4. Wire the Add-on ✅ DONE

`Config.gs` already has the correct license server URL at line 342:

```javascript
var LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec";
```

**After Stripe is configured (§3.2):** update the Core DIY button in `index.html` with the real Stripe Payment Link URL.

---

## 5. Deploy the Add-on ✅ DONE (copy-sheet MVP)

### Template Sheet

- **Template ID:** `1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI`
- **Copy URL:** `https://docs.google.com/spreadsheets/d/1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI/copy`
- Shared as: **Anyone with the link → Viewer**
- This is the install method for MVP — users copy the sheet and run `⚙️ Initialize Agent`

### User Install Flow

1. User clicks **"Copy to Google Sheets — Free"** on `index.html`
2. Google shows "Make a copy" dialog → user confirms
3. User opens their copy → sees `🚀 LoonieLog` menu
4. Clicks `⚙️ Initialize Agent` → Setup wizard opens
5. Enters API key (Gemini or Claude), province → clicks Install
6. `Installer.gs` runs: creates Drive folders, Gmail label, sheet tabs, daily trigger
7. User is live on Micro plan (8 receipts/month free)

### Files in the Add-on Project

```
Code.gs              ← entry point, menu, orchestrator
Config.gs            ← all constants, CRA prompt
Installer.gs         ← one-time setup
GmailHunter.gs       ← Gmail scanning
DriveScanner.gs      ← Drive folder scanning
AIRouter.gs          ← Gemini + Claude API calls
Processor.gs         ← CRA rules engine
SheetLogger.gs       ← write to sheet, Summary tab
CurrencyConverter.gs ← BOC USD→CAD conversion
TierManager.gs       ← Micro/Core/Managed limits
LicenseManager.gs    ← license key activation/verification
Sidebar.html         ← setup wizard UI
Dashboard.html       ← status panel UI
Settings.html        ← change AI model/API key
ActivateLicense.html ← license key activation modal
UpgradePrompt.html   ← plan comparison + waitlist modal
```

> `appsscript.json` — paste into Project Settings → manifest editor (not a code file).

### ⚠️ When you update the template sheet

If you update the code and want existing template copies to pick up changes, you must:
1. Update the code in the template sheet's Apps Script project
2. Existing users who already copied the sheet will **not** get the update automatically
3. That is why the Marketplace matters — Marketplace add-ons update centrally

---

## 6. Set Up loonielog.ca Hosting ⬜ TODO

These URLs are referenced in the codebase and must be live before Marketplace submission and before public users can use all features without errors:

| URL | Status | Referenced in |
|---|---|---|
| `https://loonielog.ca/` | ⬜ Not live | Marketplace listing |
| `https://loonielog.ca/privacy.html` | ⬜ Not live | Marketplace submission |
| `https://loonielog.ca/terms.html` | ⬜ Not live | Marketplace submission |
| `https://loonielog.ca/updates/prompt-version.json` | ⬜ Not live | `Config.gs:UPDATE_URL` — errors on every "Check for Updates" |
| `https://loonielog.ca/#pricing` | ⬜ Not live | `Config.gs:UPGRADE_URL` — shown in tier limit alerts |
| `https://loonielog.ca/icon-128.png` | ⬜ Not live | `appsscript.json` |

### 6.1 Deploy to Netlify

1. Push repo to GitHub (you can exclude `license-server/` — it has no secrets but is internal)
2. Connect repo to [Netlify](https://netlify.com) → publish directory: `/` (root)
3. Set custom domain: `loonielog.ca` → follow Netlify DNS instructions

### 6.2 Create the Update Endpoint

Create `updates/prompt-version.json` in the repo root:

```json
{
  "version": "1.0",
  "cra_prompt": null,
  "changelog": "Initial release — CRA T2125 2026 tax year."
}
```

Push to GitHub → Netlify deploys it automatically at `loonielog.ca/updates/prompt-version.json`.

### 6.3 Create Icons

- `icon-128.png` — 128×128 px PNG — the green "L" logo mark
- `icon-512.png` — 512×512 px PNG — same logo, larger
- Place both in the repo root

---

## 7. Publish to Google Workspace Marketplace ⬜ POST-MVP

> Start this in parallel with Steps 3–6 — the OAuth scope review takes 4–6 weeks.
> Submit the consent screen as early as possible.

### 7.1 Create a Google Cloud Project

1. [console.cloud.google.com](https://console.cloud.google.com) → New project → Name: `LoonieLog`
2. Note the **Project Number** (not Project ID)

### 7.2 Enable Required APIs

- Google Workspace Marketplace SDK
- Gmail API
- Google Drive API
- Google Sheets API

### 7.3 Configure the OAuth Consent Screen

1. **APIs & Services** → **OAuth consent screen** → User type: External
2. Fill in:
   - App name: `LoonieLog`
   - Support email: `hello@loonielog.ca`
   - Homepage: `https://loonielog.ca`
   - Privacy policy: `https://loonielog.ca/privacy.html`
   - Terms of service: `https://loonielog.ca/terms.html`
3. Add scopes:
   - `gmail.modify`
   - `gmail.settings.basic`
   - `drive`
   - `spreadsheets`
   - `script.external_request`
   - `userinfo.email`

### 7.4 Restricted Scope Justification (gmail.modify + gmail.settings.basic)

These scopes require a Google security review (**4–6 weeks**). Prepare:

- **Screencast video** (unlisted YouTube):
  - `gmail.modify`: scanning `To_Log` label, applying `loonielog-processed` label
  - `gmail.settings.basic`: creating vendor domain filters during install
- **Written justification** for each scope — why no narrower scope works

### 7.5 Link Apps Script to GCP

1. Apps Script project → **Project Settings** → **Google Cloud Platform project**
2. Click **Change project** → enter GCP Project Number from 7.1

### 7.6 Create the Marketplace Listing

1. GCP → **Workspace Marketplace SDK** → **App Configuration**
2. Fill in: name, description, category (Productivity), icons, support email, privacy/ToS URLs
3. Set visibility to **Private** initially
4. Submit for review once scope approval arrives

---

## 8. End-to-End Test Checklist

Run in Stripe **test mode** before going live.

### License Server

- [ ] `GET ?action=verify&key=CORE-TEST2-TEST3-TEST4` → `{ "valid": true, "tier": "core" }`
- [ ] `GET ?action=verify&key=CORE-FAKE0-FAKE0-FAKE0` → `{ "valid": false }`
- [ ] `GET ?action=waitlist&email=test@x.com&plan=core_diy` → `{ "success": true }` + row in Waitlist sheet
- [ ] POST to webhook URL with valid auth token → row in Licenses sheet
- [ ] POST with wrong auth token → `{ "error": "Unauthorized" }`
- [ ] POST duplicate session ID → only one row (idempotent)
- [ ] POST `customer.subscription.deleted` → license row status = `revoked`
- [ ] GET verify on revoked key → `{ "valid": false, "error": "key_revoked" }`

### Stripe Checkout

- [ ] Click payment link → Stripe Checkout loads with correct product/price
- [ ] Complete with test card `4242 4242 4242 4242`
- [ ] Post-payment redirect → branded success page shows key
- [ ] License email arrives in test inbox
- [ ] Key format: `CORE-XXXXX-XXXXX-XXXXX`

### Add-on Activation

- [ ] `🔑 Activate License Key` opens dialog
- [ ] Malformed key shows inline error (no network call)
- [ ] Valid test key → "Core DIY Activated!" → dialog closes in 2.5s
- [ ] Dashboard shows "Core DIY · 50 receipts left"
- [ ] Revoked key shows "License has been revoked"

### Tier Limits ⚠️ Not yet tested

- [ ] Micro user: process 8 receipts → 9th triggers upgrade alert
- [ ] Core DIY user: process 50 receipts → 51st triggers upgrade alert
- [ ] Daily trigger respects tier limits

### Upgrade Prompt + Waitlist

- [ ] `⭐ Upgrade to Core DIY` opens modal with correct plan highlighted
- [ ] Usage bar reflects current receipt count
- [ ] "Join the Waitlist" → form shows with correct plan pre-selected
- [ ] Submit valid email → success state, row in Waitlist sheet
- [ ] Submit invalid email → inline error

---

## 9. Go-Live Cutover

When all tests pass:

1. **Swap to Stripe live mode**
   - License server Script Properties: replace `sk_test_...` with `sk_live_...`
   - Update webhook to live mode endpoint
   - Update Payment Link to live mode

2. **Redeploy license server** (new version, same URL)

3. **Update `index.html`** — replace Core DIY "Coming Soon" button with live Stripe Payment Link

4. **Redeploy license server from dedicated account** (optional but recommended)
   - Create `loonielog.app@gmail.com` or use Google Workspace `hello@loonielog.ca`
   - Redeploy from that account so license emails come from a professional address, not personal Gmail

5. **Monitor `WebhookLog` sheet** — first purchases should appear within seconds

---

## 10. Pending Tasks & Known Gaps

### Blockers before public launch

| # | Task | Effort |
|---|---|---|
| 1 | **Configure Stripe** (§3) — no paid tier until this is done | 1–2 hrs |
| 2 | **Deploy loonielog.ca** (§6) — update check errors until site is live | 2–3 hrs |
| 3 | **Create `updates/prompt-version.json`** (§6.2) | 5 min |
| 4 | **Create `icon-128.png` and `icon-512.png`** (§6.3) | 30 min |
| 5 | **Verify tier limit enforcement** — run manual test, 8 receipts → 9th | 15 min |
| 6 | **Update Core DIY button in `index.html`** with real Stripe link after §3 | 2 min |

### Post-MVP backlog

| # | Task | Notes |
|---|---|---|
| B1 | `DEVELOPER_AI_ENDPOINT` placeholder in `Config.gs` | Required for Managed Pro tier |
| B2 | Periodic license re-verification trigger | Cancelled subscriptions not revoked until next verify |
| B3 | 75% usage warning toast | Users hit limit without warning |
| B4 | Managed Pro path in Sidebar (no API key) | Sidebar always asks for API key |
| B5 | "Reset LoonieLog" menu item | Currently DEV_MODE gated |
| B6 | Marketplace listing | Submit OAuth consent screen early — 4–6 week review |

---

## 11. Key Reference Values

| Value | Status | Your value |
|---|---|---|
| License Server Web App URL | ✅ Set | `https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec` |
| License Server Script ID | ✅ Set | `1rDQM4RAczBCqsUTT-7vWXtsstR_dfPuS_letqHuPVUk` |
| Template Sheet ID | ✅ Set | `1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI` |
| `WEBHOOK_AUTH_TOKEN` | ✅ Set in Script Properties | _(do not write here — stored in license server Script Properties)_ |
| `LICENSES_SPREADSHEET_ID` | ✅ Set in Script Properties | _(do not write here — stored in license server Script Properties)_ |
| Stripe Price ID (Core DIY) | ⬜ Pending §3.1 | _(paste here after creating product)_ |
| Stripe Payment Link URL | ⬜ Pending §3.2 | _(paste here after creating payment link)_ |
| Stripe Webhook ID | ⬜ Pending §3.3 | _(paste here after creating webhook)_ |
| GCP Project Number | ⬜ Pending §7.1 | _(paste here after creating GCP project)_ |
| Netlify Site URL | ⬜ Pending §6.1 | _(paste here after deploying)_ |

---

> For questions: hello@loonielog.ca
