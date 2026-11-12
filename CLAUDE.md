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
  `console/amazon-name-search.js` (`aikmMeeshoListingJs`). (Different from `console/meesho-tab.js`, the Meesho + Snapdeal packing page.) Keep that block when replacing `amazon-name-search.js`.
  Its Amazon details come from `meesho-robot.js` (workflow `meesho-robot.yml`, on command only) -> spapiSnapshots/meesho_<ASIN>.
  Saved templates (owner 7 Nov 2026): every fresh template dropped is kept in main Firebase, one per category — index `aikm_admin/meeshoTplIndex`
  + file parts `aikm_admin/meeshoTpl_<key>_<n>` (base64). 1 read when the tab opens, 1-2 per template opened. Do not delete them.
  Same index doc also holds learned blocked words (`badWords`) and MRPs typed in the review table (`mrp.<ASIN>`, used before Amazon's MRP).
  Products can come from Amazon listings OR the LOTS price list (`lotsVendor.products`, switch at the top of the list): LOTS items are
  `LOTS-<code>` (cost = best LOTS slab, MRP/GST/HSN/photo/stock from LOTS); if mapped 1:1 to an ASIN in spapiAsinLotsMap, the robot also reads that ASIN's details.
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
