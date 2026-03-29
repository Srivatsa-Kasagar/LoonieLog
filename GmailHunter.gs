/**
 * @fileoverview GmailHunter.gs — Gmail receipt scanner.
 * Scans threads labelled [To_Log], extracts email body and attachments,
 * routes to AIRouter, applies CRA rules via Processor, and logs to SheetLogger.
 *
 * Depends on: Config.gs, Code.gs (logAudit), AIRouter.gs, Processor.gs, SheetLogger.gs
 */

var GmailHunter = (function() {

  /** MIME types accepted as receipt attachments. */
  var ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

  /** Label applied to threads that have been processed (suppress re-processing). */
  var PROCESSED_LABEL_NAME = "loonielog-processed";

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — scanInbox
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scans Gmail for threads labelled [To_Log] that haven't been processed yet.
   * Called by runProcessor() on every trigger cycle.
   *
   * @returns {number} Count of receipts successfully processed
   */
  function scanInbox() {
    var processed   = 0;
    var skipped     = 0;
    var nonReceipt  = 0;

    try {
      var processedLabelId = ensureProcessedLabel_();
      var threads = GmailApp.search(
        "label:To_Log -label:" + PROCESSED_LABEL_NAME,
        0,
        50
      );

      logAudit("GmailHunter.scanInbox", "Found " + threads.length + " unprocessed thread(s)", "OK");

      for (var t = 0; t < threads.length; t++) {
        var thread   = threads[t];
        var messages = thread.getMessages();
        var threadError = false;

        // Process up to the 3 most recent messages in each thread
        var startIdx = Math.max(0, messages.length - 3);

        for (var m = startIdx; m < messages.length; m++) {
          var result = processGmailMessage_(messages[m]);
          if (result === "processed")          processed++;
          else if (result === "skip")          skipped++;
          else if (result === "nonreceipt")    nonReceipt++;
          else if (result === "error")         threadError = true;
        }

        // Only mark thread as processed if no fatal error happened (e.g. rate limit)
        if (!threadError) {
          markThreadProcessed_(thread, processedLabelId);
        }
      }

      logAudit("GmailHunter.scanInbox",
        "Scan complete — processed: " + processed + ", skipped: " + skipped + ", non-receipt: " + nonReceipt, "OK");

      return processed;

    } catch (e) {
      logAudit("GmailHunter.scanInbox", e.message, "ERROR");
      return processed;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — huntPastReceipts
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Backfills past 90 days of receipt emails.
   * Called from Dashboard "Hunt Past Receipts" button or on first install.
   * Rate-limited: 500ms pause between API calls.
   *
   * @returns {{ processed: number, skipped: number, nonReceipt: number }}
   */
  function huntPastReceipts() {
    var processed  = 0;
    var skipped    = 0;
    var nonReceipt = 0;

    try {
      var processedLabelId = ensureProcessedLabel_();
      var threads = GmailApp.search(
        "(receipt OR invoice OR \"order confirmation\") newer_than:90d -label:" + PROCESSED_LABEL_NAME,
        0,
        100
      );

      logAudit("GmailHunter.huntPastReceipts", "Found " + threads.length + " thread(s) in past 90 days", "OK");

      for (var t = 0; t < threads.length; t++) {
        // Progress toast every 10 threads
        if (t > 0 && t % 10 === 0) {
          SpreadsheetApp.getActiveSpreadsheet()
            .toast("LoonieLog: processed " + t + " of " + threads.length + " past emails…", "Backfill", 3);
        }

        var thread   = threads[t];
        var messages = thread.getMessages();
        var startIdx = Math.max(0, messages.length - 3);

        for (var m = startIdx; m < messages.length; m++) {
          var result = processGmailMessage_(messages[m]);
          if (result === "processed")   processed++;
          else if (result === "skip")   skipped++;
          else if (result === "nonreceipt") nonReceipt++;
        }

        markThreadProcessed_(thread, processedLabelId);
        Utilities.sleep(500); // Rate limit to avoid Gmail quota exhaustion
      }

      logAudit("GmailHunter.huntPastReceipts",
        "Backfill complete — processed: " + processed + ", skipped: " + skipped + ", non-receipt: " + nonReceipt, "OK");

      return { processed: processed, skipped: skipped, nonReceipt: nonReceipt };

    } catch (e) {
      logAudit("GmailHunter.huntPastReceipts", e.message, "ERROR");
      return { processed: processed, skipped: skipped, nonReceipt: nonReceipt };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — processGmailMessage_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Processes a single Gmail message:
   * extracts body + attachments, routes to AI, applies CRA rules, logs to sheet.
   *
   * @param {GoogleAppsScript.Gmail.GmailMessage} message
   * @returns {"processed"|"skip"|"nonreceipt"|"error"}
   * @private
   */
  function processGmailMessage_(message) {
    try {
      var subject = message.getSubject() || "(no subject)";
      var from    = message.getFrom()    || "";
      var date    = message.getDate();
      var body    = message.getPlainBody() || stripHtml_(message.getBody()) || "";

      // Truncate body for API efficiency
      var bodyTruncated = body.slice(0, 3000);

      // Save attachments to Drive
      var attachments  = message.getAttachments();
      var driveFileIds = [];
      for (var a = 0; a < attachments.length; a++) {
        var att = attachments[a];
        if (ACCEPTED_MIME.indexOf(att.getContentType()) !== -1) {
          var saved = saveAttachmentToDrive_(att);
          if (saved) driveFileIds.push(saved.fileId);
        }
      }

      // Process attachments first when present; otherwise fall back to email body text.
      if (driveFileIds.length > 0) {
        var processedCount = 0;
        for (var i = 0; i < driveFileIds.length; i++) {
          var file     = DriveApp.getFileById(driveFileIds[i]);
          var mimeType = file.getMimeType();
          var attachmentPayload = {
            type:     mimeType === "application/pdf" ? "pdf" : "image",
            content:  file.getBlob(),
            metadata: { subject: subject, source: "Gmail", fileName: file.getName() }
          };

          var aiResult = AIRouter.extractReceiptData(attachmentPayload);
          if (aiResult.is_receipt === false) {
            logAudit("GmailHunter.processGmailMessage_",
              "SKIPPED_NON_RECEIPT ATTACHMENT: " + file.getName() + " in " + subject, "SKIP");
            continue;
          }

          var processed = Processor.processExtractedData(aiResult, "Gmail", driveFileIds[i]);
          SheetLogger.logExpense(processed.data, processed.targetSheet);
          processedCount++;
        }

        if (processedCount > 0) {
          return "processed";
        }

        logAudit("GmailHunter.processGmailMessage_",
          "All attachments skipped as non-receipts: " + subject, "SKIP");
        return "nonreceipt";
      }

      var payload = {
        type:     "email",
        content:  bodyTruncated,
        metadata: {
          subject: subject,
          source:  "Gmail",
          from:    from,
          date:    Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd")
        }
      };

      // Call AI extraction
      var aiResult = AIRouter.extractReceiptData(payload);

      // ⚠️ Non-receipt guard — skip emails that aren't actual receipts
      if (aiResult.is_receipt === false) {
        logAudit("GmailHunter.processGmailMessage_",
          "SKIPPED_NON_RECEIPT: " + subject + " from " + from, "SKIP");
        return "nonreceipt";
      }

      var processed = Processor.processExtractedData(aiResult, "Gmail", null);
      SheetLogger.logExpense(processed.data, processed.targetSheet);
      return "processed";

    } catch (e) {
      if (e.message === "DUPLICATE") {
        logAudit("GmailHunter.processGmailMessage_",
          "DUPLICATE: " + (message.getSubject() || "no subject"), "SKIP");
        return "skip";
      }
      logAudit("GmailHunter.processGmailMessage_", e.message, "ERROR");
      return "error";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — saveAttachmentToDrive_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Saves a Gmail attachment blob to the LoonieLog_Unprocessed Drive folder.
   *
   * @param {GoogleAppsScript.Gmail.GmailAttachment} attachment
   * @returns {{ fileId: string, fileName: string }|null}
   * @private
   */
  function saveAttachmentToDrive_(attachment) {
    try {
      var props       = PropertiesService.getUserProperties();
      var folderId    = props.getProperty("UNPROCESSED_FOLDER_ID");
      if (!folderId) throw new Error("UNPROCESSED_FOLDER_ID not set.");

      var folder      = DriveApp.getFolderById(folderId);
      var file        = folder.createFile(attachment);
      return { fileId: file.getId(), fileName: file.getName() };
    } catch (e) {
      logAudit("GmailHunter.saveAttachmentToDrive_", e.message, "WARN");
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — markThreadProcessed_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Applies the "loonielog-processed" label to a Gmail thread to prevent
   * it from being re-processed on the next trigger cycle.
   *
   * @param {GoogleAppsScript.Gmail.GmailThread} thread
   * @param {string} labelId - Gmail label ID for loonielog-processed
   * @private
   */
  function markThreadProcessed_(thread, labelId) {
    try {
      var label = GmailApp.getUserLabelByName(PROCESSED_LABEL_NAME);
      if (label) {
        thread.addLabel(label);
      }
    } catch (e) {
      logAudit("GmailHunter.markThreadProcessed_", e.message, "WARN");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — ensureProcessedLabel_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Creates the "loonielog-processed" Gmail label if it doesn't already exist.
   * Returns the label ID for use in thread marking.
   *
   * @returns {string} Label ID
   * @private
   */
  function ensureProcessedLabel_() {
    var existing = GmailApp.getUserLabelByName(PROCESSED_LABEL_NAME);
    if (existing) return existing.getName();

    try {
      var created = Gmail.Users.Labels.create({
        name:                  PROCESSED_LABEL_NAME,
        labelListVisibility:   "labelHide",
        messageListVisibility: "hide"
      }, "me");
      return created.id;
    } catch (e) {
      // If creation fails (e.g. already exists race), silently continue
      logAudit("GmailHunter.ensureProcessedLabel_", e.message, "WARN");
      return PROCESSED_LABEL_NAME;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — stripHtml_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Strips HTML tags from an email body and returns clean plain text.
   * Removes script/style blocks entirely, decodes common HTML entities,
   * and collapses whitespace.
   *
   * @param {string} html - Raw HTML string
   * @returns {string} Clean plain text (max 3000 chars)
   * @private
   */
  function stripHtml_(html) {
    if (!html) return "";

    var text = html
      // Remove script and style blocks with their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&amp;/g,  "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g,   "<")
      .replace(/&gt;/g,   ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g,  "'")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 3000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    scanInbox:        scanInbox,
    huntPastReceipts: huntPastReceipts
  };

})();
