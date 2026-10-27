# oms-sync — rules for anyone editing this repo

- **Never remove the Bulk Refund loader** at the end of `console/easyship-tab.js` (the block marked
  `DO NOT REMOVE — loads the Bulk Refund tab`). It has been deleted by Easy Ship edits 3 times.
  When you rewrite or replace `easyship-tab.js`, copy that block to the end of the new file.
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
- Auto sale bills (`console/sale-autobill.js`) is loaded on the Purchase & Sales page (`page.purchase-bills.liquid`)
  by the block `AIKM AUTO SALE BILLS LOADER` just before `</body>`. Keep that block when replacing that template.
  It saves records of kind `autobill_done` and `autobill_map` in Supabase — do not delete them.
- The Amazon robot does NOT change prices (owner, 27 Oct 2026): `spapi-sync.js` runs in suggest-only mode unless the workflow sets
  `PRICE_AUTO=on`. Suggestions go to ONE doc per account, `spapiSnapshots/<acct>_priceSuggest` (quota-safe: 1 read + 1 write per run), and are shown by `console/price-suggest.js`, loaded by the block
  at the end of `console/amazon-name-search.js` (`aikmPriceSuggestJs`). Keep that block. Do not turn PRICE_AUTO on without the owner.

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
