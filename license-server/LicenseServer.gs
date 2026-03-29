/**
 * @fileoverview LicenseServer.gs — LoonieLog License Management Web App.
 *
 * ⚠️  SEPARATE PROJECT — deploy as a standalone Apps Script Web App:
 *     Execute as: Me  |  Who has access: Anyone
 *
 * Handles:
 *   GET  ?action=checkout_success&session_id=cs_...  → post-payment key delivery
 *   GET  ?action=verify&key=CORE-XXXXX-XXXXX-XXXXX   → key validation by add-on
 *   POST ?auth=WEBHOOK_AUTH_TOKEN                     → Stripe webhook events
 *
 * Depends on: LicenseServerConfig.gs
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET handler — routes on e.parameter.action.
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput|GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  try {
    var action = e.parameter.action || "";

    if (action === "checkout_success") {
      return handleCheckoutSuccess_(e);
    }

    if (action === "verify") {
      return handleVerify_(e);
    }

    if (action === "waitlist") {
      return handleWaitlist_(e);
    }

    return jsonOut_({ error: "Unknown action" });

  } catch (err) {
    appendWebhookLog_("doGet.error", "", "ERROR", err.message);
    return jsonOut_({ error: err.message });
  }
}

/**
 * POST handler — Stripe webhook events.
 * Security: validates ?auth= query param against WEBHOOK_AUTH_TOKEN script property.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    var props     = PropertiesService.getScriptProperties();
    var authToken = props.getProperty("WEBHOOK_AUTH_TOKEN");

    if (!authToken || e.parameter.auth !== authToken) {
      appendWebhookLog_("doPost", "", "ERROR", "Unauthorized webhook call");
      return jsonOut_({ error: "Unauthorized" });
    }

    var event = JSON.parse(e.postData.contents);
    appendWebhookLog_(event.type, event.id || "", "OK", "Received");

    if (event.type === "checkout.session.completed") {
      handleCheckoutCompleted_(event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      handleSubscriptionCancelled_(event.data.object);
    }

    return jsonOut_({ received: true });

  } catch (err) {
    appendWebhookLog_("doPost.error", "", "ERROR", err.message);
    return jsonOut_({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — handleCheckoutSuccess_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when Stripe redirects the customer's browser after payment.
 * Fetches the full session from Stripe, issues a key if not already done,
 * and returns a branded HTML confirmation page to display in the browser.
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 * @private
 */
function handleCheckoutSuccess_(e) {
  var sessionId = e.parameter.session_id || "";
  var key       = "";
  var email     = "";

  try {
    if (!sessionId) throw new Error("Missing session_id parameter");

    var props   = PropertiesService.getScriptProperties();
    var session = fetchStripeSession_(sessionId, props);
    email       = (session.customer_details && session.customer_details.email)
                  ? session.customer_details.email
                  : (session.customer_email || "");

    var existingRow = findRowBySessionId_(sessionId);
    if (existingRow > 0) {
      // Key already issued (webhook fired first) — just read it back
      key = getLicensesSheet_().getRange(existingRow, LC.KEY).getValue();
      appendWebhookLog_("checkout_success.redirect", sessionId, "SKIP",
        "Key already issued — returning existing key to browser");
    } else {
      key = issueNewLicense_(session, props);
    }

  } catch (err) {
    appendWebhookLog_("checkout_success.error", sessionId, "ERROR", err.message);
    return HtmlService.createHtmlOutput(buildErrorPage_(err.message))
      .setTitle("LoonieLog — Something went wrong");
  }

  return HtmlService.createHtmlOutput(buildSuccessPage_(key, email))
    .setTitle("LoonieLog — License Activated");
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — handleCheckoutCompleted_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called from doPost() when Stripe fires checkout.session.completed.
 * Idempotent — no-op if a key was already issued for this session.
 *
 * @param {Object} session - Stripe Checkout Session object
 * @private
 */
function handleCheckoutCompleted_(session) {
  var sessionId = session.id || "";

  if (findRowBySessionId_(sessionId) > 0) {
    appendWebhookLog_("checkout.completed", sessionId, "SKIP",
      "Key already issued — idempotent no-op");
    return;
  }

  try {
    var props = PropertiesService.getScriptProperties();
    // Webhook session object may be partial — fetch full session from Stripe
    var fullSession = fetchStripeSession_(sessionId, props);
    issueNewLicense_(fullSession, props);
    appendWebhookLog_("checkout.completed", sessionId, "OK", "License issued via webhook");
  } catch (err) {
    appendWebhookLog_("checkout.completed", sessionId, "ERROR", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — handleVerify_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by the LoonieLog add-on to validate a license key.
 * Updates activation metadata on first use; updates last_verified_at on every call.
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput} JSON { valid, tier, email } or { valid, error }
 * @private
 */
function handleVerify_(e) {
  var key = (e.parameter.key || "").trim().toUpperCase();

  if (!isValidKeyFormat_(key)) {
    return jsonOut_({ valid: false, error: "Invalid key format" });
  }

  var row = findRowByKey_(key);
  if (row < 0) {
    return jsonOut_({ valid: false, error: "key_not_found" });
  }

  var sheet  = getLicensesSheet_();
  var status = sheet.getRange(row, LC.STATUS).getValue();

  if (status === "revoked") {
    return jsonOut_({ valid: false, error: "key_revoked" });
  }

  var now        = new Date().toISOString();
  var activatedAt = sheet.getRange(row, LC.ACTIVATED_AT).getValue();
  var count       = Number(sheet.getRange(row, LC.ACTIVATION_COUNT).getValue()) || 0;

  // First activation
  if (!activatedAt) {
    sheet.getRange(row, LC.ACTIVATED_AT).setValue(now);
    sheet.getRange(row, LC.STATUS).setValue("active");
  }

  sheet.getRange(row, LC.LAST_VERIFIED).setValue(now);
  sheet.getRange(row, LC.ACTIVATION_COUNT).setValue(count + 1);

  var email = sheet.getRange(row, LC.EMAIL).getValue();
  return jsonOut_({
    valid:       true,
    tier:        TIER_CORE,
    email:       email,
    activatedAt: activatedAt || now
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — handleWaitlist_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records a waitlist signup in the Waitlist sheet.
 * Called by the LoonieLog add-on via doGet ?action=waitlist&email=...&plan=...
 * Silently deduplicates — if the email is already on the list, updates the plan.
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput} JSON { success: true } or { error }
 * @private
 */
function handleWaitlist_(e) {
  var email = (e.parameter.email || "").trim().toLowerCase();
  var plan  = (e.parameter.plan  || "core_diy").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonOut_({ error: "Invalid email address" });
  }

  var validPlans = ["core_diy", "managed_pro"];
  if (validPlans.indexOf(plan) === -1) plan = "core_diy";

  try {
    var sheet    = getWaitlistSheet_();
    var lastRow  = sheet.getLastRow();
    var now      = new Date().toISOString();

    // Deduplicate — update plan if email already exists
    if (lastRow > 1) {
      var emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).toLowerCase() === email) {
          sheet.getRange(i + 2, 2).setValue(plan);       // update plan
          sheet.getRange(i + 2, 3).setValue(now);         // update timestamp
          appendWebhookLog_("waitlist.update", email, "OK", "Updated plan → " + plan);
          return jsonOut_({ success: true });
        }
      }
    }

    sheet.appendRow([email, plan, now]);
    appendWebhookLog_("waitlist.signup", email, "OK", plan);
    return jsonOut_({ success: true });

  } catch (err) {
    appendWebhookLog_("waitlist.error", email, "ERROR", err.message);
    return jsonOut_({ error: err.message });
  }
}

/**
 * Returns the Waitlist sheet, creating it with headers if it doesn't exist.
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getWaitlistSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty("LICENSES_SPREADSHEET_ID");
  if (!ssId) throw new Error("LICENSES_SPREADSHEET_ID not set in Script Properties");

  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(WAITLIST_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(WAITLIST_SHEET_NAME);
    sheet.appendRow(["email", "plan", "signed_up_at"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 240);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 180);
  }

  return sheet;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — handleSubscriptionCancelled_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called from doPost() when a Stripe subscription is cancelled.
 * Sets the matching license row status to "revoked".
 *
 * @param {Object} subscription - Stripe Subscription object
 * @private
 */
function handleSubscriptionCancelled_(subscription) {
  var subId = subscription.id || "";
  var row   = findRowBySubscriptionId_(subId);

  if (row < 0) {
    appendWebhookLog_("subscription.deleted", subId, "WARN",
      "No license found for subscription — may have been manually issued");
    return;
  }

  getLicensesSheet_().getRange(row, LC.STATUS).setValue("revoked");
  appendWebhookLog_("subscription.deleted", subId, "OK",
    "License revoked for subscription " + subId);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — issueNewLicense_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a license key, writes a row to the Licenses sheet, and emails the customer.
 * Called by both the redirect handler and the webhook handler.
 *
 * @param {Object} session   - Full Stripe Checkout Session object
 * @param {GoogleAppsScript.Properties.Properties} props - Script properties
 * @returns {string} The generated license key
 * @private
 */
function issueNewLicense_(session, props) {
  var email   = (session.customer_details && session.customer_details.email)
                ? session.customer_details.email : (session.customer_email || "");
  var name    = (session.customer_details && session.customer_details.name)
                ? session.customer_details.name : "";
  var subId   = session.subscription || "";
  var sessId  = session.id || "";

  var key = generateLicenseKey_();

  getLicensesSheet_().appendRow([
    key,           // A — license_key
    sessId,        // B — stripe_session_id
    email,         // C — email
    name,          // D — name
    subId,         // E — subscription_id
    "pending",     // F — status
    new Date().toISOString(), // G — created_at
    "",            // H — activated_at
    "",            // I — last_verified_at
    0              // J — activation_count
  ]);

  sendLicenseEmail_(email, name, key);
  appendWebhookLog_("issueNewLicense", sessId, "OK",
    "Key issued: " + key + " → " + email);

  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — fetchStripeSession_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches a full Checkout Session object from the Stripe API.
 * Expands customer_details so we have the email and name.
 *
 * @param {string} sessionId - Stripe Checkout Session ID
 * @param {GoogleAppsScript.Properties.Properties} props
 * @returns {Object} Full Stripe session object
 * @private
 */
function fetchStripeSession_(sessionId, props) {
  var secretKey = props.getProperty("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not set in Script Properties");

  var url = STRIPE_API_BASE + "/checkout/sessions/" + sessionId +
            "?expand[]=customer_details";

  var response = UrlFetchApp.fetch(url, {
    method:             "get",
    headers:            { "Authorization": "Basic " + Utilities.base64Encode(secretKey + ":") },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("Stripe API error " + response.getResponseCode() +
                    ": " + response.getContentText().slice(0, 200));
  }

  return JSON.parse(response.getContentText());
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — sendLicenseEmail_
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends the license key to the customer via GmailApp.
 *
 * @param {string} email - Customer email address
 * @param {string} name  - Customer display name (may be empty)
 * @param {string} key   - License key e.g. CORE-XXXXX-XXXXX-XXXXX
 * @private
 */
function sendLicenseEmail_(email, name, key) {
  if (!email) {
    appendWebhookLog_("sendLicenseEmail", key, "WARN", "No email address — skipping");
    return;
  }

  var greeting = name ? ("Hi " + name.split(" ")[0] + ",") : "Hi,";

  var body =
    greeting + "\n\n" +
    "Thank you for upgrading to LoonieLog Core DIY!\n\n" +
    "Your license key:\n\n" +
    "    " + key + "\n\n" +
    "To activate in Google Sheets:\n" +
    "  1. Open your LoonieLog spreadsheet\n" +
    "  2. Click  🚀 LoonieLog  in the menu bar\n" +
    "  3. Click  🔑 Activate License Key\n" +
    "  4. Paste the key above and click Activate\n\n" +
    "Your plan will switch to Core DIY — 50 receipts/month.\n\n" +
    "Keep this email. The key works on any device where you use LoonieLog.\n\n" +
    "Questions? Email hello@loonielog.ca — we reply within 5 business days.\n\n" +
    "— LoonieLog";

  try {
    GmailApp.sendEmail(email, "Your LoonieLog Core DIY License Key", body);
  } catch (err) {
    appendWebhookLog_("sendLicenseEmail", key, "ERROR",
      "GmailApp.sendEmail failed for " + email + ": " + err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Sheet helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Licenses sheet, creating headers if the sheet is empty.
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getLicensesSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty("LICENSES_SPREADSHEET_ID");
  if (!ssId) throw new Error("LICENSES_SPREADSHEET_ID not set in Script Properties");

  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(LICENSES_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(LICENSES_SHEET_NAME);
    sheet.appendRow([
      "license_key", "stripe_session_id", "email", "name",
      "stripe_subscription_id", "status", "created_at",
      "activated_at", "last_verified_at", "activation_count"
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Appends a row to the WebhookLog sheet.
 *
 * @param {string} eventType
 * @param {string} refId     - Session ID, subscription ID, or key
 * @param {string} status    - "OK" | "ERROR" | "WARN" | "SKIP"
 * @param {string} detail
 * @private
 */
function appendWebhookLog_(eventType, refId, status, detail) {
  try {
    var props = PropertiesService.getScriptProperties();
    var ssId  = props.getProperty("LICENSES_SPREADSHEET_ID");
    if (!ssId) return;

    var ss    = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName(WEBHOOK_LOG_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(WEBHOOK_LOG_SHEET_NAME);
      sheet.appendRow(["received_at", "event_type", "ref_id", "status", "detail"]);
      sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([new Date(), eventType, refId, status, detail]);
  } catch (e) {
    Logger.log("appendWebhookLog_ failed: " + e.message);
  }
}

/**
 * Scans column A of the Licenses sheet for an exact key match.
 *
 * @param {string} key - License key to find
 * @returns {number} 1-based row number, or -1 if not found
 * @private
 */
function findRowByKey_(key) {
  return findRowByColumn_(LC.KEY, key);
}

/**
 * Scans column B for a Stripe session ID.
 *
 * @param {string} sessionId
 * @returns {number} 1-based row number, or -1 if not found
 * @private
 */
function findRowBySessionId_(sessionId) {
  return findRowByColumn_(LC.SESSION_ID, sessionId);
}

/**
 * Scans column E for a Stripe subscription ID.
 *
 * @param {string} subId
 * @returns {number} 1-based row number, or -1 if not found
 * @private
 */
function findRowBySubscriptionId_(subId) {
  return findRowByColumn_(LC.SUBSCRIPTION_ID, subId);
}

/**
 * Generic column scanner for the Licenses sheet.
 *
 * @param {number} col   - 1-based column index (use LC.* constants)
 * @param {string} value - Value to match
 * @returns {number} 1-based row number, or -1 if not found
 * @private
 */
function findRowByColumn_(col, value) {
  if (!value) return -1;
  try {
    var sheet = getLicensesSheet_();
    var last  = sheet.getLastRow();
    if (last < 2) return -1;

    var values = sheet.getRange(2, col, last - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === value) return i + 2;
    }
  } catch (e) {
    Logger.log("findRowByColumn_ error: " + e.message);
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Key generation + validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a unique license key in the format CORE-XXXXX-XXXXX-XXXXX.
 * Retries up to 5 times on collision (astronomically unlikely).
 *
 * @returns {string} License key
 * @private
 */
function generateLicenseKey_() {
  for (var attempt = 0; attempt < 5; attempt++) {
    var segments = [];
    for (var s = 0; s < KEY_SEGMENT_COUNT; s++) {
      var seg = "";
      for (var c = 0; c < KEY_SEGMENT_LENGTH; c++) {
        seg += KEY_ALPHABET.charAt(Math.floor(Math.random() * KEY_ALPHABET.length));
      }
      segments.push(seg);
    }
    var key = KEY_PREFIX + "-" + segments.join("-");
    if (findRowByKey_(key) < 0) return key;
  }
  throw new Error("Failed to generate a unique license key after 5 attempts");
}

/**
 * Validates license key format: CORE-XXXXX-XXXXX-XXXXX
 *
 * @param {string} key
 * @returns {boolean}
 * @private
 */
function isValidKeyFormat_(key) {
  return /^CORE-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Response helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a JSON ContentService output.
 *
 * @param {Object} obj
 * @returns {GoogleAppsScript.Content.TextOutput}
 * @private
 */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Builds a branded HTML success page shown in the user's browser after payment.
 *
 * @param {string} key   - License key to display
 * @param {string} email - Customer email
 * @returns {string} HTML string
 * @private
 */
function buildSuccessPage_(key, email) {
  return '<!DOCTYPE html><html><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>LoonieLog — You\'re in!</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:Inter,system-ui,sans-serif;background:#030712;color:#f1f5f9;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}' +
    '.card{max-width:460px;width:100%;background:rgba(255,255,255,0.04);' +
    'border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px 36px;text-align:center}' +
    '.logo{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:24px}' +
    '.logo span{color:#00dc82}' +
    '.emoji{font-size:48px;display:block;margin-bottom:16px}' +
    'h1{font-size:24px;font-weight:700;margin-bottom:8px;letter-spacing:-0.5px}' +
    'p{color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:20px}' +
    '.key-box{background:#080f1f;border:1px solid rgba(0,220,130,0.3);border-radius:10px;' +
    'padding:16px 20px;font-family:monospace;font-size:18px;letter-spacing:2px;' +
    'color:#00dc82;margin:20px 0;word-break:break-all}' +
    '.steps{text-align:left;background:rgba(255,255,255,0.03);border-radius:10px;' +
    'padding:16px 20px;margin-top:20px;font-size:13px;color:#94a3b8;line-height:2}' +
    '.steps strong{color:#f1f5f9}' +
    '</style></head><body>' +
    '<div class="card">' +
    '<div class="logo">Loonie<span>Log</span></div>' +
    '<span class="emoji">🎉</span>' +
    '<h1>You\'re on Core DIY!</h1>' +
    '<p>Your license key has been emailed to <strong style="color:#f1f5f9">' + escapeHtml_(email) + '</strong>. It\'s also shown below.</p>' +
    '<div class="key-box">' + escapeHtml_(key) + '</div>' +
    '<div class="steps">' +
    '<strong>To activate in Google Sheets:</strong><br>' +
    '1. Open your LoonieLog spreadsheet<br>' +
    '2. Click 🚀 LoonieLog in the menu<br>' +
    '3. Click 🔑 Activate License Key<br>' +
    '4. Paste this key and click Activate' +
    '</div></div></body></html>';
}

/**
 * Builds a simple error page for the browser redirect.
 *
 * @param {string} message
 * @returns {string} HTML string
 * @private
 */
function buildErrorPage_(message) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>LoonieLog — Error</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#030712;color:#f1f5f9;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}' +
    '.card{max-width:420px;text-align:center;background:rgba(248,113,113,0.08);' +
    'border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:32px}' +
    'h2{color:#f87171;margin-bottom:12px}p{color:#94a3b8;font-size:14px}</style></head><body>' +
    '<div class="card"><h2>Something went wrong</h2>' +
    '<p>' + escapeHtml_(message) + '</p>' +
    '<p style="margin-top:16px">Please email <a href="mailto:hello@loonielog.ca" ' +
    'style="color:#00dc82">hello@loonielog.ca</a> with your Stripe receipt and we\'ll sort it out.</p>' +
    '</div></body></html>';
}

/**
 * Escapes HTML special characters to prevent XSS in generated pages.
 *
 * @param {string} str
 * @returns {string}
 * @private
 */
function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
