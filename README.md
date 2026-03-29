# 🍁 LoonieLog

### AI-powered receipt tracking for Canadian freelancers — built inside Google Sheets.

> Stop losing receipts. Stop missing deductions. Stop paying your accountant to sort through your Gmail.

**[→ Get Started Free](https://docs.google.com/spreadsheets/d/1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI/copy)** · **[Full Demo & Pricing](https://srivatsa-kasagar.github.io/LoonieLog)**

---

## The problem it solves

If you're a Canadian freelancer, every tax season looks something like this:

- Digging through 12 months of Gmail for Uber Eats and AWS receipts
- Googling "is this GST or HST" for the 40th time
- Guessing which T2125 line an Adobe subscription goes on
- Wondering if you actually claimed everything you were entitled to

LoonieLog is an AI agent that lives inside your Google Sheets. It hunts your receipts, applies CRA rules automatically, and logs everything — while you sleep.

---

## What it does

| | |
|---|---|
| 📬 **Hunts receipts** | Scans your Gmail `To_Log` label and a Drive folder for new receipts — automatically |
| 🤖 **Extracts structured data** | Vendor, date, subtotal, GST/HST, PST/QST, total, currency — using AI |
| 🇨🇦 **Applies CRA T2125 rules** | Maps every expense to the correct line code: 8523 Meals, 9270 SaaS, 9281 Motor Vehicle… |
| 💸 **Calculates deductions** | 50% meals rule, ITC eligibility, PST non-recoverability — by province |
| 💱 **Converts USD → CAD** | Uses Bank of Canada Valet API rates — audit-proof for CRA |
| 🚩 **Flags ambiguous expenses** | Low-confidence receipts go to a Needs Review tab — nothing slips through |
| ⏰ **Runs automatically** | Daily trigger at 2am, or kick it off manually from the menu |

---

## Setup in 2 minutes

> No Marketplace listing yet — install via Google Sheets copy link.

1. **[Copy to Google Sheets — Free →](https://docs.google.com/spreadsheets/d/1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI/copy)**
2. Open your new sheet → click **🚀 LoonieLog** in the menu bar
3. Click **⚙️ Initialize Agent** and follow the 3-step setup:
   - Choose your AI model (Gemini 2.5 Flash — free, or Claude Sonnet 4.6)
   - Enter your API key
   - Select your province
4. Done. Your first scan runs at 2am, or click **▶️ Run Now**

---

## Your data stays yours

- Everything lives in **your** Google Sheet and Drive — no external database
- AI providers receive only receipt content — no names, account numbers, or identifiers
- API keys stored in Google's encrypted `PropertiesService` — never in the sheet
- Full details: [Privacy Policy](https://srivatsa-kasagar.github.io/LoonieLog/privacy.html)

---

## What's inside the sheet

| Tab | What's in it |
|---|---|
| **Expenses** | Every processed receipt — 19 columns, auto-formatted |
| **Needs Review** | Low-confidence or ambiguous receipts flagged for your attention |
| **Summary** | YTD T2125 filing totals + category breakdown + current month snapshot |
| **Audit Log** | Append-only log of every action the agent takes |
| **Settings** | Your current config — AI model, province, last run time |

All monetary values stored in **CAD**. USD receipts converted at the Bank of Canada rate for the receipt date.

---

## CRA T2125 categories covered

`8521 Advertising · 8523 Meals & Entertainment · 8710 Interest & Bank Charges · 8810 Office Expenses · 8860 Professional Fees · 8910 Rent · 9200 Travel · 9220 Telephone & Utilities · 9270 Other Business Expenses · 9281 Motor Vehicle · 9936 CCA · WFH Home Office`

All 13 Canadian provinces — correct GST, HST, PST, QST rates applied automatically.

---

## AI models supported

| Model | Cost | Notes |
|---|---|---|
| **Gemini 2.5 Flash** | Free tier available | Recommended for most users |
| **Claude Sonnet 4.6** | Pay-per-use | Higher accuracy on complex receipts |

---

## Tech stack

```
Runtime   → Google Apps Script (V8) — no Node.js, no npm, no external deps
AI        → Gemini 2.5 Flash (Google AI) · Claude Sonnet 4.6 (Anthropic)
FX rates  → Bank of Canada Valet API — free, CRA-accepted
Storage   → Google Sheets + Drive + Apps Script PropertiesService
Hosting   → GitHub Pages (this landing page)
```

---

## Pricing

**Free to start** — no credit card, no signup, works with your existing Google account.

Paid plans available for higher volumes and upcoming managed hosting.
→ [See pricing](https://srivatsa-kasagar.github.io/LoonieLog/#pricing)

---

## Roadmap

- [x] Gmail receipt scanning
- [x] Google Drive PDF/image scanning
- [x] Gemini 2.5 Flash + Claude Sonnet 4.6 support
- [x] USD → CAD conversion (Bank of Canada rates)
- [x] CRA T2125 category mapping (all 13 provinces)
- [x] ITC + GST/HST calculation
- [x] License key activation
- [ ] Stripe billing (coming soon)
- [ ] Google Workspace Marketplace listing
- [ ] Managed Pro — no API key required
- [ ] One-click audit ZIP for your accountant

---

## Support

[Contact LoonieLog](mailto:srivatsa.kasagar@outlook.com?subject=LoonieLog%20Support)

---

*Built with 🍁 in Canada · Not affiliated with the CRA*
