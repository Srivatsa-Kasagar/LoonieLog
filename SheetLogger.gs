/**
 * @fileoverview SheetLogger.gs — Writes expense rows to the Google Sheet.
 * Handles Expenses, Needs Review, Summary and Settings tabs.
 *
 * Depends on: Config.gs, Code.gs (logAudit)
 */

var SheetLogger = (function() {

  /** Max audit log rows before trimming oldest. */
  var AUDIT_MAX_ROWS = 1000;

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — logExpense
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Appends a processed expense row to the target sheet tab.
   * Applies currency formatting, data validation dropdown, and conditional
   * formatting to the Expense Type cell.
   *
   * @param {Object} data - Enriched data object from Processor.gs
   * @param {string} tab  - "Expenses" | "Needs Review" (default: "Expenses")
   * @returns {number} 1-based row number written
   */
  function logExpense(data, tab) {
    try {
      var sheetName = tab || "Expenses";
      var ss        = SpreadsheetApp.getActiveSpreadsheet();
      var sheet     = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error("Sheet not found: " + sheetName);

      // Build the 19-column row array
      var isUsd    = data.currency === "USD";
      var driveUrl = data.drive_url || "";
      var driveFormula = driveUrl
        ? '=HYPERLINK("' + driveUrl + '","View Receipt")'
        : "";

      var row = new Array(19);
      row[SHEET_COLUMNS.DATE          - 1] = data.date          || "";
      row[SHEET_COLUMNS.VENDOR        - 1] = data.vendor        || "";
      row[SHEET_COLUMNS.CRA_CODE      - 1] = data.cra_category_code  || "";
      row[SHEET_COLUMNS.CRA_NAME      - 1] = data.cra_category_name  || "";
      row[SHEET_COLUMNS.SUBTOTAL      - 1] = typeof data.subtotal      === "number" ? data.subtotal      : 0;
      row[SHEET_COLUMNS.GST_HST       - 1] = typeof data.gst_hst       === "number" ? data.gst_hst       : 0;
      row[SHEET_COLUMNS.PST_QST       - 1] = typeof data.pst_qst       === "number" ? data.pst_qst       : 0;
      row[SHEET_COLUMNS.TOTAL         - 1] = typeof data.total         === "number" ? data.total         : 0;
      row[SHEET_COLUMNS.DEDUCTIBLE    - 1] = data.deductible_amt !== null && data.deductible_amt !== undefined
                                              ? data.deductible_amt : "";
      row[SHEET_COLUMNS.ITC_ELIGIBLE  - 1] = data.itc_eligible  !== null && data.itc_eligible  !== undefined
                                              ? data.itc_eligible  : "";
      row[SHEET_COLUMNS.CURRENCY      - 1] = data.currency      || "CAD";
      row[SHEET_COLUMNS.EXPENSE_TYPE  - 1] = data.expense_type  || EXPENSE_TYPE_DEFAULT;
      row[SHEET_COLUMNS.SOURCE        - 1] = data.source        || "";
      row[SHEET_COLUMNS.DRIVE_URL     - 1] = driveFormula;
      row[SHEET_COLUMNS.LOGGED_AT     - 1] = new Date();
      row[SHEET_COLUMNS.STATUS        - 1] = sheetName === "Needs Review" ? "Needs Review" : "Processed";
      row[SHEET_COLUMNS.ORIGINAL_USD  - 1] = isUsd ? (data.original_usd_total || "") : "";
      row[SHEET_COLUMNS.EXCHANGE_RATE - 1] = isUsd ? (data.exchange_rate      || "") : "";
      row[SHEET_COLUMNS.RATE_DATE     - 1] = isUsd ? (data.exchange_rate_date || "") : "";

      sheet.appendRow(row);
      var newRow = sheet.getLastRow();

      // Apply formats to the newly written row
      applyRowFormats_(sheet, newRow, isUsd);

      // Apply Expense Type conditional formatting + dropdown
      applyExpenseTypeFormatting_(sheet, newRow);

      // Highlight Needs Review rows in yellow
      if (sheetName === "Needs Review") {
        sheet.getRange(newRow, 1, 1, 19).setBackground("#fff8e1");
      }

      logAudit("SheetLogger.logExpense",
        data.vendor + " | " + data.date + " | $" + data.total + " → " + sheetName, "OK");

      // Refresh summary after each write
      updateSummary();

      return newRow;

    } catch (e) {
      logAudit("SheetLogger.logExpense", e.message, "ERROR");
      throw e;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyRowFormats_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Applies number/date formats to a newly written expense row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
   * @param {number} rowNum  - 1-based row number
   * @param {boolean} isUsd  - Whether this is a USD receipt
   * @private
   */
  function applyRowFormats_(sheet, rowNum, isUsd) {
    // CAD currency cols E–J (5–10)
    sheet.getRange(rowNum, 5, 1, 6).setNumberFormat("$#,##0.00");

    // Date col A
    sheet.getRange(rowNum, SHEET_COLUMNS.DATE, 1, 1).setNumberFormat("yyyy-mm-dd");

    // Logged At col O
    sheet.getRange(rowNum, SHEET_COLUMNS.LOGGED_AT, 1, 1)
      .setNumberFormat("yyyy-mm-dd hh:mm");

    if (isUsd) {
      // Col Q — original USD (plain number, prefix handled by label)
      sheet.getRange(rowNum, SHEET_COLUMNS.ORIGINAL_USD, 1, 1)
        .setNumberFormat('"USD $"#,##0.00');

      // Col R — exchange rate
      sheet.getRange(rowNum, SHEET_COLUMNS.EXCHANGE_RATE, 1, 1)
        .setNumberFormat("0.0000");

      // Col S — rate date
      sheet.getRange(rowNum, SHEET_COLUMNS.RATE_DATE, 1, 1)
        .setNumberFormat("yyyy-mm-dd");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyExpenseTypeFormatting_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Applies dropdown data validation and colour-coded background to the
   * Expense Type cell in col L for the given row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
   * @param {number} rowNum - 1-based row number
   * @private
   */
  function applyExpenseTypeFormatting_(sheet, rowNum) {
    var cell = sheet.getRange(rowNum, SHEET_COLUMNS.EXPENSE_TYPE);

    // Dropdown validation
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(EXPENSE_TYPE_VALUES, true)
      .setAllowInvalid(false)
      .build();
    cell.setDataValidation(rule);

    // Colour by current value
    var val = cell.getValue();
    if (val === "Business") {
      cell.setBackground("#e6f4ea").setFontColor("#1e7e34");
    } else if (val === "Personal") {
      cell.setBackground("#fce8e6").setFontColor("#c62828");
    } else if (val === "Review") {
      cell.setBackground("#fff8e1").setFontColor("#e65100");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — updateSummary
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Regenerates the Summary tab with current month business totals,
   * category breakdown, personal spend section, and unclassified Review items.
   *
   * - "Business" rows → included in all totals
   * - "Review" rows   → included with ⚠️ flag (not yet confirmed by user)
   * - "Personal" rows → EXCLUDED entirely
   *
   * Called at end of every logExpense() call.
   */
  function updateSummary() {
    try {
      var ss           = SpreadsheetApp.getActiveSpreadsheet();
      var expSheet     = ss.getSheetByName("Expenses");
      var reviewSheet  = ss.getSheetByName("Needs Review");
      var sumSheet     = ss.getSheetByName("Summary");
      if (!sumSheet) return;

      var now      = new Date();
      var curYear  = now.getFullYear();
      var curMonth = now.getMonth();

      // Combine rows from both Expenses and Needs Review tabs
      var data = [];
      if (expSheet && expSheet.getLastRow() > 1) {
        data = data.concat(expSheet.getRange(2, 1, expSheet.getLastRow() - 1, 19).getValues());
      }
      if (reviewSheet && reviewSheet.getLastRow() > 1) {
        data = data.concat(reviewSheet.getRange(2, 1, reviewSheet.getLastRow() - 1, 19).getValues());
      }
      if (data.length === 0) return;

      // Accumulators — current month
      var mBizTotal = 0, mBizItc = 0, mBizDeductible = 0;
      var mReviewTotal = 0, mReviewCount = 0;
      var mPersonalTotal = 0, mPersonalCount = 0;
      var mByCategory = {};

      // Accumulators — year to date
      var yBizTotal = 0, yBizItc = 0, yBizDeductible = 0;
      var yReviewTotal = 0, yReviewCount = 0;
      var yPersonalTotal = 0, yPersonalCount = 0;
      var yByCategory = {};

      for (var i = 0; i < data.length; i++) {
        var row        = data[i];
        var rawDate    = row[SHEET_COLUMNS.DATE - 1];
        if (!rawDate) continue;
        var rowDate    = new Date(rawDate);
        var rowYear    = rowDate.getFullYear();
        var rowMonth   = rowDate.getMonth();
        var expType    = row[SHEET_COLUMNS.EXPENSE_TYPE - 1];
        var total      = Number(row[SHEET_COLUMNS.TOTAL       - 1]) || 0;
        var itc        = Number(row[SHEET_COLUMNS.ITC_ELIGIBLE - 1]) || 0;
        var deductible = Number(row[SHEET_COLUMNS.DEDUCTIBLE  - 1]) || 0;
        var craCode    = String(row[SHEET_COLUMNS.CRA_CODE - 1] || "other");
        var craName    = String(row[SHEET_COLUMNS.CRA_NAME - 1] || "Miscellaneous");

        var inCurrentMonth = (rowYear === curYear && rowMonth === curMonth);
        var inCurrentYear  = (rowYear === curYear);

        // ── Year-to-date accumulation ──────────────────────────────────────
        if (inCurrentYear) {
          if (expType === "Personal") {
            yPersonalTotal += total; yPersonalCount++;
          } else if (expType === "Review") {
            yReviewTotal += total; yReviewCount++;
            if (!yByCategory[craCode]) yByCategory[craCode] = { name: "⚠️ " + craName, total: 0, itc: 0, deductible: 0 };
            yByCategory[craCode].total += total; yByCategory[craCode].itc += itc; yByCategory[craCode].deductible += deductible;
          } else {
            yBizTotal += total; yBizItc += itc; yBizDeductible += deductible;
            if (!yByCategory[craCode]) yByCategory[craCode] = { name: craName, total: 0, itc: 0, deductible: 0 };
            yByCategory[craCode].total += total; yByCategory[craCode].itc += itc; yByCategory[craCode].deductible += deductible;
          }
        }

        // ── Current month accumulation ─────────────────────────────────────
        if (inCurrentMonth) {
          if (expType === "Personal") {
            mPersonalTotal += total; mPersonalCount++;
          } else if (expType === "Review") {
            mReviewTotal += total; mReviewCount++;
            if (!mByCategory[craCode]) mByCategory[craCode] = { name: "⚠️ " + craName, total: 0, itc: 0, deductible: 0 };
            mByCategory[craCode].total += total; mByCategory[craCode].itc += itc; mByCategory[craCode].deductible += deductible;
          } else {
            mBizTotal += total; mBizItc += itc; mBizDeductible += deductible;
            if (!mByCategory[craCode]) mByCategory[craCode] = { name: craName, total: 0, itc: 0, deductible: 0 };
            mByCategory[craCode].total += total; mByCategory[craCode].itc += itc; mByCategory[craCode].deductible += deductible;
          }
        }
      }

      sumSheet.clearContents();
      var r = 1;
      var monthName = now.toLocaleString("default", { month: "long", year: "numeric" });
      var fmt = "$#,##0.00";

      // ── Section 1: Year-to-Date (T2125 annual totals) ─────────────────────
      sumSheet.getRange(r, 1).setValue("📋 " + curYear + " Year-to-Date — T2125 Filing Totals")
        .setFontWeight("bold").setFontSize(12).setFontColor("#1a73e8");
      r++;
      sumSheet.getRange(r, 1, 1, 2).setValues([["Metric", "Amount (CAD)"]])
        .setFontWeight("bold").setBackground("#e8f0fe");
      r++;
      sumSheet.getRange(r, 1, 3, 2).setValues([
        ["Total Business Expenses", Math.round(yBizTotal      * 100) / 100],
        ["Total Deductible",        Math.round(yBizDeductible * 100) / 100],
        ["Total ITC Eligible",      Math.round(yBizItc        * 100) / 100]
      ]);
      sumSheet.getRange(r, 2, 3, 1).setNumberFormat(fmt);
      sumSheet.getRange(r + 2, 1, 1, 2).setBackground("#e6f4ea"); // ITC row highlight
      r += 4;

      // ── Section 2: YTD Category Breakdown ─────────────────────────────────
      sumSheet.getRange(r, 1).setValue("📁 " + curYear + " Breakdown by CRA T2125 Category")
        .setFontWeight("bold");
      r++;
      sumSheet.getRange(r, 1, 1, 4).setValues([["CRA Code", "Category", "Total (CAD)", "ITC (CAD)"]])
        .setFontWeight("bold").setBackground("#f8f9fa");
      r++;
      var yKeys = Object.keys(yByCategory).sort();
      for (var k = 0; k < yKeys.length; k++) {
        var cat = yByCategory[yKeys[k]];
        sumSheet.getRange(r, 1, 1, 4).setValues([[yKeys[k], cat.name, Math.round(cat.total * 100) / 100, Math.round(cat.itc * 100) / 100]]);
        sumSheet.getRange(r, 3, 1, 2).setNumberFormat(fmt);
        if (cat.itc > 0) sumSheet.getRange(r, 4).setBackground("#e6f4ea");
        r++;
      }
      if (yKeys.length === 0) { sumSheet.getRange(r, 1).setValue("No expenses logged this year.").setFontColor("#80868b"); r++; }
      r++;

      // ── Section 3: Current Month ───────────────────────────────────────────
      sumSheet.getRange(r, 1).setValue("📊 " + monthName + " — This Month")
        .setFontWeight("bold").setFontSize(11);
      r++;
      sumSheet.getRange(r, 1, 1, 2).setValues([["Metric", "Amount (CAD)"]])
        .setFontWeight("bold").setBackground("#f8f9fa");
      r++;
      sumSheet.getRange(r, 1, 3, 2).setValues([
        ["Business Expenses", Math.round(mBizTotal      * 100) / 100],
        ["Deductible",        Math.round(mBizDeductible * 100) / 100],
        ["ITC Eligible",      Math.round(mBizItc        * 100) / 100]
      ]);
      sumSheet.getRange(r, 2, 3, 1).setNumberFormat(fmt);
      r += 4;

      // ── Section 4: Personal (YTD) ──────────────────────────────────────────
      if (yPersonalCount > 0) {
        sumSheet.getRange(r, 1).setValue("🚫 Personal Expenses — Non-deductible (YTD)")
          .setFontWeight("bold").setFontColor("#d93025");
        r++;
        sumSheet.getRange(r, 1, 1, 2).setValues([["Count", "Total"]]).setFontWeight("bold").setBackground("#fce8e6");
        r++;
        sumSheet.getRange(r, 1, 1, 2).setValues([[yPersonalCount, Math.round(yPersonalTotal * 100) / 100]]);
        sumSheet.getRange(r, 2).setNumberFormat(fmt);
        r += 2;
      }

      // ── Section 5: Needs Review (YTD) ─────────────────────────────────────
      if (yReviewCount > 0) {
        sumSheet.getRange(r, 1).setValue("⚠️ Unclassified — Update Expense Type Before Filing (YTD)")
          .setFontWeight("bold").setFontColor("#e37400");
        r++;
        sumSheet.getRange(r, 1, 1, 2).setValues([["Count", "Total at Risk"]]).setFontWeight("bold").setBackground("#fff8e1");
        r++;
        sumSheet.getRange(r, 1, 1, 2).setValues([[yReviewCount, Math.round(yReviewTotal * 100) / 100]]);
        sumSheet.getRange(r, 2).setNumberFormat(fmt);
        r += 2;
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      sumSheet.getRange(r, 1).setValue("Last updated: " + now.toLocaleString())
        .setFontColor("#80868b").setFontSize(10).setFontStyle("italic");

      sumSheet.autoResizeColumns(1, 4);

    } catch (e) {
      logAudit("SheetLogger.updateSummary", e.message, "WARN");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — updateSettingsDisplay
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Refreshes the Settings tab with current config values.
   * Masks the API key — never shows full key in the sheet.
   */
  function updateSettingsDisplay() {
    try {
      var props      = PropertiesService.getUserProperties();
      var ss         = SpreadsheetApp.getActiveSpreadsheet();
      var settings   = ss.getSheetByName("Settings");
      if (!settings) return;

      var rawKey     = props.getProperty("API_KEY") || "";
      var maskedKey  = rawKey.length > 4 ? "●●●●●●" + rawKey.slice(-4) : "Not set";
      var expCount   = getExpenseCount();

      var rows = [
        ["AI Model",           props.getProperty("AI_MODEL")     || "Not set"],
        ["Province",           props.getProperty("PROVINCE")     || "Not set"],
        ["API Key",            maskedKey],
        ["Last Run",           props.getProperty("LAST_RUN_TIMESTAMP") || "Never"],
        ["Receipts Logged",    expCount],
        ["Filters Active",     VENDOR_FILTERS.length + 1]
      ];

      settings.getRange(2, 1, rows.length, 2).setValues(rows);
      settings.autoResizeColumns(1, 2);
    } catch (e) {
      logAudit("SheetLogger.updateSettingsDisplay", e.message, "WARN");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getExpenseCount
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the total number of logged expense rows (excluding header).
   *
   * @returns {number} Row count in Expenses tab
   */
  function getExpenseCount() {
    try {
      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("Expenses");
      if (!sheet || sheet.getLastRow() < 2) return 0;
      return sheet.getLastRow() - 1;
    } catch (e) {
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getSrEdSummary
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scans the Expenses tab for potential SR&ED-eligible expenses.
   * Flags rows in these CRA categories: 8810, 9270, 9220 (cloud/dev tools).
   * Sourced from canadian-tax-cra/sred-grants skill.
   *
   * @returns {{ count: number, total: number }} SR&ED eligible expense summary
   */
  function getSrEdSummary() {
    try {
      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("Expenses");
      if (!sheet || sheet.getLastRow() < 2) return { count: 0, total: 0 };

      var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
      var SRED_CATEGORIES = ["8810", "9270", "9220"];
      var count = 0, total = 0;

      for (var i = 0; i < data.length; i++) {
        var expType = data[i][SHEET_COLUMNS.EXPENSE_TYPE - 1];
        var craCode = data[i][SHEET_COLUMNS.CRA_CODE     - 1];
        var amount  = Number(data[i][SHEET_COLUMNS.TOTAL - 1]) || 0;

        if (expType === "Personal") continue;
        if (SRED_CATEGORIES.indexOf(String(craCode)) !== -1) {
          count++;
          total += amount;
        }
      }
      return { count: count, total: Math.round(total * 100) / 100 };
    } catch (e) {
      logAudit("SheetLogger.getSrEdSummary", e.message, "WARN");
      return { count: 0, total: 0 };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — clearAllData (DEV_MODE only)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clears all data rows from Expenses, Needs Review, and Audit Log.
   * Resets PROCESSED_HASHES. Only callable when DEV_MODE property is "true".
   */
  function clearAllData() {
    var props = PropertiesService.getUserProperties();
    if (props.getProperty("DEV_MODE") !== "true") {
      throw new Error("clearAllData() requires DEV_MODE=true");
    }

    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var tabs = ["Expenses", "Needs Review", "Audit Log"];
    for (var i = 0; i < tabs.length; i++) {
      var sheet = ss.getSheetByName(tabs[i]);
      if (sheet && sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
    }

    Processor.clearAllHashes();
    logAudit("SheetLogger.clearAllData", "All data cleared (DEV_MODE)", "WARN");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    logExpense:            logExpense,
    updateSummary:         updateSummary,
    updateSettingsDisplay: updateSettingsDisplay,
    getExpenseCount:       getExpenseCount,
    getSrEdSummary:        getSrEdSummary,
    clearAllData:          clearAllData
  };

})();
