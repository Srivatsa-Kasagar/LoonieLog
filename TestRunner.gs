/**
 * @fileoverview TestRunner.gs — In-editor test suite for LoonieLog core modules.
 * Run runAllTests() from the Apps Script editor to execute all tests.
 *
 * Test coverage:
 *   - Config.gs        : province rates, CRA category codes
 *   - CurrencyConverter: BOC API call, weekend rollback, caching, math
 *   - TierManager      : tier defaults, setUserTier, getTierSummary, limits
 *   - Processor rules  : meals 50%, ITC, personal zeroing, WFH flag, gift flag,
 *                        missing GST flag, dedup hash, duplicate detection
 *   - LicenseManager   : key format validation
 *
 * Does NOT require: Stripe, license server, Gmail, or Drive receipts.
 * Runs entirely against PropertiesService + SpreadsheetApp (sheet must exist).
 *
 * Depends on: Config.gs, Code.gs, CurrencyConverter.gs, TierManager.gs,
 *             Processor.gs, LicenseManager.gs
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Run this function from the Apps Script editor.
 * Results are printed to Logger (View → Logs) AND written to the Audit Log sheet.
 */
function runAllTests() {
  var results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  Logger.log("══════════════════════════════════════════");
  Logger.log("  LoonieLog Test Suite");
  Logger.log("══════════════════════════════════════════");

  var suites = [
    { name: "Config",            fn: testConfig_ },
    { name: "CurrencyConverter", fn: testCurrencyConverter_ },
    { name: "TierManager",       fn: testTierManager_ },
    { name: "Processor Rules",   fn: testProcessorRules_ },
    { name: "License Key Format",fn: testLicenseKeyFormat_ }
  ];

  for (var i = 0; i < suites.length; i++) {
    var suite = suites[i];
    Logger.log("\n── " + suite.name + " ──");
    try {
      suite.fn(results);
    } catch (e) {
      results.failed++;
      results.errors.push(suite.name + ": UNCAUGHT — " + e.message);
      Logger.log("  ✗ SUITE CRASHED: " + e.message);
    }
  }

  Logger.log("\n══════════════════════════════════════════");
  Logger.log("  PASSED: " + results.passed + "  |  FAILED: " + results.failed);
  Logger.log("══════════════════════════════════════════");

  if (results.errors.length > 0) {
    Logger.log("\nFailed tests:");
    for (var j = 0; j < results.errors.length; j++) {
      Logger.log("  ✗ " + results.errors[j]);
    }
  }

  // Write summary to Audit Log
  var status = results.failed === 0 ? "OK" : "WARN";
  logAudit(
    "TestRunner.runAllTests",
    "Passed " + results.passed + "/" + (results.passed + results.failed) +
      (results.failed > 0 ? " | Failures: " + results.errors.join("; ") : ""),
    status
  );

  return { passed: results.passed, failed: results.failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates province tax rates and CRA category code presence in Config.gs.
 * @param {Object} r - results accumulator
 */
function testConfig_(r) {
  // Province total rates
  var cases = [
    { code: "ON", gst: 0.05, prov: 0.08, total: 0.13 },
    { code: "BC", gst: 0.05, prov: 0.07, total: 0.12 },
    { code: "AB", gst: 0.05, prov: 0.00, total: 0.05 },
    { code: "QC", gst: 0.05, prov: 0.09975 },
    { code: "MB", gst: 0.05, prov: 0.07, total: 0.12 },
    { code: "SK", gst: 0.05, prov: 0.06, total: 0.11 },
    { code: "NB", gst: 0.05, prov: 0.10, total: 0.15 },
    { code: "NS", gst: 0.05, prov: 0.10, total: 0.15 }
  ];

  for (var i = 0; i < cases.length; i++) {
    var tc = cases[i];
    var p  = PROVINCE_TAX_RATES[tc.code];
    assert_(r, "Province " + tc.code + " exists", p !== undefined);
    if (!p) continue;
    assertEqual_(r, tc.code + " gst_rate",      p.gst_rate,        tc.gst);
    assertEqual_(r, tc.code + " provincial_rate", p.provincial_rate, tc.prov);
    if (tc.total !== undefined) {
      assertEqual_(r, tc.code + " total_rate", p.total_rate, tc.total);
    }
  }

  // CRA categories: spot-check required codes
  var requiredCodes = ["8521", "8523", "8810", "8860", "9200", "9270", "9281", "WFH"];
  for (var j = 0; j < requiredCodes.length; j++) {
    assert_(r, "CRA code " + requiredCodes[j] + " defined",
      CRA_CATEGORIES[requiredCodes[j]] !== undefined);
  }

  // Meals category must be code 8523
  assertEqual_(r, "Meals CRA code", CRA_CATEGORIES["8523"].name, "Meals & Entertainment");
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: CurrencyConverter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tests BOC API live call, caching, and conversion math.
 * Uses a known historical weekday date (2025-01-15) to get a predictable non-empty result.
 * @param {Object} r - results accumulator
 */
function testCurrencyConverter_(r) {
  // Clear the FX cache so we test a real API call
  PropertiesService.getUserProperties().deleteProperty("FX_RATE_CACHE");

  // 1. Live BOC API call — weekday, should return a real rate
  var rate = CurrencyConverter.getUsdCadRate("2025-01-15");
  assert_(r, "BOC API returns a rate for 2025-01-15", rate !== null);
  assert_(r, "BOC rate is a positive number", typeof rate === "number" && rate > 1.0 && rate < 2.0);

  // 2. Cache hit — second call for same date must NOT hit the API again
  //    We verify by checking FX_RATE_CACHE was written
  var cacheRaw = PropertiesService.getUserProperties().getProperty("FX_RATE_CACHE");
  assert_(r, "FX_RATE_CACHE written after first call", cacheRaw !== null);
  var cache = JSON.parse(cacheRaw);
  assert_(r, "Cache contains 2025-01-15", cache["2025-01-15"] !== undefined);

  // 3. Cached call returns same value
  var rateCached = CurrencyConverter.getUsdCadRate("2025-01-15");
  assertEqual_(r, "Cached rate matches live rate", rateCached, rate);

  // 4. Weekend rollback — 2025-01-18 is a Saturday
  var satRate = CurrencyConverter.getUsdCadRate("2025-01-18");
  assert_(r, "Saturday date rolls back to valid rate", satRate !== null && satRate > 1.0);

  // 5. Conversion math — USD 100 → CAD
  var conv = CurrencyConverter.convertUsdToCad(100.00, "2025-01-15");
  assert_(r, "convertUsdToCad returns amountCad", conv.amountCad !== null);
  assert_(r, "convertUsdToCad amountCad equals rate × 100",
    Math.abs(conv.amountCad - (rate * 100)) < 0.02); // allow rounding
  assert_(r, "convertUsdToCad returns rate", conv.rate !== null);
  assert_(r, "convertUsdToCad returns rateDate", conv.rateDate !== null);
  assert_(r, "convertUsdToCad error is null", conv.error === null);

  // 6. Rounding — $45.67 must round to 2 decimal places
  var conv2 = CurrencyConverter.convertUsdToCad(45.67, "2025-01-15");
  var decimal = String(conv2.amountCad).split(".");
  assert_(r, "convertUsdToCad rounds to 2 decimals",
    !decimal[1] || decimal[1].length <= 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: TierManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tests tier storage, defaults, validation, and summary output.
 * Temporarily modifies USER_TIER in PropertiesService; restores original value.
 * @param {Object} r - results accumulator
 */
function testTierManager_(r) {
  var props       = PropertiesService.getUserProperties();
  var originalTier = props.getProperty("USER_TIER");

  try {
    // 1. Default tier when property is not set
    props.deleteProperty("USER_TIER");
    assertEqual_(r, "Default tier is micro", TierManager.getUserTier(), "micro");

    // 2. Invalid stored value falls back to micro
    props.setProperty("USER_TIER", "bogus");
    assertEqual_(r, "Invalid tier falls back to micro", TierManager.getUserTier(), "micro");

    // 3. Set valid tiers
    TierManager.setUserTier("core");
    assertEqual_(r, "setUserTier core persists", TierManager.getUserTier(), "core");

    TierManager.setUserTier("micro");
    assertEqual_(r, "setUserTier micro persists", TierManager.getUserTier(), "micro");

    // 4. setUserTier with invalid value throws
    var threw = false;
    try { TierManager.setUserTier("premium"); } catch (e) { threw = true; }
    assert_(r, "setUserTier throws on invalid tier", threw);

    // 5. getTierSummary shape
    TierManager.setUserTier("core");
    var summary = TierManager.getTierSummary();
    assert_(r, "getTierSummary has tier field",       summary.tier        === "core");
    assert_(r, "getTierSummary has label field",      summary.label       === "Core DIY");
    assert_(r, "getTierSummary has limit 50",         summary.limit       === 50);
    assert_(r, "getTierSummary isUnlimited is false", summary.isUnlimited === false);
    assert_(r, "getTierSummary count is number",      typeof summary.count === "number");
    assert_(r, "getTierSummary remaining ≤ 50",       summary.remaining   <= 50);
    assert_(r, "getTierSummary pct in 0-100",         summary.pct >= 0 && summary.pct <= 100);

    // 6. Managed Pro: isUnlimited = true
    TierManager.setUserTier("managed");
    var managedSummary = TierManager.getTierSummary();
    assert_(r, "Managed isUnlimited is true",    managedSummary.isUnlimited === true);
    assert_(r, "Managed limit is 9999",          managedSummary.limit       === 9999);
    assert_(r, "Managed remaining is 9999",      managedSummary.remaining   === 9999);
    assert_(r, "Managed pct is 0",               managedSummary.pct         === 0);

    // 7. getTierAIMode
    TierManager.setUserTier("micro");
    assertEqual_(r, "Micro AI mode is user",    TierManager.getTierAIMode(), "user");
    TierManager.setUserTier("core");
    assertEqual_(r, "Core AI mode is user",     TierManager.getTierAIMode(), "user");
    TierManager.setUserTier("managed");
    assertEqual_(r, "Managed AI mode is developer", TierManager.getTierAIMode(), "developer");

  } finally {
    // Restore original tier
    if (originalTier) {
      props.setProperty("USER_TIER", originalTier);
    } else {
      props.deleteProperty("USER_TIER");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Processor Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tests all CRA compliance rules in Processor.gs using synthetic AI JSON payloads.
 * Passes null for driveFileId to skip the Drive archive step.
 * Uses DEV_MODE=true to allow hash clearing between tests.
 * @param {Object} r - results accumulator
 */
function testProcessorRules_(r) {
  var props = PropertiesService.getUserProperties();

  // Enable DEV_MODE so clearAllHashes() works
  props.setProperty("DEV_MODE", "true");
  props.setProperty("PROVINCE", "ON");

  // Helper: clear hashes before each test scenario
  function resetHashes() {
    Processor.clearAllHashes();
  }

  try {

    // ── 1. Meals 50% rule ──────────────────────────────────────────────────
    resetHashes();
    var mealsReceipt = makeReceipt_({
      vendor: "East Side Marios", date: "2025-06-01",
      subtotal: 50.00, gst_hst: 6.50, total: 56.50, is_meal: true
    });
    var mealsResult = Processor.processExtractedData(mealsReceipt, "Gmail", null);
    assertEqual_(r, "Meals deductible_amt = 50% of total",
      mealsResult.data.deductible_amt, 28.25);
    assert_(r, "Meals ITC = 50% of gst_hst",
      Math.abs(mealsResult.data.itc_eligible - 3.25) < 0.01);
    assert_(r, "Meals note contains ITA s.67.1",
      mealsResult.data.notes.indexOf("s.67.1") !== -1);

    // ── 2. Regular business expense ITC ───────────────────────────────────
    resetHashes();
    var officeReceipt = makeReceipt_({
      vendor: "Staples", date: "2025-06-02",
      subtotal: 100.00, gst_hst: 13.00, total: 113.00
    });
    var officeResult = Processor.processExtractedData(officeReceipt, "Gmail", null);
    assertEqual_(r, "Office expense deductible_amt = total",
      officeResult.data.deductible_amt, 113.00);
    assertEqual_(r, "Office expense ITC = full gst_hst",
      officeResult.data.itc_eligible, 13.00);
    assertEqual_(r, "Office expense targetSheet = Expenses",
      officeResult.targetSheet, "Expenses");

    // ── 3. Personal expense — deductible and ITC zeroed ───────────────────
    resetHashes();
    var personalReceipt = makeReceipt_({
      vendor: "Shoppers Drug Mart", date: "2025-06-03",
      subtotal: 30.00, gst_hst: 0, total: 30.00, expense_type: "Personal"
    });
    var personalResult = Processor.processExtractedData(personalReceipt, "Gmail", null);
    assertEqual_(r, "Personal deductible_amt = 0", personalResult.data.deductible_amt, 0);
    assertEqual_(r, "Personal itc_eligible = 0",   personalResult.data.itc_eligible,   0);
    assert_(r, "Personal note mentions excluded",
      personalResult.data.notes.indexOf("Personal expense") !== -1);

    // ── 4. WFH — routes to Needs Review, deductible = null ────────────────
    resetHashes();
    var wfhReceipt = makeReceipt_({
      vendor: "Rogers", date: "2025-06-04",
      subtotal: 80.00, gst_hst: 10.40, total: 90.40,
      cra_category_code: "WFH"
    });
    var wfhResult = Processor.processExtractedData(wfhReceipt, "Gmail", null);
    assertEqual_(r, "WFH targetSheet = Needs Review", wfhResult.targetSheet, "Needs Review");
    assertEqual_(r, "WFH deductible_amt = null", wfhResult.data.deductible_amt, null);
    assert_(r, "WFH note mentions Part 7",
      wfhResult.data.notes.indexOf("Part 7") !== -1);

    // ── 5. Gift — routes to Needs Review, suggested 8521 ─────────────────
    resetHashes();
    var giftReceipt = makeReceipt_({
      vendor: "LCBO", date: "2025-06-05",
      subtotal: 45.00, gst_hst: 5.85, total: 50.85, is_gift: true
    });
    var giftResult = Processor.processExtractedData(giftReceipt, "Gmail", null);
    assertEqual_(r, "Gift targetSheet = Needs Review", giftResult.targetSheet, "Needs Review");
    assertEqual_(r, "Gift expense_type = Review", giftResult.data.expense_type, "Review");
    assertEqual_(r, "Gift default CRA code = 8521", giftResult.data.cra_category_code, "8521");
    assert_(r, "Gift note explains recipient types",
      giftResult.data.notes.indexOf("Client gift") !== -1);

    // ── 6. Missing GST flag (ON, total > $30) ────────────────────────────
    resetHashes();
    var noGstReceipt = makeReceipt_({
      vendor: "Freelancer Invoice", date: "2025-06-06",
      subtotal: 200.00, gst_hst: 0, pst_qst: 0, total: 200.00
    });
    var noGstResult = Processor.processExtractedData(noGstReceipt, "Gmail", null);
    assert_(r, "No GST note added when gst=0 and total>30",
      noGstResult.data.notes.indexOf("No GST/HST") !== -1);

    // ── 7. Missing GST flag skipped for USD receipts ──────────────────────
    resetHashes();
    var usdNoGst = makeReceipt_({
      vendor: "AWS", date: "2025-06-07",
      subtotal: 50.00, gst_hst: 0, total: 50.00, currency: "USD"
    });
    var usdNoGstResult = Processor.processExtractedData(usdNoGst, "Gmail", null);
    assert_(r, "USD receipt does not get missing-GST note",
      usdNoGstResult.data.notes.indexOf("No GST/HST") === -1);

    // ── 8. Low confidence → Needs Review ────────────────────────────────
    resetHashes();
    var lowConfReceipt = makeReceipt_({
      vendor: "Unknown Vendor", date: "2025-06-08",
      subtotal: 20.00, gst_hst: 2.60, total: 22.60, confidence: "low"
    });
    var lowConfResult = Processor.processExtractedData(lowConfReceipt, "Gmail", null);
    assertEqual_(r, "Low confidence → Needs Review", lowConfResult.targetSheet, "Needs Review");

    // ── 9. Deduplication — second identical receipt throws DUPLICATE ──────
    resetHashes();
    var dupReceipt = makeReceipt_({
      vendor: "Tim Hortons", date: "2025-06-09",
      subtotal: 5.00, gst_hst: 0.65, total: 5.65
    });
    Processor.processExtractedData(dupReceipt, "Gmail", null); // first pass
    var dupThrew = false;
    var sameReceipt = makeReceipt_({ // exact same details
      vendor: "Tim Hortons", date: "2025-06-09",
      subtotal: 5.00, gst_hst: 0.65, total: 5.65
    });
    try {
      Processor.processExtractedData(sameReceipt, "Gmail", null);
    } catch (e) {
      dupThrew = (e.message === "DUPLICATE");
    }
    assert_(r, "Duplicate receipt throws DUPLICATE error", dupThrew);

    // ── 10. Required fields validation ────────────────────────────────────
    resetHashes();
    var missingField = { vendor: "Test", total: 10.00, currency: "CAD" }; // missing date
    var missingThrew = false;
    try {
      Processor.processExtractedData(missingField, "Gmail", null);
    } catch (e) {
      missingThrew = e.message.indexOf("Missing required field") !== -1;
    }
    assert_(r, "Missing required field throws error", missingThrew);

    // ── 11. QST note for Quebec ───────────────────────────────────────────
    resetHashes();
    props.setProperty("PROVINCE", "QC");
    var qcReceipt = makeReceipt_({
      vendor: "Bell Québec", date: "2025-06-10",
      subtotal: 100.00, gst_hst: 5.00, pst_qst: 9.98, total: 114.98
    });
    var qcResult = Processor.processExtractedData(qcReceipt, "Gmail", null);
    assert_(r, "QST note added for QC province",
      qcResult.data.notes.indexOf("QST") !== -1);
    assert_(r, "QST itc_qst field set",
      qcResult.data.itc_qst !== undefined && qcResult.data.itc_qst > 0);
    props.setProperty("PROVINCE", "ON"); // reset

  } finally {
    // Clean up DEV_MODE
    props.deleteProperty("DEV_MODE");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: License Key Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tests the LICENSE_KEY_PATTERN regex from Config.gs for valid and invalid formats.
 * @param {Object} r - results accumulator
 */
function testLicenseKeyFormat_(r) {
  // Valid keys (alphabet: A-Z except O,I; 2-9 except 0,1)
  var validKeys = [
    "CORE-ABCDE-FGHJK-LMNPQ",
    "CORE-22222-33333-44444",
    "CORE-ZZZZZ-99999-YYYYY",
    "CORE-A2B3C-D4E5F-G6H7J"
  ];

  // Invalid keys
  var invalidKeys = [
    "CORE-ABCDE-FGHJK-LMNP",      // too short (last segment 4 chars)
    "CORE-ABCDE-FGHJK-LMNPQR",    // too long
    "core-abcde-fghjk-lmnpq",     // lowercase
    "CORE-ABCDE-FGHJK",           // only 2 segments
    "LITE-ABCDE-FGHJK-LMNPQ",     // wrong prefix
    "CORE-ABCDE-FGHJK-LMNP0",     // contains 0
    "CORE-ABCDE-FGHJK-LMNPI",     // contains I
    "CORE-ABCDE-FGHJK-LMNPO",     // contains O
    "CORE-ABCDE-FGHJK-LMNP1",     // contains 1
    ""                             // empty
  ];

  for (var i = 0; i < validKeys.length; i++) {
    assert_(r, "Valid key accepted: " + validKeys[i],
      LICENSE_KEY_PATTERN.test(validKeys[i]));
  }

  for (var j = 0; j < invalidKeys.length; j++) {
    var label = invalidKeys[j] === "" ? "(empty string)" : invalidKeys[j];
    assert_(r, "Invalid key rejected: " + label,
      !LICENSE_KEY_PATTERN.test(invalidKeys[j]));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asserts a boolean condition is true.
 * @param {Object} r    - results accumulator
 * @param {string} name - human-readable test name
 * @param {boolean} ok  - condition to check
 */
function assert_(r, name, ok) {
  if (ok) {
    r.passed++;
    Logger.log("  ✓ " + name);
  } else {
    r.failed++;
    r.errors.push(name);
    Logger.log("  ✗ FAIL: " + name);
  }
}

/**
 * Asserts two values are strictly equal.
 * @param {Object} r        - results accumulator
 * @param {string} name     - human-readable test name
 * @param {*}      actual   - value under test
 * @param {*}      expected - expected value
 */
function assertEqual_(r, name, actual, expected) {
  var ok = (actual === expected);
  if (ok) {
    r.passed++;
    Logger.log("  ✓ " + name);
  } else {
    r.failed++;
    r.errors.push(name + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")");
    Logger.log("  ✗ FAIL: " + name + " — got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected));
  }
}

/**
 * Builds a minimal valid receipt object for Processor tests.
 * All fields not supplied default to safe non-breaking values.
 * @param {Object} overrides - Fields to set or override
 * @returns {Object} Synthetic AI receipt JSON
 */
function makeReceipt_(overrides) {
  var defaults = {
    date:              "2025-01-01",
    vendor:            "Test Vendor",
    cra_category_code: "8810",
    cra_category_name: "Office Expenses",
    subtotal:          10.00,
    gst_hst:           1.30,
    pst_qst:           0,
    total:             11.30,
    currency:          "CAD",
    expense_type:      "Business",
    is_meal:           false,
    is_gift:           false,
    is_capital:        false,
    confidence:        "high",
    notes:             ""
  };
  var receipt = {};
  for (var k in defaults) receipt[k] = defaults[k];
  for (var key in overrides) receipt[key] = overrides[key];
  return receipt;
}
