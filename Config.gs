/**
 * @fileoverview Config.gs — LoonieLog global constants.
 * All constants are declared as var (not const/let) for Google Apps Script V8 compatibility
 * at global scope across multiple .gs files.
 *
 * No functions in this file — pure configuration only.
 * All tax data sourced from canadian-tax-cra plugin skills and verified against CRA official sources.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CRA T2125 CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CRA T2125 line code → display name mapping.
 * VERIFIED against CRA official T2125 form and user filings.
 *
 * CORRECTIONS vs earlier drafts:
 *   8811 was "Software & Subscriptions" → is "Office Stationery & Supplies" (CRA confirmed)
 *   9220 was missing               → is "Telephone & Utilities"
 *   9270 was "Motor Vehicle Expenses" → is "Other Business Expenses" (catch-all)
 *   9281 was "Telephone & Utilities" → is "Motor Vehicle Expenses" (Chart A total)
 *   Software subscriptions: use 8810 (< $500/item) or 9270 (annual contracts / cloud infra)
 *
 * @type {Object.<string, string>}
 */
var CRA_CATEGORIES = {
  // Part 3D — Cost of Goods Sold (product/resale businesses only)
  "8320": "Purchases During the Year",
  "8340": "Direct Wage Costs",
  "8360": "Subcontracts",
  "8450": "Other COGS",

  // Part 4 — Operating Expenses (sole proprietor T2125)
  "8521": "Advertising",                          // 100% deductible
  "8523": "Meals & Entertainment",                // ⚠️ 50% only — ITA s.67.1
  "8590": "Bad Debts",
  "8690": "Insurance",                            // Business only — NOT life insurance
  "8710": "Interest & Bank Charges",
  "8760": "Business Taxes, Licences & Memberships",
  "8810": "Office Expenses",                      // Small consumables + SaaS < $500/item
  "8811": "Office Stationery & Supplies",         // ⚠️ Physical only: pens, paper, stamps
  "8860": "Professional Fees",                    // Accounting, legal, bookkeeping, tax prep
  "8871": "Management & Administration Fees",
  "8910": "Rent",                                 // Office, co-working, commercial space
  "8960": "Repairs & Maintenance",
  "9060": "Salaries, Wages & Benefits",
  "9180": "Property Taxes",
  "9200": "Travel Expenses",                      // Flights, hotels, car rental, transit
  "9220": "Telephone & Utilities",                // ⚠️ Business portion only
  "9224": "Fuel Costs (non-vehicle)",
  "9270": "Other Business Expenses",              // ⚠️ Annual SaaS, cloud infra, catch-all
  "9275": "Delivery, Freight & Express",
  "9281": "Motor Vehicle Expenses",               // ⚠️ Business % only — requires Chart A logbook
  "9936": "Capital Cost Allowance (CCA)",         // Class 50 computers (55%), Class 8 furniture (20%)

  // Part 7 — Business-Use-of-Home
  "WFH":  "Business-Use-of-Home",                // Requires Part 7 % calculation

  // Catch-all
  "other": "Miscellaneous / Needs Review"
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. VENDOR FILTERS — domain-based Gmail filter list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known vendor email domains to auto-label with [To_Log] in Gmail.
 * Each entry creates one Gmail filter: from:domain → apply label.
 * @type {Array.<{from: string}>}
 */
var VENDOR_FILTERS = [
  // Food & delivery
  { from: "uber.com" },
  { from: "ubereats.com" },
  { from: "doordash.com" },
  { from: "skip.ca" },
  { from: "starbucks.com" },

  // E-commerce
  { from: "amazon.ca" },
  { from: "amazon.com" },
  { from: "apple.com" },
  { from: "bestbuy.ca" },
  { from: "costco.ca" },

  // Office & retail
  { from: "staples.ca" },
  { from: "canadiantire.ca" },
  { from: "homedepot.ca" },

  // Telecom — national carriers
  { from: "rogers.com" },
  { from: "bell.ca" },
  { from: "telus.com" },
  { from: "fido.ca" },
  { from: "koodomobile.com" },
  { from: "virginplus.ca" },
  { from: "freedommobile.ca" },
  { from: "eastlink.ca" },
  { from: "videotron.com" },

  // Cloud & SaaS
  { from: "github.com" },
  { from: "slack.com" },
  { from: "notion.so" },
  { from: "figma.com" },
  { from: "dropbox.com" },
  { from: "zoom.us" },
  { from: "microsoft.com" },
  { from: "adobe.com" },
  { from: "atlassian.com" },
  { from: "netlify.com" },
  { from: "vercel.com" },
  { from: "aws.amazon.com" },
  { from: "google.com" },
  { from: "shopify.com" },

  // Payments & finance
  { from: "stripe.com" },
  { from: "paypal.com" },
  { from: "freshbooks.com" },

  // Domain & hosting
  { from: "godaddy.com" },
  { from: "namecheap.com" },
  { from: "cloudflare.com" },

  // Travel
  { from: "westjet.com" },
  { from: "aircanada.com" },
  { from: "viarail.ca" },
  { from: "expedia.com" },

  // Shipping & courier
  { from: "canadapost.ca" },
  { from: "purolator.com" },
  { from: "fedex.com" },
  { from: "ups.com" },
  { from: "dhl.com" }
];

// ─────────────────────────────────────────────────────────────────────────────
// 2a. RECEIPT SUBJECT PATTERNS — universal catch-all Gmail filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subject line keywords joined into a single Gmail OR query.
 * Catches receipts from ANY vendor regardless of domain — niche Canadian
 * suppliers, local stores, or one-time purchases not in VENDOR_FILTERS.
 * Gmail filter uses: subject:(receipt OR invoice OR ...)
 * @type {string[]}
 */
var RECEIPT_SUBJECT_PATTERNS = [
  "receipt",
  "invoice",
  "order confirmation",
  "order summary",
  "payment confirmation",
  "payment receipt",
  "your order",
  "order #",
  "tax invoice",
  "purchase confirmation",
  "subscription renewal",
  "billing statement",
  "statement of account",
  "e-receipt",
  "e-bill",
  "bill",
  "statement",
  "transaction receipt"
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. SHEET COLUMNS — 1-based column index map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Column index map for the "Expenses" and "Needs Review" sheet tabs.
 * All monetary columns (SUBTOTAL through ITC_ELIGIBLE) are always stored in CAD.
 * USD original values are stored in ORIGINAL_USD / EXCHANGE_RATE / RATE_DATE.
 * @type {Object.<string, number>}
 */
var SHEET_COLUMNS = {
  DATE:          1,   // A — YYYY-MM-DD
  VENDOR:        2,   // B
  CRA_CODE:      3,   // C — e.g. "9270"
  CRA_NAME:      4,   // D — e.g. "Other Business Expenses"
  SUBTOTAL:      5,   // E — CAD
  GST_HST:       6,   // F — CAD
  PST_QST:       7,   // G — CAD
  TOTAL:         8,   // H — CAD
  DEDUCTIBLE:    9,   // I — CAD (50% for meals; 0 if Personal; null if CCA/WFH)
  ITC_ELIGIBLE:  10,  // J — CAD (0 if Personal or PST province)
  CURRENCY:      11,  // K — "CAD" or "USD" (original receipt currency)
  EXPENSE_TYPE:  12,  // L — "Business" | "Personal" | "Review" (dropdown)
  SOURCE:        13,  // M — "Gmail" or "Drive"
  DRIVE_URL:     14,  // N — hyperlink to archived receipt file
  LOGGED_AT:     15,  // O — timestamp
  STATUS:        16,  // P — "Processed" | "Needs Review"
  ORIGINAL_USD:  17,  // Q — original USD total (blank for CAD receipts)
  EXCHANGE_RATE: 18,  // R — BOC rate used e.g. 1.3952 (blank for CAD)
  RATE_DATE:     19   // S — date the BOC rate is from (may differ if weekend/holiday)
};

/**
 * Valid values for the Expense Type dropdown (col L).
 * Default is "Business" — user can correct via dropdown.
 * @type {string[]}
 */
var EXPENSE_TYPE_VALUES = ["Business", "Personal", "Review"];

/** @type {string} */
var EXPENSE_TYPE_DEFAULT = "Business";

// ─────────────────────────────────────────────────────────────────────────────
// 4. AUDIT LOG COLUMNS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Column index map for the "Audit Log" sheet tab.
 * This tab is append-only — never edited or deleted.
 * @type {Object.<string, number>}
 */
var AUDIT_COLUMNS = {
  TIMESTAMP: 1,  // A
  FUNCTION:  2,  // B
  DETAIL:    3,  // C
  STATUS:    4   // D — "OK" | "ERROR" | "WARN" | "SKIP"
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROVINCE TAX RATES — 2026 CRA verified
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provincial tax rates for 2026. Sourced from canadian-tax-cra/gst-hst-compliance skill
 * and verified against CRA official sources.
 *
 * Fields:
 *   total_rate         — combined rate shown on receipts (gst + provincial)
 *   gst_rate           — federal GST component (always 5%)
 *   provincial_rate    — provincial component (0 for GST-only provinces)
 *   tax_name           — display name for the tax type
 *   has_qst            — true only for QC; pst_qst field holds QST (recoverable if registered)
 *   itc_on_provincial  — true if provincial portion is ITC-eligible (HST provinces + QC)
 *
 * Note — HST provinces (NB, NL, NS, ON, PE):
 *   gst_hst captures the full combined HST amount.
 * Note — QC:
 *   gst_hst = federal GST (5%), pst_qst = QST (9.975%).
 * Note — BC/MB/SK:
 *   gst_hst = federal GST only; pst_qst = PST (non-recoverable — no ITC).
 *
 * @type {Object.<string, {total_rate: number, gst_rate: number, provincial_rate: number, tax_name: string, has_qst: boolean, itc_on_provincial: boolean}>}
 */
var PROVINCE_TAX_RATES = {
  AB: { total_rate: 0.05,    gst_rate: 0.05, provincial_rate: 0,       tax_name: "GST",     has_qst: false, itc_on_provincial: false },
  BC: { total_rate: 0.12,    gst_rate: 0.05, provincial_rate: 0.07,    tax_name: "GST+PST", has_qst: false, itc_on_provincial: false },
  MB: { total_rate: 0.12,    gst_rate: 0.05, provincial_rate: 0.07,    tax_name: "GST+RST", has_qst: false, itc_on_provincial: false },
  NB: { total_rate: 0.15,    gst_rate: 0.05, provincial_rate: 0.10,    tax_name: "HST",     has_qst: false, itc_on_provincial: true  },
  NL: { total_rate: 0.15,    gst_rate: 0.05, provincial_rate: 0.10,    tax_name: "HST",     has_qst: false, itc_on_provincial: true  },
  NS: { total_rate: 0.15,    gst_rate: 0.05, provincial_rate: 0.10,    tax_name: "HST",     has_qst: false, itc_on_provincial: true  },
  NT: { total_rate: 0.05,    gst_rate: 0.05, provincial_rate: 0,       tax_name: "GST",     has_qst: false, itc_on_provincial: false },
  NU: { total_rate: 0.05,    gst_rate: 0.05, provincial_rate: 0,       tax_name: "GST",     has_qst: false, itc_on_provincial: false },
  ON: { total_rate: 0.13,    gst_rate: 0.05, provincial_rate: 0.08,    tax_name: "HST",     has_qst: false, itc_on_provincial: true  },
  PE: { total_rate: 0.15,    gst_rate: 0.05, provincial_rate: 0.10,    tax_name: "HST",     has_qst: false, itc_on_provincial: true  },
  QC: { total_rate: 0.05,    gst_rate: 0.05, provincial_rate: 0.09975, tax_name: "GST+QST", has_qst: true,  itc_on_provincial: true  },
  SK: { total_rate: 0.11,    gst_rate: 0.05, provincial_rate: 0.06,    tax_name: "GST+PST", has_qst: false, itc_on_provincial: false },
  YT: { total_rate: 0.05,    gst_rate: 0.05, provincial_rate: 0,       tax_name: "GST",     has_qst: false, itc_on_provincial: false }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gemini 2.5 Flash endpoint (generateContent).
 * API key is appended as a query param at call time — never stored here.
 * @type {string}
 */
var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Claude 3.5 Sonnet messages endpoint.
 * API key is sent as x-api-key header at call time — never stored here.
 * @type {string}
 */
var CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";

/**
 * Bank of Canada Valet API for USD→CAD historical exchange rates.
 * Free, no auth required. CRA-accepted for foreign currency conversion.
 * @type {string}
 */
var BOC_FX_ENDPOINT = "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json";

/**
 * Public endpoint for CRA prompt version updates.
 * Replace with production URL before Marketplace launch.
 * @type {string}
 */
var UPDATE_URL = "https://loonielog.ca/updates/prompt-version.json";

/**
 * Developer's central Gemini 1.5 Flash proxy endpoint.
 * Used by Micro (Free) and Managed Pro tiers — no user API key required.
 * Deploy as a separate Apps Script Web App or Cloud Function and paste its URL here.
 * @type {string}
 */
var DEVELOPER_AI_ENDPOINT = "https://script.google.com/macros/s/DEVELOPER_DEPLOYMENT_ID/exec";

/**
 * URL shown in tier-limit alerts so users can upgrade.
 * @type {string}
 */
var UPGRADE_URL = "https://loonielog.ca/#pricing";

/**
 * Monthly receipt limits per subscription tier.
 * Mirror of TierManager.TIER_CONFIG.limit — kept here for quick reference in Config.
 * @type {{micro: number, core: number, managed: number}}
 */
var TIER_LIMITS = {
  micro:   8,
  core:    50,
  managed: 9999
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. LICENSE SERVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base URL of the LicenseServer Apps Script Web App.
 * Deploy license-server/LicenseServer.gs as a standalone Web App and paste the
 * deployment URL here. Format: https://script.google.com/macros/s/XXXX/exec
 * @type {string}
 */
var LICENSE_SERVER_URL = "https://script.google.com/macros/s/AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1/exec";

/**
 * Regex pattern for a valid Core DIY license key.
 * Format: CORE-XXXXX-XXXXX-XXXXX (uppercase alphanumeric, no 0/O/1/I)
 * @type {RegExp}
 */
var LICENSE_KEY_PATTERN = /^CORE-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/;

// ─────────────────────────────────────────────────────────────────────────────
// 7. CRA MASTER EXTRACTION PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master CRA-compliant extraction prompt injected into every AI API call.
 * Sourced from canadian-tax-cra skills: gst-hst-compliance + expense-optimizer.
 * Returns ONLY valid JSON — no markdown, no explanation.
 * @type {string}
 */
var CRA_PROMPT_TEMPLATE = `You are a Canadian tax expert and CRA compliance assistant (T2125 specialist).
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
  "cra_category_code": "8521"|"8523"|"8590"|"8690"|"8710"|"8760"|"8810"|"8811"|"8860"|"8871"|"8910"|"8960"|"9060"|"9200"|"9220"|"9224"|"9270"|"9275"|"9281"|"9936"|"WFH"|"other",
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
- "Business": clearly commercial — office supplies, software, cloud services, professional services, business travel, telecom, advertising, courier, co-working, business meals
- "Personal": obvious personal — grocery stores (Loblaws, Metro, Sobeys), pharmacies (Shoppers Drug Mart, Rexall), clothing retail (H&M, Zara, Gap), entertainment (movie theatres, concerts, sports events), personal care (hair salon, spa), streaming services (Netflix, Spotify, Disney+), restaurants with zero business context
- "Review": ambiguous — Costco, Walmart, Amazon, Canadian Tire, LCBO/Beer Store, gas stations (could be business vehicle or personal), Home Depot, RONA
When in doubt, use "Business" — user will correct via dropdown.

CRA T2125 Line Mapping — VERIFIED against CRA official sources:
- 8521: Advertising (online ads, print, business cards, website)
- 8523: Meals & Entertainment — set is_meal: true (50% deductible, ITA s.67.1). Includes restaurants, cafes, coffee shops, and food delivery apps (Uber Eats, DoorDash, SkipTheDishes, Instacart food orders)
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
- The file name and subject line do NOT determine is_receipt — only the document content does.
- Set is_receipt: true if the document contains ANY dollar amounts, line items with prices, subtotals, taxes, or payment confirmations — regardless of how the file is named or what the subject line says.
- This includes: food delivery order summaries (Uber Eats, DoorDash, SkipTheDishes — even if subject says "Your order"), travel bookings (Expedia, Airbnb, WestJet — even if subject says "confirmation" or "itinerary"), subscription charges, and any document where money changed hands.
- If source is "Drive", the user intentionally placed this file for processing — default to is_receipt: true unless the document is clearly empty of any financial data.
- Set is_receipt: false ONLY when the document contains zero dollar amounts and is purely informational (shipping tracking with no total, password reset, newsletter, welcome email, promotional offer with no charge).
- If is_receipt: false, set all numeric fields to 0 and confidence to "low".

is_gift rules:
- Set is_gift: true when the purchase is clearly a gift for another person: florists, gift card purchases, gift shops, "send a gift" services, wine/chocolate purchased as gifts, Etsy/Amazon items described as gifts.
- Set is_gift: false for all regular business purchases.

Critical CRA rules:
- Meals & entertainment: 50% deductible (ITA s.67.1). Always set is_meal: true.
- Life insurance: NOT deductible — notes: "Blocked — personal expense, ITA s.18(1)(a)"
- Club memberships (golf, gym, recreational): 0% — notes: "Blocked — ITA s.18(1)(l)"
- Motor vehicle (9281): requires logbook; set notes: "Business % allocation required — Chart A"
- Telephone/internet (9220): set notes: "Business portion only — allocate personal %"
- Capital items (is_capital: true): notes: "CCA applies — Class 50 computers (55%), Class 8 furniture (20%), Class 12 small tools (100%)"
- Software subscriptions: use 8810 if < $500/item per month; use 9270 if annual contract or cloud infra
- USD receipts: extract raw values as-is; conversion to CAD handled separately
- If confidence is low: explain specifically what is ambiguous`;
