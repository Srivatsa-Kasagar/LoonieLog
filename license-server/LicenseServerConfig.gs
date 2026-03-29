/**
 * @fileoverview LicenseServerConfig.gs — Constants for the LoonieLog License Server.
 *
 * ⚠️  SEPARATE PROJECT — deploy this as its own Apps Script Web App.
 *     Do NOT copy into the LoonieLog add-on project.
 *
 * Script Properties (set via Project Settings → Script Properties):
 *   STRIPE_SECRET_KEY        — sk_live_... or sk_test_... from Stripe Dashboard
 *   WEBHOOK_AUTH_TOKEN       — random secret string; appended to webhook URL as ?auth=
 *   LICENSES_SPREADSHEET_ID  — ID of the developer-owned LoonieLog_Licenses Google Sheet
 */

// ── Server metadata ──────────────────────────────────────────────────────────
var SERVER_VERSION      = "1.0.0";

// ── Sheet names ──────────────────────────────────────────────────────────────
var LICENSES_SHEET_NAME    = "Licenses";
var WEBHOOK_LOG_SHEET_NAME = "WebhookLog";
var WAITLIST_SHEET_NAME    = "Waitlist";

// ── License key format ───────────────────────────────────────────────────────
var KEY_PREFIX         = "CORE";
var KEY_ALPHABET       = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
var KEY_SEGMENT_LENGTH = 5;
var KEY_SEGMENT_COUNT  = 3;

// ── Stripe API ───────────────────────────────────────────────────────────────
var STRIPE_API_BASE    = "https://api.stripe.com/v1";

// ── Tier constants ───────────────────────────────────────────────────────────
var TIER_CORE          = "core";

// ── Licenses sheet column indices (1-based) ──────────────────────────────────
var LC = {
  KEY:            1,  // A — CORE-XXXXX-XXXXX-XXXXX
  SESSION_ID:     2,  // B — cs_live_...
  EMAIL:          3,  // C — customer email from Stripe
  NAME:           4,  // D — customer name from Stripe
  SUBSCRIPTION_ID:5,  // E — sub_... for cancellation handling
  STATUS:         6,  // F — "pending" | "active" | "revoked"
  CREATED_AT:     7,  // G — ISO timestamp
  ACTIVATED_AT:   8,  // H — ISO timestamp of first successful verify call
  LAST_VERIFIED:  9,  // I — ISO timestamp of most recent verify call
  ACTIVATION_COUNT:10 // J — integer, incremented on each verify
};

// ── Webhook log column indices (1-based) ─────────────────────────────────────
var WL = {
  RECEIVED_AT: 1,  // A
  EVENT_TYPE:  2,  // B
  REF_ID:      3,  // C — session_id or subscription_id
  STATUS:      4,  // D — "OK" | "ERROR" | "SKIP"
  DETAIL:      5   // E — human-readable description
};
