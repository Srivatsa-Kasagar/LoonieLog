# LoonieLog — Progress Report

**Last updated: 2026-03-29**

---

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| Phase 1 — Core | `Config.gs`, `Installer.gs`, `Sidebar.html`, `Code.gs` | ✅ Complete |
| Phase 2 — Intelligence | `AIRouter.gs`, `Processor.gs`, `SheetLogger.gs`, `CurrencyConverter.gs` | ✅ Complete |
| Phase 3 — Ingestion | `GmailHunter.gs`, `DriveScanner.gs` | ✅ Complete |
| Phase 4 — Polish | `Dashboard.html`, Summary tab, Settings.html, UpgradePrompt.html | ✅ Complete |
| Beyond HLD | `TierManager.gs`, `LicenseManager.gs`, `ActivateLicense.html`, `TestRunner.gs`, `license-server/`, `index.html`, `privacy.html`, `terms.html` | ✅ Complete |

All code is written. The add-on is functionally complete for the copy-sheet MVP install flow.

---

## What Was Fixed / Added (this session)

| Item | Status |
|---|---|
| License server URL mismatch (`Config.gs` vs `SETUP.md`) | ✅ Fixed — both now point to `AKfycbwI...` |
| `TEMPLATE_ID` in `index.html` | ✅ Fixed — set to `1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI` |
| All marketplace links in `index.html` | ✅ Replaced — copy-sheet is now primary CTA |
| Core DIY pricing button (`STRIPE_PAYMENT_LINK_URL`) | ✅ Replaced — "Coming Soon" + waitlist email |
| Summary tab only read `Expenses` tab | ✅ Fixed — now reads both `Expenses` + `Needs Review` |
| Summary tab only showed current month | ✅ Fixed — now shows YTD T2125 totals + current month |
| `📋 Refresh Summary Tab` menu item | ✅ Added — no longer need to run a scan to refresh |
| Drive PDFs skipped as non-receipt | ✅ Fixed — `is_receipt: false` overridden for Drive files |
| JSON truncation in Drive scan | ✅ Fixed — `maxOutputTokens` bumped to 2048 |
| Claude API 404 (deprecated model) | ✅ Fixed — updated to `claude-sonnet-4-6` |
| Uber Eats categorised as "other" | ✅ Fixed — mapped to 8523 in CRA prompt |
| Dark theme in Sheets UI | ✅ Fixed — all sidebar/dialog HTML now uses Google Workspace light theme |
| Dashboard width toggle | ✅ Added — `⟷` button reopens at 600px / 380px |
| `🔧 Change Settings` menu item | ✅ Added — switch AI model or API key post-install |
| `⭐ Upgrade to Core DIY` menu item | ✅ Redesigned — proper modal with plan cards + usage bar |
| Waitlist signup in UpgradePrompt | ✅ Added — email + plan chip → posts to license server |
| License server `action=waitlist` endpoint | ✅ Added — logs to `Waitlist` tab in Licenses spreadsheet |
| `joinWaitlist()` in `Code.gs` | ✅ Added — called by UpgradePrompt modal |

---

## Testing Progress

| Test Area | Status | Notes |
|---|---|---|
| Install flow | ✅ Done | Ran setup with Gemini key |
| Gmail receipt scanning | ✅ Done | Tested in email account |
| Drive receipt processing | ✅ Done | File processed via DriveScanner |
| USD receipt + BOC conversion | ✅ Done | BOC rate fetched, CAD conversion verified |
| License server deployment | ✅ Done | Running at `AKfycbwI...` URL |
| License activation (add-on → server) | ✅ Done | Test key verified from within the add-on |
| Waitlist endpoint | ✅ Done | `testWaitlist()` returns `{"success":true}` in editor |
| Summary tab YTD | ✅ Done | Reads both tabs, shows YTD + current month |
| Tier limit enforcement | ⬜ Not confirmed | **TODO:** Insert 8 rows, try a 9th — verify alert fires |
| Stripe checkout (test mode) | ⬜ Blocked | **NEXT:** Stripe not configured yet |
| Full end-to-end run | ⬜ Blocked | Needs Stripe first |

---

## Deployment Progress

| Step | Status | Notes |
|---|---|---|
| License server deployed | ✅ Done | `AKfycbwIxHOA0oNtgf5bFlyeODlyKgrCyHdNy5wHOs49x1R9mOV56rHG5mkTCyWF6yXh-UU1` |
| `action=waitlist` deployed to server | ✅ Done | Redeployed with new version |
| Template sheet created & published | ✅ Done | ID: `1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI` |
| `index.html` copy-sheet CTA live | ✅ Done | Points to template sheet |
| Stripe configured | ⬜ Not started | **NEXT ACTION — see SETUP.md §3** |
| loonielog.ca hosting | ⬜ Not started | Netlify + DNS — see SETUP.md §6 |
| Marketplace listing | ⬜ Post-MVP | 4–6 week scope review — start early |

---

## Remaining P1 Blockers (before first paying user)

| # | Issue | Action |
|---|---|---|
| 1 | **Stripe not configured** — No product, payment link, or webhook. Core DIY can't be purchased. | SETUP.md §3 |
| 2 | **`loonielog.ca` not live** — Copy-sheet flow works but upgrade links, update check, and icons are dead. | SETUP.md §6 |
| 3 | **`updates/prompt-version.json` missing** — "Check for Updates" errors for all users. | SETUP.md §6.2 |
| 4 | **`icon-128.png` / `icon-512.png` missing** — Required for Marketplace; referenced in `appsscript.json`. | SETUP.md §6.3 |
| 5 | **Tier limit test not confirmed** — Tier limit at 8 receipts not verified end-to-end. | Run manually |
| 6 | **License emails from personal Gmail** — Customers see personal address as sender. Fine for MVP testing, fix before public launch. | SETUP.md §9 |

---

## Post-MVP Backlog

| Priority | Task |
|---|---|
| P1 | Replace `DEVELOPER_AI_ENDPOINT` placeholder in `Config.gs` (required for Managed Pro) |
| P2 | Periodic license re-verification (monthly trigger — passive enforcement gap) |
| P2 | 75% usage warning toast |
| P2 | Managed Pro path in Sidebar (no API key required) |
| P2 | "Reset LoonieLog" menu item (currently DEV_MODE gated) |
| P3 | Stripe Payment Link in `index.html` Core DIY button (replace "Coming Soon" when Stripe is live) |
| P3 | Managed Pro "Coming Soon" → real payment link when Managed Pro launches |
| P3 | Increase Gmail body limit in `GmailHunter.gs` (currently 3000 chars — truncates long Amazon emails) |
| P3 | Marketplace listing (post-MVP, 4–6 week review timeline — start OAuth consent screen early) |

---

## Critical Path to First Paying User

```
Stripe setup (§3) → End-to-end test (§8) → loonielog.ca live (§6) → Go-live cutover (§9)
```

Marketplace can run in parallel with all of the above — submit the OAuth consent screen as early as possible given the 4–6 week scope review.
