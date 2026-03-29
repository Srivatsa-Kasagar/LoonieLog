/**
 * @fileoverview TierManager.gs — Subscription tier management for LoonieLog.
 * Enforces monthly receipt limits for Micro (Free), Core ($4.99), and Managed ($14.99) plans.
 * Determines AI routing mode (developer's endpoint vs. user's own API key).
 *
 * Depends on: Config.gs, Code.gs (logAudit)
 */

var TierManager = (function() {

  /**
   * Tier definitions.
   * limit   — max receipts per calendar month
   * label   — display name shown in Dashboard and alerts
   * price   — display price string
   * aiMode  — "developer" = routes to DEVELOPER_AI_ENDPOINT
   *           "user"      = routes to user's own API key (Gemini or Claude)
   */
  var TIER_CONFIG = {
    micro:   { limit: 8,    label: "Micro",        price: "Free",      aiMode: "user"      },
    core:    { limit: 50,   label: "Core DIY",     price: "$4.99/mo",  aiMode: "user"      },
    managed: { limit: 9999, label: "Managed Pro",  price: "$14.99/mo", aiMode: "developer" }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getUserTier
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reads the user's active tier from PropertiesService.
   * Defaults to "micro" if not set or if an invalid value is stored.
   *
   * @returns {"micro"|"core"|"managed"}
   */
  function getUserTier() {
    var tier = PropertiesService.getUserProperties().getProperty("USER_TIER") || "micro";
    return TIER_CONFIG[tier] ? tier : "micro";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getTierAIMode
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the AI routing mode for the current user's tier.
   * "developer" → call DEVELOPER_AI_ENDPOINT (Micro + Managed)
   * "user"      → call user's own Gemini / Claude key (Core)
   *
   * @returns {"developer"|"user"}
   */
  function getTierAIMode() {
    return TIER_CONFIG[getUserTier()].aiMode;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getMonthlyCount
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Counts receipt rows logged in the current calendar month from the Expenses sheet.
   * Reads column A (Date) and compares year + month.
   *
   * @returns {number} Number of receipts logged this month
   */
  function getMonthlyCount() {
    try {
      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("Expenses");
      if (!sheet || sheet.getLastRow() < 2) return 0;

      var now   = new Date();
      var year  = now.getFullYear();
      var month = now.getMonth(); // 0-indexed

      var dates = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      var count = 0;

      for (var i = 0; i < dates.length; i++) {
        var cell = dates[i][0];
        if (!cell) continue;
        var d = (cell instanceof Date) ? cell : new Date(cell);
        if (!isNaN(d) && d.getFullYear() === year && d.getMonth() === month) count++;
      }
      return count;

    } catch (e) {
      logAudit("TierManager.getMonthlyCount", e.message, "ERROR");
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — checkMonthlyUsage
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pre-flight check called at the start of every processing cycle.
   * If the user has reached their monthly limit, shows a UI alert and returns false.
   * The caller must abort processing when this returns false.
   *
   * @returns {boolean} true = proceed; false = limit reached, abort
   */
  function checkMonthlyUsage() {
    try {
      var tier    = getUserTier();
      var config  = TIER_CONFIG[tier];
      var count   = getMonthlyCount();
      var limit   = config.limit;

      logAudit("TierManager.checkMonthlyUsage",
        "Usage: " + count + "/" + (tier === "managed" ? "∞" : limit) +
        " (" + config.label + ")", "OK");

      if (count >= limit) {
        var upgradeMsg = "";
        if (tier === "micro") {
          upgradeMsg = "\n\nUpgrade to Core DIY ($4.99/mo) for 50 receipts, " +
                       "or Managed Pro ($14.99/mo) for unlimited.\n\nVisit loonielog.ca to upgrade.";
        } else if (tier === "core") {
          upgradeMsg = "\n\nUpgrade to Managed Pro ($14.99/mo) for unlimited receipts.\n\nVisit loonielog.ca to upgrade.";
        }

        SpreadsheetApp.getUi().alert(
          "Monthly Limit Reached — " + config.label + " Plan",
          "You have logged " + count + " of " + limit + " receipts allowed on your " +
          config.label + " plan this month." + upgradeMsg,
          SpreadsheetApp.getUi().ButtonSet.OK
        );

        logAudit("TierManager.checkMonthlyUsage",
          "Limit reached: " + count + "/" + limit + " — processing aborted", "WARN");
        return false;
      }

      return true;

    } catch (e) {
      logAudit("TierManager.checkMonthlyUsage", e.message, "ERROR");
      return true; // fail-open so a bug doesn't permanently block the user
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getTierSummary
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns a summary object for the Dashboard display.
   *
   * @returns {{
   *   tier: string,
   *   label: string,
   *   price: string,
   *   count: number,
   *   limit: number,
   *   remaining: number,
   *   pct: number,
   *   isUnlimited: boolean
   * }}
   */
  function getTierSummary() {
    var tier        = getUserTier();
    var config      = TIER_CONFIG[tier];
    var count       = getMonthlyCount();
    var isUnlimited = (tier === "managed");
    var limit       = config.limit;
    return {
      tier:        tier,
      label:       config.label,
      price:       config.price,
      count:       count,
      limit:       limit,
      remaining:   isUnlimited ? 9999 : Math.max(0, limit - count),
      pct:         isUnlimited ? 0 : Math.min(100, Math.round((count / limit) * 100)),
      isUnlimited: isUnlimited
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — setUserTier
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Stores the user's tier in PropertiesService.
   * Called after payment verification via the billing webhook or manual admin override.
   *
   * @param {"micro"|"core"|"managed"} tier
   * @throws {Error} If tier is not a valid key
   */
  function setUserTier(tier) {
    if (!TIER_CONFIG[tier]) throw new Error("Invalid tier: " + tier);
    PropertiesService.getUserProperties().setProperty("USER_TIER", tier);
    logAudit("TierManager.setUserTier", "Tier updated to: " + tier + " (" + TIER_CONFIG[tier].price + ")", "OK");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    getUserTier:       getUserTier,
    getTierAIMode:     getTierAIMode,
    getMonthlyCount:   getMonthlyCount,
    checkMonthlyUsage: checkMonthlyUsage,
    getTierSummary:    getTierSummary,
    setUserTier:       setUserTier,
    TIER_CONFIG:       TIER_CONFIG
  };

})();
