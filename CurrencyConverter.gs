/**
 * @fileoverview CurrencyConverter.gs — USD→CAD conversion using Bank of Canada Valet API.
 * Free, no auth, CRA-accepted for foreign currency conversion on T2125 filings.
 *
 * Depends on: Config.gs (BOC_FX_ENDPOINT), Code.gs (logAudit)
 * All public functions namespaced under CurrencyConverter object.
 */

var CurrencyConverter = (function() {

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — getUsdCadRate
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the Bank of Canada FXUSDCAD rate for a given date.
   * Checks the PropertiesService cache before making an API call.
   * If the date falls on a weekend or Canadian holiday, rolls back up to 3 days.
   *
   * @param {string} dateString - Receipt date in "YYYY-MM-DD" format
   * @returns {number|null} Exchange rate as float (e.g. 1.3952), or null on failure
   */
  function getUsdCadRate(dateString) {
    try {
      var cached = getCachedRate_(dateString);
      if (cached !== null) return cached;

      var result = fetchBocRate_(dateString);
      if (!result) return null;

      return result.rate;
    } catch (e) {
      logAudit("CurrencyConverter.getUsdCadRate", e.message, "ERROR");
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — convertUsdToCad
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Converts a USD amount to CAD using the BOC rate for the receipt date.
   *
   * @param {number} amountUsd  - Amount in USD (e.g. 45.00)
   * @param {string} dateString - Receipt date in "YYYY-MM-DD" format
   * @returns {{
   *   amountCad: number|null,
   *   rate: number|null,
   *   rateDate: string|null,
   *   error: string|null
   * }}
   */
  function convertUsdToCad(amountUsd, dateString) {
    try {
      var cached = getCachedRate_(dateString);
      var rate, rateDate;

      if (cached !== null) {
        rate     = cached;
        rateDate = dateString;
      } else {
        var result = fetchBocRate_(dateString);
        if (!result) {
          return { amountCad: null, rate: null, rateDate: null, error: "BOC rate unavailable after 3 retries" };
        }
        rate     = result.rate;
        rateDate = result.rateDate;
      }

      var amountCad = Math.round(amountUsd * rate * 100) / 100;
      logAudit(
        "CurrencyConverter.convertUsdToCad",
        "USD $" + amountUsd + " → CAD $" + amountCad + " @ BOC " + rate + " (" + rateDate + ")",
        "OK"
      );

      return { amountCad: amountCad, rate: rate, rateDate: rateDate, error: null };

    } catch (e) {
      logAudit("CurrencyConverter.convertUsdToCad", e.message, "ERROR");
      return { amountCad: null, rate: null, rateDate: null, error: e.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — fetchBocRate_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calls the Bank of Canada Valet API to retrieve FXUSDCAD for a given date.
   * Retries up to 3 days back to handle weekends and Canadian public holidays.
   * Caches the result before returning.
   *
   * Endpoint: BOC_FX_ENDPOINT?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
   * Response: { observations: [{ d: "YYYY-MM-DD", FXUSDCAD: { v: "1.3952" } }] }
   *
   * @param {string} dateString - Starting date "YYYY-MM-DD"
   * @returns {{ rate: number, rateDate: string }|null}
   * @private
   */
  function fetchBocRate_(dateString) {
    var maxRetries  = 3;
    var currentDate = dateString;

    for (var attempt = 0; attempt < maxRetries; attempt++) {
      try {
        var url      = BOC_FX_ENDPOINT + "?start_date=" + currentDate + "&end_date=" + currentDate;
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var code     = response.getResponseCode();

        if (code !== 200) {
          throw new Error("BOC API HTTP " + code + ": " + response.getContentText().slice(0, 200));
        }

        var body = JSON.parse(response.getContentText());

        if (body.observations && body.observations.length > 0) {
          var obs  = body.observations[0];
          var rate = parseFloat(obs.FXUSDCAD.v);

          if (isNaN(rate)) {
            throw new Error("BOC rate value is NaN for date " + currentDate);
          }

          // Cache the actual date the rate is from
          setCachedRate_(currentDate, rate);

          return { rate: rate, rateDate: currentDate };
        }

        // Empty observations = weekend or holiday — roll back one day
        logAudit(
          "CurrencyConverter.fetchBocRate_",
          "No rate for " + currentDate + " (weekend/holiday) — rolling back",
          "WARN"
        );
        currentDate = subtractDay_(currentDate);

      } catch (e) {
        if (attempt === maxRetries - 1) {
          logAudit("CurrencyConverter.fetchBocRate_", "Failed after " + maxRetries + " attempts: " + e.message, "ERROR");
          return null;
        }
        // Retry on transient error
        currentDate = subtractDay_(currentDate);
      }
    }

    logAudit("CurrencyConverter.fetchBocRate_", "No BOC rate found after " + maxRetries + " rollback attempts from " + dateString, "ERROR");
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — getCachedRate_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reads the FX_RATE_CACHE from PropertiesService.
   * Cache is stored as a JSON object: { "YYYY-MM-DD": 1.3952 }
   *
   * @param {string} dateString - Date key "YYYY-MM-DD"
   * @returns {number|null} Cached rate or null if not found
   * @private
   */
  function getCachedRate_(dateString) {
    try {
      var raw   = PropertiesService.getUserProperties().getProperty("FX_RATE_CACHE");
      var cache = raw ? JSON.parse(raw) : {};
      var val   = cache[dateString];
      return (val !== undefined && val !== null) ? parseFloat(val) : null;
    } catch (e) {
      logAudit("CurrencyConverter.getCachedRate_", "Cache read error: " + e.message, "WARN");
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — setCachedRate_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Writes a new rate entry to FX_RATE_CACHE in PropertiesService.
   * Trims the cache to the most recent 365 entries to avoid property size limits.
   *
   * @param {string} dateString - Date key "YYYY-MM-DD"
   * @param {number} rate       - Exchange rate float
   * @private
   */
  function setCachedRate_(dateString, rate) {
    try {
      var props = PropertiesService.getUserProperties();
      var raw   = props.getProperty("FX_RATE_CACHE");
      var cache = raw ? JSON.parse(raw) : {};

      cache[dateString] = rate;

      // Trim to last 365 entries (sorted by date key ascending)
      var keys = Object.keys(cache).sort();
      if (keys.length > 365) {
        var toRemove = keys.slice(0, keys.length - 365);
        for (var i = 0; i < toRemove.length; i++) {
          delete cache[toRemove[i]];
        }
      }

      props.setProperty("FX_RATE_CACHE", JSON.stringify(cache));
    } catch (e) {
      logAudit("CurrencyConverter.setCachedRate_", "Cache write error: " + e.message, "WARN");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — subtractDay_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the previous calendar day as "YYYY-MM-DD".
   * Uses UTC to avoid DST-related off-by-one errors.
   *
   * @param {string} dateString - "YYYY-MM-DD"
   * @returns {string} Previous day "YYYY-MM-DD"
   * @private
   */
  function subtractDay_(dateString) {
    var parts = dateString.split("-");
    var d     = new Date(Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10) - 1  // -1 day
    ));
    var y  = d.getUTCFullYear();
    var m  = ("0" + (d.getUTCMonth() + 1)).slice(-2);
    var dd = ("0" + d.getUTCDate()).slice(-2);
    return y + "-" + m + "-" + dd;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    getUsdCadRate:    getUsdCadRate,
    convertUsdToCad:  convertUsdToCad
  };

})();
