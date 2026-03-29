# 🍁 LoonieLog

**AI-powered expense tracking for Canadian freelancers — built inside Google Sheets.**

LoonieLog is a Google Sheets add-on that acts as a mini AI agent. It hunts receipts from your Gmail and Google Drive, extracts CRA T2125 data using AI, applies Canadian tax rules automatically, and logs everything to a spreadsheet — while you sleep.

---

## What it does

- **Hunts receipts** — scans your Gmail `To_Log` label and a Drive folder for new receipts
- **Extracts structured data** — vendor, date, subtotal, GST/HST, PST/QST, total, currency
- **Applies CRA T2125 rules** — maps every expense to the correct line code (8523 Meals, 9270 SaaS, 9281 Motor Vehicle, etc.)
- **Calculates deductions** — 50% meals rule, ITC eligibility, PST non-recoverability by province
- **Converts USD → CAD** — uses Bank of Canada Valet API rates, audit-proof for CRA
- **Flags ambiguous expenses** — routes low-confidence receipts to a Needs Review tab
- **Runs automatically** — daily trigger at 2am, or run manually from the menu

---

## Who it's for

Canadian sole proprietors and freelancers who:
- Receive receipts by email (Uber Eats, AWS, Slack, Shopify, Starbucks…)
- Drop PDFs and images into a Drive folder
- File a T2125 (Statement of Business Activities) each year
- Are tired of losing receipts or missing deductions

---

## How to install

> **No Marketplace listing yet** — install via Google Sheets copy link.

1. Click **[Copy to Google Sheets — Free](https://docs.google.com/spreadsheets/d/1VCnk8SgKQVFiGO0kbTxlBA12fgF8Z8Ujlzx-2SWnmAI/copy)**
2. Google will ask you to make a copy → confirm
3. Open your new sheet → click **🚀 LoonieLog** in the menu bar
4. Click **⚙️ Initialize Agent** and follow the 3-step setup:
   - Choose your AI model (Gemini 2.5 Flash — free, or Claude Sonnet 4.6)
   - Enter your API key
   - Select your province
5. Done — your first scan runs at 2am, or click **▶️ Run Now**

---

## Sheet tabs

| Tab | What's in it |
|---|---|
| **Expenses** | Every processed receipt — 19 columns, auto-formatted |
| **Needs Review** | Low-confidence or ambiguous receipts — flagged for your attention |
| **Summary** | YTD T2125 filing totals + category breakdown + current month snapshot |
| **Audit Log** | Append-only log of every action the agent takes |
| **Settings** | Your current config — AI model, province, last run time |

---

## Expense columns

All monetary values are stored in **CAD**. USD receipts are converted at the Bank of Canada rate for the receipt date.

`Date · Vendor · CRA Code · CRA Category · Subtotal · GST/HST · PST/QST · Total · Deductible · ITC Eligible · Currency · Expense Type · Source · Drive URL · Logged At · Status · Original USD · BOC Rate · Rate Date`

---

## AI models supported

| Model | Cost | Setup |
|---|---|---|
| **Gemini 2.5 Flash** | Free tier available | [Get API key ↗](https://aistudio.google.com/app/apikey) |
| **Claude Sonnet 4.6** | Pay-per-use | [Get API key ↗](https://console.anthropic.com/account/keys) |

Your API key is stored in Google's `PropertiesService` — never in the sheet, never transmitted anywhere except the AI provider you choose.

---

## Plans

| Plan | Price | Receipts/month |
|---|---|---|
| **Micro** | Free | 8 |
| **Core DIY** | $4.99 CAD/mo | 50 |
| **Managed Pro** | $14.99 CAD/mo | Unlimited |

Core DIY and Managed Pro are coming soon. [Join the waitlist →](https://loonielog.ca/#pricing)

---

## Privacy

- Your receipt data never leaves your Google account
- AI providers (Google / Anthropic) receive only the receipt content — no names, account numbers, or personal identifiers beyond what's on the receipt itself
- No external database — everything lives in your own Google Sheet and Drive
- Full details: [loonielog.ca/privacy.html](https://loonielog.ca/privacy.html)

---

## Tech stack

- **Runtime:** Google Apps Script (V8) — no Node.js, no npm, no external dependencies
- **AI:** Gemini 2.5 Flash via Google AI API · Claude Sonnet 4.6 via Anthropic API
- **FX rates:** Bank of Canada Valet API — free, no auth, CRA-accepted
- **Storage:** Google Sheets + Google Drive + Apps Script PropertiesService
- **Hosting:** Netlify (landing page)

---

## Provinces supported

All 13 Canadian provinces and territories — correct GST, HST, PST, QST rates applied automatically based on your province setting.

---

## Roadmap

- [x] Gmail receipt scanning
- [x] Google Drive PDF/image scanning
- [x] Gemini 2.5 Flash + Claude Sonnet 4.6 support
- [x] USD → CAD conversion (Bank of Canada rates)
- [x] CRA T2125 category mapping (all provinces)
- [x] ITC calculation
- [x] License key activation
- [x] Tier-based receipt limits
- [ ] Stripe billing (Core DIY — coming soon)
- [ ] Google Workspace Marketplace listing
- [ ] Managed Pro (no API key required)
- [ ] One-click audit ZIP for accountant

---

## Support

[hello@loonielog.ca](mailto:hello@loonielog.ca)

---

*Built with 🍁 in Canada · Not affiliated with the CRA*
