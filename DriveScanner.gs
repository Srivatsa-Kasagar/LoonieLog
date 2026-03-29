/**
 * @fileoverview DriveScanner.gs — Google Drive receipt scanner.
 * Polls the LoonieLog_Unprocessed folder for image/PDF files dropped manually.
 * Routes each file to AIRouter, applies CRA rules, and logs to SheetLogger.
 *
 * Depends on: Config.gs, Code.gs (logAudit), AIRouter.gs, Processor.gs, SheetLogger.gs
 */

var DriveScanner = (function() {

  /** Supported MIME types for receipt files. */
  var ACCEPTED_MIME = {
    "application/pdf": "pdf",
    "image/jpeg":      "image",
    "image/jpg":       "image",
    "image/png":       "image",
    "image/heic":      "image"
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — scanFolder
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scans the LoonieLog_Unprocessed Drive folder for new receipt files.
   * Called by runProcessor() on every trigger cycle.
   * Files are moved to the archive folder by Processor.renameAndArchiveFile_.
   *
   * @returns {number} Count of files successfully processed
   */
  function scanFolder() {
    var processed = 0;

    try {
      var props    = PropertiesService.getUserProperties();
      var folderId = props.getProperty("UNPROCESSED_FOLDER_ID");
      if (!folderId) {
        logAudit("DriveScanner.scanFolder", "UNPROCESSED_FOLDER_ID not set — skipping Drive scan", "WARN");
        return 0;
      }

      var folder = DriveApp.getFolderById(folderId);
      var files  = folder.getFiles();
      var total  = 0;

      while (files.hasNext()) {
        var file     = files.next();
        var mimeType = file.getMimeType();

        if (!ACCEPTED_MIME[mimeType]) {
          logAudit("DriveScanner.scanFolder",
            "Unsupported file type skipped: " + file.getName() + " (" + mimeType + ")", "WARN");
          continue;
        }

        total++;
        var result = processDriveFile_(file);
        if (result === "processed") processed++;
      }

      logAudit("DriveScanner.scanFolder",
        "Scan complete — found: " + total + ", processed: " + processed, "OK");

      return processed;

    } catch (e) {
      logAudit("DriveScanner.scanFolder", e.message, "ERROR");
      return processed;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — processDriveFile_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Processes a single Drive receipt file:
   * builds AI payload, routes to AIRouter, applies CRA rules via Processor,
   * and logs to SheetLogger.
   *
   * On AI error: moves file to LoonieLog_Errors subfolder and logs to Audit.
   *
   * @param {GoogleAppsScript.Drive.File} file - Drive file to process
   * @returns {"processed"|"skip"|"error"}
   * @private
   */
  function processDriveFile_(file) {
    try {
      var mimeType = file.getMimeType();
      var fileType = ACCEPTED_MIME[mimeType] || "image";
      var fileId   = file.getId();
      var fileName = file.getName();

      // Reject HEIC early — not supported by Gemini or Claude vision APIs
      if (mimeType === "image/heic") {
        logAudit("DriveScanner.processDriveFile_",
          "HEIC file rejected: " + fileName + " — convert to JPEG or PNG before dropping in folder", "WARN");
        moveToErrorFolder_(file, "HEIC not supported");
        return "error";
      }

      var payload = {
        type:    fileType,
        content: file.getBlob(),
        metadata: {
          fileName: fileName,
          fileId:   fileId,
          source:   "Drive"
        }
      };

      // AI extraction
      var aiResult = AIRouter.extractReceiptData(payload);

      // Non-receipt guard — Drive files are intentionally placed by the user,
      // so never discard them. If AI flags is_receipt: false, override and route
      // to Needs Review with a note rather than silently skipping.
      if (aiResult.is_receipt === false) {
        logAudit("DriveScanner.processDriveFile_",
          "is_receipt=false overridden for Drive file — routing to Needs Review: " + fileName, "WARN");
        aiResult.is_receipt  = true;
        aiResult.confidence  = "low";
        aiResult.expense_type = "Review";
        aiResult.notes       = (aiResult.notes ? aiResult.notes + " | " : "") +
                               "AI flagged as non-receipt — verify this is a valid expense.";
      }

      // CRA rule processing
      var processed = Processor.processExtractedData(aiResult, "Drive", fileId);
      SheetLogger.logExpense(processed.data, processed.targetSheet);

      return "processed";

    } catch (e) {
      if (e.message === "DUPLICATE") {
        logAudit("DriveScanner.processDriveFile_",
          "DUPLICATE: " + file.getName(), "SKIP");
        // Move duplicate out of Unprocessed so it doesn't loop
        moveToErrorFolder_(file, "Duplicate");
        return "skip";
      }

      logAudit("DriveScanner.processDriveFile_",
        "Failed processing " + file.getName() + ": " + e.message, "ERROR");
      moveToErrorFolder_(file, e.message);
      return "error";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — moveToErrorFolder_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Moves a file to a "LoonieLog_Errors" subfolder within the Unprocessed folder.
   * Creates the errors folder if it doesn't exist.
   * Prepends the error reason to the file name for easy identification.
   *
   * @param {GoogleAppsScript.Drive.File} file   - File to move
   * @param {string} reason - Short description of why it failed
   * @private
   */
  function moveToErrorFolder_(file, reason) {
    try {
      var errorFolderName = "LoonieLog_Errors";
      var iter            = DriveApp.getFoldersByName(errorFolderName);
      var errorFolder     = iter.hasNext()
        ? iter.next()
        : DriveApp.createFolder(errorFolderName);

      // Prepend error prefix to filename for easy identification
      var safeReason = reason.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20);
      var newName    = "[" + safeReason + "] " + file.getName();
      file.setName(newName);
      file.moveTo(errorFolder);

    } catch (e2) {
      logAudit("DriveScanner.moveToErrorFolder_", "Could not move to errors folder: " + e2.message, "WARN");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    scanFolder: scanFolder
  };

})();
