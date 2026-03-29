# LoonieLog — Claude Code Context

You are a Lead Developer building **LoonieLog** — a production-grade Google Apps Script
that runs inside a Google Sheets spreadsheet. It autonomously ingests Canadian business
receipts from Gmail and Google Drive, extracts structured data using AI (Gemini 1.5 Flash
or Claude 3.5 Sonnet), applies CRA tax compliance rules, and logs to a Google Sheet.

---

## Hard Constraints

- Google Apps Script (V8 runtime) only — no Node.js, no npm
- All API calls via `UrlFetchApp.fetch()` — no external libraries
- User secrets stored ONLY in `PropertiesService.getUserProperties()` — never in the sheet
- All Drive/Gmail operations scoped to the authenticated user's account only
- Every function must have `try/catch` with structured error logging to the "Audit Log" sheet
- No `console.log` — use `Logger.log()` and the global `logAudit(action, detail, status)` helper
- Code must be modular — no function longer than 60 lines
- Use JSDoc comments on every function

---

## Project File Structure

```
LoonieLog/
├── appsscript.json       # Manifest: OAuth scopes, advanced services, timezone
├── CLAUDE.md             # This file — always read first
├── Code.gs               # Entry point: onOpen() menu, trigger wiring, orchestrator
├── Config.gs             # All constants: CRA categories, vendor list, sheet columns
├── Installer.gs          # One-time setup: Drive folders, Gmail labels/filters, triggers
├── GmailHunter.gs        # Scan To_Log label, extract email bodies & attachments
├── DriveScanner.gs       # Poll Unprocessed Drive folder for image/PDF receipts
├── AIRouter.gs           # Model selector, API calls, CRA prompt injection
├── CurrencyConverter.gs  # Bank of Canada Valet API — USD→CAD at receipt-date rate
├── Processor.gs          # CRA rules engine: 50% meals, ITC, USD conversion, dedup
├── SheetLogger.gs        # Write rows to sheet, manage tabs, archive files
├── Sidebar.html          # Onboarding wizard UI (3-step setup)
└── Dashboard.html        # Status panel: last run, counts, errors, settings
```

---

## Sheet Tabs

| Tab | Purpose |
|---|---|
| `Expenses` | Main expense log — 19 columns (see SHEET_COLUMNS in Config.gs) |
| `Needs Review` | Low-confidence or flagged entries — same 19 columns |
| `Summary` | Monthly/quarterly pivot with ITC totals and category breakdowns |
| `Audit Log` | Append-only action log — [Timestamp, Function, Detail, Status] |
| `Settings` | Read-only config display — col A = key, col B = value |

### Expenses Tab — Column Map (SHEET_COLUMNS)

All monetary columns (E–J) are always stored in **CAD**. If the receipt was in USD,
columns Q–S hold the original USD amounts and the BOC rate used for conversion.

| Col | Field | Notes |
|---|---|---|
| A | Date | YYYY-MM-DD |
| B | Vendor | |
| C | CRA Category Code | e.g. `9281` |
| D | CRA Category Name | e.g. `Motor Vehicle Expenses` |
| E | Subtotal (CAD) | Converted to CAD if USD |
| F | GST/HST (CAD) | Converted to CAD if USD |
| G | PST/QST (CAD) | Converted to CAD if USD |
| H | Total (CAD) | Converted to CAD if USD |
| I | Deductible Amt (CAD) | 50% for meals; 0 if Personal |
| J | ITC Eligible (CAD) | |
| K | Currency | CAD / USD (original receipt currency) |
| L | Expense Type | Dropdown: **Business** / Personal / Review |
| M | Source | Gmail / Drive |
| N | Drive URL | Hyperlink |
| O | Logged At | Timestamp |
| P | Status | Processed / Needs Review |
| Q | Original Amount (USD) | Populated only if receipt was USD; blank for CAD |
| R | BOC Exchange Rate | e.g. `1.3952` — blank for CAD receipts |
| S | Rate Date | Date the BOC rate is from (may differ from receipt date if weekend/holiday) |

---

## Script Properties Keys

| Key | Value |
|---|---|
| `API_KEY` | User's Gemini or Claude API key |
| `AI_MODEL` | `"gemini"` or `"claude"` |
| `PROVINCE` | 2-letter province code e.g. `"ON"`, `"QC"`, `"BC"` |
| `UNPROCESSED_FOLDER_ID` | Drive folder ID |
| `ARCHIVE_FOLDER_ID` | Drive folder ID |
| `TO_LOG_LABEL_ID` | Gmail label ID |
| `PROCESSED_HASHES` | JSON-stringified array of SHA-256 dedup hashes |
| `LAST_RUN_TIMESTAMP` | ISO string of last successful run |
| `INSTALL_COMPLETE` | `"true"` or `"false"` |
| `FX_RATE_CACHE` | JSON object keyed by `"YYYY-MM-DD"`, value = BOC FXUSDCAD rate float. Avoids repeat API calls. |
| `CURRENT_ARCHIVE_FOLDER_ID` | Drive folder ID for current year's archive — updated automatically each January |
| `ARCHIVE_YEAR` | Current archive year as string e.g. `"2026"` — checked on every run for rollover |
| `PROCESSED_HASHES_0` | JSON array of SHA-256 dedup hashes, chunk 0 (max 100 entries per chunk) |
| `PROCESSED_HASHES_1` | Chunk 1 — created automatically when chunk 0 fills |
| `PROCESSED_HASHES_COUNT` | Number of chunks currently in use (integer as string) |

---

## CRA T2125 Line Numbers (Verified — CRA Official Sources)

### Part 3D — Cost of Goods Sold
| Code | Label |
|---|---|
| 8320 | Purchases During the Year |
| 8340 | Direct Wage Costs |
| 8360 | Subcontracts |
| 8450 | Other COGS |

### Part 4 — Operating Expenses
| Code | Label | Deductibility |
|---|---|---|
| 8521 | Advertising | 100% |
| 8523 | Meals & Entertainment | **50% only — ITA s.67.1** |
| 8590 | Bad Debts | 100% |
| 8690 | Insurance | 100% (NOT life insurance) |
| 8710 | Interest & Bank Charges | 100% |
| 8760 | Business Taxes, Licences & Memberships | 100% |
| 8810 | Office Expenses | 100% (also covers SaaS < $500/item) |
| 8811 | Office Stationery & Supplies | 100% (physical supplies only — pens, paper, stamps) |
| 8860 | Professional Fees | 100% (accounting, legal, bookkeeping) |
| 8871 | Management & Administration Fees | 100% |
| 8910 | Rent | 100% |
| 8960 | Repairs & Maintenance | 100% |
| 9060 | Salaries, Wages & Benefits | 100% |
| 9180 | Property Taxes | 100% |
| 9200 | Travel Expenses | 100% (flights, hotels, transit) |
| 9220 | Telephone & Utilities | Business % only (phone, internet, hydro) |
| 9224 | Fuel Costs (non-vehicle) | 100% |
| 9270 | Other Business Expenses | 100% (annual SaaS contracts, cloud infra, catch-all) |
| 9275 | Delivery, Freight & Express | 100% |
| 9281 | Motor Vehicle Expenses | Business % only — requires Chart A logbook |
| 9936 | Capital Cost Allowance (CCA) | Class 50 computers (55%), Class 8 furniture (20%) |

### Part 7 — Business-Use-of-Home
| Code | Label |
|---|---|
| WFH | Business-Use-of-Home (heat, electricity, insurance, mortgage interest, property tax) |

> **Software subscriptions:** No dedicated T2125 line.
> Use `8810` for monthly tools < $500/item. Use `9270` for annual contracts or cloud infra (AWS, GCP).

---

## Province Tax Rates (2026 — CRA Verified)

| Province | Code | Tax Type | Total Rate | GST | Provincial |
|---|---|---|---|---|---|
| Alberta | AB | GST | 5% | 5% | 0% |
| British Columbia | BC | GST+PST | 5%+7% | 5% | 7% PST (non-recoverable) |
| Manitoba | MB | GST+RST | 5%+7% | 5% | 7% RST (non-recoverable) |
| New Brunswick | NB | HST | 15% | 5% | 10% (recoverable) |
| Newfoundland & Labrador | NL | HST | 15% | 5% | 10% (recoverable) |
| Nova Scotia | NS | HST | 15% | 5% | 10% (recoverable) |
| Northwest Territories | NT | GST | 5% | 5% | 0% |
| Nunavut | NU | GST | 5% | 5% | 0% |
| Ontario | ON | HST | 13% | 5% | 8% (recoverable) |
| Prince Edward Island | PE | HST | 15% | 5% | 10% (recoverable) |
| Quebec | QC | GST+QST | 5%+9.975% | 5% | 9.975% QST (recoverable if registered) |
| Saskatchewan | SK | GST+PST | 5%+6% | 5% | 6% PST (non-recoverable) |
| Yukon | YT | GST | 5% | 5% | 0% |

> HST provinces: `gst_hst` captures the full combined rate.
> QC: `gst_hst` = federal GST (5%), `pst_qst` = QST (9.975%).
> BC/MB/SK: `gst_hst` = GST only; `pst_qst` = PST (non-recoverable — no ITC).

---

## USD → CAD Currency Conversion

### API: Bank of Canada Valet API
- **Free, no API key, no authentication required**
- CRA officially accepts Bank of Canada rates for foreign currency conversion — audit-proof
- Called via `UrlFetchApp.fetch()` in Apps Script

### Endpoint
```
GET https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json
    ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

### Response shape
```json
{
  "observations": [
    { "d": "2024-11-15", "FXUSDCAD": { "v": "1.3952" } }
  ]
}
```
If `observations` is empty, the date was a weekend or Canadian holiday — roll back one day and retry (up to 3 attempts).

### Conversion rules
- All monetary columns (E–J) are stored in **CAD only**
- Convert: `amount_cad = amount_usd * exchange_rate`
- Round to 2 decimal places
- Original USD total stored in col Q, rate in col R, rate date in col S
- Note appended: `"USD $45.00 → CAD $62.78 @ BOC rate 1.3952 (2024-11-15)"`
- If BOC rate unavailable after 3 retries: store original USD amounts in E–J, set Status = "Needs Review", note: "USD conversion failed — update manually"

### Rate caching
- Cache fetched rates in `PropertiesService` key `FX_RATE_CACHE` as JSON object `{ "YYYY-MM-DD": 1.3952 }`
- Check cache before every API call — BOC only publishes one rate per day
- Cache persists across trigger runs — no repeat calls for same date

### CurrencyConverter.gs — module responsibilities
- `getUsdCadRate(dateString)` — public, returns float rate for given date
- `convertUsdToCad(amountUsd, dateString)` — public, returns `{ amountCad, rate, rateDate }`
- `fetchBocRate(dateString)` — private, calls BOC API with weekend/holiday rollback
- `getCachedRate(dateString)` — private, reads from PropertiesService cache
- `setCachedRate(dateString, rate)` — private, writes to PropertiesService cache

---

## ITC Rules (CRA — from gst-hst-compliance skill)

| Expense | ITC Claimable |
|---|---|
| All standard business expenses | 100% of GST/HST paid |
| Meals & entertainment | 50% of GST/HST paid |
| Club memberships (golf, gym, recreational) | 0% — blocked ITA s.18(1)(l) |
| Life insurance premiums | 0% — personal expense |
| PST (BC, MB, SK) | 0% — non-recoverable |
| QST (QC) | 100% if registered with Revenu Québec |

---

## Gifts & Gift Cards — CRA Rules

**The AI cannot determine the recipient from a receipt — always set `is_gift: true` + `expense_type: "Review"`.** Three distinct CRA buckets:

### Bucket 1 — Gifts to Clients
| Gift Type | T2125 Line | Deductible |
|---|---|---|
| Restaurant gift card / certificate | 8523 M&E | **50%** (treated as M&E even if not present) |
| Entertainment tickets gifted to client | 8523 M&E | **50%** |
| Branded promo items with logo | 8521 Advertising | **100%** |
| General gift (wine, flowers, gift basket) | 8521 Advertising | **100%** (no per-gift cap in Canada) |
| General gift card (Amazon, Visa) to client | 8521 Advertising | **100%** |

### Bucket 2 — Gifts to Employees
| Gift Type | T2125 Line | Deductible | T4 Required? |
|---|---|---|---|
| Non-cash physical gift ≤ $500/yr | 9270 | 100% | No — CRA $500 annual exemption |
| Non-cash physical gift > $500/yr | 9060 | 100% | Yes — excess is taxable benefit |
| Gift card / cash (any amount) | 9060 | 100% | **Always** — CRA treats gift cards as "near cash"; must withhold CPP/EI/tax |

### Bucket 3 — Personal
Not deductible. Set `expense_type: "Personal"`.

### Processor rule
- `is_gift: true` → `expense_type: "Review"`, suggested `cra_category_code: "8521"`, route to Needs Review
- Notes explain all recipient scenarios so user can update correctly
- `deductible_amt` set to full amount pending user classification

---

## Non-Receipt Emails

The `To_Log` Gmail label will catch non-receipt emails from filtered vendors (marketing, shipping alerts, account notices). The AI must detect these via the `is_receipt` field.

- `is_receipt: true` — actual purchase receipt / invoice with a total and vendor
- `is_receipt: false` — marketing, shipping update, account alert, newsletter, reminder
- **If `is_receipt: false`:** skip all processing, mark Gmail thread as "loonielog-processed", log `"SKIPPED_NON_RECEIPT"` to Audit Log. Never write to sheet.

---

## WFH Processing Rule

Home office expenses (`cra_category_code: "WFH"`) cannot be auto-deducted:
- Require Part 7 % calculation: `business sq ft ÷ total home sq ft × annual home cost`
- Cannot create or increase a business loss
- Always route to Needs Review with `deductible_amt: null`
- Note: "Calculate business % in T2125 Part 7 — do not claim at full receipt value"

---

## Expense Type Classification

The `Expense Type` column (col L) uses a dropdown: **Business** / Personal / Review.

| Value | When to use | Effect on totals |
|---|---|---|
| **Business** | Default — all commercial vendors | Included in deductions + ITC |
| Personal | Obvious personal spend (grocery, pharmacy, clothing, streaming) | Excluded — deductible = 0, ITC = 0 |
| Review | Ambiguous vendors (Costco, Walmart, Amazon, gas stations) | Included with ⚠️ flag in Summary |

---

## Build Order

Build and test modules in this exact dependency order:
1.  `Config.gs`            — no dependencies
2.  `Code.gs`              — depends on Config
3.  `Installer.gs`         — depends on Config + Code
4.  `Sidebar.html`         — calls `Installer.installLoonieLog()`
5.  `CurrencyConverter.gs` — depends on Config only (standalone utility)
6.  `AIRouter.gs`          — depends on Config
7.  `Processor.gs`         — depends on Config + AIRouter + CurrencyConverter + SheetLogger
8.  `SheetLogger.gs`       — depends on Config
9.  `GmailHunter.gs`       — depends on AIRouter + Processor + SheetLogger
10. `DriveScanner.gs`      — depends on AIRouter + Processor + SheetLogger
11. `Dashboard.html`       — calls `Code.getDashboardData()`
