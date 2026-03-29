# LoonieLog — High-Level Design (HLD)
> Version 1.0 | Last Updated: 2026-03-27

---

## 1. Product Vision

LoonieLog is a **zero-touch, AI-powered expense agent** that lives entirely inside a user's Google Workspace. It autonomously ingests receipts from Gmail and Google Drive, extracts structured financial data using AI (Gemini or Claude), enforces CRA tax compliance rules, and logs everything to a Google Sheet — with no third-party data exposure.

**Core Promise:** "Your data never leaves your Google account."

---

## 2. User Personas

| Persona | Description | Pain Point |
|---|---|---|
| Freelance Dev/Designer | Solo operator, irregular income | No time to log receipts, loses GST/HST credits |
| Sole Proprietor (T2125 filer) | Side hustle or main business | Doesn't know CRA categories, fears audit |
| Small Biz Owner | 1-3 person shop | Pays bookkeeper $80/hr for data entry |

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE WORKSPACE                         │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │   GMAIL     │    │ GOOGLE DRIVE │    │ GOOGLE SHEETS │  │
│  │             │    │              │    │               │  │
│  │ [To_Log]    │    │ /Unprocessed │    │  Master Log   │  │
│  │  label      │───▶│ /Archive     │───▶│  (structured) │  │
│  │             │    │              │    │               │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│        │                   │                    ▲           │
│        ▼                   ▼                    │           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              LOONIELOG APPS SCRIPT ENGINE            │  │
│  │                                                      │  │
│  │  Installer ──▶ GmailHunter ──▶ AIRouter ──▶ Logger  │  │
│  │     │              │               │                 │  │
│  │  DriveScanner ─────┘         Processor               │  │
│  └──────────────────────────────────────────────────────┘  │
│        │                                                    │
└────────┼────────────────────────────────────────────────────┘
         │
         ▼ (HTTPS calls only, no data stored)
   ┌─────────────┐    ┌──────────────┐
   │  Gemini API │ OR │  Claude API  │
   │ (1.5 Flash) │    │ (3.5 Sonnet) │
   └─────────────┘    └──────────────┘
```

---

## 4. Component Breakdown

### 4.1 Installer (`Installer.gs`)
**Responsibility:** One-time setup that runs on first activation.

| Task | Method | Detail |
|---|---|---|
| Create Drive folders | `DriveApp.createFolder()` | `LoonieLog_Unprocessed`, `LoonieLog_Archive_2026` |
| Create Gmail label | `Gmail.Users.Labels.create()` | `To_Log` |
| Inject Gmail filters | `Gmail.Users.Settings.Filters.create()` | Two-pass: domain filters (known vendors) + subject keyword catch-all |
| Store user settings | `PropertiesService.getUserProperties()` | API key, province, model choice |
| Set up Sheet headers | `SpreadsheetApp` | 19 canonical columns (A–S) |
| Create time trigger | `ScriptApp.newTrigger()` | 24-hour recurring processor |

**Filter Strategy — Two-Pass:**

**Pass A — Domain filters (~50 known Canadian/SaaS vendors):**
- Telecom: `@rogers.com`, `@bell.ca`, `@telus.com`, `@fido.ca`, `@koodomobile.com`, `@virginplus.ca`, `@freedommobile.ca`, `@videotron.com`
- Food/Delivery: `@uber.com`, `@ubereats.com`, `@doordash.com`, `@skip.ca`, `@starbucks.com`
- Retail/Office: `@amazon.ca`, `@amazon.com`, `@apple.com`, `@staples.ca`, `@canadiantire.ca`, `@homedepot.ca`, `@bestbuy.ca`, `@costco.ca`
- Cloud/SaaS: `@github.com`, `@slack.com`, `@notion.so`, `@figma.com`, `@zoom.us`, `@dropbox.com`, `@adobe.com`, `@microsoft.com`, `@atlassian.com`, `@cloudflare.com`, `@netlify.com`, `@vercel.com`
- Payments/Finance: `@stripe.com`, `@paypal.com`, `@freshbooks.com`, `@shopify.com`
- Travel/Shipping: `@westjet.com`, `@aircanada.com`, `@viarail.ca`, `@canadapost.ca`, `@purolator.com`, `@fedex.com`, `@ups.com`, `@dhl.com`
- Hosting/Domain: `@godaddy.com`, `@namecheap.com`

**Pass B — Subject keyword catch-all (single filter, any vendor):**
Matches emails containing: `receipt`, `invoice`, `order confirmation`, `order summary`, `payment confirmation`, `payment receipt`, `your order`, `order #`, `tax invoice`, `purchase confirmation`, `subscription renewal`, `billing statement`, `statement of account`, `e-receipt`, `transaction receipt`

> This universal filter catches receipts from any vendor not in the domain list — niche Canadian vendors, local suppliers, one-time purchases — without needing to maintain a constantly growing domain list.

---

### 4.2 Gmail Hunter (`GmailHunter.gs`)
**Responsibility:** Finds and prepares email receipts for processing.

**Flow:**
```
Scan threads with [To_Log] label
  │
  ├─▶ Already processed? (check SHA-256 hash in Props) → SKIP
  │
  ├─▶ Extract email body (HTML → plain text strip)
  │
  ├─▶ Extract attachments (PDF, PNG, JPG)
  │       └─▶ Save to LoonieLog_Unprocessed Drive folder
  │
  └─▶ Pass {emailBody, attachmentUrls[], metadata} → AIRouter
```

**Deduplication key:** `SHA-256(vendor + date + total)` stored in `PropertiesService`

---

### 4.3 Drive Scanner (`DriveScanner.gs`)
**Responsibility:** Processes physical/scanned receipts dropped into the Drive folder.

**Flow:**
```
Poll LoonieLog_Unprocessed folder
  │
  ├─▶ New files found?
  │       └─▶ Pass file blob (image/PDF) → AIRouter (vision mode)
  │
  └─▶ No new files → exit quietly
```

---

### 4.4 AI Router (`AIRouter.gs`)
**Responsibility:** Routes requests to correct AI model, enforces the CRA extraction prompt.

**Model Selection:**
```
User Setting: "gemini" | "claude"
  │
  ├─▶ Gemini 1.5 Flash  → POST https://generativelanguage.googleapis.com/v1beta/...
  │       Supports: text + vision (inline base64)
  │
  └─▶ Claude 3.5 Sonnet → POST https://api.anthropic.com/v1/messages
          Supports: text + vision (base64 media blocks)
```

**The CRA Master Prompt (injected on every call):**
```
You are a Canadian tax expert and CRA compliance assistant.
Analyze this receipt/invoice and return ONLY valid JSON with no markdown.

Required fields:
{
  "date": "YYYY-MM-DD",
  "vendor": "string",
  "subtotal": number,
  "gst_hst": number,
  "pst_qst": number,
  "total": number,
  "currency": "CAD" | "USD",
  "cra_category_code": "8521"|"8523"|"8590"|"8690"|"8710"|"8760"|"8810"|"8811"|
                       "8860"|"8871"|"8910"|"8960"|"9060"|"9200"|"9220"|"9224"|
                       "9270"|"9275"|"9281"|"9936"|"WFH"|"other",
  "cra_category_name": "string",
  "is_meal": boolean,
  "is_capital": boolean,
  "confidence": "high" | "medium" | "low",
  "notes": "string or null"
}

CRA T2125 Line Mapping — VERIFIED against CRA official sources + user filings:
- 8521: Advertising (ads, website, business cards)
- 8523: Meals & Entertainment (50% — ITA s.67.1)
- 8590: Bad Debts
- 8690: Insurance (business liability, property — NOT life)
- 8710: Interest & Bank Charges
- 8760: Business Taxes, Licences & Memberships
- 8810: Office Expenses (small consumables + SaaS subscriptions < $500/item)
- 8811: Office Stationery & Supplies (pens, paper, stamps — physical only)
- 8860: Professional Fees (accounting, legal, bookkeeping)
- 8871: Management & Administration Fees
- 8910: Rent (office, co-working)
- 8960: Repairs & Maintenance
- 9060: Salaries, Wages & Benefits
- 9200: Travel Expenses (flights, hotels, transit)
- 9220: Telephone & Utilities (phone, internet, hydro — business % only)
- 9224: Fuel Costs (non-vehicle)
- 9270: Other Business Expenses (annual SaaS contracts, cloud infra, catch-all)
- 9275: Delivery, Freight & Express
- 9281: Motor Vehicle Expenses (Chart A total — business % of gas/insurance/maintenance)
- 9936: Capital Cost Allowance (computers Class 50, furniture Class 8)
- WFH:  Business-Use-of-Home (Part 7 — heat, electricity, mortgage interest, property tax)
- other: Miscellaneous / needs review

If currency is USD, flag it but still extract raw values.
If confidence is low, set notes to explain what's ambiguous.
```

---

### 4.5 Processor (`Processor.gs`)
**Responsibility:** Applies CRA business rules to the AI JSON output before logging.

| Rule | Logic |
|---|---|
| Meals 50% rule | If `is_meal == true`, `deductible_amt = total_cad * 0.50` (ITA s.67.1) |
| USD conversion | `CurrencyConverter.convert()` — BOC Valet API → CAD; stores rate + rate_date in cols R/S |
| Non-receipt skip | If `is_receipt == false`, mark processed, log SKIPPED_NON_RECEIPT, do not log row |
| Gift rule | Client gifts capped at $25/person (8521); employee gifts ≤ $500 exempt (9060); personal → excluded |
| WFH expenses | Route to Needs Review; `deductible_amt: null` until Part 7 % calculated by user |
| Missing GST | If province != "QC" and `gst_hst == 0` and `total > 30` and currency == "CAD", flag as review |
| QST handling | If province == "QC", treat `pst_qst` as QST (recoverable for registrants) |
| ITC tracking | `itc_eligible = gst_hst_cad` (CAD-converted amount; 0 for Personal expense type) |
| CCA flag | If `is_capital == true`, set `deductible_amt: null`, log to Needs Review for CCA schedule |
| Low confidence | Route to "Needs Review" sheet tab instead of main log |

---

### 4.6 Sheet Logger (`SheetLogger.gs`)
**Responsibility:** Writes structured rows to Google Sheet, manages archive.

**Sheet Structure — "Expenses" tab:**

| Col | Field | Format | Notes |
|---|---|---|---|
| A | Date | YYYY-MM-DD | |
| B | Vendor | Text | |
| C | CRA Category Code | e.g. `8810` | |
| D | CRA Category Name | e.g. `Office Expenses` | |
| E | Subtotal | `$#,##0.00` | |
| F | GST/HST | `$#,##0.00` | |
| G | PST/QST | `$#,##0.00` | |
| H | Total | `$#,##0.00` | |
| I | Deductible Amt | `$#,##0.00` | 50% for meals |
| J | ITC Eligible | `$#,##0.00` | |
| K | Currency | CAD / USD | Original receipt currency |
| L | **Expense Type** | Dropdown | **Business** / Personal / Review — default: Business |
| M | Source | Gmail / Drive | |
| N | Drive URL | Hyperlink | |
| O | Logged At | Timestamp | |
| P | Status | Processed / Needs Review | |
| Q | Original Amount (USD) | `USD $#,##0.00` | Blank for CAD receipts |
| R | BOC Exchange Rate | `0.0000` | Bank of Canada noon rate — blank for CAD |
| S | Rate Date | YYYY-MM-DD | May differ from col A if weekend/holiday rollback |

**Expense Type column behaviour:**
- AI sets default to `Business` for all vendor/category combinations that look commercial
- AI sets `Personal` when it detects obvious personal signals (grocery stores, pharmacies, personal care, clothing retail, entertainment venues like movie theatres)
- AI sets `Review` when ambiguous (e.g. Costco, Walmart, Amazon — could be either)
- Column uses **data validation dropdown** so user can easily correct with one click
- `Personal` rows are **excluded from Deductible Amt and ITC totals** in the Summary tab
- `Review` rows are highlighted in yellow — user action required before tax filing

**Additional Sheet Tabs:**
- `Summary` — Monthly/quarterly pivot with ITC totals, category breakdowns
- `Needs Review` — Low-confidence or flagged entries
- `Audit Log` — Every action LoonieLog takes (append-only)
- `Settings` — Read-only display of current config

---

## 5. Data Flow (End-to-End)

```
[Receipt arrives in Gmail]
        │
        ▼
Gmail Filter → applies "To_Log" label automatically
        │
        ▼
Time Trigger fires (every 24h) → GmailHunter.scanInbox()
        │
        ├─▶ Hash check → duplicate? → SKIP + log to Audit
        │
        ▼
Extract body + attachments → save to Drive/Unprocessed
        │
        ▼
AIRouter.extract(payload) → Gemini or Claude API call
        │
        ▼
Parse JSON response
        │
        ├─▶ is_receipt == false → mark processed, log SKIPPED_NON_RECEIPT → DONE
        │
        ▼
Processor.applyRules(json)
        │
        ├─▶ currency == "USD" → CurrencyConverter.convert() → BOC Valet API → CAD total
        │
        ├─▶ is_capital == true → deductible_amt: null → SheetLogger.logToReview()
        │
        ├─▶ confidence == "low" → SheetLogger.logToReview()
        │
        └─▶ confidence != "low" → SheetLogger.logToExpenses()
                                          │
                                          ▼
                                  Rename file: YYYY-MM-DD_Vendor_Total
                                  Move to Drive/Archive_{year}
                                  Mark Gmail thread as processed
```

---

## 6. Project File Structure

```
LoonieLog/
│
├── appsscript.json          # Manifest: OAuth scopes, advanced services, timezone
│
├── Code.gs                  # Entry point: onOpen() menu, global trigger registration
├── Config.gs                # All constants: vendor list, CRA codes, sheet columns
├── Installer.gs             # One-time setup: folders, labels, filters, triggers
│
├── GmailHunter.gs           # Scan To_Log label, extract bodies & attachments
├── DriveScanner.gs          # Poll Unprocessed folder for image/PDF receipts
│
├── AIRouter.gs              # Model selector, API calls, prompt injection
├── Processor.gs             # CRA rule engine: 50% meals, ITC, CCA flag, gift rules
├── CurrencyConverter.gs     # BOC Valet API — USD→CAD with weekend/holiday rollback
├── SheetLogger.gs           # Write rows, manage sheet tabs, archive files
│
├── Sidebar.html             # Onboarding wizard UI (first-run experience)
├── Dashboard.html           # Status panel: last run, counts, errors, settings
│
└── HLD.md                   # This document
```

---

## 7. Security & Privacy Model

| Concern | How LoonieLog handles it |
|---|---|
| API Key storage | `PropertiesService.getUserProperties()` — encrypted, user-scoped, never in sheet |
| Data sovereignty | No LoonieLog server; all data stays in user's Google account |
| AI call payloads | Only the receipt text/image is sent; no PII beyond what's on the receipt |
| OAuth scopes | Minimal required: Gmail modify, Drive, Sheets, external requests |
| Audit trail | Every action written to Audit Log tab (append-only) |

---

## 8. Error Handling Strategy

| Scenario | Behavior |
|---|---|
| AI API timeout / 429 | Exponential backoff × 3, then log to Audit as "deferred" |
| Malformed JSON from AI | Retry with explicit JSON-only instruction, then log to Needs Review |
| Gmail quota exceeded | Pause batch, log position, resume next trigger cycle |
| Drive folder missing | Re-create on next run, log warning |
| Duplicate receipt | Skip silently, increment dedup counter in Audit Log |

---

## 9. Monetization Hooks (Build Consideration)

| Tier | Mechanism | What to build |
|---|---|---|
| Free (template) | Gumroad $49 CAD one-time | Full script, manual updates |
| Pro (Marketplace) | $9/month subscription | `checkForPromptUpdates()` — polls a public JSON endpoint for CRA rule changes |
| Update endpoint | Static JSON on GitHub Pages or Cloudflare Worker | `{ "version": "2026.1", "cra_prompt": "..." }` |

---

## 10. Build Phases

### Phase 1 — Core (MVP)
- [ ] `appsscript.json` with all scopes
- [ ] `Config.gs` — all constants
- [ ] `Installer.gs` — setup wizard backend
- [ ] `Sidebar.html` — onboarding UI
- [ ] `Code.gs` — menu + trigger wiring

### Phase 2 — Intelligence
- [ ] `AIRouter.gs` — Gemini + Claude with CRA prompt
- [ ] `Processor.gs` — CRA rules engine
- [ ] `SheetLogger.gs` — sheet writes + file archiving

### Phase 3 — Ingestion
- [ ] `GmailHunter.gs` — label scan + attachment extraction
- [ ] `DriveScanner.gs` — image/PDF from Drive folder

### Phase 4 — Polish
- [ ] `Dashboard.html` — status panel
- [ ] Summary tab with ITC totals
- [ ] Pro update-check hook

---

*LoonieLog HLD v1.0 — Built for Canadian freelancers who'd rather build than bookkeep.*
