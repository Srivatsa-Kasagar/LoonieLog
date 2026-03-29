# LoonieLog — Master Code Generation Prompt
> Feed one prompt at a time. Each prompt begins with "Read CLAUDE.md first" —
> always do that before writing any code.
>
> **Embedded Skills:** Tax data sourced from `canadian-tax-cra` plugin skills
> (`gst-hst-compliance`, `expense-optimizer`) and verified against CRA official sources.
> All tax rules, line numbers, and rates are already in CLAUDE.md.

---

## PROMPT 1 — `Config.gs`

```
Read CLAUDE.md first, then generate Config.gs for LoonieLog.

This file must export (as global const objects) the following:

1. CRA_CATEGORIES — object mapping T2125 line code to display name.
   EXACT CRA T2125 line numbers — verified against CRA official sources and user's actual filings:

   // Part 3D — Cost of Goods Sold (product/resale businesses only)
   "8320": "Purchases During the Year",
   "8340": "Direct Wage Costs",
   "8360": "Subcontracts",
   "8450": "Other COGS",

   // Part 4 — Operating Expenses (sole proprietor T2125)
   "8521": "Advertising",
   "8523": "Meals & Entertainment",        // ⚠️ 50% deductible — ITA s.67.1
   "8590": "Bad Debts",
   "8690": "Insurance",
   "8710": "Interest & Bank Charges",
   "8760": "Business Taxes, Licences & Memberships",
   "8810": "Office Expenses",              // Small consumables AND software subscriptions (SaaS < $500/item)
   "8811": "Office Stationery & Supplies", // ⚠️ CRA definition: pens, paper, stamps — NOT software
   "8860": "Professional Fees",            // Accounting, legal, bookkeeping, tax prep
   "8871": "Management & Administration Fees",
   "8910": "Rent",
   "8960": "Repairs & Maintenance",
   "9060": "Salaries, Wages & Benefits",
   "9180": "Property Taxes",
   "9200": "Travel Expenses",              // Flights, hotels, car rental, transit
   "9220": "Telephone & Utilities",        // ⚠️ Phone, internet, hydro, gas — business portion only
   "9224": "Fuel Costs (non-vehicle)",
   "9270": "Other Business Expenses",      // ⚠️ Catch-all — software annual contracts, cloud infra
   "9275": "Delivery, Freight & Express",
   "9281": "Motor Vehicle Expenses",       // ⚠️ Gas, insurance, maintenance — business % only (Chart A)
   "9936": "Capital Cost Allowance (CCA)", // Computers (Class 50), furniture (Class 8), equipment

   // Part 7 — Business-Use-of-Home (internal tracking code, maps to BUH calculation)
   "WFH":  "Business-Use-of-Home",

   // Catch-all
   "other": "Miscellaneous / Needs Review",

   // ── IMPORTANT CORRECTIONS vs earlier drafts ──────────────────────────────
   // WRONG before → CORRECT now:
   // 8811 was "Software & Subscriptions" → is "Office Stationery & Supplies" (CRA confirmed)
   // 9220 was missing → is "Telephone & Utilities" (phone + internet + hydro)
   // 9270 was "Motor Vehicle Expenses" → is "Other Business Expenses" (catch-all)
   // 9281 was "Telephone & Utilities" → is "Motor Vehicle Expenses" (Chart A total)
   // Software subscriptions: use 8810 (< $500/item) or 9270 (annual contracts / cloud infra)
   // ─────────────────────────────────────────────────────────────────────────

2. VENDOR_FILTERS — array of objects for Gmail filter injection:
   Each object: { from: "domain.com", label: "To_Log" }
   Include: uber.com, ubereats.com, amazon.ca, amazon.com, apple.com,
   starbucks.com, rogers.com, bell.ca, telus.com, fido.ca, koodomobile.com,
   virginplus.ca, freedommobile.ca, eastlink.ca, videotron.com,
   staples.ca, canadiantire.ca, homedepot.ca, bestbuy.ca, costco.ca,
   shopify.com, skip.ca, doordash.com, freshbooks.com,
   stripe.com, paypal.com, godaddy.com, namecheap.com, cloudflare.com,
   github.com, notion.so, figma.com, dropbox.com, zoom.us, slack.com,
   microsoft.com, adobe.com, atlassian.com, netlify.com, vercel.com,
   westjet.com, aircanada.com, viarail.ca, expedia.com,
   canadapost.ca, purolator.com, fedex.com, ups.com, dhl.com,
   aws.amazon.com, google.com

2a. RECEIPT_SUBJECT_PATTERNS — array of subject keyword strings for Gmail filter injection.
    These are combined into a single OR query to catch receipts from ANY vendor regardless of domain.
    Include these keywords (case-insensitive, Gmail handles that):
    ["receipt", "invoice", "order confirmation", "order summary", "payment confirmation",
     "payment receipt", "your order", "order #", "tax invoice", "purchase confirmation",
     "subscription renewal", "billing statement", "statement of account", "e-receipt",
     "transaction receipt"]

    // Why subject patterns matter: domain filters only catch known vendors.
    // Subject patterns act as a universal catch-all — any vendor that sends a receipt
    // with standard keywords will be auto-labelled, even if not in VENDOR_FILTERS.

3. SHEET_COLUMNS — object mapping column names to their 1-based index:
   DATE=1, VENDOR=2, CRA_CODE=3, CRA_NAME=4, SUBTOTAL=5, GST_HST=6,
   PST_QST=7, TOTAL=8, DEDUCTIBLE=9, ITC_ELIGIBLE=10, CURRENCY=11,
   EXPENSE_TYPE=12, SOURCE=13, DRIVE_URL=14, LOGGED_AT=15, STATUS=16

   EXPENSE_TYPE valid values (use as a const array EXPENSE_TYPE_VALUES):
   ["Business", "Personal", "Review"]
   Default: "Business"

   USD conversion columns (only populated when receipt currency is USD):
   ORIGINAL_USD=17, EXCHANGE_RATE=18, RATE_DATE=19

4. AUDIT_COLUMNS — { TIMESTAMP=1, FUNCTION=2, DETAIL=3, STATUS=4 }

5. PROVINCE_TAX_RATES — object mapping province code to:
   { total_rate, gst_rate, provincial_rate, tax_name, has_qst: bool, itc_on_provincial: bool }
   Use EXACT 2026 CRA rates (sourced from canadian-tax-cra/gst-hst-compliance skill):

   AB: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0,      tax_name: "GST",     has_qst: false, itc_on_provincial: false }
   BC: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0.07,   tax_name: "GST+PST", has_qst: false, itc_on_provincial: false }
   MB: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0.07,   tax_name: "GST+RST", has_qst: false, itc_on_provincial: false }
   NB: { total_rate: 0.15, gst_rate: 0.05, provincial_rate: 0.10,   tax_name: "HST",     has_qst: false, itc_on_provincial: true  }
   NL: { total_rate: 0.15, gst_rate: 0.05, provincial_rate: 0.10,   tax_name: "HST",     has_qst: false, itc_on_provincial: true  }
   NS: { total_rate: 0.15, gst_rate: 0.05, provincial_rate: 0.10,   tax_name: "HST",     has_qst: false, itc_on_provincial: true  }
   NT: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0,      tax_name: "GST",     has_qst: false, itc_on_provincial: false }
   NU: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0,      tax_name: "GST",     has_qst: false, itc_on_provincial: false }
   ON: { total_rate: 0.13, gst_rate: 0.05, provincial_rate: 0.08,   tax_name: "HST",     has_qst: false, itc_on_provincial: true  }
   PE: { total_rate: 0.15, gst_rate: 0.05, provincial_rate: 0.10,   tax_name: "HST",     has_qst: false, itc_on_provincial: true  }
   QC: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0.09975,tax_name: "GST+QST", has_qst: true,  itc_on_provincial: true  }
   SK: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0.06,   tax_name: "GST+PST", has_qst: false, itc_on_provincial: false }
   YT: { total_rate: 0.05, gst_rate: 0.05, provincial_rate: 0,      tax_name: "GST",     has_qst: false, itc_on_provincial: false }

   Note: For HST provinces (NB, NL, NS, ON, PE), gst_hst field captures the full HST amount.
   For QC: gst_hst captures federal GST (5%), pst_qst captures QST (9.975%).
   For BC/MB/SK: gst_hst captures federal GST only; pst_qst captures PST (non-recoverable).

6. GEMINI_ENDPOINT and CLAUDE_ENDPOINT — API URL strings (no keys)

7. CRA_PROMPT_TEMPLATE — the master extraction prompt string.
   Make it a template literal so it can have dynamic fields injected later.
   Use EXACTLY this prompt (sourced from canadian-tax-cra skills — gst-hst-compliance + expense-optimizer):

   ```
   You are a Canadian tax expert and CRA compliance assistant (T2125 specialist).
   Analyze this receipt/invoice and return ONLY valid JSON — no markdown, no explanation.

   Required JSON fields:
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
     "is_gift": boolean,
     "is_receipt": boolean,
     "expense_type": "Business" | "Personal" | "Review",
     "confidence": "high" | "medium" | "low",
     "notes": "string or null"
   }

   Expense Type classification (DEFAULT is always "Business"):
   - "Business": clearly commercial — office supplies, software, cloud services, professional
     services, business travel, telecom, advertising, courier, co-working, business meals
   - "Personal": obvious personal — grocery stores (Loblaws, Metro, Sobeys), pharmacies
     (Shoppers Drug Mart, Rexall), clothing retail (H&M, Zara, Gap), entertainment (movie
     theatres, concerts, sports events), personal care (hair salon, spa), streaming services
     (Netflix, Spotify, Disney+), restaurants with zero business context
   - "Review": ambiguous — Costco, Walmart, Amazon, Canadian Tire, LCBO/Beer Store,
     gas stations (could be business vehicle or personal), Home Depot, RONA
   When in doubt, use "Business" — user will correct via dropdown.

   CRA T2125 Line Mapping — VERIFIED against CRA official sources:
   - 8521: Advertising (online ads, print, business cards, website)
   - 8523: Meals & Entertainment — set is_meal: true (50% deductible, ITA s.67.1)
   - 8590: Bad Debts
   - 8690: Insurance (business liability, professional, property — NOT life insurance)
   - 8710: Interest & Bank Charges (loan interest, bank fees, payment processing)
   - 8760: Business Taxes, Licences & Memberships
   - 8810: Office Expenses (small consumables + software subscriptions under $500/item)
   - 8811: Office Stationery & Supplies (pens, paper, stamps — physical supplies only)
   - 8860: Professional Fees (accounting, legal, bookkeeping, tax prep)
   - 8871: Management & Administration Fees (virtual assistants, admin services)
   - 8910: Rent (office, co-working, commercial space)
   - 8960: Repairs & Maintenance (business equipment, property)
   - 9060: Salaries, Wages & Benefits
   - 9200: Travel Expenses (flights, hotels, car rental, taxi — not local vehicle)
   - 9220: Telephone & Utilities (phone, internet, hydro, gas — business portion only)
   - 9224: Fuel Costs — non-vehicle (delivery, generators)
   - 9270: Other Business Expenses (annual SaaS contracts, cloud infra, catch-all)
   - 9275: Delivery, Freight & Express (courier, shipping, postage)
   - 9281: Motor Vehicle Expenses (gas, insurance, maintenance, leasing — business % of Chart A)
   - 9936: Capital Cost Allowance — set is_capital: true (computers, furniture, equipment > $500)
   - WFH:  Business-Use-of-Home (home heat, electricity, insurance, mortgage interest, property tax)

   is_receipt rules:
   - Set is_receipt: true ONLY for actual purchase receipts, invoices, or order confirmations
     showing a real monetary transaction with a vendor, date, and amount.
   - Set is_receipt: false for: marketing emails, shipping notifications, account statements,
     subscription renewal reminders, password resets, newsletters, welcome emails,
     order status updates without a total, or any email that is not a financial document.
   - If is_receipt: false, set all numeric fields to 0 and confidence to "low".

   is_gift rules:
   - Set is_gift: true when the purchase is clearly a gift for another person:
     florists, gift card purchases, gift shops, "send a gift" services, wine/chocolate
     purchased as gifts, Etsy/Amazon items described as gifts.
   - Set is_gift: false for all regular business purchases.

   Critical CRA rules:
   - Meals & entertainment: 50% deductible (ITA s.67.1). Always set is_meal: true.
   - Life insurance: NOT deductible — notes: "Blocked — personal expense, ITA s.18(1)(a)"
   - Club memberships (golf, gym, recreational): 0% — notes: "Blocked — ITA s.18(1)(l)"
   - Motor vehicle (9281): requires logbook; set notes: "Business % allocation required — Chart A"
   - Telephone/internet (9220): set notes: "Business portion only — allocate personal %"
   - Capital items (is_capital: true): notes: "CCA applies — Class 50 computers (55%), Class 8 furniture (20%), Class 12 small tools (100%)"
   - Software subscriptions: use 8810 if < $500/item per month; use 9270 if annual contract or cloud infra
   - USD receipts: extract raw values, notes: "USD — manual CAD conversion required at filing"
   - If confidence is low: explain specifically what is ambiguous
   ```

Include JSDoc on every const. No functions in this file.
```

---

## PROMPT 2 — `Code.gs`

```
Read CLAUDE.md first, then generate Code.gs — the entry point for LoonieLog.

Requirements:

1. onOpen(e) — creates the custom menu:
   "🚀 LoonieLog" with items:
   - "⚙️ Initialize Agent" → calls showSidebar()
   - "▶️ Run Now" → calls runProcessor() (disabled/greyed if INSTALL_COMPLETE != "true")
   - "📊 Open Dashboard" → calls showDashboard()
   - separator
   - "🔄 Check for Updates" → calls checkForPromptUpdates()

2. showSidebar() — opens Sidebar.html as a 380px wide sidebar
   Title: "LoonieLog Setup"

3. showDashboard() — opens Dashboard.html as a 400px wide sidebar
   Title: "LoonieLog Dashboard"

4. runProcessor() — main orchestrator called by both the time trigger and "Run Now":
   - Check INSTALL_COMPLETE == "true", else throw user-facing alert
   - Call GmailHunter.scanInbox()
   - Call DriveScanner.scanFolder()
   - Update "LAST_RUN_TIMESTAMP" in PropertiesService
   - Show toast: "✅ LoonieLog finished. X receipts processed."
   - Log to Audit: function="runProcessor", detail="Cycle complete", status="OK"

5. createTimeTrigger() — creates a daily trigger for runProcessor()
   - Check if trigger already exists before creating (by handler function name)
   - Trigger: every 24 hours

6. deleteAllTriggers() — utility to clean up triggers on reinstall

7. checkForPromptUpdates() — stub function:
   - Fetches a public JSON from a hardcoded UPDATE_URL (use placeholder URL)
   - If remote version > local "PROMPT_VERSION" property, updates CRA_PROMPT in properties
   - Shows alert to user with what changed

8. getDashboardData() — called by Dashboard.html on page load:
   Returns a JSON-serialisable object:
   {
     lastRun: "X hours ago" | "Never",
     installComplete: boolean,
     aiModel: string,
     province: string,
     apiKeyMasked: string,         // "●●●●●●" + last 4 chars
     filterCount: number,
     receiptCountTotal: number,    // total rows in Expenses tab
     receiptCountMonth: number,    // rows in current calendar month
     totalExpensesMonth: number,   // sum of col H (CAD) for current month, Business only
     totalITCMonth: number,        // sum of col J for current month, Business only
     totalDeductibleMonth: number, // sum of col I for current month, Business only
     needsReviewCount: number,     // row count in Needs Review tab
     srEdCount: number,            // from SheetLogger.getSrEdSummary()
     srEdTotal: number,
     recentAuditLog: [             // last 5 rows from Audit Log tab
       { timestamp, function, detail, status }
     ]
   }

9. reprocessItem(rowNumber, sheetName) — called by Dashboard "Retry" button:
   Allows re-processing a failed item from Needs Review tab.
   - Read row data from sheetName at rowNumber
   - Extract Drive URL from col N → get fileId from URL
   - Remove the row's dedup hash from PROCESSED_HASHES chunks
   - If source == "Gmail": show alert "Re-label the Gmail thread as To_Log, then click Run Now"
     (Gmail threads can't be re-queued programmatically without thread ID — guide user)
   - If source == "Drive": move file back to Unprocessed folder, delete the Needs Review row
     → File will be picked up on next runProcessor() or Run Now
   - Log to Audit: "Item re-queued for reprocessing"

Include full JSDoc. All errors caught and logged via logAudit().
```

---

## PROMPT 3 — `Installer.gs`

```
Read CLAUDE.md first, then generate Installer.gs.

This module handles the one-time setup triggered from the sidebar form submission.

1. installLoonieLog(formData) — main install function called from sidebar:
   Params: { apiKey: string, aiModel: "gemini"|"claude", province: string }

   Steps (in order, each wrapped in try/catch):
   a. Validate inputs — throw descriptive errors if missing
   b. Test API key by making a minimal test call to AIRouter.testConnection(apiKey, aiModel)
   c. createDriveFolders() — returns { unprocessedId, archiveId }
   d. createGmailLabel() — returns labelId
   e. injectGmailFilters(labelId) — inject all VENDOR_FILTERS from Config.gs
   f. setupSheetHeaders() — write headers to all sheet tabs
   g. storeSettings(apiKey, aiModel, province, folderIds, labelId)
   h. createTimeTrigger() (from Code.gs)
   i. Set INSTALL_COMPLETE = "true"
   j. Return { success: true, message: "LoonieLog is live! First scan in 24 hours." }
   On any error: return { success: false, message: error.message }

2. createDriveFolders() — private helper:
   - Check if folders exist by name before creating (idempotent)
   - Create "LoonieLog_Unprocessed" in Drive root
   - Create archive folder with dynamic year: "LoonieLog_Archive_" + new Date().getFullYear()
     // ⚠️ Never hardcode the year — archive folder rolls over annually
   - Store IDs in PropertiesService: UNPROCESSED_FOLDER_ID, CURRENT_ARCHIVE_FOLDER_ID
   - Also store "ARCHIVE_YEAR" = current year (string) for rollover detection
   - Return { unprocessedId, archiveId }

   Also add: checkAndRollArchiveFolder() — called at top of every runProcessor() cycle:
   - Read ARCHIVE_YEAR from PropertiesService
   - If ARCHIVE_YEAR != current year:
     → Create new "LoonieLog_Archive_YYYY" folder
     → Update CURRENT_ARCHIVE_FOLDER_ID and ARCHIVE_YEAR in PropertiesService
     → Log to Audit: "Archive folder rolled to new year"

3. createGmailLabel() — private helper:
   - Use Gmail Advanced Service (Gmail.Users.Labels.create)
   - Check if "To_Log" label already exists first (idempotent)
   - Label background color: "#16a766" (green), text color: "#ffffff"
   - Store labelId in PropertiesService
   - Return labelId

4. injectGmailFilters(labelId) — private helper:
   Two-pass approach: domain filters + subject pattern filter.

   Pass A — domain-based filters:
   - Loop through VENDOR_FILTERS from Config.gs
   - For each vendor, call Gmail.Users.Settings.Filters.create() with:
     { criteria: { from: vendor.from }, action: { addLabelIds: [labelId] } }
   - Skip if filter already exists (idempotent check)
   - Log count of filters created to Audit Log

   Pass B — subject keyword catch-all (single filter):
   - Build a single subject query by joining RECEIPT_SUBJECT_PATTERNS with " OR ":
     e.g. "receipt OR invoice OR \"order confirmation\" OR ..."
   - Call Gmail.Users.Settings.Filters.create() with:
     { criteria: { subject: subjectQuery }, action: { addLabelIds: [labelId] } }
   - This single filter catches receipts from ANY vendor using standard receipt language,
     regardless of whether their domain is in VENDOR_FILTERS.
   - Log "Subject pattern filter created" to Audit Log.

5. setupSheetHeaders() — private helper:
   - Write bold header row to "Expenses" tab using SHEET_COLUMNS from Config.gs
   - Write bold header row to "Needs Review" tab (same columns)
   - Write bold header row to "Audit Log" tab using AUDIT_COLUMNS
   - Write "Key" / "Value" headers to "Settings" tab
   - Apply column formatting: currency format to cols E-J, date format to col A
   - Freeze row 1 on all tabs

6. storeSettings(apiKey, aiModel, province, folderIds, labelId) — private helper:
   - Write all values to PropertiesService.getUserProperties()
   - Write REDACTED display to "Settings" sheet (show "API Key: ●●●●●●●●" not real key)

Include full JSDoc. Every step logs to Audit Log.
```

---

## PROMPT 4 — `AIRouter.gs`

```
Read CLAUDE.md first, then generate AIRouter.gs.

This module handles all AI API communication.

1. extractReceiptData(payload) — main routing function:
   Params: { type: "email"|"image"|"pdf", content: string|Blob, metadata: object }
   - Read AI_MODEL from PropertiesService
   - If "gemini": call callGemini(payload)
   - If "claude": call callClaude(payload)
   - Parse the JSON response string → validate it has required fields
   - If JSON parse fails: retry once with explicit "return only raw JSON" instruction
   - Return the parsed object or throw with detail

2. callGemini(payload) — private:
   - Endpoint: GEMINI_ENDPOINT from Config.gs (use gemini-1.5-flash model)
   - For text: use "text" part
   - For image/PDF: convert Blob to base64, use "inlineData" part with mimeType
   - Inject CRA_PROMPT_TEMPLATE as system instruction
   - Temperature: 0.1 (for deterministic extraction)
   - Return raw response text string

3. callClaude(payload) — private:
   - Endpoint: CLAUDE_ENDPOINT from Config.gs
   - Model: claude-3-5-sonnet-20241022
   - For text: use text content block
   - For image: use image content block with base64 source
   - Set max_tokens: 1024, temperature: 0.1
   - Include CRA_PROMPT_TEMPLATE as system message
   - Return raw response text string

4. testConnection(apiKey, aiModel) — called during install to validate key:
   - Send a minimal test prompt: "Return this JSON: {\"status\": \"ok\"}"
   - If response parses and contains status:ok → return true
   - Else throw "API key validation failed: [detail]"

5. buildPrompt(payload) — private:
   - Constructs the full prompt by injecting metadata (source email subject, file name)
     into CRA_PROMPT_TEMPLATE from Config.gs
   - Returns prompt string

Helper: blobToBase64(blob) — converts a Google Drive Blob to base64 string

All UrlFetchApp calls must:
- Set muteHttpExceptions: true
- Check response code — throw on 4xx/5xx with response body detail
- Implement exponential backoff: retry up to 3 times on 429 or 5xx
```

---

## PROMPT 5 — `CurrencyConverter.gs`

```
Read CLAUDE.md first, then generate CurrencyConverter.gs for LoonieLog.

This module handles all USD → CAD conversion using the Bank of Canada Valet API.
See the "USD → CAD Currency Conversion" section in CLAUDE.md for full spec.

1. getUsdCadRate(dateString) — public:
   - Params: dateString "YYYY-MM-DD"
   - Check cache first via getCachedRate(dateString)
   - If not cached: call fetchBocRate(dateString)
   - Return rate as float e.g. 1.3952
   - On failure after all retries: return null (caller handles fallback)

2. convertUsdToCad(amountUsd, dateString) — public:
   - Params: amountUsd (number), dateString "YYYY-MM-DD"
   - Call getUsdCadRate(dateString) → rate
   - If rate is null: return { amountCad: null, rate: null, rateDate: null, error: "BOC rate unavailable" }
   - amountCad = Math.round(amountUsd * rate * 100) / 100
   - Return { amountCad, rate, rateDate } where rateDate is the actual date the rate is from
     (may differ from dateString if weekend/holiday rollback occurred)

3. fetchBocRate(dateString) — private:
   - Endpoint: https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json
     ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
   - Call via UrlFetchApp.fetch() with muteHttpExceptions: true
   - Parse response: observations[0].FXUSDCAD.v → parseFloat
   - If observations array is empty (weekend/holiday): subtract 1 day, retry up to 3 times
   - If HTTP error or parse failure: throw with detail for logAudit
   - On success: call setCachedRate(actualDate, rate) before returning
   - Return { rate: float, rateDate: "YYYY-MM-DD" }

4. getCachedRate(dateString) — private:
   - Read FX_RATE_CACHE from PropertiesService (parse JSON, default to {})
   - Return cache[dateString] as float, or null if not found

5. setCachedRate(dateString, rate) — private:
   - Read FX_RATE_CACHE, add/update entry, write back to PropertiesService
   - Trim cache to last 365 entries (delete oldest keys) to avoid property size limits

Helper: subtractDay(dateString) — returns the previous calendar day as "YYYY-MM-DD"
  Use: new Date(dateString) adjusted by -1 day, formatted back to string.
  Do NOT use Utilities.formatDate with timezone offset — use UTC to avoid DST issues.

All errors logged via logAudit("CurrencyConverter", detail, "ERROR").
```

---

## PROMPT 6 — `Processor.gs`

```
Read CLAUDE.md first, then generate Processor.gs.

This module applies CRA compliance rules to raw AI output before logging.

1. processExtractedData(rawJson, source, driveFileId) — main function:
   Params:
   - rawJson: the parsed object from AIRouter
   - source: "Gmail" | "Drive"
   - driveFileId: string (Drive file ID for URL generation)

   // ⚠️ ORDER IS CRITICAL — USD conversion must happen before any tax math
   Steps:
   a. Validate required fields exist (date, vendor, total, currency) — throw if missing
   b. applyUsdConversion(rawJson)   ← FIRST: converts all amounts to CAD before any rule runs
   c. applyMealsRule(rawJson)       ← now works on CAD total
   d. applyITCRule(rawJson)         ← now works on CAD gst_hst
   e. applyExpenseTypeRule(rawJson) ← zeroes deductible/ITC if Personal
   f. applyWFHRule(rawJson)         ← flags home-office expenses for Part 7
   g. applyGiftRule(rawJson)        ← flags gift/gift-card for user review
   h. applyMissingGSTFlag(rawJson)  ← skips USD receipts automatically
   i. applyQSTRule(rawJson)         ← Quebec-specific QST handling
   j. generateDeduplicationHash(rawJson) → check against chunked PROCESSED_HASHES
   k. renameAndArchiveFile(driveFileId, rawJson) → returns new Drive URL
   l. Determine routing: confidence=="low" OR expense_type=="Review"
                         OR is_gift==true OR cra_category_code=="WFH"
                         → "Needs Review"; else → "Expenses"
   m. Return enriched data object ready for SheetLogger

2. applyUsdConversion(data) — private:
   - If data.currency != "USD": return data unchanged
   - Preserve originals BEFORE any conversion:
     → data.original_usd_total    = data.total    (written to col Q)
     → data.original_usd_subtotal = data.subtotal
   - Hash key uses these original values (see step j)
   - Call CurrencyConverter.convertUsdToCad() for each amount field:
     → subtotal_result = CurrencyConverter.convertUsdToCad(data.subtotal, data.date)
     → data.subtotal = subtotal_result.amountCad
     → data.gst_hst  = CurrencyConverter.convertUsdToCad(data.gst_hst,  data.date).amountCad
     → data.pst_qst  = CurrencyConverter.convertUsdToCad(data.pst_qst,  data.date).amountCad
     → data.total    = CurrencyConverter.convertUsdToCad(data.total,    data.date).amountCad
     → data.exchange_rate      = subtotal_result.rate     (col R)
     → data.exchange_rate_date = subtotal_result.rateDate (col S)
     → append to notes: "USD $X.XX → CAD $Y.YY @ BOC rate Z.ZZZZ (date)"
   - On failure (rate null):
     → keep original USD amounts, data.status = "Needs Review"
     → append to notes: "USD conversion failed — update manually before filing"
     → log to Audit: status "FX_CONVERSION_FAILED"
   - If currency is USD, gst_hst is almost always 0 (US vendor — no Canadian GST charged).
     This is expected and correct. Do NOT flag missing GST for USD receipts.

3. applyMealsRule(data) — private:
   - If data.is_meal == true:
     → data.deductible_amt = data.total * 0.50
     → append to notes: "50% meals rule applied per ITA s.67.1.
        Deductible = 50% of total paid (incl. tax). ITC separately = 50% of GST/HST."
   - Else: data.deductible_amt = data.total

4. applyITCRule(data) — private:
   - Guard: if data.currency == "USD" and conversion failed: itc_eligible = 0, return
   - Default: data.itc_eligible = data.gst_hst (full GST/HST recoverable)
   - Meals (is_meal == true): data.itc_eligible = data.gst_hst * 0.50
   - PST provinces (BC, MB, SK): itc_eligible excludes pst_qst (PST non-recoverable)
   - QST (province == "QC"): data.itc_qst = data.pst_qst (recoverable separately if registered)
   - Blocked — itc_eligible = 0 for:
     → club memberships (cra_category_code "8760" with "membership" in vendor)
     → life insurance (notes containing "life insurance")
   - Capital items (is_capital == true): itc_eligible = data.gst_hst (full ITC in purchase year)
     append to notes: "ITC claimable in purchase year. CCA applies for income deduction."
   Read PROVINCE from PropertiesService.

5. applyExpenseTypeRule(data) — private:
   - If AI returned no expense_type or invalid value: default to "Business"
   - If expense_type == "Personal":
     → data.deductible_amt = 0; data.itc_eligible = 0
     → append to notes: "Personal expense — excluded from deductions and ITC"
     → log to Audit with status "PERSONAL_FLAGGED"
   - If expense_type == "Review":
     → do NOT zero amounts (user hasn't confirmed yet)
     → append to notes: "Needs classification — update Expense Type column before filing"
   - If expense_type == "Business": no changes

6. applyWFHRule(data) — private:
   - If data.cra_category_code != "WFH": return unchanged
   - Home office expenses cannot be claimed at face value — require Part 7 % calculation
   → data.deductible_amt = null
   → data.itc_eligible = null
   → data.expense_type = "Review"
   → append to notes: "Home office expense — calculate business % in T2125 Part 7
      before claiming. Business sq ft ÷ total sq ft × annual home cost.
      Cannot create or increase business loss. Do not claim at full receipt value."

7. applyGiftRule(data) — private:
   - If data.is_gift != true: return unchanged
   - Always override to: data.expense_type = "Review"
   - Set data.cra_category_code = "8521" as suggested default (not final)
   - append to notes:
     "Gift expense — recipient determines deductibility:
      • Client gift (non-entertainment) → 8521 Advertising, 100% deductible
      • Client gift (restaurant GC or event tickets) → 8523 M&E, 50% only
      • Employee gift card / cash (any amount) → 9060 Salaries, T4 required
      • Employee non-cash gift ≤ $500/yr → 9270 Other, 100%, no T4
      • Personal gift → not deductible
      Update Expense Type and CRA Category after classifying recipient."

8. applyMissingGSTFlag(data) — private:
   - Skip entirely if data.currency == "USD" (US vendors don't charge Canadian GST)
   - Read PROVINCE from PropertiesService
   - If province != "QC" and gst_hst == 0 and total > 30:
     append to notes: "[No GST/HST — verify: may be zero-rated supply (groceries,
      prescriptions, exports), unregistered small supplier (<$30K revenue), or
      Indigenous tax exemption. No action needed if legitimately exempt.]"

9. applyQSTRule(data) — private:
   - If province == "QC": append to notes "QST ($X) recoverable if registered with Revenu Québec"

10. generateDeduplicationHash(data) — private:
    // ⚠️ Hash on ORIGINAL values before conversion to avoid rate-drift false duplicates
    - Hash string: data.vendor.toLowerCase() + "|" + data.date + "|" +
                   data.currency + "|" +
                   (data.currency == "USD" ? data.original_usd_total : data.total).toFixed(2)
    - Use Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashString)
    - Convert digest bytes to hex string
    - Read hash store via getProcessedHashes() helper (chunked — see below)
    - If hash found: throw new Error("DUPLICATE")
    - Else: add hash via addProcessedHash(hash) helper

    // ⚠️ PROCESSED_HASHES chunking — PropertiesService limit is ~9KB per key (~130 hashes)
    getProcessedHashes() — reads PROCESSED_HASHES_0, _1, _2 ... into a single flat array
    addProcessedHash(hash) — appends to the latest chunk; creates new chunk when current > 100 entries
    Each chunk key: "PROCESSED_HASHES_0", "PROCESSED_HASHES_1", etc.
    Store chunk count in "PROCESSED_HASHES_COUNT" property.
    clearAllHashes() — utility (used by DEV_MODE clearAllData): deletes all chunk keys

11. renameAndArchiveFile(driveFileId, data) — private:
    - New name format: YYYY-MM-DD_VendorName_$Total.ext
      Use original USD total in filename if currency was USD: e.g. 2024-11-15_Stripe_USD49.99.pdf
    - Sanitize vendor name: replace spaces/special chars with underscores, max 20 chars
    - Move file from Unprocessed to archive folder
      // ⚠️ Archive folder is year-dynamic — read CURRENT_ARCHIVE_FOLDER_ID from PropertiesService
      // NOT hardcoded. Installer creates the folder and stores its ID. See Installer.gs.
    - Return direct Drive URL: "https://drive.google.com/file/d/[fileId]/view"
```

---

## PROMPT 7 — `GmailHunter.gs`

```
Read CLAUDE.md first, then generate GmailHunter.gs.

1. scanInbox() — main function, called by runProcessor():
   - Read TO_LOG_LABEL_ID from PropertiesService
   - Search for threads: GmailApp.search('label:To_Log -label:loonielog-processed', 0, 50)
   - For each thread, process up to 3 most recent messages
   - Call processGmailMessage(message) for each
   - Return { processed: N, skipped: N, nonReceipt: N }

2. processGmailMessage(message) — private:
   - Extract: subject, from, date, plain body, HTML body
   - Strip HTML from body via stripHtml()
   - Extract attachments: getAttachments() — filter for PDF, PNG, JPG, JPEG only
   - For each attachment: save to Unprocessed Drive folder
   - Build payload and call AIRouter.extractReceiptData()
   // ⚠️ Non-receipt guard: AI returns is_receipt field in JSON
   - If result.is_receipt == false:
     → Mark thread as "loonielog-processed" (suppress future processing)
     → Log to Audit: "Non-receipt email skipped", status "SKIPPED_NON_RECEIPT"
     → Return without logging to sheet
   - If result.is_receipt == true:
     → Call Processor.processExtractedData() then SheetLogger.logExpense()
   - Mark thread: add "loonielog-processed" label (create if not exists)
   - On duplicate hash error: silently skip, log to Audit status "DUPLICATE"

3. saveAttachmentToDrive(attachment) — private:
   - Get UNPROCESSED_FOLDER_ID from PropertiesService
   - Create file in Drive: DriveApp.getFolderById(folderId).createFile(attachment)
   - Return { fileId, fileName }

4. stripHtml(html) — private:
   - Remove script/style tags and their content
   - Remove all remaining HTML tags
   - Decode common HTML entities (&amp; &nbsp; &lt; &gt;)
   - Collapse multiple whitespace
   - Return clean plain text (truncated to 3000 chars max for API efficiency)

5. huntPastReceipts() — called from Dashboard "Hunt Past Receipts" button:
   Backfills past 90 days. Called once after install or on demand.
   - Search: GmailApp.search('(receipt OR invoice OR order confirmation) newer_than:90d
             -label:loonielog-processed', 0, 100)
   - Process same as scanInbox() with rate limiting (Utilities.sleep(500) between calls)
   - Show progress toast every 10 emails: "LoonieLog: processed X of Y..."
   - Return total counts on completion
```

---

## PROMPT 8 — `DriveScanner.gs`

```
Read CLAUDE.md first, then generate DriveScanner.gs.

1. scanFolder() — main function, called by runProcessor():
   - Read UNPROCESSED_FOLDER_ID from PropertiesService
   - Get folder: DriveApp.getFolderById(folderId)
   - List files: folder.getFiles()
   - Filter: only process image/PDF files (check getMimeType())
   - For each file: call processdriveFile(file)
   - Return count of files processed

2. processDriveFile(file) — private:
   - Get file blob
   - Build payload: { type: "image", content: blob, metadata: { fileName, fileId, source: "Drive" } }
   - Call AIRouter.extractReceiptData(payload)
   - Call Processor.processExtractedData(result, "Drive", file.getId())
   - Call SheetLogger.logExpense(processedData)
   - On duplicate: skip and log audit
   - On AI error: move file to a "LoonieLog_Errors" subfolder, log audit

3. Supported MIME types (check against these):
   - application/pdf
   - image/jpeg
   - image/png
   - image/heic (flag as "may need conversion")
```

---

## PROMPT 9 — `SheetLogger.gs`

```
Read CLAUDE.md first, then generate SheetLogger.gs.

1. logExpense(data, tab) — main logging function:
   Params:
   - data: processed expense object from Processor.gs
   - tab: "Expenses" | "Needs Review" (default: "Expenses")
   - Get sheet by name
   - Append row using SHEET_COLUMNS mapping from Config.gs
   - Apply currency format to cols E-J (CAD amounts)
   - Cols Q-S (USD conversion columns): only populate if data.currency == "USD"
     Col Q (Original Amount USD): plain number format with prefix "USD $"
     Col R (BOC Exchange Rate): number format "0.0000"
     Col S (Rate Date): date format YYYY-MM-DD
     If currency == "CAD": leave Q, R, S blank
   - Hyperlink the Drive URL in col N: use =HYPERLINK() formula
   - On the EXPENSE_TYPE cell (col L): apply data validation dropdown
     Rule: SpreadsheetApp.newDataValidation().requireValueInList(["Business","Personal","Review"])
     .setAllowInvalid(false).build()
   - Apply conditional formatting to the EXPENSE_TYPE cell:
     "Business" → green background (#e6f4ea), dark green text (#1e7e34)
     "Personal" → red background (#fce8e6), dark red text (#c62828)
     "Review"   → yellow background (#fff8e1), dark amber text (#e65100)
   - Return the row number written

2. logAudit(functionName, detail, status) — global helper (called everywhere):
   - Get "Audit Log" sheet
   - Append: [new Date(), functionName, detail, status]
   - If sheet doesn't exist: create it first
   - Trim to max 1000 rows (delete oldest if over limit)

3. updateSummary() — called at end of each runProcessor() cycle:
   - Read all rows from "Expenses" tab
   - CRITICAL: filter rows by EXPENSE_TYPE column:
     → "Business" rows  → included in all totals
     → "Review" rows    → included in totals BUT flagged with a ⚠️ prefix in the summary
     → "Personal" rows  → EXCLUDED from all totals (never count toward deductions or ITC)
   - Group qualifying rows by: month, CRA category
   - Write to "Summary" tab:
     Section 1 — Current Month Business Summary:
       Total Expenses (Business only) | Total ITC | Total Deductible
     Section 2 — Breakdown by CRA category with totals
     Section 3 — Personal Expenses (separate section, for user awareness):
       Count and total of Personal-flagged rows this month — labelled "Non-deductible (Personal)"
     Section 4 — Needs Classification:
       Count and total of "Review" rows — labelled "⚠️ Unclassified — update before filing"
   - Highlight cells where ITC > $0 in green
   - Highlight "Needs Classification" section in yellow if count > 0

4. updateSettingsDisplay() — called after install and settings change:
   - Write to "Settings" tab:
     AI Model, Province, Last Run, Receipts Logged (count), Filters Active (count)
   - Mask API key as "●●●●●●" + last 4 chars

5. getExpenseCount() — utility: returns total row count in Expenses tab

6. clearAllData() — utility for testing:
   - Clears all rows (not headers) from Expenses, Needs Review, Audit Log
   - Resets PROCESSED_HASHES in PropertiesService to "[]"
   - Only callable if a "DEV_MODE" property is set to "true"
```

---

## PROMPT 10 — `Sidebar.html`

```
Read CLAUDE.md first, then generate Sidebar.html — the onboarding wizard UI.

Design requirements:
- Clean, modern design using only inline CSS (no external stylesheets — GAS restriction)
- Color palette: #16a766 (LoonieLog green), #1a1a2e (dark navy), #ffffff, #f8f9fa
- Font: system-ui, -apple-system, sans-serif
- Width: fits within 380px sidebar
- Responsive within the sidebar constraints

The sidebar is a 3-step wizard:

STEP 1 — Welcome
- LoonieLog logo/wordmark (CSS text-based, no images)
- Tagline: "Your invisible Canadian accountant"
- Brief 3-bullet value prop
- "Get Started →" button

STEP 2 — Configuration
Form fields:
a. AI Model selector (radio buttons with descriptions):
   ◉ Gemini 1.5 Flash — "Free tier available, fast" (default)
   ○ Claude 3.5 Sonnet — "Most accurate, requires API key"

b. API Key input (password type):
   - Label: "API Key"
   - Placeholder: "Paste your Gemini or Claude API key"
   - Helper text: "Stored securely in your Google account. Never shared."
   - "Get API Key" link (open in new tab, placeholder href)

c. Province dropdown:
   - All 13 Canadian provinces/territories
   - Default: Ontario
   - Helper: "Used for correct HST/QST calculations"

d. "Activate LoonieLog →" primary button (green)

STEP 3 — Progress / Complete
- Animated step-by-step progress list showing:
  ✓ Creating Drive folders
  ✓ Creating Gmail label
  ✓ Injecting vendor filters (X filters)
  ✓ Setting up spreadsheet
  ✓ Scheduling daily scan
- Final state: "🎉 LoonieLog is live!"
  Subtext: "Your first scan will run in 24 hours. Or click Run Now."
- "Close" button

JavaScript requirements:
- Step navigation (show/hide divs)
- Form validation before submit
- Call google.script.run.installLoonieLog(formData) on activate
- Handle success/failure callbacks
- Show spinner on button during install
- Progress list updates via withSuccessHandler callbacks from each step

Navigation:
- Step 1 → Step 2: "Get Started →" button
- Step 2 → Step 1: "← Back" text link (top-left of Step 2, subtle grey)
  Preserve all form values when navigating back and forward
- Step 2 → Step 3: "Activate LoonieLog →" triggers install
- Step 3 success: show completion state with "Close" button
- Step 3 error: show red error message + "← Fix settings" link that returns to Step 2
  with all form values still populated (do not reset the form on error)

Error handling:
- Show red inline error banner immediately below the form (not a dialog)
- API key failure: "API key invalid — check it's a valid Gemini or Claude key and try again"
- Province missing: "Please select your province"
- Never show "something went wrong" — always show the specific error.message from server

Include ALL CSS inline in <style> tag. Full working HTML.
```

---

## PROMPT 11 — `Dashboard.html`

```
Read CLAUDE.md first, then generate Dashboard.html — the status/settings panel.

Design requirements: same design system as Sidebar.html.

Sections:

1. STATUS HEADER
   - Large number: total receipts logged this month
   - Sub-stats row: Total Expenses | Total ITC | Deductible Amount
   - Formatted as currency (CAD)
   - Last run: "X hours ago" or "Never"
   - Status indicator: green dot "Active" or red dot "Not configured"

2. QUICK ACTIONS
   - "▶ Run Now" button → calls google.script.run.runProcessor()
   - "📬 Hunt Past Receipts" button → calls google.script.run.huntPastReceipts()
   - Show spinner + disable buttons while running
   - Show success/error toast after completion

3. SETTINGS DISPLAY (read-only)
   - AI Model: Gemini 1.5 Flash / Claude 3.5 Sonnet
   - Province: Ontario (ON)
   - API Key: ●●●●●●●●7b4a
   - Vendor Filters: 26 active
   - "Edit Settings" link → jumps back to setup wizard step 2

4. RECENT ACTIVITY
   - Last 5 entries from Audit Log displayed as a feed
   - Each entry: icon + function name + detail + timestamp
   - Color coded: green for OK, red for ERROR, yellow for WARNING

5. NEEDS REVIEW ALERT
   - If needsReviewCount > 0: show orange banner
   - "X receipts need your attention → View"
   - For each Needs Review item sourced from Drive: show a "Retry" button
     → calls google.script.run.reprocessItem(rowNumber, "Needs Review")
     → for Gmail-sourced items: show inline instruction "Re-label in Gmail → Run Now"

6. SR&ED INSIGHT (show only if srEdCount > 0)
   - Subtle teal info card: "💡 X expenses may qualify for SR&ED credits (~$Y potential ITC)"
   - Link: "Learn more about SR&ED" (placeholder href)

Load all data via google.script.run calls on page open:
- getDashboardData() → returns JSON with all stats (see Code.gs spec)
- Show skeleton loading state while fetching

Full working HTML with inline CSS. Same color palette as Sidebar.html.
```

---

## BONUS PROMPT — SR&ED Flag Enhancement (from canadian-tax-cra/sred-grants skill)

```
Read CLAUDE.md first, then add a function checkSrEdFlag(data) to Processor.gs.

Context: Canada's SR&ED program delivers ~$3-4B/year in tax credits to businesses doing
experimental development. LoonieLog can passively flag potential SR&ED-eligible expenses
as a value-add insight for users in tech, software, or product development.

The function must:

1. Check if the expense COULD relate to SR&ED activity:
   - Vendor is a cloud/compute provider: AWS, Google Cloud, Azure, DigitalOcean, Heroku
   - Category is software subscriptions (8811) AND is a development tool: GitHub, Figma,
     Notion, Postman, JetBrains, Linear, Vercel, Netlify, Sentry, Datadog
   - Category is professional fees with keywords: "research", "prototype", "experiment",
     "testing", "development" in the notes or vendor name
   - Category is office expenses AND vendor supplies lab/dev hardware

2. If a match: append to data.notes:
   "💡 SR&ED: This expense may be eligible for SR&ED ITC (35% refundable for CCPCs).
    Track with T661 documentation — technological uncertainty, work performed, results."

3. Only flag if confidence is "high" (don't add noise on uncertain extractions)

4. Log SR&ED flags to Audit Log with status "SR_ED_FLAG" for later reporting
   (users can filter Audit Log to see all potential SR&ED expenses)

5. Add a helper getSrEdSummary() to SheetLogger.gs that counts and totals all SR&ED-flagged
   expenses from the Audit Log — to show in Dashboard as:
   "💡 X expenses may qualify for SR&ED credits (~$Y in potential ITC)"

This is a passive, non-blocking enhancement — never delay or error the main pipeline.
```

---

## INTEGRATION TEST PROMPT

```
Read CLAUDE.md first, then add an integration test function to Code.gs called
runInstallationTest() accessible via the menu under "🔧 Developer Tools" (only shown
if DEV_MODE property == "true").

The test must:
1. Create a fake test receipt email in the To_Log label (create a simple Drive text file
   with fake receipt data as a substitute)
2. Run the full pipeline: scan → AI extract → process → log
3. Verify the row appears in the Expenses sheet
4. Verify the file was renamed and moved to Archive
5. Verify the dedup hash prevents a second run on the same item
6. Clean up all test data
7. Show a pass/fail report as a dialog

This validates the entire pipeline works end-to-end without needing a real receipt.
```

---

## EXECUTION ORDER

Build and test in this exact order:

```
1.  Config.gs             ← no dependencies, build first
2.  Code.gs               ← depends on Config
3.  Installer.gs          ← depends on Config + Code
4.  Sidebar.html          ← calls Installer.installLoonieLog()
5.  CurrencyConverter.gs  ← depends on Config only (standalone utility)
6.  AIRouter.gs           ← depends on Config
7.  Processor.gs          ← depends on Config + AIRouter + CurrencyConverter + SheetLogger
8.  SheetLogger.gs        ← depends on Config
9.  GmailHunter.gs        ← depends on AIRouter + Processor + SheetLogger
10. DriveScanner.gs       ← depends on AIRouter + Processor + SheetLogger
11. Dashboard.html        ← calls Code.getDashboardData()
```

---

*LoonieLog Code Prompt v1.0 — Feed each numbered prompt individually for best results.*
