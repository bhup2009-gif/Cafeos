# CaféOS

A working local café POS built with Next.js 16, React 19, TypeScript, Tailwind, Lucide, Zod and transactional SQLite. It serves **one café outlet**. The repository includes a PostgreSQL/Prisma reference design, but that adapter is not connected to the running app.

You can also double-click `Start-CafeOS.command` to launch the built app on this Mac when no server is already running.

## Open the app

http://127.0.0.1:3100

Starter account IDs are `owner`, `manager`, `cashier`, `barista`. Their generated random passwords are in `data/starter-credentials.txt` (readable only by your OS account). Change each through Staff → Change password before operational use. No account uses a published default password unless the explicit test-only environment variable is set.

## Run locally

Requires Node.js **24.15+** (native SQLite).

```sh
npm install
npm run dev
```

Dependencies are declared in `package.json`; no lockfile was available in the original workspace.

```sh
npm run test
npm run typecheck
npm run build
npm start
```

HTTP integration checks require a running server and its generated accounts:

```sh
CAFEOS_TEST_URL=http://127.0.0.1:3100 npm test
```

The optional `npm run test:e2e` uses the existing REA checkout to run a fresh-browser cash checkout. It creates synthetic demo data and expects the original generated owner password. Its macOS SDK/browser paths are specific to this machine.

`CAFEOS_DATA_DIR` selects a separate database directory. `CAFEOS_DEMO_PASSWORD` sets starter account passwords only on a **fresh** database, for disposable automated tests. Never set it for operational data.

## What works

- Search, categories, one-tap defaults, size/add-ons/notes, quantities, line removal before kitchen dispatch.
- Dine-in table occupancy, takeaway and delivery pickup; hold/resume orders.
- Server-authorized discounts; integer-paise line tax and proportional discount allocation.
- Cash, staff-confirmed UPI/card, split payment records, invoice numbers and printable receipts/browser Save PDF.
- Incremental station tickets, New → Preparing → Ready → Served; sent items locked against destructive edits.
- Recipe stock consumption at dispatch; retries do not consume stock twice. Failed dispatch rolls back all changes.
- Menu creation/editing, category names, variants/add-ons/recipe configuration, image uploads, availability and a bundled combo example.
- Purchases, adjustments, wastage, low-stock rules, paid-sales consumption estimate with a 20% buffer.
- Live daily sales, best sellers, payment breakdown, hourly chart, discounts/refunds and cash closing discrepancy records.
- Four server-enforced roles, salted password hashing, opaque HttpOnly sessions, CSRF origin checks, account throttling, password change/session revocation and audit entries.
- Customer-name-based loyalty point tracking and deterministic business questions.
- IndexedDB drafts, browser restart recovery, local pending holds, explicit sync and server version conflict rejection.

## Limits: read before operational use

This is an operational **local MVP**, not a complete production replacement for Petpooja. No claim of faster real-world operation or feature superiority has been measured.

- PostgreSQL/Prisma is a reference schema/migration only. SQLite is the tested runtime. No shadcn dependency was installed; accessible reusable local controls implement the UI.
- Single outlet, four starter staff accounts. Staff provisioning, multi-outlet isolation and cloud synchronization are not implemented.
- UPI/card receipts and full refunds are manual external confirmations, not gateway verification or actual money transfers. Card credentials are never stored.
- Split payment is implemented; separate item-wise split invoices, table merging and partial refunds are not.
- The tax seed is explicitly demo configuration. This receipt lacks validated GST registration/legal invoice particulars. No statutory compliance is claimed.
- Offline **drafts and holds** work on a previously loaded browser. Payment, stock and kitchen actions require the local server. No offline settlement, service-worker background sync, or silent payment verification.
- Cached local draft/snapshot data is not encrypted. Signing out removes the automatic offline account pointer; local data remains on that browser for recovery. Use a trusted device/profile.
- Recipe quantity handling is in 0.001 units. Size and the named milk/shot/cheese adjustments use explicit demo rules. Generic modifier-to-recipe mapping and a visual combo builder are not implemented.
- The combo example uses one shared line on both station tickets. Ticket contents name the pairing; staff coordinate each station's part. Hardware printer routing is not connected.
- Loyalty tracks points only. Redemption, stable customer phone identity and advanced customer merging are not implemented.
- Refunds are attributed to the original sale date in the current sales report. Day closing is a repeatable cash count snapshot, not an immutable accounting period lock. Opening float and provider reconciliation are excluded. Recorded pantry cash purchases, expenses and supplier payments are deducted from expected closing cash.
- No trained AI, voice ordering, aggregator API, real-time bank reconciliation or WhatsApp integration. The question box is explicitly rule-based.
- PWA shell caching is provided. Browser installation, cold-start offline behavior and real receipt printers have not been fully hardware-verified.
- Production needs HTTPS, consistent backups, restore tests, retention policy, staff provisioning and load/security review. The default bind is loopback only.

## Data and recovery

`data/cafeos.sqlite` holds orders, menu, stock, staff hashes, sessions, operation keys, closings and audit events. WAL mode is enabled. Use a consistent SQLite backup mechanism; do not copy only the main database while writes are active. Never remove `data/` to "reset" a working café.

The financial domain lives in `lib/service.ts` and `lib/money.ts`. `BEGIN IMMEDIATE` wraps each mutation plus its audit and idempotency entry. The same operation key returns its original result only for the same staff/action/payload. An incompatible replay or stale order version fails. Consumption is tracked by per-line sent quantities; checkout only sends unsent quantities.

See `docs/research.md`, `docs/product.md`, `docs/qa.md`, and `research/petpooja/` for evidence, priorities, architecture and verification.

## Owner team mood control

The owner has a **palette icon / Team mood** control in the top-right toolbar. It previews Café Garden, Cyber Blue and Neon Lime. Cancel restores the saved theme. Save team theme persists the selection in outlet settings; connected staff screens pick it up on their next refresh (normally within 10 seconds). Other roles can use the shared theme but cannot change it. Theme changes are audited, and unrelated outlet-setting edits preserve the selection.

## Offer banner and team notices

Click the **Today’s offer** upload area above the POS menu as the owner. Upload a JPG, PNG or WebP (up to 12 MB), set a title and start/end dates, then publish. Images are resized to fit within 2400 × 1200 and compressed before saving. The complete image is shown without cropping. Dates use India time and are inclusive. Hide keeps the image for reuse. Banners are visual announcements; they do not apply billing discounts.

Click **Team notices** in the top bar to read all active messages. Owners and managers can post normal or important notices, edit their own messages, and set an optional expiry. Owner/Manager badges and names come from the authenticated account. Owners can archive any notice; managers can archive their own. Important notices appear first in the top strip, with a count for additional messages. Staff screens refresh within about 10 seconds while connected.

Both features are stored on the local server, audited and protected by role checks and optimistic versions. Offer image data is excluded from JSON snapshots and served through an authenticated image endpoint. Preview screenshots under `docs/screenshots/communications-*`, `offer-banner-and-team-notice.png` and `team-notice-roles.png` use an isolated test database.

## Reports, cash tender, customer contacts and merchant QR (version 1)

Orders and Inventory include PDF, CSV, Excel and Email controls. PDF opens an authenticated, landscape print report; choose **Print / Save as PDF** in that page. CSV is UTF-8 with formula-like user text neutralised. Excel downloads a native `.xlsx` workbook with numeric cells, a frozen header and filters. Inventory export is limited to owners/managers; orders export follows order access. Email downloads the selected CSV/Excel file and opens the device's email app; attach the downloaded file and send there. No SMTP account is configured and the app does not send email itself.

The top bar includes a fullscreen toggle using the browser Fullscreen API. Availability depends on the browser. List/table text is 2 px larger, including row details and actions.

At cash billing, denomination buttons add notes/coins received. Enter an exact tender amount if needed. Change is calculated and shown on receipts; sales and cash-closing totals use only the amount applied to the bill. Short tender is rejected. Existing split-payment flow remains available.

At billing, **Customer contact · optional** expands phone and email fields and a separate, initially unchecked marketing opt-in. These fields can be left blank. Valid contact information and consent are saved on the paid order/customer record, using phone or email identity when supplied. Consent timestamps are recorded. Marketing opt-in is shown with the contact in Returning customers. No marketing messages are automatically sent.

To accept scan payments, sign in as owner and open **Staff → Payment QR**. Upload your real bank/provider-issued merchant QR image and set the payee label (UPI ID is an optional display label). Check the actual payee in a UPI app before use. UPI billing displays that image and the amount to pay. A static merchant QR may require the customer to enter the amount. Staff must verify receipt in the merchant bank/provider account and enter the reference before completing the bill. This is direct QR payment plus manual recording; there is no gateway callback or automatic bank verification. See [NPCI UPI FAQ](https://www.npci.org.in/what-we-do/upi/faqs) for merchant QR integration context.

## Item preparation and serving priority

Counter staff can tag each cart item **Serve first**, **Normal**, or **Serve later**. Tags travel with kitchen dispatch; changing a sent cart item's tag saves it to the queue. Priority tags are read-only on the kitchen screen; counter staff edit the chips in the order panel. Items appear in priority order within each ticket.

Owners, managers and baristas can accept individual items with the large tick, set each item's estimated ready time, mark it ready/served, or cancel it with a required reason. Individual cancellation stops preparation only at that station and leaves other items, billing and consumed stock unchanged. Counter staff handle billing adjustments/refunds separately. Kitchen actions are shown once per item; each item advances independently. Preparation activity and priorities are audited.

## Counter layout and quicker printing

The cart offers **Payment & Send to kitchen**; successful payment records the bill and dispatches unsent items atomically, using the existing checkout flow. Customer name can be entered at payment and appears on the receipt and kitchen tickets. Priority chips are editable in the counter cart; kitchen chips are read-only.

**Print bill** opens the browser/system print dialog directly through the receipt frame. **Print & back to shop** starts the same print flow and returns the workspace to POS. Browser print confirmation is still controlled by the operating system; the app adds no intermediate print confirmation. Desktop order-panel width is adjustable with the draggable left edge or arrow keys on the focused resize edge.

Kitchen orders flow at their natural height in two station columns, using page scrolling only. Items show sequence number, name, quantity, notes, time, read-only priority, one status action and cancellation with a reason. Narrow screens stack station lanes.

## Switching tables and running bills

Opening another table automatically saves the current nonempty order first, then loads the latest open order for the selected table (or starts an empty order for a free table). Reopening the same table keeps panel edits. A failed save leaves the current order in place. When offline, a nonempty current order requires reconnecting before switching.

Occupied table cards show running time and separate View bill (eye) and Print bill buttons. These actions preview/print the saved running bill without settling or closing the table.

### Unassigned dine-in recovery

Clicking the already-selected order mode keeps its table number. Reloading a saved draft with an accidentally cleared table restores the server's assignment while preserving local item edits. The table dropdown switches between independent orders rather than moving the current bill to another table.

For a genuinely unassigned new dine-in order, choosing a free table assigns those items to it. Opening an occupied table keeps the unassigned draft on this device, with a **Resume unassigned order** button in the order panel. These drafts are not sent for preparation or settled automatically.


## Pantry, expenses and supplier accounts

Inventory now opens a card-based workspace: Stock & pantry, Purchases, Expenses, Suppliers, Supplier accounts / Udhar, and owner-only Staff salary accounts. Each opens its own screen with a Back to inventory action. Stock adjustments and wastage remain in Stock; the Receive stock action opens Purchases so financial and quantity records are linked.

- Purchases record supplier, effective date, optional bill number, ingredient quantities, line amounts, account paid from and paid-now amount. Saving receives stock transactionally. Full credit or partial payment creates supplier debt; supplier bill numbers prevent accidental duplicates when supplied.
- Expenses support multiple rows: reason, amount, explanation, employee, paid-from method and optional supplier. Credit/partial rows require a supplier and paid-now amount. The calendar selects an entry/history date and shows daily totals. Native date fields support past dates; future/invalid dates are rejected. Purchase and payment screens also accept backdates. Actual recording time is retained separately from the effective date.
- Suppliers have contact details and an opening payable balance. Opening balance is fixed after creation; contact details can be edited with version checks. Account screens show original bill/expense credit, actual settlements and current outstanding. Settlements cannot exceed the current balance and do not receive stock or book another expense.
- Financial entries are append-only in this version; there is no delete/void/return/correction workflow. Enter and review amounts before saving. Historic quantity-only stock entries are not retroactively assigned financial amounts. Purchases are limited to the configured stock ingredients; other buys may be recorded as expenses.
- Purchases and supplier payments do not also create separate operating-expense records. Cash-drawer amounts paid are deducted in day closing. Bank/UPI/card entries are manual records of payments already made; no transfer, bank callback, or bank reconciliation is performed. Opening cash float remains outside this MVP.

## Staff salary accounts

The owner can open salary accounts from Inventory or the Insights dashboard. Accounts use the existing staff identities. Set a monthly salary, explicitly record salary due for each month, then record salary payments or advances. Monthly due records are unique per employee/month. Advances reduce pending salary (or show an advance to recover). Salary payouts create one linked Expense entry; the CA register treats payouts as settlements and monthly salary due as the booked cost, avoiding duplicate salary cost. Salary setup and balances are owner-only, including salary entries in snapshots. No statutory payroll deductions, attendance proration, employee onboarding, salary bank transfer or payslip compliance calculation is implemented.

## Optional CA reports

The owner controls **CA reports ON/OFF** on Inventory home. It starts OFF. OFF hides the CA screen and blocks CA export endpoints; records remain in their original sections. This setting does not erase data or retract files already downloaded.

When enabled, choose From/To dates to export Excel, CSV or print/Save PDF reports:

- Transaction register: sales, purchases, operating expenses, salary accruals and settlement/payment records, with classifications, direction, effective date, actor and actual recorded time.
- Supplier balances: opening payable (from the supplier's creation day), purchases, expenses, payments and outstanding through the To date. Backdated entries remain visible even if recorded after their effective date.
- Salary register: monthly dues, advances, payments and employee balance through the To date.
- Stock receipts: purchase date, supplier/bill, ingredient quantity/unit and line amount.

These are working records for the accountant, not validated GST returns or statutory payroll/accounting statements. Original sale/refund attribution and demo tax configuration remain as described above. Salary advances are tracked as salary settlements in the account; the CA can review treatment using the separate register. Permission checks, integer-paise validation, transactions, operation replay protection and audit entries apply to all new financial commands.

Manual stock adjustment/wastage now also accepts an effective date and records ingredient, quantity change, reason, actor and actual recording time in Stock & pantry → Manual stock activity. CA stock exports include these non-monetary changes separately from purchase amounts. This history begins with entries made after this update; it does not invent missing historic records or duplicate recipe-consumption records.

## Vercel deployment status

This repository is rooted at the app: use Vercel Root Directory `./`, Framework `Next.js`.
Cloud deployment is intentionally blocked until database migration, tenant isolation and cloud authentication are implemented. See [deployment guide](docs/deployment.md). The reserved cloud routes are scaffold folders only.
Local operational data, generated passwords, environment secrets and QA screenshots are excluded.
