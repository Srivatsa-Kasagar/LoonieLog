/**
 * @fileoverview Processor.gs — CRA compliance rule engine.
 * Applies all CRA T2125 rules to raw AI output before logging.
 *
 * ⚠️ RULE ORDER IS CRITICAL:
 *   USD conversion (step b) MUST run before meals/ITC rules (steps c/d).
 *   All monetary rules operate on CAD amounts.
 *
 * Depends on: Config.gs, Code.gs (logAudit), AIRouter.gs, CurrencyConverter.gs
 */

var Processor = (function() {

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — processExtractedData
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Applies all CRA compliance rules to raw AI JSON output.
   * Returns an enriched data object ready for SheetLogger.
   *
   * @param {Object} rawJson      - Parsed object from AIRouter.extractReceiptData()
   * @param {string} source       - "Gmail" | "Drive"
   * @param {string} driveFileId  - Drive file ID (for archiving + URL generation)
   * @returns {{
   *   data: Object,
   *   targetSheet: "Expenses"|"Needs Review"
   * }}
   * @throws {Error} With message "DUPLICATE" if hash already seen
   */
  function processExtractedData(rawJson, source, driveFileId) {
    try {
      // Clone to avoid mutating the original AI response
      var data = JSON.parse(JSON.stringify(rawJson));
      data.source = source;

      // a. Validate required fields
      validateRequired_(data);

      // b. USD → CAD conversion (MUST be first — all subsequent rules use CAD)
      applyUsdConversion_(data);

      // c. Meals 50% deductibility rule (ITA s.67.1)
      applyMealsRule_(data);

      // d. ITC calculation (operates on CAD gst_hst)
      applyITCRule_(data);

      // e. Expense type rule (zeroes deductible/ITC if Personal)
      applyExpenseTypeRule_(data);

      // f. WFH — home office expenses require Part 7 % calculation
      applyWFHRule_(data);

      // g. Gift/gift card — always routes to Review
      applyGiftRule_(data);

      // h. Missing GST flag (skips USD receipts)
      applyMissingGSTFlag_(data);

      // i. QST rule for Quebec filers
      applyQSTRule_(data);

      // j. Deduplication hash check
      generateDeduplicationHash_(data);

      // k. Rename and archive the Drive file
      var driveUrl = renameAndArchiveFile_(driveFileId, data);
      data.drive_url = driveUrl || "";

      // l. Determine target sheet
      var isReview = (
        data.confidence === "low"        ||
        data.expense_type === "Review"   ||
        data.is_gift === true            ||
        data.cra_category_code === "WFH" ||
        data.is_capital === true
      );
      var targetSheet = isReview ? "Needs Review" : "Expenses";

      return { data: data, targetSheet: targetSheet };

    } catch (e) {
      if (e.message === "DUPLICATE") throw e;
      logAudit("Processor.processExtractedData", e.message, "ERROR");
      throw e;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — validateRequired_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validates that required fields are present in the AI response.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function validateRequired_(data) {
    var required = ["date", "vendor", "total", "currency"];
    for (var i = 0; i < required.length; i++) {
      if (data[required[i]] === undefined || data[required[i]] === null) {
        throw new Error("Missing required field from AI response: " + required[i]);
      }
    }
    // Ensure numeric fields default to 0 if null/undefined
    ["subtotal", "gst_hst", "pst_qst", "total"].forEach(function(f) {
      if (typeof data[f] !== "number") data[f] = parseFloat(data[f]) || 0;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyUsdConversion_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Converts all monetary fields from USD to CAD using the BOC Valet API.
   * Preserves original USD values for cols Q–S.
   * ⚠️ Must run before applyMealsRule_ and applyITCRule_.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyUsdConversion_(data) {
    if (data.currency !== "USD") return;

    // Store original USD values for the sheet columns Q/R/S and dedup hash
    data.original_usd_total    = data.total;
    data.original_usd_subtotal = data.subtotal;

    var convTotal    = CurrencyConverter.convertUsdToCad(data.total,    data.date);
    var convSubtotal = CurrencyConverter.convertUsdToCad(data.subtotal, data.date);
    var convGst      = CurrencyConverter.convertUsdToCad(data.gst_hst,  data.date);
    var convPst      = CurrencyConverter.convertUsdToCad(data.pst_qst,  data.date);

    if (convTotal.amountCad === null) {
      // Conversion failed — keep USD amounts, flag for manual update
      data.status = "Needs Review";
      data.notes  = (data.notes ? data.notes + " | " : "") +
        "USD conversion failed — update manually before filing";
      logAudit("Processor.applyUsdConversion_", "FX_CONVERSION_FAILED for " + data.vendor + " " + data.date, "ERROR");
      return;
    }

    data.subtotal          = convSubtotal.amountCad !== null ? convSubtotal.amountCad : 0;
    data.gst_hst           = convGst.amountCad      !== null ? convGst.amountCad      : 0;
    data.pst_qst           = convPst.amountCad      !== null ? convPst.amountCad      : 0;
    data.total             = convTotal.amountCad;
    data.exchange_rate     = convTotal.rate;
    data.exchange_rate_date = convTotal.rateDate;

    var noteStr = "USD $" + data.original_usd_total.toFixed(2) +
                  " → CAD $" + data.total.toFixed(2) +
                  " @ BOC rate " + data.exchange_rate +
                  " (" + data.exchange_rate_date + ")";
    data.notes = (data.notes ? data.notes + " | " : "") + noteStr;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyMealsRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Applies the 50% meals and entertainment deductibility rule (ITA s.67.1).
   * Operates on CAD total — must run after applyUsdConversion_.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyMealsRule_(data) {
    if (data.is_meal === true) {
      data.deductible_amt = Math.round(data.total * 0.50 * 100) / 100;
      data.notes = (data.notes ? data.notes + " | " : "") +
        "50% meals rule applied per ITA s.67.1. " +
        "Deductible = 50% of total paid (incl. tax). ITC separately = 50% of GST/HST.";
    } else {
      data.deductible_amt = data.total;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyITCRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calculates ITC (Input Tax Credit) eligibility per CRA rules.
   * Operates on CAD gst_hst — must run after applyUsdConversion_.
   * Source: canadian-tax-cra/gst-hst-compliance skill.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyITCRule_(data) {
    // Guard: if USD conversion failed, ITC cannot be calculated
    if (data.currency === "USD" && !data.exchange_rate) {
      data.itc_eligible = 0;
      return;
    }

    var props    = PropertiesService.getUserProperties();
    var province = props.getProperty("PROVINCE") || "ON";

    // Default: full GST/HST is recoverable
    data.itc_eligible = data.gst_hst;

    // Meals: 50% ITC only (ITA s.67.1)
    if (data.is_meal === true) {
      data.itc_eligible = Math.round(data.gst_hst * 0.50 * 100) / 100;
    }

    // PST provinces: GST is recoverable, but PST is NOT — already handled (pst_qst ≠ gst_hst)
    // No adjustment needed — gst_hst only contains GST for BC/MB/SK (not PST)

    // QST (QC): GST ITC same; QST tracked separately
    if (province === "QC" && data.pst_qst > 0) {
      data.itc_qst = Math.round(data.pst_qst * 100) / 100;
    }

    // Blocked categories: club memberships and life insurance
    var isClubMembership = (
      data.cra_category_code === "8760" &&
      data.vendor && data.vendor.toLowerCase().match(/golf|gym|fitness|club|racquet|tennis|swim/)
    );
    var isLifeInsurance = data.notes && data.notes.toLowerCase().indexOf("life insurance") !== -1;
    if (isClubMembership || isLifeInsurance) {
      data.itc_eligible = 0;
    }

    // Capital items: full ITC in purchase year (CCA applies to the income deduction separately)
    if (data.is_capital === true) {
      data.itc_eligible = data.gst_hst;
      data.notes = (data.notes ? data.notes + " | " : "") +
        "ITC claimable in purchase year. CCA applies for income deduction — " +
        "Class 50 computers (55%), Class 8 furniture (20%).";
    }

    data.itc_eligible = Math.round(data.itc_eligible * 100) / 100;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyExpenseTypeRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enforces the Expense Type column logic.
   * Personal expenses are zeroed out from all deductions and ITC.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyExpenseTypeRule_(data) {
    var valid = ["Business", "Personal", "Review"];
    if (!data.expense_type || valid.indexOf(data.expense_type) === -1) {
      data.expense_type = EXPENSE_TYPE_DEFAULT;
    }

    if (data.expense_type === "Personal") {
      data.deductible_amt = 0;
      data.itc_eligible   = 0;
      data.notes = (data.notes ? data.notes + " | " : "") +
        "Personal expense — excluded from deductions and ITC.";
      logAudit("Processor.applyExpenseTypeRule_",
        "PERSONAL_FLAGGED: " + data.vendor + " $" + data.total, "WARN");
    }

    if (data.expense_type === "Review") {
      data.notes = (data.notes ? data.notes + " | " : "") +
        "Needs classification — update Expense Type column before filing.";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyWFHRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Flags home office expenses (WFH category) for Part 7 % calculation.
   * CRA requires business sq ft ÷ total sq ft × annual home cost.
   * Cannot be auto-deducted; always routes to Needs Review.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyWFHRule_(data) {
    if (data.cra_category_code !== "WFH") return;

    data.deductible_amt = null;
    data.itc_eligible   = null;
    data.expense_type   = "Review";
    data.notes = (data.notes ? data.notes + " | " : "") +
      "Home office expense — calculate business % in T2125 Part 7 before claiming. " +
      "Business sq ft ÷ total sq ft × annual home cost. " +
      "Cannot create or increase business loss. Do not claim at full receipt value.";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyGiftRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Flags gift purchases for user classification.
   * CRA treatment depends on recipient type (client vs employee vs personal).
   * AI cannot determine recipient — always routes to Review.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyGiftRule_(data) {
    if (data.is_gift !== true) return;

    data.expense_type      = "Review";
    data.cra_category_code = data.cra_category_code || "8521"; // suggested default
    data.notes = (data.notes ? data.notes + " | " : "") +
      "Gift expense — recipient determines deductibility: " +
      "• Client gift (non-entertainment) → 8521 Advertising, 100% deductible. " +
      "• Client gift (restaurant GC or event tickets) → 8523 M&E, 50% only. " +
      "• Employee gift card / cash (any amount) → 9060 Salaries, T4 required. " +
      "• Employee non-cash gift ≤ $500/yr → 9270 Other, 100%, no T4. " +
      "• Personal gift → not deductible. " +
      "Update Expense Type and CRA Category after classifying recipient.";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyMissingGSTFlag_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Flags receipts with no GST/HST for amounts > $30.
   * Skipped entirely for USD receipts — US vendors don't charge Canadian GST.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyMissingGSTFlag_(data) {
    if (data.currency === "USD") return;

    var props    = PropertiesService.getUserProperties();
    var province = props.getProperty("PROVINCE") || "ON";

    if (province !== "QC" && data.gst_hst === 0 && data.total > 30) {
      data.notes = (data.notes ? data.notes + " | " : "") +
        "[No GST/HST — verify: may be zero-rated supply (groceries, prescriptions, exports), " +
        "unregistered small supplier (<$30K revenue), or Indigenous tax exemption. " +
        "No action needed if legitimately exempt.]";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — applyQSTRule_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Appends QST recovery note for Quebec filers.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function applyQSTRule_(data) {
    var props    = PropertiesService.getUserProperties();
    var province = props.getProperty("PROVINCE") || "ON";

    if (province === "QC" && data.pst_qst > 0) {
      data.notes = (data.notes ? data.notes + " | " : "") +
        "QST ($" + data.pst_qst.toFixed(2) + ") recoverable if registered with Revenu Québec.";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — generateDeduplicationHash_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generates a SHA-256 hash from original receipt values (pre-conversion).
   * Checks against chunked PROCESSED_HASHES_* property keys.
   * Throws "DUPLICATE" if already seen.
   *
   * ⚠️ Hash uses ORIGINAL values (before USD→CAD conversion) so the same
   * USD receipt doesn't get different hashes due to BOC rate rollback variation.
   *
   * @param {Object} data - Mutable data object
   * @private
   */
  function generateDeduplicationHash_(data) {
    var amount = data.currency === "USD"
      ? (data.original_usd_total || data.total)
      : data.total;

    var hashString = (data.vendor || "").toLowerCase() + "|" +
                     (data.date   || "") + "|" +
                     (data.currency || "CAD") + "|" +
                     parseFloat(amount).toFixed(2);

    var hashBytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      hashString
    );
    var hash = hashBytes.map(function(b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    }).join("");

    var existing = getProcessedHashes_();
    if (existing.indexOf(hash) !== -1) {
      throw new Error("DUPLICATE");
    }

    addProcessedHash_(hash);
    data._dedup_hash = hash;
  }

  /**
   * Reads all processed hashes from chunked PropertiesService storage.
   * Merges PROCESSED_HASHES_0, _1, _2 ... into a single flat array.
   *
   * @returns {string[]} Flat array of all stored hashes
   * @private
   */
  function getProcessedHashes_() {
    var props      = PropertiesService.getUserProperties();
    var chunkCount = parseInt(props.getProperty("PROCESSED_HASHES_COUNT") || "1", 10);
    var all        = [];

    for (var i = 0; i < chunkCount; i++) {
      var raw = props.getProperty("PROCESSED_HASHES_" + i);
      if (raw) {
        var chunk = JSON.parse(raw);
        all = all.concat(chunk);
      }
    }
    return all;
  }

  /**
   * Appends a hash to the latest chunk.
   * Creates a new chunk automatically when the current chunk reaches 100 entries.
   *
   * @param {string} hash - SHA-256 hex string to store
   * @private
   */
  function addProcessedHash_(hash) {
    var props      = PropertiesService.getUserProperties();
    var chunkCount = parseInt(props.getProperty("PROCESSED_HASHES_COUNT") || "1", 10);
    var lastKey    = "PROCESSED_HASHES_" + (chunkCount - 1);
    var raw        = props.getProperty(lastKey);
    var chunk      = raw ? JSON.parse(raw) : [];

    if (chunk.length >= 100) {
      // Start a new chunk
      var newKey = "PROCESSED_HASHES_" + chunkCount;
      props.setProperty(newKey, JSON.stringify([hash]));
      props.setProperty("PROCESSED_HASHES_COUNT", String(chunkCount + 1));
    } else {
      chunk.push(hash);
      props.setProperty(lastKey, JSON.stringify(chunk));
    }
  }

  /**
   * Clears all processed hash chunks (DEV_MODE only).
   */
  function clearAllHashes() {
    var props = PropertiesService.getUserProperties();
    if (props.getProperty("DEV_MODE") !== "true") {
      throw new Error("clearAllHashes() requires DEV_MODE=true");
    }
    var chunkCount = parseInt(props.getProperty("PROCESSED_HASHES_COUNT") || "1", 10);
    for (var i = 0; i < chunkCount; i++) {
      props.deleteProperty("PROCESSED_HASHES_" + i);
    }
    props.setProperty("PROCESSED_HASHES_COUNT", "1");
    props.setProperty("PROCESSED_HASHES_0", "[]");
    logAudit("Processor.clearAllHashes", "All dedup hashes cleared (DEV_MODE)", "WARN");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — renameAndArchiveFile_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Renames the receipt file to a canonical format and moves it to the
   * year-appropriate archive folder.
   *
   * Filename format: YYYY-MM-DD_VendorName_$Total.ext
   * For USD receipts: YYYY-MM-DD_VendorName_USD49.99.ext
   *
   * ⚠️ Archive folder is read dynamically from CURRENT_ARCHIVE_FOLDER_ID —
   * NOT hardcoded. Rolls over each January via checkAndRollArchiveFolder().
   *
   * @param {string} driveFileId - Google Drive file ID
   * @param {Object} data        - Enriched data object (post-processing)
   * @returns {string|null} Direct Drive URL or null if no file to archive
   * @private
   */
  function renameAndArchiveFile_(driveFileId, data) {
    if (!driveFileId) return null;

    try {
      var file      = DriveApp.getFileById(driveFileId);
      var extension = _getFileExtension_(file.getName());

      // Sanitize vendor name: max 20 chars, alphanumeric + underscores only
      var vendorClean = (data.vendor || "Unknown")
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 20);

      // Use original USD total in filename if receipt was in USD
      var amountStr = data.currency === "USD" && data.original_usd_total
        ? "USD" + parseFloat(data.original_usd_total).toFixed(2)
        : "$" + parseFloat(data.total).toFixed(2);

      var newName = (data.date || "unknown-date") + "_" + vendorClean + "_" + amountStr + extension;
      file.setName(newName);

      // Move to archive folder
      var props     = PropertiesService.getUserProperties();
      var archiveId = props.getProperty("CURRENT_ARCHIVE_FOLDER_ID");
      if (archiveId) {
        var archiveFolder = DriveApp.getFolderById(archiveId);
        file.moveTo(archiveFolder);
      }

      return "https://drive.google.com/file/d/" + driveFileId + "/view";

    } catch (e) {
      logAudit("Processor.renameAndArchiveFile_", "Failed for fileId " + driveFileId + ": " + e.message, "WARN");
      return "https://drive.google.com/file/d/" + driveFileId + "/view";
    }
  }

  /**
   * Extracts the file extension from a filename, including the dot.
   *
   * @param {string} fileName - Full filename
   * @returns {string} Extension e.g. ".pdf" or "" if none
   * @private
   */
  function _getFileExtension_(fileName) {
    var lastDot = (fileName || "").lastIndexOf(".");
    return lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : "";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    processExtractedData: processExtractedData,
    clearAllHashes:       clearAllHashes
  };

})();
