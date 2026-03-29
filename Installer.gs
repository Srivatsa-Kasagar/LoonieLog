/**
 * @fileoverview Installer.gs — LoonieLog one-time setup.
 * Called from Sidebar.html on form submission.
 * Creates Drive folders, Gmail label, Gmail filters (domain + subject catch-all),
 * sets up sheet headers, stores settings, and creates the daily trigger.
 *
 * Depends on: Config.gs, Code.gs (logAudit, createTimeTrigger)
 * All helpers are idempotent — safe to re-run.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. installLoonieLog — main entry point called from sidebar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full installation sequence.
 * Called by Sidebar.html via google.script.run.installLoonieLog(formData).
 *
 * @param {{apiKey: string, aiModel: string, province: string}} formData
 * @returns {{success: boolean, message: string}}
 */
function installLoonieLog(formData) {
  try {
    // a. Validate inputs
    if (!formData || !formData.apiKey || !formData.aiModel || !formData.province) {
      throw new Error("Missing required fields: API key, AI model, and province are all required.");
    }
    if (!PROVINCE_TAX_RATES[formData.province]) {
      throw new Error("Invalid province code: " + formData.province);
    }
    if (formData.aiModel !== "gemini" && formData.aiModel !== "claude") {
      throw new Error("Invalid AI model: must be 'gemini' or 'claude'.");
    }

    logAudit("installLoonieLog", "Starting installation for province=" + formData.province + " model=" + formData.aiModel, "OK");

    // b. Test API key
    var testResult = AIRouter.testConnection(formData.apiKey, formData.aiModel);
    if (!testResult.success) {
      throw new Error("API key test failed: " + testResult.message);
    }
    logAudit("installLoonieLog", "API key validated successfully", "OK");

    // c. Create Drive folders
    var folders = createDriveFolders_();
    logAudit("installLoonieLog", "Drive folders ready — Unprocessed: " + folders.unprocessedId, "OK");

    // d. Create Gmail label
    var labelId = createGmailLabel_();
    logAudit("installLoonieLog", "Gmail label ready — ID: " + labelId, "OK");

    // e. Inject Gmail filters (domain + subject catch-all)
    injectGmailFilters_(labelId);

    // f. Set up sheet headers
    setupSheetHeaders_();
    logAudit("installLoonieLog", "Sheet headers configured", "OK");

    // g. Store settings in PropertiesService
    storeSettings_(formData.apiKey, formData.aiModel, formData.province, folders, labelId);
    logAudit("installLoonieLog", "Settings stored", "OK");

    // h. Create daily time trigger
    createTimeTrigger();

    // i. Mark installation complete
    PropertiesService.getUserProperties().setProperty("INSTALL_COMPLETE", "true");

    logAudit("installLoonieLog", "Installation complete", "OK");

    // j. Return success
    return { success: true, message: "LoonieLog is live! First scan in 24 hours." };

  } catch (e) {
    logAudit("installLoonieLog", e.message, "ERROR");
    return { success: false, message: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. createDriveFolders_ — Drive setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates LoonieLog Drive folders if they don't already exist.
 * Idempotent — checks for existing folders by name before creating.
 *
 * @returns {{unprocessedId: string, archiveId: string}}
 * @private
 */
function createDriveFolders_() {
  var unprocessedName = "LoonieLog_Unprocessed";
  var archiveYear     = String(new Date().getFullYear());
  var archiveName     = "LoonieLog_Archive_" + archiveYear;

  var unprocessedId = _findOrCreateFolder_(unprocessedName);
  var archiveId     = _findOrCreateFolder_(archiveName);

  var props = PropertiesService.getUserProperties();
  props.setProperty("UNPROCESSED_FOLDER_ID",     unprocessedId);
  props.setProperty("CURRENT_ARCHIVE_FOLDER_ID", archiveId);
  props.setProperty("ARCHIVE_YEAR",              archiveYear);

  return { unprocessedId: unprocessedId, archiveId: archiveId };
}

/**
 * Finds a Drive folder by name in root, or creates it if it doesn't exist.
 *
 * @param {string} name - Folder name to find or create
 * @returns {string} Folder ID
 * @private
 */
function _findOrCreateFolder_(name) {
  var iter = DriveApp.getFoldersByName(name);
  if (iter.hasNext()) {
    return iter.next().getId();
  }
  return DriveApp.createFolder(name).getId();
}

// ─────────────────────────────────────────────────────────────────────────────
// checkAndRollArchiveFolder — called on every runProcessor() cycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether the archive folder year matches the current year.
 * If not (e.g. January rollover), creates a new year folder and updates properties.
 * Called from Code.gs runProcessor() before each processing cycle.
 */
function checkAndRollArchiveFolder() {
  try {
    var props       = PropertiesService.getUserProperties();
    var storedYear  = props.getProperty("ARCHIVE_YEAR");
    var currentYear = String(new Date().getFullYear());

    if (storedYear === currentYear) return;

    var newFolderName = "LoonieLog_Archive_" + currentYear;
    var newFolderId   = _findOrCreateFolder_(newFolderName);

    props.setProperty("CURRENT_ARCHIVE_FOLDER_ID", newFolderId);
    props.setProperty("ARCHIVE_YEAR",              currentYear);

    logAudit("checkAndRollArchiveFolder", "Archive folder rolled to " + currentYear + " — ID: " + newFolderId, "OK");
  } catch (e) {
    logAudit("checkAndRollArchiveFolder", e.message, "ERROR");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. createGmailLabel_ — Gmail label setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates the "To_Log" Gmail label if it doesn't already exist.
 * Uses Gmail Advanced Service.
 *
 * @returns {string} Label ID
 * @private
 */
function createGmailLabel_() {
  var labelName = "To_Log";

  // Check if label already exists
  var existing = Gmail.Users.Labels.list("me");
  if (existing.labels) {
    for (var i = 0; i < existing.labels.length; i++) {
      if (existing.labels[i].name === labelName) {
        var existingId = existing.labels[i].id;
        PropertiesService.getUserProperties().setProperty("TO_LOG_LABEL_ID", existingId);
        return existingId;
      }
    }
  }

  // Create new label with green styling
  var newLabel = Gmail.Users.Labels.create({
    name:                  labelName,
    labelListVisibility:   "labelShow",
    messageListVisibility: "show",
    color: {
      backgroundColor: "#16a766",
      textColor:       "#ffffff"
    }
  }, "me");

  PropertiesService.getUserProperties().setProperty("TO_LOG_LABEL_ID", newLabel.id);
  return newLabel.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. injectGmailFilters_ — two-pass Gmail filter injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injects Gmail filters to auto-label receipt emails with [To_Log].
 * Pass A: one filter per domain in VENDOR_FILTERS.
 * Pass B: one catch-all subject-keyword filter using RECEIPT_SUBJECT_PATTERNS.
 *
 * @param {string} labelId - Gmail label ID to apply
 * @private
 */
function injectGmailFilters_(labelId) {
  var createdCount = 0;

  // ── Pass A: domain-based filters ──────────────────────────────────────────
  for (var i = 0; i < VENDOR_FILTERS.length; i++) {
    try {
      Gmail.Users.Settings.Filters.create({
        criteria: { from: VENDOR_FILTERS[i].from },
        action:   { addLabelIds: [labelId] }
      }, "me");
      createdCount++;
    } catch (e) {
      // Gmail API returns 400 if an identical filter already exists — safe to skip
      if (e.message && e.message.indexOf("Filter already exists") !== -1) {
        continue;
      }
      logAudit("injectGmailFilters_", "Domain filter failed for " + VENDOR_FILTERS[i].from + ": " + e.message, "WARN");
    }
  }
  logAudit("injectGmailFilters_", "Pass A complete — " + createdCount + " domain filter(s) created", "OK");

  // ── Pass B: subject keyword catch-all filter ───────────────────────────────
  try {
    // Wrap multi-word phrases in quotes; single words left bare
    var subjectTerms = RECEIPT_SUBJECT_PATTERNS.map(function(pattern) {
      return pattern.indexOf(" ") !== -1 ? '"' + pattern + '"' : pattern;
    });
    var subjectQuery = subjectTerms.join(" OR ");

    Gmail.Users.Settings.Filters.create({
      criteria: { subject: subjectQuery },
      action:   { addLabelIds: [labelId] }
    }, "me");
    logAudit("injectGmailFilters_", "Pass B complete — subject catch-all filter created", "OK");
  } catch (e) {
    if (e.message && e.message.indexOf("Filter already exists") !== -1) {
      logAudit("injectGmailFilters_", "Pass B — subject filter already exists, skipped", "OK");
    } else {
      logAudit("injectGmailFilters_", "Pass B subject filter failed: " + e.message, "WARN");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. setupSheetHeaders_ — configure all sheet tabs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes bold header rows to all LoonieLog sheet tabs.
 * Applies number formatting and freezes row 1 on each tab.
 * Idempotent — safe to re-run.
 *
 * @private
 */
function setupSheetHeaders_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Expenses + Needs Review (same 19-column structure) ────────────────────
  var expenseHeaders = [
    "Date", "Vendor", "CRA Code", "CRA Category",
    "Subtotal (CAD)", "GST/HST (CAD)", "PST/QST (CAD)", "Total (CAD)",
    "Deductible (CAD)", "ITC Eligible (CAD)", "Currency", "Expense Type",
    "Source", "Drive URL", "Logged At", "Status",
    "Original Amount (USD)", "BOC Exchange Rate", "Rate Date"
  ];

  var expenseTabs = ["Expenses", "Needs Review"];
  for (var t = 0; t < expenseTabs.length; t++) {
    var sheet = ss.getSheetByName(expenseTabs[t]) || ss.insertSheet(expenseTabs[t]);
    sheet.clearContents();
    var headerRange = sheet.getRange(1, 1, 1, expenseHeaders.length);
    headerRange.setValues([expenseHeaders]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f3f3f3");
    sheet.setFrozenRows(1);

    // Currency format for cols E–J (1-based: 5–10)
    sheet.getRange(2, 5, sheet.getMaxRows() - 1, 6)
      .setNumberFormat("$#,##0.00");

    // Date format for col A
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1)
      .setNumberFormat("yyyy-mm-dd");

    // Expense Type dropdown (col L = 12)
    var dropdownRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(EXPENSE_TYPE_VALUES, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, SHEET_COLUMNS.EXPENSE_TYPE, sheet.getMaxRows() - 1, 1)
      .setDataValidation(dropdownRule);
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────
  var auditSheet = ss.getSheetByName("Audit Log") || ss.insertSheet("Audit Log");
  if (auditSheet.getLastRow() === 0) {
    var auditHeaderRange = auditSheet.getRange(1, 1, 1, 4);
    auditHeaderRange.setValues([["Timestamp", "Function", "Detail", "Status"]]);
    auditHeaderRange.setFontWeight("bold");
    auditHeaderRange.setBackground("#f3f3f3");
    auditSheet.setFrozenRows(1);
  }

  // ── Settings (read-only display) ──────────────────────────────────────────
  var settingsSheet = ss.getSheetByName("Settings") || ss.insertSheet("Settings");
  settingsSheet.clearContents();
  var settingsHeaderRange = settingsSheet.getRange(1, 1, 1, 2);
  settingsHeaderRange.setValues([["Setting", "Value"]]);
  settingsHeaderRange.setFontWeight("bold");
  settingsHeaderRange.setBackground("#f3f3f3");
  settingsSheet.setFrozenRows(1);

  // ── Summary (placeholder — populated by SheetLogger) ─────────────────────
  var summarySheet = ss.getSheetByName("Summary") || ss.insertSheet("Summary");
  if (summarySheet.getLastRow() === 0) {
    summarySheet.getRange(1, 1).setValue("Summary tab is populated automatically after receipts are processed.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. storeSettings_ — persist config to PropertiesService + Settings sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stores all user configuration in PropertiesService.getUserProperties().
 * Writes a REDACTED display to the Settings sheet — API key is never shown in full.
 *
 * @param {string} apiKey    - User's Gemini or Claude API key
 * @param {string} aiModel   - "gemini" or "claude"
 * @param {string} province  - 2-letter province code
 * @param {{unprocessedId: string, archiveId: string}} folders - Drive folder IDs
 * @param {string} labelId   - Gmail To_Log label ID
 * @private
 */
function storeSettings_(apiKey, aiModel, province, folders, labelId) {
  var props = PropertiesService.getUserProperties();

  props.setProperties({
    API_KEY:                  apiKey,
    AI_MODEL:                 aiModel,
    PROVINCE:                 province,
    UNPROCESSED_FOLDER_ID:    folders.unprocessedId,
    CURRENT_ARCHIVE_FOLDER_ID: folders.archiveId,
    TO_LOG_LABEL_ID:          labelId,
    PROCESSED_HASHES_COUNT:   "1",
    PROCESSED_HASHES_0:       "[]",
    INSTALL_COMPLETE:         "false"  // set to "true" only after all steps complete
  });

  // Write REDACTED display to Settings sheet
  var maskedKey = "●●●●●●●●" + apiKey.slice(-4);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsSheet = ss.getSheetByName("Settings");
  if (settingsSheet) {
    var settingsData = [
      ["AI Model",          aiModel],
      ["Province",          province],
      ["API Key",           maskedKey],
      ["Unprocessed Folder ID", folders.unprocessedId],
      ["Archive Folder ID", folders.archiveId],
      ["Gmail Label ID",    labelId],
      ["Installed At",      new Date().toLocaleString()]
    ];
    settingsSheet.getRange(2, 1, settingsData.length, 2).setValues(settingsData);
    settingsSheet.autoResizeColumns(1, 2);
  }
}
