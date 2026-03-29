/**
 * @fileoverview Code.gs — LoonieLog entry point.
 * Registers the custom menu, exposes the global trigger handler,
 * orchestrates the main processor run, and provides data to the Dashboard.
 *
 * Depends on: Config.gs
 * Called by: time-based trigger, sidebar/dashboard HTML, manual "Run Now"
 */

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL AUDIT HELPER — available to all .gs files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a structured row to the "Audit Log" sheet tab.
 * Use this instead of Logger.log() for all operational events.
 *
 * @param {string} action    - The function or module name (e.g. "runProcessor")
 * @param {string} detail    - Human-readable description of the event
 * @param {string} status    - "OK" | "ERROR" | "WARN" | "SKIP"
 */
function logAudit(action, detail, status) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Audit Log");
    if (!sheet) {
      sheet = ss.insertSheet("Audit Log");
      sheet.appendRow(["Timestamp", "Function", "Detail", "Status"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), action, detail, status]);
  } catch (e) {
    Logger.log("logAudit failed: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. onOpen — build the custom menu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs automatically when the spreadsheet is opened.
 * Builds the "🚀 LoonieLog" custom menu.
 *
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - onOpen event object
 */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu("🚀 LoonieLog")
      .addItem("⚙️ Initialize Agent", "showSidebar")
      .addItem("▶️ Run Now", "runProcessor")
      .addItem("📊 Open Dashboard", "showDashboard")
      .addSeparator()
      .addItem("🔧 Change Settings", "showSettings")
      .addItem("🔑 Activate License Key", "showActivateLicense")
      .addItem("⭐ Upgrade to Core DIY", "showUpgradePrompt")
      .addSeparator()
      .addItem("🔄 Check for Updates", "checkForPromptUpdates")
      .addItem("📋 Refresh Summary Tab", "refreshSummary")
      .addToUi();
  } catch (e) {
    logAudit("onOpen", "Menu build failed: " + e.message, "ERROR");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. showSidebar — onboarding wizard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the Sidebar.html onboarding wizard as a 380px sidebar.
 */
function showSidebar() {
  try {
    var html = HtmlService.createHtmlOutputFromFile("Sidebar")
      .setTitle("LoonieLog Setup")
      .setWidth(380);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    logAudit("showSidebar", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Could not open sidebar: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. showDashboard — status panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens Dashboard.html as a sidebar.
 * @param {boolean} [wide] - If true, opens at 600px; otherwise 380px.
 */
function showDashboard(wide) {
  try {
    var tmpl   = HtmlService.createTemplateFromFile("Dashboard");
    tmpl.isWide = !!wide;
    var html   = tmpl.evaluate()
      .setTitle("LoonieLog Dashboard")
      .setWidth(wide ? 600 : 380);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    logAudit("showDashboard", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Could not open dashboard: " + e.message);
  }
}

/**
 * Reopens the dashboard at a different width. Called from the ⟷ toggle in Dashboard.html.
 * @param {boolean} wide
 */
function reopenDashboard(wide) {
  showDashboard(wide);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. showSettings / getSettingsData / saveSettings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens Settings.html as a 380px sidebar.
 */
function showSettings() {
  try {
    var html = HtmlService.createHtmlOutputFromFile("Settings")
      .setTitle("LoonieLog Settings")
      .setWidth(380);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    logAudit("showSettings", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Could not open settings: " + e.message);
  }
}

/**
 * Returns current AI model to pre-populate the Settings sidebar.
 *
 * @returns {{ aiModel: string }}
 */
function getSettingsData() {
  var props = PropertiesService.getUserProperties();
  return { aiModel: props.getProperty("AI_MODEL") || "gemini" };
}

/**
 * Saves updated AI model and/or API key from the Settings sidebar.
 * API key is only replaced if the user provided a non-empty value.
 *
 * @param {{ aiModel: string, apiKey: string }} formData
 * @returns {{ success: boolean, message: string }}
 */
function saveSettings(formData) {
  try {
    var props  = PropertiesService.getUserProperties();
    var model  = (formData.aiModel === "claude") ? "claude" : "gemini";
    var newKey = (formData.apiKey || "").trim();

    if (newKey) {
      var test = AIRouter.testConnection(newKey, model);
      if (!test.success) {
        return { success: false, message: "API key test failed: " + test.message };
      }
      props.setProperty("API_KEY", newKey);
    }

    props.setProperty("AI_MODEL", model);
    SheetLogger.updateSettingsDisplay();

    var modelLabel = (model === "claude") ? "Claude 3.5 Sonnet" : "Gemini 2.5 Flash";
    var msg = "Switched to " + modelLabel + (newKey ? " with new API key." : ". Key unchanged.");
    logAudit("saveSettings", msg, "OK");
    return { success: true, message: msg };

  } catch (e) {
    logAudit("saveSettings", e.message, "ERROR");
    return { success: false, message: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. runProcessor — main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main processing cycle. Called by the daily time trigger and the "Run Now" menu item.
 * Scans Gmail and Drive for new receipts, processes them, and updates last-run timestamp.
 *
 * @returns {number} Total number of receipts processed in this cycle
 */
function runProcessor() {
  try {
    var props = PropertiesService.getUserProperties();

    if (props.getProperty("INSTALL_COMPLETE") !== "true") {
      SpreadsheetApp.getUi().alert(
        "LoonieLog is not set up yet.\nPlease run ⚙️ Initialize Agent first."
      );
      return 0;
    }

    // ── Pre-flight: enforce monthly tier limit ────────────────────────────
    if (!TierManager.checkMonthlyUsage()) {
      return 0; // alert already shown by checkMonthlyUsage
    }

    // Roll archive folder if year has changed
    checkAndRollArchiveFolder();

    var gmailCount  = GmailHunter.scanInbox();
    var driveCount  = DriveScanner.scanFolder();
    var totalCount  = gmailCount + driveCount;

    props.setProperty("LAST_RUN_TIMESTAMP", new Date().toISOString());

    // Show tier usage summary in toast
    var summary = TierManager.getTierSummary();
    var usageNote = summary.isUnlimited
      ? ""
      : " (" + summary.count + "/" + summary.limit + " this month)";

    SpreadsheetApp.getActiveSpreadsheet()
      .toast("✅ LoonieLog finished. " + totalCount + " receipt(s) processed." + usageNote, "LoonieLog", 6);

    logAudit("runProcessor",
      "Cycle complete — Gmail: " + gmailCount + ", Drive: " + driveCount +
      " | Tier: " + summary.label + " | Usage: " + summary.count + "/" +
      (summary.isUnlimited ? "∞" : summary.limit), "OK");
    return totalCount;

  } catch (e) {
    logAudit("runProcessor", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("LoonieLog error: " + e.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. createTimeTrigger — daily scheduled run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a daily time-based trigger for runProcessor() at 2:00 AM.
 * Idempotent — removes any existing runProcessor trigger before creating a new one.
 * Only schedules the trigger if the user has not already hit their monthly tier limit.
 */
function setDailyTrigger() {
  try {
    // Remove existing runProcessor triggers to avoid duplicates
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "runProcessor") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    ScriptApp.newTrigger("runProcessor")
      .timeBased()
      .atHour(2)
      .nearMinute(0)
      .everyDays(1)
      .create();

    logAudit("setDailyTrigger", "Daily trigger set for runProcessor at 2:00 AM", "OK");

  } catch (e) {
    logAudit("setDailyTrigger", e.message, "ERROR");
    throw e;
  }
}

/**
 * Backwards-compatible alias for setDailyTrigger().
 * Installer.gs calls createTimeTrigger() — this ensures existing installs keep working.
 */
function createTimeTrigger() {
  setDailyTrigger();
}

// ─────────────────────────────────────────────────────────────────────────────
// Global wrappers — required because google.script.run can only call
// top-level functions, not methods on IIFE module objects.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// License activation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens ActivateLicense.html as a modal dialog.
 * Triggered by "🔑 Activate License Key" menu item.
 */
function showActivateLicense() {
  try {
    var html = HtmlService.createHtmlOutputFromFile("ActivateLicense")
      .setWidth(400)
      .setHeight(300);
    SpreadsheetApp.getUi().showModalDialog(html, "Activate License");
  } catch (e) {
    logAudit("showActivateLicense", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Could not open license dialog: " + e.message);
  }
}

/**
 * Global wrapper for LicenseManager.activateLicense().
 * Called by ActivateLicense.html via google.script.run.
 *
 * @param {string} key - License key entered by user
 * @returns {{ success: boolean, message: string, tier?: string }}
 */
function activateLicenseKey(key) {
  return LicenseManager.activateLicense(key);
}

/**
 * Global wrapper for GmailHunter.huntPastReceipts().
 * Called by the Dashboard "Past 90d" button via google.script.run.
 *
 * @returns {{ processed: number }}
 */
function huntPastReceipts() {
  return GmailHunter.huntPastReceipts();
}

/**
 * Submits an email address to the LoonieLog waitlist via the license server.
 * Called by UpgradePrompt.html when the user joins the waitlist.
 *
 * @param {string} email - User's email address
 * @param {string} plan  - "core_diy" | "managed_pro"
 * @returns {{ success: boolean, message: string }}
 */
function joinWaitlist(email, plan) {
  try {
    var url      = LICENSE_SERVER_URL +
                   "?action=waitlist" +
                   "&email=" + encodeURIComponent(email) +
                   "&plan="  + encodeURIComponent(plan || "core_diy");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var result   = JSON.parse(response.getContentText());

    if (result && result.success) {
      logAudit("joinWaitlist", email + " → " + plan, "OK");
      return { success: true, message: "You're on the list!" };
    }

    logAudit("joinWaitlist", "Server error: " + (result.error || "unknown"), "WARN");
    return { success: false, message: result.error || "Could not save your email. Please try again." };

  } catch (e) {
    logAudit("joinWaitlist", e.message, "ERROR");
    return { success: false, message: e.message };
  }
}

/**
 * Activates the named sheet tab so it becomes visible to the user.
 * Called by the Dashboard "View →" link on the Needs Review banner.
 *
 * @param {string} sheetName - Tab name to activate (e.g. "Needs Review")
 */
function selectSheet(sheetName) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (sheet) sheet.activate();
  } catch (e) {
    logAudit("selectSheet", e.message, "ERROR");
  }
}

/**
 * Opens a browser URL to the LoonieLog pricing page.
 * Called from the "⭐ Upgrade Plan" menu item.
 */
function showUpgradePrompt() {
  try {
    var html = HtmlService.createHtmlOutputFromFile("UpgradePrompt")
      .setWidth(400)
      .setHeight(460);
    SpreadsheetApp.getUi().showModalDialog(html, "LoonieLog Plans");
  } catch (e) {
    logAudit("showUpgradePrompt", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Could not open upgrade dialog: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. deleteAllTriggers — cleanup utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes all project triggers. Called during reinstall to avoid duplicate triggers.
 */
function deleteAllTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
    logAudit("deleteAllTriggers", "Deleted " + triggers.length + " trigger(s)", "OK");
  } catch (e) {
    logAudit("deleteAllTriggers", e.message, "ERROR");
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. installLoonieLogFromProperties — test installation wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test wrapper for installLoonieLog() that reads required values from Script Properties.
 * Use this for testing instead of installLoonieLog() directly.
 *
 * @returns {{success: boolean, message: string}}
 */
function installLoonieLogFromProperties() {
  try {
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty("API_KEY");
    var aiModel = props.getProperty("AI_MODEL");
    var province = props.getProperty("PROVINCE");

    if (!apiKey || !aiModel || !province) {
      throw new Error("Missing Script Properties. Please set: API_KEY, AI_MODEL, PROVINCE");
    }

    var formData = {
      apiKey: apiKey,
      aiModel: aiModel,
      province: province
    };

    return installLoonieLog(formData);
  } catch (e) {
    logAudit("installLoonieLogFromProperties", e.message, "ERROR");
    return { success: false, message: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8a. refreshSummary — manual summary rebuild
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuilds the Summary tab from current Expenses + Needs Review data.
 * Available from the LoonieLog menu as "📋 Refresh Summary Tab".
 */
function refreshSummary() {
  try {
    SheetLogger.updateSummary();
    SpreadsheetApp.getActiveSpreadsheet().toast("Summary tab updated.", "LoonieLog", 4);
  } catch (e) {
    logAudit("refreshSummary", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Summary refresh failed: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. checkForPromptUpdates — Pro tier CRA prompt refresh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks the public update endpoint for a newer CRA prompt version.
 * If a newer version exists, replaces the stored prompt and notifies the user.
 * Pro tier feature — stub uses placeholder URL from Config.gs UPDATE_URL.
 */
function checkForPromptUpdates() {
  try {
    var response = UrlFetchApp.fetch(UPDATE_URL, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      SpreadsheetApp.getUi().alert("Update check failed — server unavailable.");
      return;
    }

    var remote  = JSON.parse(response.getContentText());
    var props   = PropertiesService.getUserProperties();
    var localVersion = props.getProperty("PROMPT_VERSION") || "0";

    if (remote.version > localVersion) {
      props.setProperty("CRA_PROMPT_OVERRIDE", remote.cra_prompt);
      props.setProperty("PROMPT_VERSION", remote.version);
      SpreadsheetApp.getUi().alert(
        "✅ CRA prompt updated to v" + remote.version + "\n\n" +
        "What changed:\n" + (remote.changelog || "See update notes for details.")
      );
      logAudit("checkForPromptUpdates", "Updated to v" + remote.version, "OK");
    } else {
      SpreadsheetApp.getUi().alert("✅ LoonieLog is up to date (v" + localVersion + ").");
      logAudit("checkForPromptUpdates", "Already on latest version " + localVersion, "OK");
    }
  } catch (e) {
    logAudit("checkForPromptUpdates", e.message, "ERROR");
    SpreadsheetApp.getUi().alert("Update check error: " + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. getDashboardData — JSON payload for Dashboard.html
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a JSON-serialisable object consumed by Dashboard.html on page load.
 * Aggregates run stats, monthly totals, review counts, and recent audit entries.
 *
 * @returns {{
 *   lastRun: string,
 *   installComplete: boolean,
 *   aiModel: string,
 *   province: string,
 *   apiKeyMasked: string,
 *   filterCount: number,
 *   receiptCountTotal: number,
 *   receiptCountMonth: number,
 *   totalExpensesMonth: number,
 *   totalITCMonth: number,
 *   totalDeductibleMonth: number,
 *   needsReviewCount: number,
 *   srEdCount: number,
 *   srEdTotal: number,
 *   recentAuditLog: Array.<{timestamp: string, func: string, detail: string, status: string}>
 * }}
 */
function getDashboardData() {
  try {
    var props = PropertiesService.getUserProperties();
    var ss    = SpreadsheetApp.getActiveSpreadsheet();

    // ── Last run timestamp ───────────────────────────────────────────────────
    var lastRunRaw = props.getProperty("LAST_RUN_TIMESTAMP");
    var lastRun    = "Never";
    if (lastRunRaw) {
      var diffMs   = new Date() - new Date(lastRunRaw);
      var diffHrs  = Math.floor(diffMs / 3600000);
      lastRun      = diffHrs < 1 ? "Less than 1 hour ago"
                   : diffHrs === 1 ? "1 hour ago"
                   : diffHrs + " hours ago";
    }

    // ── API key masked ───────────────────────────────────────────────────────
    var rawKey       = props.getProperty("API_KEY") || "";
    var apiKeyMasked = rawKey.length > 4
      ? "●●●●●●" + rawKey.slice(-4)
      : "Not set";

    // ── Expenses tab stats ───────────────────────────────────────────────────
    var expSheet         = ss.getSheetByName("Expenses");
    var receiptCountTotal = 0;
    var receiptCountMonth = 0;
    var totalExpensesMonth = 0;
    var totalITCMonth      = 0;
    var totalDeductibleMonth = 0;

    if (expSheet && expSheet.getLastRow() > 1) {
      var now         = new Date();
      var curYear     = now.getFullYear();
      var curMonth    = now.getMonth();
      var dataRows    = expSheet.getRange(2, 1, expSheet.getLastRow() - 1, SHEET_COLUMNS.RATE_DATE).getValues();

      receiptCountTotal = dataRows.length;

      for (var i = 0; i < dataRows.length; i++) {
        var row          = dataRows[i];
        var rowDate      = new Date(row[SHEET_COLUMNS.DATE - 1]);
        var expenseType  = row[SHEET_COLUMNS.EXPENSE_TYPE - 1];

        if (rowDate.getFullYear() === curYear && rowDate.getMonth() === curMonth) {
          receiptCountMonth++;
          if (expenseType === "Business") {
            totalExpensesMonth   += Number(row[SHEET_COLUMNS.TOTAL - 1])      || 0;
            totalITCMonth        += Number(row[SHEET_COLUMNS.ITC_ELIGIBLE - 1]) || 0;
            totalDeductibleMonth += Number(row[SHEET_COLUMNS.DEDUCTIBLE - 1]) || 0;
          }
        }
      }
    }

    // ── Needs Review count ───────────────────────────────────────────────────
    var reviewSheet      = ss.getSheetByName("Needs Review");
    var needsReviewCount = reviewSheet ? Math.max(0, reviewSheet.getLastRow() - 1) : 0;

    // ── Tier summary ─────────────────────────────────────────────────────────
    var tier = TierManager.getTierSummary();

    // ── SR&ED stats ──────────────────────────────────────────────────────────
    var srEd       = SheetLogger.getSrEdSummary();
    var srEdCount  = srEd ? srEd.count : 0;
    var srEdTotal  = srEd ? srEd.total : 0;

    // ── Recent audit log ─────────────────────────────────────────────────────
    var auditSheet    = ss.getSheetByName("Audit Log");
    var recentAuditLog = [];
    if (auditSheet && auditSheet.getLastRow() > 1) {
      var auditStart = Math.max(2, auditSheet.getLastRow() - 4);
      var auditRows  = auditSheet.getRange(auditStart, 1, auditSheet.getLastRow() - auditStart + 1, 4).getValues();
      for (var j = auditRows.length - 1; j >= 0; j--) {
        recentAuditLog.push({
          timestamp: auditRows[j][0] ? new Date(auditRows[j][0]).toLocaleString() : "",
          func:      auditRows[j][1] || "",
          detail:    auditRows[j][2] || "",
          status:    auditRows[j][3] || ""
        });
      }
    }

    return {
      lastRun:              lastRun,
      installComplete:      props.getProperty("INSTALL_COMPLETE") === "true",
      aiModel:              props.getProperty("AI_MODEL")  || "Not set",
      province:             props.getProperty("PROVINCE")  || "Not set",
      apiKeyMasked:         apiKeyMasked,
      filterCount:          VENDOR_FILTERS.length + 1,  // +1 for subject pattern filter
      receiptCountTotal:    receiptCountTotal,
      receiptCountMonth:    receiptCountMonth,
      totalExpensesMonth:   Math.round(totalExpensesMonth   * 100) / 100,
      totalITCMonth:        Math.round(totalITCMonth        * 100) / 100,
      totalDeductibleMonth: Math.round(totalDeductibleMonth * 100) / 100,
      needsReviewCount:     needsReviewCount,
      srEdCount:            srEdCount,
      srEdTotal:            srEdTotal,
      recentAuditLog:       recentAuditLog,
      tierLabel:            tier.label,
      tierCount:            tier.count,
      tierLimit:            tier.limit,
      tierRemaining:        tier.remaining,
      tierPct:              tier.pct,
      isUnlimited:          tier.isUnlimited
    };

  } catch (e) {
    logAudit("getDashboardData", e.message, "ERROR");
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. reprocessItem — re-queue a failed receipt from Needs Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by the Dashboard "Retry" button.
 * Re-queues a row from Needs Review for reprocessing on the next run.
 * For Drive source: moves file back to Unprocessed folder and deletes the row.
 * For Gmail source: guides the user to re-label the thread manually.
 *
 * @param {number} rowNumber  - 1-based row index in the sheet tab
 * @param {string} sheetName  - "Needs Review" (or "Expenses" for future use)
 * @returns {{success: boolean, message: string}}
 */
function reprocessItem(rowNumber, sheetName) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);

    var rowData  = sheet.getRange(rowNumber, 1, 1, SHEET_COLUMNS.RATE_DATE).getValues()[0];
    var source   = rowData[SHEET_COLUMNS.SOURCE   - 1];
    var driveUrl = rowData[SHEET_COLUMNS.DRIVE_URL - 1];

    // Remove dedup hash for this row so it will be re-processed
    _removeHashForRow_(rowData);

    if (source === "Drive" && driveUrl) {
      var fileId = _extractFileIdFromUrl_(driveUrl);
      if (fileId) {
        var file           = DriveApp.getFileById(fileId);
        var unprocessedId  = PropertiesService.getUserProperties().getProperty("UNPROCESSED_FOLDER_ID");
        if (unprocessedId) {
          var unprocessedFolder = DriveApp.getFolderById(unprocessedId);
          file.moveTo(unprocessedFolder);
        }
      }
      sheet.deleteRow(rowNumber);
      logAudit("reprocessItem", "Row " + rowNumber + " moved back to Unprocessed — will re-process on next run", "OK");
      return { success: true, message: "Receipt moved back to Unprocessed. It will be re-processed on the next run or click Run Now." };
    }

    if (source === "Gmail") {
      logAudit("reprocessItem", "Row " + rowNumber + " is Gmail source — manual re-label required", "WARN");
      return { success: false, message: "Gmail receipts can't be re-queued automatically. Re-apply the To_Log label to the original email, then click Run Now." };
    }

    return { success: false, message: "Unknown source: " + source };

  } catch (e) {
    logAudit("reprocessItem", e.message, "ERROR");
    return { success: false, message: e.message };
  }
}

/**
 * Extracts a Google Drive file ID from a Drive URL.
 * Handles both /file/d/{id}/ and open?id={id} formats.
 *
 * @param {string} url - Google Drive file URL
 * @returns {string|null} File ID or null if not found
 * @private
 */
function _extractFileIdFromUrl_(url) {
  var match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
              url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Removes the dedup hash for a given expense row from chunked PropertiesService storage.
 * Hash is vendor + date + currency + original amount (same formula as GmailHunter).
 *
 * @param {Array} rowData - Full row array from the sheet
 * @private
 */
function _removeHashForRow_(rowData) {
  try {
    var vendor   = rowData[SHEET_COLUMNS.VENDOR    - 1] || "";
    var date     = rowData[SHEET_COLUMNS.DATE      - 1] || "";
    var currency = rowData[SHEET_COLUMNS.CURRENCY  - 1] || "CAD";
    var amount   = currency === "USD"
      ? rowData[SHEET_COLUMNS.ORIGINAL_USD - 1]
      : rowData[SHEET_COLUMNS.TOTAL        - 1];

    var raw      = vendor + String(date) + currency + String(amount);
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    var hash      = hashBytes.map(function(b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    }).join("");

    var props      = PropertiesService.getUserProperties();
    var chunkCount = parseInt(props.getProperty("PROCESSED_HASHES_COUNT") || "1", 10);

    for (var i = 0; i < chunkCount; i++) {
      var key    = "PROCESSED_HASHES_" + i;
      var stored = JSON.parse(props.getProperty(key) || "[]");
      var idx    = stored.indexOf(hash);
      if (idx !== -1) {
        stored.splice(idx, 1);
        props.setProperty(key, JSON.stringify(stored));
        return;
      }
    }
  } catch (e) {
    logAudit("_removeHashForRow_", e.message, "WARN");
  }
}
