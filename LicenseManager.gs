/**
 * @fileoverview LicenseManager.gs — License key activation for LoonieLog.
 * Validates Core DIY license keys against the LicenseServer Web App,
 * then promotes the user's tier via TierManager.
 *
 * Depends on: Config.gs (LICENSE_SERVER_URL, LICENSE_KEY_PATTERN)
 *             TierManager.gs (setUserTier, getUserTier)
 *             Code.gs (logAudit)
 */

var LicenseManager = (function() {

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC — activateLicense
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Validates a license key against the LicenseServer, then activates the tier.
   * Called by the global activateLicenseKey() wrapper in Code.gs.
   *
   * @param {string} key - License key entered by the user (e.g. CORE-XXXXX-XXXXX-XXXXX)
   * @returns {{ success: boolean, message: string, tier?: string }}
   */
  function activateLicense(key) {
    try {
      key = String(key || "").trim().toUpperCase();

      if (!isValidKeyFormat_(key)) {
        return {
          success: false,
          message: "Invalid key format. Expected: CORE-XXXXX-XXXXX-XXXXX"
        };
      }

      var url      = LICENSE_SERVER_URL + "?action=verify&key=" + encodeURIComponent(key);
      var response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects:    true
      });

      if (response.getResponseCode() !== 200) {
        logAudit("LicenseManager.activateLicense",
          "Server returned HTTP " + response.getResponseCode(), "ERROR");
        return { success: false, message: "License server unavailable. Please try again later." };
      }

      var responseText = response.getContentText();
      var result;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        logAudit("LicenseManager.activateLicense", "Invalid server JSON: " + responseText.substring(0, 500), "ERROR");
        return { success: false, message: "License server returned invalid data. Check deployment URL and permissions." };
      }

      if (!result.valid) {
        var reason = humanReadableReason_(result.error || "");
        logAudit("LicenseManager.activateLicense",
          "Key rejected: " + key + " — " + result.error, "WARN");
        return { success: false, message: reason };
      }

      // Promote tier
      TierManager.setUserTier(result.tier);

      // Persist key and email for reference
      var props = PropertiesService.getUserProperties();
      props.setProperty("LICENSE_KEY",   key);
      props.setProperty("LICENSE_EMAIL", result.email || "");

      logAudit("LicenseManager.activateLicense",
        "Activated: " + key + " → tier: " + result.tier, "OK");

      return {
        success: true,
        tier:    result.tier,
        message: "Core DIY activated! You now have 50 receipts/month."
      };

    } catch (e) {
      logAudit("LicenseManager.activateLicense", e.message, "ERROR");
      return { success: false, message: "Error: " + e.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC — getLicenseStatus
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Returns the stored license status for display in the Dashboard or Sidebar.
   *
   * @returns {{ hasLicense: boolean, maskedKey: string|null, tier: string }}
   */
  function getLicenseStatus() {
    var props = PropertiesService.getUserProperties();
    var key   = props.getProperty("LICENSE_KEY") || "";
    var tier  = TierManager.getUserTier();
    var masked = key ? key.slice(0, 5) + "-*****-*****-" + key.slice(-5) : null;
    return {
      hasLicense: !!key && tier !== "micro",
      maskedKey:  masked,
      tier:       tier
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC — deactivateLicense
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Removes the stored license key and downgrades the user to Micro.
   * Called if a user wants to reset or transfer their license.
   *
   * @returns {{ success: boolean }}
   */
  function deactivateLicense() {
    try {
      var props = PropertiesService.getUserProperties();
      props.deleteProperty("LICENSE_KEY");
      props.deleteProperty("LICENSE_EMAIL");
      TierManager.setUserTier("micro");
      logAudit("LicenseManager.deactivateLicense", "License removed — downgraded to Micro", "OK");
      return { success: true };
    } catch (e) {
      logAudit("LicenseManager.deactivateLicense", e.message, "ERROR");
      return { success: false };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE — helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the key matches the expected format CORE-XXXXX-XXXXX-XXXXX.
   *
   * @param {string} key
   * @returns {boolean}
   * @private
   */
  function isValidKeyFormat_(key) {
    return /^CORE-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key);
  }

  /**
   * Converts a machine error code from the server into a user-facing message.
   *
   * @param {string} errorCode - e.g. "key_not_found" | "key_revoked"
   * @returns {string} Human-readable message
   * @private
   */
  function humanReadableReason_(errorCode) {
    var reasons = {
      "key_not_found": "That key wasn't found. Double-check it matches the email we sent.",
      "key_revoked":   "That license has been revoked. Contact hello@loonielog.ca for help.",
      "Invalid key format": "Invalid format. Key should look like CORE-XXXXX-XXXXX-XXXXX."
    };
    return reasons[errorCode] || ("License validation failed: " + errorCode);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────
  return {
    activateLicense:   activateLicense,
    getLicenseStatus:  getLicenseStatus,
    deactivateLicense: deactivateLicense
  };

})();
