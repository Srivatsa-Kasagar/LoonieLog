# LoonieLog — Testing Guide

This document covers how to test LoonieLog at each stage of development and deployment.
No Stripe account, license server, or Marketplace listing is required for most tests.

---

## Quick Reference

| Stage | What you need | Time |
|---|---|---|
| Unit tests (TestRunner) | Apps Script project + Sheet | 5 min |
| Install flow | Apps Script project + Sheet | 10 min |
| AI parsing (Gmail) | Gmail account + Gemini API key | 15 min |
| AI parsing (Drive) | Drive folder + receipt image | 10 min |
| License activation | License server deployed | 20 min |
| End-to-end full run | All of the above | 30 min |

---

## 1. Initial Setup

### 1.1 Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Rename the project to `LoonieLog`
3. In **Project Settings** (gear icon) → check **Show `appsscript.json`**

### 1.2 Copy source files

Create one file per `.gs` file in the project (use `+` → Script):

```
Code.gs
Config.gs
Installer.gs
GmailHunter.gs
DriveScanner.gs
AIRouter.gs
CurrencyConverter.gs
Processor.gs
SheetLogger.gs
TierManager.gs
LicenseManager.gs
TestRunner.gs       ← add this too
```

Also copy the three `.html` files:
```
Sidebar.html
Dashboard.html
ActivateLicense.html
```

Replace the contents of `appsscript.json` with the project's `appsscript.json`.

### 1.3 Bind to a Google Sheet

1. Open (or create) a Google Sheet
2. Extensions → Apps Script — this opens the bound editor
3. Paste all files there instead of a standalone project

> **Tip:** A bound script is required. `SpreadsheetApp.getActiveSpreadsheet()` will
> fail in a standalone script.

---

## 2. Running the Unit Test Suite

### 2.1 Run all tests

1. In the Apps Script editor, open `TestRunner.gs`
2. Select `runAllTests` from the function dropdown
3. Click **Run**
4. Click **View → Logs** (or `Cmd+Enter`) to see results

**Expected output:**
```
══════════════════════════════════════════
  LoonieLog Test Suite
══════════════════════════════════════════

── Config ──
  ✓ Province ON exists
  ✓ ON gst_rate
  ✓ ON provincial_rate
  ...

── CurrencyConverter ──
  ✓ BOC API returns a rate for 2025-01-15
  ✓ BOC rate is a positive number
  ...

── TierManager ──
  ✓ Default tier is micro
  ...

── Processor Rules ──
  ✓ Meals deductible_amt = 50% of total
  ...

── License Key Format ──
  ✓ Valid key accepted: CORE-ABCDE-FGHJK-LMNPQ
  ...

══════════════════════════════════════════
  PASSED: 52  |  FAILED: 0
══════════════════════════════════════════
```

### 2.2 What each suite tests

| Suite | What it covers |
|---|---|
| **Config** | Province GST/HST/PST rates for ON, BC, AB, QC, MB, SK, NB, NS. CRA category codes 8521, 8523, 8810, 8860, 9200, 9270, 9281, WFH |
| **CurrencyConverter** | Live BOC API call, rate caching in PropertiesService, weekend/holiday rollback, conversion math, 2-decimal rounding |
| **TierManager** | Default tier (micro), invalid value fallback, setUserTier persistence, getTierSummary fields, Managed Pro unlimited flags, AI mode routing |
| **Processor Rules** | Meals 50% rule (ITA s.67.1), regular ITC, personal expense zeroing, WFH → Needs Review, gift → Review + 8521, missing GST flag, QST note for QC, low-confidence routing, dedup hash, duplicate detection, required field validation |
| **License Key Format** | CORE-XXXXX-XXXXX-XXXXX regex: valid keys pass, invalid keys rejected (wrong prefix, wrong length, forbidden chars 0/O/1/I, lowercase) |

### 2.3 First-run authorization

The first run will prompt for OAuth consent. Click **Review permissions** →
select your Google account → **Allow**. The script needs:
- Gmail (read labels)
- Drive (read/write folders)
- Sheets (read/write spreadsheet)
- External requests (UrlFetchApp for BOC API)

---

## 3. Install Flow Test

Run this once after initial setup to create all required sheet tabs, Drive folders,
and Gmail labels.

### Steps

1. Set Script Properties manually (Project Settings → Script Properties):

| Key | Value |
|---|---|
| `API_KEY` | Your Gemini API key (get free at [aistudio.google.com](https://aistudio.google.com)) |
| `AI_MODEL` | `gemini` |
| `PROVINCE` | Your 2-letter province code e.g. `ON` |

2. In the editor, run `installLoonieLog()`
3. Open the Google Sheet

**Verify:**
- [ ] 5 tabs created: `Expenses`, `Needs Review`, `Summary`, `Audit Log`, `Settings`
- [ ] Column headers present in Expenses tab (A–S)
- [ ] `Audit Log` has at least one row with status `OK`
- [ ] In Gmail: label `To_Log` (or `loonielog/To_Log`) exists
- [ ] In Drive: folders `LoonieLog Receipts`, `Unprocessed`, `Archive/2026` exist
- [ ] `Settings` tab shows PROVINCE and AI_MODEL values
- [ ] In Sheet: Extensions menu has **LoonieLog** with all menu items

---

## 4. Sidebar (Onboarding Wizard) Test

1. Open the Sheet → **LoonieLog → Setup**
2. Verify the dark-themed 3-step wizard loads
3. Step 1: Enter a Gemini API key → click Next
4. Step 2: Select province → click Next
5. Step 3: Confirm and complete setup

**Verify:**
- [ ] Logo and dark theme render correctly
- [ ] API key is masked (password field)
- [ ] Province dropdown has all 13 provinces
- [ ] Completion writes `INSTALL_COMPLETE=true` to Script Properties

---

## 5. Dashboard Test

1. **LoonieLog → Dashboard**
2. Verify all stat widgets load

**Verify:**
- [ ] Dark theme renders — no white flash
- [ ] "Last Run" shows `Never` or a timestamp
- [ ] Tier usage bar shows `Micro plan` with `8 receipts left`
- [ ] No JavaScript errors in browser console (`Cmd+Option+J`)
- [ ] "Run Now" button triggers `runProcessor()`
- [ ] "Scan Past Emails" button works (calls `huntPastReceipts`)

---

## 6. Gmail Receipt Processing Test

### 6.1 Prepare a test email

1. Forward a real receipt email (Amazon, Shopify, any store) to yourself
2. In Gmail, apply the `To_Log` label to that email thread

### 6.2 Run the scanner

In the Apps Script editor, run `GmailHunter.huntGmailReceipts()` directly,
or use **LoonieLog → Run Now**.

**Verify:**
- [ ] Row appears in `Expenses` tab (or `Needs Review` if confidence is low)
- [ ] All 19 columns populated — Date, Vendor, CRA code, amounts, etc.
- [ ] `Audit Log` has `GmailHunter` entries with `OK` status
- [ ] Gmail thread now has `loonielog-processed` label applied
- [ ] Running the same email again produces no new row (dedup works)

### 6.3 Non-receipt email test

1. Apply `To_Log` to a marketing/shipping email (e.g. a tracking update)
2. Run `GmailHunter.huntGmailReceipts()`
3. Verify: no row written to sheet, `Audit Log` shows `SKIPPED_NON_RECEIPT`

---

## 7. Drive Receipt Processing Test

### 7.1 Drop a receipt into Drive

1. Open Drive → navigate to the `LoonieLog Receipts / Unprocessed` folder
2. Upload a receipt image (`.jpg`, `.png`, or `.pdf`)
   - Use a real Canadian receipt with GST/HST for best results

### 7.2 Run the scanner

Run `DriveScanner.scanDriveFolder()` in the editor.

**Verify:**
- [ ] Row appears in `Expenses` or `Needs Review` tab
- [ ] Drive URL in column N is a valid `drive.google.com` link
- [ ] File renamed to `YYYY-MM-DD_VendorName_$Total.ext` format
- [ ] File moved from `Unprocessed` to `Archive/2026` folder
- [ ] Dropping a HEIC file logs a `WARN` and does NOT write a row

---

## 8. USD Receipt Test

1. Find or create a USD receipt (AWS, Figma, GitHub — any US vendor)
2. Process it via Gmail or Drive (steps 6 or 7 above)

**Verify:**
- [ ] Columns E–H contain CAD amounts (converted)
- [ ] Column K shows `USD`
- [ ] Column Q shows original USD total
- [ ] Column R shows BOC exchange rate (e.g. `1.4456`)
- [ ] Column S shows the rate date
- [ ] Notes column contains `"USD $X → CAD $Y @ BOC rate Z"`

---

## 9. Tier Limit Test

1. Manually insert 8 rows with today's date into the `Expenses` tab (column A)
2. Try processing one more receipt
3. Verify: alert dialog appears — "Monthly Limit Reached — Micro Plan"
4. Verify: no 9th row is written

To reset: delete the dummy rows, or run:
```javascript
// In Apps Script console
PropertiesService.getUserProperties().deleteProperty("USER_TIER");
```

---

## 10. License Activation Test

> Requires the license server to be deployed first (see SETUP.md §2).

### 10.1 Manual server test (no Stripe needed)

1. Open the license server's Apps Script project
2. Manually add a test row to the `Licenses` sheet:
   - Key: `CORE-TEST2-TEST3-TEST4`
   - Status: `active`
   - Email: your email
3. In LoonieLog: **LoonieLog → Activate License Key**
4. Enter `CORE-TEST2-TEST3-TEST4`

**Verify:**
- [ ] Loading spinner appears
- [ ] Success state shows "Core DIY Activated!"
- [ ] Dialog closes after 2.5 seconds
- [ ] `USER_TIER` in Script Properties is now `core`
- [ ] Dashboard tier bar shows `Core DIY — 50 receipts left`

### 10.2 Invalid key test

1. Open the Activate License dialog
2. Enter `CORE-XXXXX-XXXXX-XXXXX`

**Verify:**
- [ ] Red error banner: "License key not found"
- [ ] Button re-enables — user can try again

### 10.3 Key format validation (client-side)

1. Open the Activate License dialog
2. Enter `ABC123` (wrong format)

**Verify:**
- [ ] Error shown immediately (before any server call):
      "Invalid key format. It should look like CORE-XXXXX-XXXXX-XXXXX."

---

## 11. Automated Trigger Test

1. Ensure `installLoonieLog()` has run (creates a daily 6 AM trigger)
2. In Apps Script → **Triggers** (clock icon)

**Verify:**
- [ ] One trigger exists: `runProcessor` → Time-driven → Day timer → 6 AM–7 AM
- [ ] No duplicate triggers

To test the trigger fires correctly without waiting until 6 AM:
1. Edit the trigger → change to "Every minute"
2. Wait 1–2 minutes
3. Check `Audit Log` for a new `runProcessor` entry
4. Change trigger back to daily

---

## 12. Prompt Override Test

1. In Script Properties, set:
   - Key: `CRA_PROMPT_OVERRIDE`
   - Value: (paste a modified version of the CRA prompt with a unique test string)
2. Process any receipt
3. Check that the AI response reflects the custom prompt behaviour

To reset: delete the `CRA_PROMPT_OVERRIDE` property.

---

## 13. Common Failures & Fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `SpreadsheetApp.getActiveSpreadsheet() is null` | Script not bound to a Sheet | Use a bound project, not standalone |
| `Authorization required` on first run | OAuth not granted | Click "Review permissions" and allow |
| `BOC API returns null` | Weekend date + all 3 rollbacks failed | Try a known weekday like `2025-01-15` |
| Duplicate rows on every run | `PROCESSED_HASHES_0` property missing | Run `Processor.clearAllHashes()` (needs `DEV_MODE=true`) |
| `GmailHunter.huntGmailReceipts is not a function` | Calling IIFE method directly | Use the global wrapper `huntPastReceipts()` |
| Dashboard shows blank tier bar | `getDashboardData()` not returning tier fields | Verify `TierManager.getTierSummary()` returns all fields |
| HEIC file not rejected | DriveScanner not checking mimeType | Ensure DriveScanner.gs has the HEIC guard |
| `LICENSE_SERVER_URL` is placeholder | Config.gs not updated | Replace `LICENSE_SERVER_DEPLOYMENT_ID` in Config.gs after deploying license server |

---

## 14. Test Data Cleanup

After testing, clean up to avoid polluting your real data:

```javascript
// Run in Apps Script editor to reset all state

function devReset() {
  // 1. Clear all script properties (WARNING: deletes API key too — re-enter it after)
  PropertiesService.getUserProperties().deleteAllProperties();

  // 2. Clear all sheet tabs except headers
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ["Expenses", "Needs Review", "Audit Log"].forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  });

  Logger.log("Dev reset complete. Re-enter API_KEY and PROVINCE in Script Properties.");
}
```

> **Warning:** `devReset()` deletes your API key. After running it, go to
> Project Settings → Script Properties and re-add `API_KEY`, `AI_MODEL`, and `PROVINCE`.
