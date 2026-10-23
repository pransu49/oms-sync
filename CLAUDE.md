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
- The POS page (dalbhaat.in/pages/pos) = Shopify template `page.counter-billing.liquid`. Latest copy: `shopify/page.counter-billing.liquid`
  (pasted into Shopify by hand - the live theme can't be written from here). LOTS is the source for price, MRP, name, unit,
  GST, HSN, barcode and stock (LOTS GN). LOTS rates are saved as `{l:"1-5",p:56.9}` - `applyLotsCatalog` must keep reading that.
  Other vendors (Pawan, Rana, Nav Durga...) come from the Purchase Bills Supabase `docs` table (`loadVendorCatalog`):
  latest bill per product; they only fill items LOTS does not have. Vendor stock = units bought on bills - counter sales.
  LOTS + vendor data refresh on page open, daily at 7:00 am, and on the "Refresh prices" button (no live LOTS watch).
  Top-bar "● Prices synced" pill shows sync health; click = details (per source, last success, next auto sync).
  Fully keyboard driven: F1 shortcut sheet, Alt+letter panels, ↑↓ pick line, +/− qty, *N qty, @N price, Del remove.
