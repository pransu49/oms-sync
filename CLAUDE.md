# oms-sync — rules for anyone editing this repo

- **Never remove the Bulk Refund loader** at the end of `console/easyship-tab.js` (the block marked
  `DO NOT REMOVE — loads the Bulk Refund tab`). It has been deleted by Easy Ship edits 3 times.
  When you rewrite or replace `easyship-tab.js`, copy that block to the end of the new file.
- Console files are loaded from jsDelivr (`@<commit>`, or `@main` when the GitHub lookup is over its 60/hour limit). `cdn-purge.yml`
  clears the `@main` copy of every changed `console/*` file on push — keep it, or users see old versions (owner 7 Nov 2026).
- After any change to `console/easyship-tab.js`, check: `grep -c refund-tab console/easyship-tab.js` must be 1 or more.
- The console page (`page.dalbhaat-admin-console.liquid` on Shopify) also loads the refund tab by itself
  (block `AIKM BULK REFUND LOADER`). Keep that block too when replacing the console template.
- The read saver (`console/read-saver.js`, cuts Firebase reads) is loaded by the block at the very end of
  `console/refund-tab.js` (`aikmReadSaverJs`). Keep that block when replacing `refund-tab.js`.
- The Loss Orders "Fix prices" panel (`console/loss-tab.js`) is loaded by the block at the end of
  `console/refund-tab.js` (`aikmLossJs`). Keep that block when replacing `refund-tab.js`.
- The RTO Check tab (`console/rto-tab.js`) is loaded by the block at the end of `console/refund-tab.js` (`aikmRtoJs`).
  Keep that block when replacing `refund-tab.js`. Its data comes from `rto-sync.js` (aikm_admin/rtoIndex).
- The Meesho Listing tab on the Amazon page (`console/meesho-listing.js`) is loaded by the block at the end of
  `console/amazon-name-search.js` (`aikmMeeshoListingJs`).
  Owner 12 Nov 2026: it is NOT a tab on the Amazon page any more — it is its own tool on the AIKM dashboard (`/pages/aikm`),
  opened as `/pages/amazon?app=meesho` (Amazon tabs + KPI tiles hidden, same Amazon data). Without `?app=meesho` no Meesho tab is added. (Different from `console/meesho-tab.js`, the Meesho + Snapdeal packing page.) Keep that block when replacing `amazon-name-search.js`.
  Its Amazon details come from `meesho-robot.js` (workflow `meesho-robot.yml`, on command only) -> spapiSnapshots/meesho_<ASIN>.
  Saved templates (owner 7 Nov 2026): every fresh template dropped is kept in main Firebase, one per category — index `aikm_admin/meeshoTplIndex`
  + file parts `aikm_admin/meeshoTpl_<key>_<n>` (base64). 1 read when the tab opens, 1-2 per template opened. Do not delete them.
  Same index doc also holds learned blocked words (`badWords`) and MRPs typed in the review table (`mrp.<ASIN>`, used before Amazon's MRP).
  Products can come from Amazon listings OR the LOTS price list (`lotsVendor.products`, switch at the top of the list): LOTS items are
  `LOTS-<code>` (cost = best LOTS slab, MRP/GST/HSN/photo/stock from LOTS); if mapped 1:1 to an ASIN in spapiAsinLotsMap, the robot also reads that ASIN's details.
  'Add ASINs' button: paste ASINs / Amazon links (not necessarily ours) -> meesho-robot reads Amazon's catalogue -> added to the pick list as EXT items; Fill uses those details (owner does NOT want an Excel download; axExcel() kept unused).
  Review table: editable title + 'Pack of N' per product (cost, MRP, weight x N, stock / N, title gets '(Pack of N)'); saved online in meeshoTplIndex.packs.<key>; MRP typed for a pack saved as mrp.<ASIN>x<N>.
  Meesho rules checked before download (`issues()`): MRP >= price x 1.10, no learned blocked word in Brand, required boxes filled. Only rows that pass are written to the file.
- Auto sale bills (`console/sale-autobill.js`) is loaded on the Purchase & Sales page (`page.purchase-bills.liquid`)
  by the block `AIKM AUTO SALE BILLS LOADER` just before `</body>`. Keep that block when replacing that template.
  It saves records of kind `autobill_done` and `autobill_map` in Supabase — do not delete them.
- The Amazon robot does NOT change prices (owner, 27 Oct 2026): `spapi-sync.js` runs in suggest-only mode unless the workflow sets
  `PRICE_AUTO=on`. Suggestions go to ONE doc per account, `spapiSnapshots/<acct>_priceSuggest` (quota-safe: 1 read + 1 write per run), and are shown by `console/price-suggest.js`, loaded by the block
  at the end of `console/amazon-name-search.js` (`aikmPriceSuggestJs`). Keep that block. Do not turn PRICE_AUTO on without the owner.
- **SP-API guard** (`sp-guard.js`, owner 28 Oct 2026): every `spClient.callAPI` in `spapi-sync.js` goes through it. It pauses an API for 24 h
  after "no permission" (403), slows down on "too fast" (429), skips SKUs Amazon said don't exist (404) for 3 days, and counts calls in
  `spapiSnapshots/<acct>_guard` (1 read + 1 write per run). Shown as the 🩺 pill on the Amazon page (`console/api-health.js`, block `aikmApiHealthJs`
  at the end of `amazon-name-search.js` — keep it). Keep the client option `auto_request_throttled: false` (the guard does the retries).
  The shipping-label (MFN) test call runs only with env `SPAPI_MFN_TEST=on`.

- Bulk price drop on the Competitor Pricing tab (`console/bulk-price.js`, owner 3 Nov 2026) is loaded by the block at the end of
  `console/amazon-name-search.js` (`aikmBulkPriceJs`) — keep it. It queues owner price pushes in `spapiPriceUpdates` (0 reads, 1 write each);
  `applyPendingPriceUpdates` sends the oldest 150 per sync.

- **Real order fees** (Finance API, owner 6 Nov 2026): `syncOrderFees()` in `spapi-sync.js` (full syncs only) reads `listFinancialEvents`
  (100 orders per call, 15-day windows until caught up, progress in `<acct>_meta.feesPostedAt`) and saves `order.fees`
  `{ ev }` (raw events only, 8 Nov 2026 — the page totals them in `feesOf()`) on each order in the SNAPSHOT only — 0 extra Firebase reads/writes.
  Shown as Referral fee / Closing fee columns on the Orders tab by `console/order-fees.js` (loader block `aikmOrderFeesJs` at the end of `amazon-name-search.js` — keep it once added).

- **Speed rules** (owner 8 Nov 2026 — runs took up to 29 min on a 15-min schedule): the listings report is requested at the START of
  the run (`requestInventoryReport`) and only collected in Step 2; no extra sleeps after listings calls (sp-guard already spaces them);
  snapshot chunks are written 4 at a time; the Orders tab draws 200 rows at a time (`order-fees.js`). Keep these.

- **Amazon payout robot** (`payout-robot.js`, workflow `payout-robot.yml`, owner 12 Nov 2026): SWITCHED OFF — Amazon's Transfers API
  `initiatePayout` supports only EU stores (DE FR IT ES SE NL PL BE); Amazon.in returns "Provided MarketplaceId is invalid". `getPaymentMethods`
  (read-only) does work for Amazon.in. Kept for a manual `check` run / if Amazon adds India. No schedule.

- **Relist fixes** (owner 12 Nov 2026, "Not selling" stuck): the relist robot never relists with a blank price (fallback: old offer's
  `our_price`, then the last relist record's price; none = skip with a note). In suggest-only mode, listings blocked by "below your minimum
  price threshold" are relisted as a new SKU at the SAME price (no price change). "Price too low / may be an error" stays a price suggestion.
  A SKU still in stock in the report but "not found" on Amazon is queued to Add ASIN (`spapiAddAsin`, source `relist-gone`, wantPrice = last
  price) at most once a day per ASIN.

- **Vishal E-Commerce** (3rd Amazon account, owner 12 Nov 2026; first called "Ecommerce Munda", renamed): workflow `spapi-sync-vishal.yml`,
  ACCOUNT_LABEL `vishal`, secrets `SPAPI_REFRESH_TOKEN_VISHAL` + `SPAPI_SELLER_ID_VISHAL`. LIVE since 12 Nov 2026 (full :20 every 2 h,
  quick :05/:35/:50) — same LOTS stock + purchase-bill products as the other accounts, so all robot rules apply. Firebase estimate: ~+2,700 writes/day and
  ~+2,700 deletes/day to the SP-API project.
  Page switcher entry: `EXTRA` list in the "More Amazon accounts" block at the end of `console/amazon-name-search.js` (keep it).
  Own seller IDs of every account live in `spapiSnapshots/ourSellers` {ids:{label:sellerId}} — each sync adds its own; robots + page treat them as "us".

- **Ecommerce Munda** (4th Amazon account, owner 12 Nov 2026): workflow `spapi-sync-munda.yml`, label `munda`, secrets `SPAPI_REFRESH_TOKEN_MUNDA` +
  `SPAPI_SELLER_ID_MUNDA`. LIVE since 12 Nov 2026 (full :45 every 2 h, quick :00/:15/:30) — same LOTS stock, all robot rules apply. In page `EXTRA` list.
  Record names built from SKUs go through `sidSafe()` ("/" -> "%2F"; Munda has SKUs like "MRP-120 Wala/Old-108") — use it for any new `${ACCOUNT_LABEL}_${sku}` id.
  Each account's workflow reports health under its own key (`spapi_vishal`, `spapi_munda`) — don't copy Sasta's.

- **Duplicate ASIN bulk delete + listing dates** (`console/dup-asin.js`, owner 12 Nov 2026), loader block `aikmDupAsinJs` at the end of
  `amazon-name-search.js` (keep it). "Duplicate ASINs" tile shows listings grouped by ASIN with one KEEP (most sold 30d, then stock, then oldest);
  ticked SKUs are queued in main `spapiListingDeletions` (`<acct>_<sku with / as %2F>`); `applyPendingListingDeletions` deletes max 200 per run.
  Listing date = `openDate` from the listings report, saved in the snapshot only.
  "All 4 accounts" switch (owner 13 Nov 2026): same ASIN in stock on 2+ of our accounts, one KEEP (Buy Box holder via `ourSellers`, else lowest
  price); nothing pre-ticked ("Tick all except KEEP" button); queued per account (source `duplicate-cross-account`). ~25 reads per open, cached 5 min.

- **Amazon page header menu** (owner 13 Nov 2026, block "Premium header menu" at the end of `amazon-name-search.js` — keep it): top row =
  brand · account switch · sync + refresh; second row `.ap-act` = Add ASIN (gold) · Needs attention · Price suggestions · Robot changes, API pill right.
  Buttons are MOVED there by id (aaOpen/atOpen/psOpen/rlOpen/ahPill) and get SVG icons. New header buttons: insert next to a sibling's
  CURRENT parent (`ref.parentNode.insertBefore`), never assume they sit in `.ap-sync`.
- **Tab toolbars** (owner 13 Nov 2026, block "Tab toolbars" at the end of `amazon-name-search.js` — keep it): every Amazon tab has ONE compact
  row: search · filters/actions · count · export (36 px, same button style). Competitor Pricing's bulk-price bar (`#bpBar`, display:contents) is
  INSIDE that row; Buy Box lost + OMS hints became (i) tooltips; OMS auto-map buttons moved into the OMS search row.
  Top search (owner 13 Nov 2026, block "Top search" — keep it): ONE search box `#apTopQ` in the header menu row types into the open tab's own
  (now hidden) `.ap-search input` and fires input/keyup/change. New tabs: keep a `.ap-search input` in `.ap-tools` and it works automatically.
- **New listing = NEW product on Amazon** (owner 13 Nov 2026): header button "New listing" (`console/new-listing.js`, loader block `aikmNewListingJs`
  at the end of `amazon-name-search.js` — keep it). Requests in SP-API `spapiNewListingRequests/<acct>_<id>` {v:2, title, brand, barcode, mrp, price,
  cost, lotsCode, gst, hsn, qty, image, bullets, description, productType?, extra{}, create}. Robot `applyPendingNewListings`: barcode already on
  Amazon -> 'exists' (create:true hands it to Add ASIN); else product type from searchDefinitionsProductTypes, full LISTING attributes,
  VALIDATION_PREVIEW first -> 'needs_info' (Amazon's issue list, page asks per attribute -> `extra`) / 'checked' / 'submitted' -> later 'live'
  (ASIN read back, mapped to the LOTS code in spapiAsinLotsMap). Same profit rule as Add ASIN. ~1 read per sync.
- **Fix costs alert** (owner 13 Nov 2026, `console/cost-alerts.js`, loader block `aikmCostAlertsJs` at the end of `amazon-name-search.js` — keep it):
  header button "Fix costs · N" + pop-up once per visit. Checks products sold in 30 days (this account): no cost, pack not counted
  (title "Pack of N"/"x N" vs mapped units incl. LOTS "Pk6"/vendor qty), different product (word overlap < 0.34), size differs, cost above
  what the buyer paid incl. shipping. "Fix mapping" = page's openSpapiMatchModal(asin); "Looks right" = main `aikm_admin/costCheckOk.ok["acct|asin"]`
  (stamp = cost|issues, comes back if the cost changes). 1 read per page open.
- **Loss-order rule bar** (`console/loss-bulk.js`, owner 13 Nov 2026): ONE small red bar above #cfTable (Amazon confirmation), #psTable (ProShip),
  #nbTable (NimbusPost), #zpTable (Zippy): "Ship them only when profit is above ₹[40]". The "LOSS · ₹x" tag shows PROFIT (isLossEntry also
  flags low-profit orders): "₹42" = +42, "₹-43" = real loss. Flagged orders with profit ABOVE the amount are ticked, the rest (incl. every minus)
  unticked (owner 13 Nov 2026 — a first version ignored the minus sign and ticked real losses). Amount always editable, saved per computer (localStorage `aikm_loss_above`, default 40, empty = off). Each order is set
  once per amount (manual tick/untick stays; changing the amount re-applies). Owner asked to REMOVE the extra chips / product-name / account /
  untick buttons — keep it to this one rule. Then (owner 13 Nov 2026, later) asked for a second row back: "Product [name] · Tick N · Untick N"
  (ALL rows whose items text has every typed word, loss or not) + counts "Ship N · Not shipped N" (ticked vs unticked enabled rows). Reads rows from the DOM (tr.nb-row-loss, "LOSS · ₹x") and clicks the table's own checkboxes, so each
  panel's own loss confirmation still runs. FAST: the panel's `<x>Kpis` box is renamed while ticking so each per-tick redraw stops at its first line,
  then ONE normal redraw (if a panel's render() stops starting with its Kpis box, fix the KPI map). Only set text when it changed (body
  MutationObserver would loop). 0 Firebase. Loaded by the block at the end of `console/proship-tab.js` (`aikmLossBulkJs`) — keep it.
- Orders cost (`order-fees.js`): old/relisted SKUs (not in inventory) use the order item's ASIN mapping first (packs, combos, vendor).
- **LOTS-62 stock for Sasta Store** (owner 13 Nov 2026): `spapi-sync-sastastore.yml` sets `LOTS62_STOCK=on` -> the out-of-stock rule and its restock use
  the HIGHER of LOTS-GN and LOTS-62 stock (main `aikm_admin/lots62Catalog`, read only when its savedAt changed; cached in `.cache/lots62-catalog.json`).
  Other accounts stay LOTS-GN only. `loadLotsForGuard` now uses the cached LOTS catalogue (was ~25 fresh reads every run).
  OMS Guru's stock push is shared by all accounts and still uses LOTS-GN only.
- **Quota savers in `spapi-sync.js`** (owner 12 Nov 2026, "ensure all syncs work under free limits"):
  old per-item collections `spapiInventory` / `spapiOrders` / `spapiCompetitivePricing` are NOT written any more (nothing reads them —
  page + robots use the snapshot; `SPAPI_LEGACY_MIRROR=on` brings the writes back). Sent-price checks: max 150 per run, check counts in ONE doc
  `spapiSnapshots/<acct>_priceVerify`, the price record is written only when settled. Relist log: the same "still stuck" status
  (price_issue/blocked/buyable/failed/gone/bb_skip/learn_war) per ASIN is saved at most once a day (`relistState.logged`).
  Relist history is read by document-id range of the own account only (a new account's first run read ~40,000 docs before).
- **Usage meter**: every robot prints `FBMETER ...` (from `fb-meter.js`, first line of each script) and the sync prints
  `FIREBASE OPS` + `FIREBASE OPS BY COLLECTION` — use these to estimate before shipping. `usage-diag.yml` (manual) prints hourly
  Firestore ops per project from Cloud Monitoring.

## Firebase free quota — check BEFORE deploying any new tool or robot (owner rule, 27 Oct 2026)
Every Firebase project must stay inside the free daily quota: **50,000 reads · 20,000 writes · 20,000 deletes**.
Current daily use is on the console's Firebase usage card (aikm_admin/firebaseUsage). Keep each project **under ~35,000 reads/day**.
Before shipping a change, estimate: *runs per day × documents read per run* (+ open console tabs × documents re-read when a robot writes).
- A workflow started by `workflow_run` runs after EVERY upstream run, even when the upstream gate skipped its work
  (upstream every 10 min = 144 runs/day). Gate it so it only runs after a real upstream run (see `robot-audit.yml`).
- Never read a whole growing collection on every run. Filter in the query (time window, document-id range, status),
  not in code after reading. Example: robot price records (`robot_*` ids) are skipped by id range in `loadManualPrices`.
- Big lists that rarely change (LOTS catalogue ~25 docs, masterMapping): cache between runs (see the LOTS cache in
  `spapi-sync.js` + workflow) or read only when their `savedAt` stamp changed.
- Prefer one shared read per run over one per account / per item.
- Write the estimate in the PR description ("adds ~N reads/day to <project>"). If it would push a project above ~35,000/day,
  redesign first.
- Bulk Refund "🤖 Ready to refund" panel reads `aikm_admin/refundProposals` (OMS Firebase), built hourly 8 AM–10 PM by
  `refund-propose.js` (workflow `refund-propose.yml`). The robot only lines orders up + Telegram; money moves only when
  the owner presses Approve & refund (confirm box). "Don't refund" marks go to main Firebase `aikm_admin/refundSkip`.
- Amazon refund files (Payments → Transaction View → Refund CSV): the UPLOAD option was removed from Bulk Refund (owner 7 Nov 2026, Finance API in use). Older uploads still live in ONE main-Firebase doc
  `aikm_admin/refundUpload` { accts: { <ACCOUNT>: { name, n, from, to, at, orders: { orderId: [date, amount] } } } }.
  Each upload replaces only that account. Console + `refund-propose.js` treat those orders as already refunded (stand-in until the Finance API role).
- **Refund robot amounts** (owner 7 Nov 2026): `refund-robot.js` never sends the console's calculated split. `fixAmounts()` reads each order's
  getOrderItems and sends Amazon's exact ItemPrice/ItemTax/ShippingPrice/ShippingTax (partial item refunds scaled by Amazon's tax ratio);
  cancelled (qty 0) and already-refunded (`refundChecks`) are skipped; promotions / part-refunded go to Failed Refunds for manual refund.
  Input `dry=true` = check only (prints DRYRES lines, sends/saves nothing). Line flag `full:1` = refund item + shipping in full.
- Failed Refunds (`console/refund-failed.js`, owner 6 Nov 2026) is loaded by the block at the end of `console/refund-tab.js` (`aikmRefundFailedJs`) — keep it.
  It is shown INSIDE the Bulk Refund page ("Failed refunds" button in its top bar), NOT as a side-menu tab (owner 7 Nov 2026).
  It lists robot refund lines Amazon rejected (status "error" in OMS `aikm_admin/refundLog`) with the reason + manual fix; hides ones later refunded
  (robot done / `refundChecks` / main `refundUpload`) or ticked "Mark refunded" (OMS `aikm_admin/refundFailedDone`). ~4 reads per open/page load.
- The Complaints tab (`console/complaints-tab.js`) is loaded by the block at the end of `console/refund-tab.js` (`aikmComplaintsJs`) — keep it.
  Feedback + account health come from `complaints-sync.js` (SP-API reports, 6 runs/day) -> OMS Firebase `aikm_admin/complaintsIndex`.
  Buyer messages are NOT in any Amazon API: they come from the per-account Gmail robots (main Firebase collection `amazon_complaints`).
- **LOTS-GN bill check** (`lots-bill-check.js`, workflow `lots-bill-check.yml`, owner 28 Oct 2026): every 10 min 10 AM–8 PM IST (started after "Sync OMS Guru Orders", which cron-job.org runs; GitHub schedule = backup) it reads
  today's (and missed last-3-days) LOTS-GN tax invoice from LOTS' invoice storage (same source as the Purchase Bills page auto-fetch — no login/OTP), matches it to
  the Order Mapper BATCH(ES) it covers in main-Firebase `lotsCartQueue` (LOTS bills each placed batch separately; per batch = robot upload or
  newest "Save my final cart"; older re-sent copies ignored; a batch already on an earlier bill = duplicate-bill alert), compares
  (barcode via lots-price-sync's `lots-item-master.json`, then name), and sends Telegram text + PDF. State: ONE doc `aikm_admin/lotsBillCheck`
  (1 read per run; ~40 reads + 1 write per new bill). Read-only on LOTS — never touches the cart.

- **AIKM dashboard summary** (owner 13 Nov 2026 — OMS Guru will be switched off): every SP-API sync run writes ONE small doc
  `spapiSnapshots/<acct>_dash` (`writeDashSummary()` in `spapi-sync.js`, right after `writeSnapshot`): last 31 days per IST day
  { o orders, r revenue, u units, c cancelled, s status groups, p top-40 ASINs [units, revenue] } + `names` + `open` { toShip, late, pending }.
  1 write per run (~384 writes/day for 4 accounts). The dashboard (`/pages/aikm`, Shopify template `page.aikm.liquid`) reads only these
  4 docs for Amazon (4 reads per open); non-Amazon channels still come from OMS until it is off. Keep the doc small (top 40 products/day).

- **ProShip (Prozo) courier for Amazon self-ship** (owner 13 Nov 2026): robot `proship.js`, workflow `proship.yml` (on command only, modes
  check / ship / sync / cancel; secrets `PROSHIP_USERNAME` + `PROSHIP_PASSWORD` = an API user from ProShip -> Settings -> Manage Users).
  Console panel `console/proship-tab.js` — its OWN side-menu tab "ProShip" (data-tab `proship`, link `/pages/console?tab=proship`, full page width,
  owner 13 Nov 2026; ALL waiting orders listed by default, SLA chips + search filter; the Self-Ship "ProShip" pill only opens the tab): tick orders -> job doc main `proshipJobs/<id>` {ids:{orderId:weightKg}, box, pickup}
  -> robot reads the orders FRESH from OMS chunks, skips cancelled / already-AWB (OMS, nimbusIndex, zippyIndex, proshipIndex) and creates the
  shipments (reference = Amazon order id). AWBs live in ONE doc main `aikm_admin/proshipIndex` {data: JSON {orderId:{a,c,s,st,t}}} — same shape as
  zippyIndex; `oms-push-tracking.js` + `amazon-confirm.js` read it (ProShip fills in only where NimbusPost / Zippy have no live AWB) and
  `nimbus_labels.py` adds ProShip labels of the SLA date (ProShip `/api/tools/refresh/url`). Settings `aikm_admin/proshipSettings`, last
  connection test + rates `aikm_admin/proshipCheck`. The panel is loaded by the block at the end of
  `console/refund-tab.js` (`aikmProshipJs`, switched on 13 Nov 2026) — keep it.
  BIG JOBS (owner 13 Nov 2026: ~1,500 orders a day in one go): console allows up to 2,000 per job; robot creates 4 shipments at a time
  (SHIP_PARALLEL), saves new AWBs to proshipIndex every 50 (a stopped run never loses AWBs -> no double shipping on re-run), job progress every 25;
  workflow timeout 120 min (nimbus-labels 60 min, ProShip label links fetched 8 at a time). proshipIndex is ONE doc (1 MB max, ~120 B per AWB):
  kept to the newest 6,500 AWBs / 15 days (MAX_IDX, KEEP_DAYS) — don't raise.
  STATUS REFRESH every 30 min (owner 13 Nov 2026, like NimbusPost): `proship.yml` schedule `7,37 * * * *` runs mode `sync` (ProShip order list,
  updated last 6 days, up to 20,000 rows, stops once all open AWBs are seen; 0 ProShip calls when nothing is live). Sync has its OWN concurrency
  queue (`proship-sync`) so it can never push a waiting ship job out. ALL index writes go through `mergeIndex()` (Firestore transaction on the
  fresh doc): ship adds only its own new AWBs, sync changes only statuses (never un-cancels), cancel marks only its AWBs — never write the
  whole in-memory index back. Firebase: ~50 reads + ~100 writes/day (index + syncHealth), console re-reads proshipIndex once per change. amazon-confirm still confirms 120 per account per run (every 10 min).
  Firebase: +1 read per oms-push-tracking / amazon-confirm run (~190/day); per ship job ~4 reads + OMS chunks, ~3 + N/10 writes; console
  1 read per load (proshipIndex) + ~5 when the panel is opened. First real `check` run (13 Nov 2026): `/api/auth/signin` answered 200 "MFA required. OTP sent to registered email" — the user in the secrets has MFA on,
  so no robot login until ProShip switches MFA off for the API user (or the owner adds a user without it). Sandbox practice run (13 Nov 2026): login (no OTP there), pricing, create (awb_number + courier_id + label_url in the answer), find-by-reference,
  label PDF (298 x 420 pt, 1 page) and cancel all work; `/api/order/track_waybill` answers 404, so `sync` reads statuses from the order list
  (`/api/order/external/details`, a GET with the filters in the BODY; a date range is required). LIVE login works since 13 Nov 2026 ~13:50 IST (ProShip switched OTP off for the API user); first live `check` gave NO rates from 206001:
  "No Serviceable Courier Found as per RuleMapping". Pickup pincode is 201301 (Noida); couriers mapped 13 Nov 2026 ~15:00 IST — live rates come back
  (ATS named "ATS", plus Xpressbees, Delhivery). Shipping still untested — first live order is the test.
  ATS weight rule (owner 13 Nov 2026): before each create the robot asks ProShip's rates with the real weight; cheapest courier = ATS / Amazon
  -> order sent at 450 g, else the real weight. If ProShip then assigns a different courier the job result gets a `warn` (shown on the row).
  (NimbusPost / Zippy files: courier is picked inside those apps after upload, so the rule can't be applied there before the file is made.)
  Practice run: `proship.yml` mode `selftest` = ProShip's SANDBOX only (proshipdev.prozo.com, secrets `PROSHIP_SANDBOX_USERNAME` + `PROSHIP_SANDBOX_PASSWORD`): one dummy
  order -> label -> track -> cancel, prints ProShip's real answers, touches no Firebase. Never send real buyer data to the sandbox (shared test login);
  every other mode is refused on the sandbox so fake AWBs can't reach proshipIndex / OMS / Amazon.

- **NimbusPost + Zippy switched OFF** (owner 13 Nov 2026 — ProShip ships everything): `nimbus-sync.yml` runs only by hand (no schedule / workflow_run);
  `oms-push-tracking.yml` now follows ProShip's scheduled status refresh (workflow_run on 'ProShip', gate = upstream event `schedule`);
  NimbusPost / Zippy pills, panels and the "Upload NimbusPost export" button are hidden by CSS in `console/proship-tab.js` (`aikm-ship-off-css`).
  Their code is still loaded (weight settings are shared) and `nimbus-labels.yml` stays — it is the label robot for ProShip too.
  Owner's choice: orders ProShip can't serve (pincode not served) and non-Amazon orders are shipped by hand outside the console.
