# nimbus_labels.py
# Builds ONE shipping-label PDF for an SLA date, straight from NimbusPost:
#   - orders come from OMS Guru (Amazon self-ship, chosen SLA date / account)
#   - labels come from NimbusPost (Amazon Shipping labels by direct link, other couriers via the label API)
#   - labels are sorted A->Z by product (single-product orders first, then multi-product)
#   - product name + QTY are printed in the empty part of every label (like the Label Printer tool)
#   - the PDF is saved to Cloud Storage and a 24-hour download link is written back to the console
# Started by the console ("Download labels") through GitHub Actions, so it keeps running even if the
# browser tab is closed.
import json, os, re, sys, time, threading, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import requests, pymupdf
import firebase_admin
from firebase_admin import credentials, firestore, storage

NB = 'https://api-v2.nimbuspost.com/v2'
NBH = {'x-api-key': os.environ['NIMBUS_API_KEY'].strip(), 'x-api-secret': os.environ['NIMBUS_API_SECRET'].strip(),
       'Accept': 'application/json', 'Content-Type': 'application/json'}
BUCKET = 'aikm-shipping-labels'
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

main_app = firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT'])), name='main')
oms_app = firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_OMS'])), name='oms')
db = firestore.client(main_app)
omsdb = firestore.client(oms_app)

JOB_ID = (os.environ.get('JOB_ID') or '').strip()
job_ref = db.collection('labelJobs').document(JOB_ID or ('manual_' + str(int(time.time()))))


def note(status, **kw):
    kw.update({'status': status, 'updatedAt': firestore.SERVER_TIMESTAMP})
    job_ref.set(kw, merge=True)
    print('>>', status, {k: v for k, v in kw.items() if k not in ('updatedAt', 'url')})


def nid(v):
    return re.sub(r'\s+', '', str(v or '')).lstrip('`').lstrip('#').strip()


def ymd(s):
    s = re.sub(r'\s+\d{1,2}:\d{2}.*$', '', str(s or '')).strip()
    for f in ('%B %d, %Y', '%b %d, %Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%d %b %Y', '%d %B %Y'):
        try:
            return dt.datetime.strptime(s, f).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return ''


def account(ch):
    return re.sub(r'\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$', '', str(ch or ''), flags=re.I).strip()


# ---------------------------------------------------------------- 1. orders from OMS Guru
def oms_orders(sla, acct):
    by = {}
    for d in omsdb.collection('aikm_admin').document('omsOrders').collection('chunks').stream():
        for o in (d.to_dict() or {}).get('orders') or []:
            if not re.search('amazon', str(o.get('channel') or ''), re.I):
                continue
            if ymd(o.get('slaDate')) != sla:
                continue
            if acct and account(o.get('channel')) != acct:
                continue
            oid = nid(o.get('channelOrderId'))
            if not oid:
                continue
            by.setdefault(oid, []).append(o)
    out = {}
    for oid, lines in by.items():
        if any(re.search('cancel', str(l.get('status') or ''), re.I) for l in lines):
            continue
        items = {}
        for l in lines:
            name = str(l.get('productName') or l.get('sku') or '').strip()
            try:
                q = int(float(l.get('qty') or 1))
            except ValueError:
                q = 1
            items[name] = items.get(name, 0) + q
        out[oid] = {'id': oid, 'acct': account(lines[0].get('channel')), 'items': [[k, v] for k, v in items.items()]}
    return out


def deliver_by_dates():
    """Amazon 'Deliver by' dates saved by the SP-API sync (deliverByIndex/<account>): {orderId: 'YYYY-MM-DD'}"""
    out = {}
    try:
        for d in db.collection('deliverByIndex').stream():
            out.update((d.to_dict() or {}).get('orders') or {})
    except Exception as e:
        print('Deliver-by dates skipped:', e)
    return out


def dd_text(ymd_s):
    try:
        return 'DELIVER BY: ' + dt.datetime.strptime(ymd_s, '%Y-%m-%d').strftime('%a, %d %b %Y').upper()
    except (TypeError, ValueError):
        return ''


# ---------------------------------------------------------------- 2. shipments from NimbusPost
def nb_get(url):
    for i in range(5):
        r = requests.get(url, headers=NBH, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 * (i + 1)); continue
        return r.json()
    raise RuntimeError('NimbusPost kept failing (rate limit / server error)')


def nimbus_shipments(wanted, sla):
    cutoff = dt.datetime.strptime(sla, '%Y-%m-%d') - dt.timedelta(days=20)
    found = {}
    for page in range(1, 200):
        rows = (nb_get(f'{NB}/orders?limit=100&page={page}') or {}).get('data') or []
        for o in rows:
            on = nid(o.get('order_number'))
            sh = o.get('shipment') or {}
            if on not in wanted or not sh.get('awb'):
                continue
            if str(o.get('order_status') or '').startswith('cancel'):
                continue
            cur = found.get(on)
            if cur and cur['created'] > (o.get('created_at') or ''):
                continue  # keep the newest live shipment
            found[on] = {'oid': o.get('order_id'), 'awb': str(sh.get('awb')), 'courier': sh.get('courier_name') or '',
                         'label': sh.get('label_url') or '', 'created': o.get('created_at') or '', 'status': o.get('order_status')}
        if len(rows) < 100 or len(found) >= len(wanted):
            break
        last = rows[-1].get('created_at') or rows[-1].get('order_date') or ''
        try:
            if dt.datetime.strptime(last[:10], '%Y-%m-%d') < cutoff:
                break
        except ValueError:
            pass
        time.sleep(0.12)
    return found


# ---------------------------------------------------------------- 3. label PDFs
def fetch(url):
    for i in range(4):
        try:
            r = requests.get(url, timeout=90)
            if r.status_code == 200 and r.content[:4] == b'%PDF':
                return r.content
        except requests.RequestException:
            pass
        time.sleep(1.5 * (i + 1))
    return None


ORDER_RE = re.compile(r'Order\s*No\s*:?\s*([0-9]{3}-?[0-9]{7}-?[0-9]{7})', re.I)


def batch_labels(order_uuid_to_id):
    """NimbusPost label API (non-Amazon couriers). Returns {orderId: [pdf, pageIndex]}"""
    pages = {}
    uuids = list(order_uuid_to_id)
    for i in range(0, len(uuids), 50):
        part = uuids[i:i + 50]
        for t in range(4):
            r = requests.post(f'{NB}/shipments/labels', headers=NBH, data=json.dumps({'order_ids': part}), timeout=120)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(3 * (t + 1)); continue
            break
        j = r.json()
        url = ((j or {}).get('data') or {}).get('url')
        if not url:
            print('label API said:', json.dumps(j)[:300]); continue
        b = fetch(url)
        if not b:
            continue
        doc = pymupdf.open(stream=b, filetype='pdf')
        left = set(order_uuid_to_id[u] for u in part)
        for p in range(len(doc)):
            m = ORDER_RE.search(doc[p].get_text())
            if m:
                k = m.group(1)
                if '-' not in k:
                    k = f'{k[:3]}-{k[3:10]}-{k[10:]}'
                if k in left and k not in pages:
                    pages[k] = [doc, p]
        time.sleep(0.5)
    return pages


# ---------------------------------------------------------------- 4. stamping
def blank_band(page):
    """Largest fully-white horizontal strip in the lower 60% of the label (points from top)."""
    zoom = 1.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, alpha=False)
    w, h, s = pix.width, pix.height, pix.samples
    x0, x1 = int(w * 0.04), int(w * 0.96)
    blank = []
    for y in range(h):
        row = s[y * pix.stride + x0: y * pix.stride + x1]
        blank.append(min(row) > 200)
    best, cur, start = (0, 0), 0, 0
    top_limit = int(h * 0.40)
    for y in range(top_limit, h):
        if blank[y]:
            if cur == 0:
                start = y
            cur += 1
            if cur > best[1] - best[0]:
                best = (start, y + 1)
        else:
            cur = 0
    a, b = best
    return a / zoom, b / zoom


def fit(text, size, maxw):
    words, lines, cur = text.split(' '), [], ''
    for wd in words:
        if pymupdf.get_text_length(wd, fontname='hebo', fontsize=size) > maxw:
            return None
        t = (cur + ' ' + wd).strip()
        if pymupdf.get_text_length(t, fontname='hebo', fontsize=size) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = wd
    if cur:
        lines.append(cur)
    return lines


def clean(s):
    s = str(s).replace('₹', 'Rs ').replace('×', 'x')
    s = re.sub(r'[‘’`´]', "'", s); s = re.sub(r'[“”]', '"', s); s = re.sub(r'[–—]', '-', s)
    s = re.sub(r'[^\x20-\x7E]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def stamp(page, items, seq, total, dd=''):
    W, H = page.rect.width, page.rect.height
    top, bot = blank_band(page)
    pad = 3
    if bot - top < 18:  # no room: thin strip at the very bottom
        top, bot = H - 30, H - 2
    top, bot = top + pad, min(bot - pad, top + pad + (90 if dd else 74))
    if dd:  # Amazon "Deliver by" date: plain black text (no background, no border), above the product name
        if bot - top >= 36:
            sh = 10
            fs = 7
            while pymupdf.get_text_length(dd, 'hebo', fs) > W * 0.9 and fs > 5:
                fs -= 0.5
            page.insert_text((W / 2 - pymupdf.get_text_length(dd, 'hebo', fs) / 2, top + sh - 3.5), dd, fontname='hebo', fontsize=fs, color=(0, 0, 0))
            top += sh + 3
        else:  # label too full: small tag in the top-left corner
            fs = 6
            tw = pymupdf.get_text_length(dd, 'hebo', fs) + 6
            page.insert_text((5, 8), dd, fontname='hebo', fontsize=fs, color=(0, 0, 0))
    band_h = bot - top
    multi = len(items) > 1
    total_q = sum(q for _, q in items)
    # QTY (right): plain black text, no box
    box_w = min(70 if multi else 58, W * 0.22)
    box_h = min(band_h, 46)
    bx = W * 0.96 - box_w
    by = top + (band_h - box_h) / 2
    lab = 'TOTAL PCS' if multi else 'QTY'
    ls = 7 if multi else 8
    page.insert_text((bx + (box_w - pymupdf.get_text_length(lab, 'hebo', ls)) / 2, by + ls + 3), lab, fontname='hebo', fontsize=ls, color=(0, 0, 0))
    qs = str(total_q); ns = max(8, min(20, box_h - ls - 8))
    while pymupdf.get_text_length(qs, 'hebo', ns) > box_w - 6:
        ns -= 1
    page.insert_text((bx + (box_w - pymupdf.get_text_length(qs, 'hebo', ns)) / 2, by + box_h - 5), qs, fontname='hebo', fontsize=ns, color=(0, 0, 0))
    # product text (left)
    x0, x1 = W * 0.04, bx - 8
    entries = [((f'{i + 1}. ' if multi else '') + clean(n), q) for i, (n, q) in enumerate(items)]
    for size in [x / 2 for x in range(32, 9, -1)]:  # 16pt .. 5pt
        qw = pymupdf.get_text_length('QTY 999', 'hebo', size * 0.8) + 8 if multi else 0
        blocks, ok, hh = [], True, 0
        for name, q in entries:
            ln = fit(name, size, (x1 - x0) - qw)
            if not ln:
                ok = False; break
            blocks.append((ln, q)); hh += len(ln) * size * 1.15
        hh += (len(entries) - 1) * size * 0.3
        if ok and hh <= band_h:
            break
    else:
        blocks, size = [([e[0][:60]], e[1]) for e in entries[:3]], 5
    y = top + (band_h - hh) / 2 + size * 0.85 if ok else top + size
    for ln, q in blocks:
        for li, t in enumerate(ln):
            page.insert_text((x0, y), t, fontname='hebo', fontsize=size, color=(0, 0, 0))
            if multi and li == len(ln) - 1:
                qt = f'QTY {q}'; s2 = size * 0.8; w2 = pymupdf.get_text_length(qt, 'hebo', s2) + 6
                page.insert_text((x1 - w2 + 3, y), qt, fontname='hebo', fontsize=s2, color=(0, 0, 0))
            y += size * 1.15
        y += size * 0.3
    t = f'Label {seq} of {total}'
    page.insert_text((W - pymupdf.get_text_length(t, 'helv', 5.5) - 4, 8), t, fontname='helv', fontsize=5.5, color=(0.4, 0.4, 0.4))


# ---------------------------------------------------------------- main
def main():
    job = (job_ref.get().to_dict() or {}) if JOB_ID else {}
    sla = (job.get('sla') or os.environ.get('SLA') or '').strip()
    acct = (job.get('acct') if JOB_ID else os.environ.get('ACCT')) or ''
    only_new = False  # always include every label — re-downloading the same SLA date must always work
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', sla):
        raise RuntimeError('No SLA date given')
    note('running', step='Reading OMS Guru orders…', sla=sla, acct=acct)

    orders = oms_orders(sla, acct)
    if not orders:
        note('done', step='No orders for this SLA date.', count=0, url='', missing=[]); return
    note('running', step=f'{len(orders)} orders · finding their NimbusPost shipments…')
    ship = nimbus_shipments(set(orders), sla)
    print(f'{len(orders)} OMS orders, {len(ship)} shipped in NimbusPost')
    missing = sorted(set(orders) - set(ship))

    printed_ref = db.collection('aikm_admin').document('labelPrinted')
    printed = (printed_ref.get().to_dict() or {}).get('ids') or {}
    ids = [k for k in ship if not (only_new and k in printed)]
    skipped_old = len(ship) - len(ids)

    def key(oid):
        it = orders[oid]['items']
        names = ' | '.join(sorted(clean(n).lower() for n, _ in it))
        return (1 if len(it) > 1 else 0, names, sum(q for _, q in it), oid)
    ids.sort(key=key)
    if not ids:
        note('done', step='Nothing new to print.' if skipped_old else 'None of these orders are shipped in NimbusPost yet.', count=0, url='',
             missing=missing[:300], missingCount=len(missing), skippedPrinted=skipped_old); return

    note('running', step=f'Downloading {len(ids)} labels from NimbusPost…')
    srcs = {}
    direct = [k for k in ids if ship[k]['label']]
    with ThreadPoolExecutor(8) as ex:
        for k, b in zip(direct, ex.map(lambda k: fetch(ship[k]['label']), direct)):
            if b:
                d = pymupdf.open(stream=b, filetype='pdf')
                srcs[k] = [d, 0]
    rest = {ship[k]['oid']: k for k in ids if k not in srcs and ship[k]['oid']}
    if rest:
        srcs.update(batch_labels(rest))
    no_label = [k for k in ids if k not in srcs]

    dds = deliver_by_dates()
    note('running', step=f'Printing product names + deliver-by dates on {len(srcs)} labels…')
    out = pymupdf.open()
    final = [k for k in ids if k in srcs]
    TW, TH = 283.92, 426.0  # NimbusPost 4x6 label — Amazon Shipping's A4 labels are scaled to fit
    for i, k in enumerate(final):
        d, p = srcs[k]
        r = d[p].rect
        if abs(r.width - TW) < 4 and abs(r.height - TH) < 4:
            out.insert_pdf(d, from_page=p, to_page=p)
        else:
            np_ = out.new_page(width=TW, height=TH)
            np_.show_pdf_page(np_.rect, d, p, keep_proportion=True)
        stamp(out[-1], orders[k]['items'], i + 1, len(final), dd_text(dds.get(k)))
    data = out.tobytes(garbage=3, deflate=True)

    name = f'labels/{job_ref.id}.pdf'
    bucket = storage.bucket(BUCKET, app=main_app)
    blob = bucket.blob(name)
    blob.upload_from_string(data, content_type='application/pdf')
    stamp_ist = dt.datetime.now(IST).strftime('%d-%m-%Y %H%M')
    url = blob.generate_signed_url(version='v4', expiration=dt.timedelta(hours=24), method='GET',
                                   response_disposition=f'attachment; filename="NimbusPost Labels SLA {sla} ({stamp_ist}).pdf"')
    now = int(time.time() * 1000)
    keep = {k: v for k, v in printed.items() if now - int(v) < 20 * 864e5}
    for k in final:
        keep[k] = now
    if JOB_ID:  # manual test runs don't count as printed
        printed_ref.set({'ids': keep})
    note('done', step=f'{len(final)} labels ready.', count=len(final), url=url, missing=missing[:300], missingCount=len(missing),
         noLabel=no_label[:300], skippedPrinted=skipped_old, sizeKb=round(len(data) / 1024))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        note('failed', step='Failed: ' + str(e)[:300])
        raise
