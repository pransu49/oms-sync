(window.__dalbhaatConsoleLoaded
  ? console.error(
      "dalbhaat-admin-console.js loaded MORE THAN ONCE on this page — this breaks dropdowns/menus. Check for a duplicate <script> tag.",
    )
  : (window.__dalbhaatConsoleLoaded = !0),
  (function () {
    const e = document.getElementById("scanTable"),
      t = e ? e.closest(".panel") : null,
      n = document.getElementById("manifest");
    if (!t || !n) return;
    const a = t.parentNode;
    a.insertBefore(n, t.nextSibling);
    const o = document.getElementById("masterPrefixMapper"),
      r = o ? o.closest(".panel") : null;
    r && a.insertBefore(r, n.nextSibling);
  })(),
  window.addEventListener("beforeprint", () => {
    const e = document.getElementById("manifest");
    e &&
      ((e.dataset.prevMaxHeight = e.style.maxHeight),
      (e.dataset.prevOverflowY = e.style.overflowY),
      (e.style.maxHeight = "none"),
      (e.style.overflowY = "visible"));
  }),
  window.addEventListener("afterprint", () => {
    const e = document.getElementById("manifest");
    e && ((e.style.maxHeight = e.dataset.prevMaxHeight || ""), (e.style.overflowY = e.dataset.prevOverflowY || ""));
  }),
  document.querySelectorAll(".tabbtn").forEach((e) => {
    e.addEventListener("click", () => {
      const t = e.dataset.tab;
      (document.querySelectorAll(".tabbtn").forEach((e) => e.classList.remove("active")),
        document.querySelectorAll(".tabpanel").forEach((e) => e.classList.remove("active")),
        document.querySelectorAll('.tabbtn[data-tab="' + t + '"]').forEach((e) => e.classList.add("active")),
        document.getElementById("tab-" + t).classList.add("active"),
        document.querySelectorAll(".subtabbar").forEach((e) => {
          e.style.display = "none";
        }));
      const n = "courier" === t ? null : document.getElementById("subtab-" + t);
      if (
        (n && (n.style.display = "flex"),
        "backup" === t &&
          (renderBackupStats(),
          loadSavedFilesList(),
          "function" == typeof renderStoredDataPanel && renderStoredDataPanel()),
        "ordermapper" === t &&
          ("function" == typeof refreshLiveSummaryCount && refreshLiveSummaryCount(),
          "function" == typeof renderMasterMapping && renderMasterMapping()),
        "omsorders" === t && "function" == typeof renderOmsOrdersTable && renderOmsOrdersTable(),
        "lossorders" === t && "function" == typeof renderLossOrdersTab && renderLossOrdersTab(),
        "zippyshipments" === t && "function" == typeof renderZippyShipmentsTable && renderZippyShipmentsTable(),
        "lotsproducts" === t && "function" == typeof renderLotsProductsTable && renderLotsProductsTable(),
        "spapi" === t)
      ) {
        if (
          ("function" == typeof populateSpapiAccountSwitcher && populateSpapiAccountSwitcher(),
          "function" == typeof addSpapiFetchNowLink && addSpapiFetchNowLink(),
          !window.__spapiSyncStarted && "function" == typeof startSpapiSync)
        ) {
          if (!("function" == typeof loadSpapiCachedDataImmediately && loadSpapiCachedDataImmediately())) {
            const e = document.getElementById("spapiOrdersEmpty"),
              t = document.getElementById("spapiInventoryEmpty"),
              n = document.getElementById("spapiPricingEmpty");
            (e &&
              ((e.textContent = "⏳ Loading orders, inventory & pricing… this can take a minute the first time."),
              (e.style.display = "block")),
              t && ((t.textContent = "⏳ Loading…"), (t.style.display = "block")),
              n && ((n.textContent = "⏳ Loading…"), (n.style.display = "block")));
          }
          (startSpapiSync(), (window.__spapiSyncStarted = !0));
        }
        "function" == typeof renderSpapiOrdersTable && renderSpapiOrdersTable();
      }
      "documents" === t && "function" == typeof renderSharedDocs && renderSharedDocs();
    });
  }),
  document.getElementById("backendLink").addEventListener("click", () => {
    (document.querySelectorAll(".tabbtn").forEach((e) => e.classList.remove("active")),
      document.querySelectorAll(".tabpanel").forEach((e) => e.classList.remove("active")),
      document.querySelectorAll(".subtabbar").forEach((e) => {
        e.style.display = "none";
      }),
      document.getElementById("tab-backup").classList.add("active"),
      renderBackupStats(),
      loadSavedFilesList(),
      "function" == typeof renderStoredDataPanel && renderStoredDataPanel());
  }));
/* PERF: JSZip (zip downloads) is loaded on first use instead of on every page open */
window.__ensureJSZip = function () {
  if (window.JSZip) return Promise.resolve();
  if (!window.__jszipPromise)
    window.__jszipPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { window.__jszipPromise = null; reject(new Error("Could not load the zip tool — check your internet and try again.")); };
      document.head.appendChild(s);
    });
  return window.__jszipPromise;
};
const STORE_KEY = "dalbhaat_admin_v1",
  RETENTION_DAYS = 30;
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(e) {
  if (!e) return 0;
  const t = new Date(e + "T00:00:00");
  return (Date.now() - t.getTime()) / 864e5;
}
function collectAllEntries() {
  const e = new Set(),
    t = [];
  return (
    Object.values(awbMap).forEach((n) =>
      n.forEach((n) => {
        e.has(n) || (e.add(n), t.push(n));
      }),
    ),
    Object.values(orderMap).forEach((n) =>
      n.forEach((n) => {
        e.has(n) || (e.add(n), t.push(n));
      }),
    ),
    t
  );
}
function rebuildMapsFromEntries(e) {
  const t = {},
    n = {};
  return (
    (e || []).forEach((e) => {
      (e.awb && (t[e.awb] || (t[e.awb] = []), t[e.awb].push(e)),
        e.orderNo && (n[e.orderNo] || (n[e.orderNo] = []), n[e.orderNo].push(e)));
    }),
    { awbMap: t, orderMap: n }
  );
}
function currentPayload() {
  return {
    savedAt: new Date().toISOString(),
    courier: { scans: courierScans, groupLabels: courierGroupLabels },
    orders: { entries: collectAllEntries(), scanLog: scanLog, loadedFiles: loadedFiles, summaryMap: summaryMap },
    orderMapper: {
      otherVendors: void 0 !== otherVendors ? otherVendors : [],
      learnedMatches: "function" == typeof loadLearned ? loadLearned() : {},
      lotsTiers: "function" == typeof loadLotsTiers ? loadLotsTiers() : {},
    },
  };
}
function buildCloudMetaPayload() {
  return {
    savedAt: new Date().toISOString(),
    courier: { groupLabels: courierGroupLabels },
    orders: { loadedFiles: loadedFiles, summaryMap: summaryMap },
    orderMapper: {
      otherVendors: void 0 !== otherVendors ? otherVendors : [],
      lotsTiers: "function" == typeof loadLotsTiers ? loadLotsTiers() : {},
    },
  };
}
let pushToCloudDebounceTimer = null;
function saveAll() {
  const e = currentPayload();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(e));
  } catch (e) {
    console.warn("Save failed", e);
  }
  (renderBackupStats(),
    clearTimeout(pushToCloudDebounceTimer),
    (pushToCloudDebounceTimer = setTimeout(() => {
      pushToCloud();
    }, 1500)));
}
window.addEventListener("beforeunload", () => {
  pushToCloudDebounceTimer && (clearTimeout(pushToCloudDebounceTimer), pushToCloud());
});
let fbApp = null,
  fbDb = null,
  fbUnsub = null,
  fbLotsUnsub = null;
const DEFAULT_FIREBASE_CONFIG =
  '{\n    apiKey: "AIzaSyDd_XzDHhHqKO9g9ff8k7O32Fs1GLNxhHU",\n    authDomain: "aikm--order-file.firebaseapp.com",\n    projectId: "aikm--order-file",\n    storageBucket: "aikm--order-file.firebasestorage.app",\n    messagingSenderId: "538377843484",\n    appId: "1:538377843484:web:4cc7fe7b6856d8a3ef40d9",\n    measurementId: "G-SKL3HJVEV7"\n  }';
let firebaseConfigStr = "";
try {
  firebaseConfigStr = localStorage.getItem("dalbhaat_firebase_config") || "";
} catch (e) {}
firebaseConfigStr || (firebaseConfigStr = DEFAULT_FIREBASE_CONFIG);
let lastCloudSavedAt = null;
function renderCloudStatus(e) {
  const t = document.getElementById("cloudStatusLine");
  (t &&
    (t.textContent = fbDb
      ? (e || "Connected") +
        (lastCloudSavedAt ? " · Last synced " + new Date(lastCloudSavedAt).toLocaleTimeString() : "")
      : "Not connected."),
    updateGlobalSyncPill(e));
}
function updateGlobalSyncPill(e) {
  const t = document.getElementById("globalSyncStatus");
  if (!t) return;
  if (((t.className = "sync-pill"), !fbDb)) return (t.classList.add("sync-off"), void (t.textContent = "🔴 Sync off"));
  if ("Connecting…" === e) return (t.classList.add("sync-syncing"), void (t.textContent = "🟡 Connecting…"));
  if (e && e.startsWith("Sync failed"))
    return (t.classList.add("sync-error"), (t.textContent = "🔴 Sync failed"), void (t.title = e));
  t.classList.add("sync-on");
  const n = lastCloudSavedAt ? new Date(lastCloudSavedAt).toLocaleTimeString() : "just now";
  ((t.textContent = `🟢 Synced ${n}`), (t.title = ""));
}
function parseFirebaseConfig(e) {
  let t = null;
  const n = (e = e || "").match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (n) t = n[1];
  else {
    const n = e.match(/\{[\s\S]*\}/);
    n && (t = n[0]);
  }
  if (!t) return null;
  try {
    return new Function("return (" + t + ")")();
  } catch (e) {
    return null;
  }
}
function connectFirebase(e) {
  const t = parseFirebaseConfig(e);
  if (t && t.apiKey && t.projectId) {
    try {
      (fbApp || (fbApp = firebase.initializeApp(t)), (fbDb = firebase.firestore()), (firebaseConfigStr = e));
      try {
        localStorage.setItem("dalbhaat_firebase_config", e);
      } catch (e) {}
      renderCloudStatus("Connecting…");
    } catch (e) {
      return void alert("Firebase connection failed: " + e.message);
    }
    try {
      startFirebaseSync();
    } catch (e) {
      console.warn("startFirebaseSync failed:", e);
    }
    try {
      "function" == typeof startLotsCatalogSync && startLotsCatalogSync();
    } catch (e) {
      console.warn("startLotsCatalogSync failed:", e);
    }
    try {
      "function" == typeof startMasterMappingSync && startMasterMappingSync();
    } catch (e) {
      console.warn("startMasterMappingSync failed:", e);
    }
    try {
      "function" == typeof startOmsOrdersSync && startOmsOrdersSync();
    } catch (e) {
      console.warn("startOmsOrdersSync failed:", e);
    }
    try {
      "function" == typeof startSharedDocsSync && startSharedDocsSync();
    } catch (e) {
      console.warn("startSharedDocsSync failed:", e);
    }
  } else
    alert(
      "Could not read a valid Firebase config from that text. Paste the full firebaseConfig object as shown in your Firebase project settings.",
    );
}
async function pushChunkedArrayWithHash(e, t, n) {
  const a = fbDb.collection("aikm_admin").doc("data").collection(e),
    r = {};
  let s;
  const __useLive = "entriesChunks" === e && __entriesListenerLive;
  if (__useLive) {
    /* PERF: the live connection already knows every chunk's fingerprint — no 3.5 MB download needed */
    Object.assign(r, entriesChunksHashCache);
    s = new Set(Object.keys(entriesChunksHashCache));
  } else {
    const o = await a.get();
    o.docs.forEach((e) => {
      r[e.id] = e.data().hash;
    });
    s = new Set(o.docs.map((e) => e.id));
  }
  const l = new Set();
  let i = 0;
  for (let e2 = 0; e2 < t.length; e2 += n) {
    const o = t.slice(e2, e2 + n),
      s2 = `chunk_${i}`;
    l.add(s2);
    const d = crypto_hashLite(o);
    if (r[s2] !== d) {
      await a.doc(s2).set({ items: o, hash: d });
      if ("entriesChunks" === e) {
        entriesChunksCache[s2] = o;
        entriesChunksHashCache[s2] = d;
      }
    }
    i++;
  }
  const d = fbDb.batch();
  let c = 0;
  (s.forEach((e2) => {
    l.has(e2) ||
      (d.delete(a.doc(e2)),
      c++,
      "entriesChunks" === e && (delete entriesChunksCache[e2], delete entriesChunksHashCache[e2]));
  }),
    c && (await d.commit()));
}
function crypto_hashLite(e) {
  const t = JSON.stringify(e);
  let n = 0;
  for (let e = 0; e < t.length; e++) n = ((n << 5) - n + t.charCodeAt(e)) | 0;
  return `${t.length}_${n}`;
}
async function pushToCloud() {
  if (!fbDb) return;
  const e = document.getElementById("globalSyncStatus");
  e && ((e.className = "sync-pill sync-syncing"), (e.textContent = "🟡 Syncing…"));
  try {
    const e = buildCloudMetaPayload();
    (await fbDb.collection("aikm_admin").doc("data").set(e),
      await pushCourierScansToCloud(),
      await pushChunkedArrayWithHash("entriesChunks", collectAllEntries(), 500),
      (lastCloudSavedAt = e.savedAt),
      renderCloudStatus("Synced"));
  } catch (e) {
    (renderCloudStatus(`Sync failed: ${e.message || e.code || "unknown error"}`),
      setTimeout(() => {
        fbDb && pushToCloud();
      }, 5e3));
  }
}
let courierScansConfirmedSynced = new Set();
async function pushCourierScansToCloud() {
  const e = fbDb.collection("aikm_admin").doc("data").collection("courierScansByAwb"),
    t = courierScans.filter((e) => !courierScansConfirmedSynced.has(e.awb));
  if (!t.length) return;
  const n = fbDb.batch();
  (t.forEach((t) => {
    n.set(e.doc(t.awb), t, { merge: !0 });
  }),
    await n.commit(),
    t.forEach((e) => courierScansConfirmedSynced.add(e.awb)));
}
async function deleteCourierScanFromCloud(e) {
  if (fbDb && e)
    try {
      (await fbDb.collection("aikm_admin").doc("data").collection("courierScansByAwb").doc(e).delete(),
        courierScansConfirmedSynced.delete(e));
    } catch (e) {
      console.warn("Delete courier scan from cloud failed:", e.message);
    }
}
async function deleteCourierScansFromCloud(e) {
  /* FIX: this line used to be "|| e ||", so Clear never removed scans from the cloud and they kept coming back */
  if (!fbDb || !e || !e.length) return;
  const t = fbDb.collection("aikm_admin").doc("data").collection("courierScansByAwb");
  for (let n = 0; n < e.length; n += 400) {
    const a = e.slice(n, n + 400);
    try {
      const e = fbDb.batch();
      (a.forEach((n) => e.delete(t.doc(n))), await e.commit(), a.forEach((e) => courierScansConfirmedSynced.delete(e)));
    } catch (e) {
      console.warn("Bulk delete courier scans from cloud failed:", e.message);
    }
  }
}
let fbCourierScansChunksUnsub = null,
  fbScanLogEntriesUnsub = null,
  fbEntriesChunksUnsub = null,
  courierScansByAwbCache = {},
  scanLogEntriesCache = {},
  entriesChunksCache = {},
  entriesChunksHashCache = {},
  __entriesListenerLive = !1;
function startFirebaseSync() {
  fbDb &&
    (fbUnsub && (fbUnsub(), (fbUnsub = null)),
    fbCourierScansChunksUnsub && (fbCourierScansChunksUnsub(), (fbCourierScansChunksUnsub = null)),
    fbScanLogEntriesUnsub && (fbScanLogEntriesUnsub(), (fbScanLogEntriesUnsub = null)),
    fbEntriesChunksUnsub && (fbEntriesChunksUnsub(), (fbEntriesChunksUnsub = null)),
    (courierScansByAwbCache = {}),
    (scanLogEntriesCache = {}),
    (entriesChunksCache = {}),
    (entriesChunksHashCache = {}),
    (__entriesListenerLive = !1),
    (fbUnsub = fbDb
      .collection("aikm_admin")
      .doc("data")
      .onSnapshot(
        (e) => {
          if (!e.exists) return void renderCloudStatus("Connected — waiting for first save");
          const t = e.data();
          t &&
            t.savedAt &&
            (applyCloudMetaData(t), (lastCloudSavedAt = t.savedAt), renderCloudStatus("Synced (real-time)"));
        },
        (e) => {
          renderCloudStatus("Sync error — check Firestore rules allow read/write");
        },
      )),
    (fbCourierScansChunksUnsub = fbDb
      .collection("aikm_admin")
      .doc("data")
      .collection("courierScansByAwb")
      .onSnapshot(
        (e) => {
          (e.docChanges().forEach((e) => {
            const t = e.doc.id;
            "removed" === e.type
              ? delete courierScansByAwbCache[t]
              : ((courierScansByAwbCache[t] = e.doc.data()), courierScansConfirmedSynced.add(t));
          }),
            /* FIX: keep scans made on this system that haven't reached the cloud yet (they were being dropped
               whenever another cloud update arrived a moment after scanning) */
            (courierScans = Object.values(courierScansByAwbCache).concat(
              courierScans.filter((s) => !(s.awb in courierScansByAwbCache) && !courierScansConfirmedSynced.has(s.awb)),
            )),
            courierScans.forEach((e) => {
              e.groupKey in courierGroupLabels ||
                (courierGroupLabels[e.groupKey] = DEFAULT_PREFIXES[e.groupKey] || e.groupKey);
            }),
            renderScans(),
            generate(),
            renderBackupStats());
        },
        (e) => console.warn("Courier scans sync error", e),
      )),
    (fbScanLogEntriesUnsub = startScanLogSync()),
    (fbEntriesChunksUnsub = fbDb
      .collection("aikm_admin")
      .doc("data")
      .collection("entriesChunks")
      .onSnapshot(
        (e) => {
          let __changed = !1;
          e.docChanges().forEach((e) => {
            const id = e.doc.id;
            if ("removed" === e.type) {
              if (id in entriesChunksCache) {
                delete entriesChunksCache[id];
                delete entriesChunksHashCache[id];
                __changed = !0;
              }
              return;
            }
            const d = e.doc.data() || {};
            /* PERF: identical fingerprint = nothing new (usually our own save coming back) — skip the rebuild */
            if (d.hash && id in entriesChunksCache && entriesChunksHashCache[id] === d.hash) return;
            entriesChunksCache[id] = d.items || [];
            entriesChunksHashCache[id] = d.hash;
            __changed = !0;
          });
          __entriesListenerLive = !0;
          if (!__changed) return;
          const t = rebuildMapsFromEntries(
            Object.keys(entriesChunksCache)
              .sort((e, t) => parseInt(e.split("_")[1]) - parseInt(t.split("_")[1]))
              .flatMap((e) => entriesChunksCache[e]),
          );
          ((awbMap = t.awbMap),
            (orderMap = t.orderMap),
            reresolveNotFound(),
            renderFileChips(),
            renderSummary(),
            rebuildHistoryTable(),
            updateStats(),
            renderBackupStats());
        },
        (e) => console.warn("Entries chunk sync error", e),
      )),
    loadSavedFilesList());
}
function applyCloudMetaData(e) {
  if (
    ((courierGroupLabels = (e.courier && e.courier.groupLabels) || {}),
    (loadedFiles = (e.orders && e.orders.loadedFiles) || []),
    (summaryMap = (e.orders && e.orders.summaryMap) || {}),
    e.orderMapper)
  ) {
    const t = e.orderMapper;
    if (Array.isArray(t.otherVendors) && void 0 !== otherVendors) {
      otherVendors = t.otherVendors;
      try {
        void 0 !== OTHER_VENDORS_KEY && localStorage.setItem(OTHER_VENDORS_KEY, JSON.stringify(otherVendors));
      } catch (e) {}
      "function" == typeof renderOtherVendorChips && renderOtherVendorChips();
    }
    (t.lotsTiers && "function" == typeof saveLotsTiers && saveLotsTiers(t.lotsTiers),
      "function" == typeof checkReady && checkReady());
  }
  (renderFileChips(), renderSummary(), updateStats(), renderBackupStats());
}
function applyLoadedData(e, t) {
  if (
    ((courierScans = (e.courier && e.courier.scans) || []),
    (courierGroupLabels = (e.courier && e.courier.groupLabels) || {}),
    e.orders && Array.isArray(e.orders.entries))
  ) {
    const t = rebuildMapsFromEntries(e.orders.entries);
    ((awbMap = t.awbMap), (orderMap = t.orderMap));
  } else ((awbMap = (e.orders && e.orders.awbMap) || {}), (orderMap = (e.orders && e.orders.orderMap) || {}));
  if (
    ((scanLog = (e.orders && e.orders.scanLog) || []),
    (loadedFiles = (e.orders && e.orders.loadedFiles) || []),
    (summaryMap = (e.orders && e.orders.summaryMap) || {}),
    (notFoundCount = scanLog.filter((e) => "NOT FOUND" === e.Product).length),
    (lossCount = scanLog.filter((e) => "YES" === e.Loss).length),
    reresolveNotFound(),
    e.orderMapper)
  ) {
    const t = e.orderMapper;
    if (Array.isArray(t.otherVendors) && void 0 !== otherVendors) {
      otherVendors = t.otherVendors;
      try {
        void 0 !== OTHER_VENDORS_KEY && localStorage.setItem(OTHER_VENDORS_KEY, JSON.stringify(otherVendors));
      } catch (e) {}
      "function" == typeof renderOtherVendorChips && renderOtherVendorChips();
    }
    if (t.learnedMatches && "function" == typeof loadLearned && "function" == typeof saveLearned) {
      const e = loadLearned(),
        n = { ...e, ...t.learnedMatches };
      (Object.keys(e).forEach((a) => {
        t.learnedMatches[a] && e[a].savedAt > t.learnedMatches[a].savedAt && (n[a] = e[a]);
      }),
        saveLearned(n));
    }
    (t.lotsTiers && "function" == typeof saveLotsTiers && saveLotsTiers(t.lotsTiers),
      "function" == typeof renderMasterMapping && renderMasterMapping(),
      "function" == typeof checkReady && checkReady());
  }
  (renderScans(),
    generate(),
    renderFileChips(),
    renderSummary(),
    rebuildHistoryTable(),
    updateStats(),
    renderBackupStats(),
    "function" == typeof refreshLiveSummaryCount && refreshLiveSummaryCount());
}
function loadPersisted() {
  let e, t;
  try {
    e = localStorage.getItem(STORE_KEY);
  } catch (t) {
    e = null;
  }
  if (e) {
    try {
      t = JSON.parse(e);
    } catch (e) {
      return;
    }
    applyLoadedData(t, !0);
  }
}
function downloadBackup() {
  const e = currentPayload(),
    t = new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }),
    n = URL.createObjectURL(t),
    a = document.createElement("a"),
    o = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  ((a.href = n),
    (a.download = `AIKM_Admin_Backup_${o}.json`),
    document.body.appendChild(a),
    a.click(),
    document.body.removeChild(a),
    URL.revokeObjectURL(n));
}
function clearAllData() {
  confirm("This will permanently delete all saved courier and order data from this browser. Continue?") &&
    (localStorage.removeItem(STORE_KEY),
    (courierScans = []),
    (courierGroupLabels = {}),
    (awbMap = {}),
    (orderMap = {}),
    (scanLog = []),
    (loadedFiles = []),
    (summaryMap = {}),
    (notFoundCount = 0),
    (lossCount = 0),
    renderScans(),
    generate(),
    renderFileChips(),
    renderSummary(),
    rebuildHistoryTable(),
    updateStats(),
    renderBackupStats());
}
function renderBackupStats() {
  const e = document.getElementById("backupStats");
  if (!e) return;
  let t = "";
  try {
    t = localStorage.getItem(STORE_KEY) || "";
  } catch (e) {}
  const n = (t.length / 1024).toFixed(1);
  e.innerHTML = `\n      <div class="bstat"><div class="bnum">${courierScans.length}</div><div class="blabel">Courier scans stored</div></div>\n      <div class="bstat"><div class="bnum">${scanLog.length}</div><div class="blabel">Order scans stored</div></div>\n      <div class="bstat"><div class="bnum">${loadedFiles.filter((e) => e.ok).length}</div><div class="blabel">Master files kept</div></div>\n      <div class="bstat"><div class="bnum">${n} KB</div><div class="blabel">Storage used</div></div>`;
  const a = document.getElementById("lastSavedLine");
  a && (a.textContent = "Last saved: " + new Date().toLocaleString() + " · Kept permanently until manually deleted.");
}
document.getElementById("restoreInput").addEventListener("change", function (e) {
  const t = e.target.files[0];
  if (!t) return;
  const n = new FileReader();
  ((n.onload = function (e) {
    let t;
    try {
      t = JSON.parse(e.target.result);
    } catch (e) {
      return void alert("This does not look like a valid backup file.");
    }
    confirm("This will replace all data currently loaded with the backup file. Continue?") &&
      (applyLoadedData(t, !1), saveAll(), alert("Backup restored."));
  }),
    n.readAsText(t),
    (e.target.value = ""));
});
let courierScans = [],
  courierGroupLabels = {};

const COURIER_RULES = [
    { name: "Shadowfax", test: /^SF/ },
    { name: "Ekart (Flipkart)", test: /^SDL[CP]/ },
    { name: "DTDC", test: /^(7D\d+|I\d{8})$/ },
    { name: "Delhivery Surface", test: /^56037710\d+$/ },
    { name: "Delhivery", test: /^(1490\d{9,13}|7269\d{9}|3448\d{8,10}|2911\d{8,10})$/ },
    { name: "Xpressbees", test: /^(1434\d{9,10}|1524\d{10,11}|127951\d{5,7}|13\d{10,12})$/ },
    { name: "Amazon Shipping", test: /^(371\d{9}|168\d{9}|515\d{9}|AM\d{6,9}IN)$/ },
  ],
  DEFAULT_PREFIXES = { VL: "Valmo" };
function detectGroupKey(e) {
  e = e.trim().replace(/^`+/, "").toUpperCase();
  for (const t of COURIER_RULES) if (t.test.test(e)) return t.name;
  if (/^VL/.test(e)) return "VL";
  let t = e.match(/^[A-Z]+/);
  return t && t[0].length >= 2 ? t[0] : e.substring(0, 3) || "UNKNOWN";
}
function askCourierName(e) {
  return new Promise((t) => {
    const n = document.getElementById("courierNameModal"),
      a = document.getElementById("courierModalInput"),
      o = document.getElementById("courierModalSave"),
      r = document.getElementById("courierModalSkip");
    function s() {
      ((n.style.display = "none"),
        o.removeEventListener("click", l),
        r.removeEventListener("click", i),
        a.removeEventListener("keydown", d));
    }
    function l() {
      const n = a.value.trim();
      (s(), t(n || e));
    }
    function i() {
      (s(), t(e));
    }
    function d(e) {
      ("Enter" === e.key && (e.preventDefault(), l()), "Escape" === e.key && (e.preventDefault(), i()));
    }
    ((document.getElementById("courierModalPrefix").textContent = e),
      (a.value = ""),
      (n.style.display = "flex"),
      setTimeout(() => {
        a.focus();
      }, 50),
      o.addEventListener("click", l),
      r.addEventListener("click", i),
      a.addEventListener("keydown", d));
  });
}
function askDuplicateConfirm(e, t) {
  return askPremiumConfirm({
    kicker: "Duplicate AWB",
    title: e,
    message: `Already scanned under ${courierGroupLabels[t.groupKey] || t.groupKey} on ${t.date || "—"}.`,
    confirmLabel: "Add Anyway",
    cancelLabel: "Skip",
  });
}
async function addScan(e, t) {
  ((t = t || {}), (e = e.trim().replace(/^`+/, "")));
  const n = courierScans.find((t) => t.awb === e);
  if (n) {
    if (t.silent) return !1;
    if (!(await askDuplicateConfirm(e, n))) return !1;
  }
  const a = detectGroupKey(e),
    o = !(a in courierGroupLabels) && !(a in DEFAULT_PREFIXES);
  if ((courierScans.push({ awb: e, groupKey: a, date: todayStr(), scannedAt: Date.now() }), !(a in courierGroupLabels)))
    if (o) {
      const e = await askCourierName(a);
      courierGroupLabels[a] = e || a;
    } else courierGroupLabels[a] = DEFAULT_PREFIXES[a] || a;
  return (t.silent || (renderScans(), generate(), saveAll()), !0);
}
async function bulkAddCourierScans() {
  const e = document.getElementById("courierBulkInput"),
    t = document.getElementById("courierBulkStatus"),
    n = e.value
      .split(/\r?\n|,/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  if (0 === n.length) return void (t.textContent = "Paste at least one AWB first.");
  t.textContent = `Adding ${n.length}…`;
  let a = 0;
  for (const e of n) {
    !1 === (await addScan(e, { silent: !0 })) && a++;
  }
  (renderScans(), generate(), saveAll());
  const o = n.length - a;
  ((t.textContent =
    `✓ Added ${o} AWB${1 === o ? "" : "s"}` + (a ? `, ${a} duplicate${1 === a ? "" : "s"} skipped.` : ".")),
    (e.value = ""),
    updateCourierBulkCount());
}
function updateCourierBulkCount() {
  const e = document.getElementById("courierBulkInput"),
    t = document.getElementById("courierBulkCount");
  if (!e || !t) return;
  const n = e.value
    .split(/\r?\n|,/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0).length;
  t.textContent = n ? `${n} AWB${1 === n ? "" : "s"} pasted` : "";
}
function undoScan() {
  const e = courierScans.pop();
  (renderScans(), generate(), saveAll(), e && deleteCourierScanFromCloud(e.awb));
}
function clearScans() {
  const e = courierScans.map((e) => e.awb);
  ((courierScans = []),
    renderScans(),
    (document.getElementById("manifest").innerHTML = ""),
    (document.getElementById("manifest").style.display = "none"),
    saveAll(),
    deleteCourierScansFromCloud(e));
}
(COURIER_RULES.forEach((e) => {
  DEFAULT_PREFIXES[e.name] = e.name;
}),
  document.getElementById("courierScanInput").addEventListener("keydown", function (e) {
    if ("Enter" === e.key) {
      e.preventDefault();
      const t = this.value.trim();
      (t && addScan(t), (this.value = ""));
    }
  }),
  document.addEventListener("DOMContentLoaded", function () {
    const e = document.getElementById("courierBulkInput");
    e && e.addEventListener("input", updateCourierBulkCount);
  }));
const STATIC_COURIER_SUGGESTIONS = [
  "Delhivery",
  "Ecom Express",
  "Xpressbees",
  "Shadowfax",
  "DTDC",
  "Bluedart",
  "Amazon Shipping",
  "Ekart (Flipkart)",
  "India Post",
  "Shree Maruti",
  "Professional Couriers",
  "Trackon",
  "Wow Express",
  "Ecom Xpress",
];
function allKnownCourierNames() {
  const e = new Set(STATIC_COURIER_SUGGESTIONS);
  return (
    Object.values(courierGroupLabels).forEach((t) => t && e.add(t)),
    Object.values(DEFAULT_PREFIXES).forEach((t) => e.add(t)),
    Array.from(e).sort((e, t) => e.localeCompare(t))
  );
}
function hexToRgba(e, t) {
  const n = e.replace("#", "");
  return `rgba(${parseInt(n.substring(0, 2), 16)},${parseInt(n.substring(2, 4), 16)},${parseInt(n.substring(4, 6), 16)},${t})`;
}
function renderScans() {
  const e = document.getElementById("scanTable");
  if (e && !e.closest(".table-scroll")) {
    const t = document.createElement("div");
    ((t.className = "table-scroll"), (t.style.maxHeight = "360px"), e.parentNode.insertBefore(t, e), t.appendChild(e));
  }
  const t = document.getElementById("scanBody"),
    n = courierScans.slice().sort((e, t) => (t.scannedAt || 0) - (e.scannedAt || 0));
  if (0 === courierScans.length) ((e.style.display = "none"), (t.innerHTML = ""));
  else {
    e.style.display = "table";
    const a = buildOmsAwbLookupMap();
    t.innerHTML = n
      .map((e, t) => {
        const n = lookupOmsInfoByAwb(e.awb, a),
          o = courierGroupLabels[e.groupKey] || e.groupKey,
          r = colorForCourier(o);
        return `<tr style="background:${hexToRgba(r, 0.07)};">\n        <td style="padding:3px 6px;">${t + 1}</td>\n        <td style="padding:3px 6px;">${escapeHtml(e.awb)}</td>\n        <td style="padding:3px 6px;font-weight:700;color:${r};">${escapeHtml(o)}</td>\n        <td style="padding:3px 6px;">${escapeHtml(n.channel)}</td>\n        <td style="padding:3px 6px;">${escapeHtml(n.orderDate)}</td>\n        <td style="padding:3px 6px;"><button type="button" class="scan-del-btn" onclick="deleteScan('${e.awb.replace(/'/g, "\\'")}')" title="Delete this scan">🗑</button></td></tr>`;
      })
      .join("");
  }
  const a = document.getElementById("groupEditor"),
    o = Object.keys(courierGroupLabels).filter((e) => courierScans.some((t) => t.groupKey === e)),
    r = allKnownCourierNames();
  (o.length
    ? (a.innerHTML =
        '<table class="data" style="margin-top:10px;"><thead><tr><th>Prefix</th><th>Count</th><th>Courier</th><th></th></tr></thead><tbody>' +
        o
          .map((e) => {
            const t = courierScans.filter((t) => t.groupKey === e).length,
              n = courierGroupLabels[e],
              a = r.includes(n) ? r : [n, ...r];
            return `<tr><td>${escapeHtml(e)}</td><td>${t}</td><td>\n            <select class="courier-name-select" onchange="handleCourierDropdown('${e.replace(/'/g, "\\'")}', this)" style="width:100%;">\n              ${a.map((e) => `<option value="${escapeHtml(e)}" ${e === n ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}\n              <option value="__add_new__">+ Add new courier…</option>\n            </select>\n          </td><td><button type="button" class="scan-del-btn" onclick="deleteCourierPrefix('${e.replace(/'/g, "\\'")}')" title="Forget this saved courier name — synced everywhere, including deletion">🗑</button></td></tr>`;
          })
          .join("") +
        "</tbody></table>")
    : (a.innerHTML = ""),
    renderMasterPrefixMapper());
}
function askDeletePrefixConfirm(e) {
  return askPremiumConfirm({
    kicker: "Forget Courier Name",
    title: `Prefix "${e}"`,
    message: `Currently saved as "${courierGroupLabels[e] || e}". Existing scans keep their AWBs — this only means it'll ask again next time this prefix is scanned.`,
    confirmLabel: "Forget It",
  });
}
async function deleteCourierPrefix(e) {
  (await askDeletePrefixConfirm(e)) && (delete courierGroupLabels[e], renderScans(), generate(), saveAll());
}
function renderMasterPrefixMapper() {
  const e = document.getElementById("masterPrefixMapper");
  if (!e) return;
  const t = Object.keys(courierGroupLabels).sort((e, t) => e.localeCompare(t));
  t.length
    ? (e.innerHTML =
        '<table class="data"><thead><tr><th>Prefix</th><th>Courier</th><th></th></tr></thead><tbody>' +
        t
          .map(
            (e) =>
              `<tr><td>${escapeHtml(e)}</td><td>${escapeHtml(courierGroupLabels[e])}</td>\n        <td><button type="button" class="scan-del-btn" onclick="deleteCourierPrefix('${e.replace(/'/g, "\\'")}')" title="Forget this saved courier name — asks again next time this prefix is scanned">🗑</button></td></tr>`,
          )
          .join("") +
        "</tbody></table>")
    : (e.innerHTML = '<small class="hint">No courier prefixes saved yet.</small>');
}
function buildOmsAwbLookupMap() {
  const e = new Map(),
    t = new Map(),
    n = new Map();
  return (
    (window.omsOrdersRaw || []).forEach((a) => {
      const o = (a.awb || "").trim();
      if (!o) return;
      e.has(o) || e.set(o, a);
      const r = o.replace(/\D/g, "");
      if (r && (t.has(r) || t.set(r, a), r.length >= 8)) {
        const e = r.slice(-8);
        n.has(e) || n.set(e, a);
      }
    }),
    { exact: e, digits: t, suffix8: n }
  );
}
function lookupOmsInfoByAwb(e, t) {
  const n = (e || "").trim();
  if (!n) return { channel: "—", orderDate: "—" };
  const a = n.replace(/\D/g, ""),
    o = t || buildOmsAwbLookupMap();
  let r = o.exact.get(n);
  return (
    !r && a && (r = o.digits.get(a)),
    !r && a.length >= 8 && (r = o.suffix8.get(a.slice(-8))),
    r ? { channel: r.channel || "—", orderDate: r.orderDate || "—" } : { channel: "—", orderDate: "—" }
  );
}
async function handleCourierDropdown(e, t) {
  if ("__add_new__" === t.value) {
    const t = await askCourierName(e);
    return void (t && t !== e ? renameGroup(e, t) : renderScans());
  }
  renameGroup(e, t.value);
}
function ensurePremiumConfirmModal() {
  if (document.getElementById("premiumConfirmModal")) return;
  const e = document.createElement("div");
  ((e.id = "premiumConfirmModal"),
    (e.className = "admin-modal-overlay"),
    (e.style.display = "none"),
    (e.innerHTML =
      '\n      <div class="admin-modal-box">\n        <div class="admin-modal-glow"></div>\n        <div class="admin-modal-head">\n          <span class="admin-modal-kicker" id="premiumConfirmKicker"></span>\n          <h3 id="premiumConfirmTitle" style="color:var(--shell-text,#1a2233);"></h3>\n        </div>\n        <div class="admin-modal-body"><p id="premiumConfirmMessage" style="white-space:pre-line;color:var(--shell-text-dim,#4a5468);"></p></div>\n        <div class="admin-modal-actions">\n          <button type="button" class="admin-modal-btn ghost" id="premiumConfirmCancel">Cancel</button>\n          <button type="button" class="admin-modal-btn gold" id="premiumConfirmOk">Confirm</button>\n        </div>\n      </div>'),
    document.body.appendChild(e));
}
function askPremiumConfirm(e) {
  return (
    ensurePremiumConfirmModal(),
    new Promise((t) => {
      const n = document.getElementById("premiumConfirmModal");
      ((document.getElementById("premiumConfirmKicker").textContent = e.kicker || "Confirm"),
        (document.getElementById("premiumConfirmTitle").innerHTML = e.title || ""),
        (document.getElementById("premiumConfirmMessage").textContent = e.message || ""));
      const a = document.getElementById("premiumConfirmOk"),
        o = document.getElementById("premiumConfirmCancel");
      function r() {
        ((n.style.display = "none"), a.removeEventListener("click", s), o.removeEventListener("click", l));
      }
      function s() {
        (r(), t(!0));
      }
      function l() {
        (r(), t(!1));
      }
      ((a.textContent = e.confirmLabel || "Confirm"),
        (o.textContent = e.cancelLabel || "Cancel"),
        (n.style.display = "flex"),
        a.addEventListener("click", s),
        o.addEventListener("click", l));
    })
  );
}
function ensureTextPromptModal() {
  if (document.getElementById("premiumPromptModal")) return;
  const e = document.createElement("div");
  ((e.id = "premiumPromptModal"),
    (e.className = "admin-modal-overlay"),
    (e.style.display = "none"),
    (e.innerHTML =
      '\n      <div class="admin-modal-box">\n        <div class="admin-modal-glow"></div>\n        <div class="admin-modal-head">\n          <span class="admin-modal-kicker" id="premiumPromptKicker"></span>\n          <h3 id="premiumPromptTitle" style="color:var(--shell-text,#1a2233);"></h3>\n        </div>\n        <div class="admin-modal-body">\n          <p id="premiumPromptMessage" style="white-space:pre-line;color:var(--shell-text-dim,#4a5468);"></p>\n          <input type="text" id="premiumPromptInput" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(212,175,55,.35);background:rgba(255,255,255,.06);color:inherit;font-family:inherit;font-size:13px;margin-top:4px;box-sizing:border-box;">\n        </div>\n        <div class="admin-modal-actions">\n          <button type="button" class="admin-modal-btn ghost" id="premiumPromptCancel">Cancel</button>\n          <button type="button" class="admin-modal-btn gold" id="premiumPromptOk">Save</button>\n        </div>\n      </div>'),
    document.body.appendChild(e));
}
function askTextPrompt(e) {
  return (
    ensureTextPromptModal(),
    new Promise((t) => {
      const n = document.getElementById("premiumPromptModal");
      ((document.getElementById("premiumPromptKicker").textContent = e.kicker || ""),
        (document.getElementById("premiumPromptTitle").innerHTML = e.title || ""),
        (document.getElementById("premiumPromptMessage").textContent = e.message || ""));
      const a = document.getElementById("premiumPromptInput");
      ((a.value = e.defaultValue || ""), (a.placeholder = e.placeholder || ""));
      const o = document.getElementById("premiumPromptOk"),
        r = document.getElementById("premiumPromptCancel");
      function s() {
        ((n.style.display = "none"),
          o.removeEventListener("click", l),
          r.removeEventListener("click", i),
          a.removeEventListener("keydown", d));
      }
      function l() {
        const e = a.value.trim();
        (s(), t(e || null));
      }
      function i() {
        (s(), t(null));
      }
      function d(e) {
        ("Enter" === e.key && (e.preventDefault(), l()), "Escape" === e.key && (e.preventDefault(), i()));
      }
      ((o.textContent = e.confirmLabel || "Save"),
        (n.style.display = "flex"),
        setTimeout(() => {
          (a.focus(), a.select());
        }, 50),
        o.addEventListener("click", l),
        r.addEventListener("click", i),
        a.addEventListener("keydown", d));
    })
  );
}
async function deleteScan(e) {
  const t = courierScans.findIndex((t) => t.awb === e),
    n = courierScans[t];
  if (!n) return;
  (await askPremiumConfirm({
    kicker: "Delete Scan",
    title: `AWB "${e}"`,
    message: `Courier: ${courierGroupLabels[n.groupKey] || n.groupKey}\n\nThis cannot be undone.`,
    confirmLabel: "Delete",
  })) && (courierScans.splice(t, 1), renderScans(), generate(), saveAll(), deleteCourierScanFromCloud(e));
}
function renameGroup(e, t) {
  ((courierGroupLabels[e] = t || e), renderScans(), generate(), saveAll());
}
const MANIFEST_COLORS = ["#0f1e35", "#7a1f2b", "#2f5d3a", "#8a5a00", "#4a2f7a", "#005f73", "#a13d63", "#1c2f4d"];
function colorForCourier(e) {
  let t = 0;
  for (let n = 0; n < e.length; n++) t = (31 * t + e.charCodeAt(n)) | 0;
  return MANIFEST_COLORS[Math.abs(t) % MANIFEST_COLORS.length];
}
function generate() {
  if (0 === courierScans.length) return;
  const e = document.getElementById("manifestDate").value || "—",
    t = document.getElementById("feName").value || "__________",
    n = document.getElementById("feMobile").value || "__________",
    a = {};
  courierScans.forEach((e) => {
    const t = courierGroupLabels[e.groupKey] || e.groupKey;
    (a[t] || (a[t] = []), a[t].push(e));
  });
  const o = Object.keys(a).sort((e, t) => e.localeCompare(t, void 0, { sensitivity: "base" })),
    r = document.getElementById("manifest");
  (r.dataset.scrollBoxed ||
    ((r.style.maxHeight = "600px"), (r.style.overflowY = "auto"), (r.dataset.scrollBoxed = "1")),
    (r.innerHTML = o
      .map((o) => {
        const r = a[o].slice().sort((e, t) => e.awb.localeCompare(t.awb, void 0, { numeric: !0, sensitivity: "base" })),
          s = r.map((e, t) => `<div class="awb-item"><b>${t + 1}.</b>${escapeHtml(e.awb)}</div>`).join(""),
          l = r.length <= 20 ? 3 : r.length <= 60 ? 4 : r.length <= 150 ? 5 : 6,
          i = colorForCourier(o),
          d = o.replace(/'/g, "\\'");
        return `<div class="courier-block" data-manifest-label="${escapeHtml(o)}" style="border-color:${i};">\n        <div class="row no-print" style="justify-content:flex-end;margin-top:0;margin-bottom:6px;">\n          <button type="button" class="secondary" style="font-size:11px;padding:4px 10px;" onclick="exportManifestSheetPDF('${d}')">📄 Export PDF</button>\n          <button type="button" class="secondary" style="font-size:11px;padding:4px 10px;" onclick="exportManifestSheetExcel('${d}')">📊 Export Excel</button>\n        </div>\n        <div class="m-header" style="display:block;text-align:center;position:relative;">\n          <div style="position:absolute;right:0;top:0;font-size:13px;font-weight:600;color:#444;">${escapeHtml(e)}</div>\n          <h1 style="background:none;-webkit-background-clip:initial;background-clip:initial;color:${i};font-size:22px;margin:0 70px 2px;">${escapeHtml(o)} Handover Sheet</h1>\n          <span style="display:block;">AIKM Pharma · Shipment Handover</span>\n        </div>\n        <div class="meta" style="font-size:12.5px;"><div>FE: ${escapeHtml(t)} (${escapeHtml(n)})</div><div>Total: ${r.length}</div></div>\n        <div class="man-grid" style="column-count:${l};font-size:12.5px;line-height:1.9;border-top-color:${i};">${s}</div>\n        <div class="footer-sign" style="font-size:11.5px;"><div>Handed over by (AIKM Pharma)</div><div>Received by: ${escapeHtml(t)} — ${escapeHtml(o)} — Sign &amp; Stamp</div></div>\n      </div>`;
      })
      .join("")),
    (r.style.display = "block"),
    (window.__lastManifestGroups = a),
    (window.__lastManifestMeta = { date: e, feName: t, feMobile: n }));
}
function exportManifestSheetPDF(e) {
  const t = Array.from(document.querySelectorAll(".courier-block")),
    n = [];
  let a = null;
  (t.forEach((t) => {
    t.dataset.manifestLabel !== e ? (n.push(t), (t.style.display = "none")) : (a = t);
  }),
    a && a.setAttribute("data-no-break", "1"));
  const o = window.__lastManifestMeta || {},
    r = document.title;
  document.title = `${e}_${(o.date || todayStr()).replace(/[^a-z0-9]+/gi, "-")}`;
  const s = () => {
    (n.forEach((e) => {
      e.style.display = "";
    }),
      a && a.removeAttribute("data-no-break"),
      (document.title = r),
      window.removeEventListener("afterprint", s));
  };
  (window.addEventListener("afterprint", s), window.print());
}
function exportManifestSheetExcel(e) {
  const t = window.__lastManifestGroups || {},
    n = window.__lastManifestMeta || {},
    a = (t[e] || []).slice().sort((e, t) => e.awb.localeCompare(t.awb, void 0, { numeric: !0, sensitivity: "base" }));
  if (!a.length) return;
  const o = a.length <= 20 ? 3 : a.length <= 60 ? 4 : a.length <= 150 ? 5 : 6,
    r = [
      [`${e} Handover Sheet — AIKM Pharma · Shipment Handover`],
      [`Date: ${n.date || ""}    FE: ${n.feName || ""} (${n.feMobile || ""})    Total: ${a.length}`],
      [],
    ];
  for (let e = 0; e < a.length; e += o) {
    const t = [];
    for (let n = 0; n < o; n++) {
      const o = e + n;
      t.push(o < a.length ? `${o + 1}. ${a[o].awb}` : "");
    }
    r.push(t);
  }
  const s = XLSX.utils.aoa_to_sheet(r);
  ((s["!cols"] = new Array(o).fill({ wch: 20 })),
    (s["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: o - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: o - 1 } },
    ]));
  const l = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(l, s, "Handover Sheet");
  const i = e.replace(/[^a-z0-9]+/gi, "_").slice(0, 30),
    d = (n.date || todayStr()).replace(/[^a-z0-9]+/gi, "-");
  XLSX.writeFile(l, `${i}_${d}.xlsx`);
}
let awbMap = {},
  orderMap = {},
  scanLog = [],
  summaryMap = {},
  loadedFiles = [],
  notFoundCount = 0,
  lossCount = 0;
const fileInput = document.getElementById("fileInput"),
  masterStatus = document.getElementById("masterStatus"),
  fileChips = document.getElementById("fileChips"),
  scanInput = document.getElementById("scanInput"),
  resultBox = document.getElementById("resultBox"),
  historyBody = document.getElementById("historyBody"),
  summaryBody = document.getElementById("summaryBody"),
  summarySearch = document.getElementById("summarySearch"),
  logSearch = document.getElementById("logSearch"),
  notfoundSearch = document.getElementById("notfoundSearch"),
  notfoundBody = document.getElementById("notfoundBody"),
  lossSearch = document.getElementById("lossSearch"),
  lossBody = document.getElementById("lossBody"),
  statFiles = document.getElementById("statFiles"),
  statAwbs = document.getElementById("statAwbs"),
  statScanned = document.getElementById("statScanned"),
  statNotFound = document.getElementById("statNotFound"),
  statLoss = document.getElementById("statLoss");
function applyFilter(e, t) {
  const n = e.value.trim().toLowerCase();
  Array.from(t.rows).forEach((e) => {
    const t = e.textContent.toLowerCase();
    e.style.display = n.length > 0 && !t.includes(n) ? "none" : "";
  });
}
function normalizeHeader(e) {
  return String(e || "")
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findCol(e, t) {
  for (const n of t) {
    const t = e.findIndex((e) => normalizeHeader(e) === n);
    if (-1 !== t) return t;
  }
  for (const n of t) {
    const t = e.findIndex((e) => normalizeHeader(e).includes(n));
    if (-1 !== t) return t;
  }
  return -1;
}
function cleanAwb(e) {
  return null == e ? "" : String(e).replace(/^`/, "").trim().toUpperCase();
}
function fmtMoney(e) {
  return "₹" + (Math.round(100 * e) / 100).toLocaleString("en-IN");
}
function channelBadge(e) {
  return `<span class="channel-badge">${escapeHtml(String(e || "—"))}</span>`;
}
function isAmazonChannel(e) {
  return (e.channel || "").toLowerCase().includes("amazon");
}
function hasMobile(e) {
  return !!(e.mobile && String(e.mobile).trim().length > 0);
}
function shipTypeLabel(e) {
  return isAmazonChannel(e) ? (hasMobile(e) ? "Self Ship" : "Easy Ship") : "Channel Ship";
}
function isLossEntry(e) {
  const t = Number(e.profit) || 0;
  return isAmazonChannel(e) ? (hasMobile(e) ? t <= 45 : t <= 10) : t < 20;
}
function updateStats() {
  ((statFiles.textContent = loadedFiles.filter((e) => e.ok).length),
    (statAwbs.textContent = Object.keys(awbMap).length),
    (statScanned.textContent = scanLog.length),
    (statNotFound.textContent = notFoundCount),
    (statLoss.textContent = lossCount),
    updateRtabCounts());
}
function updateRtabCounts() {
  const e = document.getElementById("countSummary"),
    t = document.getElementById("countScanLog"),
    n = document.getElementById("countNotFound"),
    a = document.getElementById("countLoss");
  (e && (e.textContent = Object.keys(summaryMap).length),
    t && (t.textContent = scanLog.length),
    n && (n.textContent = notFoundCount),
    a && (a.textContent = lossCount));
}
function renderFileChips() {
  ((fileChips.innerHTML = ""),
    loadedFiles.forEach((e) => {
      const t = document.createElement("div");
      t.className = "chip";
      const n = e.ok
        ? `${e.rowCount} rows${e.syncedAt ? " · synced " + e.syncedAt : ""}${e.missing && e.missing.length ? " · missing: " + e.missing.join(", ") : ""}`
        : `failed — ${e.error}`;
      t.innerHTML = `<span title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span><span style="color:#888;">${n}</span>`;
      const a = document.createElement("button");
      ((a.className = "fdel"),
        (a.textContent = "×"),
        (a.title = "Remove this file"),
        a.addEventListener("click", () => removeFile(e.name)),
        t.appendChild(a),
        fileChips.appendChild(t));
    }),
    updateStats());
}
function removeFile(e) {
  ((loadedFiles = loadedFiles.filter((t) => t.name !== e)),
    Object.keys(awbMap).forEach((t) => {
      ((awbMap[t] = awbMap[t].filter((t) => t.sourceFile !== e)), 0 === awbMap[t].length && delete awbMap[t]);
    }),
    Object.keys(orderMap).forEach((t) => {
      ((orderMap[t] = orderMap[t].filter((t) => t.sourceFile !== e)), 0 === orderMap[t].length && delete orderMap[t]);
    }));
  const t = loadedFiles.filter((e) => e.ok);
  ((masterStatus.textContent = t.length
    ? `Loaded ${t.reduce((e, t) => e + t.rowCount, 0)} rows across ${t.length} file(s), ${Object.keys(awbMap).length} unique AWBs total.`
    : "OMS orders sync automatically. Extra sheets you upload are kept for 7 days."),
    renderFileChips(),
    saveAll());
}
function processOneFile(e) {
  return new Promise((t) => {
    const n = new FileReader();
    ((n.onload = function (n) {
      try {
        const a = new Uint8Array(n.target.result),
          o = XLSX.read(a, { type: "array" });
        let r = -1,
          s = -1,
          l = -1,
          i = -1,
          d = -1,
          c = -1,
          p = -1,
          u = -1,
          m = -1,
          f = null,
          y = null,
          npCols = null;
        for (const e of o.SheetNames) {
          const t = o.Sheets[e],
            n = XLSX.utils.sheet_to_json(t, { header: 1, defval: null });
          if (!n.length) continue;
          const a = n[0],
            h = findCol(a, ["awb", "awb number", "shipment tracker", "tracking id", "tracking number", "shipment id"]),
            g = findCol(a, ["product name", "product", "item name", "sku name"]),
            b = findCol(a, ["qty", "quantity"]),
            S = findCol(a, ["product details", "line items", "order items", "products json"]),
            v = findCol(a, ["channel name", "channel", "sales channel", "marketplace"]),
            w = findCol(a, ["expected profit", "exp. profit", "exp profit", "net profit", "profit"]),
            C = findCol(a, ["cost of goods", "cost of goods unit", "cogs"]),
            E = findCol(a, [
              "mobile",
              "mobile number",
              "phone",
              "phone number",
              "customer mobile",
              "contact number",
              "buyer mobile",
            ]),
            L = findCol(a, [
              "channel order id",
              "order number",
              "order id",
              "order no",
              "order-id",
              "orderid",
              "amazon order id",
              "client order id",
              "purchase order number",
              "#number",
            ]);
          if (!((-1 === h && -1 === L) || (-1 === g && -1 === S))) {
            ((r = h), (s = g), (l = b), (i = S), (d = v), (c = w), (p = C), (u = E), (m = L), (f = e), (y = n));
            const np = [];
            for (let k = 1; k <= 10; k++) {
              const pi = a.findIndex((x) => normalizeHeader(x) === "product(" + k + ")");
              if (-1 !== pi) {
                const si = a.findIndex((x) => normalizeHeader(x) === "sku(" + k + ")"),
                  qi = a.findIndex((x) => normalizeHeader(x) === "quantity(" + k + ")");
                np.push({ p: pi, s: si, q: qi });
              }
            }
            npCols = np.length ? np : null;
            break;
          }
        }
        if (!y)
          return void t({ name: e.name, ok: !1, error: "No AWB/Order Number/Product column found", date: todayStr() });
        let h = 0;
        for (let t = 1; t < y.length; t++) {
          const n = y[t];
          if (!n) continue;
          const a = -1 !== r ? cleanAwb(n[r]) : "",
            o = -1 !== m && n[m] ? cleanAwb(n[m]) : "";
          if (!a && !o) continue;
          const f = -1 !== d && n[d] ? String(n[d]).trim() : npCols ? "Amazon" : "—",
            g = (-1 !== c && null !== n[c] && Number(n[c])) || 0,
            b = (-1 !== p && null !== n[p] && Number(n[p])) || 0,
            S = -1 !== u && n[u] ? String(n[u]).trim() : "";
          let v = null;
          if (npCols && npCols.length) {
            v = [];
            npCols.forEach((col) => {
              const pv = n[col.p];
              if (pv && String(pv).trim()) {
                v.push({
                  product: String(pv).trim(),
                  qty: (-1 !== col.q && null != n[col.q] && Number(n[col.q])) || 1,
                });
              }
            });
          }
          if (v && !v.length) v = null;
          if (!v && -1 !== i && n[i])
            try {
              const e = JSON.parse(n[i]);
              Array.isArray(e) &&
                e.length &&
                (v = e.map((e) => ({
                  product: e && (e.name || e.sku) ? String(e.name || e.sku).trim() : "(unnamed product)",
                  qty: (e && null != e.quantity && Number(e.quantity)) || 1,
                })));
            } catch (e) {}
          if (!v) {
            const e = -1 !== s && n[s] ? String(n[s]).trim() : "(unnamed product)";
            v = [{ product: e, qty: (-1 !== l && null !== n[l] && Number(n[l])) || 1 }];
          }
          (v.forEach((t) => {
            const n = {
              product: t.product,
              qty: t.qty,
              channel: f,
              profit: g,
              cogs: b,
              mobile: S,
              awb: a,
              orderNo: o,
              sourceFile: e.name,
              uploadDate: todayStr(),
            };
            (a && (awbMap[a] || (awbMap[a] = []), awbMap[a].push(n)),
              o && (orderMap[o] || (orderMap[o] = []), orderMap[o].push(n)));
          }),
            h++);
        }
        const g = [];
        (-1 === c && g.push("Expected Profit"),
          -1 === p && g.push("Cost of Goods"),
          -1 === u && g.push("Mobile Number (for Amazon self-ship detection)"),
          t({ name: e.name, ok: !0, rowCount: h, sheet: f, missing: g, date: todayStr() }));
      } catch (n) {
        t({ name: e.name, ok: !1, error: n.message, date: todayStr() });
      }
    }),
      n.readAsArrayBuffer(e));
  });
}
function reresolveNotFound() {
  let e = 0;
  const t = [];
  return (
    scanLog.forEach((n) => {
      if ("NOT FOUND" !== n.Product) return void t.push(n);
      const a = n.AWB;
      let o = awbMap[a];
      (o || (o = orderMap[a]),
        o && o.length
          ? (o.forEach((e) => {
              const a = isLossEntry(e);
              (t.push({
                AWB: e.awb || n.AWB,
                "Order No": e.orderNo || n["Order No"] || "",
                Product: e.product,
                Channel: e.channel,
                Qty: e.qty,
                "Expected Profit": e.profit,
                "Cost of Goods": e.cogs,
                "Ship Type": shipTypeLabel(e),
                "Order Date": e.orderDate || "",
                "SLA Date": e.slaDate || "",
                "Source File": e.sourceFile || "—",
                ScannedAt: n.ScannedAt,
                date: n.date,
                Loss: a ? "YES" : "NO",
              }),
                addToSummary(e),
                a && lossCount++);
            }),
            e++,
            notFoundCount--)
          : t.push(n));
    }),
    (scanLog = t),
    e
  );
}
function addToSummary(e) {
  const t = e.product + "||" + e.channel;
  (summaryMap[t] || (summaryMap[t] = { product: e.product, channel: e.channel, qty: 0, profit: 0, cogs: 0 }),
    (summaryMap[t].qty += e.qty),
    (summaryMap[t].profit += e.profit),
    (summaryMap[t].cogs += e.cogs));
}
function renderSummary() {
  summaryBody.innerHTML = "";
  const __sm = {};
  scanLog.forEach((r) => {
    if (r.Product === "NOT FOUND") return;
    const k = r.Product + "||" + r.Channel;
    __sm[k] || (__sm[k] = { product: r.Product, channel: r.Channel, qty: 0, profit: 0, cogs: 0 });
    __sm[k].qty += r.Qty;
    __sm[k].profit += r["Expected Profit"];
    __sm[k].cogs += r["Cost of Goods"];
  });
  const e = Object.values(__sm).sort((e, t) => t.qty - e.qty);
  setupColumnFilterIcons("productSummaryTable", e);
  (e
    .filter((e) => passesColumnFilters("productSummaryTable", e))
    .forEach((e) => {
      const t = document.createElement("tr");
      ((t.innerHTML = `<td>${escapeHtml(e.product)}</td><td>${e.qty}</td><td>${channelBadge(e.channel)}</td><td>${fmtMoney(e.profit)}</td><td>${fmtMoney(e.cogs)}</td>`),
        summaryBody.appendChild(t));
    }),
    applyFilter(summarySearch, summaryBody));
}
function rebuildHistoryTable() {
  ((historyBody.innerHTML = ""), setupColumnFilterIcons("scanLogTable", scanLog));
  ((function () {
    const q = (logSearch.value || "").trim().toLowerCase();
    let rows = scanLog.filter((e) => passesColumnFilters("scanLogTable", e));
    if (q)
      rows = rows.filter((e) =>
        Object.values(e).some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    return rows.slice().sort((e, t) => {
      const n = e["SLA Date"] ? new Date(e["SLA Date"]) : null,
        a = t["SLA Date"] ? new Date(t["SLA Date"]) : null,
        o = n && !isNaN(n),
        r = a && !isNaN(a);
      return o && r ? n - a : o ? -1 : r ? 1 : 0;
    });
  })().forEach((e) => {
    const t = document.createElement("tr");
    ("YES" === e.Loss && t.classList.add("loss-row"),
      (t.innerHTML = `<td>${escapeHtml(e.AWB || "—")}</td><td>${escapeHtml(e["Order No"] || "—")}</td><td>${escapeHtml(e.Product)}</td><td>${channelBadge(e.Channel)}</td><td>${e.Qty}</td><td>${fmtMoney(e["Expected Profit"])}${"YES" === e.Loss ? '<span class="loss-badge">LOSS</span>' : ""}</td><td>${fmtMoney(e["Cost of Goods"])}</td><td>${escapeHtml(e["Order Date"] || "—")}</td><td>${escapeHtml(e["SLA Date"] || "—")}</td><td>${escapeHtml(e["Source File"] || "—")}</td><td>${escapeHtml(e.date || "—")}</td>`),
      historyBody.appendChild(t));
  }),
    renderNotFound(),
    renderLoss());
}
function renderNotFound() {
  const e = scanLog.filter((e) => "NOT FOUND" === e.Product),
    t = document.getElementById("notfoundBody").closest("table"),
    n = document.getElementById("notfoundEmpty");
  if (0 === e.length)
    return ((t.style.display = "none"), (n.style.display = "block"), void (notfoundBody.innerHTML = ""));
  ((t.style.display = "table"),
    (n.style.display = "none"),
    (notfoundBody.innerHTML = e
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.AWB || "—")}</td><td>${escapeHtml(e["Order No"] || "—")}</td><td>${escapeHtml(e.Channel && "—" !== e.Channel ? e.Channel : "—")}</td><td>${escapeHtml(e.date || "—")}</td></tr>`,
      )
      .join("")),
    applyFilter(notfoundSearch, notfoundBody));
}
function renderLoss() {
  const e = scanLog.filter((e) => "YES" === e.Loss),
    t = lossBody.closest("table"),
    n = document.getElementById("lossEmpty");
  if (0 === e.length) return ((t.style.display = "none"), (n.style.display = "block"), void (lossBody.innerHTML = ""));
  ((t.style.display = "table"),
    (n.style.display = "none"),
    (lossBody.innerHTML = e
      .map(
        (e) =>
          `<tr class="loss-row"><td>${escapeHtml(e.AWB || "—")}</td><td>${escapeHtml(e.Product)}</td><td>${channelBadge(e.Channel)}</td><td>${escapeHtml(e["Ship Type"] || "—")}</td><td>${fmtMoney(e["Expected Profit"])}</td><td>${escapeHtml(e.date || "—")}</td></tr>`,
      )
      .join("")),
    applyFilter(lossSearch, lossBody));
}
function addLogRow(e, t) {
  const n = t.sourceFile || "—",
    a = todayStr(),
    o = t.orderNo || "",
    r = "NOT FOUND" !== t.product && isLossEntry(t);
  const entry = {
    id: t.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    AWB: e,
    "Order No": o,
    Product: t.product,
    Channel: t.channel,
    Qty: t.qty,
    "Expected Profit": t.profit,
    "Cost of Goods": t.cogs,
    "Ship Type": shipTypeLabel(t),
    "Order Date": t.orderDate || "",
    "SLA Date": t.slaDate || "",
    "Source File": n,
    ScannedAt: new Date().toLocaleString(),
    date: a,
    Loss: r ? "YES" : "NO",
  };
  (scanLog.unshift(entry),
    "NOT FOUND" === t.product ? notFoundCount++ : (addToSummary(t), r && lossCount++),
    renderSummary(),
    rebuildHistoryTable(),
    updateStats(),
    pushScanLogEntryToCloud(entry));
}
/* ===== Scan log storage (READ-SAVER, Oct 2026) =====
   Before: one Firebase document per scan (≈1,000 a day) — every console load read all of them.
   Now: scans are grouped into one document per hour ("buckets"), so a load reads ≈15 documents.
   Old one-per-scan documents (from devices not refreshed yet) are still shown and are moved
   into buckets automatically. */
const SCANLOG_BUCKETS = () => fbDb.collection("aikm_admin").doc("data").collection("scanLogBuckets");
const SCANLOG_LEGACY = () => fbDb.collection("aikm_admin").doc("data").collection("scanLogEntries");
let scanLogBucketCache = {}, scanLogLegacyCache = {}, scanLogWhere = {}, scanLogMigrating = false;
function rebuildScanLogFromCloud() {
  scanLogEntriesCache = Object.assign({}, scanLogLegacyCache);
  scanLogWhere = {};
  Object.keys(scanLogLegacyCache).forEach((id) => (scanLogWhere[id] = null));
  Object.keys(scanLogBucketCache).forEach((b) => {
    const m = scanLogBucketCache[b] || {};
    Object.keys(m).forEach((id) => { if (m[id]) { scanLogEntriesCache[id] = m[id]; scanLogWhere[id] = b; } });
  });
  (scanLog = Object.values(scanLogEntriesCache).sort(
    (e, t) => (Date.parse(t.ScannedAt) || 0) - (Date.parse(e.ScannedAt) || 0),
  )),
    (notFoundCount = scanLog.filter((e) => "NOT FOUND" === e.Product).length),
    (lossCount = scanLog.filter((e) => "YES" === e.Loss).length),
    rebuildHistoryTable(),
    updateStats(),
    renderBackupStats();
}
function startScanLogSync() {
  scanLogBucketCache = {}; scanLogLegacyCache = {};
  const u1 = SCANLOG_BUCKETS().onSnapshot(
    (snap) => {
      snap.docChanges().forEach((c) => {
        "removed" === c.type ? delete scanLogBucketCache[c.doc.id] : (scanLogBucketCache[c.doc.id] = (c.doc.data() || {}).e || {});
      });
      rebuildScanLogFromCloud();
    },
    (e) => console.warn("Scan log sync error", e),
  );
  const u2 = SCANLOG_LEGACY().onSnapshot(
    (snap) => {
      snap.docChanges().forEach((c) => {
        "removed" === c.type ? delete scanLogLegacyCache[c.doc.id] : (scanLogLegacyCache[c.doc.id] = c.doc.data());
      });
      rebuildScanLogFromCloud();
      if (snap.size) setTimeout(migrateLegacyScanLog, 4000 + Math.random() * 4000);
    },
    (e) => console.warn("Scan log (old format) sync error", e),
  );
  return () => { try { u1(); } catch (_) {} try { u2(); } catch (_) {} };
}
function scanLogBucketId() {
  const d = new Date(Date.now() + 330 * 60000); // IST hour
  const base = "b_" + d.toISOString().slice(0, 13).replace(/[-T]/g, "");
  for (let k = 0; ; k++) {
    const id = k ? base + "_" + k : base;
    const m = scanLogBucketCache[id];
    if (!m || Object.keys(m).length < 1200) return id; // stay far below Firebase's 1 MB document limit
  }
}
async function migrateLegacyScanLog() {
  if (scanLogMigrating || !fbDb) return;
  const ids = Object.keys(scanLogLegacyCache).sort();
  if (!ids.length) return;
  scanLogMigrating = true;
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400), e = {};
      part.forEach((id) => (e[id] = scanLogLegacyCache[id]));
      const batch = fbDb.batch();
      batch.set(SCANLOG_BUCKETS().doc("m_" + part[0]), { e, at: Date.now() }, { merge: !0 });
      part.forEach((id) => batch.delete(SCANLOG_LEGACY().doc(id)));
      await batch.commit();
    }
  } catch (e) {
    console.warn("Scan log move to buckets failed (will retry):", e.message);
  } finally { scanLogMigrating = false; }
}
async function pushScanLogEntryToCloud(entry) {
  if (!fbDb || !entry.id) return;
  try {
    const b = scanLogBucketId();
    (scanLogBucketCache[b] = scanLogBucketCache[b] || {})[entry.id] = entry;
    scanLogWhere[entry.id] = b;
    await SCANLOG_BUCKETS().doc(b).set({ e: { [entry.id]: entry }, at: Date.now() }, { merge: !0 });
  } catch (e) {
    console.warn("Scan log entry push failed:", e.message);
  }
}
async function deleteScanLogEntriesFromCloud(ids) {
  if (!fbDb || !ids.length) return;
  const del = firebase.firestore.FieldValue.delete(), byBucket = {}, legacy = [];
  ids.forEach((id) => {
    const b = scanLogWhere[id];
    b ? (byBucket[b] = byBucket[b] || []).push(id) : legacy.push(id);
  });
  try {
    for (const b of Object.keys(byBucket)) {
      const all = Object.keys(scanLogBucketCache[b] || {});
      const gone = new Set(byBucket[b]);
      if (all.every((id) => gone.has(id))) await SCANLOG_BUCKETS().doc(b).delete();
      else {
        const upd = {};
        byBucket[b].forEach((id) => (upd["e." + id] = del));
        await SCANLOG_BUCKETS().doc(b).update(upd);
      }
    }
    for (let i = 0; i < legacy.length; i += 400) {
      const batch = fbDb.batch();
      legacy.slice(i, i + 400).forEach((id) => batch.delete(SCANLOG_LEGACY().doc(id)));
      await batch.commit();
    }
  } catch (e) {
    console.warn("Bulk delete scan log entries failed:", e.message);
  }
}
function isDuplicateScan(e, t) {
  return scanLog.some((n) => !((n.AWB !== e && n["Order No"] !== e) || (void 0 !== t && n.Product !== t)));
}
function findDuplicateScanTime(e, t) {
  const n = scanLog.find((n) => !((n.AWB !== e && n["Order No"] !== e) || (void 0 !== t && n.Product !== t)));
  return (n && (n.ScannedAt || n.date)) || null;
}
function showResult(e) {
  let t = awbMap[e],
    n = "awb";
  if ((t || ((t = orderMap[e]), (n = "order")), !t))
    return (
      (resultBox.className = "result error"),
      (resultBox.innerHTML = `<div class="prod-name">No match for AWB/Order No: ${escapeHtml(e)}</div>`),
      scanInput.classList.add("pulse-err"),
      setTimeout(() => scanInput.classList.remove("pulse-err"), 650),
      addLogRow(e, { product: "NOT FOUND", channel: "—", qty: 0, profit: 0, cogs: 0, orderNo: e }),
      void saveAll()
    );
  const a = t.filter((t) => !isDuplicateScan(e, t.product)),
    o = t.length - a.length;
  let r = a;
  if (0 === a.length) {
    const n = findDuplicateScanTime(e);
    if (!confirm(`Every product for "${e}" was already scanned${n ? " (" + n + ")" : ""}. Scan again anyway?`))
      return (
        (resultBox.className = "result"),
        void (resultBox.innerHTML = '<div class="prod-name">Skipped — duplicate of a previous scan.</div>')
      );
    r = t;
  }
  resultBox.className = "result";
  let s = "";
  (r.forEach((e) => {
    const t = isLossEntry(e),
      a = isAmazonChannel(e) ? shipTypeLabel(e) : "",
      o =
        e.orderDate || e.slaDate
          ? ` &nbsp;|&nbsp; Order Date: <b>${escapeHtml(e.orderDate || "—")}</b> &nbsp;|&nbsp; SLA Date: <b>${escapeHtml(e.slaDate || "—")}</b>`
          : "";
    s += `<div class="prod-name">${escapeHtml(e.product)}${t ? '<span class="loss-badge">LOSS</span>' : ""}</div><div class="prod-qty">Channel: ${channelBadge(e.channel)} &nbsp;|&nbsp; Qty: <b>${e.qty}</b> &nbsp;|&nbsp; Profit: <span class="profit">${fmtMoney(e.profit)}</span> &nbsp;|&nbsp; Cost: <span class="cogs">${fmtMoney(e.cogs)}</span>${a ? " &nbsp;|&nbsp; Ship: <b>" + escapeHtml(a) + "</b>" : ""}${"order" === n ? " &nbsp;|&nbsp; <b>Matched by Order No</b>" : ""}${o}</div>`;
  }),
    o > 0 &&
      a.length > 0 &&
      (s += `<div class="prod-qty" style="opacity:.7;">(${o} other product${o > 1 ? "s" : ""} for this order already scanned earlier — skipped)</div>`),
    (resultBox.innerHTML = s),
    (t = r),
    t.length > 1 ? openMultiItemModal(e, t) : (t.forEach((e) => addLogRow(e.awb || "", e)), saveAll()));
}
function openMultiItemModal(e, t) {
  const n = document.getElementById("multiItemModal"),
    a = document.getElementById("multiItemModalList");
  ((document.getElementById("multiItemModalCode").textContent = e),
    (document.getElementById("multiItemModalCount").textContent = t.length),
    (a.innerHTML = t
      .map((e, t) => {
        const n = isLossEntry(e),
          a = n ? "#8C3232" : "#2F5D3A";
        return `\n      <label class="multi-item-card" style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid rgba(212,175,55,.3);border-radius:10px;cursor:pointer;font-family:'Lexend',sans-serif;transition:background .15s ease,border-color .15s ease;">\n        <input type="checkbox" data-idx="${t}" class="multi-item-checkbox" checked style="margin-top:3px;width:16px;height:16px;accent-color:#D4AF37;cursor:pointer;">\n        <span style="flex:1;">\n          <span style="display:flex;align-items:center;gap:6px;">\n            <span style="color:#0F1E35;font-weight:600;font-size:13px;">${escapeHtml(e.product)}</span>\n            ${n ? '<span class="loss-badge">LOSS</span>' : ""}\n          </span>\n          <span style="display:flex;flex-wrap:wrap;gap:10px;margin-top:5px;font-size:11px;color:rgba(15,30,53,.6);">\n            <span>Channel: <b style="color:#0F1E35;">${escapeHtml(e.channel || "—")}</b></span>\n            <span>Qty: <b style="color:#0F1E35;">${e.qty}</b></span>\n            <span>Profit: <b style="color:${a};">${fmtMoney(e.profit)}</b></span>\n          </span>\n        </span>\n      </label>\n    `;
      })
      .join("")),
    (n.style.display = "flex"));
  const o = () => {
    const e = a.querySelectorAll("input[type=checkbox]:checked").length,
      n = document.getElementById("multiItemModalCount");
    (n && (n.textContent = `${e} of ${t.length} selected`),
      a.querySelectorAll(".multi-item-card").forEach((e) => {
        const t = e.querySelector("input[type=checkbox]");
        ((e.style.background = t.checked ? "rgba(212,175,55,.06)" : "transparent"),
          (e.style.borderColor = t.checked ? "rgba(212,175,55,.55)" : "rgba(212,175,55,.2)"));
      }));
  };
  (a.querySelectorAll("input[type=checkbox]").forEach((e) => {
    e.addEventListener("change", o);
  }),
    o());
  const r = () => {
    n.style.display = "none";
  };
  ((document.getElementById("multiItemModalCancel").onclick = () => {
    r();
  }),
    (document.getElementById("multiItemModalConfirm").onclick = () => {
      ([...a.querySelectorAll("input[type=checkbox]:checked")]
        .map((e) => Number(e.dataset.idx))
        .forEach((e) => addLogRow(t[e].awb || "", t[e])),
        saveAll(),
        r());
    }));
}
function safeSheetName(e, t) {
  let n = e.replace(/\.[^/.]+$/, "");
  ((n = n.replace(/[\\\/\?\*\[\]:]/g, " ").trim()), n.length > 28 && (n = n.slice(0, 28)), n || (n = "Sheet"));
  let a = n,
    o = 1;
  for (; t.has(a);) (o++, (a = n.slice(0, 28 - String(o).length - 1) + "_" + o));
  return (t.add(a), a);
}
function exportAllData() {
  if (0 === scanLog.length && 0 === Object.keys(summaryMap).length) return void alert("No data yet to export.");
  const e = XLSX.utils.book_new(),
    t = new Set(),
    n = Object.values(summaryMap)
      .sort((e, t) => t.qty - e.qty)
      .map((e) => ({
        Product: e.product,
        Channel: e.channel,
        "Total Qty": e.qty,
        "Total Expected Profit": Math.round(100 * e.profit) / 100,
        "Total Cost of Goods": Math.round(100 * e.cogs) / 100,
      }));
  (XLSX.utils.book_append_sheet(
    e,
    XLSX.utils.json_to_sheet(
      n.length
        ? n
        : [{ Product: "", Channel: "", "Total Qty": "", "Total Expected Profit": "", "Total Cost of Goods": "" }],
    ),
    safeSheetName("Product Summary", t),
  ),
    XLSX.utils.book_append_sheet(
      e,
      XLSX.utils.json_to_sheet(
        scanLog.length
          ? scanLog
          : [
              {
                AWB: "",
                Product: "",
                Channel: "",
                Qty: "",
                "Expected Profit": "",
                "Cost of Goods": "",
                "Ship Type": "",
                "Source File": "",
                ScannedAt: "",
                date: "",
                Loss: "",
              },
            ],
      ),
      safeSheetName("Scan Log", t),
    ));
  const a = scanLog
    .filter((e) => "NOT FOUND" === e.Product)
    .map((e) => ({ AWB: e.AWB, Date: e.date, "Scanned At": e.ScannedAt }));
  XLSX.utils.book_append_sheet(
    e,
    XLSX.utils.json_to_sheet(a.length ? a : [{ AWB: "", Date: "", "Scanned At": "" }]),
    safeSheetName("Not Found", t),
  );
  const o = scanLog
    .filter((e) => "YES" === e.Loss)
    .map((e) => ({
      AWB: e.AWB,
      Product: e.Product,
      Channel: e.Channel,
      "Ship Type": e["Ship Type"],
      Profit: e["Expected Profit"],
      Date: e.date,
    }));
  XLSX.utils.book_append_sheet(
    e,
    XLSX.utils.json_to_sheet(
      o.length ? o : [{ AWB: "", Product: "", Channel: "", "Ship Type": "", Profit: "", Date: "" }],
    ),
    safeSheetName("Loss Orders", t),
  );
  const r = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(e, `AIKM_Full_Export_${r}.xlsx`);
}
function clearOrderScans() {
  if (!confirm("Clear the current scan log and product summary? The uploaded master sheet stays.")) return;
  const ids = scanLog.map((e) => e.id).filter(Boolean);
  ((scanLog = []),
    (summaryMap = {}),
    (notFoundCount = 0),
    (lossCount = 0),
    (historyBody.innerHTML = ""),
    (resultBox.className = "result empty"),
    (resultBox.innerHTML = "Result appears here."),
    renderSummary(),
    renderNotFound(),
    renderLoss(),
    updateStats(),
    saveAll(),
    deleteScanLogEntriesFromCloud(ids));
}

/* Saved Excel backups were removed — kept as an empty function because older code still calls it */
function loadSavedFilesList() {}

function readWorkbook(e) {
  return new Promise((t, n) => {
    const a = new FileReader();
    ((a.onload = (e) => {
      try {
        const n = new Uint8Array(e.target.result),
          a = XLSX.read(n, { type: "array" });
        t(a);
      } catch (e) {
        n(e);
      }
    }),
      (a.onerror = n),
      a.readAsArrayBuffer(e));
  });
}
function findColumns(e, t) {
  for (const n of e.SheetNames) {
    const a = e.Sheets[n],
      o = XLSX.utils.sheet_to_json(a, { header: 1, defval: null, blankrows: !1 });
    for (let e = 0; e < Math.min(o.length, 15); e++) {
      const a = o[e];
      if (!a) continue;
      const r = {};
      for (const e in t) {
        const n = t[e],
          o = a.findIndex((e) => null !== e && n.test(String(e).trim()));
        -1 !== o && (r[e] = o);
      }
      if (Object.keys(r).length === Object.keys(t).length) return { sheetName: n, headerRow: e, colMap: r, data: o };
    }
  }
  return null;
}
function extractVendorProducts(e) {
  const t = findColumns(e, { code: /item\s*code/i, name: /product\s*name|^product$|item\s*name/i });
  if (!t) return null;
  const { colMap: n, data: a, headerRow: o } = t,
    r = a[o],
    s = r.findIndex((e) => e && /mrp/i.test(String(e))),
    l = r.findIndex((e) => e && /^brand$/i.test(String(e).trim())),
    i = r.findIndex((e) => e && /barcode|\bean\b|\bupc\b/i.test(String(e))),
    d = r.findIndex((e) => e && /\basin\b/i.test(String(e))),
    c = r.findIndex((e) => e && /seller\s*sku/i.test(String(e))),
    g = r.findIndex((e) => e && /\bgst\b|\btax\s*%|\btax\s*rate/i.test(String(e))),
    qc = r.findIndex((e) => e && /\bqty\b|\bstock\b|available\s*qty/i.test(String(e))),
    p = [];
  r.forEach((e, t) => {
    if (!e) return;
    const n = String(e).match(/slab\s*(\d+)\s*qty/i);
    if (n) {
      const e = parseInt(n[1], 10),
        a = r.findIndex((t) => t && new RegExp(`slab\\s*${e}\\s*price`, "i").test(String(t)));
      -1 !== a && p.push({ qtyIdx: t, priceIdx: a });
    }
  });
  const u = [];
  for (let e = o + 1; e < a.length; e++) {
    const t = a[e];
    if (!t) continue;
    const o = t[n.code],
      r = t[n.name];
    if (null == o || !r) continue;
    const m = { code: String(o).trim(), name: String(r).trim() };
    if (
      (-1 !== s && null != t[s] && "" !== t[s] && (m.mrp = Number(t[s]) || null),
      -1 !== l && null != t[l] && "" !== t[l] && (m.brand = String(t[l]).trim()),
      -1 !== i && null != t[i] && "" !== t[i] && (m.barcode = String(t[i]).trim()),
      -1 !== d && null != t[d] && "" !== t[d] && (m.asin = String(t[d]).trim()),
      -1 !== c && null != t[c] && "" !== t[c] && (m.sellerSku = String(t[c]).trim()),
      -1 !== g && null != t[g] && "" !== t[g] && (m.gst = Number(t[g]) || null),
      -1 !== qc && null != t[qc] && "" !== t[qc] && (m.qty = Number(t[qc]) || 0),
      p.length)
    ) {
      const e = [];
      (p.forEach((n) => {
        const a = t[n.qtyIdx],
          o = t[n.priceIdx];
        if (null != a && "" !== a && null != o && "" !== o) {
          const t = parseSlabRange(a);
          t && e.push({ ...t, price: Number(o) });
        }
      }),
        e.length && (m.slabs = e));
    }
    u.push(m);
  }
  return u;
}
function parseSlabRange(e) {
  let t = (e = String(e).trim()).match(/^(\d+)\+$/);
  return t
    ? { min: parseInt(t[1], 10), max: 1 / 0 }
    : ((t = e.match(/^(\d+)\s*-\s*(\d+)$/)),
      t
        ? { min: parseInt(t[1], 10), max: parseInt(t[2], 10) }
        : ((t = e.match(/^(\d+)$/)), t ? { min: parseInt(t[1], 10), max: parseInt(t[1], 10) } : null));
}
function slabPriceFor(e, t) {
  if (!e || !e.length) return null;
  t = Math.max(1, Number(t) || 1);
  const n = [...e].sort((e, t) => e.min - t.min);
  let a = n[0];
  for (const e of n) {
    if (!(e.min <= t)) break;
    a = e;
  }
  return a;
}
function extractOrderItems(e) {
  const t = findColumns(e, { name: /^product$|product\s*name/i, qty: /total\s*qty|^qty$|quantity/i });
  if (!t) return null;
  const { colMap: n, data: a, headerRow: o } = t,
    r = new Map();
  for (let e = o + 1; e < a.length; e++) {
    const t = a[e];
    if (!t) continue;
    const o = t[n.name];
    let s = t[n.qty];
    if (!o) continue;
    s = Number(s) || 0;
    const l = String(o).trim();
    r.has(l) ? r.set(l, r.get(l) + s) : r.set(l, s);
  }
  return Array.from(r, ([e, t]) => ({ name: e, qty: t }));
}
(document.getElementById("rtabbar").addEventListener("click", function (e) {
  const t = e.target.closest(".rtabbtn");
  t &&
    (document.querySelectorAll(".rtabbtn").forEach((e) => e.classList.remove("active")),
    document.querySelectorAll(".rpanel").forEach((e) => e.classList.remove("active")),
    t.classList.add("active"),
    document.getElementById("rpanel" + t.dataset.r).classList.add("active"));
}),
  summarySearch.addEventListener("input", () => applyFilter(summarySearch, summaryBody)),
  logSearch.addEventListener(
    "input",
    (() => {
      let __t = null;
      return () => {
        clearTimeout(__t);
        __t = setTimeout(rebuildHistoryTable, 200);
      };
    })(),
  ),
  notfoundSearch.addEventListener("input", () => applyFilter(notfoundSearch, notfoundBody)),
  lossSearch.addEventListener("input", () => applyFilter(lossSearch, lossBody)),
  fileInput.addEventListener("change", async function (e) {
    const t = Array.from(e.target.files);
    if (!t.length) return;
    masterStatus.textContent = `Reading ${t.length} file(s)…`;
    const n = [];
    for (const e of t) n.push(await processOneFile(e));
    loadedFiles = loadedFiles.concat(n);
    const a = loadedFiles.filter((e) => e.ok),
      o = n.filter((e) => !e.ok),
      r = reresolveNotFound();
    let s =
      `Loaded ${a.reduce((e, t) => e + t.rowCount, 0)} rows across ${a.length} file(s), ${Object.keys(awbMap).length} unique AWBs total.` +
      (o.length ? ` ${o.length} file(s) failed.` : " Ready.");
    (r > 0 && (s += ` ✓ ${r} previously "not found" AWB${1 === r ? "" : "s"} now matched.`),
      (masterStatus.textContent = s),
      renderFileChips(),
      renderSummary(),
      rebuildHistoryTable(),
      updateStats(),
      "function" == typeof refreshLiveSummaryCount && refreshLiveSummaryCount(),
      (fileInput.value = ""),
      scanInput.focus(),
      saveAll());
  }),
  document.getElementById("bulkBtn").addEventListener("click", function () {
    const e = document.getElementById("bulkInput"),
      t = document.getElementById("bulkStatus");
    let n = e.value
      .split(/\r?\n|,/)
      .map(cleanAwb)
      .filter((e) => e.length > 0);
    if (0 === n.length) return void (t.textContent = "Paste at least one AWB or Order Number first.");
    if (0 === Object.keys(awbMap).length && 0 === Object.keys(orderMap).length)
      return void (t.textContent = "Upload the master sheet first (Step 1).");
    const a = new Set(),
      o = [],
      r = n.filter((e) => (a.has(e) ? (o.push(e), !1) : (a.add(e), !0)));
    let s = 0,
      l = 0,
      i = 0;
    r.forEach((e) => {
      let t = awbMap[e];
      if ((t || (t = orderMap[e]), !t))
        return (l++, void addLogRow(e, { product: "NOT FOUND", channel: "—", qty: 0, profit: 0, cogs: 0, orderNo: e }));
      const n = t.filter((t) => !isDuplicateScan(e, t.product));
      ((i += t.length - n.length), n.length && (s++, n.forEach((e) => addLogRow(e.awb || "", e))));
    });
    const d = o.length + i;
    ((t.textContent =
      `Processed ${r.length} — ${s} matched, ${l} not found` +
      (d ? `, ${d} duplicate line(s)/product(s) skipped.` : ".")),
      (e.value = ""),
      saveAll());
  }),
  document.getElementById("downloadBtn").addEventListener("click", function () {
    if (0 === scanLog.length) return void alert("No scans yet to download.");
    const e = XLSX.utils.book_new(),
      t = new Set(),
      n = Object.values(summaryMap)
        .sort((e, t) => e.product.localeCompare(t.product))
        .map((e) => ({
          Product: e.product,
          Channel: e.channel,
          "Total Qty": e.qty,
          "Total Expected Profit": Math.round(100 * e.profit) / 100,
          "Total Cost of Goods": Math.round(100 * e.cogs) / 100,
        }));
    (XLSX.utils.book_append_sheet(e, XLSX.utils.json_to_sheet(n), safeSheetName("Product Summary", t)),
      XLSX.utils.book_append_sheet(e, XLSX.utils.json_to_sheet(scanLog), safeSheetName("Scan Log", t)));
    const a = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(e, `AIKM_Order_File_Output_${a}.xlsx`);
  }),
  scanInput.addEventListener("keydown", function (e) {
    if ("Enter" === e.key) {
      const t = cleanAwb(scanInput.value);
      (t && showResult(t), (scanInput.value = ""), e.preventDefault());
    }
  }),
  window.addEventListener("DOMContentLoaded", () => {
    const e = new Date();
    ((document.getElementById("manifestDate").value =
      String(e.getDate()).padStart(2, "0") +
      "-" +
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][e.getMonth()] +
      "-" +
      e.getFullYear()),
      loadPersisted(),
      firebaseConfigStr &&
        ((document.getElementById("firebaseConfigInput").value = firebaseConfigStr),
        connectFirebase(firebaseConfigStr)));
  }));
const STOPWORDS = new Set([
    "the",
    "of",
    "and",
    "pack",
    "set",
    "with",
    "free",
    "size",
    "x",
    "pc",
    "pcs",
    "no",
    "a",
    "an",
  ]),
  UNIT_MAP = {
    gm: "g",
    gms: "g",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    ltr: "l",
    litre: "l",
    pc: "pc",
    pcs: "pc",
    piece: "pc",
    pieces: "pc",
  };
function normalize(e) {
  return String(e)
    .toLowerCase()
    .replace(/[|/,_\-()]/g, " ")
    .replace(/[^a-z0-9. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extractSizeToken(e) {
  const t = e.match(/(\d+\.?\d*)\s?(kg|gms|gm|g|ml|ltr|l|pcs|pc)\b/);
  if (!t) return null;
  const n = parseFloat(t[1]),
    a = UNIT_MAP[t[2]] || t[2];
  let o = null;
  return (
    "kg" === a ? (o = 1e3 * n) : "g" === a ? (o = n) : "l" === a ? (o = 1e3 * n) : "ml" === a && (o = n),
    { raw: t[0], unit: a, grams: o, count: "pc" === a ? n : null }
  );
}
function tokens(e) {
  return e.split(" ").filter((e) => e.length > 0 && !STOPWORDS.has(e));
}
function extractMultiplier(e) {
  let t;
  return (t = e.match(/pack\s*of\s*(\d+)/)) ||
    (t = e.match(/set\s*of\s*(\d+)/)) ||
    (t = e.match(/combo\s*of\s*(\d+)/)) ||
    (t = e.match(/\bpk\s?(\d{1,3})\b/))
    ? parseInt(t[1], 10)
    : /\btwin\b/.test(e)
      ? 2
      : /\btrio\b/.test(e)
        ? 3
        : (t = e.match(/(?:^|\s)(\d+)\s*x\s*\d+\.?\d*\s?(?:kg|gms|gm|g|ml|ltr|l)\b/)) ||
            (t = e.match(/\d+\.?\d*\s?(?:kg|gms|gm|g|ml|ltr|l)\s*x\s*(\d+)\b/))
          ? parseInt(t[1], 10)
          : 1;
}
function trySplitCombo(e) {
  const t = e.match(/combo\s*of\s*(\d+)/i);
  if (!t) return null;
  const n = parseInt(t[1], 10);
  if (n < 2 || n > 8) return null;
  let a = e.replace(/\([^)]*\)/g, " ").trim();
  if (
    ((a = a.replace(/,?\s*combo\s*of\s*\d+\b.*$/i, "").trim()),
    (a = a.replace(/,?\s*\d+\.?\d*\s?(grams?|gms?|g|kgs?|kg|ml|ltrs?|l|litres?)\b.*$/i, "").trim()),
    !a)
  )
    return null;
  let o = a
    .split(/\s*,\s*|\s+and\s+/i)
    .map((e) => e.trim())
    .filter(Boolean);
  if (o.length !== n) return null;
  const r = o[0].split(" ")[0];
  return ((o = o.map((e, t) => (0 === t || e.toLowerCase().startsWith(r.toLowerCase()) ? e : `${r} ${e}`))), o);
}
function diceCoefficient(e, t) {
  if (0 === e.length || 0 === t.length) return 0;
  const n = new Set(t);
  let a = 0;
  const o = new Set();
  for (const t of e) n.has(t) && !o.has(t) && (a++, o.add(t));
  return (2 * a) / (e.length + t.length);
}
function prepProduct(e) {
  const t = normalize(e);
  return { name: e, norm: t, tok: tokens(t), size: extractSizeToken(t), mult: extractMultiplier(t) };
}
function sizeStatus(e, t) {
  return e.size && t.size
    ? e.size.unit === t.size.unit && null !== e.size.grams && null !== t.size.grams
      ? Math.abs(e.size.grams - t.size.grams) < 0.01
        ? "match"
        : "mismatch"
      : e.size.raw === t.size.raw
        ? "match"
        : "unknown"
    : "unknown";
}
function brandStatus(e, t) {
  if (t.brand) {
    const n = normalize(t.brand),
      a = e.tok[0] || "";
    return n && (n.includes(a) || a.includes(n) || e.tok.includes(n)) ? "match" : "conflict";
  }
  return e.tok[0] && t.tok[0] && e.tok[0] === t.tok[0] ? "weak_match" : "unknown";
}
function identifierMatch(e, t) {
  return (
    !(!e.barcode || !t.barcode || e.barcode !== t.barcode) ||
    !(!e.asin || !t.asin || e.asin !== t.asin) ||
    !(!e.sellerSku || !t.sellerSku || e.sellerSku !== t.sellerSku)
  );
}
function scoreMatch(e, t) {
  if (identifierMatch(e, t))
    return { score: 1, sizeStatus: "match", brandStatus: "match", band: "exact", reason: "Identifier match" };
  const n = new Set(t.tok);
  let a = 0;
  for (const t of e.tok) n.has(t) && a++;
  let o = 0.55 * (e.tok.length ? a / e.tok.length : 0) + 0.35 * diceCoefficient(e.tok, t.tok);
  const r = brandStatus(e, t);
  "match" === r ? (o += 0.06) : "weak_match" === r && (o += 0.03);
  const s = sizeStatus(e, t);
  return (
    "match" === s && (o += 0.08),
    (t.norm.includes(e.norm) || e.norm.includes(t.norm)) && (o += 0.03),
    (o = Math.max(0, Math.min(0.99, o))),
    "mismatch" === s && (o = Math.min(o, 0.65)),
    "conflict" === r && (o = Math.min(o, 0.75)),
    { score: o, sizeStatus: s, brandStatus: r, band: matchBand(o), reason: null }
  );
}
function matchBand(e) {
  return e >= 1 ? "exact" : e >= 0.95 ? "very_high" : e >= 0.8 ? "review" : "no_match";
}
function topMatches(e, t, n = 6) {
  const a = t.map((t) => {
    const n = scoreMatch(e, t);
    return { ...t, score: n.score, sizeStatus: n.sizeStatus, brandStatus: n.brandStatus, band: n.band };
  });
  return (a.sort((e, t) => t.score - e.score), a.slice(0, n));
}
function topMatchesForSearch(e, t, n = 10) {
  const a = e.norm,
    o = (e.name || "").trim().toLowerCase(),
    r = t.map((t) => {
      const n = scoreMatch(e, t);
      let r = 0;
      a && a.length >= 3 && t.norm.includes(a) && (r = 0.35);
      const s = (t.code || "").toString().toLowerCase();
      return (
        o && s && s.includes(o) && (r = Math.max(r, 0.5)),
        { ...t, score: Math.min(1, n.score + r), sizeStatus: n.sizeStatus }
      );
    });
  return (r.sort((e, t) => t.score - e.score), r.slice(0, n));
}
let lotsVendor = { name: "LOTS", workbook: null, products: null, prepped: null },
  otherVendors = [],
  orderWorkbook = null,
  orderItems = null,
  allPrepped = [],
  results = [],
  currentFilter = "all";
const $ = (e) => document.getElementById(e),
  LEARN_KEY = "order_mapper_learned_matches_v1";
function loadLearned() {
  try {
    const e = JSON.parse(localStorage.getItem(LEARN_KEY) || "{}");
    if ("" in e) {
      delete e[""];
      try {
        localStorage.setItem(LEARN_KEY, JSON.stringify(e));
      } catch (e) {}
    }
    return e;
  } catch (e) {
    return {};
  }
}
function saveLearned(e) {
  e && "" in e && delete e[""];
  try {
    localStorage.setItem(LEARN_KEY, JSON.stringify(e));
  } catch (e) {}
}
function rememberMatch(e, t, n, a, o) {
  const r = normalize(e);
  if (!r) return void console.warn("rememberMatch: empty orderName, skipping save for this row.");
  const s = loadLearned();
  ((s[r] = {
    orderName: e,
    vendorName: t.vendorName,
    code: t.code,
    name: t.name,
    orderPackQty: n,
    vendorPackQty: a,
    isComboPart: !(!o || !o.isSplitPart),
    comboSource: (o && o.comboSource) || null,
    savedAt: new Date().toISOString(),
  }),
    saveLearned(s),
    "function" == typeof saveAll && saveAll(),
    "function" == typeof pushMasterMappingToCloud && pushMasterMappingToCloud(s));
}
function learnedFor(e) {
  return loadLearned()[normalize(e)] || null;
}
function learnedCount() {
  return Object.keys(loadLearned()).length;
}
const VENDOR_STORE_KEY = "order_mapper_lots_pricelist_v1";
let __lotsStoreRaw = null,
  __lotsStoreObj = null;
function loadLotsStore() {
  try {
    const raw = localStorage.getItem(VENDOR_STORE_KEY) || "null";
    if (raw !== __lotsStoreRaw) {
      __lotsStoreObj = JSON.parse(raw);
      __lotsStoreRaw = raw;
    }
    return __lotsStoreObj;
  } catch (e) {
    return null;
  }
}
function saveLotsToStore(e, t) {
  const n = new Date().toISOString();
  try {
    return (
      localStorage.setItem(VENDOR_STORE_KEY, JSON.stringify({ products: e, fileLabel: t || "", savedAt: n })),
      pushLotsCatalogToCloud(e, t, n),
      !0
    );
  } catch (e) {
    return !1;
  }
}
let lotsChunksCache = {},
  fbLotsChunksUnsub = null;
async function pushLotsCatalogToCloud(e, t, n) {
  if (!fbDb || !e || !e.length) return;
  const a = fbDb.collection("aikm_admin").doc("lotsCatalog").collection("chunks");
  try {
    const o = await a.get(),
      r = new Set(o.docs.map((e) => e.id)),
      s = new Set();
    let l = 0;
    for (let t = 0; t < e.length; t += 400) {
      const n = e.slice(t, t + 400),
        o = `chunk_${l}`;
      (s.add(o), await a.doc(o).set({ products: n }), l++);
    }
    const i = fbDb.batch();
    let d = 0;
    (r.forEach((e) => {
      s.has(e) || (i.delete(a.doc(e)), d++);
    }),
      d && (await i.commit()),
      await fbDb
        .collection("aikm_admin")
        .doc("lotsCatalog")
        .set({ fileLabel: t || "", savedAt: n, productCount: e.length, chunkCount: l }));
  } catch (e) {
    console.warn("LOTS catalog sync failed", e);
  }
}
let lotsPriceTrend = {};
let __lotsPriceSnapshotLoaded = false;
let __lotsPriceSnapshotCache = null;
async function checkLotsPriceTrend(products) {
  if (!fbDb) return;
  try {
    if (!__lotsPriceSnapshotLoaded) {
      __lotsPriceSnapshotLoaded = true;
      const snap = await fbDb.collection("aikm_admin").doc("lotsPriceSnapshot").get();
      __lotsPriceSnapshotCache = snap.exists ? snap.data().prices || {} : {};
    }
    const currentPrices = {};
    products.forEach(function (p) {
      if (p.slabs && p.slabs.length) {
        const best = bestSlabFor(p.slabs);
        if (best) currentPrices[p.code] = best.price;
      }
    });
    let changed = false;
    Object.keys(currentPrices).forEach(function (code) {
      const prev = __lotsPriceSnapshotCache[code];
      const curr = currentPrices[code];
      if (prev != null && prev !== curr) {
        lotsPriceTrend[code] = { direction: curr > prev ? "up" : "down", prevPrice: prev, currPrice: curr };
        changed = true;
      }
    });
    __lotsPriceSnapshotCache = currentPrices;
    if (changed) {
      "function" == typeof renderSpapiPricingTable && renderSpapiPricingTable();
    }
    await fbDb
      .collection("aikm_admin")
      .doc("lotsPriceSnapshot")
      .set({ prices: currentPrices, savedAt: new Date().toISOString() });
  } catch (err) {
    console.warn("LOTS price trend check failed:", err);
  }
}
function startLotsCatalogSync() {
  fbDb &&
    (fbLotsChunksUnsub && (fbLotsChunksUnsub(), (fbLotsChunksUnsub = null)),
    (lotsChunksCache = {}),
    (fbLotsChunksUnsub = fbDb
      .collection("aikm_admin")
      .doc("lotsCatalog")
      .collection("chunks")
      .onSnapshot(
        (e) => {
          e.docChanges().forEach((e) => {
            "removed" === e.type
              ? delete lotsChunksCache[e.doc.id]
              : (lotsChunksCache[e.doc.id] = e.doc.data().products || []);
          });
          const t = Object.values(lotsChunksCache).flat();
          if (!t.length) return;
          t.forEach((e) => {
            e.slabs &&
              e.slabs.forEach((e) => {
                null === e.max && (e.max = 1 / 0);
              });
          });
          const n = new Date().toISOString();
          try {
            localStorage.setItem(VENDOR_STORE_KEY, JSON.stringify({ products: t, fileLabel: "(synced)", savedAt: n }));
          } catch (e) {}
          ((lotsVendor.products = t),
            (lotsVendor.prepped = t.map((e) => ({
              ...prepProduct(e.name),
              code: e.code,
              brand: e.brand || null,
              barcode: e.barcode || null,
              asin: e.asin || null,
              sellerSku: e.sellerSku || null,
            }))),
            "function" == typeof rebuildAllPrepped && rebuildAllPrepped(),
            "function" == typeof clearSpapiMatchCache && clearSpapiMatchCache(),
            "function" == typeof renderLotsRow && renderLotsRow(),
            "function" == typeof checkReady && checkReady(),
            checkLotsPriceTrend(t));
        },
        (e) => {
          console.warn("LOTS catalog chunks sync error", e);
        },
      )));
}
let fbMasterMappingUnsub = null,
  lastMasterMappingSavedAt = null,
  masterMappingChunksCache = {},
  fbMasterMappingChunksUnsub = null;
async function pushMasterMappingToCloud(e) {
  if (!fbDb) return;
  e && "" in e && delete e[""];
  const t = (e, t) => {
    const n = document.getElementById("masterMappingSyncStatus");
    n && ((n.textContent = e), (n.style.color = t ? "var(--om-green,#1f8a4c)" : "var(--om-red,#c0392b)"));
  };
  t("Syncing…", !0);
  try {
    const n = Object.entries(e),
      a = 300,
      o = fbDb.collection("aikm_admin").doc("masterMapping").collection("chunks"),
      r = await o.get(),
      s = new Set(r.docs.map((e) => e.id)),
      l = new Set();
    let i = 0;
    for (let e = 0; e < n.length; e += a) {
      const t = Object.fromEntries(n.slice(e, e + a)),
        r = `chunk_${i}`;
      (l.add(r), await o.doc(r).set({ map: t }), i++);
    }
    const d = fbDb.batch();
    let c = 0;
    (s.forEach((e) => {
      l.has(e) || (d.delete(o.doc(e)), c++);
    }),
      c && (await d.commit()));
    const p = new Date().toISOString();
    (await fbDb.collection("aikm_admin").doc("masterMapping").set({ savedAt: p, entryCount: n.length, chunkCount: i }),
      (lastMasterMappingSavedAt = p),
      t(`✓ Synced ${new Date().toLocaleTimeString()}`, !0));
  } catch (n) {
    (console.warn("Master Mapping sync failed", n),
      t("Sync failed — will retry", !1),
      setTimeout(() => {
        fbDb && pushMasterMappingToCloud(e);
      }, 5e3));
  }
}
function startMasterMappingSync() {
  fbDb &&
    (fbMasterMappingChunksUnsub && (fbMasterMappingChunksUnsub(), (fbMasterMappingChunksUnsub = null)),
    (masterMappingChunksCache = {}),
    (fbMasterMappingChunksUnsub = fbDb
      .collection("aikm_admin")
      .doc("masterMapping")
      .collection("chunks")
      .onSnapshot(
        (e) => {
          e.docChanges().forEach((e) => {
            "removed" === e.type
              ? delete masterMappingChunksCache[e.doc.id]
              : (masterMappingChunksCache[e.doc.id] = e.doc.data().map || {});
          });
          const t = Object.assign({}, ...Object.values(masterMappingChunksCache));
          if (!Object.keys(t).length) return;
          const n = loadLearned(),
            a = { ...n, ...t };
          (Object.keys(n).forEach((e) => {
            t[e] && n[e].savedAt > t[e].savedAt && (a[e] = n[e]);
          }),
            saveLearned(a),
            "function" == typeof clearSpapiMatchCache && clearSpapiMatchCache());
          const o = document.getElementById("masterMappingSyncStatus");
          (o &&
            ((o.textContent = `✓ Synced ${new Date().toLocaleTimeString()}`),
            (o.style.color = "var(--om-green,#1f8a4c)")),
            "function" == typeof renderMasterMapping && renderMasterMapping(),
            "function" == typeof checkReady && checkReady());
        },
        (e) => {
          console.warn("Master Mapping chunks sync error", e);
        },
      )));
}
let fbOmsUnsub = null,
  fbOmsChunksUnsub = null,
  omsOrdersRaw = [],
  omsChunksCache = {};
function startOmsOrdersSync() {
  fbDb &&
    (fbOmsUnsub && (fbOmsUnsub(), (fbOmsUnsub = null)),
    fbOmsChunksUnsub && (fbOmsChunksUnsub(), (fbOmsChunksUnsub = null)),
    (fbOmsUnsub = fbDb
      .collection("aikm_admin")
      .doc("omsOrders")
      .onSnapshot(
        (e) => {
          const t = document.getElementById("omsLastSynced");
          if (!e.exists) return ((window.__omsLastSyncedDate = null), void (t && (t.textContent = "Not synced yet")));
          const n = e.data();
          if (n && n.lastSynced && n.lastSynced.toDate) {
            window.__omsLastSyncedDate = n.lastSynced.toDate();
            if (t) {
              const e = Math.round((Date.now() - n.lastSynced.toDate().getTime()) / 6e4);
              t.textContent = `Last synced: ${fmtAgo(e)} · ${n.orderCount || 0} orders`;
            }
          }
        },
        (e) => console.warn("OMS orders meta sync error", e),
      )),
    (fbOmsChunksUnsub = fbDb
      .collection("aikm_admin")
      .doc("omsOrders")
      .collection("chunks")
      .onSnapshot(
        (e) => {
          (e.docChanges().forEach((e) => {
            "removed" === e.type
              ? delete omsChunksCache[e.doc.id]
              : (omsChunksCache[e.doc.id] = e.doc.data().orders || []);
          }),
            (omsOrdersRaw = Object.values(omsChunksCache).flat()),
            (window.omsOrdersRaw = omsOrdersRaw),
            "function" == typeof rebuildOmsByAwbMap && rebuildOmsByAwbMap(),
            "function" == typeof invalidateFlattenedZippyCache && invalidateFlattenedZippyCache(),
            "function" == typeof renderOmsOrdersTable && renderOmsOrdersTable(),
            "function" == typeof renderLossOrdersTab && renderLossOrdersTab(),
            "function" == typeof integrateOmsIntoMasterData && integrateOmsIntoMasterData(),
            "function" == typeof loadOmsOrdersIntoSelfShip && loadOmsOrdersIntoSelfShip(),
            "function" == typeof renderZippyShipmentsTable && renderZippyShipmentsTable(),
            "function" == typeof renderScans && renderScans());
          const t = document.getElementById("sidebarLossCount");
          t && "function" == typeof isOmsOrderLoss && (t.textContent = omsOrdersRaw.filter(isOmsOrderLoss).length);
          const __olc = document.getElementById("omsLossCount");
          __olc &&
            "function" == typeof isOmsOrderLoss &&
            (__olc.textContent = omsOrdersRaw.filter(isOmsOrderLoss).length);
        },
        (e) => console.warn("OMS orders chunks sync error", e),
      )));
}
const OMS_SOURCE_NAME = "OMS Guru (auto-sync)";
function integrateOmsIntoMasterData() {
  if (void 0 === awbMap || void 0 === orderMap) return;
  (Object.keys(awbMap).forEach((e) => {
    ((awbMap[e] = awbMap[e].filter((e) => e.sourceFile !== OMS_SOURCE_NAME)), awbMap[e].length || delete awbMap[e]);
  }),
    Object.keys(orderMap).forEach((e) => {
      ((orderMap[e] = orderMap[e].filter((e) => e.sourceFile !== OMS_SOURCE_NAME)),
        orderMap[e].length || delete orderMap[e]);
    }));
  let e = 0;
  if (
    (omsOrdersRaw.forEach((t) => {
      const n = {
        product: t.productName || "(unnamed product)",
        qty: Number(t.qty) || 1,
        channel: t.channel || "—",
        profit: Number(t.profit) || 0,
        cogs: Number(t.cogs) || 0,
        mobile: t.buyerPhone || "",
        awb: (t.awb || "").trim().toUpperCase(),
        orderNo: (t.channelOrderId || t.invoiceNumber || "").trim().toUpperCase(),
        orderDate: t.orderDate || "",
        slaDate: t.slaDate || "",
        sourceFile: OMS_SOURCE_NAME,
        uploadDate: "function" == typeof todayStr ? todayStr() : "",
      };
      (n.awb && (awbMap[n.awb] || (awbMap[n.awb] = []), awbMap[n.awb].push(n)),
        n.orderNo && (orderMap[n.orderNo] || (orderMap[n.orderNo] = []), orderMap[n.orderNo].push(n)));
      const a = (t.invoiceNumber || "").trim().toUpperCase();
      (a && a !== n.orderNo && (orderMap[a] || (orderMap[a] = []), orderMap[a].push(n)), e++);
    }),
    void 0 !== loadedFiles)
  ) {
    const t = loadedFiles.findIndex((e) => e.name === OMS_SOURCE_NAME),
      n = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      a = {
        name: OMS_SOURCE_NAME,
        ok: !0,
        rowCount: e,
        missing: [],
        syncedAt: n,
        date: "function" == typeof todayStr ? todayStr() : "",
      };
    -1 === t ? loadedFiles.push(a) : (loadedFiles[t] = a);
  }
  if (("function" == typeof renderFileChips && renderFileChips(), "function" == typeof reresolveNotFound)) {
    reresolveNotFound() > 0 &&
      ("function" == typeof renderSummary && renderSummary(),
      "function" == typeof rebuildHistoryTable && rebuildHistoryTable(),
      "function" == typeof updateStats && updateStats());
  }
  "function" == typeof updateStats && updateStats();
}
function loadOmsOrdersIntoSelfShip() {
  if ("function" != typeof loadFile || !omsOrdersRaw || !omsOrdersRaw.length) return;
  loadFile([
    [
      "Channel Name",
      "Buyer Phone",
      "Channel Order Id",
      "Channel Sub Order Id",
      "Qty",
      "Shipment Tracker",
      "Shipping Company",
      "Shipment Date",
    ],
    ...omsOrdersRaw.map((e) => [
      e.channel || "",
      e.buyerPhone || "",
      e.channelOrderId || "",
      e.channelSubOrderId || "",
      e.qty || "",
      e.awb || "",
      e.courier || "",
      e.shipmentDate || "",
    ]),
  ]);
  const e = document.getElementById("filename");
  if (e && "function" == typeof setFilenameDisplay) {
    setFilenameDisplay(e, `OMS Guru (auto-sync) — ${omsOrdersRaw.length} rows`, null);
    const t = e.querySelector(".fn-remove");
    t && t.remove();
  }
}
let omsView = "all",
  omsStatusTab = "active";
function setOmsStatusTab(e) {
  ((omsStatusTab = e), renderOmsOrdersTable());
}
function ensureOmsStatusTabsBar() {
  if (document.getElementById("omsOrdersStatusTabs")) return;
  const e = document.getElementById("omsSearchBox");
  if (!e) return;
  const t = e.closest("div") || e.parentElement,
    n = document.createElement("div");
  ((n.id = "omsOrdersStatusTabs"),
    (n.className = "rtabbar"),
    (n.style.margin = "0 0 10px 0"),
    t.parentNode.insertBefore(n, t));
}
function renderOmsOrdersStatusTabs() {
  ensureOmsStatusTabsBar();
  const e = document.getElementById("omsOrdersStatusTabs");
  if (!e) return;
  const t = {};
  omsOrdersRaw.forEach((e) => {
    const n = e.status || "Unknown";
    t[n] = (t[n] || 0) + 1;
  });
  const n = [
    { key: "active", label: "All", count: omsOrdersRaw.filter((e) => "Cancelled" !== e.status).length },
    ...Object.keys(t)
      .sort()
      .map((e) => ({ key: e, label: e, count: t[e] })),
  ];
  e.innerHTML = n
    .map(
      (e) =>
        `<button type="button" class="rtabbtn ${omsStatusTab === e.key ? "active" : ""}" onclick="setOmsStatusTab('${e.key.replace(/'/g, "\\'")}')">${escapeHtml(e.label)} <span class="rtab-count">${e.count}</span></button>`,
    )
    .join("");
}
function setOmsView(e) {
  ((omsView = e),
    document
      .querySelectorAll("#omsViewTabs .rtabbtn")
      .forEach((t) => t.classList.toggle("active", t.dataset.omsView === e)),
    renderOmsOrdersTable());
}
function populateOmsFilterOptions() {
  const e = document.getElementById("omsStatusFilter");
  e &&
    e.options.length <= 1 &&
    [...new Set(omsOrdersRaw.map((e) => e.status).filter(Boolean))].sort().forEach((t) => {
      const n = document.createElement("option");
      ((n.value = t), (n.textContent = t), e.appendChild(n));
    });
  const t = document.getElementById("omsChannelFilter");
  t &&
    t.options.length <= 1 &&
    [...new Set(omsOrdersRaw.map((e) => e.channel).filter(Boolean))].sort().forEach((e) => {
      const n = document.createElement("option");
      ((n.value = e), (n.textContent = e), t.appendChild(n));
    });
  const n = document.getElementById("omsProductFilter");
  n &&
    n.options.length <= 1 &&
    [...new Set(omsOrdersRaw.map((e) => e.productName).filter(Boolean))].sort().forEach((e) => {
      const t = document.createElement("option");
      ((t.value = e), (t.textContent = e.length > 40 ? e.slice(0, 40) + "…" : e), n.appendChild(t));
    });
}
function isOmsOrderLoss(e) {
  return (
    !/cancel/i.test(e.status || "") &&
    "function" == typeof isLossEntry &&
    isLossEntry({ channel: e.channel, mobile: e.buyerPhone, profit: e.profit })
  );
}
function getFilteredOmsOrders() {
  const e = (document.getElementById("omsSearchBox")?.value || "").trim().toLowerCase(),
    t = document.getElementById("omsStatusFilter")?.value || "",
    n = document.getElementById("omsChannelFilter")?.value || "",
    a = document.getElementById("omsProductFilter")?.value || "",
    o = document.getElementById("omsDateFrom")?.value || "",
    r = document.getElementById("omsDateTo")?.value || "",
    s = o ? new Date(o + "T00:00:00") : null,
    l = r ? new Date(r + "T23:59:59") : null;
  let i = omsOrdersRaw;
  return (
    "loss" === omsView && (i = i.filter(isOmsOrderLoss)),
    (i =
      "active" === omsStatusTab
        ? i.filter((e) => "Cancelled" !== e.status)
        : i.filter((e) => e.status === omsStatusTab)),
    t && (i = i.filter((e) => e.status === t)),
    n && (i = i.filter((e) => e.channel === n)),
    a && (i = i.filter((e) => e.productName === a)),
    (i = i.filter((e) => passesColumnFilters("omsOrdersTable", e))),
    (s || l) &&
      (i = i.filter((e) => {
        const t = e.orderDate ? new Date(e.orderDate) : null;
        return !(!t || isNaN(t)) && !(s && t < s) && !(l && t > l);
      })),
    e &&
      (i = i.filter(
        (t) =>
          (t.buyerName || "").toLowerCase().includes(e) ||
          (t.sku || "").toLowerCase().includes(e) ||
          (t.awb || "").toLowerCase().includes(e) ||
          (t.channelOrderId || "").toLowerCase().includes(e) ||
          (t.invoiceNumber || "").toLowerCase().includes(e) ||
          (t.productName || "").toLowerCase().includes(e),
      )),
    (i = [...i].sort((e, t) => new Date(t.orderDate) - new Date(e.orderDate))),
    i
  );
}
function renderOmsOrdersTable() {
  const e = document.getElementById("omsOrdersBody"),
    t = document.getElementById("omsOrdersTable"),
    n = document.getElementById("omsOrdersEmpty"),
    a = document.getElementById("omsOrderCount");
  if (!e) return;
  (populateOmsFilterOptions(), renderOmsOrdersStatusTabs(), setupColumnFilterIcons("omsOrdersTable", omsOrdersRaw));
  const o = document.getElementById("omsLossCount");
  o && (o.textContent = omsOrdersRaw.filter(isOmsOrderLoss).length);
  const r = getFilteredOmsOrders();
  if ((a && (a.textContent = r.length ? `(${r.length} shown of ${omsOrdersRaw.length})` : ""), !r.length))
    return (
      (t.style.display = "none"),
      (n.style.display = "block"),
      void (n.textContent = omsOrdersRaw.length
        ? "No orders match that search/filter."
        : "Waiting for first sync — connect Firebase in Backend/Data if you haven't, then wait up to 15 minutes.")
    );
  ((n.style.display = "none"),
    (t.style.display = "table"),
    (e.innerHTML = r
      .slice(0, 3e3)
      .map(
        (e) =>
          `\n      <tr class="${isOmsOrderLoss(e) ? "loss-row" : ""}">\n        <td>${e.orderDate || ""}</td>\n        <td>${e.slaDate || ""}</td>\n        <td>${e.channelOrderId || ""}</td>\n        <td>${e.asin || ""}</td>\n        <td>${e.channel || ""}</td>\n        <td>${e.qty || ""}</td>\n        <td>${e.total || ""}</td>\n        <td>${e.profit || ""}</td>\n        <td>${e.status || ""}</td>\n        <td>${e.awb || ""}</td>\n        <td>${e.courier || ""}</td>\n      </tr>\n    `,
      )
      .join("")));
}
function exportOmsOrdersToExcel() {
  const e = getFilteredOmsOrders();
  if (!e.length) return void alert("No rows to export with the current filter.");
  const t = e.map((e) => ({
      "Order Date": e.orderDate || "",
      "SLA Date": e.slaDate || "",
      "Order Number": e.channelOrderId || "",
      "Invoice Number": e.invoiceNumber || "",
      "Buyer Name": e.buyerName || "",
      City: e.buyerCity || "",
      State: e.buyerState || "",
      Product: e.productName || "",
      SKU: e.sku || "",
      Channel: e.channel || "",
      Qty: e.qty || "",
      Total: e.total || "",
      "Expected Profit": e.profit || "",
      Status: e.status || "",
      AWB: e.awb || "",
      Courier: e.courier || "",
      "Buyer Phone": e.buyerPhone || "",
      "Loss Order": isOmsOrderLoss(e) ? "Yes" : "",
    })),
    n = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(n, XLSX.utils.json_to_sheet(t), "OMS Orders");
  const a = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(n, `OMS_Orders_${a}.xlsx`);
}




























function populateLossOrdersFilterOptions() {
  const e = omsOrdersRaw.filter(isOmsOrderLoss),
    t = document.getElementById("lossOrdersChannelFilter");
  t &&
    t.options.length <= 1 &&
    [...new Set(e.map((e) => e.channel).filter(Boolean))].sort().forEach((e) => {
      const n = document.createElement("option");
      ((n.value = e), (n.textContent = e), t.appendChild(n));
    });
  const n = document.getElementById("lossOrdersProductFilter");
  n &&
    n.options.length <= 1 &&
    [...new Set(e.map((e) => e.productName).filter(Boolean))].sort().forEach((e) => {
      const t = document.createElement("option");
      ((t.value = e), (t.textContent = e.length > 40 ? e.slice(0, 40) + "…" : e), n.appendChild(t));
    });
}
function getFilteredLossOrders() {
  const e = (document.getElementById("lossOrdersSearchBox")?.value || "").trim().toLowerCase(),
    t = document.getElementById("lossOrdersChannelFilter")?.value || "",
    n = document.getElementById("lossOrdersProductFilter")?.value || "",
    a = document.getElementById("lossOrdersDateFrom")?.value || "",
    o = document.getElementById("lossOrdersDateTo")?.value || "",
    r = a ? new Date(a + "T00:00:00") : null,
    s = o ? new Date(o + "T23:59:59") : null;
  let l = omsOrdersRaw.filter(isOmsOrderLoss);
  return (
    t && (l = l.filter((e) => e.channel === t)),
    n && (l = l.filter((e) => e.productName === n)),
    (l = l.filter((e) => passesColumnFilters("lossOrdersTable", e))),
    (r || s) &&
      (l = l.filter((e) => {
        const t = e.orderDate ? new Date(e.orderDate) : null;
        return !(!t || isNaN(t)) && !(r && t < r) && !(s && t > s);
      })),
    e &&
      (l = l.filter(
        (t) =>
          (t.buyerName || "").toLowerCase().includes(e) ||
          (t.sku || "").toLowerCase().includes(e) ||
          (t.awb || "").toLowerCase().includes(e) ||
          (t.channelOrderId || "").toLowerCase().includes(e) ||
          (t.invoiceNumber || "").toLowerCase().includes(e) ||
          (t.productName || "").toLowerCase().includes(e),
      )),
    (l =
      "asc" === lossOrdersProfitSortDir
        ? [...l].sort((e, t) => (Number(e.profit) || 0) - (Number(t.profit) || 0))
        : "desc" === lossOrdersProfitSortDir
          ? [...l].sort((e, t) => (Number(t.profit) || 0) - (Number(e.profit) || 0))
          : [...l].sort((e, t) => new Date(t.orderDate) - new Date(e.orderDate))),
    l
  );
}
let lossOrdersProfitSortDir = null;
function toggleLossOrdersProfitSort() {
  ((lossOrdersProfitSortDir =
    "desc" === lossOrdersProfitSortDir ? "asc" : "asc" === lossOrdersProfitSortDir ? null : "desc"),
    renderLossOrdersTab());
}
function ensureLossProfitHeaderSort() {
  const table = document.getElementById("lossOrdersTable");
  if (!table) return;
  const ths = table.querySelectorAll("thead th");
  let profitTh = null;
  ths.forEach((th) => {
    if (th.textContent.replace(/[▲▼]/g, "").trim() === "Profit") profitTh = th;
  });
  if (!profitTh) return;
  profitTh.style.cursor = "pointer";
  profitTh.title = "Click to sort by profit";
  profitTh.onclick = function (e) {
    if (e.target.closest(".col-filter-btn")) return;
    toggleLossOrdersProfitSort();
  };
  let indicator = profitTh.querySelector(".loss-profit-sort-ind");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "loss-profit-sort-ind";
    indicator.style.marginLeft = "4px";
    profitTh.appendChild(indicator);
  }
  indicator.textContent = "asc" === lossOrdersProfitSortDir ? "▲" : "desc" === lossOrdersProfitSortDir ? "▼" : "⇅";
}
function renderLossOrdersTab() {
  const e = document.getElementById("lossOrdersBody"),
    t = document.getElementById("lossOrdersTable"),
    n = document.getElementById("lossOrdersEmpty"),
    a = document.getElementById("lossOrdersCount");
  if (!e) return;
  (populateLossOrdersFilterOptions(), setupColumnFilterIcons("lossOrdersTable", omsOrdersRaw.filter(isOmsOrderLoss)));
  const o = omsOrdersRaw.filter(isOmsOrderLoss).length,
    r = document.getElementById("sidebarLossCount");
  r && (r.textContent = o);
  const lossPct = omsOrdersRaw.length ? ((o / omsOrdersRaw.length) * 100).toFixed(1) : "0.0";
  const s = getFilteredLossOrders();
  if (
    (a && (a.textContent = s.length ? `(${s.length} shown of ${o} · ${lossPct}% of all orders)` : ""),
    ensureLossProfitHeaderSort(),
    !s.length)
  )
    return (
      (t.style.display = "none"),
      (n.style.display = "block"),
      void (n.textContent = o
        ? "No loss orders match that search/filter."
        : omsOrdersRaw.length
          ? "No loss orders in the current data — nice."
          : "Waiting for first sync — connect Firebase in Backend/Data if you haven't, then wait up to 15 minutes.")
    );
  ((n.style.display = "none"),
    (t.style.display = "table"),
    (e.innerHTML = s
      .slice(0, 3e3)
      .map(
        (e) =>
          `\n      <tr class="loss-row">\n        <td>${e.orderDate || ""}</td>\n        <td>${e.channelOrderId || ""}</td>\n        <td>${e.productName || ""}</td><td>${e.asin || ""}</td>\n        <td>${e.channel || ""}</td>\n        <td>${e.qty || ""}</td>\n        <td>${e.total || ""}</td>\n        <td>${e.profit || ""}${e.total ? ` <span style="font-size:10px;opacity:.75;">(${(((Number(e.profit) || 0) / Number(e.total)) * 100).toFixed(1)}%)</span>` : ""}</td>\n        <td>${e.status || ""}</td>\n        <td>${e.awb || ""}</td>\n        <td>${e.courier || ""}</td>\n      </tr>\n    `,
      )
      .join("")));
}
function exportLossOrdersToExcel() {
  const e = getFilteredLossOrders();
  if (!e.length) return void alert("No rows to export with the current filter.");
  const t = e.map((e) => ({
      "Order Date": e.orderDate || "",
      "Order Number": e.channelOrderId || "",
      "Invoice Number": e.invoiceNumber || "",
      "Buyer Name": e.buyerName || "",
      City: e.buyerCity || "",
      State: e.buyerState || "",
      Product: e.productName || "",
      SKU: e.sku || "",
      Channel: e.channel || "",
      Qty: e.qty || "",
      Total: e.total || "",
      "Expected Profit": e.profit || "",
      Status: e.status || "",
      AWB: e.awb || "",
      Courier: e.courier || "",
      "Buyer Phone": e.buyerPhone || "",
    })),
    n = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(n, XLSX.utils.json_to_sheet(t), "Loss Orders");
  const a = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(n, `Loss_Orders_${a}.xlsx`);
}
(!(function () {
  const e = document.getElementById("zippyUploadDropzone"),
    t = document.getElementById("zippyUploadInput");
  e &&
    t &&
    (e.addEventListener("click", () => t.click()),
    t.addEventListener("change", (e) => {
      const t = e.target.files[0];
      if (!t) return;
      const n = document.getElementById("zippyUploadFileName");
      (n && (n.textContent = t.name), processZippyUploadFile(t));
    }),
    e.addEventListener("dragover", (t) => {
      (t.preventDefault(), e.classList.add("filled"));
    }),
    e.addEventListener("dragleave", () => e.classList.remove("filled")),
    e.addEventListener("drop", (t) => {
      (t.preventDefault(), e.classList.remove("filled"));
      const n = t.dataTransfer.files[0];
      if (!n) return;
      const a = document.getElementById("zippyUploadFileName");
      (a && (a.textContent = n.name), processZippyUploadFile(n));
    }));
})(),
  document.getElementById("lossOrdersSearchBox")?.addEventListener("input", () => {
    "function" == typeof renderLossOrdersTab && renderLossOrdersTab();
  }),
  document.getElementById("lossOrdersChannelFilter")?.addEventListener("change", () => {
    "function" == typeof renderLossOrdersTab && renderLossOrdersTab();
  }),
  document.getElementById("lossOrdersProductFilter")?.addEventListener("change", () => {
    "function" == typeof renderLossOrdersTab && renderLossOrdersTab();
  }),
  document.getElementById("omsSearchBox")?.addEventListener("input", () => {
    "function" == typeof renderOmsOrdersTable && renderOmsOrdersTable();
  }),
  document.getElementById("omsChannelFilter")?.addEventListener("change", () => {
    "function" == typeof renderOmsOrdersTable && renderOmsOrdersTable();
  }),
  document.getElementById("omsProductFilter")?.addEventListener("change", () => {
    "function" == typeof renderOmsOrdersTable && renderOmsOrdersTable();
  }));
const OTHER_VENDORS_KEY = "order_mapper_other_vendors_v1";
function loadOtherVendors() {
  try {
    return JSON.parse(localStorage.getItem(OTHER_VENDORS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}
function saveOtherVendors() {
  try {
    localStorage.setItem(OTHER_VENDORS_KEY, JSON.stringify(otherVendors));
  } catch (e) {}
  "function" == typeof saveAll && saveAll();
}
function renderLotsRow() {
  $("lotsVendorRow").innerHTML =
    '\n      <div class="vendor-row" style="grid-template-columns:1fr;">\n        <div class="vendor-file-btn filled" id="lotsFileBtn" style="cursor:default;">Waiting for first sync…</div>\n        <input type="file" id="lotsFileInput" accept=".xlsx,.xls,.csv" style="display:none;">\n      </div>\n      <div class="price-warning" id="priceWarning" style="display:none;"></div>\n    ';
  const e = $("lotsFileBtn"),
    t = $("lotsFileInput"),
    n = $("priceWarning"),
    a = loadLotsStore();
  if (a && a.products && a.products.length) {
    (a.products.forEach((e) => {
      e.slabs &&
        e.slabs.forEach((e) => {
          null === e.max && (e.max = 1 / 0);
        });
    }),
      (lotsVendor.products = a.products),
      (lotsVendor.prepped = a.products.map((e) => ({
        ...prepProduct(e.name),
        code: e.code,
        brand: e.brand || null,
        barcode: e.barcode || null,
        asin: e.asin || null,
        sellerSku: e.sellerSku || null,
      }))));
    const t = a.savedAt ? new Date(a.savedAt).toLocaleDateString() : "",
      o = a.products.some((e) => e.slabs && e.slabs.length);
    ((e.textContent = `✅ Auto-synced from LOTS Wholesale — ${a.products.length} products (updated ${t})`),
      e.classList.add("filled"),
      o
        ? (n.style.display = "none")
        : ((n.style.display = "block"),
          (n.innerHTML =
            "⚠ This sync has no pricing data yet — it'll fill in automatically once the daily LOTS sync includes pricing for these items.")));
  }
  t.addEventListener("change", async (t) => {
    if (!t.target.files.length) return;
    const a = t.target.files[0];
    if (
      ((e.textContent = "Reading file…"),
      (lotsVendor.workbook = await readWorkbook(a)),
      (lotsVendor.products = extractVendorProducts(lotsVendor.workbook)),
      lotsVendor.products)
    ) {
      lotsVendor.prepped = lotsVendor.products.map((e) => ({
        ...prepProduct(e.name),
        code: e.code,
        brand: e.brand || null,
        barcode: e.barcode || null,
        asin: e.asin || null,
        sellerSku: e.sellerSku || null,
      }));
      const t = saveLotsToStore(lotsVendor.products, a.name),
        o = lotsVendor.products.some((e) => e.slabs && e.slabs.length);
      ((e.textContent = t
        ? `✓ ${a.name} — ${lotsVendor.products.length} products (saved — no need to re-upload next time)`
        : `✓ ${a.name} — ${lotsVendor.products.length} products (too large to save locally — re-upload next time)`),
        e.classList.add("filled"),
        o
          ? (n.style.display = "none")
          : ((n.style.display = "block"),
            (n.innerHTML =
              "⚠ No MRP/Slab price columns found in this file, so Rate & Value won't be available — matching still works fine.")));
    } else
      ((e.textContent = "⚠ Could not find Item Code / Product Name — click to retry"), e.classList.remove("filled"));
    (rebuildAllPrepped(), checkReady());
  });
}
let lotsPriceByCode = {};
function rebuildAllPrepped() {
  ((allPrepped = lotsVendor.prepped ? lotsVendor.prepped.map((e) => ({ ...e, vendorName: "LOTS" })) : []),
    (lotsPriceByCode = {}),
    lotsVendor.products &&
      lotsVendor.products.forEach((e) => {
        lotsPriceByCode[e.code] = e;
      }));
}
function bestSlabFor(e) {
  if (!e || !e.length) return null;
  let t = e[0];
  return (
    e.forEach((e) => {
      e.price < t.price && (t = e);
    }),
    t
  );
}
let __lotsSortedSrc = null,
  __lotsSorted = [],
  lotsProductsPage = 0;
const LOTS_PAGE_SIZE = 200;
function getFilteredLotsProducts() {
  const q = (document.getElementById("lotsProductsSearch")?.value || "").trim().toLowerCase();
  /* PERF: sort the catalog once per sync (was re-sorting ~7,000 names on every render) */
  if (__lotsSortedSrc !== lotsVendor.products) {
    __lotsSortedSrc = lotsVendor.products;
    const coll = new Intl.Collator();
    __lotsSorted = (lotsVendor.products || []).slice().sort((a, b) => coll.compare(a.name || "", b.name || ""));
  }
  let list = __lotsSorted;
  if (q)
    list = list.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q),
    );
  return list;
}
function renderLotsProductsTable() {
  const body = document.getElementById("lotsProductsBody"),
    table = document.getElementById("lotsProductsTable"),
    empty = document.getElementById("lotsProductsEmpty"),
    countEl = document.getElementById("lotsProductsCount");
  if (!body) return;
  const list = getFilteredLotsProducts();
  const maxPage = Math.max(0, Math.ceil(list.length / LOTS_PAGE_SIZE) - 1);
  lotsProductsPage = Math.min(lotsProductsPage, maxPage);
  const pageStart = lotsProductsPage * LOTS_PAGE_SIZE;
  if (countEl)
    countEl.textContent = list.length
      ? `showing ${pageStart + 1}-${Math.min(pageStart + LOTS_PAGE_SIZE, list.length)} of ${list.length} · ${(lotsVendor.products || []).length} products`
      : "";
  let pager = document.getElementById("lotsProductsPager");
  if (!pager && table) {
    pager = document.createElement("div");
    pager.id = "lotsProductsPager";
    pager.style.cssText = "display:none;align-items:center;gap:10px;margin-top:12px;";
    pager.innerHTML =
      '<button type="button" class="secondary" id="lotsProductsPagerPrev" style="padding:6px 12px;font-size:12px;">← Prev</button><span id="lotsProductsPagerLabel" style="font-size:12px;color:var(--muted);"></span><button type="button" class="secondary" id="lotsProductsPagerNext" style="padding:6px 12px;font-size:12px;">Next →</button>';
    table.parentNode.insertBefore(pager, table.nextSibling);
    document.getElementById("lotsProductsPagerPrev").onclick = () => {
      lotsProductsPage = Math.max(0, lotsProductsPage - 1);
      renderLotsProductsTable();
    };
    document.getElementById("lotsProductsPagerNext").onclick = () => {
      lotsProductsPage = lotsProductsPage + 1;
      renderLotsProductsTable();
    };
  }
  if (pager) {
    pager.style.display = list.length > LOTS_PAGE_SIZE ? "flex" : "none";
    const lbl = document.getElementById("lotsProductsPagerLabel");
    if (lbl) lbl.textContent = `Page ${lotsProductsPage + 1} of ${maxPage + 1} · ${list.length} items`;
  }
  if (!list.length) {
    table.style.display = "none";
    empty.style.display = "block";
    empty.textContent =
      lotsVendor.products && lotsVendor.products.length
        ? "No products match that search."
        : "Waiting for LOTS catalog sync…";
    return;
  }
  empty.style.display = "none";
  table.style.display = "table";
  body.innerHTML = list
    .slice(pageStart, pageStart + LOTS_PAGE_SIZE)
    .map((p) => {
      const slab = p.slabs && p.slabs.length ? bestSlabFor(p.slabs) : null,
        slabTxt = slab ? `₹${slab.price} (${slab.min}${slab.max === 1 / 0 ? "+" : "-" + slab.max})` : "—";
      return `<tr><td>${escapeHtml(p.name || "")}</td><td>${escapeHtml(p.barcode || "—")}</td><td>${escapeHtml(p.code || "—")}</td><td>${null != p.qty ? p.qty : "—"}</td><td>${slabTxt}</td><td>${null != p.gst ? p.gst + "%" : "—"}</td></tr>`;
    })
    .join("");
}
document.getElementById("lotsProductsSearch")?.addEventListener("input", () => {
  lotsProductsPage = 0;
  "function" == typeof renderLotsProductsTable && renderLotsProductsTable();
});
function defaultOrderQty(e) {
  const t = computeLotsQty(e);
  if (!e.selected || !e.selected.code) return t;
  const n = lotsPriceByCode[e.selected.code];
  if (!n || !n.slabs || !n.slabs.length) return t;
  const a = bestSlabFor(n.slabs);
  return Math.max(t, a.min);
}
function getOrderQty(e) {
  return null !== e.manualQty && void 0 !== e.manualQty ? e.manualQty : defaultOrderQty(e);
}
function rowPricing(e) {
  if (!e.selected || !e.selected.code) return null;
  const t = lotsPriceByCode[e.selected.code];
  if (!t || !t.slabs) return null;
  const n = getOrderQty(e),
    a = slabPriceFor(t.slabs, n);
  return a
    ? {
        rate: a.price,
        qty: n,
        value: a.price * n,
        slabLabel: a.max === 1 / 0 || null === a.max ? `${a.min}+` : `${a.min}-${a.max}`,
        needQty: computeLotsQty(e),
        bumped: n > computeLotsQty(e),
      }
    : null;
}
function mrpLabel(e) {
  const t = lotsPriceByCode[e];
  if (!t) return "";
  let n = "";
  if ((t.mrp && (n += ` · MRP ₹${t.mrp}`), t.slabs && t.slabs.length)) {
    n += ` · from ₹${Math.min(...t.slabs.map((e) => e.price))}`;
  }
  return n;
}
function renderOtherVendorChips() {
  const e = $("otherVendorChips");
  ((e.innerHTML = otherVendors.length ? "" : '<span class="note">No other vendors yet — add one below.</span>'),
    otherVendors.forEach((t) => {
      const n = document.createElement("div");
      ((n.className = "vendor-chip"),
        (n.innerHTML = `<span>${escapeHtml(t)}</span><button type="button" data-v="${escapeHtml(t)}">✕</button>`),
        n.querySelector("button").addEventListener("click", () => {
          ((otherVendors = otherVendors.filter((e) => e !== t)),
            saveOtherVendors(),
            renderOtherVendorChips(),
            checkReady());
        }),
        e.appendChild(n));
    }));
}
function addOtherVendor(e) {
  (e = e.trim()) &&
    "lots" !== e.toLowerCase() &&
    !otherVendors.includes(e) &&
    (otherVendors.push(e), saveOtherVendors(), renderOtherVendorChips(), checkReady());
}
function renderStoredDataPanel() {
  const e = document.getElementById("storedDataList");
  if (!e) return;
  const t = [],
    n = loadLotsStore();
  if (n && n.products && n.products.length) {
    const e = n.savedAt ? new Date(n.savedAt).toLocaleDateString() : "unknown";
    t.push(
      `\n        <div class="sd-row">\n          <div class="sd-icon">📦</div>\n          <div class="sd-info">\n            <div class="sd-title">LOTS Price List</div>\n            <div class="sd-meta">${n.products.length} products · saved ${e}</div>\n          </div>\n          <div class="sd-actions">\n            <button onclick="viewStoredData('lots')">👁 View</button>\n            <button class="sd-danger" onclick="deleteStoredData('lots')">🗑 Delete</button>\n          </div>\n        </div>`,
    );
  }
  const a = loadLearned(),
    o = Object.values(a);
  (o.length &&
    t.push(
      `\n        <div class="sd-row">\n          <div class="sd-icon">🗂</div>\n          <div class="sd-info">\n            <div class="sd-title">Remembered Mappings</div>\n            <div class="sd-meta">${o.length} product${1 === o.length ? "" : "s"} mapped · kept permanently</div>\n          </div>\n          <div class="sd-actions">\n            <button onclick="viewStoredData('learned')">👁 View</button>\n            <button class="sd-danger" onclick="deleteStoredData('learned')">🗑 Delete All</button>\n          </div>\n        </div>`,
    ),
    otherVendors.length &&
      t.push(
        `\n        <div class="sd-row">\n          <div class="sd-icon">🏬</div>\n          <div class="sd-info">\n            <div class="sd-title">Other Vendors</div>\n            <div class="sd-meta">${otherVendors.join(", ")}</div>\n          </div>\n          <div class="sd-actions">\n            <button onclick="viewStoredData('vendors')">👁 View</button>\n            <button class="sd-danger" onclick="deleteStoredData('vendors')">🗑 Delete All</button>\n          </div>\n        </div>`,
      ),
    (e.innerHTML = t.length
      ? t.join("")
      : '<div class="sd-empty">Nothing stored yet — upload a LOTS price list or match some products in Order Mapper.</div>'));
}
function viewStoredData(e) {
  const t = document.querySelector('.tabbtn[data-tab="ordermapper"]');
  t && t.click();
  "function" == typeof switchOrderMapperSection &&
    switchOrderMapperSection("learned" === e ? "masterMappingCard" : "vendorsSection");
}
function deleteStoredData(e) {
  if ("lots" === e) {
    if (!confirm("Delete the saved LOTS price list? You will need to re-upload it next time.")) return;
    (localStorage.removeItem(VENDOR_STORE_KEY),
      (lotsVendor = { name: "LOTS", workbook: null, products: null, prepped: null }),
      rebuildAllPrepped(),
      renderLotsRow());
  } else if ("learned" === e) {
    if (!confirm("Delete all remembered product-to-vendor mappings? This cannot be undone.")) return;
    (localStorage.removeItem(LEARN_KEY), "function" == typeof renderMasterMapping && renderMasterMapping());
  } else if ("vendors" === e) {
    if (!confirm("Delete all other vendors? This cannot be undone.")) return;
    ((otherVendors = []), saveOtherVendors(), renderOtherVendorChips());
  }
  (renderStoredDataPanel(), "function" == typeof saveAll && saveAll());
}
function autoDefaultVendor() {
  return lotsVendor.prepped && lotsVendor.prepped.length ? "LOTS" : 1 === otherVendors.length ? otherVendors[0] : "";
}
function setupDrop(e, t, n, a, o) {
  const r = $(e),
    s = $(t);
  function l(e) {
    (($(n).textContent = e.name), r.classList.add("filled"), o(e));
  }
  (r.addEventListener("click", () => s.click()),
    r.addEventListener("dragover", (e) => {
      (e.preventDefault(), (r.style.borderColor = "var(--gold)"));
    }),
    r.addEventListener("dragleave", () => {
      r.style.borderColor = "";
    }),
    r.addEventListener("drop", (e) => {
      (e.preventDefault(), e.dataTransfer.files.length && l(e.dataTransfer.files[0]));
    }),
    s.addEventListener("change", (e) => {
      e.target.files.length && l(e.target.files[0]);
    }));
}
function ordersFromSummaryMap(e) {
  const t = new Map();
  return (
    Object.values(e || {}).forEach((e) => {
      if (!e || !e.product) return;
      const n = String(e.product).trim(),
        a = Number(e.qty) || 0;
      n && t.set(n, (t.get(n) || 0) + a);
    }),
    Array.from(t, ([e, t]) => ({ name: e, qty: t }))
  );
}
function refreshLiveSummaryCount() {
  const e = $("liveSummaryCount");
  if (!e) return;
  const t = ordersFromSummaryMap(void 0 !== summaryMap ? summaryMap : {});
  e.textContent = `${t.length} product${1 === t.length ? "" : "s"}`;
}
function checkReady() {
  const e = (lotsVendor.prepped && lotsVendor.prepped.length) || otherVendors.length;
  $("matchBtn").disabled = !(e && orderItems);
}
($("clearVendorMemoryBtn").addEventListener("click", () => {
  confirm("Forget the saved LOTS price list on this computer? You will need to re-upload it next time.") &&
    (localStorage.removeItem(VENDOR_STORE_KEY),
    alert("Saved LOTS price list cleared. Reload the page to start fresh."));
}),
  $("addVendorBtn").addEventListener("click", () => {
    (addOtherVendor($("newVendorInput").value), ($("newVendorInput").value = ""), $("newVendorInput").focus());
  }),
  $("newVendorInput").addEventListener("keydown", (e) => {
    "Enter" === e.key &&
      (e.preventDefault(), addOtherVendor($("newVendorInput").value), ($("newVendorInput").value = ""));
  }),
  renderLotsRow(),
  (otherVendors = loadOtherVendors()),
  renderOtherVendorChips(),
  rebuildAllPrepped(),
  setupDrop("dz-order", "file-order", "dz-order-fname", "dz-order-hint", async (e) => {
    (($("dz-order-hint").textContent = "Reading file…"),
      (orderWorkbook = await readWorkbook(e)),
      (orderItems = extractOrderItems(orderWorkbook)),
      orderItems
        ? ($("dz-order-hint").textContent = `✓ ${orderItems.length} products loaded`)
        : (($("dz-order-hint").textContent = "⚠ Could not find Product / Qty columns"),
          $("dz-order").classList.remove("filled"),
          (orderItems = null)),
      checkReady());
  }),
  $("useLiveSummaryBtn").addEventListener("click", () => {
    const e = $("liveSummaryStatus"),
      t = ordersFromSummaryMap(void 0 !== summaryMap ? summaryMap : {});
    if (!t.length)
      return (
        (e.textContent =
          "⚠ No products in the current summary yet — scan some orders in the Order/AWB Scanner tab first."),
        void (e.className = "fb-status err")
      );
    ((orderItems = t),
      (orderWorkbook = null),
      (e.textContent = `✓ ${t.length} products loaded from the live Product Summary.`),
      (e.className = "fb-status ok"),
      refreshLiveSummaryCount(),
      checkReady());
  }),
  $("matchBtn").addEventListener("click", runMatching),
  $("resetBtn").addEventListener("click", () => location.reload()),
  $("confidenceFilter").addEventListener("change", (e) => {
    ((currentFilter = e.target.value), renderResults());
  }),
  $("clearMemoryBtn").addEventListener("click", () => {
    confirm(`Forget all ${learnedCount()} remembered matches on this computer?`) &&
      (localStorage.removeItem(LEARN_KEY), alert("Remembered matches cleared."));
  }));
let hasMatched = !1;
function runMatching() {
  ((results = orderItems.map((e) => buildResult(e.name, e.qty, e.name, {}))),
    renderResults(),
    (hasMatched = !0),
    updateNavAvailability(),
    switchOrderMapperSection("resultsCard"));
}
function buildResult(e, t, n, a) {
  a = a || {};
  const o = prepProduct((n = n || "")),
    r = n ? learnedFor(n) : null,
    s = {
      orderName: e,
      qty: t,
      matchName: n,
      prep: o,
      include: !0,
      manualQty: null,
      isSplitPart: !1,
      comboSource: null,
      partLabel: null,
      addingNewProduct: !1,
      moreOpen: !1,
      packOpen: !1,
    };
  if (r)
    return Object.assign(
      s,
      {
        vendorFilter: r.vendorName,
        selected: { code: r.code || "", name: r.name || n, vendorName: r.vendorName, score: 1, plain: !r.code },
        auto: !0,
        remembered: !0,
        orderPackQty: r.orderPackQty ?? o.mult,
        lotsPackQty: r.vendorPackQty ?? 1,
        candidates: lotsVendor.prepped ? topMatches(o, allPrepped, 6) : [],
      },
      a,
    );
  const l = void 0 !== a.vendorFilter ? a.vendorFilter : autoDefaultVendor();
  if (l && otherVendors.includes(l))
    return Object.assign(
      s,
      {
        vendorFilter: l,
        selected: { code: "", name: n || e, vendorName: l, score: 1, plain: !0 },
        auto: !0,
        remembered: !1,
        orderPackQty: o.mult,
        lotsPackQty: 1,
        candidates: [],
      },
      a,
    );
  const i = lotsVendor.prepped ? topMatches(o, allPrepped, 6) : [],
    d = i[0],
    c = n && d && d.score >= 0.95;
  return Object.assign(
    s,
    {
      vendorFilter: l || "",
      selected: c ? { code: d.code, name: d.name, vendorName: d.vendorName, score: d.score } : null,
      auto: c,
      remembered: !1,
      orderPackQty: o.mult,
      lotsPackQty: c ? d.mult : 1,
      candidates: i,
    },
    a,
  );
}
function applyVendorMode(e, t) {
  const n = results[e];
  if (((n.vendorFilter = t), (n.manualQty = null), t))
    if (otherVendors.includes(t))
      ((n.selected = { code: "", name: n.matchName || n.orderName, vendorName: t, score: 1, plain: !0 }),
        (n.candidates = []),
        (n.auto = !0),
        (n.remembered = !1),
        (n.lotsPackQty = 1));
    else {
      const e = lotsVendor.prepped ? topMatches(n.prep, allPrepped, 6) : [],
        t = e[0],
        a = t && t.score >= 0.95;
      ((n.selected = a ? { code: t.code, name: t.name, vendorName: t.vendorName, score: t.score } : null),
        (n.candidates = e),
        (n.auto = a),
        (n.remembered = !1),
        (n.lotsPackQty = a ? t.mult : 1));
    }
  else
    ((n.selected = null),
      (n.candidates = lotsVendor.prepped ? topMatches(n.prep, allPrepped, 6) : []),
      (n.auto = !1),
      (n.remembered = !1));
  (persistIfSelected(e), n.selected && (n.expanded = !1), renderResults());
}
function addNewLotsProduct(e, t, n, a) {
  if (
    (lotsVendor.products || (lotsVendor.products = []),
    lotsVendor.prepped || (lotsVendor.prepped = []),
    lotsVendor.products.push({ code: t, name: n }),
    lotsVendor.prepped.push({ ...prepProduct(n), code: t, brand: null, barcode: null, asin: null, sellerSku: null }),
    a)
  ) {
    const e = loadLotsTiers();
    ((e[t] = a), saveLotsTiers(e));
  }
  (saveLotsToStore(lotsVendor.products, "LOTS.xlsx"), rebuildAllPrepped());
  const o = results[e];
  ((o.selected = { code: t, name: n, vendorName: "LOTS", score: 1 }),
    (o.vendorFilter = "LOTS"),
    (o.addingNewProduct = !1),
    (o.remembered = !1),
    (o.expanded = !1),
    persistIfSelected(e),
    renderResults());
}
const LOTS_TIERS_KEY = "order_mapper_lots_tiers_v1";
function loadLotsTiers() {
  try {
    return JSON.parse(localStorage.getItem(LOTS_TIERS_KEY) || "{}");
  } catch (e) {
    return {};
  }
}
function saveLotsTiers(e) {
  try {
    localStorage.setItem(LOTS_TIERS_KEY, JSON.stringify(e));
  } catch (err) {
    console.warn("lotsTiers localStorage save failed:", err);
  }
  try {
    "function" == typeof saveAll && saveAll();
  } catch (err) {}
}
function getComboSplitModal() {
  let e = document.getElementById("comboSplitModal");
  return (
    e ||
    ((e = document.createElement("div")),
    (e.id = "comboSplitModal"),
    (e.className = "admin-modal-overlay"),
    (e.style.display = "none"),
    (e.innerHTML =
      '\n      <div class="admin-modal-box">\n        <div class="admin-modal-glow"></div>\n        <div class="admin-modal-head">\n          <span class="admin-modal-kicker">Combo of Different Products</span>\n          <h3>How many separate products?</h3>\n        </div>\n        <div class="admin-modal-body">\n          <p id="comboSplitProductName" style="opacity:.75;font-size:12px;margin-bottom:10px;"></p>\n          <label for="comboSplitInput">Number of products bundled in this line</label>\n          <input type="number" id="comboSplitInput" min="2" max="10" value="2" autocomplete="off">\n        </div>\n        <div class="admin-modal-actions">\n          <button type="button" class="admin-modal-btn ghost" id="comboSplitCancel">Cancel</button>\n          <button type="button" class="admin-modal-btn gold" id="comboSplitConfirm">Split</button>\n        </div>\n      </div>\n    '),
    document.body.appendChild(e),
    e)
  );
}
function askComboSplitCount(e, t) {
  return new Promise((n) => {
    const a = getComboSplitModal(),
      o = a.querySelector("#comboSplitInput"),
      r = a.querySelector("#comboSplitProductName"),
      s = a.querySelector("#comboSplitConfirm"),
      l = a.querySelector("#comboSplitCancel");
    function i() {
      ((a.style.display = "none"),
        s.removeEventListener("click", d),
        l.removeEventListener("click", c),
        o.removeEventListener("keydown", p));
    }
    function d() {
      const e = parseInt(o.value, 10);
      if ((i(), !e || e < 2 || e > 10)) return (alert("Please enter a number between 2 and 10."), void n(null));
      n(e);
    }
    function c() {
      (i(), n(null));
    }
    function p(e) {
      ("Enter" === e.key && (e.preventDefault(), d()), "Escape" === e.key && (e.preventDefault(), c()));
    }
    ((r.textContent = e),
      (o.value = t > 1 ? String(t) : "2"),
      (a.style.display = "flex"),
      setTimeout(() => {
        (o.focus(), o.select());
      }, 50),
      s.addEventListener("click", d),
      l.addEventListener("click", c),
      o.addEventListener("keydown", p));
  });
}
async function splitRow(e) {
  const t = results[e];
  let n = trySplitCombo(t.orderName);
  if (!n) {
    const e = extractMultiplier(normalize(t.orderName)),
      a = await askComboSplitCount(t.orderName, e > 1 ? e : 2);
    if (!a) return;
    n = new Array(a).fill("");
  }
  const a = n.length,
    o = n.map((e, n) =>
      buildResult(t.orderName, t.qty, e, {
        isSplitPart: !0,
        comboSource: t.orderName,
        partLabel: `Part ${n + 1} of ${a}`,
      }),
    );
  (results.splice(e, 1, ...o), renderResults());
}
function removeRow(e) {
  (results.splice(e, 1), renderResults());
}
function computeLotsQty(e) {
  const t = (Number(e.qty) || 0) * (Number(e.orderPackQty) || 1),
    n = Number(e.lotsPackQty) || 1;
  return Math.max(0, Math.ceil(t / n));
}
function confidenceBadge(e, t, n, a) {
  const o = null != e ? `${(100 * e).toFixed(0)}%` : "";
  return n
    ? `<span class="badge blue" title="Remembered from a previous fix, ${o}">📌 Remembered</span>`
    : a
      ? '<span class="badge blue">✓ Assigned</span>'
      : null == e
        ? '<span class="badge red">✕ No match</span>'
        : e >= 1
          ? `<span class="badge blue" title="Confidence ${o}">✓ Exact</span>`
          : e >= 0.95
            ? `<span class="badge green" title="Confidence ${o}">✓ Very High</span>`
            : e >= 0.8
              ? `<span class="badge amber" title="Confidence ${o}">⚠ Review Recommended</span>`
              : `<span class="badge red" title="Confidence ${o}">✕ No Match</span>`;
}
function effectiveScore(e) {
  return e.selected ? e.selected.score : e.candidates[0] ? e.candidates[0].score : 0;
}
function confidenceTier(e) {
  const t = effectiveScore(e);
  return t >= 1 ? "exact" : t >= 0.95 ? "very_high" : t >= 0.8 ? "review" : "no_match";
}
function visibleIndices() {
  let e = results.map((e, t) => t);
  return (
    "needsMapping" === currentFilter
      ? (e = e.filter((e) => {
          const t = confidenceTier(results[e]);
          return "no_match" === t || "review" === t;
        }))
      : currentFilter && "all" !== currentFilter && (e = e.filter((e) => confidenceTier(results[e]) === currentFilter)),
    (e = e.filter((e) =>
      passesColumnFilters("resultsTable", {
        orderName: results[e].orderName,
        confidenceTier: confidenceTier(results[e]),
      }),
    )),
    e.sort((e, t) => effectiveScore(results[e]) - effectiveScore(results[t])),
    e
  );
}
function pendingMappingCount() {
  return results.filter((e) => e.include && ("no_match" === confidenceTier(e) || "review" === confidenceTier(e)))
    .length;
}
function renderResults() {
  const e = $("resultsBody");
  ((e.innerHTML = ""),
    setupColumnFilterIcons(
      "resultsTable",
      results.map((e) => ({ orderName: e.orderName, confidenceTier: confidenceTier(e) })),
    ));
  const t = visibleIndices();
  if (!t.length)
    return (
      (e.innerHTML = '<tr><td colspan="7" class="empty">No rows match this filter.</td></tr>'),
      void updateSummary()
    );
  (t.forEach((t) => {
    const n = results[t],
      a = document.createElement("tr");
    ((a.id = `row-${t}`), n.include || a.classList.add("exclude-row"), n.isSplitPart && a.classList.add("split-row"));
    const o = n.selected,
      r = n.candidates[0],
      s = o ? o.score : r ? r.score : null,
      l = !o && r && "mismatch" === r.sizeStatus,
      i = getOrderQty(n),
      d = o && o.plain,
      c = rowPricing(n),
      p = computeLotsQty(n);
    if (void 0 === n.expanded) {
      const e = confidenceTier(n);
      n.expanded = "no_match" === e || "review" === e;
    }
    if (!n.expanded)
      return (
        a.classList.add("row-collapsed"),
        (a.innerHTML = `\n          <td><input type="checkbox" class="chk" ${n.include ? "checked" : ""} data-idx="${t}" data-act="toggle"></td>\n          <td colspan="5">\n            <button type="button" class="collapsed-row-btn" data-act="expandRow" data-idx="${t}">\n              <span class="cr-product">${escapeHtml(n.isSplitPart ? n.partLabel : n.orderName)}</span>\n              <span class="cr-arrow">→</span>\n              <span class="cr-match">${o ? escapeHtml(o.name) : "—"}</span>\n              <span class="cr-vendor-tag">${o ? escapeHtml(o.vendorName) : ""}</span>\n              <span class="cr-qty">Qty ${i}</span>\n              ${c ? `<span class="cr-value">₹${c.value.toFixed(0)}</span>` : ""}\n            </button>\n          </td>\n          <td data-conf="${t}">${confidenceBadge(s, l, n.remembered, d && !n.remembered)}</td>\n        `),
        void e.appendChild(a)
      );
    const u = `\n        <div class="more-wrap">\n          <button type="button" class="mini-link" data-act="toggleMoreGlobal" data-idx="${t}">⋯ more</button>\n        </div>`,
      m = `<button type="button" class="mini-link" data-act="collapseRow" data-idx="${t}">▲ done, collapse</button>`,
      f = n.isSplitPart
        ? `<div class="prod-name">🔀 ${escapeHtml(n.partLabel)}</div>\n          <div class="prod-hint">From: ${escapeHtml(n.comboSource)}</div>\n          ${u}`
        : `<div class="prod-name">${escapeHtml(n.orderName)}</div>\n          ${n.orderPackQty > 1 ? `<div class="prod-qty">Pack of ${n.orderPackQty}</div>` : ""}\n          ${u}`,
      y = `\n        <option value="">— choose vendor —</option>\n        ${lotsVendor.prepped ? `<option value="LOTS" ${"LOTS" === n.vendorFilter ? "selected" : ""}>LOTS</option>` : ""}\n        ${otherVendors.map((e) => `<option value="${escapeHtml(e)}" ${n.vendorFilter === e ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}\n        <option value="__add_new__">+ Add new vendor…</option>\n      `,
      h = d
        ? `<select class="vendor-select" data-idx="${t}" data-act="vendorFilter">${y}</select>\n          <div class="plain-assign">\n            <label>Product name for ${escapeHtml(o.vendorName)}:</label>\n            <input class="plain-name-input" type="text" value="${escapeHtml(o.name)}" data-idx="${t}" data-act="plainName">\n          </div>`
        : `<select class="vendor-select" data-idx="${t}" data-act="vendorFilter">${y}</select>\n          ${n.addingNewProduct ? `\n            <div class="add-new-product">\n              <label>Item Code</label>\n              <input class="new-prod-input" type="text" data-idx="${t}" data-act="newCode" placeholder="e.g. 104500123">\n              <label>Product Name</label>\n              <input class="new-prod-input" type="text" data-idx="${t}" data-act="newName" value="${escapeHtml(n.matchName || n.orderName)}">\n              <label>Price (optional)</label>\n              <input class="new-prod-input" type="text" data-idx="${t}" data-act="newTier" placeholder="e.g. 45">\n              <div class="add-new-actions">\n                <button type="button" class="btn btn-gold btn-small" data-act="saveNewProduct" data-idx="${t}">Save & Use</button>\n                <button type="button" class="btn btn-ghost btn-small" data-act="cancelNewProduct" data-idx="${t}">Cancel</button>\n              </div>\n            </div>\n          ` : `\n            <div class="search-wrap">\n              <input class="search-input" placeholder="Search LOTS products…" data-idx="${t}"\n                      value="${escapeHtml(o ? o.name : n.matchName || "")}" autocomplete="off"\n                      ${lotsVendor.prepped ? "" : "disabled"}>\n            </div>\n            ${o ? `<div class="match-code">Code ${escapeHtml(o.code)}${mrpLabel(o.code)}</div>` : lotsVendor.prepped ? "" : '<div class="match-code">Upload LOTS price list, or pick a vendor above</div>'}\n          `}`,
      g = `\n        ${c && c.bumped ? `<div class="need-note" title="You need ${p}, but ordering ${i} gets a lower per-unit rate">Best price at ${i} (need ${p})</div>` : ""}\n        <input class="qty-input final-qty" type="number" min="0" value="${i}" data-idx="${t}" data-act="finalQty">\n        ${n.orderPackQty > 1 || n.lotsPackQty > 1 || !1 === d ? `\n          <button type="button" class="mini-link" data-act="togglePack" data-idx="${t}">⚙ pack</button>\n          ${n.packOpen ? `\n            <div class="pack-row">\n              <input class="pack-input" type="number" min="1" value="${n.orderPackQty}" data-idx="${t}" data-act="orderPack" title="Pieces per unit in your order file">\n              <span>÷</span>\n              <input class="pack-input" type="number" min="1" value="${n.lotsPackQty}" data-idx="${t}" data-act="lotsPack" title="Pieces per unit as sold by the vendor" ${d ? "disabled" : ""}>\n            </div>\n          ` : ""}\n        ` : ""}\n      `,
      b = c
        ? `<div class="rate-val" title="₹${c.rate} × ${c.qty} (slab ${c.slabLabel})">₹${c.value.toFixed(0)}</div>`
        : '<div class="rate-sub">—</div>';
    ((a.innerHTML = `\n        <td><input type="checkbox" class="chk" ${n.include ? "checked" : ""} data-idx="${t}" data-act="toggle"></td>\n        <td>${f}</td>\n        <td><input class="qty-input" type="number" min="0" value="${n.qty}" data-idx="${t}" data-act="qty"></td>\n        <td>${h}</td>\n        <td>${g}</td>\n        <td>${b}</td>\n        <td data-conf="${t}">${confidenceBadge(s, l, n.remembered, d && !n.remembered)}${m}</td>\n      `),
      e.appendChild(a));
  }),
    attachRowHandlers(),
    updateSummary());
}
function escapeHtml(e) {
  return String(e).replace(
    /[&<>"']/g,
    (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[e],
  );
}
function attachRowHandlers() {
  (document.querySelectorAll('input[data-act="toggle"]').forEach((e) => {
    e.addEventListener("change", (e) => {
      const t = +e.target.dataset.idx;
      ((results[t].include = e.target.checked),
        document.getElementById(`row-${t}`).classList.toggle("exclude-row", !e.target.checked),
        updateSummary());
    });
  }),
    document.querySelectorAll('input[data-act="qty"]').forEach((e) => {
      e.addEventListener("input", (e) => {
        const t = +e.target.dataset.idx;
        ((results[t].qty = Number(e.target.value) || 0), (results[t].manualQty = null), refreshRowCalc(t));
      });
    }),
    attachOrderQtyCellHandlers($("resultsBody")),
    document.querySelectorAll('[data-act="expandRow"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.currentTarget.dataset.idx;
        ((results[t].expanded = !0), renderResults());
      });
    }),
    document.querySelectorAll('[data-act="collapseRow"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.currentTarget.dataset.idx;
        ((results[t].expanded = !1), renderResults());
      });
    }),
    document.querySelectorAll('[data-act="toggleMoreGlobal"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        e.stopPropagation();
        const t = +e.currentTarget.dataset.idx;
        globalMoreMenuEl && globalMoreMenuEl.classList.contains("open") && +globalMoreMenuEl.dataset.idx === t
          ? hideGlobalMoreMenu()
          : showGlobalMoreMenu(t, e.currentTarget);
      });
    }),
    document.querySelectorAll('[data-act="splitCombo"]').forEach((e) => {
      e.addEventListener("click", (e) => splitRow(+e.target.dataset.idx));
    }),
    document.querySelectorAll('[data-act="removePart"]').forEach((e) => {
      e.addEventListener("click", (e) => removeRow(+e.target.dataset.idx));
    }),
    document.querySelectorAll('[data-act="addNewProduct"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.target.dataset.idx;
        ((results[t].addingNewProduct = !0), (results[t].moreOpen = !1), renderResults());
      });
    }),
    document.querySelectorAll('[data-act="cancelNewProduct"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.target.dataset.idx;
        ((results[t].addingNewProduct = !1), renderResults());
      });
    }),
    document.querySelectorAll('[data-act="saveNewProduct"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.target.dataset.idx,
          n = document.getElementById(`row-${t}`),
          a = n.querySelector('[data-act="newCode"]').value.trim(),
          o = n.querySelector('[data-act="newName"]').value.trim(),
          r = n.querySelector('[data-act="newTier"]').value.trim();
        a && o ? addNewLotsProduct(t, a, o, r) : alert("Please enter both an Item Code and a Product Name.");
      });
    }),
    document.querySelectorAll('select[data-act="vendorFilter"]').forEach((e) => {
      e.addEventListener("change", (e) => {
        const t = +e.target.dataset.idx;
        if ("__add_new__" === e.target.value) {
          const e = prompt("New vendor name:");
          return void (e && e.trim() ? (addOtherVendor(e.trim()), applyVendorMode(t, e.trim())) : renderResults());
        }
        applyVendorMode(t, e.target.value);
      });
    }),
    document.querySelectorAll('input[data-act="plainName"]').forEach((e) => {
      (e.addEventListener("input", (e) => {
        const t = +e.target.dataset.idx,
          n = results[t];
        n.selected && ((n.selected.name = e.target.value), (n.matchName = e.target.value));
      }),
        e.addEventListener("change", (e) => persistIfSelected(+e.target.dataset.idx)));
    }),
    document.querySelectorAll(".search-input").forEach((e) => {
      (e.addEventListener("focus", (t) => {
        const n = +t.target.dataset.idx;
        showGlobalSuggestList(
          n,
          e,
          e.value.trim() === (results[n].selected ? results[n].selected.name : "") ? "" : e.value,
        );
      }),
        e.addEventListener("input", (t) => {
          showGlobalSuggestList(+t.target.dataset.idx, e, e.value);
        }),
        e.addEventListener("blur", () => setTimeout(hideGlobalSuggestList, 150)));
    }));
}
(document.addEventListener(
  "scroll",
  () => {
    if (!globalSuggestList || !globalSuggestList.classList.contains("open")) return;
    const e = globalSuggestList.dataset.idx,
      t = document.querySelector(`.search-input[data-idx="${e}"]`);
    t && positionGlobalSuggestList(t);
  },
  !0,
),
  window.addEventListener("resize", hideGlobalSuggestList));
let globalSuggestList = null,
  globalSuggestActiveIndex = -1;
function getGlobalSuggestList() {
  if (globalSuggestList) return globalSuggestList;
  function e(e) {
    window.__selectSuggestItemFromEl(e);
  }
  return (
    (globalSuggestList = document.createElement("div")),
    (globalSuggestList.className = "suggest-list"),
    (globalSuggestList.id = "globalSuggestList"),
    document.body.appendChild(globalSuggestList),
    globalSuggestList.addEventListener("mousedown", (t) => {
      t.preventDefault();
      const n = t.target.closest(".suggest-item");
      n && e(n);
    }),
    (globalSuggestList.tabIndex = -1),
    document.addEventListener("keydown", (t) => {
      if (!globalSuggestList.classList.contains("open")) return;
      const n = [...globalSuggestList.querySelectorAll(".suggest-item")];
      n.length &&
        ("ArrowDown" === t.key
          ? (t.preventDefault(),
            (globalSuggestActiveIndex = Math.min(n.length - 1, globalSuggestActiveIndex + 1)),
            n.forEach((e, t) => e.classList.toggle("active", t === globalSuggestActiveIndex)),
            n[globalSuggestActiveIndex].scrollIntoView({ block: "nearest" }))
          : "ArrowUp" === t.key
            ? (t.preventDefault(),
              (globalSuggestActiveIndex = Math.max(0, globalSuggestActiveIndex - 1)),
              n.forEach((e, t) => e.classList.toggle("active", t === globalSuggestActiveIndex)),
              n[globalSuggestActiveIndex].scrollIntoView({ block: "nearest" }))
            : "Enter" === t.key && globalSuggestActiveIndex >= 0
              ? (t.preventDefault(), e(n[globalSuggestActiveIndex]))
              : "Escape" === t.key && hideGlobalSuggestList());
    }),
    globalSuggestList
  );
}
function positionGlobalSuggestList(e) {
  const t = getGlobalSuggestList(),
    n = e.getBoundingClientRect(),
    a = window.innerHeight - n.bottom < 160 && n.top > 160;
  ((t.style.left = n.left + "px"),
    (t.style.width = n.width + "px"),
    a
      ? ((t.style.top = "auto"), (t.style.bottom = window.innerHeight - n.top + 4 + "px"))
      : ((t.style.bottom = "auto"), (t.style.top = n.bottom + 4 + "px")),
    t.style.setProperty("position", "fixed", "important"),
    t.style.setProperty("z-index", "2147483647", "important"),
    t.style.setProperty("pointer-events", "auto", "important"),
    "function" == typeof hideGlobalMoreMenu && hideGlobalMoreMenu());
}
function showGlobalSuggestList(e, t, n) {
  const a = getGlobalSuggestList();
  if (((a.dataset.idx = e), (globalSuggestActiveIndex = -1), !lotsVendor.prepped))
    return (
      (a.innerHTML = '<div class="suggest-item">Upload the LOTS price list first</div>'),
      positionGlobalSuggestList(t),
      a.classList.add("open"),
      (a.style.display = "block"),
      void startSuggestListAutoReposition(t)
    );
  let o;
  if (n) {
    o = topMatchesForSearch(prepProduct(n), allPrepped, 10);
  } else o = results[e].candidates;
  ((a.innerHTML =
    o
      .map(
        (t) =>
          `\n      <div class="suggest-item" data-row-idx="${e}" data-code="${escapeHtml(t.code)}" data-name="${escapeHtml(t.name)}" data-vendor="${escapeHtml(t.vendorName)}" data-score="${t.score}"\n          onmousedown="event.preventDefault(); window.__selectSuggestItemFromEl(this);">\n        ${escapeHtml(t.name)} <span class="sc">${(100 * t.score).toFixed(0)}%</span>\n        <small>Code: ${escapeHtml(t.code)} · ${escapeHtml(t.vendorName)}${mrpLabel(t.code)}</small>\n      </div>\n    `,
      )
      .join("") || '<div class="suggest-item">No matches found — try a shorter keyword, or the exact item code</div>'),
    positionGlobalSuggestList(t),
    a.classList.add("open"),
    (a.style.display = "block"),
    startSuggestListAutoReposition(t));
}
window.__selectSuggestItemFromEl = function (e) {
  if (!e) return;
  const t = +e.dataset.rowIdx;
  if (!Number.isFinite(t)) return;
  const n = results[t];
  if (!n) return;
  ((n.selected = {
    code: e.dataset.code,
    name: e.dataset.name,
    vendorName: e.dataset.vendor,
    score: Number(e.dataset.score),
  }),
    (n.vendorFilter = e.dataset.vendor),
    (n.remembered = !1));
  const a = document.querySelector(`.search-input[data-idx="${t}"]`),
    o = a && a.value ? a.value.trim() : "";
  n.matchName = o || e.dataset.name;
  const r = allPrepped.find(
    (t) => t.code === e.dataset.code && t.name === e.dataset.name && t.vendorName === e.dataset.vendor,
  );
  ((n.lotsPackQty = r ? r.mult : 1), (n.manualQty = null), (n.expanded = !1));
  try {
    persistIfSelected(t);
  } catch (e) {
    console.error("Saving this selection failed, but it is still applied on screen:", e);
  }
  (hideGlobalSuggestList(), renderResults());
};
let suggestListRepositionTimer = null;
function startSuggestListAutoReposition(e) {
  (stopSuggestListAutoReposition(),
    (suggestListRepositionTimer = setInterval(() => {
      globalSuggestList && globalSuggestList.classList.contains("open") && document.body.contains(e)
        ? positionGlobalSuggestList(e)
        : stopSuggestListAutoReposition();
    }, 120)));
}
function stopSuggestListAutoReposition() {
  suggestListRepositionTimer && (clearInterval(suggestListRepositionTimer), (suggestListRepositionTimer = null));
}
function hideGlobalSuggestList() {
  (globalSuggestList && (globalSuggestList.classList.remove("open"), (globalSuggestList.style.display = "none")),
    (globalSuggestActiveIndex = -1),
    stopSuggestListAutoReposition());
}
function persistIfSelected(e) {
  const t = results[e];
  t &&
    t.selected &&
    (rememberMatch(t.matchName, t.selected, t.orderPackQty, t.lotsPackQty, {
      isSplitPart: t.isSplitPart,
      comboSource: t.comboSource,
    }),
    (t.remembered = !0),
    (t.selected.score = 1));
}
function renderPriceCellHTML(e) {
  const t = rowPricing(e);
  return t
    ? `<div class="rate-val" title="₹${t.rate} × ${t.qty} (slab ${t.slabLabel})">₹${t.value.toFixed(0)}</div>`
    : '<div class="rate-sub">—</div>';
}
function renderOrderQtyCellHTML(e, t) {
  const n = getOrderQty(e),
    a = computeLotsQty(e),
    o = rowPricing(e),
    r = o && o.bumped,
    s = e.selected && e.selected.plain;
  return `\n      ${r ? `<div class="need-note" title="You need ${a}, but ordering ${n} gets a lower per-unit rate">Best price at ${n} (need ${a})</div>` : ""}\n      <input class="qty-input final-qty" type="number" min="0" value="${n}" data-idx="${t}" data-act="finalQty">\n      ${e.orderPackQty > 1 || e.lotsPackQty > 1 || !1 === s ? `\n        <button type="button" class="mini-link" data-act="togglePack" data-idx="${t}">⚙ pack</button>\n        ${e.packOpen ? `\n          <div class="pack-row">\n            <input class="pack-input" type="number" min="1" value="${e.orderPackQty}" data-idx="${t}" data-act="orderPack" title="Pieces per unit in your order file">\n            <span>÷</span>\n            <input class="pack-input" type="number" min="1" value="${e.lotsPackQty}" data-idx="${t}" data-act="lotsPack" title="Pieces per unit as sold by the vendor" ${s ? "disabled" : ""}>\n          </div>\n        ` : ""}\n      ` : ""}\n    `;
}
function attachOrderQtyCellHandlers(e) {
  (e.querySelectorAll('input[data-act="orderPack"]').forEach((e) => {
    e.addEventListener("input", (e) => {
      const t = +e.target.dataset.idx;
      ((results[t].orderPackQty = Number(e.target.value) || 1),
        (results[t].manualQty = null),
        refreshRowCalc(t),
        persistIfSelected(t));
    });
  }),
    e.querySelectorAll('input[data-act="lotsPack"]').forEach((e) => {
      e.addEventListener("input", (e) => {
        const t = +e.target.dataset.idx;
        ((results[t].lotsPackQty = Number(e.target.value) || 1),
          (results[t].manualQty = null),
          refreshRowCalc(t),
          persistIfSelected(t));
      });
    }),
    e.querySelectorAll('input[data-act="finalQty"]').forEach((e) => {
      e.addEventListener("input", (e) => {
        const t = +e.target.dataset.idx;
        results[t].manualQty = Number(e.target.value) || 0;
        const n = document.getElementById(`row-${t}`);
        (n && (n.children[5].innerHTML = renderPriceCellHTML(results[t])), updateSummary());
      });
    }),
    e.querySelectorAll('[data-act="togglePack"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = +e.target.dataset.idx;
        ((results[t].packOpen = !results[t].packOpen), refreshRowCalc(t));
      });
    }));
}
function refreshRowCalc(e) {
  const t = results[e],
    n = document.getElementById(`row-${e}`);
  n &&
    ((n.children[4].innerHTML = renderOrderQtyCellHTML(t, e)),
    (n.children[5].innerHTML = renderPriceCellHTML(t)),
    attachOrderQtyCellHandlers(n.children[4]),
    updateSummary());
}
function updateSummary() {
  let e = 0,
    t = 0,
    n = 0,
    a = 0,
    o = 0,
    r = 0;
  (results.forEach((s) => {
    if (!s.include) return;
    const l = rowPricing(s);
    if ((l && ((o += l.value), r++), s.remembered)) return void a++;
    const i = s.selected ? s.selected.score : s.candidates[0] ? s.candidates[0].score : 0;
    s.selected && i >= 0.95 ? e++ : i >= 0.8 ? t++ : n++;
  }),
    ($("summaryPills").innerHTML =
      `\n      <span class="pill blue"><span class="dot"></span>${a} remembered</span>\n      <span class="pill green"><span class="dot"></span>${e} matched</span>\n      <span class="pill amber"><span class="dot"></span>${t} need review</span>\n      <span class="pill red"><span class="dot"></span>${n} no match</span>\n    `));
  const s = results.filter((e) => e.include && e.selected).length,
    l = r ? ` · Est. value ₹${o.toFixed(0)} (${r} priced items)` : "";
  $("footNote").textContent = `${s} ready to export${l}`;
  const i = pendingMappingCount(),
    d = $("pendingBanner");
  (i > 0
    ? (d.classList.remove("clear"), (d.textContent = `🔴 ${i} still need mapping`))
    : (d.classList.add("clear"), (d.textContent = "✓ All mapped")),
    "function" == typeof updateNavAvailability && updateNavAvailability());
}
function computeByVendor() {
  const e = {};
  return (
    results.forEach((t) => {
      const n = getOrderQty(t);
      if (t.include && t.selected && n > 0) {
        const a = t.selected.vendorName || "Unknown Vendor";
        e[a] || (e[a] = []);
        const o = rowPricing(t);
        e[a].push({
          code: t.selected.code,
          name: t.selected.name,
          qty: n,
          rate: o ? o.rate : null,
          value: o ? o.value : null,
        });
      }
    }),
    e
  );
}
function buildVendorWorkbook(e) {
  const t = [["Item Code", "Product Name", "Order Qty"], ...e.map((e) => [e.code, e.name, e.qty])],
    n = XLSX.utils.aoa_to_sheet(t);
  n["!cols"] = [{ wch: 14 }, { wch: 55 }, { wch: 12 }];
  const a = XLSX.utils.book_new();
  return (XLSX.utils.book_append_sheet(a, n, "Order"), a);
}
function chunkArray(e, t) {
  const n = [];
  for (let a = 0; a < e.length; a += t) n.push(e.slice(a, a + t));
  return n;
}
const VENDOR_MAX_ROWS_PER_FILE = 99;
$("orderMapperDownloadBtn").addEventListener("click", async () => {
  const e = computeByVendor(),
    t = Object.keys(e);
  if (0 === t.length) return void alert("No matched products with quantity to export. Please select matches first.");
  const n = new Date().toISOString().slice(0, 10),
    a = [];
  t.forEach((t) => {
    const o = t.replace(/[^a-z0-9]+/gi, "_").slice(0, 30),
      r = chunkArray(e[t], 99);
    r.forEach((e, t) => {
      const s = r.length > 1 ? `_Part${t + 1}of${r.length}` : "";
      a.push({ filename: `${o}_Order_${n}${s}.xlsx`, wb: buildVendorWorkbook(e) });
    });
  });
  const masterRows = [];
  t.forEach((t) => {
    e[t].forEach((r) => {
      masterRows.push({ Vendor: t, "Item Code": r.code, "Product Name": r.name, "Order Qty": r.qty });
    });
  });
  const masterSheet = XLSX.utils.json_to_sheet(masterRows);
  masterSheet["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 55 }, { wch: 12 }];
  const masterWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(masterWb, masterSheet, "All Vendors");
  a.push({ filename: `Master_Order_${n}.xlsx`, wb: masterWb });
  await window.__ensureJSZip();
  const o = new JSZip();
  a.forEach(({ filename: e, wb: t }) => {
    const n = XLSX.write(t, { bookType: "xlsx", type: "array" });
    o.file(e, n);
  });
  const r = await o.generateAsync({ type: "blob" }),
    s = URL.createObjectURL(r),
    l = document.createElement("a");
  ((l.href = s),
    (l.download = `Vendor_Orders_${n}.zip`),
    document.body.appendChild(l),
    l.click(),
    l.remove(),
    URL.revokeObjectURL(s),
    alert(
      `Downloaded one zip: each vendor file capped at 100 rows including header (matches LOTS' import limit), split into numbered parts where needed, plus one combined Master_Order file.`,
    ));
});
let summaryActiveVendor = null;
function renderVendorSummary() {
  const e = computeByVendor(),
    t = Object.keys(e),
    n = $("vendorTabs"),
    a = $("vendorSummaryBody");
  if (!t.length)
    return (
      (n.innerHTML = ""),
      void (a.innerHTML = '<p class="empty">Nothing mapped yet — match some products first.</p>')
    );
  ((summaryActiveVendor && t.includes(summaryActiveVendor)) || (summaryActiveVendor = t[0]),
    (n.innerHTML = t
      .map(
        (t) =>
          `\n      <button type="button" class="vendor-tab ${t === summaryActiveVendor ? "active" : ""}" data-vendor="${escapeHtml(t)}">\n        ${escapeHtml(t)} (${e[t].length})\n      </button>\n    `,
      )
      .join("")),
    n.querySelectorAll(".vendor-tab").forEach((e) => {
      e.addEventListener("click", () => {
        ((summaryActiveVendor = e.dataset.vendor), renderVendorSummary());
      });
    }));
  const o = e[summaryActiveVendor],
    r = o.reduce((e, t) => e + t.qty, 0),
    s = o.reduce((e, t) => e + (t.value || 0), 0),
    l = o.some((e) => null != e.value),
    i = t.reduce((t, n) => t + e[n].reduce((e, t) => e + (t.value || 0), 0), 0);
  a.innerHTML = `\n      <table class="vsummary-table">\n        <thead><tr>\n          <th>Product Name</th><th style="width:120px;">Item Code</th><th style="width:80px;">Qty</th>\n          <th style="width:90px;">Rate</th><th style="width:100px;">Value</th>\n        </tr></thead>\n        <tbody>\n          ${o.map((e) => `<tr>\n            <td>${escapeHtml(e.name)}</td>\n            <td>${e.code ? escapeHtml(e.code) : "—"}</td>\n            <td>${e.qty}</td>\n            <td>${null != e.rate ? "₹" + e.rate : "—"}</td>\n            <td>${null != e.value ? "₹" + e.value.toFixed(0) : "—"}</td>\n          </tr>`).join("")}\n        </tbody>\n      </table>\n      <div class="vsummary-total">\n        ${o.length} product${1 === o.length ? "" : "s"} · ${r} units\n        ${l ? ` · <strong>₹${s.toFixed(0)}</strong> for ${escapeHtml(summaryActiveVendor)}` : ""}\n        ${t.length > 1 && i > 0 ? `<br><span style="color:var(--muted);font-weight:400;">Grand total across all vendors: ₹${i.toFixed(0)}</span>` : ""}\n      </div>  `;
}
function buildMasterMapping() {
  const e = loadLearned();
  return Object.entries(e)
    .sort((e, t) => (e[1].orderName || "").localeCompare(t[1].orderName || ""))
    .map(([e, t]) => ({
      key: e,
      product: t.orderName || "",
      vendorProduct: t.name || "",
      vendor: t.vendorName || "",
      itemCode: t.code || "",
      orderPack: t.orderPackQty || 1,
      vendorPack: t.vendorPackQty || 1,
      combo: t.isComboPart ? t.comboSource || "Combo part" : "",
    }));
}
($("exportVendorSummaryBtn").addEventListener("click", async () => {
  const e = computeByVendor(),
    t = Object.keys(e);
  if (!t.length) return void alert("Nothing to export yet — match some products first.");
  const n = summaryActiveVendor && e[summaryActiveVendor] ? summaryActiveVendor : t[0],
    a = n.replace(/[^a-z0-9]+/gi, "_").slice(0, 30),
    o = new Date().toISOString().slice(0, 10),
    r = chunkArray(e[n], 99);
  if (1 === r.length) return void XLSX.writeFile(buildVendorWorkbook(r[0]), `${a}_Order_${o}.xlsx`);
  await window.__ensureJSZip();
  const s = new JSZip();
  r.forEach((e, t) => {
    const n = XLSX.write(buildVendorWorkbook(e), { bookType: "xlsx", type: "array" });
    s.file(`${a}_Order_${o}_Part${t + 1}of${r.length}.xlsx`, n);
  });
  const l = await s.generateAsync({ type: "blob" }),
    i = URL.createObjectURL(l),
    d = document.createElement("a");
  ((d.href = i),
    (d.download = `${a}_Order_${o}.zip`),
    document.body.appendChild(d),
    d.click(),
    d.remove(),
    URL.revokeObjectURL(i),
    alert(
      `${n} has over 100 products, so it was split into ${r.length} numbered files inside this zip — upload each part separately.`,
    ));
}),
  $("vendorSummaryBtn").addEventListener("click", () => {
    switchOrderMapperSection("vendorSummaryCard");
  }));
let editingMappingKey = null;
function renderMasterMapping() {
  const e = $("masterMappingBody");
  if (!e) return;
  /* PERF: skip drawing ~13,000 hidden elements; it is drawn when you open the Master Mapping section */
  const __mmCard = document.getElementById("masterMappingCard");
  if (__mmCard && __mmCard.style.display === "none") return;
  const t = buildMasterMapping();
  t.length
    ? ((e.innerHTML = t
        .map((e) =>
          editingMappingKey === e.key
            ? `\n          <tr class="mm-editing">\n            <td>${escapeHtml(e.product)}</td>\n            <td><input class="new-prod-input" data-mmfield="vendorProduct" value="${escapeHtml(e.vendorProduct)}"></td>\n            <td>\n              <select class="new-prod-input" data-mmfield="vendor">\n                ${lotsVendor.prepped ? `<option value="LOTS" ${"LOTS" === e.vendor ? "selected" : ""}>LOTS</option>` : ""}\n                ${otherVendors.map((t) => `<option value="${escapeHtml(t)}" ${e.vendor === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}\n              </select>\n            </td>\n            <td><input class="new-prod-input" data-mmfield="itemCode" value="${escapeHtml(e.itemCode)}"></td>\n            <td style="display:flex;gap:4px;align-items:center;">\n              <input class="pack-input" data-mmfield="orderPack" type="number" min="1" value="${e.orderPack}" style="width:40px;">\n              <span>→</span>\n              <input class="pack-input" data-mmfield="vendorPack" type="number" min="1" value="${e.vendorPack}" style="width:40px;">\n            </td>\n            <td>${e.combo ? `🔀 ${escapeHtml(e.combo)}` : "—"}</td>\n            <td>\n              <button type="button" class="btn btn-gold btn-small" data-act="saveMappingEdit" data-key="${escapeHtml(e.key)}">Save</button>\n              <button type="button" class="btn btn-ghost btn-small" data-act="cancelMappingEdit">✕</button>\n            </td>\n          </tr>`
            : `\n        <tr>\n          <td>${escapeHtml(e.product)}</td>\n          <td>${escapeHtml(e.vendorProduct)}</td>\n          <td>${escapeHtml(e.vendor)}</td>\n          <td>${escapeHtml(e.itemCode || "—")}</td>\n          <td>${e.orderPack} → ${e.vendorPack}</td>\n          <td>${e.combo ? `🔀 ${escapeHtml(e.combo)}` : "—"}</td>\n          <td>\n            <button type="button" class="mini-link" data-act="editMapping" data-key="${escapeHtml(e.key)}">✏ Edit</button>\n            <button type="button" class="mini-link" style="color:var(--red,#c0392b);" data-act="deleteMapping" data-key="${escapeHtml(e.key)}">🗑</button>\n          </td>\n        </tr>`,
        )
        .join("")),
      attachMasterMappingRowHandlers())
    : (e.innerHTML =
        '<tr><td colspan="7" class="empty">No mappings saved yet — match some products first, they\'ll show up here automatically.</td></tr>');
}
function attachMasterMappingRowHandlers() {
  (document.querySelectorAll('[data-act="editMapping"]').forEach((e) => {
    e.addEventListener("click", (e) => {
      ((editingMappingKey = e.target.dataset.key), renderMasterMapping());
    });
  }),
    document.querySelectorAll('[data-act="cancelMappingEdit"]').forEach((e) => {
      e.addEventListener("click", () => {
        ((editingMappingKey = null), renderMasterMapping());
      });
    }),
    document.querySelectorAll('[data-act="deleteMapping"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = e.target.dataset.key;
        if (!confirm("Delete this mapping? It will need to be matched again next time this product appears.")) return;
        const n = loadLearned();
        (delete n[t],
          saveLearned(n),
          "function" == typeof saveAll && saveAll(),
          "function" == typeof pushMasterMappingToCloud && pushMasterMappingToCloud(n),
          renderMasterMapping());
      });
    }),
    document.querySelectorAll('[data-act="saveMappingEdit"]').forEach((e) => {
      e.addEventListener("click", (e) => {
        const t = e.target.dataset.key,
          n = e.target.closest("tr"),
          a = (e) => n.querySelector(`[data-mmfield="${e}"]`).value.trim(),
          o = loadLearned(),
          r = o[t];
        r &&
          ((r.name = a("vendorProduct")),
          (r.vendorName = a("vendor")),
          (r.code = a("itemCode")),
          (r.orderPackQty = Number(a("orderPack")) || 1),
          (r.vendorPackQty = Number(a("vendorPack")) || 1),
          (r.savedAt = new Date().toISOString()),
          saveLearned(o),
          "function" == typeof saveAll && saveAll(),
          "function" == typeof pushMasterMappingToCloud && pushMasterMappingToCloud(o),
          (editingMappingKey = null),
          renderMasterMapping());
      });
    }));
}
function updateNavAvailability() {
  $("navResults").classList.toggle("disabled", !hasMatched);
  const e = hasMatched && results.some((e) => e.include && e.selected);
  $("navSummary").classList.toggle("disabled", !e);
}
($("refreshMasterMappingBtn").addEventListener("click", () => {
  renderMasterMapping();
  const e = $("masterMappingStatus");
  ((e.textContent = "✓ Refreshed"),
    (e.className = "fb-status ok"),
    setTimeout(() => {
      ((e.textContent = ""), (e.className = "fb-status"));
    }, 1500));
}),
  $("exportMasterMappingBtn").addEventListener("click", () => {
    const e = buildMasterMapping(),
      t = $("masterMappingStatus");
    if (!e.length) return ((t.textContent = "⚠ No saved mappings yet."), void (t.className = "fb-status err"));
    const n = [
        ["Order Product", "Vendor Product", "Vendor", "Item Code", "Order Pack Qty", "Vendor Pack Qty", "Combo"],
        ...e.map((e) => [e.product, e.vendorProduct, e.vendor, e.itemCode, e.orderPack, e.vendorPack, e.combo]),
      ],
      a = XLSX.utils.aoa_to_sheet(n);
    a["!cols"] = [{ wch: 40 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
    const o = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(o, a, "Master Mapping");
    const r = new Date().toISOString().slice(0, 10);
    (XLSX.writeFile(o, `Master_Mapping_${r}.xlsx`),
      (t.textContent = `✓ Exported ${e.length} mappings.`),
      (t.className = "fb-status ok"));
  }),
  $("uploadMasterMappingBtn").addEventListener("click", () => $("masterMappingFileInput").click()),
  $("masterMappingFileInput").addEventListener("change", async (e) => {
    const t = e.target.files[0];
    if (!t) return;
    const n = $("masterMappingStatus");
    ((n.textContent = "Reading file…"), (n.className = "fb-status"));
    try {
      const e = findColumns(await readWorkbook(t), { product: /order\s*product/i, vendor: /^vendor$/i });
      if (!e)
        return (
          (n.textContent = '⚠ Could not find "Order Product" and "Vendor" columns in this file.'),
          void (n.className = "fb-status err")
        );
      const { colMap: a, data: o, headerRow: r } = e,
        s = o[r],
        l = s.findIndex((e) => e && /vendor\s*product/i.test(String(e))),
        i = s.findIndex((e) => e && /item\s*code/i.test(String(e))),
        d = s.findIndex((e) => e && /order\s*pack/i.test(String(e))),
        c = s.findIndex((e) => e && /vendor\s*pack/i.test(String(e))),
        p = s.findIndex((e) => e && /combo/i.test(String(e))),
        u = loadLearned();
      let m = 0;
      for (let e = r + 1; e < o.length; e++) {
        const t = o[e];
        if (!t) continue;
        const n = t[a.product],
          r = t[a.vendor];
        if (!n || !r) continue;
        const s = normalize(String(n)),
          f = -1 !== p ? t[p] : "";
        ((u[s] = {
          orderName: String(n).trim(),
          vendorName: String(r).trim(),
          code: -1 !== i && null != t[i] ? String(t[i]).trim() : "",
          name: -1 !== l && null != t[l] ? String(t[l]).trim() : String(n).trim(),
          orderPackQty: (-1 !== d && Number(t[d])) || 1,
          vendorPackQty: (-1 !== c && Number(t[c])) || 1,
          isComboPart: !(!f || !String(f).trim()),
          comboSource: f ? String(f).trim() : null,
          savedAt: new Date().toISOString(),
        }),
          m++);
      }
      (saveLearned(u),
        "function" == typeof saveAll && saveAll(),
        "function" == typeof pushMasterMappingToCloud && pushMasterMappingToCloud(u),
        renderMasterMapping(),
        (n.textContent = `✓ Imported ${m} mapping${1 === m ? "" : "s"}.`),
        (n.className = "fb-status ok"));
    } catch (e) {
      ((n.textContent = "⚠ Could not read that file: " + e.message), (n.className = "fb-status err"));
    }
    e.target.value = "";
  }));
const ORDER_MAPPER_SECTIONS = [
  "vendorsSection",
  "orderFileSection",
  "resultsCard",
  "vendorSummaryCard",
  "masterMappingCard",
];
function switchOrderMapperSection(e) {
  (ORDER_MAPPER_SECTIONS.forEach((t) => {
    const n = document.getElementById(t);
    n && (n.style.display = t === e ? "block" : "none");
  }),
    document.querySelectorAll(".subbtn[data-nav]").forEach((t) => {
      t.classList.toggle("active", t.dataset.nav === e);
    }),
    "vendorSummaryCard" === e && "function" == typeof renderVendorSummary && renderVendorSummary(),
    "masterMappingCard" === e && "function" == typeof renderMasterMapping && renderMasterMapping());
  document.getElementById("subtab-ordermapper");
}
(document.addEventListener("click", (e) => {
  const t = e.target.closest(".subbtn[data-nav]");
  t && !t.classList.contains("disabled") && (e.preventDefault(), switchOrderMapperSection(t.dataset.nav));
}),
  updateNavAvailability(),
  switchOrderMapperSection("vendorsSection"),
  (function () {
    const e = document.querySelector(".tabbtn.active");
    if (e && "courier" !== e.dataset.tab) {
      const t = document.getElementById("subtab-" + e.dataset.tab);
      t && (t.style.display = "flex");
    }
  })());
const CARRIER_MAP = {
    ats: { code: "Other", name: "ATS" },
    xpressbees: { code: "Xpressbees", name: "" },
    dtdc: { code: "DTDC", name: "" },
    delhivery: { code: "Delhivery", name: "" },
    delhivery_surface: { code: "Delhivery", name: "" },
    bluedart: { code: "BlueDart", name: "" },
    "ecom express": { code: "Ecom Express", name: "" },
    shadowfax: { code: "Shadowfax", name: "" },
    "india post": { code: "India Post", name: "" },
    ekart: { code: "Other", name: "Ekart" },
  },
  AMAZON_CODES = [
    "4px",
    "airtel",
    "alljoy",
    "aramex",
    "bluedart",
    "bombax",
    "cart2india",
    "china post",
    "delhivery",
    "desertcart",
    "dhl",
    "digital delivery",
    "dotzot",
    "dtdc",
    "ecom express",
    "fedex",
    "first flight",
    "gati",
    "icc worldwide",
    "india post",
    "pidge",
    "rivigo",
    "safexpress",
    "self delivery",
    "shadowfax",
    "ship delight",
    "shipeconomy",
    "shipglobal",
    "shree maruti courier",
    "shree tirupati courier",
    "spoton",
    "the professional couriers",
    "trackon",
    "ups",
    "usps",
    "vancotech",
    "whizzard",
    "xpressbees",
    "yanwen",
    "yun express",
    "sf express",
    "epost global",
    "apc postal logistics",
    "b2cship",
    "blowhorn",
    "gojavas",
    "lemonmode",
    "nowbikes",
    "smartrlogistics",
    "wefast",
    "zippee",
    "dpworld",
    "quickshift",
    "amazon shipping",
  ];
let outputRows = [];
function cleanId(e) {
  return e ? String(e).replace(/`/g, "").trim() : "";
}
function todayShipDate() {
  const e = new Date();
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}
function mapCarrier(e) {
  if (!e) return { code: "", name: "" };
  const t = String(e).replace(/`/g, "").trim().toLowerCase();
  if ("ats" === t) return { code: "Amazon Shipping", name: "Amazon Shipping" };
  if (AMAZON_CODES.includes(t)) {
    const t = String(e).replace(/`/g, "").trim();
    return { code: t, name: t };
  }
  if (CARRIER_MAP[t]) {
    const e = CARRIER_MAP[t],
      n = e.name || e.code;
    return { code: n, name: n };
  }
  const FS_COURIER_KEYWORDS = [
    ["delhivery", "Delhivery"],
    ["xpressbees", "Xpressbees"],
    ["xb ", "Xpressbees"],
    ["dtdc", "DTDC"],
    ["bluedart", "BlueDart"],
    ["blue dart", "BlueDart"],
    ["ecom express", "Ecom Express"],
    ["shadowfax", "Shadowfax"],
    ["ekart", "Ekart"],
    ["india post", "India Post"],
    ["dhl", "DHL"],
    ["fedex", "FedEx"],
    ["amazon", "Amazon Shipping"],
  ];
  for (const [kw, clean] of FS_COURIER_KEYWORDS) {
    if (t.includes(kw)) return { code: clean, name: clean };
  }
  const n = String(e).replace(/`/g, "").trim();
  return { code: n, name: n };
}
function azFindCol(e, t) {
  for (const n of t) {
    const t = e.findIndex((e) => String(e).trim().toLowerCase() === n.toLowerCase());
    if (-1 !== t) return t;
  }
  return -1;
}
let parsedRows = null,
  parsedCol = null;
function loadFile(e) {
  if (!e.length) return void showWarn("No data found in the file.");
  const t = e[0].map((e) => String(e || "").trim()),
    n = {
      channel: azFindCol(t, ["Channel Name"]),
      phone: azFindCol(t, ["Buyer Phone"]),
      orderId: azFindCol(t, ["Channel Order Id"]),
      subOrderId: azFindCol(t, ["Channel Sub Order Id"]),
      qty: azFindCol(t, ["Qty"]),
      tracker: azFindCol(t, ["Shipment Tracker"]),
      carrier: azFindCol(t, ["Shipping Company"]),
      shipDate: azFindCol(t, ["Shipment Date"]),
    },
    a = Object.entries(n)
      .filter(([e, t]) => -1 === t)
      .map(([e]) => e);
  a.length
    ? showWarn("Could not find expected columns in the file: " + a.join(", ") + ". Please check the export.")
    : ((parsedRows = e.slice(1).filter((e) => e && e.length)), (parsedCol = n), hideWarn());
}
function normalizeId(e) {
  return String(e || "")
    .replace(/`/g, "")
    .replace(/[\s"']/g, "")
    .trim();
}
let fallbackIndex = null;

function loadFallbackFile(e) {
  if (!e.length) return void showWarn2("No data found in this file.");
  const t = e[0].map((e) => String(e || "").trim()),
    n = azFindCol(t, [
      "Order Number",
      "Client Order ID",
      "Order Ref No",
      "Reference Number",
      "Reference No",
      "Client Reference Number",
      "Order Reference",
      "Order ID",
      "Order Id",
      "Order No",
    ]),
    a = azFindCol(t, [
      "AWB Number",
      "AWB No",
      "AWB",
      "Tracking Number",
      "Tracking No",
      "Waybill Number",
      "Waybill No",
      "Docket Number",
      "Docket No",
      "Consignment Number",
      "Consignment No",
    ]),
    o = azFindCol(t, [
      "Carrier Name",
      "Courier",
      "Courier Partner",
      "Carrier",
      "Courier Name",
      "Logistic Partner",
      "Shipping Partner",
    ]);
  if (-1 === n || -1 === a)
    return (
      showWarn2("Could not find an Order ID / AWB-Tracking column in this file. Headers found: " + t.join(", ")),
      void (fallbackIndex = null)
    );
  ((fallbackIndex = {}),
    e.slice(1).forEach((e) => {
      if (!e || !e.length) return;
      const t = normalizeId(e[n]),
        r = cleanId(e[a]);
      t && r && (fallbackIndex[t] = { tracker: r, carrier: -1 !== o ? e[o] : "" });
    }),
    hideWarn2());
}
function showWarn2(e) {
  let t = document.getElementById("warnBox2");
  (t ||
    ((t = document.createElement("div")),
    (t.id = "warnBox2"),
    (t.className = "warn"),
    document.getElementById("filename2").after(t)),
    (t.textContent = e),
    (t.style.display = "block"));
}
function hideWarn2() {
  const e = document.getElementById("warnBox2");
  e && (e.style.display = "none");
}
function processSelectedOrders() {
  "function" == typeof styleSelfShipNativeElements && styleSelfShipNativeElements();
  if (!parsedRows) return void showWarn("Please upload the OMS Guru file first (Step 1).");
  const e = document
    .getElementById("orderIdsInput")
    .value.split(/[\n,]+/)
    .map(normalizeId)
    .filter(Boolean);
  if (!e.length) return void showWarn("Paste at least one order-id in Step 2.");
  const t = {};
  (parsedRows.forEach((e) => {
    const n = normalizeId(e[parsedCol.orderId]);
    n && (t[n] || (t[n] = []), t[n].push(e));
  }),
    (outputRows = []));
  const n = [],
    a = [],
    o = [],
    f = [];
  (e.forEach((e) => {
    const r = t[e];
    if (!r || !r.length) {
      if ("undefined" != typeof fakeShipEntries && fakeShipEntries[e]) {
        const fe = fakeShipEntries[e],
          d = mapCarrier(fe.courier || "Amazon Shipping");
        return (
          outputRows.push({
            channel: fe.channel || "Unknown",
            row: [e, "", 1, todayShipDate(), d.code, d.name, fe.tracking, "Surface", ""],
          }),
          void f.push(e)
        );
      }
      return void n.push(e);
    }
    let s = "",
      l = "";
    for (const e of r) {
      const t = cleanId(e[parsedCol.tracker]);
      if (t) {
        ((s = t), (l = e[parsedCol.carrier]));
        break;
      }
    }
    let i = !1,
      k = !1;
    if ("undefined" != typeof fakeShipEntries && fakeShipEntries[e]) {
      ((s = fakeShipEntries[e].tracking), fakeShipEntries[e].courier && (l = fakeShipEntries[e].courier), (k = !0));
    } else if (!s && fallbackIndex && fallbackIndex[e]) {
      ((s = fallbackIndex[e].tracker), fallbackIndex[e].carrier && (l = fallbackIndex[e].carrier), (i = !0));
    }
    if (!s) return void a.push(e);
    (i && o.push(e), k && f.push(e));
    const d = mapCarrier(l),
      c = String(r[0][parsedCol.channel] || "Unknown").trim();
    r.forEach((t) => {
      outputRows.push({
        channel: c,
        row: [
          e,
          cleanId(t[parsedCol.subOrderId]),
          t[parsedCol.qty] || 1,
          todayShipDate(),
          d.code,
          d.name,
          s,
          "Surface",
          "",
        ],
      });
    });
  }),
    (document.getElementById("stats").style.display = "grid"),
    (document.getElementById("statTotal").textContent = e.length),
    (document.getElementById("statAmazon").textContent = e.length - n.length),
    (document.getElementById("statSelfShip").textContent = outputRows.length));
  const r = [];
  (o.length && r.push(o.length + " tracking from NimbusPost"),
    f.length && r.push(f.length + " picked up from Fake Ship (manual)"),
    n.length && r.push(n.length + " not found"),
    a.length && r.push(a.length + " no tracking number"));
  const s = [
    { title: o.length + " order(s) — tracking from NimbusPost", ids: o },
    { title: f.length + " order(s) — tracking picked up from Fake Ship (manual entry)", ids: f },
    { title: n.length + " order(s) — not found in file", ids: n },
    { title: a.length + " order(s) — no tracking number (checked OMS + NimbusPost + Fake Ship)", ids: a },
  ].filter((e) => e.ids.length);
  r.length ? showWarn(r.join(" &middot; "), s) : hideWarn();
  const l = document.getElementById("zeroMsg"),
    i = document.getElementById("channelList");
  (outputRows.length
    ? ((l.style.display = "none"), renderChannelList())
    : ((i.style.display = "none"), (l.style.display = "block")),
    "function" == typeof renderSelfShipStats && renderSelfShipStats(n.length + a.length),
    "function" == typeof renderNeedsTrackingPanel && renderNeedsTrackingPanel([...n, ...a]));
}
function groupByChannel() {
  const e = {};
  return (
    outputRows.forEach((t) => {
      (e[t.channel] || (e[t.channel] = []), e[t.channel].push(t.row));
    }),
    e
  );
}
function safeName(e) {
  return e.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}
function downloadChannelFile(e, t) {
  const n = new Date().toISOString().slice(0, 10),
    a = [
      [
        "order-id",
        "order-item-id",
        "quantity",
        "ship-date",
        "carrier-code",
        "carrier-name",
        "tracking-number",
        "ship-method",
        "transparency_code",
      ],
      ...t,
    ]
      .map((e) => e.map((e) => String(null == e ? "" : e)).join("\t"))
      .join("\r\n"),
    o = new Blob([a], { type: "text/tab-separated-values;charset=utf-8" }),
    r = URL.createObjectURL(o),
    s = document.createElement("a");
  ((s.href = r),
    (s.download = `Amazon_SelfShip_${safeName(e)}_${n}.txt`),
    document.body.appendChild(s),
    s.click(),
    document.body.removeChild(s),
    URL.revokeObjectURL(r));
}
function renderChannelList() {
  const e = groupByChannel(),
    t = document.getElementById("channelList");
  ((t.innerHTML = ""),
    Object.keys(e).forEach((n) => {
      const a = e[n],
        o = document.createElement("div");
      ((o.className = "chrow"),
        (o.innerHTML = `\n        <div>\n          <div class="chname">${n}</div>\n          <div class="chcount">${a.length} order${1 === a.length ? "" : "s"} ready</div>\n        </div>\n        <button>Download</button>\n      `),
        o.querySelector("button").addEventListener("click", () => downloadChannelFile(n, a)),
        t.appendChild(o));
    }),
    (t.style.display = "block"));
}
let lastFlagGroups = [];
function showWarn(e, t) {
  lastFlagGroups = t || [];
  const n = document.getElementById("warnBox");
  document.getElementById("warnSummary").innerHTML = e;
  ((document.getElementById("warnViewBtn").style.display = lastFlagGroups.length ? "inline-block" : "none"),
    (n.style.display = "flex"));
}
function hideWarn() {
  ((document.getElementById("warnBox").style.display = "none"), (lastFlagGroups = []));
}
function openFlagModal() {
  const e = document.getElementById("modalBody");
  ((e.innerHTML = ""),
    lastFlagGroups.forEach((t) => {
      const n = document.createElement("div");
      n.className = "mb-group";
      const canEnter = /not found|no tracking/i.test(t.title);
      ((n.innerHTML = `<div class="mb-title">${t.title}</div><div class="mb-ids">${canEnter ? t.ids.map((id) => `<span style="display:inline-flex;align-items:center;gap:6px;margin:2px 8px 2px 0;">${id}<button type="button" class="mini-link" data-fakeship-id="${id.replace(/"/g, "&quot;")}" style="color:#B8942B;font-weight:600;">+ enter tracking</button></span>`).join("") : t.ids.join(", ")}</div>`),
        e.appendChild(n));
    }),
    e.querySelectorAll("[data-fakeship-id]").forEach((btn) => {
      btn.addEventListener("click", () => promptFakeShipEntry(btn.dataset.fakeshipId));
    }),
    (document.getElementById("flagModal").style.display = "flex"));
}
function closeFlagModal() {
  document.getElementById("flagModal").style.display = "none";
}
function setFilenameDisplay(e, t, n) {
  if (((e.innerHTML = ""), !t)) return void e.classList.remove("has-file");
  const a = document.createElement("span");
  a.textContent = t;
  const o = document.createElement("button");
  ((o.type = "button"),
    (o.className = "fn-remove"),
    (o.title = "Remove file"),
    (o.textContent = "×"),
    o.addEventListener("click", n),
    e.appendChild(a),
    e.appendChild(o),
    e.classList.add("has-file"));
}
function removeMainFile() {
  ((parsedRows = null),
    (parsedCol = null),
    (document.getElementById("azFileInput").value = ""),
    setFilenameDisplay(document.getElementById("filename"), "", null),
    hideWarn());
}
function removeFallbackFile() {
  ((fallbackIndex = null),
    (document.getElementById("azFileInput2").value = ""),
    setFilenameDisplay(document.getElementById("filename2"), "", null),
    hideWarn2());
}
function handleFile(e) {
  setFilenameDisplay(document.getElementById("filename"), e.name, removeMainFile);
  const t = new FileReader();
  ((t.onload = (e) => {
    try {
      const t = new Uint8Array(e.target.result),
        n = XLSX.read(t, { type: "array", cellDates: !1 }),
        a = n.Sheets[n.SheetNames[0]];
      loadFile(XLSX.utils.sheet_to_json(a, { header: 1, raw: !1, defval: "" }));
    } catch (e) {
      showWarn("Could not read this file. Please make sure it is the OMS Guru export (.csv or .xlsx).");
    }
  }),
    t.readAsArrayBuffer(e));
}
function handleFallbackFile(e) {
  setFilenameDisplay(document.getElementById("filename2"), e.name, removeFallbackFile);
  const t = new FileReader();
  ((t.onload = (e) => {
    try {
      const t = new Uint8Array(e.target.result),
        n = XLSX.read(t, { type: "array", cellDates: !1 }),
        a = n.Sheets[n.SheetNames[0]];
      loadFallbackFile(XLSX.utils.sheet_to_json(a, { header: 1, raw: !1, defval: "" }));
    } catch (e) {
      showWarn2("Could not read this file. Please make sure it is the NimbusPost export (.csv or .xlsx).");
    }
  }),
    t.readAsArrayBuffer(e));
}
(document.getElementById("warnViewBtn").addEventListener("click", openFlagModal),
  document.getElementById("modalCloseBtn").addEventListener("click", closeFlagModal),
  document.getElementById("flagModal").addEventListener("click", (e) => {
    "flagModal" === e.target.id && closeFlagModal();
  }),
  document.getElementById("azFileInput").addEventListener("change", (e) => {
    e.target.files[0] && handleFile(e.target.files[0]);
  }),
  document.getElementById("azFileInput2").addEventListener("change", (e) => {
    e.target.files[0] && handleFallbackFile(e.target.files[0]);
  }));
const drop2 = document.getElementById("drop2");
(drop2.addEventListener("click", () => document.getElementById("azFileInput2").click()),
  drop2.addEventListener("dragover", (e) => {
    (e.preventDefault(), drop2.classList.add("drag"));
  }),
  drop2.addEventListener("dragleave", () => drop2.classList.remove("drag")),
  drop2.addEventListener("drop", (e) => {
    (e.preventDefault(),
      drop2.classList.remove("drag"),
      e.dataTransfer.files[0] && handleFallbackFile(e.dataTransfer.files[0]));
  }));
const drop = document.getElementById("drop");
(drop.addEventListener("click", () => document.getElementById("azFileInput").click()),
  drop.addEventListener("dragover", (e) => {
    (e.preventDefault(), drop.classList.add("drag"));
  }),
  drop.addEventListener("dragleave", () => drop.classList.remove("drag")),
  drop.addEventListener("drop", (e) => {
    (e.preventDefault(), drop.classList.remove("drag"), e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));
  }),
  document.getElementById("processBtn").addEventListener("click", processSelectedOrders),
  (function () {
    const e = document.getElementById("appMenuBtn"),
      t = document.querySelector(".app-sidebar"),
      n = document.getElementById("appSidebarBackdrop");
    if (!e || !t || !n) return;
    const a = () => {
      (t.classList.remove("open"), n.classList.remove("show"));
    };
    (e.addEventListener("click", () =>
      t.classList.contains("open") ? a() : (t.classList.add("open"), void n.classList.add("show")),
    ),
      n.addEventListener("click", a),
      document.querySelectorAll(".app-sidebar .tabbtn").forEach((e) => {
        e.addEventListener("click", a);
      }));
  })(),
  document.querySelectorAll(".tabbtn").forEach(function (e) {
    e.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }),
  (function () {
    const e = document.getElementById("appThemeToggle");
    if (!e) return;
    ("light" ===
      (function () {
        try {
          return localStorage.getItem("dalbhaat_theme");
        } catch (e) {
          return null;
        }
      })() && document.body.setAttribute("data-theme", "light"),
      e.addEventListener("click", function () {
        const t = "light" === document.body.getAttribute("data-theme"),
          n = t ? "dark" : "light",
          a = t ? "#0A0D18" : "#F5F4FF",
          o = e.getBoundingClientRect(),
          r = o.left + o.width / 2,
          s = o.top + o.height / 2,
          l = 2 * Math.hypot(Math.max(r, innerWidth - r), Math.max(s, innerHeight - s)),
          i = document.createElement("div");
        ((i.className = "theme-reveal"),
          (i.style.left = r + "px"),
          (i.style.top = s + "px"),
          (i.style.width = l + "px"),
          (i.style.height = l + "px"),
          (i.style.background = a),
          document.body.appendChild(i),
          requestAnimationFrame(function () {
            i.classList.add("animate");
          }),
          setTimeout(function () {
            document.body.setAttribute("data-theme", n);
            try {
              localStorage.setItem("dalbhaat_theme", n);
            } catch (e) {}
          }, 90),
          setTimeout(function () {
            i.remove();
          }, 650));
      }));
  })());
const DOC_MAX_BYTES = 716800;
let sharedDocsRaw = [],
  fbDocsUnsub = null;
function startSharedDocsSync() {
  fbDb &&
    (fbDocsUnsub && (fbDocsUnsub(), (fbDocsUnsub = null)),
    (fbDocsUnsub = fbDb
      .collection("sharedDocuments")
      .orderBy("uploadedAt", "desc")
      .onSnapshot(
        (e) => {
          sharedDocsRaw = e.docs.map((e) => ({ id: e.id, ...e.data() }));
          const t = document.getElementById("docsLastSynced");
          (t &&
            (t.textContent = sharedDocsRaw.length
              ? `${sharedDocsRaw.length} document${1 === sharedDocsRaw.length ? "" : "s"}`
              : "No documents yet"),
            "function" == typeof renderSharedDocs && renderSharedDocs());
        },
        (e) => console.warn("Shared documents sync error", e),
      )));
}
function renderSharedDocs() {
  const e = document.getElementById("docsList"),
    t = document.getElementById("docsEmpty"),
    n = document.getElementById("docsCount");
  if (e) {
    if ((n && (n.textContent = sharedDocsRaw.length ? `(${sharedDocsRaw.length})` : ""), !sharedDocsRaw.length))
      return ((e.innerHTML = ""), void (t && (t.style.display = "block")));
    (t && (t.style.display = "none"),
      (e.innerHTML = sharedDocsRaw
        .map(
          (e) =>
            `\n      <div class="sd-row">\n        <div class="sd-icon">📄</div>\n        <div class="sd-info">\n          <div class="sd-title">${escapeHtml(e.filename || "Untitled")}</div>\n          <div class="sd-meta">${e.sizeKB ? e.sizeKB + " KB · " : ""}uploaded ${e.uploadedAt ? new Date(e.uploadedAt).toLocaleString() : ""}</div>\n        </div>\n        <div class="sd-actions">\n          <button onclick="downloadSharedDoc('${e.id}')">⬇ Download</button>\n          <button class="sd-danger" onclick="deleteSharedDoc('${e.id}','${escapeHtml(e.filename || "this file").replace(/'/g, "\\'")}')">🗑 Delete</button>\n        </div>\n      </div>\n    `,
        )
        .join("")));
  }
}
function uploadSharedDocument(e) {
  const t = document.getElementById("docUploadStatus");
  if (!fbDb) return void (t && (t.textContent = "⚠ Connect Firebase sync first (Backend/Data tab)."));
  if (e.size > 716800)
    return void (
      t && (t.textContent = `⚠ File too large (${Math.round(e.size / 1024)}KB). Max ~${Math.round(700)}KB per file.`)
    );
  t && (t.textContent = `Uploading ${e.name}…`);
  const n = new FileReader();
  ((n.onload = (n) => {
    const a = n.target.result.split(",")[1],
      o = Math.round(e.size / 1024);
    fbDb
      .collection("sharedDocuments")
      .add({
        filename: e.name,
        mimeType: e.type || "application/octet-stream",
        base64: a,
        sizeKB: o,
        uploadedAt: new Date().toISOString(),
      })
      .then(() => {
        t && (t.textContent = `✓ ${e.name} uploaded.`);
      })
      .catch((e) => {
        t && (t.textContent = `⚠ Upload failed: ${e.message}`);
      });
  }),
    n.readAsDataURL(e));
}
function downloadSharedDoc(e) {
  const t = sharedDocsRaw.find((t) => t.id === e);
  if (!t) return;
  const n = atob(t.base64),
    a = new Uint8Array(n.length);
  for (let e = 0; e < n.length; e++) a[e] = n.charCodeAt(e);
  const o = new Blob([a], { type: t.mimeType || "application/octet-stream" }),
    r = URL.createObjectURL(o),
    s = document.createElement("a");
  ((s.href = r),
    (s.download = t.filename || "document"),
    document.body.appendChild(s),
    s.click(),
    document.body.removeChild(s),
    URL.revokeObjectURL(r));
}
function deleteSharedDoc(e, t) {
  confirm(`Delete "${t}"? This removes it for every employee and cannot be undone.`) &&
    fbDb &&
    fbDb
      .collection("sharedDocuments")
      .doc(e)
      .delete()
      .catch((e) => {
        alert("Could not delete: " + e.message);
      });
}
document.getElementById("docUploadInput")?.addEventListener("change", (e) => {
  (e.target.files[0] && uploadSharedDocument(e.target.files[0]), (e.target.value = ""));
});
let globalMoreMenuEl = null;
function getGlobalMoreMenu() {
  return (
    globalMoreMenuEl ||
    ((globalMoreMenuEl = document.createElement("div")),
    (globalMoreMenuEl.className = "more-menu global-more-menu"),
    (globalMoreMenuEl.id = "globalMoreMenu"),
    document.body.appendChild(globalMoreMenuEl),
    globalMoreMenuEl.addEventListener("mousedown", (e) => {
      const t = e.target.closest("button[data-gm-act]");
      if (!t) return;
      const n = +globalMoreMenuEl.dataset.idx,
        a = t.dataset.gmAct;
      (hideGlobalMoreMenu(),
        "splitCombo" === a
          ? splitRow(n)
          : "removePart" === a
            ? removeRow(n)
            : "addNewProduct" === a &&
              ((results[n].addingNewProduct = !0), (results[n].expanded = !0), renderResults()));
    }),
    globalMoreMenuEl)
  );
}
function positionGlobalMoreMenu(e) {
  const t = getGlobalMoreMenu(),
    n = e.getBoundingClientRect(),
    a = window.innerHeight - n.bottom < 140 && n.top > 140;
  ((t.style.left = n.left + "px"),
    a
      ? ((t.style.top = "auto"), (t.style.bottom = window.innerHeight - n.top + 4 + "px"))
      : ((t.style.bottom = "auto"), (t.style.top = n.bottom + 4 + "px")),
    t.style.setProperty("position", "fixed", "important"),
    t.style.setProperty("z-index", "2147483646", "important"),
    t.style.setProperty("pointer-events", "auto", "important"),
    "function" == typeof hideGlobalSuggestList && hideGlobalSuggestList());
}
function showGlobalMoreMenu(e, t) {
  const n = results[e];
  if (!n) return;
  const a = n.selected && n.selected.plain,
    o = getGlobalMoreMenu();
  ((o.dataset.idx = e),
    (o.innerHTML = `\n      ${n.isSplitPart ? "" : '<button type="button" data-gm-act="splitCombo">🔀 This is a combo of different products</button>'}\n      ${n.isSplitPart ? '<button type="button" data-gm-act="removePart">✕ Remove this part</button>' : ""}\n      ${!a && void 0 !== lotsVendor && lotsVendor.prepped ? '<button type="button" data-gm-act="addNewProduct">+ Not in LOTS — add as new product</button>' : ""}\n    `),
    positionGlobalMoreMenu(t),
    o.classList.add("open"));
}
function hideGlobalMoreMenu() {
  globalMoreMenuEl && globalMoreMenuEl.classList.remove("open");
}
(document.addEventListener(
  "scroll",
  () => {
    hideGlobalMoreMenu();
  },
  !0,
),
  window.addEventListener("resize", hideGlobalMoreMenu),
  document.addEventListener("click", (e) => {
    globalMoreMenuEl &&
      globalMoreMenuEl.classList.contains("open") &&
      !e.target.closest(".global-more-menu") &&
      !e.target.closest('[data-act="toggleMoreGlobal"]') &&
      hideGlobalMoreMenu();
  }));
let appSearchMarks = [];
function clearAppSearchHighlights() {
  (appSearchMarks.forEach((e) => {
    const t = e.parentNode;
    t && (t.replaceChild(document.createTextNode(e.textContent), e), t.normalize());
  }),
    (appSearchMarks = []));
}
function runAppHeaderSearch(e) {
  if ((clearAppSearchHighlights(), !(e = (e || "").trim()))) return;
  const t = document.querySelector(".tabpanel.active");
  if (!t) return;
  const n = e.toLowerCase(),
    a = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, {
      acceptNode(e) {
        if (!e.nodeValue || !e.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const t = e.parentNode && e.parentNode.tagName;
        return "SCRIPT" === t || "STYLE" === t || "INPUT" === t || "TEXTAREA" === t || "MARK" === t
          ? NodeFilter.FILTER_REJECT
          : e.nodeValue.toLowerCase().includes(n)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
      },
    }),
    o = [];
  let r;
  for (; (r = a.nextNode());) o.push(r);
  (o.forEach((t) => {
    const a = t.nodeValue,
      o = a.toLowerCase(),
      r = document.createDocumentFragment();
    let s,
      l = 0;
    for (; -1 !== (s = o.indexOf(n, l));) {
      s > l && r.appendChild(document.createTextNode(a.slice(l, s)));
      const t = document.createElement("mark");
      ((t.className = "app-search-hit"),
        (t.textContent = a.slice(s, s + e.length)),
        r.appendChild(t),
        appSearchMarks.push(t),
        (l = s + e.length));
    }
    (r.appendChild(document.createTextNode(a.slice(l))), t.parentNode && t.parentNode.replaceChild(r, t));
  }),
    appSearchMarks.length && appSearchMarks[0].scrollIntoView({ behavior: "smooth", block: "center" }));
}
let appSearchDebounce = null;
function fmtAgo(mins) {
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h + "h " + m + "m ago";
}
function setHsbPill(el, label, dateObj, freshMinutes) {
  if (!el) return;
  if (!dateObj) {
    el.textContent = label + ": Not synced yet";
    el.classList.add("err");
    el.classList.remove("ok");
    return;
  }
  const mins = Math.round((Date.now() - dateObj.getTime()) / 6e4);
  el.textContent = label + ": " + fmtAgo(mins);
  if (mins <= freshMinutes) {
    el.classList.add("ok");
    el.classList.remove("err");
  } else {
    el.classList.add("err");
    el.classList.remove("ok");
  }
}
function updateHeaderSyncBar() {
  setHsbPill(document.getElementById("hsbOms"), "OMS", window.__omsLastSyncedDate || null, 20);
  const o = document.getElementById("hsbLots");
  if (o) {
    const s = "function" == typeof loadLotsStore ? loadLotsStore() : null;
    setHsbPill(o, "LOTS", s && s.savedAt ? new Date(s.savedAt) : null, 1800);
  }
}
async function runHeaderSync(key, btn) {
  /* OMS sync runs on GitHub — this opens its page (SP-API syncs now live on dalbhaat.in/pages/amazon) */
  window.open("https://github.com/pransu49/oms-sync/actions", "_blank", "noopener");
}
(document.getElementById("appHeaderSearch")?.addEventListener("input", (e) => {
  clearTimeout(appSearchDebounce);
  const t = e.target.value;
  appSearchDebounce = setTimeout(() => runAppHeaderSearch(t), 250);
}),
  document.querySelectorAll(".tabbtn").forEach((e) => {
    e.addEventListener("click", () => {
      const e = document.getElementById("appHeaderSearch");
      (e && (e.value = ""), clearAppSearchHighlights());
    });
  }),
  (function () {
    const e = document.querySelector(".app-header"),
      t = document.querySelector(".app-search");
    if (!e || !t || document.getElementById("headerSyncBar")) return;
    const n = document.createElement("div");
    ((n.className = "header-sync-bar no-print"),
      (n.id = "headerSyncBar"),
      (n.innerHTML =
        '<span class="hsb-pill" id="hsbOms">OMS: —</span><span class="hsb-pill" id="hsbLots">LOTS: —</span>'),
      t.after(n),
      n
        .querySelectorAll("[data-run]")
        .forEach((b) => b.addEventListener("click", () => runHeaderSync(b.dataset.run, b))));
  })(),
  setInterval(updateHeaderSyncBar, 5e3),
  setTimeout(updateHeaderSyncBar, 1e3),
  (function () {
    const e = document.querySelector(".app-shell");
    if (!e || document.getElementById("sidebarCollapseToggle")) return;
    const t = document.createElement("button");
    ((t.id = "sidebarCollapseToggle"),
      (t.className = "sidebar-collapse-toggle no-print"),
      (t.type = "button"),
      (t.title = "Show/hide menu"),
      (t.innerHTML = '<i class="ti ti-layout-sidebar"></i>'),
      document.body.appendChild(t));
    let n = !1;
    try {
      n = "1" === localStorage.getItem("dalbhaat_sidebar_collapsed");
    } catch (e) {}
    (n && e.classList.add("sidebar-collapsed"),
      t.addEventListener("click", () => {
        e.classList.toggle("sidebar-collapsed");
        try {
          localStorage.setItem("dalbhaat_sidebar_collapsed", e.classList.contains("sidebar-collapsed") ? "1" : "0");
        } catch (e) {}
      }));
  })());
let columnFilterState = {};
function getColumnFilterSet(e, t) {
  return (columnFilterState[e] && columnFilterState[e][t]) || null;
}
function setColumnFilterSet(e, t, n) {
  (columnFilterState[e] || (columnFilterState[e] = {}),
    n && 0 !== n.size ? (columnFilterState[e][t] = n) : delete columnFilterState[e][t]);
}
function passesColumnFilters(e, t) {
  const n = columnFilterState[e];
  return (
    !n ||
    Object.keys(n).every((e) => {
      const a = n[e];
      if (!a || !a.size) return !0;
      const o = t[e],
        r = null == o || "" === o ? "(blank)" : String(o);
      return a.has(r);
    })
  );
}
function sortTableByColumn(e, t, n) {
  const a = e.querySelector("tbody");
  if (!a) return;
  const o = Array.from(a.querySelectorAll("tr")),
    r = (e) => {
      const n = e.children[t];
      return n ? n.textContent.trim() : "";
    };
  (o.sort((e, t) => {
    const a = r(e),
      o = r(t),
      s = parseFloat(a.replace(/[₹,%\s]/g, "")),
      l = parseFloat(o.replace(/[₹,%\s]/g, "")),
      i = /^[\-₹\d.,%\s]+$/;
    let d;
    return (
      (d =
        !isNaN(s) && !isNaN(l) && i.test(a) && i.test(o)
          ? s - l
          : a.localeCompare(o, void 0, { numeric: !0, sensitivity: "base" })),
      "asc" === n ? d : -d
    );
  }),
    o.forEach((e) => a.appendChild(e)));
}
function setupColumnFilterIcons(e, t) {
  const n = document.getElementById(e);
  if (!n) return;
  n.classList.add("has-col-filters");
  const a = n.querySelector("thead tr"),
    o = a ? Array.from(a.children) : [];
  (o.forEach((a, r) => {
    !a.dataset.sortWired &&
      a.textContent.trim() &&
      ((a.dataset.sortWired = "1"),
      (a.style.cursor = "pointer"),
      a.addEventListener("click", (e) => {
        if (e.target.closest(".col-filter-btn")) return;
        const t = "asc" === (a.dataset.sortDir || "") ? "desc" : "asc";
        (o.forEach((e) => {
          delete e.dataset.sortDir;
          const t = e.querySelector(".sort-indicator");
          t && t.remove();
        }),
          (a.dataset.sortDir = t));
        const s = document.createElement("span");
        ((s.className = "sort-indicator"),
          (s.style.marginLeft = "4px"),
          (s.textContent = "asc" === t ? "▲" : "▼"),
          a.appendChild(s),
          sortTableByColumn(n, r, t));
      }));
    const s = a.dataset.filterCol;
    if (s) {
      let n = a.querySelector(".col-filter-btn");
      if (!n) {
        ((n = document.createElement("button")),
          (n.type = "button"),
          (n.className = "col-filter-btn"),
          (n.title = "Filter"),
          (n.innerHTML = '<i class="ti ti-chevron-down"></i>'),
          n.addEventListener("click", (a) => {
            (a.stopPropagation(), showColumnFilterPicker(e, s, n.__filterData, n));
          }),
          a.appendChild(n),
          (a.style.position = "relative"));
      }
      n.__filterData = t;
    }
  }),
    o.forEach((t) => {
      const n = t.dataset.filterCol,
        a = t.querySelector(".col-filter-btn");
      a && n && a.classList.toggle("active", !!getColumnFilterSet(e, n));
    }));
}
let columnFilterPopupEl = null;
function getColumnFilterPopup() {
  return (
    columnFilterPopupEl ||
    ((columnFilterPopupEl = document.createElement("div")),
    (columnFilterPopupEl.className = "col-filter-popup"),
    (columnFilterPopupEl.id = "columnFilterPopup"),
    document.body.appendChild(columnFilterPopupEl),
    document.addEventListener("mousedown", (e) => {
      !columnFilterPopupEl.classList.contains("open") ||
        e.target.closest(".col-filter-popup") ||
        e.target.closest(".col-filter-btn") ||
        hideColumnFilterPopup();
    }),
    document.addEventListener(
      "scroll",
      (e) => {
        (e.target && e.target.closest && e.target.closest(".col-filter-popup")) || hideColumnFilterPopup();
      },
      !0,
    ),
    window.addEventListener("resize", hideColumnFilterPopup),
    document.addEventListener("keydown", (e) => {
      "Escape" === e.key && columnFilterPopupEl.classList.contains("open") && hideColumnFilterPopup();
    }),
    columnFilterPopupEl)
  );
}
function hideColumnFilterPopup() {
  columnFilterPopupEl && (columnFilterPopupEl.classList.remove("open"), (columnFilterPopupEl.style.display = "none"));
}
function positionColumnFilterPopup(e) {
  const t = getColumnFilterPopup(),
    n = e.getBoundingClientRect(),
    a = window.innerHeight - n.bottom < 320 && n.top > 320;
  ((t.style.left = Math.min(n.left, window.innerWidth - 260) + "px"),
    a
      ? ((t.style.top = "auto"), (t.style.bottom = window.innerHeight - n.top + 4 + "px"))
      : ((t.style.bottom = "auto"), (t.style.top = n.bottom + 4 + "px")),
    t.style.setProperty("position", "fixed", "important"),
    t.style.setProperty("z-index", "2147483647", "important"),
    t.style.setProperty("pointer-events", "auto", "important"),
    "function" == typeof hideGlobalMoreMenu && hideGlobalMoreMenu(),
    "function" == typeof hideGlobalSuggestList && hideGlobalSuggestList());
}
function showColumnFilterPicker(e, t, n, a) {
  const o = getColumnFilterPopup(),
    r = [
      ...new Set(
        n.map((e) => {
          const n = e[t];
          return null == n || "" === n ? "(blank)" : String(n);
        }),
      ),
    ].sort((e, t) => e.localeCompare(t, void 0, { numeric: !0 })),
    s = getColumnFilterSet(e, t),
    l = new Set(s ? [...s] : r);
  function i(e) {
    const t = (e || "").toLowerCase();
    return (
      (t ? r.filter((e) => e.toLowerCase().includes(t)) : r)
        .map(
          (e) =>
            `\n        <label class="col-filter-item">\n          <input type="checkbox" value="${escapeHtml(e)}" ${l.has(e) ? "checked" : ""}>\n          <span>${escapeHtml(e)}</span>\n        </label>\n      `,
        )
        .join("") || '<div class="col-filter-empty">No values</div>'
    );
  }
  ((o.innerHTML = `\n      <div class="col-filter-search" style="flex:0 0 auto;"><input type="text" placeholder="Search values…" class="col-filter-search-input"></div>\n      <div class="col-filter-actions-top" style="flex:0 0 auto;">\n        <button type="button" class="col-filter-mini" data-act="all">Select All</button>\n        <button type="button" class="col-filter-mini" data-act="clear">Clear</button>\n      </div>\n      <div class="col-filter-list" style="flex:1 1 auto; min-height:0; overflow-y:auto; max-height:180px;">${i("")}</div>\n      <div class="col-filter-actions-bottom" style="flex:0 0 auto;">\n        <button type="button" class="col-filter-cancel">Cancel</button>\n        <button type="button" class="col-filter-apply">Apply</button>\n      </div>\n    `),
    o.style.setProperty("display", "flex", "important"),
    o.style.setProperty("flex-direction", "column", "important"),
    o.style.setProperty("max-height", "340px", "important"),
    o.style.setProperty("overflow", "hidden", "important"));
  const d = o.querySelector(".col-filter-list");
  d.addEventListener("change", (e) => {
    "checkbox" === e.target.type && (e.target.checked ? l.add(e.target.value) : l.delete(e.target.value));
  });
  const c = o.querySelector(".col-filter-search-input");
  function p() {
    const n = l.size === r.length ? null : new Set(l);
    (setColumnFilterSet(e, t, n), hideColumnFilterPopup());
    const a = {
      omsOrdersTable: "function" == typeof renderOmsOrdersTable ? renderOmsOrdersTable : null,
      zippyShipmentsTable: "function" == typeof renderZippyShipmentsTable ? renderZippyShipmentsTable : null,
      lossOrdersTable: "function" == typeof renderLossOrdersTab ? renderLossOrdersTab : null,
      productSummaryTable: "function" == typeof renderSummary ? renderSummary : null,
      scanLogTable: "function" == typeof rebuildHistoryTable ? rebuildHistoryTable : null,
      resultsTable: "function" == typeof renderResults ? renderResults : null,
      spapiOrdersTable: "function" == typeof renderSpapiOrdersTable ? renderSpapiOrdersTable : null,
      spapiInventoryTable: "function" == typeof renderSpapiInventoryTable ? renderSpapiInventoryTable : null,
      spapiPricingTable: "function" == typeof renderSpapiPricingTable ? renderSpapiPricingTable : null,
    }[e];
    a && a();
  }
  (c.addEventListener("input", (e) => {
    d.innerHTML = i(e.target.value);
  }),
    c.addEventListener("paste", (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData("text");
      if (!pasted || !pasted.trim()) return;
      e.preventDefault();
      const terms = pasted
        .split(/[\r\n,\t]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      if (!terms.length) return;
      let matched = 0;
      r.forEach((val) => {
        const vl = val.toLowerCase();
        if (terms.some((term) => vl === term || vl.includes(term))) {
          l.add(val);
          matched++;
        }
      });
      d.innerHTML = i(c.value);
      c.value = matched ? matched + " value(s) matched and selected from paste" : "No matches found for pasted values";
    }),
    o.querySelector('[data-act="all"]').addEventListener("click", () => {
      (r.forEach((e) => l.add(e)), (d.innerHTML = i(c.value)));
    }),
    o.querySelector('[data-act="clear"]').addEventListener("click", () => {
      (l.clear(), (d.innerHTML = i(c.value)));
    }),
    o.querySelector(".col-filter-cancel").addEventListener("click", hideColumnFilterPopup),
    o.querySelector(".col-filter-apply").addEventListener("click", p),
    o.addEventListener("keydown", (e) => {
      "Enter" === e.key &&
        document.activeElement &&
        "checkbox" !== document.activeElement.type &&
        (e.preventDefault(), p());
    }),
    setTimeout(() => {
      c.focus();
    }, 30),
    positionColumnFilterPopup(a),
    o.classList.add("open"),
    (o.style.display = "block"));
}

/* ================= Sidebar: remove auto-hide/collapse behavior permanently ================= */
(function () {
  function killSidebarCollapse() {
    const shell = document.querySelector(".app-shell");
    if (shell) shell.classList.remove("sidebar-collapsed");
    try {
      localStorage.removeItem("dalbhaat_sidebar_collapsed");
    } catch (e) {}
    const toggleBtn = document.getElementById("sidebarCollapseToggle");
    if (toggleBtn) toggleBtn.remove();
    const style = document.createElement("style");
    style.textContent = `
      .app-sidebar{ width:230px !important; }
      .app-sidebar .topbar .logo-wrap span,
      .app-sidebar .topbar > span,
      .app-sidebar .backend-access a,
      .app-sidebar .backend-access button{ opacity:1 !important; }
    `;
    document.head.appendChild(style);
  }
  killSidebarCollapse();
  document.addEventListener("DOMContentLoaded", killSidebarCollapse);
})();

/* ================= Self-Ship: theme-aware colors — JS-driven so it always matches the toggle instantly ================= */
const FS_THEME_VARS = {
  dark: {
    "--fs-card": "#152845",
    "--fs-card-alt": "#111D33",
    "--fs-page": "#0B1526",
    "--fs-shadow": "0 1px 2px rgba(0,0,0,.25),0 8px 20px rgba(0,0,0,.3)",
    "--fs-text": "#F5F4EC",
    "--fs-text2": "#A9B0C0",
    "--fs-text3": "#7C8397",
    "--fs-line": "rgba(255,255,255,.08)",
    "--fs-line-strong": "rgba(255,255,255,.16)",
    "--fs-badge-bg": "rgba(212,175,55,.18)",
    "--fs-badge-text": "#F0DA8C",
    "--fs-success-bg": "rgba(58,166,110,.15)",
    "--fs-success-text": "#3AA66E",
    "--fs-danger-bg": "rgba(224,90,90,.15)",
    "--fs-danger-text": "#E05A5A",
    "--fs-pill-bg": "#152845",
    "--fs-pill-text": "#F5F4EC",
  },
  light: {
    "--fs-card": "#FFFFFF",
    "--fs-card-alt": "#FAF9F5",
    "--fs-page": "#F6F4EE",
    "--fs-shadow": "0 1px 2px rgba(15,30,53,.04),0 8px 20px rgba(15,30,53,.05)",
    "--fs-text": "#0F1E35",
    "--fs-text2": "#6B7280",
    "--fs-text3": "#9A9890",
    "--fs-line": "#F1EFE8",
    "--fs-line-strong": "rgba(15,30,53,.14)",
    "--fs-badge-bg": "#F5E9C4",
    "--fs-badge-text": "#8C6D0F",
    "--fs-success-bg": "#E8F4EC",
    "--fs-success-text": "#2F8A4C",
    "--fs-danger-bg": "#FBEAEA",
    "--fs-danger-text": "#C0392B",
    "--fs-pill-bg": "#FFFFFF",
    "--fs-pill-text": "#0F1E35",
  },
};
function fsIsLight() {
  return "light" === document.body.getAttribute("data-theme");
}
function ensureFsPlaceholderStyle() {
  if (document.getElementById("fsPlaceholderStyle")) return;
  const style = document.createElement("style");
  style.id = "fsPlaceholderStyle";
  style.textContent = "#orderIdsInput::placeholder{color:var(--fs-text3);opacity:1}";
  document.head.appendChild(style);
}
function ensureFsClearButton() {
  const btn = document.getElementById("processBtn");
  if (!btn || document.getElementById("fsClearBtn")) return;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.id = "fsClearBtn";
  clearBtn.textContent = "Clear";
  clearBtn.style.cssText =
    "all:unset;cursor:pointer;display:block;width:100%;text-align:center;margin-top:8px;font-size:12px;font-weight:600;color:var(--fs-text2);border:1px solid var(--fs-line-strong);border-radius:10px;padding:9px;box-sizing:border-box;";
  btn.parentNode.insertBefore(clearBtn, btn.nextSibling);
  clearBtn.addEventListener("click", () => {
    const ta = document.getElementById("orderIdsInput");
    ta && (ta.value = "");
    outputRows = [];
    const statsEl = document.getElementById("stats");
    statsEl && (statsEl.style.display = "none");
    "function" == typeof hideWarn && hideWarn();
    const cl = document.getElementById("channelList");
    cl && ((cl.innerHTML = ""), (cl.style.display = "none"));
    const zm = document.getElementById("zeroMsg");
    zm && (zm.style.display = "none");
    "function" == typeof renderNeedsTrackingPanel && renderNeedsTrackingPanel([]);
    "function" == typeof renderSelfShipStats && renderSelfShipStats(0);
  });
}
function styleSelfShipNativeElements() {
  ensureFsClearButton();
  const tab = document.getElementById("tab-selfship");
  if (!tab) return;
  const vars = FS_THEME_VARS[fsIsLight() ? "light" : "dark"];
  const wrap = tab.querySelector(".wrap");
  if (wrap) {
    wrap.style.background = vars["--fs-page"];
    wrap.style.color = vars["--fs-text"];
    wrap.style.borderRadius = "20px";
    wrap.style.transition = "background .15s ease,color .15s ease";
  }
  tab.querySelectorAll(".card").forEach((card) => {
    if (card.dataset.fsCollapsed) return;
    card.style.background = vars["--fs-card"];
    card.style.color = vars["--fs-text"];
    card.style.boxShadow = vars["--fs-shadow"];
    card.style.border = "none";
  });
  tab.querySelectorAll(".rule-box").forEach((r) => {
    r.style.display = "none";
  });
  const ta = document.getElementById("orderIdsInput");
  if (ta) {
    ta.style.background = vars["--fs-card-alt"];
    ta.style.color = vars["--fs-text"];
    ta.style.border = "1px solid " + vars["--fs-line-strong"];
  }
  ensureFsPlaceholderStyle();
  const btn = document.getElementById("processBtn");
  if (btn) {
    btn.style.background = "#0F1E35";
    btn.style.color = "#F5F4EC";
    btn.style.border = "none";
  }
  tab.querySelectorAll(".stats .stat").forEach((s) => {
    s.style.background = vars["--fs-card-alt"];
    s.style.border = "1px solid " + vars["--fs-line"];
    s.style.color = vars["--fs-text"];
  });
  const warn = document.getElementById("warnBox");
  if (warn) {
    warn.style.background = vars["--fs-card-alt"];
    warn.style.color = vars["--fs-text"];
    warn.style.border = "1px solid " + vars["--fs-line"];
  }
  const warnBtn = document.getElementById("warnViewBtn");
  if (warnBtn) {
    warnBtn.style.background = "#0F1E35";
    warnBtn.style.color = "#F5F4EC";
  }
  tab.querySelectorAll(".rule-box").forEach((r) => {
    r.style.background = vars["--fs-card-alt"];
    r.style.color = vars["--fs-text2"];
  });
  tab.querySelectorAll(".foot").forEach((f) => {
    f.style.color = vars["--fs-text3"];
  });
}
function applyFsThemeVars() {
  const vars = FS_THEME_VARS[fsIsLight() ? "light" : "dark"];
  Object.keys(vars).forEach((k) => document.body.style.setProperty(k, vars[k]));
  styleSelfShipNativeElements();
  "function" == typeof renderFakeShipTab &&
    document.getElementById("selfshipFakeShipPanel") &&
    "none" !== document.getElementById("selfshipFakeShipPanel").style.display &&
    renderFakeShipTab();
  "function" == typeof switchSelfShipView &&
    document.getElementById("fsTabGenerate") &&
    switchSelfShipView(
      document.getElementById("selfshipFakeShipPanel") &&
        "none" !== document.getElementById("selfshipFakeShipPanel").style.display
        ? "fake"
        : "generate",
    );
}
(function () {
  applyFsThemeVars();
  try {
    new MutationObserver(applyFsThemeVars).observe(document.body, { attributes: !0, attributeFilter: ["data-theme"] });
  } catch (e) {}
  const toggleBtn = document.getElementById("appThemeToggle");
  toggleBtn && toggleBtn.addEventListener("click", () => setTimeout(applyFsThemeVars, 80));
})();

/* ================= Self-Ship: Fake Ship (manual tracking) — Firestore CRUD ================= */
function fakeShipCollection() {
  return fbDb.collection("aikm_admin").doc("data").collection("fakeShipEntries");
}
async function saveFakeShipEntry(orderId, tracking, courier) {
  if (!fbDb) return void alert("Connect Firebase sync first (Backend/Data tab).");
  if (!orderId || !tracking) return;
  try {
    await fakeShipCollection()
      .doc(orderId)
      .set(
        { orderId, tracking, courier: courier || "", addedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: !0 },
      );
  } catch (e) {
    alert("Could not save tracking: " + e.message);
  }
}
async function deleteFakeShipEntry(orderId) {
  if (!fbDb) return;
  try {
    await fakeShipCollection().doc(orderId).delete();
  } catch (e) {
    console.warn("Delete fake ship entry failed:", e.message);
  }
}
let fakeShipEntries = {},
  fbFakeShipUnsub = null;
function startFakeShipSync() {
  if (!fbDb) return;
  fbFakeShipUnsub && (fbFakeShipUnsub(), (fbFakeShipUnsub = null));
  fbFakeShipUnsub = fakeShipCollection().onSnapshot(
    (snap) => {
      fakeShipEntries = {};
      snap.forEach((doc) => {
        fakeShipEntries[doc.id] = doc.data();
      });
      "function" == typeof renderFakeShipTab && renderFakeShipTab();
      "function" == typeof renderSelfShipStats && renderSelfShipStats();
    },
    (e) => console.warn("fakeShipEntries sync error", e),
  );
}
try {
  const _origConnectFirebaseForFakeShip = connectFirebase;
  connectFirebase = function (cfg) {
    _origConnectFirebaseForFakeShip(cfg);
    try {
      startFakeShipSync();
    } catch (e) {
      console.warn("startFakeShipSync failed:", e);
    }
  };
  if (fbDb) startFakeShipSync();
} catch (e) {}

function ensureFakeShipModal() {
  if (document.getElementById("fakeShipModal")) return;
  const e = document.createElement("div");
  e.id = "fakeShipModal";
  e.className = "admin-modal-overlay";
  e.style.display = "none";
  const courierOptions = STATIC_COURIER_SUGGESTIONS.map((c) => `<option value="${c}">${c}</option>`).join("");
  e.innerHTML = `
    <div class="admin-modal-box">
      <div class="admin-modal-glow"></div>
      <div class="admin-modal-head">
        <span class="admin-modal-kicker">Enter tracking</span>
        <h3 id="fakeShipModalOrderId" style="color:var(--shell-text,#1a2233);"></h3>
      </div>
      <div class="admin-modal-body">
        <label for="fakeShipModalTracking">Tracking number</label>
        <input type="text" id="fakeShipModalTracking" placeholder="e.g. MANUAL-88213" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(212,175,55,.35);background:rgba(255,255,255,.06);color:inherit;font-family:inherit;font-size:13px;box-sizing:border-box;">
        <label for="fakeShipModalCourier" style="display:block;margin-top:12px;">Courier</label>
        <select id="fakeShipModalCourier" style="width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(212,175,55,.35);background:rgba(255,255,255,.06);color:inherit;font-family:inherit;font-size:13px;box-sizing:border-box;">
          <option value="">— choose courier —</option>
          ${courierOptions}
        </select>
      </div>
      <div class="admin-modal-actions">
        <button type="button" class="admin-modal-btn ghost" id="fakeShipModalCancel">Cancel</button>
        <button type="button" class="admin-modal-btn gold" id="fakeShipModalSave">Save</button>
      </div>
    </div>`;
  document.body.appendChild(e);
}
function askFakeShipDetails(orderId, defaults) {
  ensureFakeShipModal();
  return new Promise((resolve) => {
    const modal = document.getElementById("fakeShipModal"),
      trackingInput = document.getElementById("fakeShipModalTracking"),
      courierSelect = document.getElementById("fakeShipModalCourier"),
      saveBtn = document.getElementById("fakeShipModalSave"),
      cancelBtn = document.getElementById("fakeShipModalCancel");
    document.getElementById("fakeShipModalOrderId").textContent = orderId;
    trackingInput.value = (defaults && defaults.tracking) || "";
    courierSelect.value = (defaults && defaults.courier) || "Amazon Shipping";
    function cleanup() {
      ((modal.style.display = "none"),
        saveBtn.removeEventListener("click", onSave),
        cancelBtn.removeEventListener("click", onCancel),
        trackingInput.removeEventListener("keydown", onKey));
    }
    function onSave() {
      const t = trackingInput.value.trim();
      if (!t) return ((trackingInput.style.borderColor = "#E24B4A"), void trackingInput.focus());
      (cleanup(), resolve({ tracking: t, courier: courierSelect.value || "" }));
    }
    function onCancel() {
      (cleanup(), resolve(null));
    }
    function onKey(e) {
      ("Enter" === e.key && (e.preventDefault(), onSave()), "Escape" === e.key && (e.preventDefault(), onCancel()));
    }
    ((modal.style.display = "flex"),
      setTimeout(() => {
        trackingInput.focus();
      }, 50),
      saveBtn.addEventListener("click", onSave),
      cancelBtn.addEventListener("click", onCancel),
      trackingInput.addEventListener("keydown", onKey));
  });
}
async function promptFakeShipEntry(orderId) {
  const existing = fakeShipEntries[orderId] || {};
  const result = await askFakeShipDetails(orderId, existing);
  if (!result) return;
  await saveFakeShipEntry(orderId, result.tracking, result.courier);
  const modal = document.getElementById("flagModal");
  modal && "flex" === modal.style.display && closeFlagModal && closeFlagModal();
  "function" == typeof processSelectedOrders &&
    document.getElementById("orderIdsInput") &&
    document.getElementById("orderIdsInput").value.trim() &&
    processSelectedOrders();
}

function fsCollectExistingTrackings() {
  const set = new Set();
  if ("undefined" != typeof parsedRows && parsedRows && "undefined" != typeof parsedCol && parsedCol) {
    parsedRows.forEach((row) => {
      const v = cleanId(row[parsedCol.tracker]);
      v && set.add(v);
    });
  }
  if ("undefined" != typeof fallbackIndex && fallbackIndex) {
    Object.values(fallbackIndex).forEach((v) => {
      v && v.tracker && set.add(v.tracker);
    });
  }
  Object.values(fakeShipEntries || {}).forEach((e) => {
    e && e.tracking && set.add(e.tracking);
  });
  return set;
}
function fsGenerateTrackingId(existingSet) {
  let id;
  do {
    id = "371" + String(Math.floor(1e8 + 9e8 * Math.random()));
  } while (existingSet.has(id));
  existingSet.add(id);
  return id;
}
async function bulkAutoFillTracking(ids) {
  if (!ids || !ids.length) return;
  const ok = await askPremiumConfirm({
    kicker: "Auto-fill tracking",
    title: `Generate tracking for ${ids.length} order(s)?`,
    message:
      "Creates unique Amazon Shipping–style tracking numbers (371 + 9 digits, never duplicating anything already in your uploaded files or Fake Ship) for every order below with no tracking, and moves them all to the Fake Ship tab.",
    confirmLabel: "Auto-fill all",
  });
  if (!ok) return;
  const existing = fsCollectExistingTrackings();
  for (const id of ids) {
    const tracking = fsGenerateTrackingId(existing);
    await saveFakeShipEntry(id, tracking, "Amazon Shipping");
  }
  "function" == typeof processSelectedOrders &&
    document.getElementById("orderIdsInput") &&
    document.getElementById("orderIdsInput").value.trim() &&
    processSelectedOrders();
}

/* ================= Self-Ship: simple inline "needs tracking" list — no modal-hopping required ================= */
let __fsNeedsTrackingIds = [];
function ensureNeedsTrackingPanel() {
  let panel = document.getElementById("fsNeedsTrackingPanel");
  if (panel) return panel;
  const group = document.getElementById("selfshipGenerateGroup");
  if (!group) return null;
  panel = document.createElement("div");
  panel.id = "fsNeedsTrackingPanel";
  panel.style.cssText =
    "display:none;font-family:'Lexend',sans-serif;background:var(--fs-card);border-radius:16px;padding:20px 22px;box-shadow:var(--fs-shadow);margin:14px 0;";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:10.5px;letter-spacing:.08em;color:var(--fs-text3);font-weight:600;">NEEDS TRACKING &middot; <span id="fsNeedsTrackingCount">0</span></div>
      <button type="button" id="fsBulkAutoFillBtn" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;background:#0F1E35;color:#F5F4EC;font-size:11.5px;font-weight:600;padding:7px 14px;border-radius:20px;">
        <i class="ti ti-wand" aria-hidden="true" style="font-size:13px;color:#D4AF37;"></i>Auto-fill all
      </button>
    </div>
    <div id="fsNeedsTrackingBody"></div>
  `;
  const zeroMsg = document.getElementById("zeroMsg");
  zeroMsg && zeroMsg.parentNode ? zeroMsg.parentNode.insertBefore(panel, zeroMsg) : group.appendChild(panel);
  document
    .getElementById("fsBulkAutoFillBtn")
    .addEventListener("click", () => bulkAutoFillTracking(__fsNeedsTrackingIds.slice()));
  return panel;
}
function renderNeedsTrackingPanel(ids) {
  const panel = ensureNeedsTrackingPanel();
  if (!panel) return;
  __fsNeedsTrackingIds = ids || [];
  if (!ids || !ids.length) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  document.getElementById("fsNeedsTrackingCount").textContent = ids.length;
  document.getElementById("fsNeedsTrackingBody").innerHTML = ids
    .map(
      (id) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--fs-line);">
      <div style="width:26px;height:26px;border-radius:9px;background:var(--fs-danger-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="ti ti-alert-triangle" aria-hidden="true" style="font-size:14px;color:var(--fs-danger-text);"></i>
      </div>
      <span style="flex:1;font-size:12.5px;font-weight:500;color:var(--fs-text);">${escapeHtml(id)}</span>
      <button type="button" data-needs-tracking-id="${escapeHtml(id)}" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;background:#0F1E35;color:#F5F4EC;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;">
        <i class="ti ti-plus" aria-hidden="true" style="font-size:13px;color:#D4AF37;"></i>Enter tracking
      </button>
    </div>`,
    )
    .join("");
  document
    .getElementById("fsNeedsTrackingBody")
    .querySelectorAll("[data-needs-tracking-id]")
    .forEach((btn) => {
      btn.addEventListener("click", () => promptFakeShipEntry(btn.dataset.needsTrackingId));
    });
}

async function bulkDeleteAllFakeShip() {
  const ids = Object.keys(fakeShipEntries || {});
  if (!ids.length) return;
  const ok = await askPremiumConfirm({
    kicker: "Delete All Fake Ship Entries",
    title: `${ids.length} entr${1 === ids.length ? "y" : "ies"}`,
    message:
      "Only do this once refunds have been initiated for all of these buyers. This removes every manual tracking entry permanently and they will stop appearing in the downloaded file.",
    confirmLabel: "Refund initiated — delete all",
  });
  if (!ok) return;
  for (const id of ids) {
    await deleteFakeShipEntry(id);
  }
}
async function confirmDeleteFakeShipEntry(orderId) {
  const ok = await askPremiumConfirm({
    kicker: "Delete Fake Ship Entry",
    title: `Order ${orderId}`,
    message:
      "Use this once the refund has been initiated for this buyer. This removes the manual tracking entry permanently and it will stop appearing in the downloaded file.",
    confirmLabel: "Refund initiated — delete",
  });
  ok && deleteFakeShipEntry(orderId);
}

let __fakeShipSelected = new Set();
function renderFakeShipTab() {
  const body = document.getElementById("fakeShipBody");
  if (!body) return;
  const entries = Object.values(fakeShipEntries).sort((a, b) => {
    const ta = a.addedAt && a.addedAt.toDate ? a.addedAt.toDate().getTime() : 0,
      tb = b.addedAt && b.addedAt.toDate ? b.addedAt.toDate().getTime() : 0;
    return tb - ta;
  });
  const validIds = new Set(entries.map((e) => e.orderId));
  __fakeShipSelected.forEach((id) => {
    validIds.has(id) || __fakeShipSelected.delete(id);
  });
  const empty = document.getElementById("fakeShipEmpty");
  if (!entries.length) {
    body.innerHTML = "";
    if (empty) empty.style.display = "block";
    updateFakeShipDeleteSelectedBtn();
    return;
  }
  if (empty) empty.style.display = "none";
  body.innerHTML = entries
    .map((e, idx) => {
      const added = e.addedAt && e.addedAt.toDate ? e.addedAt.toDate().toLocaleString() : "—";
      const checked = __fakeShipSelected.has(e.orderId) ? "checked" : "";
      return `<div style="display:grid;grid-template-columns:28px 1.4fr 1fr 1fr 1.1fr 0.8fr;align-items:center;padding:12px 18px;font-size:12.5px;border-top:1px solid var(--fs-line);background:${idx % 2 ? "var(--fs-card-alt)" : "var(--fs-card)"};color:var(--fs-text);">
      <input type="checkbox" data-select-fakeship="${escapeHtml(e.orderId || "")}" ${checked} style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;">
      <span style="font-weight:500;">${escapeHtml(e.orderId || "")}</span>
      <span style="color:var(--fs-text2);">${escapeHtml(e.tracking || "")}</span>
      <span style="color:var(--fs-text2);">${escapeHtml(e.courier || "—")}</span>
      <span style="color:var(--fs-text3);font-size:11px;">${added}</span>
      <button type="button" data-del-fakeship="${escapeHtml(e.orderId || "")}" style="all:unset;cursor:pointer;color:var(--fs-danger-text);font-size:12px;font-weight:600;justify-self:end;">Delete</button>
    </div>`;
    })
    .join("");
  body.querySelectorAll("[data-del-fakeship]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteFakeShipEntry(btn.dataset.delFakeship));
  });
  body.querySelectorAll("[data-select-fakeship]").forEach((cb) => {
    cb.addEventListener("change", () => {
      cb.checked
        ? __fakeShipSelected.add(cb.dataset.selectFakeship)
        : __fakeShipSelected.delete(cb.dataset.selectFakeship);
      updateFakeShipDeleteSelectedBtn();
    });
  });
  const countEl = document.getElementById("fakeShipTabCount");
  if (countEl) countEl.textContent = entries.length;
  updateFakeShipDeleteSelectedBtn();
}
function updateFakeShipDeleteSelectedBtn() {
  const btn = document.getElementById("fakeShipDeleteSelectedBtn");
  if (!btn) return;
  const n = __fakeShipSelected.size;
  btn.textContent = n ? `Delete selected (${n})` : "Delete selected";
  btn.style.opacity = n ? "1" : ".45";
  btn.style.pointerEvents = n ? "auto" : "none";
}
async function bulkDeleteSelectedFakeShip() {
  const ids = Array.from(__fakeShipSelected);
  if (!ids.length) return;
  const ok = await askPremiumConfirm({
    kicker: "Delete Selected Fake Ship Entries",
    title: `${ids.length} entr${1 === ids.length ? "y" : "ies"} selected`,
    message:
      "Only do this once refunds have been initiated for these buyers. This removes the selected manual tracking entries permanently.",
    confirmLabel: "Refund initiated — delete selected",
  });
  if (!ok) return;
  for (const id of ids) {
    await deleteFakeShipEntry(id);
  }
  __fakeShipSelected.clear();
}

/* ================= Self-Ship: premium header, compact sync cards, Generate/Fake-Ship tabs (theme-aware) ================= */
let __selfShipNeedsManual = 0;
function renderSelfShipStats(needsManual) {
  if ("undefined" != typeof needsManual && null != needsManual) __selfShipNeedsManual = needsManual;
  const omsEl = document.getElementById("fsStatOms"),
    zpEl = document.getElementById("fsStatZippy"),
    needEl = document.getElementById("fsStatNeed");
  if (omsEl)
    omsEl.textContent = (typeof omsOrdersRaw !== "undefined" ? omsOrdersRaw.length : 0).toLocaleString("en-IN");
  if (zpEl)
    zpEl.textContent = (typeof zippyShipmentsRaw !== "undefined" ? zippyShipmentsRaw.length : 0).toLocaleString(
      "en-IN",
    );
  if (needEl) needEl.textContent = __selfShipNeedsManual;
  const badge = document.getElementById("fsTabFakeShipBadge");
  const refundCount = Object.keys(fakeShipEntries || {}).length;
  if (badge) badge.textContent = refundCount;
  const refundEl = document.getElementById("fsStatRefundPending");
  if (refundEl) refundEl.textContent = refundCount;
}

function switchSelfShipView(view) {
  const gen = document.getElementById("selfshipGenerateGroup"),
    fs = document.getElementById("selfshipFakeShipPanel");
  const tabGen = document.getElementById("fsTabGenerate"),
    tabFs = document.getElementById("fsTabFakeShip");
  if (gen) gen.style.display = "fake" === view ? "none" : "";
  if (fs) fs.style.display = "fake" === view ? "block" : "none";
  if (tabGen && tabFs) {
    tabGen.style.background = "fake" === view ? "var(--fs-pill-bg)" : "#0F1E35";
    tabGen.style.color = "fake" === view ? "var(--fs-pill-text)" : "#F5F4EC";
    tabGen.style.boxShadow = "fake" === view ? "0 1px 3px rgba(0,0,0,.06)" : "0 4px 12px rgba(15,30,53,.24)";
    tabFs.style.background = "fake" === view ? "#0F1E35" : "var(--fs-pill-bg)";
    tabFs.style.color = "fake" === view ? "#F5F4EC" : "var(--fs-pill-text)";
    tabFs.style.boxShadow = "fake" === view ? "0 4px 12px rgba(15,30,53,.24)" : "0 1px 3px rgba(0,0,0,.06)";
  }
  if ("fake" === view) renderFakeShipTab();
}

function toggleSelfShipUpload(which) {
  const dz = document.getElementById("drop" === which ? "drop" : "drop2");
  if (!dz) return;
  const wrap = dz.closest(".card");
  const box = wrap ? wrap.querySelector(".fs-dropzone-wrap") : null;
  if (box) box.style.display = "none" === box.style.display ? "block" : "none";
}

(function buildPremiumSelfShipHeader() {
  const tab = document.getElementById("tab-selfship");
  if (!tab || document.getElementById("fsPremiumHeader")) return;
  const wrap = tab.querySelector(".wrap");
  if (!wrap) return;
  const brandbar = wrap.querySelector(".brandbar"),
    h1 = wrap.querySelector("h1"),
    sub = wrap.querySelector(".sub"),
    uploadRow = wrap.querySelector(".upload-row");
  if (brandbar) brandbar.style.display = "none";
  if (h1) h1.style.display = "none";
  if (sub) sub.style.display = "none";

  const header = document.createElement("div");
  header.id = "fsPremiumHeader";
  header.style.cssText = "font-family:'Lexend',sans-serif;color:var(--fs-text);margin-bottom:18px;";
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#0F1E35;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="ti ti-truck-delivery" aria-hidden="true" style="font-size:17px;color:#D4AF37;"></i>
        </div>
        <div>
          <div style="font-size:9.5px;letter-spacing:.12em;color:#B8942B;font-weight:700;">SELF-SHIP</div>
          <div style="font-size:18px;font-weight:600;letter-spacing:-.01em;color:var(--fs-text);">Shipping confirmation generator</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" id="fsTabGenerate" style="all:unset;cursor:pointer;background:#0F1E35;color:#F5F4EC;font-size:11.5px;font-weight:600;padding:7px 16px;border-radius:20px;box-shadow:0 4px 12px rgba(15,30,53,.24);">Generate</button>
        <button type="button" id="fsTabFakeShip" style="all:unset;cursor:pointer;background:var(--fs-pill-bg);color:var(--fs-pill-text);font-size:11.5px;font-weight:600;padding:7px 16px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);">Fake ship
          <span id="fsTabFakeShipBadge" style="background:var(--fs-badge-bg);color:var(--fs-badge-text);font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;">0</span>
        </button>
      </div>
    </div>

    <div style="background:var(--fs-card);border-radius:14px;padding:16px 22px;box-shadow:var(--fs-shadow);display:flex;align-items:center;">
      <div style="flex:1;">
        <div style="font-size:9.5px;letter-spacing:.07em;color:var(--fs-text3);font-weight:600;margin-bottom:5px;">OMS GURU</div>
        <div style="display:flex;align-items:baseline;gap:7px;">
          <span id="fsStatOms" style="font-size:19px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--fs-text);">0</span>
          <span style="width:5px;height:5px;border-radius:50%;background:var(--fs-success-text);"></span>
        </div>
        <div style="font-size:10.5px;color:var(--fs-text3);margin-top:3px;">auto-synced rows</div>
      </div>
      <div style="width:1px;height:38px;background:var(--fs-line);margin:0 22px;"></div>
      <div style="flex:1;">
        <div style="font-size:9.5px;letter-spacing:.07em;color:var(--fs-text3);font-weight:600;margin-bottom:5px;">ZIPPY ORDERS</div>
        <div style="display:flex;align-items:baseline;gap:7px;">
          <span id="fsStatZippy" style="font-size:19px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--fs-text);">0</span>
          <span style="width:5px;height:5px;border-radius:50%;background:var(--fs-success-text);"></span>
        </div>
        <div style="font-size:10.5px;color:var(--fs-text3);margin-top:3px;">auto-synced orders</div>
      </div>
      <div style="width:1px;height:38px;background:var(--fs-line);margin:0 22px;"></div>
      <div style="flex:1;">
        <div style="font-size:9.5px;letter-spacing:.07em;color:#B8942B;font-weight:600;margin-bottom:5px;">NEEDS TRACKING</div>
        <div style="display:flex;align-items:baseline;gap:7px;">
          <span id="fsStatNeed" style="font-size:19px;font-weight:600;letter-spacing:-.01em;color:var(--fs-text);font-variant-numeric:tabular-nums;">0</span>
          <span style="width:5px;height:5px;border-radius:50%;background:#D4AF37;"></span>
        </div>
        <div style="font-size:10.5px;color:var(--fs-text3);margin-top:3px;">from last match</div>
      </div>
      <div style="width:1px;height:38px;background:var(--fs-line);margin:0 22px;"></div>
      <div style="flex:1;">
        <div style="font-size:9.5px;letter-spacing:.07em;color:var(--fs-danger-text);font-weight:600;margin-bottom:5px;">REFUND PENDING</div>
        <div style="display:flex;align-items:baseline;gap:7px;">
          <span id="fsStatRefundPending" style="font-size:19px;font-weight:600;letter-spacing:-.01em;color:var(--fs-text);font-variant-numeric:tabular-nums;">0</span>
          <span style="width:5px;height:5px;border-radius:50%;background:var(--fs-danger-text);"></span>
        </div>
        <div style="font-size:10.5px;color:var(--fs-text3);margin-top:3px;">fake ship entries</div>
      </div>
    </div>
  `;
  wrap.insertBefore(header, brandbar || h1 || sub || uploadRow);

  document.getElementById("fsTabGenerate").addEventListener("click", () => switchSelfShipView("generate"));
  document.getElementById("fsTabFakeShip").addEventListener("click", () => switchSelfShipView("fake"));

  if (uploadRow) {
    const group = document.createElement("div");
    group.id = "selfshipGenerateGroup";
    uploadRow.parentNode.insertBefore(group, uploadRow);
    let node = uploadRow;
    while (node && node.parentNode === wrap) {
      const next = node.nextElementSibling;
      if (node.id === "flagModal") break;
      group.appendChild(node);
      node = next;
    }
  }

  const fsPanel = document.createElement("div");
  fsPanel.id = "selfshipFakeShipPanel";
  fsPanel.style.cssText = "display:none;font-family:'Lexend',sans-serif;color:var(--fs-text);";
  fsPanel.innerHTML = `
    <div style="background:var(--fs-card);border-radius:16px;padding:22px 24px;box-shadow:var(--fs-shadow);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:10.5px;letter-spacing:.08em;color:var(--fs-text3);font-weight:600;">FAKE SHIP &middot; MANUALLY ENTERED TRACKING</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <button type="button" id="fakeShipOverrideBtn" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;background:#0F1E35;color:#F5F4EC;font-size:11.5px;font-weight:600;padding:6px 13px;border-radius:20px;">
            <i class="ti ti-edit" aria-hidden="true" style="font-size:12px;color:#D4AF37;"></i>Override an order
          </button>
          <span id="fakeShipTabCount" style="font-size:11.5px;color:var(--fs-text3);">0</span>
          <button type="button" id="fakeShipDeleteSelectedBtn" style="all:unset;cursor:pointer;color:var(--fs-danger-text);font-size:11.5px;font-weight:600;opacity:.45;pointer-events:none;">Delete selected</button>
          <button type="button" id="fakeShipDeleteAllBtn" style="all:unset;cursor:pointer;color:var(--fs-danger-text);font-size:11.5px;font-weight:600;">Delete all</button>
        </div>
      </div>
      <div id="fakeShipEmpty" style="font-size:12.5px;color:var(--fs-text3);padding:16px 0;">No manual tracking entries yet. Use "+ enter tracking" next to a flagged order in the Generate tab.</div>
      <div id="fakeShipBody"></div>
    </div>
  `;
  wrap.appendChild(fsPanel);
  document.getElementById("fakeShipDeleteAllBtn").addEventListener("click", bulkDeleteAllFakeShip);
  document.getElementById("fakeShipDeleteSelectedBtn").addEventListener("click", bulkDeleteSelectedFakeShip);
  document.getElementById("fakeShipOverrideBtn").addEventListener("click", async () => {
    const id = await askTextPrompt({
      kicker: "Override Tracking",
      title: "Which order?",
      message:
        "Enter the Amazon order-id whose tracking/courier you want to correct — this will override whatever is in your OMS/Zippy file for it, even if it already has tracking.",
      placeholder: "e.g. 406-7878835-3577159",
      confirmLabel: "Next",
    });
    id && id.trim() && promptFakeShipEntry(id.trim());
  });

  renderSelfShipStats(0);
})();

(function collapseSelfShipUploadCards() {
  const tab = document.getElementById("tab-selfship");
  if (!tab) return;
  const cards = [
    ["drop", "filename"],
    ["drop2", "filename2"],
  ];
  cards.forEach(([dzId, fnId], idx) => {
    const dz = document.getElementById(dzId);
    if (!dz) return;
    const card = dz.closest(".card");
    if (!card || card.dataset.fsCollapsed) return;
    card.dataset.fsCollapsed = "1";
    const ruleTitle = card.querySelector(".rule-title");
    if (ruleTitle) ruleTitle.style.display = "none";
    const stepNote = card.querySelector(".step-note");
    if (stepNote) stepNote.style.display = "none";
    const wrapDiv = document.createElement("div");
    wrapDiv.className = "fs-dropzone-wrap";
    wrapDiv.style.display = "none";
    while (dz.nextSibling) wrapDiv.appendChild(dz.nextSibling);
    wrapDiv.insertBefore(dz, wrapDiv.firstChild);
    const label = 0 === idx ? "OMS Guru" : "Zippy / Nexshyp";
    const status = document.createElement("div");
    status.style.cssText =
      "background:var(--fs-card);border-radius:14px;padding:14px 16px;box-shadow:var(--fs-shadow);font-family:'Lexend',sans-serif;color:var(--fs-text);margin-bottom:0;";
    status.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:26px;height:26px;border-radius:50%;background:var(--fs-success-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="ti ti-check" aria-hidden="true" style="font-size:14px;color:var(--fs-success-text);"></i>
        </div>
        <div style="flex:1;">
          <div style="font-size:12.5px;font-weight:600;color:var(--fs-text);">${label}</div>
          <div style="font-size:11px;color:var(--fs-text3);">Auto-synced</div>
        </div>
        <button type="button" class="fs-upload-toggle" style="all:unset;cursor:pointer;font-size:11px;font-weight:500;color:var(--fs-text);border:1px solid var(--fs-line-strong);border-radius:7px;padding:6px 12px;">Upload manually</button>
      </div>
    `;
    card.innerHTML = "";
    card.appendChild(status);
    card.appendChild(wrapDiv);
    status.querySelector(".fs-upload-toggle").addEventListener("click", () => {
      wrapDiv.style.display = "none" === wrapDiv.style.display ? "block" : "none";
    });
  });
})();

if ("function" == typeof renderOmsOrdersTable) {
  const _fsOms = renderOmsOrdersTable;
  renderOmsOrdersTable = function () {
    _fsOms();
    "function" == typeof renderSelfShipStats && renderSelfShipStats();
  };
}
if ("function" == typeof renderZippyShipmentsTable) {
  const _fsZp = renderZippyShipmentsTable;
  renderZippyShipmentsTable = function () {
    _fsZp();
    "function" == typeof renderSelfShipStats && renderSelfShipStats();
  };
}

/* ================= Remove decorative orb/shine background elements — they were obscuring the sidebar/menu in light theme ================= */
(function killThemeRevealArtifact() {
  function killIt() {
    document.querySelectorAll(".theme-reveal").forEach((el) => el.remove());
  }
  killIt();
  document.addEventListener("DOMContentLoaded", killIt);
  try {
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.classList && n.classList.contains("theme-reveal")) n.remove();
        });
      });
    }).observe(document.body, { childList: true });
  } catch (e) {}
})();
(function removeDecorativeOrbs() {
  function hideOrbs() {
    document.querySelectorAll(".orb, .orb1, .orb2, .orb3, .hero-glow, .sparkle").forEach((el) => {
      el.style.display = "none";
    });
    const style = document.getElementById("fsNoShineStyle") || document.createElement("style");
    style.id = "fsNoShineStyle";
    style.textContent = `
      .app-shell, .app-sidebar, .app-header, .topbar, .app-content, .app-main {
        background-image: none !important;
      }
      .app-shell::before, .app-shell::after,
      .app-sidebar::before, .app-sidebar::after,
      .app-header::before, .app-header::after,
      .topbar::before, .topbar::after,
      .app-content::before, .app-content::after,
      .app-main::before, .app-main::after,
      body::before, body::after,
      html::before, html::after {
        content: none !important;
        display: none !important;
        background: none !important;
      }
      #tab-selfship {
        background: var(--fs-page) !important;
      }
    `;
    if (!style.parentNode) document.head.appendChild(style);
  }
  hideOrbs();
  document.addEventListener("DOMContentLoaded", hideOrbs);
  setTimeout(hideOrbs, 500);
})();
/* ================= Hide Zippy Shipments tab from UI (keeps background sync/fallback intact) ================= */
(function () {
  function hideZippyTab() {
    const btn = document.querySelector('.tabbtn[data-tab="zippyshipments"]');
    if (btn) btn.style.display = "none";
  }
  hideZippyTab();
  document.addEventListener("DOMContentLoaded", hideZippyTab);
})();

/* Stop rendering the Zippy table when its tab isn't visible — saves render time on every sync update */
if (typeof renderZippyShipmentsTable === "function") {
  const _origRenderZippy2 = renderZippyShipmentsTable;
  renderZippyShipmentsTable = function () {
    const panel = document.getElementById("tab-zippyshipments");
    if (panel && !panel.classList.contains("active")) return;
    _origRenderZippy2();
  };
}
/* ================= Fix: rebuild Product Summary map whenever Scan Log changes (fixes cloud-synced scans not appearing in summary) ================= */
(function () {
  if (typeof rebuildHistoryTable !== "function") return;
  const _origRebuildHistory = rebuildHistoryTable;
  window.rebuildHistoryTable = function () {
    try {
      const rebuilt = {};
      (scanLog || []).forEach((row) => {
        if (row.Product === "NOT FOUND") return;
        const key = row.Product + "||" + row.Channel;
        if (!rebuilt[key]) rebuilt[key] = { product: row.Product, channel: row.Channel, qty: 0, profit: 0, cogs: 0 };
        rebuilt[key].qty += row.Qty;
        rebuilt[key].profit += row["Expected Profit"];
        rebuilt[key].cogs += row["Cost of Goods"];
      });
      summaryMap = rebuilt;
    } catch (e) {
      console.warn("summaryMap rebuild failed (harmless):", e);
    }
    _origRebuildHistory();
  };
})();
/* ================= Fix: debounce Scan Log table rebuilds to stop flickering from rapid Firestore updates ================= */
(function () {
  if (typeof rebuildHistoryTable !== "function") return;
  const _origRebuildHistory2 = rebuildHistoryTable;
  let __rebuildDebounce = null;
  window.rebuildHistoryTable = function () {
    clearTimeout(__rebuildDebounce);
    __rebuildDebounce = setTimeout(() => {
      _origRebuildHistory2();
    }, 300);
  };
})();

/* ================= Fix: debounce Product Summary rebuilds to stop flickering ================= */
(function () {
  if (typeof renderSummary !== "function") return;
  const _origRenderSummary2 = renderSummary;
  let __summaryDebounce = null;
  window.renderSummary = function () {
    clearTimeout(__summaryDebounce);
    __summaryDebounce = setTimeout(() => {
      _origRenderSummary2();
    }, 300);
  };
})();

/* ================= Batch all sync-triggered renders into one pass — paste-only, no edits needed ================= */
(function () {
  let __batchTimer = null;
  let __pending = { reresolve: false, chips: false, summary: false, history: false, stats: false, backup: false };

  function runBatch() {
    if (__pending.reresolve && typeof _reresolveNotFoundOrig === "function") _reresolveNotFoundOrig();
    if (__pending.chips && typeof _renderFileChipsOrig === "function") _renderFileChipsOrig();
    if (__pending.summary && typeof _renderSummaryOrig === "function") _renderSummaryOrig();
    if (__pending.history && typeof _rebuildHistoryTableOrig === "function") _rebuildHistoryTableOrig();
    if (__pending.stats && typeof _updateStatsOrig === "function") _updateStatsOrig();
    if (__pending.backup && typeof _renderBackupStatsOrig === "function") _renderBackupStatsOrig();
    __pending = { reresolve: false, chips: false, summary: false, history: false, stats: false, backup: false };
  }
  function schedule(key) {
    __pending[key] = true;
    clearTimeout(__batchTimer);
    __batchTimer = setTimeout(runBatch, 400);
  }

  var _reresolveNotFoundOrig,
    _renderFileChipsOrig,
    _renderSummaryOrig,
    _rebuildHistoryTableOrig,
    _updateStatsOrig,
    _renderBackupStatsOrig;

  if (typeof reresolveNotFound === "function") {
    _reresolveNotFoundOrig = reresolveNotFound;
    window.reresolveNotFound = function () {
      schedule("reresolve");
      return 0;
    };
  }
  if (typeof renderFileChips === "function") {
    _renderFileChipsOrig = renderFileChips;
    window.renderFileChips = function () {
      schedule("chips");
    };
  }
  if (typeof renderSummary === "function") {
    _renderSummaryOrig = renderSummary;
    window.renderSummary = function () {
      schedule("summary");
    };
  }
  if (typeof rebuildHistoryTable === "function") {
    _rebuildHistoryTableOrig = rebuildHistoryTable;
    window.rebuildHistoryTable = function () {
      schedule("history");
    };
  }
  if (typeof updateStats === "function") {
    _updateStatsOrig = updateStats;
    window.updateStats = function () {
      schedule("stats");
    };
  }
  if (typeof renderBackupStats === "function") {
    _renderBackupStatsOrig = renderBackupStats;
    window.renderBackupStats = function () {
      schedule("backup");
    };
  }
})();
/* ================= FIX: LOTS Tiers cloud-echo loop guard ================= */
(function () {
  let __applyingCloudMeta = false;

  const _origApplyCloudMetaData = applyCloudMetaData;
  applyCloudMetaData = function (e) {
    __applyingCloudMeta = true;
    try {
      _origApplyCloudMetaData(e);
    } finally {
      __applyingCloudMeta = false;
    }
  };

  const _origSaveLotsTiers = saveLotsTiers;
  saveLotsTiers = function (e) {
    try {
      localStorage.setItem(LOTS_TIERS_KEY, JSON.stringify(e));
    } catch (err) {
      console.warn("lotsTiers localStorage save failed:", err);
    }
    if (!__applyingCloudMeta) {
      try {
        "function" == typeof saveAll && saveAll();
      } catch (err) {}
    }
  };
})();
/* ================= OMS DATA — SEPARATE FIREBASE PROJECT ================= */
(function () {
  const OMS_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk",
    authDomain: "aikm-oms-sync.firebaseapp.com",
    projectId: "aikm-oms-sync",
    storageBucket: "aikm-oms-sync.firebasestorage.app",
    messagingSenderId: "464184383750",
    appId: "1:464184383750:web:4fb422b90e519a87d76687",
  };
  let fbOmsApp = null,
    fbDbOms = null;
  function connectOmsFirebase() {
    if (!fbOmsApp) fbOmsApp = firebase.initializeApp(OMS_FIREBASE_CONFIG, "omsApp");
    fbDbOms = fbOmsApp.firestore();
    startOmsOrdersSync();
  }
  startOmsOrdersSync = function () {
    if (!fbDbOms) return;
    if (fbOmsUnsub) {
      fbOmsUnsub();
      fbOmsUnsub = null;
    }
    if (fbOmsChunksUnsub) {
      fbOmsChunksUnsub();
      fbOmsChunksUnsub = null;
    }
    fbOmsUnsub = fbDbOms
      .collection("aikm_admin")
      .doc("omsOrders")
      .onSnapshot(
        (doc) => {
          const el = document.getElementById("omsLastSynced");
          if (!doc.exists) {
            if (el) el.textContent = "Not synced yet";
            return;
          }
          const data = doc.data();
          if (data && data.lastSynced && data.lastSynced.toDate) {
            window.__omsLastSyncedDate = data.lastSynced.toDate();
            if (el) {
              const mins = Math.round((Date.now() - data.lastSynced.toDate().getTime()) / 60000);
              el.textContent = `Last synced: ${mins < 1 ? "just now" : mins + " min ago"} · ${data.orderCount || 0} orders`;
            }
          }
        },
        (e) => console.warn("OMS orders meta sync error", e),
      );
    fbOmsChunksUnsub = fbDbOms
      .collection("aikm_admin")
      .doc("omsOrders")
      .collection("chunks")
      .onSnapshot(
        (snap) => {
          snap.docChanges().forEach((c) => {
            if (c.type === "removed") delete omsChunksCache[c.doc.id];
            else omsChunksCache[c.doc.id] = c.doc.data().orders || [];
          });
          omsOrdersRaw = Object.values(omsChunksCache).flat();
          window.omsOrdersRaw = omsOrdersRaw;
          if (typeof rebuildOmsByAwbMap === "function") rebuildOmsByAwbMap();
          if (typeof invalidateFlattenedZippyCache === "function") invalidateFlattenedZippyCache();
          if (typeof renderOmsOrdersTable === "function") renderOmsOrdersTable();
          if (typeof integrateOmsIntoMasterData === "function") integrateOmsIntoMasterData();
          if (typeof loadOmsOrdersIntoSelfShip === "function") loadOmsOrdersIntoSelfShip();
          if (typeof renderZippyShipmentsTable === "function") renderZippyShipmentsTable();
          if (typeof renderScans === "function") renderScans();
          const sb = document.getElementById("sidebarLossCount");
          if (sb && typeof isOmsOrderLoss === "function") sb.textContent = omsOrdersRaw.filter(isOmsOrderLoss).length;
        },
        (e) => console.warn("OMS orders chunks sync error", e),
      );
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(connectOmsFirebase, 1000));
})(); /* ================= PERF FIX: paginate OMS Orders + Loss Orders (150/page) — was rendering up to 3000 rows on every tab switch ================= */
(function () {
  const OMS_PAGE_SIZE = 150,
    LOSS_PAGE_SIZE = 150;
  let omsPage = 0,
    lossPage = 0;

  function makePager(id, table, page, maxPage, total, onPrev, onNext) {
    let pager = document.getElementById(id);
    if (!pager) {
      pager = document.createElement("div");
      pager.id = id;
      pager.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:12px;";
      table.parentNode.insertBefore(pager, table.nextSibling);
    }
    if (!total) {
      pager.style.display = "none";
      return;
    }
    pager.innerHTML = `<button type="button" class="secondary" id="${id}Prev" style="padding:6px 12px;font-size:12px;">← Prev</button><span style="font-size:12px;color:var(--muted);">Page ${page + 1} of ${maxPage + 1} · ${total} items</span><button type="button" class="secondary" id="${id}Next" style="padding:6px 12px;font-size:12px;">Next →</button>`;
    pager.style.display = maxPage > 0 ? "flex" : "none";
    document.getElementById(id + "Prev").onclick = onPrev;
    document.getElementById(id + "Next").onclick = onNext;
  }

  renderOmsOrdersTable = function () {
    const e = document.getElementById("omsOrdersBody"),
      t = document.getElementById("omsOrdersTable"),
      n = document.getElementById("omsOrdersEmpty"),
      a = document.getElementById("omsOrderCount");
    if (!e) return;
    populateOmsFilterOptions();
    renderOmsOrdersStatusTabs();
    setupColumnFilterIcons("omsOrdersTable", omsOrdersRaw);
    const r = getFilteredOmsOrders();
    const maxPage = Math.max(0, Math.ceil(r.length / OMS_PAGE_SIZE) - 1);
    omsPage = Math.min(omsPage, maxPage);
    const start = omsPage * OMS_PAGE_SIZE,
      pageRows = r.slice(start, start + OMS_PAGE_SIZE);
    if (a)
      a.textContent = r.length
        ? `(showing ${start + 1}-${Math.min(start + OMS_PAGE_SIZE, r.length)} of ${r.length} · ${omsOrdersRaw.length} total)`
        : "";
    if (!r.length) {
      t.style.display = "none";
      n.style.display = "block";
      n.textContent = omsOrdersRaw.length
        ? "No orders match that search/filter."
        : "Waiting for first sync — connect Firebase in Backend/Data if you haven't, then wait up to 15 minutes.";
      makePager("omsOrdersPager", t, 0, 0, 0);
      return;
    }
    n.style.display = "none";
    t.style.display = "table";
    e.innerHTML = pageRows
      .map(
        (e) => `
      <tr class="${isOmsOrderLoss(e) ? "loss-row" : ""}">
        <td>${e.orderDate || ""}</td>
        <td>${e.slaDate || ""}</td>
        <td>${e.channelOrderId || ""}</td>
        <td>${e.productName || ""}</td>
        <td>${e.channel || ""}</td>
        <td>${e.qty || ""}</td>
        <td>${e.total || ""}</td>
        <td>${e.profit || ""}</td>
        <td>${e.status || ""}</td>
        <td>${e.awb || ""}</td>
        <td>${e.courier || ""}</td>
      </tr>
    `,
      )
      .join("");
    makePager(
      "omsOrdersPager",
      t,
      omsPage,
      maxPage,
      r.length,
      () => {
        omsPage = Math.max(0, omsPage - 1);
        renderOmsOrdersTable();
      },
      () => {
        omsPage = Math.min(maxPage, omsPage + 1);
        renderOmsOrdersTable();
      },
    );
  };

  renderLossOrdersTab = function () {
    const e = document.getElementById("lossOrdersBody"),
      t = document.getElementById("lossOrdersTable"),
      n = document.getElementById("lossOrdersEmpty"),
      a = document.getElementById("lossOrdersCount");
    if (!e) return;
    populateLossOrdersFilterOptions();
    setupColumnFilterIcons("lossOrdersTable", omsOrdersRaw.filter(isOmsOrderLoss));
    const o = omsOrdersRaw.filter(isOmsOrderLoss).length,
      r = document.getElementById("sidebarLossCount");
    r && (r.textContent = o);
    const lossPct = omsOrdersRaw.length ? ((o / omsOrdersRaw.length) * 100).toFixed(1) : "0.0";
    const s = getFilteredLossOrders();
    const maxPage = Math.max(0, Math.ceil(s.length / LOSS_PAGE_SIZE) - 1);
    lossPage = Math.min(lossPage, maxPage);
    const start = lossPage * LOSS_PAGE_SIZE,
      pageRows = s.slice(start, start + LOSS_PAGE_SIZE);
    if (a)
      a.textContent = s.length
        ? `(showing ${start + 1}-${Math.min(start + LOSS_PAGE_SIZE, s.length)} of ${s.length} · ${o} total loss · ${lossPct}% of all orders)`
        : "";
    ensureLossProfitHeaderSort();
    if (!s.length) {
      t.style.display = "none";
      n.style.display = "block";
      n.textContent = o
        ? "No loss orders match that search/filter."
        : omsOrdersRaw.length
          ? "No loss orders in the current data — nice."
          : "Waiting for first sync — connect Firebase in Backend/Data if you haven't, then wait up to 15 minutes.";
      makePager("lossOrdersPager", t, 0, 0, 0);
      return;
    }
    n.style.display = "none";
    t.style.display = "table";
    e.innerHTML = pageRows
      .map(
        (e) => `
      <tr class="loss-row">
        <td>${e.orderDate || ""}</td>
        <td>${e.channelOrderId || ""}</td>
        <td>${e.productName || ""}</td>
        <td>${e.channel || ""}</td>
        <td>${e.qty || ""}</td>
        <td>${e.total || ""}</td>
        <td>${e.profit || ""}${e.total ? ` <span style="font-size:10px;opacity:.75;">(${(((Number(e.profit) || 0) / Number(e.total)) * 100).toFixed(1)}%)</span>` : ""}</td>
        <td>${e.status || ""}</td>
        <td>${e.awb || ""}</td>
        <td>${e.courier || ""}</td>
      </tr>
    `,
      )
      .join("");
    makePager(
      "lossOrdersPager",
      t,
      lossPage,
      maxPage,
      s.length,
      () => {
        lossPage = Math.max(0, lossPage - 1);
        renderLossOrdersTab();
      },
      () => {
        lossPage = Math.min(maxPage, lossPage + 1);
        renderLossOrdersTab();
      },
    );
  };

  document.getElementById("omsSearchBox")?.addEventListener("input", () => {
    omsPage = 0;
  });
  document.getElementById("lossOrdersSearchBox")?.addEventListener("input", () => {
    lossPage = 0;
  });
})();
/* ================= Order/AWB Scanner → Loss Orders: column filters + Export to Excel ================= */
(function () {
  const LOSS_SCAN_TABLE_ID = "aikmScanLossTable";

  function currentFilteredLossRows() {
    const allLoss = scanLog.filter((e) => "YES" === e.Loss);
    const colFiltered = allLoss.filter((e) => passesColumnFilters(LOSS_SCAN_TABLE_ID, e));
    const q = ((lossSearch && lossSearch.value) || "").trim().toLowerCase();
    if (!q) return colFiltered;
    return colFiltered.filter((e) =>
      Object.values(e).some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }

  function exportLossScanToExcel() {
    const rows = currentFilteredLossRows();
    if (!rows.length) return void alert("No rows to export with the current search/filter.");
    const data = rows.map((e) => ({
      AWB: e.AWB || "",
      Product: e.Product || "",
      Channel: e.Channel || "",
      "Ship Type": e["Ship Type"] || "",
      "Expected Profit": e["Expected Profit"],
      Date: e.date || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Loss Orders");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `Loss_Orders_Scan_${stamp}.xlsx`);
  }

  function ensureLossExportBtn() {
    if (document.getElementById("lossScanExportBtn")) return;
    if (!lossSearch || !lossSearch.parentNode) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "lossScanExportBtn";
    btn.className = "secondary";
    btn.textContent = "⬇ Export to Excel";
    btn.style.cssText = "margin-top:8px;padding:8px 14px;font-size:12px;white-space:nowrap;";
    btn.addEventListener("click", exportLossScanToExcel);
    lossSearch.parentNode.insertBefore(btn, lossSearch.nextSibling);
  }

  function ensureLossFilterColumns(table) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow || headerRow.dataset.lossFiltersWired) return;
    headerRow.dataset.lossFiltersWired = "1";
    const fieldByIndex = { 0: "AWB", 1: "Product", 2: "Channel", 3: "Ship Type" };
    Array.from(headerRow.children).forEach((th, i) => {
      if (fieldByIndex[i]) th.dataset.filterCol = fieldByIndex[i];
    });
  }

  const _origRenderLoss = renderLoss;
  renderLoss = function () {
    const table = lossBody.closest("table");
    if (!table) {
      _origRenderLoss();
      return;
    }
    if (!table.id) table.id = LOSS_SCAN_TABLE_ID;
    ensureLossFilterColumns(table);

    const allLoss = scanLog.filter((e) => "YES" === e.Loss);
    setupColumnFilterIcons(table.id, allLoss);

    const emptyEl = document.getElementById("lossEmpty");
    const rows = allLoss.filter((e) => passesColumnFilters(table.id, e));

    if (!rows.length) {
      table.style.display = "none";
      if (emptyEl) emptyEl.style.display = "block";
      lossBody.innerHTML = "";
      ensureLossExportBtn();
      return;
    }

    table.style.display = "table";
    if (emptyEl) emptyEl.style.display = "none";
    lossBody.innerHTML = rows
      .map(
        (e) =>
          `<tr class="loss-row"><td>${escapeHtml(e.AWB || "—")}</td><td>${escapeHtml(e.Product)}</td><td>${channelBadge(e.Channel)}</td><td>${escapeHtml(e["Ship Type"] || "—")}</td><td>${fmtMoney(e["Expected Profit"])}</td><td>${escapeHtml(e.date || "—")}</td></tr>`,
      )
      .join("");
    applyFilter(lossSearch, lossBody);
    ensureLossExportBtn();
  };
})();
/* ================= Remove the 4-step overview strip at the top of Order Mapper ================= */
(function () {
  const stepsEl = document.querySelector("#rpanel4 .steps");
  if (stepsEl) stepsEl.remove();
})();
/* ================= LOTS 62: Failed Items mapper (product name + qty match) + Export Excel/PDF ================= */
(function () {
  const LOTS62_VENDOR_NAME = "LOTS 62";

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  async function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  }

  function findFailedItemName(code) {
    const rec = lotsPriceByCode[code] || lotsPriceByCode[String(code).trim()];
    return rec ? rec.name : null;
  }
  function findQtyForProduct(productName) {
    if (!productName) return null;
    const byVendor = computeByVendor();
    const pool = [];
    if (byVendor[LOTS62_VENDOR_NAME]) pool.push(...byVendor[LOTS62_VENDOR_NAME]);
    Object.keys(byVendor).forEach((v) => {
      if (v !== LOTS62_VENDOR_NAME) pool.push(...byVendor[v]);
    });
    const target = normalize(productName);
    let hit = pool.find((p) => normalize(p.name) === target);
    if (!hit)
      hit = pool.find((p) => {
        const n = normalize(p.name);
        return n.includes(target) || target.includes(n);
      });
    return hit ? hit.qty : null;
  }

  function effectiveName(row) {
    return (row.manualName || row.name || "").trim();
  }
  function effectiveQty(row) {
    return row.manualQty != null ? row.manualQty : row.qty;
  }

  async function processLots62FailedFile(file) {
    const statusEl = document.getElementById("lots62FailedStatus");
    statusEl.textContent = "Reading file…";
    try {
      const wb = await readWorkbook(file);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (!data.length) {
        statusEl.textContent = "No rows found in this file.";
        return;
      }
      const header = data[0].map((h) =>
        String(h || "")
          .trim()
          .toLowerCase(),
      );
      const codeIdx = header.findIndex((h) => h.includes("product code") || h.includes("item code") || h === "code");
      const reasonIdx = header.findIndex((h) => h.includes("reason") || h.includes("failure"));
      if (codeIdx === -1) {
        statusEl.textContent = 'Could not find a "Product Code" column in this file.';
        return;
      }
      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!r) continue;
        const code = r[codeIdx] != null ? String(r[codeIdx]).trim() : "";
        if (!code) continue;
        const reason = reasonIdx !== -1 && r[reasonIdx] != null ? String(r[reasonIdx]).trim() : "";
        const name = findFailedItemName(code);
        const qty = findQtyForProduct(name);
        rows.push({ code, name, manualName: null, qty, manualQty: null, reason });
      }
      if (!rows.length) {
        statusEl.textContent = "No valid rows found in this file.";
        return;
      }
      window.__lots62FailedRows = rows;
      renderLots62FailedTable();
      const matched = rows.filter((r) => effectiveQty(r) != null).length;
      const missingName = rows.filter((r) => !r.name).length;
      const missingQty = rows.filter((r) => effectiveQty(r) == null).length;
      let msg = `✓ Matched ${matched} of ${rows.length} item(s) to your order.`;
      if (missingName) msg += ` ${missingName} need a product name.`;
      if (missingQty) msg += ` ${missingQty} need a quantity.`;
      statusEl.textContent = msg;
    } catch (err) {
      statusEl.textContent = "Could not read this file: " + err.message;
    }
  }

  function sortRowsAlphabetically() {
    const rows = window.__lots62FailedRows || [];
    rows.sort((a, b) => effectiveName(a).localeCompare(effectiveName(b), undefined, { sensitivity: "base" }));
  }

  function renderLots62FailedTable() {
    sortRowsAlphabetically();
    const rows = window.__lots62FailedRows || [];
    const body = document.getElementById("lots62FailedBody");
    const wrap = document.getElementById("lots62FailedResultsWrap");
    body.innerHTML = rows
      .map((r, idx) => {
        const nameCell = r.name
          ? escapeHtml(r.name)
          : `<input type="text" class="qty-input lots62-manual-name" data-idx="${idx}" placeholder="Enter product name" value="${escapeHtml(r.manualName || "")}" style="width:100%;">`;
        const qty = effectiveQty(r);
        const qtyCell =
          qty != null
            ? escapeHtml(String(qty))
            : `<input type="number" min="0" class="qty-input lots62-manual-qty" data-idx="${idx}" placeholder="Qty" value="" style="width:70px;">`;
        const needsAttention = !r.name || qty == null;
        return `<tr${needsAttention ? ' style="background:rgba(212,145,55,.08);"' : ""}>
        <td>${nameCell}</td>
        <td>${qtyCell}</td>
        <td>${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.reason || "—")}</td>
      </tr>`;
      })
      .join("");
    wrap.style.display = "block";

    body.querySelectorAll(".lots62-manual-name").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = +e.target.dataset.idx;
        if (window.__lots62FailedRows[idx]) window.__lots62FailedRows[idx].manualName = e.target.value;
      });
      input.addEventListener("blur", () => {
        const rows2 = window.__lots62FailedRows || [];
        rows2.forEach((r) => {
          if (!r.name && r.manualName && r.qty == null && r.manualQty == null) {
            r.qty = findQtyForProduct(r.manualName);
          }
        });
        renderLots62FailedTable();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.blur();
        }
      });
    });

    body.querySelectorAll(".lots62-manual-qty").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = +e.target.dataset.idx;
        const val = e.target.value.trim();
        if (window.__lots62FailedRows[idx]) window.__lots62FailedRows[idx].manualQty = val === "" ? null : Number(val);
      });
      input.addEventListener("blur", () => renderLots62FailedTable());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.blur();
        }
      });
    });
  }

  function exportLots62FailedToExcel() {
    sortRowsAlphabetically();
    const rows = window.__lots62FailedRows || [];
    if (!rows.length) return void alert("Upload a failed items file first.");
    const missing = rows.filter((r) => !effectiveName(r) || effectiveQty(r) == null).length;
    if (missing)
      return void alert(
        `${missing} item(s) still need a product name and/or quantity before exporting — fill them in first.`,
      );
    const data = rows.map((r) => ({
      "Product Name": effectiveName(r),
      "Qty Ordered": effectiveQty(r),
      "Item Code": r.code,
      "Failure Reason": r.reason || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 45 }, { wch: 12 }, { wch: 14 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, "Failed Items");
    XLSX.writeFile(wb, `LOTS62_Failed_Items_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportLots62FailedToPdf() {
    sortRowsAlphabetically();
    const rows = window.__lots62FailedRows || [];
    if (!rows.length) return void alert("Upload a failed items file first.");
    const missing = rows.filter((r) => !effectiveName(r) || effectiveQty(r) == null).length;
    if (missing)
      return void alert(
        `${missing} item(s) still need a product name and/or quantity before exporting — fill them in first.`,
      );
    const btn = document.getElementById("lots62FailedExportPdf");
    const orig = btn.textContent;
    btn.textContent = "Preparing…";
    btn.disabled = true;
    try {
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const NAVY = [15, 30, 53],
        GOLD = [212, 175, 55],
        CREAM = [248, 245, 238],
        TEXT_DARK = [26, 34, 51];

      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 22, "F");
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.6);
      doc.line(0, 22, pageWidth, 22);
      doc.setTextColor(...GOLD);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("AIKM PHARMA PRIVATE LIMITED", 10, 8);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11.5);
      doc.text("LOTS 62 — Failed Items", 10, 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(220, 220, 225);
      doc.text(`${new Date().toLocaleString("en-IN")}  ·  ${rows.length} item(s)`, pageWidth - 10, 15, {
        align: "right",
      });

      doc.autoTable({
        startY: 27,
        margin: { left: 10, right: 10 },
        head: [["Product Name", "Qty", "Item Code", "Failure Reason"]],
        body: rows.map((r) => [effectiveName(r), String(effectiveQty(r)), r.code, r.reason || "—"]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2.2, textColor: TEXT_DARK, lineColor: [230, 226, 214], lineWidth: 0.2 },
        headStyles: { fillColor: NAVY, textColor: GOLD, fontStyle: "bold", fontSize: 8, halign: "left" },
        alternateRowStyles: { fillColor: CREAM },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 16, halign: "center", fontStyle: "bold" },
          2: { cellWidth: 24, halign: "center" },
          3: { cellWidth: 38 },
        },
        didDrawPage: () => {
          const pageSize = doc.internal.pageSize;
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageSize.getWidth() - 10,
            pageSize.getHeight() - 6,
            { align: "right" },
          );
          doc.text("Dal Bhaat Admin Console", 10, pageSize.getHeight() - 6);
        },
      });

      doc.save(`LOTS62_Failed_Items_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      alert("Could not generate PDF: " + err.message);
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  }

  function ensureLots62FailedItemsCard() {
    if (document.getElementById("lots62FailedItemsCard")) return;
    const host = document.getElementById("vendorSummaryCard");
    if (!host) return;
    const card = document.createElement("div");
    card.className = "card";
    card.id = "lots62FailedItemsCard";
    card.style.marginBottom = "14px";
    card.innerHTML = `
      <h2>LOTS 62 — Failed Items</h2>
      <p class="sub">Upload the failed items file LOTS 62 sends back after an order (Stock Out / Invalid product) — matches each item to its product name and the quantity you ordered. Exports are sorted alphabetically by product name.</p>
      <button type="button" id="lots62FailedChooseBtn" class="btn btn-small" style="margin:8px 0;">📄 Choose Failed Items File</button>
      <input type="file" id="lots62FailedInput" accept=".xlsx,.xls,.csv" style="display:none;">
      <div id="lots62FailedStatus" style="font-size:12px;color:var(--muted);margin-bottom:10px;"></div>
      <div id="lots62FailedResultsWrap" style="display:none;">
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button type="button" id="lots62FailedExportExcel" class="secondary">⬇ Export Excel</button>
          <button type="button" id="lots62FailedExportPdf" class="secondary">⬇ Export PDF</button>
        </div>
        <table class="data">
          <thead><tr><th>Product Name</th><th>Qty</th><th>Item Code</th><th>Failure Reason</th></tr></thead>
          <tbody id="lots62FailedBody"></tbody>
        </table>
      </div>
    `;
    host.insertBefore(card, host.firstChild);
    const fileInput = document.getElementById("lots62FailedInput");
    document.getElementById("lots62FailedChooseBtn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) {
        const statusEl = document.getElementById("lots62FailedStatus");
        statusEl.textContent = f.name + " selected…";
        processLots62FailedFile(f);
      }
    });
    document.getElementById("lots62FailedExportExcel").addEventListener("click", exportLots62FailedToExcel);
    document.getElementById("lots62FailedExportPdf").addEventListener("click", exportLots62FailedToPdf);
  }

  ensureLots62FailedItemsCard();
})();

/* ================= Vendor Order Summary: Export ALL vendors, name-wise, in one PDF ================= */
(function () {
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  async function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  }

  async function exportAllVendorsPdf(btn) {
    const byVendor = computeByVendor();
    const vendors = Object.keys(byVendor).filter((v) => v !== "LOTS"); // LOTS excluded; LOTS 62 and everyone else stays
    if (!vendors.length) return void alert("Nothing to export yet — match some products first.");
    const rows = [];
    vendors.forEach((v) => {
      byVendor[v].forEach((item) => rows.push({ vendor: v, ...item }));
    });
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

    const orig = btn.textContent;
    btn.textContent = "Preparing…";
    btn.disabled = true;
    try {
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const NAVY = [15, 30, 53],
        GOLD = [212, 175, 55],
        CREAM = [248, 245, 238],
        TEXT_DARK = [26, 34, 51];

      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 22, "F");
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.6);
      doc.line(0, 22, pageWidth, 22);
      doc.setTextColor(...GOLD);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("AIKM PHARMA PRIVATE LIMITED", 10, 8);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("Vendor Order Summary — All Vendors excl. LOTS (Name-wise)", 10, 15);
      doc.setFont("Lexend", "normal");
      doc.setFontSize(7);
      doc.setTextColor(220, 220, 225);
      doc.text(
        `${new Date().toLocaleString("en-IN")}  ·  ${rows.length} line(s)  ·  ${vendors.length} vendor(s)`,
        pageWidth - 10,
        15,
        { align: "right" },
      );

      doc.autoTable({
        startY: 27,
        margin: { left: 10, right: 10 },
        head: [["Product Name", "Vendor", "Item Code", "Qty", "Rate", "Value"]],
        body: rows.map((r) => [
          r.name || "",
          r.vendor,
          r.code || "—",
          String(r.qty),
          r.rate != null ? "₹" + r.rate : "—",
          r.value != null ? "₹" + r.value.toFixed(0) : "—",
        ]),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2, textColor: TEXT_DARK, lineColor: [230, 226, 214], lineWidth: 0.2 },
        headStyles: { fillColor: NAVY, textColor: GOLD, fontStyle: "bold", fontSize: 7.5, halign: "left" },
        alternateRowStyles: { fillColor: CREAM },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 24 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 14, halign: "center", fontStyle: "bold" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
        },
        didDrawPage: () => {
          const pageSize = doc.internal.pageSize;
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageSize.getWidth() - 10,
            pageSize.getHeight() - 6,
            { align: "right" },
          );
          doc.text("Dal Bhaat Admin Console", 10, pageSize.getHeight() - 6);
        },
      });

      doc.save(`Vendor_Order_Summary_AllVendors_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      alert("Could not generate PDF: " + err.message);
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  }

  function ensureAllVendorsPdfBtn() {
    if (document.getElementById("exportAllVendorsPdfBtn")) return;
    const excelBtn = document.getElementById("exportVendorSummaryBtn");
    if (!excelBtn) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "exportAllVendorsPdfBtn";
    btn.className = "secondary";
    btn.style.marginLeft = "8px";
    btn.textContent = "⬇ Export All Vendors (PDF)";
    btn.addEventListener("click", () => exportAllVendorsPdf(btn));
    excelBtn.parentNode.insertBefore(btn, excelBtn.nextSibling);
  }

  ensureAllVendorsPdfBtn();
})();
/* ================= PERF FIX: memoize localStorage-backed lookups called inside render loops ================= */
/* getSpapiManualCost, loadSpapiOrderOverrides, loadLearned were each doing JSON.parse(localStorage.getItem(...))
   on every single row of every table render. For 500+ SKUs that's 500+ redundant parses per render, on every
   Firestore snapshot from all 3 connected Firebase projects. This caches the parsed value and only re-parses
   when the underlying key actually changes (same pattern already used for getSpapiSellerName). */
(function () {
  function memoizeLocalStorageJSON(getFnName, storageKey) {
    if (typeof window[getFnName] !== "function") return;
    let cachedRaw = null,
      cachedObj = {};
    const orig = window[getFnName];
    window[getFnName] = function () {
      let raw;
      try {
        raw = localStorage.getItem(storageKey);
      } catch (e) {
        raw = null;
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
          cachedObj = raw ? JSON.parse(raw) : {};
        } catch (e) {
          cachedObj = {};
        }
      }
      return cachedObj;
    };
    // preserve original as fallback if something depends on identity/behavior beyond plain parse
    window[getFnName].__unmemoized = orig;
  }

  if (typeof loadSpapiManualCosts === "function") {
    let cachedRaw = null,
      cachedObj = {};
    const orig = loadSpapiManualCosts;
    window.loadSpapiManualCosts = function () {
      let raw;
      try {
        raw = localStorage.getItem(SPAPI_MANUAL_COST_KEY);
      } catch (e) {
        raw = null;
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
          cachedObj = raw ? JSON.parse(raw) : {};
        } catch (e) {
          cachedObj = {};
        }
      }
      return cachedObj;
    };
  }
  if (typeof loadSpapiOrderOverrides === "function") {
    let cachedRaw = null,
      cachedObj = {};
    window.loadSpapiOrderOverrides = function () {
      let raw;
      try {
        raw = localStorage.getItem(SPAPI_ORDER_OVERRIDES_KEY);
      } catch (e) {
        raw = null;
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
          cachedObj = raw ? JSON.parse(raw) : {};
        } catch (e) {
          cachedObj = {};
        }
      }
      return cachedObj;
    };
  }
  if (typeof loadLearned === "function") {
    let cachedRaw = null,
      cachedObj = {};
    window.loadLearned = function () {
      let raw;
      try {
        raw = localStorage.getItem(LEARN_KEY);
      } catch (e) {
        raw = null;
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
          cachedObj = raw ? JSON.parse(raw) : {};
          if ("" in cachedObj) {
            delete cachedObj[""];
            try {
              localStorage.setItem(LEARN_KEY, JSON.stringify(cachedObj));
            } catch (e) {}
          }
        } catch (e) {
          cachedObj = {};
        }
      }
      return cachedObj;
    };
  }

  // Whenever any of these three localStorage keys are written elsewhere in the app
  // (setSpapiManualCost, setSpapiOrderOverride, saveLearned), the cache above will
  // naturally pick up the change on next read because it re-checks the raw string —
  // no extra wiring needed, and nothing about *what* gets saved has changed.
})();
/* ================= Global "Processing…" bar — shows center-screen on every tab/nav click, tool-wide ================= */
(function () {
  function ensureBusyOverlay() {
    if (document.getElementById("globalBusyOverlay")) return;
    const el = document.createElement("div");
    el.id = "globalBusyOverlay";
    el.innerHTML = `
      <div class="gbo-card">
        <div class="gbo-track"><div class="gbo-fill"></div></div>
        <div class="gbo-label">Processing…</div>
      </div>`;
    document.body.appendChild(el);
    const style = document.createElement("style");
    style.textContent = `
      #globalBusyOverlay{position:fixed;inset:0;background:rgba(15,30,53,.35);display:none;align-items:center;justify-content:center;z-index:999999;}
      #globalBusyOverlay.show{display:flex;}
      .gbo-card{background:#0F1E35;border:1px solid rgba(212,175,55,.35);border-radius:12px;padding:20px 26px;box-shadow:0 10px 30px rgba(0,0,0,.35);min-width:220px;}
      .gbo-track{width:100%;height:6px;border-radius:4px;background:rgba(212,175,55,.18);overflow:hidden;}
      .gbo-fill{width:40%;height:100%;border-radius:4px;background:linear-gradient(90deg,#D4AF37,#F0DA8C);animation:gboSlide 1.1s ease-in-out infinite;}
      @keyframes gboSlide{0%{margin-left:-40%;}50%{margin-left:60%;}100%{margin-left:-40%;}}
      .gbo-label{margin-top:10px;color:#F5F4EC;font-family:'Lexend',sans-serif;font-size:12.5px;font-weight:600;letter-spacing:.02em;text-align:center;}
    `;
    document.head.appendChild(style);
  }
  window.showBusy = function (text) {
    ensureBusyOverlay();
    const el = document.getElementById("globalBusyOverlay");
    const label = el.querySelector(".gbo-label");
    if (label) label.textContent = text || "Processing…";
    el.classList.add("show");
  };
  window.hideBusy = function () {
    const el = document.getElementById("globalBusyOverlay");
    if (el) el.classList.remove("show");
  };

  // PERF: removed the 0.45 s "Processing…" flash that appeared on every tab / sub-tab click.
})();

/* ================= Sidebar tab switching: stop re-rendering OMS Orders / Loss Orders / Zippy on click — ================= */
/* ================= they're already kept current live by their Firestore listeners in the background.  ================= */
(function () {
  const SKIP_ON_CLICK = ["renderOmsOrdersTable", "renderLossOrdersTab", "renderZippyShipmentsTable"];
  document.addEventListener(
    "click",
    function (e) {
      if (!e.target.closest(".tabbtn")) return;
      const saved = {};
      SKIP_ON_CLICK.forEach((name) => {
        if (typeof window[name] === "function") {
          saved[name] = window[name];
          window[name] = function () {}; // no-op only for this click's synchronous handler
        }
      });
      setTimeout(() => {
        SKIP_ON_CLICK.forEach((name) => {
          if (saved[name]) window[name] = saved[name];
        });
      }, 0);
    },
    true,
  ); // capture phase — runs before the original tab-click handler
})();
let __lossOrdersLastCount = -1;
function __lossOrdersHealCheck() {
  if (typeof renderLossOrdersTab !== "function" || typeof omsOrdersRaw === "undefined" || !omsOrdersRaw.length) return;
  const panel = document.getElementById("tab-lossorders");
  if (!panel || !panel.classList.contains("active")) return; // skip entirely if this tab isn't open
  if (omsOrdersRaw.length === __lossOrdersLastCount) return; // skip if data hasn't changed since last check
  __lossOrdersLastCount = omsOrdersRaw.length;
  renderLossOrdersTab();
}
setInterval(__lossOrdersHealCheck, 15000);
setTimeout(__lossOrdersHealCheck, 2000);
/* ================= PERF FIX: don't re-render heavy tables in the background when their tab isn't open ================= */
(function () {
  const GATED_RENDERS = {
    renderLossOrdersTab: "lossorders",
    renderOmsOrdersTable: "omsorders",
    renderZippyShipmentsTable: "zippyshipments",
    renderLotsProductsTable: "lotsproducts",
  };
  function activeTab() {
    const btn = document.querySelector(".tabbtn.active");
    return btn ? btn.dataset.tab : null;
  }
  Object.keys(GATED_RENDERS).forEach(function (fnName) {
    const original = window[fnName];
    if (typeof original !== "function") return;
    window[fnName] = function () {
      if (activeTab() === GATED_RENDERS[fnName]) {
        return original.apply(this, arguments);
      }
    };
  });
})();
/* ================= PATCH v2: LOTS 62 Failed Items — allow uploading MULTIPLE files at once (merged into one table) ================= */
(function () {
  function waitForLots62(cb) {
    const input = document.getElementById("lots62FailedInput");
    const btn = document.getElementById("lots62FailedChooseBtn");
    if (input && btn) return cb(input, btn);
    setTimeout(() => waitForLots62(cb), 400);
  }
  waitForLots62(function (oldInput, oldBtn) {
    const input = oldInput.cloneNode(true);
    input.setAttribute("multiple", "multiple");
    oldInput.parentNode.replaceChild(input, oldInput);

    const btn = oldBtn.cloneNode(true);
    btn.textContent = "📄 Choose Failed Items File(s)";
    oldBtn.parentNode.replaceChild(btn, oldBtn);
    btn.addEventListener("click", () => input.click());

    function findName(code) {
      const rec =
        typeof lotsPriceByCode !== "undefined" && (lotsPriceByCode[code] || lotsPriceByCode[String(code).trim()]);
      return rec ? rec.name : null;
    }
    function findQty(name) {
      if (!name || typeof computeByVendor !== "function") return null;
      const byVendor = computeByVendor();
      const pool = [];
      if (byVendor["LOTS 62"]) pool.push(...byVendor["LOTS 62"]);
      Object.keys(byVendor).forEach((v) => {
        if (v !== "LOTS 62") pool.push(...byVendor[v]);
      });
      const target = normalize(name);
      let hit = pool.find((p) => normalize(p.name) === target);
      if (!hit)
        hit = pool.find((p) => {
          const n = normalize(p.name);
          return n.includes(target) || target.includes(n);
        });
      return hit ? hit.qty : null;
    }
    function effName(r) {
      return (r.manualName || r.name || "").trim();
    }
    function effQty(r) {
      return r.manualQty != null ? r.manualQty : r.qty;
    }

    function render() {
      const rows = (window.__lots62FailedRows || [])
        .slice()
        .sort((a, b) => effName(a).localeCompare(effName(b), undefined, { sensitivity: "base" }));
      window.__lots62FailedRows = rows;
      const body = document.getElementById("lots62FailedBody");
      const wrap = document.getElementById("lots62FailedResultsWrap");
      if (!body || !wrap) return;
      body.innerHTML = rows
        .map((r, idx) => {
          const nameCell = r.name
            ? escapeHtml(r.name)
            : `<input type="text" class="qty-input lots62-manual-name2" data-idx="${idx}" placeholder="Enter product name" value="${escapeHtml(r.manualName || "")}" style="width:100%;">`;
          const qty = effQty(r);
          const qtyCell =
            qty != null
              ? escapeHtml(String(qty))
              : `<input type="number" min="0" class="qty-input lots62-manual-qty2" data-idx="${idx}" placeholder="Qty" value="" style="width:70px;">`;
          const needsAttention = !r.name || qty == null;
          return `<tr${needsAttention ? ' style="background:rgba(212,145,55,.08);"' : ""}>
          <td>${nameCell}</td><td>${qtyCell}</td><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.reason || "—")}</td>
        </tr>`;
        })
        .join("");
      wrap.style.display = "block";
      body.querySelectorAll(".lots62-manual-name2").forEach((el) => {
        el.addEventListener("input", (e) => {
          const i = +e.target.dataset.idx;
          if (rows[i]) rows[i].manualName = e.target.value;
        });
        el.addEventListener("blur", () => {
          rows.forEach((r) => {
            if (!r.name && r.manualName && r.qty == null && r.manualQty == null) r.qty = findQty(r.manualName);
          });
          render();
        });
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.target.blur();
          }
        });
      });
      body.querySelectorAll(".lots62-manual-qty2").forEach((el) => {
        el.addEventListener("input", (e) => {
          const i = +e.target.dataset.idx;
          const v = e.target.value.trim();
          if (rows[i]) rows[i].manualQty = v === "" ? null : Number(v);
        });
        el.addEventListener("blur", render);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.target.blur();
          }
        });
      });
    }

    async function processOneFile(file) {
      const wb = await readWorkbook(file);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (!data.length) return [];
      const header = data[0].map((h) =>
        String(h || "")
          .trim()
          .toLowerCase(),
      );
      const codeIdx = header.findIndex((h) => h.includes("product code") || h.includes("item code") || h === "code");
      const reasonIdx = header.findIndex((h) => h.includes("reason") || h.includes("failure"));
      if (codeIdx === -1) throw new Error('Could not find a "Product Code" column in ' + file.name);
      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!r) continue;
        const code = r[codeIdx] != null ? String(r[codeIdx]).trim() : "";
        if (!code) continue;
        const reason = reasonIdx !== -1 && r[reasonIdx] != null ? String(r[reasonIdx]).trim() : "";
        const name = findName(code);
        const qty = findQty(name);
        rows.push({ code, name, manualName: null, qty, manualQty: null, reason });
      }
      return rows;
    }

    input.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const statusEl = document.getElementById("lots62FailedStatus");
      statusEl.textContent = `Reading ${files.length} file(s)…`;
      const merged = {};
      (window.__lots62FailedRows || []).forEach((r) => {
        merged[r.code] = r;
      });
      let failedFiles = [];
      for (const file of files) {
        try {
          const rows = await processOneFile(file);
          rows.forEach((r) => {
            merged[r.code] = r;
          });
        } catch (err) {
          failedFiles.push(file.name + ": " + err.message);
        }
      }
      window.__lots62FailedRows = Object.values(merged);
      render();
      const all = window.__lots62FailedRows;
      const matched = all.filter((r) => effQty(r) != null).length;
      const missingName = all.filter((r) => !r.name).length;
      const missingQty = all.filter((r) => effQty(r) == null).length;
      let msg = `✓ ${files.length} file(s) processed — ${all.length} total item(s), ${matched} matched.`;
      if (missingName) msg += ` ${missingName} need a product name.`;
      if (missingQty) msg += ` ${missingQty} need a quantity.`;
      if (failedFiles.length) msg += ` ⚠ ${failedFiles.length} file(s) skipped (wrong format).`;
      statusEl.textContent = msg;
      e.target.value = "";
    });
  });
})();
/* ================= PERF FIX v3: stop OMS/LOTS/Zippy background sync from re-processing everything on every single update ================= */
(function () {
  function debounce(fn, wait) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn();
      }, wait);
    };
  }
  const HEAVY = {
    integrateOmsIntoMasterData: 600,
    rebuildOmsByAwbMap: 600,
    invalidateFlattenedZippyCache: 600,
    loadOmsOrdersIntoSelfShip: 600,
    renderOmsOrdersTable: 600,
    renderLossOrdersTab: 600,
    renderZippyShipmentsTable: 600,
    renderLotsProductsTable: 600,
    renderScans: 150,
  };
  window.__renderNow = window.__renderNow || {};
  Object.keys(HEAVY).forEach(function (name) {
    if (typeof window[name] !== "function") return;
    const original = window[name];
    window.__renderNow[name] = original; /* un-delayed version, used when a tab is opened */
    window[name] = debounce(original, HEAVY[name]);
  });
})();
/* ================= PERF FIX v7: LOTS catalog / Master Mapping / Shared Docs — fetch once when you open that tab, instead of a live connection running all day ================= */
(function () {
  window.startLotsCatalogSync = function () {
    if (!fbDb) return;
    fbDb
      .collection("aikm_admin")
      .doc("lotsCatalog")
      .collection("chunks")
      .get()
      .then(function (snap) {
        lotsChunksCache = {};
        snap.docs.forEach(function (d) {
          lotsChunksCache[d.id] = d.data().products || [];
        });
        const t = Object.values(lotsChunksCache).flat();
        if (!t.length) return;
        t.forEach(function (e) {
          e.slabs &&
            e.slabs.forEach(function (s) {
              if (s.max === null) s.max = 1 / 0;
            });
        });
        const n = new Date().toISOString();
        try {
          localStorage.setItem(VENDOR_STORE_KEY, JSON.stringify({ products: t, fileLabel: "(synced)", savedAt: n }));
        } catch (e) {}
        lotsVendor.products = t;
        lotsVendor.prepped = t.map(function (e) {
          return Object.assign({}, prepProduct(e.name), {
            code: e.code,
            brand: e.brand || null,
            barcode: e.barcode || null,
            asin: e.asin || null,
            sellerSku: e.sellerSku || null,
          });
        });
        if (typeof rebuildAllPrepped === "function") rebuildAllPrepped();
        if (typeof clearSpapiMatchCache === "function") clearSpapiMatchCache();
        if (typeof renderLotsRow === "function") renderLotsRow();
        if (typeof checkReady === "function") checkReady();
        if (typeof checkLotsPriceTrend === "function") checkLotsPriceTrend(t);
      })
      .catch(function (e) {
        console.warn("LOTS catalog fetch error", e);
      });
  };

  window.startMasterMappingSync = function () {
    if (!fbDb) return;
    fbDb
      .collection("aikm_admin")
      .doc("masterMapping")
      .collection("chunks")
      .get()
      .then(function (snap) {
        masterMappingChunksCache = {};
        snap.docs.forEach(function (d) {
          masterMappingChunksCache[d.id] = d.data().map || {};
        });
        const t = Object.assign.apply(Object, [{}].concat(Object.values(masterMappingChunksCache)));
        if (!Object.keys(t).length) return;
        const learned = loadLearned();
        const merged = Object.assign({}, learned, t);
        Object.keys(learned).forEach(function (k) {
          if (t[k] && learned[k].savedAt > t[k].savedAt) merged[k] = learned[k];
        });
        saveLearned(merged);
        if (typeof clearSpapiMatchCache === "function") clearSpapiMatchCache();
        const statusEl = document.getElementById("masterMappingSyncStatus");
        if (statusEl) {
          statusEl.textContent = "✓ Synced " + new Date().toLocaleTimeString();
          statusEl.style.color = "var(--om-green,#1f8a4c)";
        }
        if (typeof renderMasterMapping === "function") renderMasterMapping();
        if (typeof checkReady === "function") checkReady();
      })
      .catch(function (e) {
        console.warn("Master Mapping fetch error", e);
      });
  };

  window.startSharedDocsSync = function () {
    if (!fbDb) return;
    fbDb
      .collection("sharedDocuments")
      .orderBy("uploadedAt", "desc")
      .get()
      .then(function (snap) {
        sharedDocsRaw = snap.docs.map(function (d) {
          return Object.assign({ id: d.id }, d.data());
        });
        const el = document.getElementById("docsLastSynced");
        if (el)
          el.textContent = sharedDocsRaw.length
            ? sharedDocsRaw.length + " document" + (sharedDocsRaw.length === 1 ? "" : "s")
            : "No documents yet";
        if (typeof renderSharedDocs === "function") renderSharedDocs();
      })
      .catch(function (e) {
        console.warn("Shared documents fetch error", e);
      });
  };

  let lotsStarted = false,
    mappingStarted = false,
    docsStarted = false;
  document.querySelectorAll(".tabbtn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tab = btn.dataset.tab;
      if (tab === "lotsproducts" || tab === "ordermapper") {
        if (!lotsStarted) {
          lotsStarted = true;
          startLotsCatalogSync();
        }
        if (!mappingStarted) {
          mappingStarted = true;
          startMasterMappingSync();
        }
      }
      if (tab === "documents" && !docsStarted) {
        docsStarted = true;
        startSharedDocsSync();
      }
    });
  });
})();

/* ================= REAL FIX: cache OMS lookup map for courier scans (was rebuilding it from scratch on every render) + debounce saveAll ================= */
(function () {
  // --- OMS lookup cache: only rebuild when the underlying OMS data actually changes ---
  let __scanOmsCache = null;
  let __scanOmsCacheFor = null;
  function getCachedOmsLookup() {
    const raw = window.omsOrdersRaw;
    if (__scanOmsCache && __scanOmsCacheFor === raw) return __scanOmsCache;
    __scanOmsCache = buildOmsAwbLookupMap();
    __scanOmsCacheFor = raw;
    return __scanOmsCache;
  }
  if (typeof renderScans === "function") {
    window.renderScans = function () {
      const scanTable = document.getElementById("scanTable");
      if (scanTable && !scanTable.closest(".table-scroll")) {
        const wrap = document.createElement("div");
        wrap.className = "table-scroll";
        wrap.style.maxHeight = "360px";
        scanTable.parentNode.insertBefore(wrap, scanTable);
        wrap.appendChild(scanTable);
      }
      const scanBody = document.getElementById("scanBody");
      const sorted = courierScans.slice().sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
      if (!courierScans.length) {
        scanTable.style.display = "none";
        scanBody.innerHTML = "";
      } else {
        scanTable.style.display = "table";
        const lookup = getCachedOmsLookup();
        scanBody.innerHTML = sorted
          .map((s, i) => {
            const info = lookupOmsInfoByAwb(s.awb, lookup);
            const label = courierGroupLabels[s.groupKey] || s.groupKey;
            const color = colorForCourier(label);
            return `<tr style="background:${hexToRgba(color, 0.07)};">
            <td style="padding:3px 6px;">${i + 1}</td>
            <td style="padding:3px 6px;">${escapeHtml(s.awb)}</td>
            <td style="padding:3px 6px;font-weight:700;color:${color};">${escapeHtml(label)}</td>
            <td style="padding:3px 6px;">${escapeHtml(info.channel)}</td>
            <td style="padding:3px 6px;">${escapeHtml(info.orderDate)}</td>
            <td style="padding:3px 6px;"><button type="button" class="scan-del-btn" onclick="deleteScan('${s.awb.replace(/'/g, "\\'")}')" title="Delete this scan">🗑</button></td>
          </tr>`;
          })
          .join("");
      }
      const groupEditorEl = document.getElementById("groupEditor");
      const activeGroups = Object.keys(courierGroupLabels).filter((g) => courierScans.some((s) => s.groupKey === g));
      const allNames = allKnownCourierNames();
      if (activeGroups.length) {
        groupEditorEl.innerHTML =
          '<table class="data" style="margin-top:10px;"><thead><tr><th>Prefix</th><th>Count</th><th>Courier</th><th></th></tr></thead><tbody>' +
          activeGroups
            .map((g) => {
              const count = courierScans.filter((s) => s.groupKey === g).length;
              const name = courierGroupLabels[g];
              const options = allNames.includes(name) ? allNames : [name, ...allNames];
              return `<tr><td>${escapeHtml(g)}</td><td>${count}</td><td>
              <select class="courier-name-select" onchange="handleCourierDropdown('${g.replace(/'/g, "\\'")}', this)" style="width:100%;">
                ${options.map((o) => `<option value="${escapeHtml(o)}" ${o === name ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
                <option value="__add_new__">+ Add new courier…</option>
              </select>
            </td><td><button type="button" class="scan-del-btn" onclick="deleteCourierPrefix('${g.replace(/'/g, "\\'")}')" title="Forget this saved courier name — synced everywhere, including deletion">🗑</button></td></tr>`;
            })
            .join("") +
          "</tbody></table>";
      } else {
        groupEditorEl.innerHTML = "";
      }
      renderMasterPrefixMapper();
    };
  }

  // --- debounce saveAll: rendering already happens instantly before saveAll() runs in every caller, so this only delays the invisible disk/network write ---
  if (typeof saveAll === "function") {
    const _origSaveAll = saveAll;
    let saveTimer = null;
    function flushSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
      _origSaveAll();
    }
    window.saveAll = function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 500);
    };
    window.addEventListener("beforeunload", flushSave);
  }
})();
/* ================= Make tab switching feel instant: show the tab switch first, fill in the table a moment later ================= */
(function () {
  const DEFERRED = [
    "renderLossOrdersTab",
    "renderOmsOrdersTable",
    "renderZippyShipmentsTable",
    "renderLotsProductsTable",
    "renderSpapiOrdersTable",
    "renderSpapiInventoryTable",
    "renderSpapiPricingTable",
  ];
  DEFERRED.forEach(function (name) {
    if (typeof window[name] !== "function") return;
    const original = window[name];
    window[name] = function () {
      const args = arguments;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          original.apply(this, args);
        });
      });
    };
  });
})();

/* ================= FIX (Sep 2026): draw OMS Orders / Loss Orders / LOTS Products as soon as their tab is opened ================= */
(function () {
  const ON_OPEN = { omsorders: "renderOmsOrdersTable", lossorders: "renderLossOrdersTab", lotsproducts: "renderLotsProductsTable" };
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".tabbtn[data-tab]");
    if (!btn) return;
    const fn = ON_OPEN[btn.dataset.tab];
    if (!fn) return;
    setTimeout(function () {
      const f = (window.__renderNow && window.__renderNow[fn]) || window[fn];
      if (typeof f === "function") {
        try { f(); } catch (err) { console.warn(fn + " failed:", err); }
      }
    }, 0);
  });
})();
/* ---- Courier intelligence core (pure functions — also unit-tested in Node) ---- */
var CourierCore = (function () {
  const CANON_RULES = [
    [/^(ats|amazon|amzn)/, "Amazon Shipping"],
    [/(valmo|meesho)/, "Valmo"],
    [/delhivery/, "Delhivery"],
    [/(xpress\s*bees|xpressbees|^xb\b|^xb[\s_-])/, "Xpressbees"],
    [/shadow\s*fax/, "Shadowfax"],
    [/dtdc/, "DTDC"],
    [/(ekart|flipkart)/, "Ekart"],
    [/blue\s*dart/, "Bluedart"],
    [/ecom\s*express|ecom\s*xpress/, "Ecom Express"],
    [/india\s*post|speed\s*post/, "India Post"],
    [/shree\s*maruti/, "Shree Maruti"],
    [/trackon/, "Trackon"],
    [/professional/, "Professional Couriers"],
  ];
  /* Clean up courier names that OMS / people type in many ways ("ATS", "Amazon 250_Stressed", "XB DS 500g", "MEESHO_LOGISTICS"…) */
  function canon(raw) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[_]+/g, " ");
    if (!s || s === "unknown" || s === "—") return "";
    for (const [re, name] of CANON_RULES) if (re.test(s)) return name;
    const first = String(raw).split(",")[0].trim();
    return first.replace(/[_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function clean(awb) {
    return String(awb || "")
      .trim()
      .replace(/^`+/, "")
      .replace(/\s+/g, "")
      .toUpperCase();
  }
  /* "Series" keys for an AWB, most specific first. Only letters/digits/underscore so they are safe cloud field names. */
  function seriesKeys(awb) {
    const a = clean(awb);
    if (a.length < 6) return [];
    const keys = [];
    for (const k of [7, 6, 5, 4, 3]) if (a.length > k + 3) keys.push("P_" + a.slice(0, k) + "_" + a.length);
    const lead = a.match(/^[A-Z]{2,5}/);
    if (lead) keys.push("L_" + lead[0]);
    return keys.filter((k) => /^[A-Z0-9_]+$/.test(k));
  }
  function describeKey(k) {
    let m = k.match(/^P_([A-Z0-9]+)_(\d+)$/);
    if (m) return { series: m[1] + "…", detail: m[2] + " characters" };
    m = k.match(/^L_([A-Z]+)$/);
    if (m) return { series: m[1] + "…", detail: "any length" };
    return { series: k, detail: "" };
  }
  /* Learn series → courier from OMS orders. Returns {key:{c,n}} for keys where one courier clearly dominates. */
  function learn(orders) {
    const tally = {};
    (orders || []).forEach((o) => {
      const c = canon(o && o.courier);
      const a = clean(o && o.awb);
      if (!c || !a) return;
      seriesKeys(a).forEach((k) => {
        const t = tally[k] || (tally[k] = {});
        t[c] = (t[c] || 0) + 1;
      });
    });
    const out = {};
    Object.keys(tally).forEach((k) => {
      const t = tally[k];
      const names = Object.keys(t);
      const total = names.reduce((s, n) => s + t[n], 0);
      names.sort((x, y) => t[y] - t[x]);
      const top = names[0];
      if (t[top] >= 3 && t[top] / total >= 0.97) out[k] = { c: top, n: t[top] };
      else if (names.length > 1) out[k] = { c: "", n: total, conflict: 1 };
    });
    return out;
  }
  /* Look an AWB up in series memory (manual entries win over learned ones at the same level). */
  function fromMemory(awb, series) {
    for (const k of seriesKeys(awb)) {
      const v = series && series[k];
      if (!v) continue;
      if (v.conflict && v.src !== "manual") return null; // this series is shared by several couriers — don't guess
      if (v.c) return { courier: v.c, key: k, src: v.src === "manual" ? "manual" : "learned" };
    }
    return null;
  }
  return { canon, clean, seriesKeys, describeKey, learn, fromMemory };
})();
/* ================= COURIER INTELLIGENCE (Sep 2026) =================
   Every scanned AWB gets its courier automatically:
     1. from the matching OMS Guru order (exact AWB match), else
     2. from Courier Memory — AWB "series" the tool has learned from all past OMS orders
        (e.g. "SF4…" → Shadowfax, "3725… 12 digits" → Amazon Shipping), saved in the cloud, else
     3. from the built-in rules, else
     4. it is marked "Needs courier" — name it once and the series is remembered for good.
   Handover sheets are grouped by real courier name. No more manual prefix mapping. */
(function () {
  if (typeof courierScans === "undefined" || typeof CourierCore === "undefined") return;
  const UNKNOWN = "Needs courier";
  const LS_KEY = "aikm_courier_memory_v1";
  const CLOUD_DOC = "courierMemory";
  let mem = { series: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (raw && raw.series) mem = raw;
  } catch (e) {}
  const pendingPush = {};
  let pushTimer = null;
  function saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(mem));
    } catch (e) {}
  }
  function queuePush(key) {
    pendingPush[key] = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 3000);
  }
  async function flushPush() {
    if (typeof fbDb === "undefined" || !fbDb) return;
    const keys = Object.keys(pendingPush);
    if (!keys.length) return;
    const patch = {};
    keys.forEach((k) => {
      patch[k] = mem.series[k] || { c: "", del: 1, src: "manual", at: Date.now() };
      delete pendingPush[k];
    });
    try {
      await fbDb
        .collection("aikm_admin")
        .doc(CLOUD_DOC)
        .set({ series: patch, savedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn("Courier memory cloud save failed (kept on this device):", e);
      keys.forEach((k) => (pendingPush[k] = true));
    }
  }
  window.addEventListener("beforeunload", flushPush);

  /* ---- cloud: one small document, live across devices ---- */
  let cloudStarted = false;
  function startCloud() {
    if (cloudStarted || typeof fbDb === "undefined" || !fbDb) return;
    cloudStarted = true;
    fbDb
      .collection("aikm_admin")
      .doc(CLOUD_DOC)
      .onSnapshot(
        (doc) => {
          if (!doc.exists) {
            Object.keys(mem.series).forEach(queuePush);
            return;
          }
          const s = (doc.data() || {}).series || {};
          let changed = false;
          Object.keys(s).forEach((k) => {
            const v = s[k];
            if (v && v.del) {
              if (mem.series[k] && mem.series[k].src === "manual") {
                delete mem.series[k];
                changed = true;
              }
              return;
            }
            const cur = mem.series[k];
            if (!cur || cur.c !== v.c || cur.src !== v.src) {
              mem.series[k] = v;
              changed = true;
            }
          });
          Object.keys(mem.series).forEach((k) => {
            if (!(k in s)) queuePush(k);
          });
          if (changed) {
            saveLocal();
            refresh();
          }
        },
        (e) => console.warn("Courier memory sync error", e),
      );
  }
  const cloudPoll = setInterval(() => {
    startCloud();
    if (cloudStarted) clearInterval(cloudPoll);
  }, 1500);
  setTimeout(() => clearInterval(cloudPoll), 60000);

  /* ---- learn from OMS whenever new OMS data arrives ---- */
  let learnedFrom = null;
  function maybeLearn() {
    const oms = window.omsOrdersRaw;
    if (!oms || !oms.length || oms === learnedFrom) return;
    learnedFrom = oms;
    const fresh = CourierCore.learn(oms);
    Object.keys(fresh).forEach((k) => {
      const cur = mem.series[k];
      if (cur && cur.src === "manual") return; // your own answers always win
      const v = fresh[k];
      if (!cur || cur.c !== v.c || !!cur.conflict !== !!v.conflict) {
        mem.series[k] = { c: v.c, n: v.n, src: "oms", at: Date.now(), ...(v.conflict ? { conflict: 1 } : {}) };
        queuePush(k);
      } else cur.n = Math.max(cur.n || 0, v.n);
    });
    saveLocal();
  }

  /* ---- OMS lookup (cached per OMS data version) ---- */
  let omsLookup = null,
    omsLookupFor = null;
  function omsOrderFor(awb) {
    const raw = window.omsOrdersRaw;
    if (!raw || !raw.length) return null;
    if (omsLookupFor !== raw) {
      omsLookup = buildOmsAwbLookupMap();
      omsLookup.orderNo = new Map();
      raw.forEach((o) => {
        const k = String(o.channelOrderId || "").trim().toUpperCase();
        if (k && !omsLookup.orderNo.has(k)) omsLookup.orderNo.set(k, o);
      });
      omsLookupFor = raw;
    }
    const n = String(awb || "").trim(),
      d = n.replace(/\D/g, "");
    let r = omsLookup.exact.get(n) || omsLookup.exact.get(n.toUpperCase());
    if (!r && d) r = omsLookup.digits.get(d);
    if (!r && d.length >= 8 && !/-/.test(n)) r = omsLookup.suffix8.get(d.slice(-8));
    if (!r) r = omsLookup.orderNo.get(n.toUpperCase()) || null; /* an order number was scanned instead of the AWB */
    return r || null;
  }

  function cancelInfo(awb) {
    const o = omsOrderFor(awb);
    if (!o || !/cancel/i.test(String(o.status || ""))) return null;
    return { status: o.status, order: o.channelOrderId || "", product: o.productName || "" };
  }
  window.__cxCancelInfo = cancelInfo;
  function resolveCourier(awb) {
    const o = omsOrderFor(awb);
    if (o) {
      const c = CourierCore.canon(o.courier);
      if (c) return { courier: c, src: "oms" };
    }
    const m = CourierCore.fromMemory(awb, mem.series);
    if (m) return m;
    const a = CourierCore.clean(awb);
    for (const r of typeof COURIER_RULES !== "undefined" ? COURIER_RULES : [])
      if (r.test.test(a)) return { courier: CourierCore.canon(r.name) || r.name, src: "rule" };
    const legacyKey = detectGroupKey(a);
    const legacy = courierGroupLabels[legacyKey] || DEFAULT_PREFIXES[legacyKey];
    if (legacy && legacy !== legacyKey && legacy !== UNKNOWN) return { courier: CourierCore.canon(legacy) || legacy, src: "manual" };
    return null;
  }
  window.resolveCourierForAwb = resolveCourier;

  function rememberManual(awb, name) {
    const keys = CourierCore.seriesKeys(awb);
    if (!keys.length || !name) return;
    const lead = keys.find((k) => k.startsWith("L_"));
    const numeric = keys.find((k) => /^P_[A-Z0-9]{4}_\d+$/.test(k)) || keys[keys.length - (lead ? 2 : 1)];
    [numeric, lead].filter(Boolean).forEach((k) => {
      mem.series[k] = { c: name, n: 1, src: "manual", at: Date.now() };
      queuePush(k);
    });
    saveLocal();
  }
  function forgetManual(key) {
    if (!mem.series[key] || mem.series[key].src !== "manual") return;
    delete mem.series[key];
    queuePush(key);
    saveLocal();
    learnedFrom = null;
    refresh();
  }
  window.forgetCourierSeries = async function (key) {
    const d = CourierCore.describeKey(key);
    const ok = await askPremiumConfirm({
      kicker: "Courier Memory",
      title: `Forget series "${escapeHtml(d.series)}"`,
      message: `AWBs in this series will be identified from OMS again, or you'll be asked once.`,
      confirmLabel: "Forget",
    });
    if (ok) forgetManual(key);
  };

  /* ---- keep existing scans correct (OMS arrives after scanning, memory learns, etc.) ---- */
  let resolving = false;
  function reResolve() {
    if (resolving) return false;
    resolving = true;
    let changed = false;
    try {
      courierScans.forEach((s) => {
        if (s.pinned) return;
        const r = resolveCourier(s.awb);
        const name = r ? r.courier : courierGroupLabels[s.groupKey] && courierGroupLabels[s.groupKey] !== s.groupKey ? courierGroupLabels[s.groupKey] : isCourierName(s.groupKey) ? s.groupKey : UNKNOWN;
        s._src = r ? r.src : s.groupKey === UNKNOWN || name === UNKNOWN ? "unknown" : "manual";
        if (name !== s.groupKey) {
          s.groupKey = name;
          changed = true;
          if (typeof courierScansConfirmedSynced !== "undefined") courierScansConfirmedSynced.delete(s.awb);
        }
        courierGroupLabels[name] = name;
      });
    } finally {
      resolving = false;
    }
    return changed;
  }
  function isCourierName(k) {
    return !!k && k !== UNKNOWN && CourierCore.canon(k) === k && !/^\d+$/.test(k) && k.length > 3;
  }

  /* ---- scanning ---- */
  window.addScan = async function (awbRaw, opts) {
    opts = opts || {};
    const e = String(awbRaw || "").trim().replace(/^`+/, "");
    if (!e) return false;
    const dup = courierScans.find((s) => s.awb === e);
    if (dup) {
      if (opts.silent) return false;
      if (!(await askDuplicateConfirm(e, dup))) return false;
    }
    const ci = cancelInfo(e);
    if (ci && !opts.silent) {
      const keep = await askPremiumConfirm({
        kicker: "⚠ Cancelled order",
        title: escapeHtml(e),
        message: `OMS status: ${ci.status}\nOrder ${ci.order}${ci.product ? " · " + ci.product : ""}\n\nThis parcel should NOT be handed over to the courier.`,
        confirmLabel: "Add anyway",
        cancelLabel: "Don't add",
      });
      if (!keep) {
        cxToast("Not added — " + e + " is cancelled", true);
        return false;
      }
      cancelNotified.add(e);
    }
    const r = resolveCourier(e);
    let name = r ? r.courier : "",
      src = r ? r.src : "unknown";
    if (!name && !opts.silent) {
      const label = CourierCore.describeKey(CourierCore.seriesKeys(e).find((k) => /^P_[A-Z0-9]{4}_/.test(k)) || "").series || e;
      const ans = await askCourierName(label);
      if (ans && ans !== label) {
        name = CourierCore.canon(ans) || ans.trim();
        src = "manual";
        rememberManual(e, name);
      }
    }
    if (!name) name = UNKNOWN;
    courierScans.push({ awb: e, groupKey: name, date: todayStr(), scannedAt: Date.now() });
    courierGroupLabels[name] = name;
    if (!opts.silent) {
      renderScans();
      generate();
      saveAll();
      if (src === "manual") refresh();
    }
    return true;
  };

  window.setScanCourier = async function (awb) {
    const s = courierScans.find((x) => x.awb === awb);
    if (!s) return;
    ensureTextPromptModal();
    const inp = document.getElementById("premiumPromptInput");
    inp && inp.setAttribute("list", "courierNames");
    const ans = await askTextPrompt({
      kicker: "Set courier",
      title: escapeHtml(awb),
      message: "Type the courier name. Every AWB in this series will use it from now on — on every device.",
      placeholder: "e.g. Delhivery",
      defaultValue: s.groupKey === UNKNOWN ? "" : s.groupKey,
      confirmLabel: "Save & remember",
    });
    inp && inp.removeAttribute("list");
    if (!ans) return;
    const name = CourierCore.canon(ans) || ans.trim();
    rememberManual(awb, name);
    s.groupKey = name;
    s.pinned = true;
    if (typeof courierScansConfirmedSynced !== "undefined") courierScansConfirmedSynced.delete(awb);
    courierGroupLabels[name] = name;
    refresh();
    if (typeof fbDb !== "undefined" && fbDb && typeof pushCourierScansToCloud === "function") pushCourierScansToCloud().catch(function () {});
  };

  /* ---- UI ---- */
  const DOTS = ["#D4AF37", "#3FB57A", "#6E9BFF", "#F0787A", "#A98BFF", "#2FB8B8", "#F2A93B", "#E07BB5"];
  function dotColor(name) {
    if (name === UNKNOWN) return "#C98A0B";
    let t = 0;
    for (let i = 0; i < name.length; i++) t = (31 * t + name.charCodeAt(i)) | 0;
    return DOTS[Math.abs(t) % DOTS.length];
  }
  const SRC_LABEL = { oms: "OMS", learned: "Memory", manual: "Saved", rule: "Rule", unknown: "" };
  function chip(name, src, awb) {
    if (name === UNKNOWN)
      return `<button type="button" class="cx-chip cx-chip-warn" onclick="setScanCourier('${awb.replace(/'/g, "\\'")}')"><i class="ti ti-alert-triangle"></i>Set courier</button>`;
    const col = dotColor(name);
    const tag = SRC_LABEL[src] ? `<span class="cx-src cx-src-${src}">${SRC_LABEL[src]}</span>` : "";
    return `<span class="cx-chip" style="--cx:${col}"><span class="cx-dot"></span>${escapeHtml(name)}</span>${tag}`;
  }
  function ensureKpis() {
    let k = document.getElementById("cxKpis");
    if (k) return k;
    const tab = document.getElementById("tab-courier");
    if (!tab) return null;
    k = document.createElement("div");
    k.id = "cxKpis";
    k.className = "cx-kpis no-print";
    tab.insertBefore(k, tab.firstChild);
    return k;
  }
  function renderKpis(stats) {
    const k = ensureKpis();
    if (!k) return;
    const pct = stats.total ? Math.round((stats.auto / stats.total) * 100) : 100;
    k.innerHTML = `
      <div class="cx-kpi"><div class="cx-kpi-label">Scanned</div><div class="cx-kpi-num">${stats.total}</div><div class="cx-kpi-sub">AWBs in this batch</div></div>
      <div class="cx-kpi"><div class="cx-kpi-label">Couriers</div><div class="cx-kpi-num">${stats.couriers}</div><div class="cx-kpi-sub">handover sheets</div></div>
      <div class="cx-kpi"><div class="cx-kpi-label">Auto-identified</div><div class="cx-kpi-num">${pct}%</div><div class="cx-kpi-sub">from OMS &amp; memory</div></div>
      <div class="cx-kpi ${stats.unknown ? "cx-kpi-warn" : ""}"><div class="cx-kpi-label">Needs courier</div><div class="cx-kpi-num">${stats.unknown}</div><div class="cx-kpi-sub">${stats.unknown ? "click “Set courier” in the list" : "all identified"}</div></div>
      <div class="cx-kpi ${stats.cancelled ? "cx-kpi-danger" : ""}"><div class="cx-kpi-label">Cancelled in OMS</div><div class="cx-kpi-num">${stats.cancelled}</div><div class="cx-kpi-sub">${stats.cancelled ? "do not hand over — shown in red" : "none"}</div></div>`;
  }

  window.renderScans = function () {
    const changed = reResolve();
    const table = document.getElementById("scanTable");
    if (table && !table.closest(".table-scroll")) {
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      wrap.style.maxHeight = "420px";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    const body = document.getElementById("scanBody");
    const sorted = courierScans.slice().sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
    const counts = {};
    let auto = 0,
      unknown = 0;
    courierScans.forEach((s) => {
      counts[s.groupKey] = (counts[s.groupKey] || 0) + 1;
      if (s.groupKey === UNKNOWN) unknown++;
      else if (s._src === "oms" || s._src === "learned" || s._src === "rule") auto++;
    });
    if (table && body) {
      if (!courierScans.length) {
        table.style.display = "none";
        body.innerHTML = "";
      } else {
        table.style.display = "table";
        body.innerHTML = sorted
          .map((s, i) => {
            const o = omsOrderFor(s.awb);
            const ci = cancelInfo(s.awb);
            return `<tr${ci ? ' class="cx-row-cancel"' : s.groupKey === UNKNOWN ? ' class="cx-row-warn"' : ""}>
            <td class="cx-num">${i + 1}</td>
            <td><div class="cx-awb">${escapeHtml(s.awb)}</div><div class="cx-when">${s.scannedAt ? new Date(s.scannedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div></td>
            <td>${chip(s.groupKey, s._src, s.awb)}${ci ? `<div class="cx-cancel-tag"><i class="ti ti-ban"></i> ${escapeHtml(ci.status)}</div>` : ""}</td>
            <td>${escapeHtml((o && o.channel) || "—")}</td>
            <td class="cx-muted">${escapeHtml((o && o.orderDate) || "—")}</td>
            <td style="text-align:right;white-space:nowrap;">${s.groupKey !== UNKNOWN ? `<button type="button" class="cx-icon-btn" title="Change courier" onclick="setScanCourier('${s.awb.replace(/'/g, "\\'")}')"><i class="ti ti-pencil"></i></button>` : ""}<button type="button" class="scan-del-btn" onclick="deleteScan('${s.awb.replace(/'/g, "\\'")}')" title="Remove this AWB from the list"><i class="ti ti-trash"></i></button></td>
          </tr>`;
          })
          .join("");
      }
    }
    const ge = document.getElementById("groupEditor");
    if (ge) {
      const names = Object.keys(counts).sort((a, b) => (a === UNKNOWN) - (b === UNKNOWN) || counts[b] - counts[a]);
      ge.innerHTML = names.length
        ? `<div class="cx-batch-title">This batch</div><div class="cx-batch">${names
            .map(
              (n) =>
                `<div class="cx-batch-row${n === UNKNOWN ? " cx-batch-warn" : ""}"><span class="cx-dot" style="--cx:${dotColor(n)}"></span><span class="cx-batch-name">${escapeHtml(n)}</span><span class="cx-batch-count">${counts[n]}</span></div>`,
            )
            .join("")}</div>`
        : "";
    }
    const cancelled = courierScans.filter((s) => cancelInfo(s.awb));
    renderKpis({ total: courierScans.length, couriers: Object.keys(counts).filter((n) => n !== UNKNOWN).length, auto, unknown, cancelled: cancelled.length });
    checkCancelled(cancelled);
    renderMemoryPanel();
    if (changed) {
      generate();
      /* only the changed courier scans are re-saved (small per-AWB records) — the big order data is not touched */
      clearTimeout(window.__cxPushTimer);
      window.__cxPushTimer = setTimeout(function () {
        if (typeof fbDb !== "undefined" && fbDb && typeof pushCourierScansToCloud === "function")
          pushCourierScansToCloud().catch(function (e) { console.warn("courier scan update failed", e); });
      }, 1500);
    }
  };

  let memOpen = false;
  window.toggleCourierMemory = function () {
    memOpen = !memOpen;
    renderMemoryPanel();
  };
  function renderMemoryPanel() {
    const el = document.getElementById("masterPrefixMapper");
    if (!el) return;
    const h = el.closest(".panel") && el.closest(".panel").querySelector("h2");
    if (h && !h.dataset.cx) {
      h.dataset.cx = "1";
      h.innerHTML = `<i class="ti ti-brain" style="color:var(--x-gold,#D4AF37);font-size:18px;"></i>Courier Memory <span style="font-size:12px;color:var(--muted);font-weight:400;">learned automatically from OMS orders · shared on every device</span>`;
    }
    const entries = Object.keys(mem.series).filter((k) => mem.series[k].c && !mem.series[k].conflict);
    const byCourier = {};
    entries.forEach((k) => {
      const c = mem.series[k].c;
      (byCourier[c] || (byCourier[c] = [])).push(k);
    });
    const manual = entries.filter((k) => mem.series[k].src === "manual");
    const couriers = Object.keys(byCourier).sort((a, b) => byCourier[b].length - byCourier[a].length);
    const top = couriers
      .map(
        (c) =>
          `<span class="cx-chip" style="--cx:${dotColor(c)}"><span class="cx-dot"></span>${escapeHtml(c)}</span>`,
      )
      .join("");
    let table = "";
    if (memOpen) {
      const rows = entries
        .filter((k) => mem.series[k].src === "manual" || /^P_[A-Z0-9]{4}_\d+$/.test(k) || k.startsWith("L_"))
        .sort((a, b) => (mem.series[a].src === "manual" ? 0 : 1) - (mem.series[b].src === "manual" ? 0 : 1) || mem.series[a].c.localeCompare(mem.series[b].c) || a.localeCompare(b));
      table = `<div class="table-scroll" style="max-height:320px;margin-top:12px;"><table class="data"><thead><tr><th>AWB series</th><th>Length</th><th>Courier</th><th>Learned from</th><th style="text-align:right;">Seen</th><th></th></tr></thead><tbody>${rows
        .map((k) => {
          const v = mem.series[k],
            d = CourierCore.describeKey(k);
          return `<tr><td class="cx-awb">${escapeHtml(d.series)}</td><td class="cx-muted">${escapeHtml(d.detail)}</td><td><span class="cx-chip" style="--cx:${dotColor(v.c)}"><span class="cx-dot"></span>${escapeHtml(v.c)}</span></td><td>${v.src === "manual" ? '<span class="cx-src cx-src-manual">Saved by you</span>' : '<span class="cx-src cx-src-learned">OMS orders</span>'}</td><td style="text-align:right;" class="cx-muted">${v.n || 1}</td><td style="text-align:right;">${v.src === "manual" ? `<button type="button" class="scan-del-btn" title="Forget" onclick="forgetCourierSeries('${k}')"><i class="ti ti-trash"></i></button>` : ""}</td></tr>`;
        })
        .join("")}</tbody></table></div>`;
    }
    el.innerHTML = `<div class="cx-mem-head"><div class="cx-mem-stat"><b>${entries.length}</b> AWB series known · <b>${couriers.length}</b> couriers${manual.length ? ` · <b>${manual.length}</b> saved by you` : ""}</div><button type="button" class="secondary" onclick="toggleCourierMemory()">${memOpen ? "Hide series" : "View series"}</button></div><div class="cx-mem-chips">${top || '<small class="hint">Learning starts as soon as OMS orders load.</small>'}</div>${table}`;
  }
  /* ---- toast ---- */
  function cxToast(msg, warn) {
    let t = document.getElementById("mhToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "mhToast";
      t.className = "mh-toast no-print";
      document.body.appendChild(t);
    }
    t.textContent = (warn ? "⚠ " : "✓ ") + msg;
    t.classList.toggle("warn", !!warn);
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 3200);
  }
  window.cxToast = cxToast;

  /* ---- cancelled orders already in the list (bulk paste, or cancelled later in OMS) ---- */
  const NOTIFIED_KEY = "aikm_cancel_notified_v1";
  const cancelNotified = new Set(
    (function () {
      try {
        return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]");
      } catch (e) {
        return [];
      }
    })(),
  );
  let cancelPromptOpen = false;
  function checkCancelled(list) {
    if (cancelPromptOpen) return;
    const fresh = list.filter((s) => !cancelNotified.has(s.awb));
    if (!fresh.length) return;
    fresh.forEach((s) => cancelNotified.add(s.awb));
    try {
      const keep = new Set(courierScans.map((s) => s.awb));
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...cancelNotified].filter((a) => keep.has(a))));
    } catch (e) {}
    cancelPromptOpen = true;
    setTimeout(async () => {
      const lines = fresh.slice(0, 8).map((s) => { const c = cancelInfo(s.awb) || {}; return `• ${s.awb} — ${c.status || "Cancelled"}`; }).join("\n");
      const remove = await askPremiumConfirm({
        kicker: "⚠ Cancelled orders in this pickup",
        title: `${fresh.length} scanned AWB${fresh.length === 1 ? " is" : "s are"} cancelled in OMS`,
        message: lines + (fresh.length > 8 ? `\n…and ${fresh.length - 8} more` : "") + "\n\nThese parcels should not be handed over.",
        confirmLabel: fresh.length === 1 ? "Remove it" : "Remove them",
        cancelLabel: "Keep (shown in red)",
      });
      cancelPromptOpen = false;
      if (remove) removeAwbs(fresh.map((s) => s.awb));
    }, 60);
  }
  function removeAwbs(awbs) {
    const set = new Set(awbs);
    const before = courierScans.length;
    for (let i = courierScans.length - 1; i >= 0; i--) if (set.has(courierScans[i].awb)) courierScans.splice(i, 1);
    awbs.forEach((a) => deleteCourierScanFromCloud(a));
    renderScans();
    generate();
    saveAll();
    const n = before - courierScans.length;
    if (n) cxToast(`Removed ${n} AWB${n === 1 ? "" : "s"} from this pickup`);
  }
  window.removeCourierAwbs = removeAwbs;

  /* ---- "Remove a wrong AWB": scan it again here to take it out ---- */
  function ensureRemoveBox() {
    if (document.getElementById("cxRemoveInput")) return;
    const scanInput = document.getElementById("courierScanInput");
    const row = scanInput && scanInput.closest(".row");
    if (!row) return;
    const box = document.createElement("div");
    box.className = "cx-remove";
    box.innerHTML = '<div class="cx-remove-label"><i class="ti ti-circle-minus"></i> Remove a wrong AWB</div><input type="text" id="cxRemoveInput" placeholder="Scan or type the wrong AWB, then Enter" autocomplete="off">';
    row.after(box);
    box.querySelector("input").addEventListener("keydown", async function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = this.value.trim().replace(/^`+/, "");
      this.value = "";
      if (!v) return;
      const s = courierScans.find((x) => x.awb.toUpperCase() === v.toUpperCase());
      if (!s) return cxToast(v + " is not in this pickup list", true);
      removeAwbs([s.awb]);
      this.focus();
    });
  }

  /* ---- handover sheets: empty when the list is empty (on every system), cancelled AWBs marked ---- */
  const _generate = generate;
  generate = function () {
    const m = document.getElementById("manifest");
    if (!courierScans.length) {
      if (m) {
        m.innerHTML = "";
        m.style.display = "none";
      }
      window.__lastManifestGroups = {};
      return;
    }
    const out = _generate.apply(this, arguments);
    if (m)
      m.querySelectorAll(".awb-item").forEach((el) => {
        const awb = el.textContent.replace(/^\s*\d+\.\s*/, "").trim();
        if (cancelInfo(awb)) {
          el.classList.add("awb-cancel");
          el.insertAdjacentHTML("beforeend", ' <span class="awb-cancel-tag">CANCELLED</span>');
        }
      });
    return out;
  };
  window.generate = generate;

  function refresh() {
    try {
      renderScans();
      generate();
    } catch (e) {}
  }
  /* learn + re-check whenever OMS data changes (OMS listener already calls renderScans) */
  const _rs = window.renderScans;
  window.renderScans = function () {
    maybeLearn();
    return _rs.apply(this, arguments);
  };
  renderScans = window.renderScans;
  renderMasterPrefixMapper = renderMemoryPanel;
  window.renderMasterPrefixMapper = renderMemoryPanel;
  ensureRemoveBox();
  setTimeout(refresh, 0);
})();
/* ================= Cleanup (Sep 2026): hide leftovers of features no longer used ================= */
(function () {
  function hideZippyInSelfShip() {
    const z = document.getElementById("fsStatZippy");
    if (z) {
      const col = z.closest('div[style*="flex:1"]');
      if (col) {
        const sep = col.previousElementSibling;
        col.style.display = "none";
        if (sep && sep.style && sep.style.width === "1px") sep.style.display = "none";
      }
    }
    const f2 = document.getElementById("drop2");
    const card = f2 && f2.closest(".card");
    if (card) card.style.display = "none";
  }
  hideZippyInSelfShip();
  document.addEventListener("DOMContentLoaded", hideZippyInSelfShip);
  setTimeout(hideZippyInSelfShip, 1500);
})();
/* ================= DOCUMENTS v2 (Sep 2026): files up to 50 MB, visible on every system =================
   Each file is split into 1 MB pieces stored in the cloud (collection "sharedDocChunks").
   The list itself only loads names/sizes (tiny), so opening the tab is instant; the file's pieces
   are downloaded only when someone clicks Download — no slowdown for anyone else. */
(function () {
  const MAX_FILE = 50 * 1024 * 1024; /* 50 MB per file */
  const SPACE_LIMIT = 600 * 1024 * 1024; /* keeps the free cloud database (1 GB) safe for order data */
  const CHUNK = 1000000; /* bytes per cloud piece (cloud limit is 1 MB per record) */
  const PARALLEL = 3;
  let docsUnsub = null;
  let busy = 0;
  const progress = {}; /* id → {label, pct} */

  function fmtSize(b) {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }
  function sizeOf(d) {
    return d.size || (d.sizeKB ? d.sizeKB * 1024 : 0);
  }
  function iconFor(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    if (ext === "pdf") return ["ti-file-type-pdf", "#E5484D"];
    if (["xls", "xlsx", "csv"].includes(ext)) return ["ti-file-spreadsheet", "#2FA36B"];
    if (["doc", "docx"].includes(ext)) return ["ti-file-text", "#3E7BFA"];
    if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return ["ti-photo", "#A66CFF"];
    if (["mp4", "mov", "avi", "mkv"].includes(ext)) return ["ti-movie", "#E08A1E"];
    if (["zip", "rar", "7z"].includes(ext)) return ["ti-file-zip", "#8A94A6"];
    return ["ti-file", "#8A94A6"];
  }
  function setStatus(msg) {
    const t = document.getElementById("docUploadStatus");
    if (t) t.textContent = msg || "";
  }

  window.startSharedDocsSync = function () {
    if (typeof fbDb === "undefined" || !fbDb || docsUnsub) return;
    docsUnsub = fbDb
      .collection("sharedDocuments")
      .orderBy("uploadedAt", "desc")
      .onSnapshot(
        (snap) => {
          sharedDocsRaw = snap.docs
            .map((d) => Object.assign({ id: d.id }, d.data()))
            .filter((d) => d.status !== "uploading");
          const el = document.getElementById("docsLastSynced");
          if (el) el.textContent = sharedDocsRaw.length ? sharedDocsRaw.length + " document" + (sharedDocsRaw.length === 1 ? "" : "s") : "No documents yet";
          renderSharedDocs();
        },
        (e) => console.warn("Shared documents sync error", e),
      );
  };

  function ensureShell() {
    const panel = document.getElementById("docsList") && document.getElementById("docsList").closest(".panel");
    if (!panel || panel.dataset.dx) return panel;
    panel.dataset.dx = "1";
    const h = panel.querySelector("h2");
    if (h) h.innerHTML = 'Shared Documents <span id="docsCount" style="font-size:12px;color:var(--muted);font-weight:400;"></span>';
    const hint = panel.querySelector("small.hint");
    if (hint) hint.textContent = "Files here are visible and downloadable on every system. Up to 50 MB per file — PDFs, Excel, Word, images, short videos.";
    const inp = document.getElementById("docUploadInput");
    if (inp) inp.setAttribute("multiple", "");
    const row = inp && inp.closest(".row");
    if (row) {
      const dz = document.createElement("label");
      dz.className = "dx-drop";
      dz.id = "dxDrop";
      dz.innerHTML = '<i class="ti ti-cloud-upload"></i><div class="dx-drop-main">Drop files here or <u>browse</u></div><div class="dx-drop-sub">Up to 50 MB per file · shared with every system</div>';
      row.replaceWith(dz);
      dz.appendChild(inp);
      ["dragenter", "dragover"].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault();
          dz.classList.add("dx-over");
        }),
      );
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("dx-over")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadFiles(Array.from(e.dataTransfer.files || []));
      });
    }
    const meter = document.createElement("div");
    meter.id = "dxMeter";
    meter.className = "dx-meter";
    (document.getElementById("docUploadStatus") || panel).before(meter);
    return panel;
  }

  window.renderSharedDocs = function () {
    ensureShell();
    const list = document.getElementById("docsList"),
      empty = document.getElementById("docsEmpty"),
      count = document.getElementById("docsCount"),
      meter = document.getElementById("dxMeter");
    if (!list) return;
    const used = sharedDocsRaw.reduce((s, d) => s + sizeOf(d), 0);
    if (meter) {
      const pct = Math.min(100, (used / SPACE_LIMIT) * 100);
      meter.innerHTML = `<div class="dx-meter-bar"><span style="width:${pct.toFixed(1)}%"></span></div><div class="dx-meter-txt">${fmtSize(used)} of ${fmtSize(SPACE_LIMIT)} shared space used</div>`;
    }
    if (count) count.textContent = sharedDocsRaw.length ? `(${sharedDocsRaw.length})` : "";
    const up = Object.keys(progress).map((k) => {
      const p = progress[k];
      return `<div class="dx-row dx-row-busy"><div class="dx-ic"><i class="ti ${p.down ? "ti-download" : "ti-upload"}"></i></div><div class="dx-info"><div class="dx-name">${escapeHtml(p.label)}</div><div class="dx-bar"><span style="width:${p.pct}%"></span></div></div><div class="dx-meta">${p.pct}%</div></div>`;
    });
    if (!sharedDocsRaw.length && !up.length) {
      list.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";
    list.innerHTML =
      up.join("") +
      sharedDocsRaw
        .map((d) => {
          const [ic, col] = iconFor(d.filename);
          const when = d.uploadedAt ? new Date(d.uploadedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
          const safe = escapeHtml(d.filename || "this file").replace(/'/g, "\\'");
          return `<div class="dx-row"><div class="dx-ic" style="--dx:${col}"><i class="ti ${ic}"></i></div><div class="dx-info"><div class="dx-name">${escapeHtml(d.filename || "Untitled")}</div><div class="dx-sub">${fmtSize(sizeOf(d))}${when ? " · " + when : ""}</div></div><div class="dx-actions"><button type="button" class="secondary" onclick="downloadSharedDoc('${d.id}')"><i class="ti ti-download"></i> Download</button><button type="button" class="danger" title="Delete for everyone" onclick="deleteSharedDoc('${d.id}','${safe}')"><i class="ti ti-trash"></i></button></div></div>`;
        })
        .join("");
  };

  async function uploadOne(file) {
    if (file.size > MAX_FILE) throw new Error(`${file.name} is ${fmtSize(file.size)} — the limit is 50 MB per file.`);
    const used = sharedDocsRaw.reduce((s, d) => s + sizeOf(d), 0);
    if (used + file.size > SPACE_LIMIT) throw new Error(`Not enough shared space for ${file.name}. Delete old files first (${fmtSize(SPACE_LIMIT - used)} free).`);
    const ref = fbDb.collection("sharedDocuments").doc();
    const id = ref.id;
    const chunks = Math.max(1, Math.ceil(file.size / CHUNK));
    progress[id] = { label: file.name, pct: 0 };
    renderSharedDocs();
    await ref.set({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, sizeKB: Math.round(file.size / 1024), chunks, status: "uploading", uploadedAt: new Date().toISOString(), v: 2 });
    let done = 0,
      next = 0;
    async function worker() {
      while (next < chunks) {
        const i = next++;
        const buf = await file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK)).arrayBuffer();
        await fbDb
          .collection("sharedDocChunks")
          .doc(id + "_" + i)
          .set({ doc: id, i, b: firebase.firestore.Blob.fromUint8Array(new Uint8Array(buf)) });
        done++;
        progress[id].pct = Math.round((done / chunks) * 100);
        renderSharedDocs();
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks) }, worker));
      await ref.update({ status: "ready", uploadedAt: new Date().toISOString() });
    } catch (e) {
      removeChunks(id, chunks);
      ref.delete().catch(() => {});
      throw e;
    } finally {
      delete progress[id];
      renderSharedDocs();
    }
  }
  async function uploadFiles(files) {
    if (typeof fbDb === "undefined" || !fbDb) return setStatus("⚠ Cloud sync isn't connected yet — wait a moment and try again.");
    files = files.filter(Boolean);
    if (!files.length) return;
    busy++;
    let ok = 0;
    const errors = [];
    for (const f of files) {
      setStatus(`Uploading ${f.name}…`);
      try {
        await uploadOne(f);
        ok++;
      } catch (e) {
        errors.push(e.message || String(e));
      }
    }
    busy--;
    setStatus((ok ? `✓ ${ok} file${ok === 1 ? "" : "s"} uploaded — visible on every system.` : "") + (errors.length ? " ⚠ " + errors.join(" ") : ""));
  }
  window.uploadSharedDocument = function () {
    /* uploads are handled by the Documents v2 picker / drop zone below */
  };
  const inp = document.getElementById("docUploadInput");
  if (inp)
    inp.addEventListener(
      "change",
      (e) => {
        e.stopImmediatePropagation();
        uploadFiles(Array.from(e.target.files || []));
        e.target.value = "";
      },
      true,
    );
  window.addEventListener("beforeunload", (e) => {
    if (busy) {
      e.preventDefault();
      e.returnValue = "A document is still uploading.";
    }
  });

  window.downloadSharedDoc = async function (id) {
    const d = sharedDocsRaw.find((x) => x.id === id);
    if (!d) return;
    let blob;
    try {
      if (d.base64) {
        /* older small files saved directly in the list */
        const s = atob(d.base64),
          a = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
        blob = new Blob([a], { type: d.mimeType || "application/octet-stream" });
      } else {
        const parts = new Array(d.chunks);
        progress[id + "_dl"] = { label: d.filename, pct: 0, down: true };
        renderSharedDocs();
        let done = 0,
          next = 0;
        async function worker() {
          while (next < d.chunks) {
            const i = next++;
            const snap = await fbDb.collection("sharedDocChunks").doc(id + "_" + i).get();
            if (!snap.exists) throw new Error("part " + (i + 1) + " is missing");
            parts[i] = snap.data().b.toUint8Array();
            done++;
            progress[id + "_dl"].pct = Math.round((done / d.chunks) * 100);
            renderSharedDocs();
          }
        }
        await Promise.all(Array.from({ length: Math.min(PARALLEL, d.chunks) }, worker));
        blob = new Blob(parts, { type: d.mimeType || "application/octet-stream" });
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = d.filename || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      alert("Could not download " + (d.filename || "this file") + ": " + (e.message || e));
    } finally {
      delete progress[id + "_dl"];
      renderSharedDocs();
    }
  };

  function removeChunks(id, n) {
    const col = fbDb.collection("sharedDocChunks");
    for (let s = 0; s < n; s += 400) {
      const b = fbDb.batch();
      for (let i = s; i < Math.min(n, s + 400); i++) b.delete(col.doc(id + "_" + i));
      b.commit().catch(() => {});
    }
  }
  window.deleteSharedDoc = async function (id, name) {
    const ok = await askPremiumConfirm({ kicker: "Delete document", title: escapeHtml(name), message: "This removes it for every system and cannot be undone.", confirmLabel: "Delete" });
    if (!ok || !fbDb) return;
    const d = sharedDocsRaw.find((x) => x.id === id);
    try {
      await fbDb.collection("sharedDocuments").doc(id).delete();
      if (d && d.chunks) removeChunks(id, d.chunks);
    } catch (e) {
      alert("Could not delete: " + e.message);
    }
  };
})();

/* ================= Saved Excel backups removed (never used) — stop its cloud look-ups ================= */
loadSavedFilesList = function () {};
window.loadSavedFilesList = loadSavedFilesList;
/* ================= MANIFEST HISTORY (Sep 2026) =================
   • The current scan list stays until you click "Save & Clear" (on every system).
   • Save & Clear stores the whole handover (all courier sheets, FE name, date) in Manifest History,
     then empties the list for the next pickup.
   • History is saved in the cloud — visible on every system, grouped by date, searchable by AWB,
     and any old manifest can be printed again or downloaded as Excel. */
(function () {
  if (typeof courierScans === "undefined") return;
  const HIST = () => fbDb.collection("aikm_admin").doc("data").collection("manifestHistory");
  let hist = [],
    histUnsub = null,
    histLoaded = false,
    histQuery = "",
    histShowAll = false;

  function courierOf(s) {
    return (typeof courierGroupLabels !== "undefined" && courierGroupLabels[s.groupKey]) || s.groupKey || "Needs courier";
  }
  function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayLabel(key) {
    const today = dayKey(Date.now()),
      yest = dayKey(Date.now() - 864e5);
    if (key === today) return "Today";
    if (key === yest) return "Yesterday";
    return new Date(key + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  function timeLabel(ms) {
    return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  /* ---- Save & Clear ---- */
  clearScans = async function () {
    if (!courierScans.length) return;
    const groups = {};
    courierScans.forEach((s) => {
      const c = courierOf(s);
      groups[c] = (groups[c] || 0) + 1;
    });
    const n = courierScans.length,
      nc = Object.keys(groups).length;
    const ok = await askPremiumConfirm({
      kicker: "Save & Clear",
      title: `Save ${n} AWB${n === 1 ? "" : "s"} to Manifest History?`,
      message: `${nc} courier sheet${nc === 1 ? "" : "s"}: ${Object.keys(groups)
        .map((c) => `${c} (${groups[c]})`)
        .join(", ")}.\n\nThe handover is saved in Manifest History — visible on every system and searchable by AWB. The scan list is then emptied for the next pickup.`,
      confirmLabel: "Save & Clear",
    });
    if (!ok) return;
    if (typeof fbDb === "undefined" || !fbDb) return void alert("Cloud sync isn't connected yet — wait a moment and try again. Nothing was cleared.");
    const now = Date.now();
    const lookup = typeof buildOmsAwbLookupMap === "function" ? buildOmsAwbLookupMap() : null;
    const record = {
      closedAt: now,
      day: dayKey(now),
      manifestDate: (document.getElementById("manifestDate") || {}).value || "",
      feName: (document.getElementById("feName") || {}).value || "",
      feMobile: (document.getElementById("feMobile") || {}).value || "",
      count: n,
      couriers: groups,
      awbs: courierScans
        .slice()
        .sort((a, b) => (a.scannedAt || 0) - (b.scannedAt || 0))
        .map((s) => {
          const info = lookup && typeof lookupOmsInfoByAwb === "function" ? lookupOmsInfoByAwb(s.awb, lookup) : { channel: "", orderDate: "" };
          return { awb: s.awb, courier: courierOf(s), at: s.scannedAt || now, channel: info.channel === "—" ? "" : info.channel || "" };
        }),
      search: courierScans.map((s) => String(s.awb).toUpperCase()).join(" "),
    };
    try {
      await HIST().doc(String(now)).set(record);
    } catch (e) {
      return void alert("Could not save to Manifest History, so nothing was cleared: " + (e.message || e));
    }
    const awbs = courierScans.map((s) => s.awb);
    /* remember WHEN this pickup was closed — any system still holding these old scans (in memory or browser storage)
       will drop them instead of uploading them again */
    clearedAt = now;
    try {
      await STATE().set({ clearedAt: now, clearedBy: navigator.userAgent.slice(0, 60) }, { merge: true });
    } catch (e) {}
    courierScans = [];
    try {
      renderScans();
    } catch (e) {}
    const m = document.getElementById("manifest");
    if (m) {
      m.innerHTML = "";
      m.style.display = "none";
    }
    ["feName", "feMobile"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    saveAll();
    await deleteCourierScansFromCloud(awbs);
    histToast(`Saved to Manifest History · ${n} AWBs`);
  };

  function histToast(msg) {
    let t = document.getElementById("mhToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "mhToast";
      t.className = "mh-toast no-print";
      document.body.appendChild(t);
    }
    t.textContent = "✓ " + msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---- History panel ---- */
  function ensurePanel() {
    let p = document.getElementById("mhPanel");
    if (p) return p;
    const anchor = document.getElementById("masterPrefixMapper");
    const memPanel = anchor && anchor.closest(".panel");
    if (!memPanel) return null;
    p = document.createElement("div");
    p.className = "panel no-print";
    p.id = "mhPanel";
    p.innerHTML = `
      <h2><i class="ti ti-history" style="color:var(--x-gold,#D4AF37);font-size:18px;"></i>Manifest History <span style="font-size:12px;color:var(--muted);font-weight:400;">every saved pickup, date-wise · shared on every system</span></h2>
      <div class="mh-search"><i class="ti ti-search"></i><input type="text" id="mhSearch" placeholder="Search AWB in all past manifests…" autocomplete="off"></div>
      <div id="mhBody"><div class="mh-empty">Loading history…</div></div>`;
    memPanel.parentNode.insertBefore(p, memPanel);
    const inp = p.querySelector("#mhSearch");
    let t = null;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        histQuery = inp.value.trim().toUpperCase().replace(/^`+/, "");
        if (histQuery.length >= 3) loadOlder();
        renderHistory();
      }, 150);
    });
    return p;
  }
  const RECENT_DAYS = 45;
  let recent = [],
    older = [],
    olderState = 0; /* 0 = not loaded, 1 = loading, 2 = loaded */
  function mergeHist() {
    const seen = new Set();
    hist = recent.concat(older).filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
    hist.sort((a, b) => b.closedAt - a.closedAt);
  }
  /* older manifests are fetched only when you search or ask for all days — keeps page opening light */
  function loadOlder() {
    if (olderState || typeof fbDb === "undefined" || !fbDb) return;
    olderState = 1;
    HIST()
      .where("closedAt", "<", Date.now() - RECENT_DAYS * 864e5)
      .orderBy("closedAt", "desc")
      .get()
      .then((snap) => {
        older = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        olderState = 2;
        mergeHist();
        renderHistory();
      })
      .catch((e) => {
        olderState = 0;
        console.warn("Older manifest history load failed", e);
      });
  }
  function startHistory() {
    if (histUnsub || typeof fbDb === "undefined" || !fbDb) return;
    histUnsub = HIST()
      .where("closedAt", ">=", Date.now() - RECENT_DAYS * 864e5)
      .orderBy("closedAt", "desc")
      .onSnapshot(
        (snap) => {
          recent = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
          mergeHist();
          histLoaded = true;
          renderHistory();
        },
        (e) => {
          console.warn("Manifest history sync error", e);
          const b = document.getElementById("mhBody");
          if (b) b.innerHTML = '<div class="mh-empty">Could not load history — check your connection.</div>';
        },
      );
  }
  function chips(c) {
    return Object.keys(c || {})
      .sort((a, b) => c[b] - c[a])
      .map((k) => `<span class="mh-chip">${escapeHtml(k)} <b>${c[k]}</b></span>`)
      .join("");
  }
  function renderHistory() {
    const body = document.getElementById("mhBody");
    if (!body) return;
    if (!histLoaded) return;
    if (!hist.length) {
      body.innerHTML = '<div class="mh-empty">No saved manifests yet. Click <b>Save &amp; Clear</b> after a pickup and it appears here.</div>';
      return;
    }
    if (histQuery.length >= 3) {
      const hits = [];
      hist.forEach((h) => {
        if (!(h.search || "").includes(histQuery)) return;
        (h.awbs || []).forEach((a) => {
          if (String(a.awb).toUpperCase().includes(histQuery)) hits.push({ h, a });
        });
      });
      const note = olderState === 1 ? '<div class="mh-muted" style="margin-bottom:8px;">Searching older manifests too…</div>' : "";
      body.innerHTML = note + (hits.length
        ? `<div class="mh-hits-title">${hits.length} match${hits.length === 1 ? "" : "es"}</div>` +
          hits
            .slice(0, 100)
            .map(
              ({ h, a }) => `<div class="mh-hit"><div class="mh-hit-awb">${escapeHtml(a.awb)}</div><div class="mh-hit-meta"><span class="mh-chip">${escapeHtml(a.courier)}</span><span>Handed over <b>${dayLabel(h.day)}</b>, ${timeLabel(h.closedAt)}${h.feName ? " · FE " + escapeHtml(h.feName) : ""}</span>${a.channel ? `<span class="mh-muted">${escapeHtml(a.channel)}</span>` : ""}</div><button type="button" class="secondary" onclick="printHistoryManifest('${h.id}')"><i class="ti ti-printer"></i> Manifest</button></div>`,
            )
            .join("")
        : `<div class="mh-empty">No saved manifest contains “${escapeHtml(histQuery)}”.</div>`);
      return;
    }
    const byDay = {};
    hist.forEach((h) => (byDay[h.day] || (byDay[h.day] = [])).push(h));
    const days = Object.keys(byDay).sort().reverse();
    const shown = histShowAll ? days : days.slice(0, 10);
    body.innerHTML =
      shown
        .map((d) => {
          const list = byDay[d];
          const total = list.reduce((s, h) => s + (h.count || 0), 0);
          return `<div class="mh-day"><div class="mh-day-head"><span>${dayLabel(d)}</span><span class="mh-muted">${list.length} pickup${list.length === 1 ? "" : "s"} · ${total} AWBs</span></div>${list
            .map(
              (h) => `<div class="mh-row"><div class="mh-time">${timeLabel(h.closedAt)}</div><div class="mh-info"><div class="mh-chips">${chips(h.couriers)}</div><div class="mh-muted">${h.count} AWBs${h.feName ? " · FE " + escapeHtml(h.feName) + (h.feMobile ? " (" + escapeHtml(h.feMobile) + ")" : "") : ""}</div></div><div class="mh-actions"><button type="button" class="secondary" onclick="printHistoryManifest('${h.id}')"><i class="ti ti-printer"></i> Print</button><button type="button" class="secondary" onclick="excelHistoryManifest('${h.id}')"><i class="ti ti-file-spreadsheet"></i> Excel</button><button type="button" class="danger" title="Delete this saved manifest" onclick="deleteHistoryManifest('${h.id}')"><i class="ti ti-trash"></i></button></div></div>`,
            )
            .join("")}</div>`;
        })
        .join("") + (days.length > 10 || olderState !== 2 ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="secondary" onclick="toggleHistoryAll()">${histShowAll ? "Show recent only" : "Show older days"}</button></div>` : "");
  }
  window.toggleHistoryAll = function () {
    histShowAll = !histShowAll;
    loadOlder();
    renderHistory();
  };

  /* ---- reprint an old manifest (same sheet design as today's) ---- */
  function sheetsHTML(h) {
    const g = {};
    (h.awbs || []).forEach((a) => (g[a.courier] || (g[a.courier] = [])).push(a));
    const fe = h.feName || "__________",
      mob = h.feMobile || "__________",
      date = h.manifestDate || new Date(h.closedAt).toLocaleDateString("en-IN");
    return Object.keys(g)
      .sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }))
      .map((c) => {
        const rows = g[c].slice().sort((x, y) => x.awb.localeCompare(y.awb, void 0, { numeric: !0, sensitivity: "base" }));
        const cols = rows.length <= 20 ? 3 : rows.length <= 60 ? 4 : rows.length <= 150 ? 5 : 6;
        const col = colorForCourier(c);
        return `<div class="courier-block" data-manifest-label="${escapeHtml(c)}" style="border-color:${col};">
        <div class="m-header" style="display:block;text-align:center;position:relative;">
          <div style="position:absolute;right:0;top:0;font-size:13px;font-weight:600;color:#444;">${escapeHtml(date)}</div>
          <h1 style="background:none;-webkit-background-clip:initial;background-clip:initial;color:${col};font-size:22px;margin:0 70px 2px;">${escapeHtml(c)} Handover Sheet</h1>
          <span style="display:block;">AIKM Pharma · Shipment Handover</span>
        </div>
        <div class="meta" style="font-size:12.5px;"><div>FE: ${escapeHtml(fe)} (${escapeHtml(mob)})</div><div>Total: ${rows.length}</div></div>
        <div class="man-grid" style="column-count:${cols};font-size:12.5px;line-height:1.9;border-top-color:${col};">${rows.map((a, i) => `<div class="awb-item"><b>${i + 1}.</b>${escapeHtml(a.awb)}</div>`).join("")}</div>
        <div class="footer-sign" style="font-size:11.5px;"><div>Handed over by (AIKM Pharma)</div><div>Received by: ${escapeHtml(fe)} — ${escapeHtml(c)} — Sign &amp; Stamp</div></div>
      </div>`;
      })
      .join("");
  }
  window.printHistoryManifest = function (id) {
    const h = hist.find((x) => x.id === id);
    const m = document.getElementById("manifest");
    if (!h || !m) return;
    const prevHTML = m.innerHTML,
      prevDisplay = m.style.display;
    const courierTab = document.querySelector('.tabbtn[data-tab="courier"]');
    if (courierTab && !courierTab.classList.contains("active")) courierTab.click();
    m.innerHTML = sheetsHTML(h);
    m.style.display = "block";
    const title = document.title;
    document.title = "Manifest_" + h.day + "_" + timeLabel(h.closedAt).replace(/[^0-9a-z]+/gi, "-");
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      document.title = title;
      m.innerHTML = prevHTML;
      m.style.display = prevDisplay;
      if (courierScans.length) generate();
    };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 50);
  };
  window.excelHistoryManifest = function (id) {
    const h = hist.find((x) => x.id === id);
    if (!h || typeof XLSX === "undefined") return;
    const rows = (h.awbs || []).map((a, i) => ({ "#": i + 1, AWB: a.awb, Courier: a.courier, Channel: a.channel || "", "Scanned at": new Date(a.at).toLocaleString("en-IN") }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manifest");
    XLSX.writeFile(wb, `Manifest_${h.day}_${timeLabel(h.closedAt).replace(/[^0-9a-z]+/gi, "-")}.xlsx`);
  };

  /* ---- start: build the panel now, connect as soon as cloud sync is ready ---- */
  window.deleteHistoryManifest = async function (id) {
    const h = hist.find((x) => x.id === id);
    if (!h) return;
    const ok = await askPremiumConfirm({ kicker: "Delete saved manifest", title: `${dayLabel(h.day)}, ${timeLabel(h.closedAt)} · ${h.count} AWBs`, message: "This removes it from Manifest History on every system. It cannot be undone.", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await HIST().doc(id).delete();
      older = older.filter((x) => x.id !== id);
      recent = recent.filter((x) => x.id !== id);
      mergeHist();
      renderHistory();
    } catch (e) {
      alert("Could not delete: " + (e.message || e));
    }
  };

  /* ---- "cleared up to" marker: stops old scans coming back after Save & Clear ---- */
  const STATE = () => fbDb.collection("aikm_admin").doc("courierState");
  let clearedAt = 0,
    stateLoaded = false,
    stateUnsub = null;
  function isStale(s) {
    return clearedAt && (s.scannedAt || 0) <= clearedAt;
  }
  function purgeStale() {
    if (!clearedAt) return false;
    const stale = courierScans.filter(isStale);
    if (!stale.length) return false;
    courierScans = courierScans.filter((s) => !isStale(s));
    stale.forEach((s) => {
      const c = typeof courierScansByAwbCache !== "undefined" && courierScansByAwbCache[s.awb];
      if (c && (c.scannedAt || 0) <= clearedAt) deleteCourierScanFromCloud(s.awb); /* someone re-uploaded an old scan — remove it again */
    });
    return true;
  }
  const _rs = window.renderScans;
  renderScans = function () {
    if (purgeStale()) {
      try {
        setTimeout(generate, 0);
      } catch (e) {}
    }
    return _rs.apply(this, arguments);
  };
  window.renderScans = renderScans;
  const _push = pushCourierScansToCloud;
  pushCourierScansToCloud = async function () {
    if (!stateLoaded) return; /* wait until we know when the list was last cleared */
    purgeStale();
    return _push.apply(this, arguments);
  };
  window.pushCourierScansToCloud = pushCourierScansToCloud;
  function startState() {
    if (stateUnsub || typeof fbDb === "undefined" || !fbDb) return;
    stateUnsub = STATE().onSnapshot(
      (d) => {
        const v = (d.exists && d.data().clearedAt) || 0;
        const first = !stateLoaded;
        stateLoaded = true;
        if (v > clearedAt) clearedAt = v;
        renderScans();
        generate();
        if (first) saveAll(); /* now safe to upload anything scanned while we were waiting */
      },
      (e) => {
        console.warn("courier state sync error", e);
        stateLoaded = true;
      },
    );
  }

  function boot() {
    startState();
    if (!ensurePanel()) return;
    startHistory();
  }
  boot();
  const poll = setInterval(() => {
    boot();
    if (histUnsub) clearInterval(poll);
  }, 1500);
  setTimeout(() => clearInterval(poll), 60000);
})();

/* ===== Master sheets: show upload date, auto-remove old manual uploads (OMS live sync stays) ===== */
(function () {
  var KEEP_DAYS = 7;
  function ds(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function cutoff() { var d = new Date(); d.setDate(d.getDate() - KEEP_DAYS); return ds(d); }
  function nice(s) { if (!s) return ""; var p = s.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
  function daysLeft(s) { if (!s) return null; var p = s.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + KEEP_DAYS); return Math.max(0, Math.ceil((d - new Date()) / 864e5)); }

  function prune() {
    if (typeof __entriesListenerLive !== "undefined" && !__entriesListenerLive) return;
    var c = cutoff(), changed = false;
    var keep = loadedFiles.filter(function (f) { return f.name === OMS_SOURCE_NAME || !f.date || f.date >= c; });
    if (keep.length !== loadedFiles.length) { loadedFiles = keep; changed = true; }
    [awbMap, orderMap].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var a = m[k], b = a.filter(function (r) { return r.sourceFile === OMS_SOURCE_NAME || !r.uploadDate || r.uploadDate >= c; });
        if (b.length !== a.length) { changed = true; if (b.length) m[k] = b; else delete m[k]; }
      });
    });
    if (changed) {
      renderFileChips();
      try { typeof reresolveNotFound === "function" && reresolveNotFound(); } catch (e) {}
      try { saveAll(); } catch (e) {}
    }
  }
  window.pruneOldMasterFiles = prune;

  renderFileChips = function () {
    fileChips.innerHTML = "";
    loadedFiles.forEach(function (e) {
      var isOms = e.name === OMS_SOURCE_NAME;
      var t = document.createElement("div");
      t.className = "chip mf-chip" + (isOms ? " mf-live" : "") + (e.ok ? "" : " mf-bad");
      var meta;
      if (!e.ok) meta = "Failed — " + escapeHtml(e.error || "");
      else if (isOms) meta = "Live sync · " + Number(e.rowCount || 0).toLocaleString("en-IN") + " orders" + (e.syncedAt ? " · updated " + e.syncedAt : "");
      else {
        var left = daysLeft(e.date);
        meta = Number(e.rowCount || 0).toLocaleString("en-IN") + " rows" + (e.date ? " · uploaded " + nice(e.date) : "") +
          (left != null ? " · auto-removes in " + left + (left === 1 ? " day" : " days") : "");
      }
      t.innerHTML = '<i class="ti ' + (isOms ? "ti-refresh" : "ti-file-spreadsheet") + ' mf-ic"></i>' +
        '<div class="mf-txt"><div class="mf-name" title="' + escapeHtml(e.name) + '">' + escapeHtml(isOms ? "OMS Guru — live orders" : e.name) + "</div>" +
        '<div class="mf-meta">' + meta + "</div></div>";
      if (!isOms) {
        var a = document.createElement("button");
        a.className = "fdel"; a.textContent = "×"; a.title = "Remove this file";
        a.addEventListener("click", function () { removeFile(e.name); });
        t.appendChild(a);
      }
      fileChips.appendChild(t);
    });
    updateStats();
  };

  setTimeout(prune, 15000);
  setTimeout(prune, 60000);
  setInterval(prune, 10 * 60000);
  try { renderFileChips(); } catch (e) {}
})();

/* NimbusPost + confirmation styles */
(function(){if(document.getElementById("aikm-nimbus-css"))return;var s=document.createElement("style");s.id="aikm-nimbus-css";s.textContent="\n/* ---- Self-Ship: NimbusPost bulk file ---- */\n@media screen{\nhtml#aikm body #selfshipNimbusPanel .nb-card{padding:22px 24px !important;}\nhtml#aikm body .nb-kicker{font-size:10px;letter-spacing:.1em;font-weight:700;color:var(--x-gold);}\nhtml#aikm body .nb-title{font-family:var(--x-brand-font);font-size:17px;font-weight:600;color:var(--x-text);margin-top:3px;}\nhtml#aikm body .nb-sub{font-size:12.5px;color:var(--x-muted);margin-top:4px;line-height:1.5;max-width:640px;}\nhtml#aikm body .nb-set{margin:18px 0 16px;padding:14px 16px;border:1px solid var(--x-line);border-radius:12px;background:var(--x-surface-2);}\nhtml#aikm body .nb-set-title{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--x-text);margin-bottom:10px;}\nhtml#aikm body .nb-set-title .ti{color:var(--x-gold);font-size:15px;}\nhtml#aikm body .nb-grid{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:10px;}\nhtml#aikm body .nb-grid label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:600;color:var(--x-muted);}\nhtml#aikm body .nb-grid label b{color:var(--x-red);}\nhtml#aikm body .nb-grid input{width:100%;box-sizing:border-box;}\nhtml#aikm body .nb-lbl{display:block;font-size:11.5px;font-weight:600;color:var(--x-muted);margin-bottom:6px;}\nhtml#aikm body #nbIds{width:100%;box-sizing:border-box;font-family:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace !important;}\nhtml#aikm body .nb-actions{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;}\nhtml#aikm body .nb-muted{color:var(--x-muted);font-size:12px;font-weight:400;}\nhtml#aikm body .nb-small{font-size:11px;margin-top:2px;}\nhtml#aikm body .nb-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0 12px;}\nhtml#aikm body .nb-kpi{border:1px solid var(--x-line);border-radius:10px;padding:10px 14px;background:var(--x-surface);}\nhtml#aikm body .nb-kpi-n{font-family:var(--x-brand-font);font-size:20px;font-weight:600;color:var(--x-text);font-variant-numeric:tabular-nums;}\nhtml#aikm body .nb-kpi-l{font-size:11.5px;color:var(--x-muted);margin-top:2px;}\nhtml#aikm body .nb-kpi.nb-ok .nb-kpi-n{color:var(--x-green);}\nhtml#aikm body .nb-kpi.nb-bad{background:var(--x-red-soft);border-color:transparent;}\nhtml#aikm body .nb-kpi.nb-bad .nb-kpi-n{color:var(--x-red);}\nhtml#aikm body .nb-kpi.nb-warnk .nb-kpi-n{color:var(--x-amber);}\nhtml#aikm body #nbTable td{vertical-align:top !important;font-size:12.5px;}\nhtml#aikm body .nb-addr{max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--x-text-2);font-size:12px;margin-top:2px;}\nhtml#aikm body .nb-name{font-weight:600;color:var(--x-text);}\nhtml#aikm body .nb-items{max-width:none;min-width:330px;font-size:12px !important;}\n.nb-it+.nb-it{margin-top:10px;padding-top:10px;border-top:1px dashed var(--x-line);}\n.nb-ids{font-size:11px;color:var(--x-muted);margin-top:3px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}\n.nb-ids b{color:var(--x-text-2);font-weight:600;}\n.nb-ids a{color:var(--x-gold);text-decoration:none;}\n.nb-ids a:hover{text-decoration:underline;}\n.nb-price{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--x-muted);}\n.nb-price b{color:var(--x-text);font-weight:600;font-variant-numeric:tabular-nums;}\n.nb-np{width:92px !important;min-height:28px !important;padding:4px 8px !important;font-size:12px !important;}\n.nb-push{min-height:28px !important;padding:4px 12px !important;font-size:11.5px !important;font-weight:600 !important;border-radius:8px !important;background:var(--x-text) !important;color:var(--x-surface) !important;border:0 !important;cursor:pointer;}\n.nb-push:hover{opacity:.88;}\nhtml#aikm body .nb-items div+div{margin-top:3px;}\nhtml#aikm body .nb-items b{color:var(--x-gold);font-weight:700;white-space:nowrap;}\nhtml#aikm body #tab-selfship #selfshipNimbusPanel .card > div.nb-head{display:block !important;background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;}\nhtml#aikm body #nbTable .cx-awb{font-size:12px;}\nhtml#aikm body .nb-w{width:76px !important;min-height:30px !important;}\nhtml#aikm body .nb-pay{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--x-surface-2);border:1px solid var(--x-line);color:var(--x-text-2);white-space:nowrap;}\nhtml#aikm body .nb-pay.nb-cod{background:var(--x-gold-soft);border-color:var(--x-gold-line);color:var(--x-gold);}\nhtml#aikm body .nb-tag{display:inline-block;max-width:170px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;line-height:1.45;}\nhtml#aikm body .nb-tag-ok{background:var(--x-green-soft);color:var(--x-green);}\nhtml#aikm body .nb-tag-warn{background:var(--x-amber-soft);color:var(--x-amber);}\nhtml#aikm body .nb-tag-bad{background:var(--x-red-soft);color:var(--x-red);}\nhtml#aikm body .nb-tag-mute{background:var(--x-surface-2);color:var(--x-muted);border:1px solid var(--x-line);}\nhtml#aikm body tr.nb-row-out td{opacity:.6;}\n@media (max-width:900px){html#aikm body .nb-grid{grid-template-columns:1fr 1fr;}html#aikm body .nb-kpis{grid-template-columns:1fr 1fr;}}\n}\n@media screen{html#aikm body #nbTable :is(td,th){padding-left:10px !important;padding-right:10px !important;}\nhtml#aikm body #nbTable th:last-child,html#aikm body #nbTable td:last-child{min-width:150px;}}\n@media screen{\nhtml#aikm body .nb-filter{margin-bottom:6px;}\nhtml#aikm body .nb-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}\nhtml#aikm body #selfshipNimbusPanel button.nb-chip{border-radius:20px !important;padding:6px 12px !important;min-height:0 !important;display:inline-flex;align-items:center;gap:7px;font-weight:600 !important;}\nhtml#aikm body #selfshipNimbusPanel button.nb-chip span{background:var(--x-raise);color:var(--x-text-2);border-radius:20px;padding:0 7px;font-size:11px;line-height:18px;}\nhtml#aikm body #selfshipNimbusPanel button.nb-chip.on{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}\nhtml#aikm body #selfshipNimbusPanel button.nb-chip.on span{background:rgba(255,255,255,.18);color:inherit;}\nhtml#aikm body #selfshipNimbusPanel button.nb-chip.over:not(.on){color:var(--x-red) !important;border-color:color-mix(in srgb,var(--x-red) 40%,transparent) !important;}\nhtml#aikm body .nb-filter-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}\nhtml#aikm body .nb-filter-row select{min-width:220px;}\nhtml#aikm body #nbTable input[type=checkbox]{width:16px;height:16px;accent-color:#D4AF37;cursor:pointer;}\n}\n@media screen{\n/* Self-Ship uses the full page width */\nhtml#aikm body div#tab-selfship.tabpanel > div.wrap{max-width:none !important;width:100% !important;}\n/* Confirmation card: SLA-date picker replaces the paste box */\nhtml#aikm body #tab-selfship .cf-card :is(#orderIdsInput,#processBtn,#fsClearBtn){display:none !important;}\nhtml#aikm body #tab-selfship .cf-card > .step-note{display:none !important;}\nhtml#aikm body #cfBlock{margin-top:6px;}\nhtml#aikm body #cfBlock button.nb-chip{border-radius:20px !important;padding:6px 12px !important;min-height:0 !important;display:inline-flex;align-items:center;gap:7px;font-weight:600 !important;}\nhtml#aikm body #cfBlock button.nb-chip span{background:var(--x-raise);color:var(--x-text-2);border-radius:20px;padding:0 7px;font-size:11px;line-height:18px;}\nhtml#aikm body #cfBlock button.nb-chip.on{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}\nhtml#aikm body #cfBlock button.nb-chip.on span{background:rgba(255,255,255,.18);color:inherit;}\nhtml#aikm body #cfBlock button.nb-chip.over:not(.on){color:var(--x-red) !important;}\nhtml#aikm body #cfTable td{vertical-align:top !important;font-size:12.5px;}\nhtml#aikm body #cfTable input[type=checkbox]{width:16px;height:16px;accent-color:#D4AF37;cursor:pointer;}\nhtml#aikm body #cfTable .cx-awb{font-size:12px;}\nhtml#aikm body #nbTable .nb-addr{max-width:420px;}\n}\n@media screen{\nhtml#aikm body .nb-kpis{grid-template-columns:repeat(5,minmax(0,1fr)) !important;}\nhtml#aikm body :is(#nbTable,#cfTable) tr.nb-row-loss td{background:var(--x-red-soft) !important;opacity:1 !important;}\nhtml#aikm body :is(#nbTable,#cfTable) tr.nb-row-loss td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}\nhtml#aikm body :is(#nbTable,#cfTable) tr.nb-row-loss .cx-awb{color:var(--x-red) !important;font-weight:600;}\nhtml#aikm body .nb-loss{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.02em;background:var(--x-red);color:#fff;white-space:nowrap;}\n@media (max-width:900px){html#aikm body .nb-kpis{grid-template-columns:1fr 1fr !important;}}\n}\n@media screen{\nhtml#aikm body .nd-kpis{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px;margin:0 0 16px;}\n@media (max-width:1350px){html#aikm body .nd-kpis{grid-template-columns:repeat(4,minmax(0,1fr));}}\n@media (max-width:700px){html#aikm body .nd-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}}\nhtml#aikm body button.nd-kpi{all:unset;box-sizing:border-box;cursor:pointer;display:block;background:var(--x-surface);border:1px solid var(--x-line);border-radius:12px;padding:12px 14px;box-shadow:var(--x-shadow);transition:border-color .12s,background .12s;}\nhtml#aikm body button.nd-kpi:hover{border-color:var(--x-line-2);}\nhtml#aikm body button.nd-kpi .ti{font-size:17px;color:var(--x-muted);}\nhtml#aikm body .nd-kpi-n{font-family:var(--x-brand-font);font-size:22px;font-weight:600;color:var(--x-text);margin-top:6px;font-variant-numeric:tabular-nums;}\nhtml#aikm body .nd-kpi-l{font-size:11.5px;color:var(--x-muted);margin-top:1px;}\nhtml#aikm body .nd-k-amber .ti{color:var(--x-amber);} html#aikm body .nd-k-blue .ti{color:var(--x-blue);}\nhtml#aikm body .nd-k-green .ti{color:var(--x-green);} html#aikm body .nd-k-red .ti{color:var(--x-red);}\nhtml#aikm body button.nd-kpi.alert{background:var(--x-red-soft);border-color:color-mix(in srgb,var(--x-red) 35%,transparent);}\nhtml#aikm body button.nd-kpi.alert .nd-kpi-n{color:var(--x-red);}\nhtml#aikm body button.nd-kpi.on{border-color:var(--x-gold) !important;box-shadow:0 0 0 2px var(--x-gold-soft) !important;}\nhtml#aikm body .nd-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}\nhtml#aikm body .nd-filters #ndSearch{flex:1;min-width:240px;}\nhtml#aikm body .nd-active{font-size:12.5px;color:var(--x-muted);margin:2px 0 10px;}\nhtml#aikm body .nd-active b{color:var(--x-text);}\nhtml#aikm body #ndTable td{vertical-align:top !important;font-size:12.5px;}\nhtml#aikm body #ndTable .cx-awb{font-size:12px;}\nhtml#aikm body .nd-pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}\nhtml#aikm body .nd-amber{background:var(--x-amber-soft);color:var(--x-amber);}\nhtml#aikm body .nd-blue{background:var(--x-blue-soft);color:var(--x-blue);}\nhtml#aikm body .nd-red{background:var(--x-red-soft);color:var(--x-red);}\nhtml#aikm body td.nd-red{background:transparent !important;color:var(--x-red) !important;font-weight:600;}\nhtml#aikm body .nd-green{background:var(--x-green-soft);color:var(--x-green);}\nhtml#aikm body .nd-muted{background:var(--x-surface-2);color:var(--x-muted);border:1px solid var(--x-line);}\nhtml#aikm body .nd-flag{margin-top:4px;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--x-red);}\nhtml#aikm body #ndTable tr.nd-row-late td{background:color-mix(in srgb,var(--x-red-soft) 70%,transparent) !important;}\nhtml#aikm body #ndTable tr.nd-row-late td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}\nhtml#aikm body .nd-pager{display:flex;gap:10px;align-items:center;margin-top:12px;}\nhtml#aikm body .nd-setup{border-color:var(--x-gold-line) !important;background:var(--x-gold-soft) !important;}\nhtml#aikm body .nd-steps{margin:6px 0 0 18px;padding:0;line-height:1.8;font-size:13px;color:var(--x-text);}\nhtml#aikm body .nd-steps code{background:var(--x-surface);border:1px solid var(--x-line);border-radius:5px;padding:1px 6px;font-size:12px;}\n}\n@media screen{html#aikm body #ndTable td:nth-child(n+6){white-space:nowrap;}}\n@media screen{html#aikm body .sn-pushinfo{max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}";document.head.appendChild(s);})();

/* ===== Self-Ship → NimbusPost bulk order file (built from OMS Guru live data) ===== */
(function () {
  var tab = document.getElementById("tab-selfship");
  var header = document.getElementById("fsPremiumHeader");
  if (!tab || !header || document.getElementById("fsTabNimbus")) return;

  var LS_KEY = "aikm_nimbus_settings_v1";
  var DEF = { pickupId: "", weight: 0.5, l: 20, b: 15, h: 10, skuWeights: {} };
  var settings = Object.assign({}, DEF);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
  var cloudRef = null, lastRows = [];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function normId(v) { return String(v || "").replace(/^`+/, "").replace(/\s+/g, "").trim(); }
  function saveSettings() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
    if (cloudRef) cloudRef.set(settings, { merge: true }).catch(function (e) { console.warn("Nimbus settings save failed", e); });
  }
  function hookCloud() {
    if (cloudRef || typeof fbDb === "undefined" || !fbDb) return;
    cloudRef = fbDb.collection("aikm_admin").doc("nimbusSettings");
    cloudRef.onSnapshot(function (d) {
      if (!d.exists) { if (settings.pickupId) saveSettings(); return; }
      var x = d.data() || {};
      Object.assign(settings, x, { skuWeights: Object.assign({}, settings.skuWeights, x.skuWeights || {}) });
      try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
      fillSettings();
    }, function (e) { console.warn("Nimbus settings sync error", e); });
  }
  var hookTimer = setInterval(function () { hookCloud(); if (cloudRef) clearInterval(hookTimer); }, 3000);

  /* ---------- pill button ---------- */
  var fakeBtn = document.getElementById("fsTabFakeShip");
  var btn = document.createElement("button");
  btn.type = "button"; btn.id = "fsTabNimbus";
  btn.style.cssText = "all:unset;cursor:pointer;background:var(--fs-pill-bg);color:var(--fs-pill-text);font-size:11.5px;font-weight:600;padding:7px 16px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);";
  btn.innerHTML = '<i class="ti ti-file-upload" style="font-size:13px;color:#D4AF37;"></i>NimbusPost file';
  fakeBtn.parentNode.appendChild(btn);

  /* ---------- panel ---------- */
  var panel = document.createElement("div");
  panel.id = "selfshipNimbusPanel";
  panel.style.display = "none";
  panel.innerHTML =
    '<div class="card nb-card">' +
      '<div class="nb-head"><div><div class="nb-kicker">NIMBUSPOST · BULK ORDER UPLOAD</div>' +
      '<div class="nb-title">Create shipments from OMS Guru data</div>' +
      '<div class="nb-sub">Pick an SLA date → check the orders → download → upload in NimbusPost (Orders → Bulk Upload). Only Amazon self-ship orders that are still <b>New</b> in OMS Guru (no AWB yet) are listed.</div></div></div>' +

      '<div class="nb-set">' +
        '<div class="nb-set-title"><i class="ti ti-settings"></i>Shipment defaults <span id="nbSetSaved" class="nb-muted"></span></div>' +
        '<div class="nb-grid">' +
          '<label><span>Pickup Address ID <b>*</b></span><input type="text" id="nbPickup" placeholder="From NimbusPost → Warehouse"></label>' +
          '<label>Weight (kg)<input type="number" step="0.01" min="0.01" id="nbW"></label>' +
          '<label>Length (cm)<input type="number" step="1" min="1" id="nbL"></label>' +
          '<label>Breadth (cm)<input type="number" step="1" min="1" id="nbB"></label>' +
          '<label>Height (cm)<input type="number" step="1" min="1" id="nbH"></label>' +
        '</div>' +
        '<div class="nb-muted nb-small">Saved for every computer. If you change an order\'s weight below, that product\'s weight is remembered next time.</div>' +
      '</div>' +

      '<div class="nb-filter">' +
        '<div class="nb-lbl">SLA date <span class="nb-muted" id="nbPoolNote"></span></div>' +
        '<div class="nb-chips" id="nbDates"></div>' +
        '<div class="nb-filter-row"><select id="nbAcct"><option value="">All accounts</option></select>' +
        '<button type="button" id="nbRefresh"><i class="ti ti-refresh"></i> Refresh</button></div>' +
      '</div>' +
      '<div id="nbResult" style="display:none;">' +
        '<div class="nb-kpis" id="nbKpis"></div>' +
        '<div class="table-scroll"><table class="data" id="nbTable"><thead><tr>' +
          '<th style="width:28px;"><input type="checkbox" id="nbAll" title="Select all"></th><th>Order</th><th>Buyer</th><th>Items · Amazon price</th><th>Weight (kg)</th><th>Status</th>' +
        '</tr></thead><tbody id="nbBody"></tbody></table></div>' +
        '<div class="nb-actions"><button type="button" id="nbDownload" class="btn-gold"><i class="ti ti-download"></i> Download NimbusPost file</button>' +
        '<span id="nbDlNote" class="nb-muted"></span></div>' +
      '</div>' +
    '</div>';
  var genGroup = document.getElementById("selfshipGenerateGroup");
  var fsPanel = document.getElementById("selfshipFakeShipPanel");
  (fsPanel || genGroup).parentNode.insertBefore(panel, (fsPanel || genGroup).nextSibling);

  function fillSettings() {
    var m = { nbPickup: "pickupId", nbW: "weight", nbL: "l", nbB: "b", nbH: "h" };
    Object.keys(m).forEach(function (id) { var el = document.getElementById(id); if (el && document.activeElement !== el) el.value = settings[m[id]] == null ? "" : settings[m[id]]; });
  }
  fillSettings();
  ["nbPickup", "nbW", "nbL", "nbB", "nbH"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () {
      settings.pickupId = document.getElementById("nbPickup").value.trim();
      settings.weight = num(document.getElementById("nbW").value) || DEF.weight;
      settings.l = num(document.getElementById("nbL").value) || DEF.l;
      settings.b = num(document.getElementById("nbB").value) || DEF.b;
      settings.h = num(document.getElementById("nbH").value) || DEF.h;
      saveSettings();
      var s = document.getElementById("nbSetSaved"); s.textContent = "· saved"; setTimeout(function () { s.textContent = ""; }, 1500);
    });
  });

  /* ---------- view switching (Generate / Fake ship / NimbusPost) ---------- */
  var ON = { bg: "#0F1E35", fg: "#F5F4EC", sh: "0 4px 12px rgba(15,30,53,.24)" }, OFF = { bg: "var(--fs-pill-bg)", fg: "var(--fs-pill-text)", sh: "0 1px 3px rgba(0,0,0,.06)" };
  function paint(b, on) { var s = on ? ON : OFF; b.style.background = s.bg; b.style.color = s.fg; b.style.boxShadow = s.sh; }
  var origSwitch = window.switchSelfShipView || switchSelfShipView;
  switchSelfShipView = window.switchSelfShipView = function (view, byUser) {
    // theme switch re-calls this with "generate" — keep the NimbusPost view open in that case
    if (!byUser && view === "generate" && panel.style.display === "block") view = "nimbus";
    if (view === "nimbus") {
      if (genGroup) genGroup.style.display = "none";
      if (fsPanel) fsPanel.style.display = "none";
      panel.style.display = "block";
      tab.querySelectorAll(".wrap > .foot, .wrap > .rule-box").forEach(function (x) { x.dataset.nbHid = x.style.display || "-"; x.style.display = "none"; });
      paint(document.getElementById("fsTabGenerate"), false); paint(fakeBtn, false); paint(btn, true);
      hookCloud(); hookListing(); fillSettings(); build();
      return;
    }
    panel.style.display = "none"; paint(btn, false);
    tab.querySelectorAll("[data-nb-hid]").forEach(function (x) { x.style.display = x.dataset.nbHid === "-" ? "" : x.dataset.nbHid; delete x.dataset.nbHid; });
    origSwitch(view);
  };
  // re-bind the two existing pills so they also hide this panel
  ["fsTabGenerate", "fsTabFakeShip"].forEach(function (id) {
    var old = document.getElementById(id), nb = old.cloneNode(true);
    old.parentNode.replaceChild(nb, old);
    nb.addEventListener("click", function () { switchSelfShipView(id === "fsTabFakeShip" ? "fake" : "generate", true); });
    if (id === "fsTabFakeShip") fakeBtn = nb;
  });
  btn.addEventListener("click", function () { switchSelfShipView("nimbus", true); });

  /* ---------- matching ---------- */
  function fmtDate(s) {
    var d = new Date(String(s || "").replace(/\s+\d{1,2}:\d{2}.*$/, ""));
    if (isNaN(d)) d = new Date();
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  function phone10(p) { var d = String(p || "").replace(/\D/g, ""); if (d.length > 10) d = d.slice(-10); return d; }
  function account(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
  function isCancelled(st) { return /cancel/i.test(st || ""); }
  function weightFor(items) {
    var tot = 0, all = true;
    items.forEach(function (it) { var w = settings.skuWeights[it.sku]; if (w) tot += w * it.qty; else all = false; });
    return all && tot > 0 ? r2(tot) : num(settings.weight) || DEF.weight;
  }

  /* ---------- pending self-ship pool ---------- */
  function lossInfo(live) {
    var p = live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0);
    var l = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
    return { loss: !!l, profit: Math.round(p * 100) / 100 };
  }
  function lossTag(r) { return r.loss ? '<span class="nb-loss">LOSS · ₹' + r.profit.toLocaleString("en-IN") + "</span>" : '<span class="nb-muted nb-small">Profit ₹' + r.profit.toLocaleString("en-IN") + "</span>"; }
  function confirmLoss(list) {
    var L = list.filter(function (r) { return r.loss; });
    if (!L.length) return true;
    var tot = L.reduce(function (s, r) { return s + r.profit; }, 0);
    return confirm("⚠ " + L.length + " LOSS order(s) selected (total profit ₹" + (Math.round(tot * 100) / 100).toLocaleString("en-IN") + "):\n\n" +
      L.slice(0, 15).map(function (r) { return "• " + r.id + "  ₹" + r.profit; }).join("\n") + (L.length > 15 ? "\n…" : "") + "\n\nShip these loss orders anyway?");
  }

  var exported = {}, expRef = null, pool = [], selDate = "", selAcct = "";
  function hookExported() {
    if (expRef || typeof fbDb === "undefined" || !fbDb) return;
    expRef = fbDb.collection("aikm_admin").doc("nimbusExported");
    expRef.onSnapshot(function (d) { exported = (d.exists && d.data().ids) || {}; if (panel.style.display === "block") pickRows(); },
      function (e) { console.warn("Nimbus exported sync error", e); });
  }
  function ymd(s) {
    var d = new Date(String(s || "").replace(/\s+\d{1,2}:\d{2}.*$/, ""));
    if (isNaN(d)) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayYmd() { return ymd(new Date().toDateString()); }
  function isSelfShipPending(o) {
    return /amazon/i.test(o.channel || "") && phone10(o.buyerPhone).length >= 10 && !String(o.awb || "").trim() &&
      /^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || "").trim());
  }
  function makeRow(id, live) {
    var o = live[0];
    var addr = [o.buyerAddress1, o.buyerAddress2].map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(", ");
    var items = {}, order = [];
    live.forEach(function (x) {
      var key = x.sku || x.productName;
      if (!items[key]) { items[key] = { sku: x.sku || "", name: x.productName || x.sku || "Item", qty: 0, price: num(x.price), ship: 0, hsn: x.hsn || "", tax: num(x.taxRate) }; order.push(key); }
      var q = num(x.qty) || 1; items[key].qty += q; items[key].ship += num(x.shippingCharge) * q;
    });
    var list = order.map(function (k) { return items[k]; });
    var cod = live.reduce(function (s, x) { return s + num(x.codCollectible); }, 0);
    var isCod = cod > 0 || /^cod$/i.test(String(o.orderType || "").trim());
    var total = list.reduce(function (s, it) { return s + it.price * it.qty + it.ship; }, 0);
    var r = { id: id, o: o, sla: ymd(o.slaDate), items: list, addr: addr, isCod: isCod, cod: r2(cod > 0 ? cod : (isCod ? total : 0)),
      ship: r2(list.reduce(function (s, it) { return s + it.ship; }, 0)), weight: weightFor(list), state: "ok", note: "Ready" };
    var li = lossInfo(live); r.loss = li.loss; r.profit = li.profit;
    var missing = [];
    if (!addr) missing.push(o.buyerAddress1 === undefined ? "address (waiting for next OMS sync)" : "address");
    if (!/^\d{6}$/.test(String(o.buyerPincode || "").trim())) missing.push("pincode");
    if (!o.buyerCity) missing.push("city");
    if (missing.length) { r.state = "bad"; r.note = "Missing " + missing.join(", "); }
    if (list.length > 10) { r.state = "bad"; r.note = "More than 10 products — split it manually"; }
    return r;
  }
  function buildPool() {
    var data = window.omsOrdersRaw || (typeof omsOrdersRaw !== "undefined" ? omsOrdersRaw : []);
    var by = {};
    data.forEach(function (o) { if (!isSelfShipPending(o)) return; var k = normId(o.channelOrderId); if (k) (by[k] = by[k] || []).push(o); });
    var keep = {}; pool.forEach(function (r) { keep[r.id] = r; });
    pool = Object.keys(by).map(function (id) {
      var r = makeRow(id, by[id]), old = keep[id];
      if (old) { r.weight = old.weight; if (old.touched) { r.sel = old.sel; r.touched = true; } }
      return r;
    });
    var accts = {}; pool.forEach(function (r) { accts[account(r.o.channel)] = 1; });
    var sel = document.getElementById("nbAcct"), cur = sel.value;
    sel.innerHTML = '<option value="">All accounts</option>' + Object.keys(accts).sort().map(function (a) { return '<option' + (a === cur ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
    document.getElementById("nbPoolNote").textContent = data.length ? "· " + pool.length + " self-ship orders waiting" : "· OMS data loading…";
    renderDates();
  }
  function niceDay(k) {
    var t = todayYmd(), p = k.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var tm = new Date(); tm.setDate(tm.getDate() + 1);
    var label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (k === t) return "Today · " + label;
    if (k === ymd(tm.toDateString())) return "Tomorrow · " + label;
    return d.toLocaleDateString("en-IN", { weekday: "short" }) + " · " + label;
  }
  function renderDates() {
    var t = todayYmd(), counts = {}, over = 0;
    pool.forEach(function (r) { if (selAcct && account(r.o.channel) !== selAcct) return; if (r.sla && r.sla < t) over++; else counts[r.sla || "none"] = (counts[r.sla || "none"] || 0) + 1; });
    var keys = Object.keys(counts).sort();
    var opts = (over ? [["overdue", "Overdue", over]] : []).concat(keys.map(function (k) { return [k, k === "none" ? "No SLA date" : niceDay(k), counts[k]]; }));
    if (!opts.some(function (o) { return o[0] === selDate; })) selDate = opts.length ? (counts[t] ? t : opts[0][0]) : "";
    document.getElementById("nbDates").innerHTML = opts.length ? opts.map(function (o) {
      return '<button type="button" class="nb-chip' + (o[0] === selDate ? " on" : "") + (o[0] === "overdue" ? " over" : "") + '" data-k="' + o[0] + '">' + esc(o[1]) + ' <span>' + o[2] + "</span></button>";
    }).join("") : '<span class="nb-muted">No self-ship orders waiting right now.</span>';
    document.querySelectorAll("#nbDates .nb-chip").forEach(function (b) { b.addEventListener("click", function () { selDate = b.dataset.k; renderDates(); }); });
    pickRows();
  }
  function pickRows() {
    var t = todayYmd();
    lastRows = pool.filter(function (r) {
      if (selAcct && account(r.o.channel) !== selAcct) return false;
      if (selDate === "overdue") return r.sla && r.sla < t;
      if (selDate === "none") return !r.sla;
      return r.sla === selDate;
    }).sort(function (a, b) { return (b.loss - a.loss) || account(a.o.channel).localeCompare(account(b.o.channel)) || a.id.localeCompare(b.id); });
    lastRows.forEach(function (r) { if (!r.touched) r.sel = r.state === "ok" && !exported[r.id] && !r.loss; if (r.state !== "ok") r.sel = false; });
    render();
  }
  function build() { hookExported(); buildPool(); }

  /* ---------- Amazon listing data (ASIN, selling price, MRP) + price push ---------- */
  // Published by the Amazon sync into listingIndex/<account>; price requests go to spapiPriceUpdates
  // and are sent to Amazon by the next sync (about 15 min).
  var LIX = {}, lixUnsub = null, priceReq = {}, prUnsub = null;
  function hookListing() {
    if (lixUnsub || typeof fbDb === "undefined" || !fbDb) return;
    lixUnsub = fbDb.collection("listingIndex").onSnapshot(function (snap) {
      LIX = {}; snap.forEach(function (d) { LIX[d.id] = d.data() || {}; }); window.__nbLIX = LIX;
      if (panel.style.display === "block") render();
    }, function (e) { console.warn("Listing index read error", e); });
    prUnsub = fbDb.collection("spapiPriceUpdates").where("source", "==", "console").onSnapshot(function (snap) {
      priceReq = {}; snap.forEach(function (d) { priceReq[d.id] = d.data() || {}; });
      if (panel.style.display === "block") render();
    }, function (e) { console.warn("Price request read error", e); });
  }
  var lixTimer = setInterval(function () { hookListing(); if (lixUnsub) clearInterval(lixTimer); }, 3000);
  function acctKey(ch) {
    var n = account(ch).toLowerCase().replace(/[^a-z0-9]/g, "");
    var ks = Object.keys(LIX);
    return ks.filter(function (k) { return n === k; })[0] || ks.filter(function (k) { return n.indexOf(k) === 0 || k.indexOf(n) === 0; })[0] || "";
  }
  function listingFor(r, it) {
    var ak = acctKey(r.o.channel), ix = LIX[ak];
    if (!ix) return null;
    var skus = ix.skus || {}, sku = it.sku;
    if (!skus[sku]) {
      // OMS uses its own SKU names — take the Amazon SKU from the Amazon order itself
      var ol = (ix.orders || {})[r.id] || [];
      if (ol.length === 1) sku = ol[0].s;
      else if (ol.length > 1) {
        var w = words(it.name), best = null, bs = 0;
        ol.forEach(function (x) { var t = words(x.t), n = 0; w.forEach(function (k) { if (t.indexOf(k) >= 0) n++; }); if (n > bs) { bs = n; best = x; } });
        if (best) sku = best.s;
      }
    }
    var x = skus[sku];
    return x ? { acct: ak, sku: sku, asin: x.a || "", price: x.p, mrp: x.m } : null;
  }
  function words(t) { return String(t || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (k) { return k.length > 2; }); }
  function inr(v) { return v == null || v === "" ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function itemCell(r, it, i, j) {
    var L = listingFor(r, it), h = "<div class=\"nb-it\"><div>" + esc(it.name) + " <b>× " + it.qty + "</b></div>";
    if (!L) return h + '<div class="nb-muted nb-small">SKU ' + esc(it.sku || "—") + ' · <span title="Not found in the Amazon listings yet">no Amazon match</span></div></div>';
    h += '<div class="nb-ids">SKU <b>' + esc(L.sku) + "</b>" + (L.asin ? ' · ASIN <a href="https://www.amazon.in/dp/' + esc(L.asin) + '" target="_blank" rel="noopener">' + esc(L.asin) + "</a>" : "") + "</div>";
    var q = priceReq[L.acct + "_" + L.sku], st = "";
    if (q && q.status === "pending") st = '<span class="nb-tag nb-tag-warn">Queued ' + inr(q.newPrice) + " · next sync</span>";
    else if (q && q.status === "failed" && q.failedAt && Date.now() - (q.failedAt.toMillis ? q.failedAt.toMillis() : 0) < 3 * 864e5) st = '<span class="nb-tag nb-tag-bad" title="' + esc(q.error || "") + '">Amazon refused · ' + esc(String(q.error || "").slice(0, 60)) + "</span>";
    else if (q && q.status === "applied" && q.appliedAt && Date.now() - (q.appliedAt.toMillis ? q.appliedAt.toMillis() : 0) < 864e5) st = '<span class="nb-tag nb-tag-ok">✓ Updated to ' + inr(q.newPrice) + "</span>";
    h += '<div class="nb-price"><span>Amazon <b>' + inr(L.price) + '</b></span><span>MRP <b>' + inr(L.mrp) + "</b></span>" +
      '<input type="number" step="0.01" min="1" class="nb-np" data-i="' + i + '" data-j="' + j + '" placeholder="New ₹">' +
      '<button type="button" class="nb-push" data-i="' + i + '" data-j="' + j + '">Push</button></div>' + (st ? '<div style="margin-top:4px;">' + st + "</div>" : "");
    return h + "</div>";
  }
  function pushPrice(i, j, inp) {
    var r = lastRows[i], it = r && r.items[j], L = r && listingFor(r, it), v = num(inp.value);
    if (!L) return;
    if (!(v > 0)) { alert("Enter the new selling price first."); inp.focus(); return; }
    if (L.mrp && v > L.mrp) { alert("₹" + v + " is above the MRP (₹" + L.mrp + "). Amazon will refuse it."); return; }
    var msg = "Change Amazon selling price?\n\n" + it.name + "\nSKU " + L.sku + (L.asin ? " · ASIN " + L.asin : "") + "\n\n" + inr(L.price) + "  →  ₹" + v +
      (L.price && v < L.price * 0.7 ? "\n\n⚠ This is more than 30% below the current price." : "") + "\n\nAmazon is updated at the next sync (about 15 min).";
    if (!confirm(msg)) return;
    fbDb.collection("spapiPriceUpdates").doc(L.acct + "_" + L.sku).set({ account: L.acct, sku: L.sku, asin: L.asin || null, oldPrice: L.price == null ? null : L.price, newPrice: v, status: "pending", source: "console", requestedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { inp.value = ""; })
      .catch(function (e) { alert("Not saved — check internet. " + (e.message || e)); });
  }

  function render() {
    var sel = 0, bad = 0, done = 0, loss = 0;
    lastRows.forEach(function (r) { if (r.sel) sel++; if (r.state !== "ok") bad++; if (exported[r.id]) done++; if (r.loss) loss++; });
    document.getElementById("nbKpis").innerHTML =
      kpi("Orders on this date", lastRows.length, "") + kpi("Selected for file", sel, "nb-ok") + kpi("Loss orders", loss, loss ? "nb-bad" : "") +
      kpi("Need a fix", bad, bad ? "nb-bad" : "") + kpi("Already downloaded", done, done ? "nb-warnk" : "");
    var body = document.getElementById("nbBody");
    body.innerHTML = lastRows.length ? lastRows.map(function (r, i) {
      var o = r.o, ok = r.state === "ok", when = exported[r.id];
      var tag = !ok || (r.loss && !when) ? "nb-tag-bad" : when ? "nb-tag-warn" : "nb-tag-ok";
      var note = !ok ? r.note : r.loss && !when ? "Loss — tick to ship" : when ? "Downloaded " + new Date(when).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Ready";
      return '<tr class="' + (r.sel ? "" : "nb-row-out") + (r.loss ? " nb-row-loss" : "") + '">' +
        '<td><input type="checkbox" class="nb-sel" data-i="' + i + '"' + (r.sel ? " checked" : "") + (ok ? "" : " disabled") + "></td>" +
        '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(account(o.channel)) + "</div>" +
          '<div style="margin-top:5px;">' + (r.isCod ? '<span class="nb-pay nb-cod">COD ₹' + r.cod.toLocaleString("en-IN") + "</span>" : '<span class="nb-pay">Prepaid</span>') + "</div>" + '<div style="margin-top:5px;">' + lossTag(r) + "</div></td>" +
        '<td><div class="nb-name">' + esc(o.buyerName || "") + '</div>' +
          '<div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerPincode].filter(Boolean).join(" · ")) + "</div></td>" +
        '<td class="nb-items">' + r.items.map(function (it, j) { return itemCell(r, it, i, j); }).join("") + "</td>" +
        '<td><input type="number" step="0.01" min="0.01" class="nb-w" data-i="' + i + '" value="' + r.weight + '"></td>' +
        '<td><span class="nb-tag ' + tag + '">' + esc(note) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="6" class="nb-muted" style="text-align:center;padding:22px !important;">No orders for this SLA date.</td></tr>';
    body.querySelectorAll(".nb-w").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var r = lastRows[+inp.dataset.i], w = num(inp.value);
        if (!(w > 0)) { inp.value = r.weight; return; }
        r.weight = r2(w);
        if (r.items.length === 1 && r.items[0].sku) { settings.skuWeights[r.items[0].sku] = r2(w / r.items[0].qty); saveSettings(); }
      });
    });
    body.querySelectorAll(".nb-sel").forEach(function (cb) {
      cb.addEventListener("change", function () { var r = lastRows[+cb.dataset.i]; r.sel = cb.checked; r.touched = true; render(); });
    });
    body.querySelectorAll(".nb-push").forEach(function (b) {
      b.addEventListener("click", function () { pushPrice(+b.dataset.i, +b.dataset.j, b.previousElementSibling); });
    });
    body.querySelectorAll(".nb-np").forEach(function (inp) {
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") pushPrice(+inp.dataset.i, +inp.dataset.j, inp); });
    });
    var okRows = lastRows.filter(function (r) { return r.state === "ok" && !r.loss; });
    var all = document.getElementById("nbAll");
    all.checked = okRows.length > 0 && okRows.every(function (r) { return r.sel; });
    document.getElementById("nbResult").style.display = "block";
    document.getElementById("nbDownload").disabled = !sel;
    document.getElementById("nbDlNote").textContent = sel ? sel + " order(s) will go in the file." : "Select at least one order.";
  }
  function kpi(l, n, cls) { return '<div class="nb-kpi ' + cls + '"><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
  function markExported(ids) {
    var now = Date.now(), cut = now - 20 * 864e5, next = {};
    Object.keys(exported).forEach(function (k) { if (exported[k] > cut) next[k] = exported[k]; });
    ids.forEach(function (k) { next[k] = now; });
    exported = next;
    if (expRef) expRef.set({ ids: next }).catch(function (e) { console.warn("Nimbus exported save failed", e); });
  }

  /* ---------- file (same columns as NimbusPost's Bulk_Order_Upload sample) ---------- */
  function download() {
    var pick = String(settings.pickupId || "").trim();
    if (!pick) { alert("Enter your NimbusPost Pickup Address ID in Shipment defaults first."); document.getElementById("nbPickup").focus(); return; }
    var rows = lastRows.filter(function (r) { return r.sel && r.state === "ok"; });
    // A→Z by product name, so labels for the same product come out together
    var iname = function (it) { return String(it.name || it.sku || "").trim().toLowerCase(); };
    rows.forEach(function (r) { r._its = r.items.slice().sort(function (x, y) { return iname(x).localeCompare(iname(y), "en", { numeric: true, sensitivity: "base" }); }); });
    var pname = function (r) { return r._its.map(iname).join(" | "); };
    rows = rows.slice().sort(function (a, b) {
      return pname(a).localeCompare(pname(b), "en", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
    });
    if (!rows.length) return;
    if (!confirmLoss(rows)) return;
    var again = rows.filter(function (r) { return exported[r.id]; }).length;
    if (again && !confirm(again + " selected order(s) were already downloaded before. Include them again?")) return;
    var maxSku = Math.max(2, Math.max.apply(null, rows.map(function (r) { return r.items.length; })));
    var head = ["Order ID", "Order Date", "Order Tags", "Channel", "Pickup Address ID*", "Is Document (Yes/No)*", "Payment Method (COD/Prepaid)*", "Buyer's Full Name*", "Buyer's Email", "Buyer's Mobile No.*", "Buyer's GSTIN", "E-way Bill Number", "Shipping Complete Address*", "Shipping Address Landmark", "Shipping Address State*", "Shipping Address City*", "Shipping Address Pincode*", "Billing Full Name", "Billing Email", "Billing Mobile No.", "Billing Complete Address", "Billing Landmark", "Billing State", "Billing City", "Billing Pincode", "Resller Name", "Shipment Weight (Kgs)*", "Shipment Length (cm)*", "Shipment Breadth (cm)*", "Shipment Height (cm)*", "Partial COD (Yes/No)", "Collectable Amount", "Shipping Charges", "COD Charges", "Total Discount", "Other Charges"];
    for (var k = 1; k <= maxSku; k++) {
      var star = k === 1 ? "*" : "";
      head.push("Product SKU (" + k + ")", "Product Name (" + k + ")" + star, "Product Quantity (" + k + ")" + star, "Product Unit Price (" + k + ")" + star, "Product Discount (" + k + ")", "Product HSN Code (" + k + ")", "Product Tax % (" + k + ")");
    }
    head.push("(Upto 10 SKUs)");
    var out = [head];
    rows.forEach(function (r) {
      var o = r.o, email = String(o.buyerEmail || "").trim();
      var line = [r.id, fmtDate(o.orderDate), account(o.channel), "Manual", pick, "No", r.isCod ? "COD" : "Prepaid",
        String(o.buyerName || "").trim(), /@/.test(email) ? email : "", phone10(o.buyerPhone), "", "",
        r.addr, "", String(o.buyerState || "").trim(), String(o.buyerCity || "").trim(), String(o.buyerPincode || "").trim(),
        "", "", "", "", "", "", "", "", "",
        r.weight, num(settings.l) || DEF.l, num(settings.b) || DEF.b, num(settings.h) || DEF.h,
        "No", r.isCod ? r.cod : 0, r.ship, 0, 0, 0];
      for (var k = 0; k < maxSku; k++) {
        var it = r._its[k];
        if (it) line.push(it.sku, it.name, it.qty, r2(it.price), 0, it.hsn, it.tax || "");
        else line.push("", "", "", "", "", "", "");
      }
      line.push("");
      out.push(line);
    });
    var csv = out.map(function (row) {
      return row.map(function (v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
    var d = new Date(), stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + "_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "NimbusPost_Bulk_Orders_" + stamp + ".csv";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    markExported(rows.map(function (r) { return r.id; }));
    rows.forEach(function (r) { r.sel = false; r.touched = true; });
    render();
    document.getElementById("nbDlNote").textContent = "Downloaded " + rows.length + " order(s). Upload it in NimbusPost → Orders → Bulk Upload.";
  }

  document.getElementById("nbDownload").addEventListener("click", download);
  document.getElementById("nbRefresh").addEventListener("click", build);
  document.getElementById("nbAcct").addEventListener("change", function (e) { selAcct = e.target.value; renderDates(); });
  document.getElementById("nbAll").addEventListener("change", function (e) {
    lastRows.forEach(function (r) { if (r.state === "ok" && (!r.loss || !e.target.checked)) { r.sel = e.target.checked; r.touched = true; } }); render();
  });
  // keep the list fresh while the panel is open (OMS syncs every ~10 min)
  setInterval(function () { if (panel.style.display === "block" && document.activeElement && !document.activeElement.classList.contains("nb-w") && !document.activeElement.classList.contains("nb-np")) buildPool(); }, 60000);
  window.__nimbusBuild = build; window.__nimbusRows = function () { return lastRows; };
})();

/* ===== Self-Ship → NimbusPost: one label PDF per SLA date (sorted A→Z, product name + QTY printed) ===== */
(function () {
  if (window.__aikmNbLabels) return; window.__aikmNbLabels = true;
  var LAST = "aikm_nb_label_job";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var unsub = null, busy = false, autoOpen = {};

  function mount() {
    var panel = document.getElementById("selfshipNimbusPanel");
    if (!panel || document.getElementById("nlCard")) return !!panel;
    var card = document.createElement("div");
    card.className = "card nb-card"; card.id = "nlCard"; card.style.marginTop = "16px";
    card.innerHTML =
      '<div class="nb-head"><div><div class="nb-kicker">NIMBUSPOST · SHIPPING LABELS</div>' +
      '<div class="nb-title">Download labels with product names</div>' +
      '<div class="nb-sub">Takes every order of the SLA date that is already shipped in NimbusPost, sorts the labels A→Z by product (multi-product orders at the end) and prints the product name + QTY on each label. It runs on the server — you can switch tabs or close the console while it works.</div></div></div>' +
      '<div class="nl-row">' +
        '<label class="nl-f"><span class="nb-lbl">SLA date</span><input type="date" id="nlDate"></label>' +
        '<label class="nl-f"><span class="nb-lbl">Account</span><select id="nlAcct"><option value="">All accounts</option></select></label>' +
        '<label class="nl-chk"><input type="checkbox" id="nlNew" checked> Only labels not downloaded before</label>' +
        '<button type="button" id="nlGo" class="btn-gold"><i class="ti ti-printer"></i> Download labels</button>' +
      '</div>' +
      '<div id="nlStatus" class="nl-status" style="display:none;"></div>';
    panel.appendChild(card);
    var d = document.getElementById("nlDate"); d.value = today();
    var a = document.getElementById("nlAcct");
    function fillAcct() {
      var src = document.getElementById("nbAcct"); if (!src) return;
      var cur = a.value; a.innerHTML = src.innerHTML; a.value = cur;
    }
    a.addEventListener("mousedown", fillAcct); a.addEventListener("focus", fillAcct); fillAcct();
    document.getElementById("nlGo").addEventListener("click", start);
    try { var last = localStorage.getItem(LAST); if (last) watch(last, false); } catch (e) {}
    return true;
  }
  var mt = setInterval(function () { if (mount()) clearInterval(mt); }, 1500);

  function show(html, cls) {
    var s = document.getElementById("nlStatus"); if (!s) return;
    s.style.display = "block"; s.className = "nl-status " + (cls || ""); s.innerHTML = html;
  }
  function btn(on) { var b = document.getElementById("nlGo"); if (b) { b.disabled = !on; b.innerHTML = on ? '<i class="ti ti-printer"></i> Download labels' : '<i class="ti ti-loader-2 nl-spin"></i> Working…'; } }
  function download(url) { var x = document.createElement("a"); x.href = url; x.rel = "noopener"; document.body.appendChild(x); x.click(); setTimeout(function () { x.remove(); }, 500); }

  function watch(id, fresh) {
    if (typeof fbDb === "undefined" || !fbDb) return;
    if (unsub) unsub();
    if (fresh) autoOpen[id] = true;
    unsub = fbDb.collection("labelJobs").doc(id).onSnapshot(function (doc) {
      if (!doc.exists) { if (!fresh) { try { localStorage.removeItem(LAST); } catch (e) {} } return; }
      var j = doc.data(), st = j.status || "queued", when = j.updatedAt && j.updatedAt.toDate ? j.updatedAt.toDate() : null;
      var head = '<b>SLA ' + esc(j.sla || "") + (j.acct ? " · " + esc(j.acct) : "") + "</b> — ";
      if (st === "queued" || st === "running") {
        busy = true; btn(false);
        show(head + esc(j.step || "Starting on the server…") + ' <span class="nb-muted">(about 1 minute per 200 labels)</span>', "run");
        return;
      }
      busy = false; btn(true);
      if (st === "failed") { show(head + "could not make the labels. " + esc(j.step || ""), "bad"); return; }
      var extra = [];
      if (j.missingCount) extra.push(j.missingCount + " order(s) of this date are not in NimbusPost (Easy Ship or not shipped yet)");
      if (j.skippedPrinted) extra.push(j.skippedPrinted + " already downloaded before (untick “Only labels not downloaded before” to include them)");
      if (j.noLabel && j.noLabel.length) extra.push(j.noLabel.length + " label(s) NimbusPost did not return: " + esc(j.noLabel.slice(0, 5).join(", ")));
      var fresh24 = when && Date.now() - when.getTime() < 23 * 3600e3;
      if (j.url && fresh24) {
        show(head + '<b>' + j.count + " labels ready</b> " + (when ? '<span class="nb-muted">· ' + when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + "</span>" : "") +
          ' <a class="nl-dl" href="' + esc(j.url) + '" rel="noopener"><i class="ti ti-download"></i> Download PDF' + (j.sizeKb ? " (" + (j.sizeKb / 1024).toFixed(1) + " MB)" : "") + "</a>" +
          (extra.length ? '<div class="nl-extra">' + extra.join("<br>") + "</div>" : ""), "ok");
        if (autoOpen[doc.id]) { delete autoOpen[doc.id]; download(j.url); }
      } else if (j.url) {
        show(head + "the download link has expired (24 h). Click Download labels again.", "");
      } else {
        show(head + esc(j.step || "No labels.") + (extra.length ? '<div class="nl-extra">' + extra.join("<br>") + "</div>" : ""), "");
      }
    }, function () {});
  }

  async function start() {
    if (busy) return;
    var sla = document.getElementById("nlDate").value, acct = document.getElementById("nlAcct").value, onlyNew = document.getElementById("nlNew").checked;
    if (!sla) { alert("Pick the SLA date first."); return; }
    if (typeof fbDb === "undefined" || !fbDb) { alert("Still connecting — try again in a few seconds."); return; }
    if (typeof window.aikmGhDispatch !== "function") { alert("Please reload the console (Ctrl + Shift + R) and try again."); return; }
    busy = true; btn(false); show("<b>SLA " + esc(sla) + "</b> — starting on the server…", "run");
    try {
      var ref = fbDb.collection("labelJobs").doc();
      await ref.set({ sla: sla, acct: acct, onlyNew: onlyNew, status: "queued", step: "Waiting for the server…", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      try { localStorage.setItem(LAST, ref.id); } catch (e) {}
      watch(ref.id, true);
      await window.aikmGhDispatch("nimbus-labels.yml", { job_id: ref.id });
    } catch (e) {
      busy = false; btn(true); show("Could not start: " + esc(e.message || e), "bad");
    }
  }

  var st = document.createElement("style");
  st.textContent = "@media screen{" +
    "html#aikm body .nl-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:16px;}" +
    "html#aikm body .nl-f{display:flex;flex-direction:column;}html#aikm body .nl-f input,html#aikm body .nl-f select{min-width:170px;}" +
    "html#aikm body .nl-chk{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--x-text-2);padding-bottom:9px;cursor:pointer;}" +
    "html#aikm body .nl-chk input{width:16px;height:16px;accent-color:var(--x-gold);margin:0;}" +
    "html#aikm body .nl-status{margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12.5px;color:var(--x-text);line-height:1.6;}" +
    "html#aikm body .nl-status.run{border-color:var(--x-gold-line);background:var(--x-gold-soft);}" +
    "html#aikm body .nl-status.ok{border-color:color-mix(in srgb,var(--x-green) 35%,transparent);background:var(--x-green-soft);}" +
    "html#aikm body .nl-status.bad{border-color:color-mix(in srgb,var(--x-red) 35%,transparent);background:var(--x-red-soft);color:var(--x-red);}" +
    "html#aikm body a.nl-dl{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:6px 14px;border-radius:8px;background:var(--x-gold);color:#1A1405 !important;font-weight:600;text-decoration:none;}" +
    "html#aikm body .nl-extra{margin-top:6px;font-size:11.5px;color:var(--x-muted);}" +
    "html#aikm body .nl-spin{display:inline-block;animation:nlspin 1s linear infinite;}@keyframes nlspin{to{transform:rotate(360deg);}}" +
    "}";
  document.head.appendChild(st);
})();

/* ===== Self-Ship → Amazon shipping confirmation: pick orders by SLA date (no pasting) ===== */
(function () {
  var tab = document.getElementById("tab-selfship");
  var ta = document.getElementById("orderIdsInput");
  if (!tab || !ta || document.getElementById("cfBlock")) return;
  var card = ta.closest(".card");
  card.classList.add("cf-card");
  var lbl = card.querySelector(".rt-label"); if (lbl) lbl.textContent = "Orders to confirm";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nid(v) { return String(v || "").replace(/^`+/, "").replace(/\s+/g, "").trim(); }
  function phone10(p) { var d = String(p || "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; }
  function account(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
  function ymd(s) { var d = new Date(String(s || "").replace(/\s+\d{1,2}:\d{2}.*$/, "")); return isNaN(d) ? "" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function todayYmd() { return ymd(new Date().toDateString()); }
  function niceDay(k) {
    var p = k.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]), tm = new Date(); tm.setDate(tm.getDate() + 1);
    var label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (k === todayYmd()) return "Today · " + label;
    if (k === ymd(tm.toDateString())) return "Tomorrow · " + label;
    return d.toLocaleDateString("en-IN", { weekday: "short" }) + " · " + label;
  }

  /* cloud: NimbusPost AWB index (1 doc) + "file already made" marks */
  var nimbus = {}, made = {}, nbRef = null, mkRef = null, nimbusAt = null;
  function hook() {
    if (nbRef || typeof fbDb === "undefined" || !fbDb) return;
    nbRef = fbDb.collection("nimbusIndex").doc("byOrder");
    nbRef.onSnapshot(function (d) {
      nimbus = {}; var o = (d.exists && d.data().orders) || {};
      Object.keys(o).forEach(function (k) { nimbus[nid(k)] = o[k]; });
      nimbusAt = d.exists && d.data().updatedAt && d.data().updatedAt.toDate ? d.data().updatedAt.toDate() : null;
      if (visible()) buildPool();
    }, function (e) { console.warn("Nimbus index read error", e); });
    mkRef = fbDb.collection("aikm_admin").doc("confirmMade");
    mkRef.onSnapshot(function (d) { made = (d.exists && d.data().ids) || {}; if (visible()) renderDates(); }, function () {});
  }
  var ht = setInterval(function () { hook(); if (nbRef) clearInterval(ht); }, 3000);
  function visible() { return card.offsetParent !== null; }

  /* UI */
  var box = document.createElement("div");
  box.id = "cfBlock";
  box.innerHTML =
    '<div class="nb-sub" style="margin:0 0 12px;">Pick an SLA date. Every Amazon self-ship order due that day is listed with its tracking number (from OMS, NimbusPost or Fake ship). Tick the ones to confirm, then create the files — one file per seller account.</div>' +
    '<div class="nb-lbl">SLA date <span class="nb-muted" id="cfPoolNote"></span></div>' +
    '<div class="nb-chips" id="cfDates"></div>' +
    '<div class="nb-filter-row"><select id="cfAcct"><option value="">All accounts</option></select>' +
    '<button type="button" id="cfRefresh"><i class="ti ti-refresh"></i> Refresh</button>' +
    '<button type="button" id="cfUpload" title="Use when NimbusPost AWBs are not synced yet"><i class="ti ti-upload"></i> Upload NimbusPost export</button>' +
    '<span class="nb-muted" id="cfUpNote"></span></div>' +
    '<div class="nb-kpis" id="cfKpis"></div>' +
    '<div class="table-scroll"><table class="data" id="cfTable"><thead><tr>' +
      '<th style="width:28px;"><input type="checkbox" id="cfAll" title="Select all"></th><th>Order</th><th>Buyer</th><th>Items</th><th>Tracking</th><th>Status</th>' +
    '</tr></thead><tbody id="cfBody"></tbody></table></div>' +
    '<div class="nb-actions"><button type="button" id="cfMake" class="btn-gold"><i class="ti ti-file-check"></i> Create confirmation files</button><span class="nb-muted" id="cfNote"></span></div>';
  var rt = card.querySelector(".rule-title");
  card.insertBefore(box, rt ? rt.nextSibling : card.firstChild);

  var pool = [], rows = [], selDate = "", selAcct = "";
  function lossInfo(live) {
    var p = live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0);
    var l = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
    return { loss: !!l, profit: Math.round(p * 100) / 100 };
  }
  function lossTag(r) { return r.loss ? '<span class="nb-loss">LOSS · ₹' + r.profit.toLocaleString("en-IN") + "</span>" : '<span class="nb-muted nb-small">Profit ₹' + r.profit.toLocaleString("en-IN") + "</span>"; }
  function confirmLoss(list) {
    var L = list.filter(function (r) { return r.loss; });
    if (!L.length) return true;
    var tot = L.reduce(function (s, r) { return s + r.profit; }, 0);
    return confirm("⚠ " + L.length + " LOSS order(s) selected (total profit ₹" + (Math.round(tot * 100) / 100).toLocaleString("en-IN") + "):\n\n" +
      L.slice(0, 15).map(function (r) { return "• " + r.id + "  ₹" + r.profit; }).join("\n") + (L.length > 15 ? "\n…" : "") + "\n\nShip these loss orders anyway?");
  }

  function trackFor(id, o) {
    if (typeof fakeShipEntries !== "undefined" && fakeShipEntries && fakeShipEntries[id] && fakeShipEntries[id].tracking) return { awb: fakeShipEntries[id].tracking, c: fakeShipEntries[id].courier || "", src: "Fake ship" };
    if (String(o.awb || "").trim()) return { awb: o.awb, c: o.courier || "", src: "OMS" };
    if (typeof fallbackIndex !== "undefined" && fallbackIndex && fallbackIndex[id]) return { awb: fallbackIndex[id].tracker, c: fallbackIndex[id].carrier || "", src: "Uploaded file" };
    var n = nimbus[id];
    if (n && n.a && !/cancel/.test(n.s || "")) return { awb: n.a, c: n.c || "", src: "NimbusPost" };
    return null;
  }
  function buildPool() {
    var data = window.omsOrdersRaw || (typeof omsOrdersRaw !== "undefined" ? omsOrdersRaw : []);
    var by = {};
    data.forEach(function (o) {
      if (!/amazon/i.test(o.channel || "") || phone10(o.buyerPhone).length < 10) return;
      if (!/^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || "").trim())) return;
      var k = nid(o.channelOrderId); if (k) (by[k] = by[k] || []).push(o);
    });
    var keep = {}; pool.forEach(function (r) { keep[r.id] = r; });
    pool = Object.keys(by).map(function (id) {
      var o = by[id][0], items = {};
      by[id].forEach(function (x) { var k = x.productName || x.sku; items[k] = (items[k] || 0) + (parseFloat(x.qty) || 1); });
      var r = { id: id, o: o, sla: ymd(o.slaDate), items: items, t: trackFor(id, o) };
      var li = lossInfo(by[id]); r.loss = li.loss; r.profit = li.profit;
      if (keep[id] && keep[id].touched && !!keep[id].t === !!r.t) { r.sel = keep[id].sel; r.touched = true; }
      return r;
    });
    var accts = {}; pool.forEach(function (r) { accts[account(r.o.channel)] = 1; });
    var sel = document.getElementById("cfAcct");
    sel.innerHTML = '<option value="">All accounts</option>' + Object.keys(accts).sort().map(function (a) { return "<option" + (a === selAcct ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
    var withT = pool.filter(function (r) { return r.t; }).length;
    document.getElementById("cfPoolNote").textContent = data.length ? "· " + pool.length + " self-ship orders not yet shipped · " + withT + " have tracking" : "· OMS data loading…";
    renderDates();
  }
  function renderDates() {
    var t = todayYmd(), counts = {}, over = 0;
    pool.forEach(function (r) { if (selAcct && account(r.o.channel) !== selAcct) return; if (r.sla && r.sla < t) over++; else counts[r.sla || "none"] = (counts[r.sla || "none"] || 0) + 1; });
    var keys = Object.keys(counts).sort();
    var opts = (over ? [["overdue", "Overdue", over]] : []).concat(keys.map(function (k) { return [k, k === "none" ? "No SLA date" : niceDay(k), counts[k]]; }));
    if (!opts.some(function (o) { return o[0] === selDate; })) selDate = opts.length ? (counts[t] ? t : opts[0][0]) : "";
    document.getElementById("cfDates").innerHTML = opts.length ? opts.map(function (o) {
      return '<button type="button" class="nb-chip' + (o[0] === selDate ? " on" : "") + (o[0] === "overdue" ? " over" : "") + '" data-k="' + o[0] + '">' + esc(o[1]) + " <span>" + o[2] + "</span></button>";
    }).join("") : '<span class="nb-muted">No self-ship orders waiting right now.</span>';
    document.querySelectorAll("#cfDates .nb-chip").forEach(function (b) { b.addEventListener("click", function () { selDate = b.dataset.k; renderDates(); }); });
    var tt = todayYmd();
    rows = pool.filter(function (r) {
      if (selAcct && account(r.o.channel) !== selAcct) return false;
      if (selDate === "overdue") return r.sla && r.sla < tt;
      if (selDate === "none") return !r.sla;
      return r.sla === selDate;
    }).sort(function (a, b) { return (b.loss - a.loss) || (!!b.t - !!a.t) || account(a.o.channel).localeCompare(account(b.o.channel)) || a.id.localeCompare(b.id); });
    rows.forEach(function (r) { if (!r.t) r.sel = false; else if (!r.touched) r.sel = !made[r.id] && !r.loss; });
    render();
  }
  function kpi(l, n, cls) { return '<div class="nb-kpi ' + cls + '"><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
  function render() {
    var sel = 0, noT = 0, dn = 0, loss = 0;
    rows.forEach(function (r) { if (r.sel) sel++; if (!r.t) noT++; if (made[r.id]) dn++; if (r.loss) loss++; });
    document.getElementById("cfKpis").innerHTML = kpi("Orders on this date", rows.length, "") + kpi("Selected", sel, "nb-ok") + kpi("Loss orders", loss, loss ? "nb-bad" : "") +
      kpi("Waiting for AWB", noT, noT ? "nb-warnk" : "") + kpi("File already made", dn, "");
    var body = document.getElementById("cfBody");
    body.innerHTML = rows.length ? rows.map(function (r, i) {
      var o = r.o, when = made[r.id];
      var tag = !r.t ? '<span class="nb-tag nb-tag-warn">Waiting for AWB</span>' : when
        ? '<span class="nb-tag nb-tag-mute">File made ' + esc(new Date(when).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + "</span>"
        : r.loss ? '<span class="nb-tag nb-tag-bad">Loss — tick to ship</span>' : '<span class="nb-tag nb-tag-ok">Ready</span>';
      return '<tr class="' + (r.sel ? "" : "nb-row-out") + (r.loss ? " nb-row-loss" : "") + '"><td><input type="checkbox" class="cf-sel" data-i="' + i + '"' + (r.sel ? " checked" : "") + (r.t ? "" : " disabled") + "></td>" +
        '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(account(o.channel)) + '</div><div style="margin-top:5px;">' + lossTag(r) + "</div></td>" +
        '<td><div class="nb-name">' + esc(o.buyerName || "") + '</div><div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerPincode].filter(Boolean).join(", ")) + "</div></td>" +
        '<td class="nb-items">' + Object.keys(r.items).map(function (k) { return "<div>" + esc(k) + " <b>× " + r.items[k] + "</b></div>"; }).join("") + "</td>" +
        "<td>" + (r.t ? '<div class="cx-awb">' + esc(r.t.awb) + '</div><div class="nb-muted nb-small">' + esc((r.t.c ? r.t.c + " · " : "") + "from " + r.t.src) + "</div>" : '<span class="nb-muted">—</span>') + "</td>" +
        "<td>" + tag + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="nb-muted" style="text-align:center;padding:22px !important;">No orders for this SLA date.</td></tr>';
    body.querySelectorAll(".cf-sel").forEach(function (cb) { cb.addEventListener("change", function () { var r = rows[+cb.dataset.i]; r.sel = cb.checked; r.touched = true; render(); }); });
    var okRows = rows.filter(function (r) { return r.t && !r.loss; });
    document.getElementById("cfAll").checked = okRows.length > 0 && okRows.every(function (r) { return r.sel; });
    document.getElementById("cfMake").disabled = !sel;
    document.getElementById("cfNote").textContent = sel ? sel + " order(s) selected." : noT && !okRows.length ? "No AWBs yet for this date — create shipments in NimbusPost first." : "Select at least one order.";
  }
  function make() {
    var pick = rows.filter(function (r) { return r.sel && r.t; });
    if (!pick.length) return;
    if (!confirmLoss(pick)) return;
    var again = pick.filter(function (r) { return made[r.id]; }).length;
    if (again && !confirm(again + " selected order(s) already had a confirmation file made. Include them again?")) return;
    // NimbusPost AWBs feed the existing generator as its tracking fallback
    var fb = (typeof fallbackIndex !== "undefined" && fallbackIndex) ? fallbackIndex : {};
    pick.forEach(function (r) { if (r.t.src === "NimbusPost" && !fb[r.id]) fb[r.id] = { tracker: r.t.awb, carrier: r.t.c }; });
    fallbackIndex = fb;
    ta.value = pick.map(function (r) { return r.id; }).join("\n");
    processSelectedOrders();
    var now = Date.now(), cut = now - 20 * 864e5, next = {};
    Object.keys(made).forEach(function (k) { if (made[k] > cut) next[k] = made[k]; });
    pick.forEach(function (r) { next[r.id] = now; r.sel = false; r.touched = true; });
    made = next;
    if (mkRef) mkRef.set({ ids: next }).catch(function (e) { console.warn("confirmMade save failed", e); });
    render();
    var cl = document.getElementById("channelList");
    if (cl) setTimeout(function () { cl.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150);
  }

  document.getElementById("cfAcct").addEventListener("change", function (e) { selAcct = e.target.value; renderDates(); });
  document.getElementById("cfRefresh").addEventListener("click", buildPool);
  document.getElementById("cfAll").addEventListener("change", function (e) { rows.forEach(function (r) { if (r.t && (!r.loss || !e.target.checked)) { r.sel = e.target.checked; r.touched = true; } }); render(); });
  document.getElementById("cfMake").addEventListener("click", make);
  var up = document.getElementById("azFileInput2");
  document.getElementById("cfUpload").addEventListener("click", function () { if (up) up.click(); });
  if (up) up.addEventListener("change", function () {
    setTimeout(function () {
      var n = (typeof fallbackIndex !== "undefined" && fallbackIndex) ? Object.keys(fallbackIndex).length : 0;
      document.getElementById("cfUpNote").textContent = n ? n + " AWBs loaded from file" : "";
      buildPool();
    }, 1200);
  });
  // first load + keep fresh while visible
  var tries = 0, boot = setInterval(function () { tries++; if ((window.omsOrdersRaw || []).length || tries > 60) { clearInterval(boot); buildPool(); } }, 1000);
  document.addEventListener("click", function (e) { if (e.target.closest('.tabbtn[data-tab="selfship"], #fsTabGenerate')) setTimeout(function () { hook(); buildPool(); }, 50); });
  setInterval(function () { if (visible()) buildPool(); }, 60000);
})();

/* ===== NimbusPost Shipments tab: status, pending pickup, delayed deliveries ===== */
(function () {
  var bar = document.getElementById("mainTabbar"), content = document.querySelector(".app-content");
  if (!bar || !content || document.getElementById("tab-nimbusdash")) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nid(v) { return String(v || "").replace(/^`+/, "").replace(/^#/, "").replace(/\s+/g, "").trim(); }
  function pd(s) { if (!s) return null; s = String(s); if (/T\d\d:\d\d:\d\d$/.test(s)) s += "Z"; var d = new Date(s.replace(" ", "T")); if (isNaN(d)) d = new Date(s); return isNaN(d) ? null : d; }
  function dshort(d) { return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"; }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  var DELAY_DAYS = 5; // no EDD from courier → in transit longer than this counts as delayed

  /* ---- sidebar button + panel + page header ---- */
  var after = bar.querySelector('.tabbtn[data-tab="selfship"]');
  var btn = document.createElement("button");
  btn.className = "tabbtn"; btn.dataset.tab = "nimbusdash";
  btn.innerHTML = '<i class="ti ti-truck tab-ic"></i>Nimbus Tracking<span class="rtab-count" id="ndSideCount" style="display:none">0</span>';
  bar.insertBefore(btn, after ? after.nextSibling : null);

  var sub = document.createElement("div");
  sub.className = "subtabbar no-print"; sub.id = "subtab-nimbusdash"; sub.style.display = "none";
  sub.innerHTML = '<span class="subtab-label">NimbusPost Shipments</span><span id="ndSynced">Not synced yet</span>';
  var firstPanel = content.querySelector(".tabpanel");
  content.insertBefore(sub, firstPanel);

  var panel = document.createElement("div");
  panel.id = "tab-nimbusdash"; panel.className = "tabpanel";
  panel.innerHTML =
    '<div id="ndSetup" class="panel nd-setup" style="display:none;"></div>' +
    '<div class="nd-kpis" id="ndKpis"></div>' +
    '<div class="panel nd-days-panel" id="ndDaysPanel"><div class="nd-days-head"><div><div class="nb-kicker">PICKUP → IN TRANSIT · DATE-WISE</div>' +
      '<div class="nd-days-title">Did every shipment leave with the courier?</div>' +
      '<div class="nb-muted">Booked = created in NimbusPost that day. Handed over = scanned in Courier Manifest that day. Anything handed over but still “pickup pending” the next day is an error.</div></div></div>' +
      '<div class="table-scroll"><table class="data nd-days"><thead><tr><th>Date</th><th>Booked</th><th>Picked / in transit</th><th>Pickup pending</th><th>Handed over (scanned)</th><th>Handed over, not picked</th></tr></thead><tbody id="ndDays"></tbody></table></div></div>' +
    '<div class="panel">' +
      '<div class="nd-filters">' +
        '<input type="text" id="ndSearch" placeholder="Search AWB, order ID, customer, city…">' +
        '<div class="ms" id="ndCourier" data-ph="All couriers" data-unit="courier"></div>' +
        '<div class="ms" id="ndAcct" data-ph="All accounts" data-unit="account"></div>' +
        '<div class="ms" id="ndProd" data-ph="All products" data-unit="product"></div>' +
        '<input type="date" id="ndFrom" title="Booked from"><span class="nb-muted">to</span><input type="date" id="ndTo" title="Booked to">' +
        '<button type="button" id="ndExport"><i class="ti ti-download"></i> Excel</button>' +
      '</div>' +
      '<div class="nd-active" id="ndActive"></div>' +
      '<div class="nd-bulk" id="ndBulk" style="display:none;"></div>' +
      '<div class="table-scroll"><table class="data" id="ndTable"><thead><tr>' +
        '<th class="nd-cb"><input type="checkbox" id="ndAllCb" title="Select all on this page"></th><th>AWB</th><th>Order</th><th>Product</th><th>Customer</th><th>Courier</th><th>Status</th><th>Booked</th><th>EDD</th><th>Age</th>' +
      '</tr></thead><tbody id="ndBody"></tbody></table></div>' +
      '<div class="nd-pager" id="ndPager"></div>' +
    '</div>';
  var lastPanel = content.querySelectorAll(".tabpanel"); lastPanel = lastPanel[lastPanel.length - 1];
  lastPanel.parentNode.insertBefore(panel, lastPanel.nextSibling);

  btn.addEventListener("click", function () {
    document.querySelectorAll(".tabbtn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tabpanel").forEach(function (p) { p.classList.remove("active"); });
    document.querySelectorAll(".subtabbar").forEach(function (s) { s.style.display = "none"; });
    btn.classList.add("active"); panel.classList.add("active"); sub.style.display = "flex";
    try { document.body.classList.remove("sidebar-open"); document.getElementById("appSidebarBackdrop").classList.remove("show"); } catch (e) {}
    start(); render();
  });

  /* ---- data ---- */
  var rows = [], chunks = {}, meta = null, unsub = null, filter = "all", page = 0, PAGE = 100, dayF = null;
  /* AWBs handed over to the courier (Courier Manifest → Save & Clear), last 10 days */
  var HV_DAYS = 10, hv = {}, hvAt = 0, hvBusy = false;
  function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nawb(v) { return String(v || "").replace(/^`+/, "").replace(/\s+/g, "").toUpperCase(); }
  function loadHandover(force) {
    if (hvBusy || typeof fbDb === "undefined" || !fbDb) return;
    if (!force && Date.now() - hvAt < 15 * 60000) return;
    hvBusy = true;
    fbDb.collection("aikm_admin").doc("data").collection("manifestHistory").where("closedAt", ">=", Date.now() - HV_DAYS * 864e5).get().then(function (snap) {
      var m = {};
      snap.forEach(function (d) {
        var h = d.data(), day = h.day || dayKey(new Date(h.closedAt));
        (h.awbs || []).forEach(function (a) { var k = nawb(a.awb); if (k && (!m[k] || m[k].at < h.closedAt)) m[k] = { day: day, at: h.closedAt, courier: a.courier || "" }; });
      });
      hv = m; hvAt = Date.now(); hvBusy = false;
      rows = rows.map(function (x) { return enrich(x.r); }); render();
    }).catch(function (e) { hvBusy = false; console.warn("Manifest history read error", e); });
  }
  function start() {
    loadHandover(false);
    if (unsub || typeof fbDb === "undefined" || !fbDb) { if (!unsub) setTimeout(start, 2000); return; }
    unsub = fbDb.collection("nimbusDash").onSnapshot(function (snap) {
      snap.docChanges().forEach(function (c) {
        if (c.doc.id === "_meta") { meta = c.type === "removed" ? null : c.doc.data(); return; }
        if (c.type === "removed") delete chunks[c.doc.id]; else chunks[c.doc.id] = c.doc.data().rows || [];
      });
      rows = Object.keys(chunks).sort().reduce(function (a, k) { return a.concat(chunks[k]); }, []).map(enrich);
      fillSelects(); render();
    }, function (e) { console.warn("NimbusPost dashboard read error", e); });
  }
  // start in the background shortly after load so the sidebar count shows
  setTimeout(start, 6000);

  var omsIdx = null, omsLen = 0;
  function omsLookup(id) {
    var d = window.omsOrdersRaw || [];
    if (!omsIdx || omsLen !== d.length) { omsIdx = {}; omsLen = d.length; d.forEach(function (o) { var k = nid(o.channelOrderId); if (k && !omsIdx[k]) omsIdx[k] = o; }); }
    return omsIdx[nid(id)] || null;
  }
  function account(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
  /* every product line of an order (OMS Guru) → [{n: name, q: qty}] */
  var itIdx = null, itLen = -1;
  function itemsOf(id) {
    var d = window.omsOrdersRaw || [];
    if (!itIdx || itLen !== d.length) {
      itIdx = {}; itLen = d.length;
      d.forEach(function (o) {
        var k = nid(o.channelOrderId); if (!k) return;
        var L = itIdx[k] || (itIdx[k] = []), n = String(o.productName || o.sku || "").trim(), q = parseInt(o.qty, 10) || 1;
        var ex = L.filter(function (x) { return x.n === n; })[0]; if (ex) ex.q += q; else if (n) L.push({ n: n, q: q });
      });
    }
    return itIdx[nid(id)] || [];
  }
  function prodText(x) { return itemsOf(x.r.o).map(function (i) { return i.n + (i.q > 1 ? " × " + i.q : ""); }).join(" + "); }

  /* multi-select dropdown: tick any number of values; nothing ticked = all */
  var MS = {};
  function msInit(id) {
    var el = document.getElementById(id); if (!el || MS[id]) return;
    var st = MS[id] = { el: el, opts: [], sel: {}, q: "" };
    el.innerHTML = '<button type="button" class="ms-btn"><span class="ms-lbl"></span><i class="ti ti-chevron-down"></i></button><div class="ms-pop" style="display:none;"><input type="text" class="ms-q" placeholder="Search…"><div class="ms-acts"><button type="button" data-a="all">Select all shown</button><button type="button" data-a="none">Clear</button></div><div class="ms-list"></div></div>';
    var pop = el.querySelector(".ms-pop");
    el.querySelector(".ms-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      var open = pop.style.display === "none";
      Object.keys(MS).forEach(function (k) { MS[k].el.querySelector(".ms-pop").style.display = "none"; });
      pop.style.display = open ? "block" : "none";
      if (open) { msList(id); var q = el.querySelector(".ms-q"); q.value = st.q; q.focus(); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    el.querySelector(".ms-q").addEventListener("input", function (e) { st.q = e.target.value; msList(id); });
    el.querySelector(".ms-acts").addEventListener("click", function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === "none") st.sel = {}; else msShown(st).forEach(function (o) { st.sel[o] = 1; });
      msList(id); msLabel(id); page = 0; render();
    });
    el.querySelector(".ms-list").addEventListener("change", function (e) {
      var v = e.target.value; if (e.target.checked) st.sel[v] = 1; else delete st.sel[v];
      msLabel(id); page = 0; render();
    });
    msLabel(id);
  }
  function msShown(st) { var q = st.q.trim().toLowerCase(); return st.opts.filter(function (o) { return !q || o.toLowerCase().indexOf(q) >= 0; }); }
  function msList(id) {
    var st = MS[id], sh = msShown(st);
    st.el.querySelector(".ms-list").innerHTML = sh.length ? sh.slice(0, 400).map(function (o) {
      return '<label class="ms-opt"><input type="checkbox" value="' + esc(o) + '"' + (st.sel[o] ? " checked" : "") + "><span>" + esc(o) + "</span></label>";
    }).join("") + (sh.length > 400 ? '<div class="nb-muted ms-more">Type to find more…</div>' : "") : '<div class="nb-muted ms-more">Nothing found</div>';
  }
  function msLabel(id) {
    var st = MS[id], k = Object.keys(st.sel), ph = st.el.dataset.ph, u = st.el.dataset.unit;
    st.el.querySelector(".ms-lbl").textContent = !k.length ? ph : k.length === 1 ? k[0] : k.length + " " + u + "s";
    st.el.classList.toggle("on", k.length > 0);
  }
  function msSet(id, opts) { msInit(id); var st = MS[id]; st.opts = opts; Object.keys(st.sel).forEach(function (k) { if (opts.indexOf(k) < 0) delete st.sel[k]; }); msLabel(id); }
  function msVal(id) { var st = MS[id]; return st ? st.sel : {}; }
  function msAny(id) { return MS[id] ? Object.keys(MS[id].sel).length > 0 : false; }
  document.addEventListener("click", function () { Object.keys(MS).forEach(function (k) { MS[k].el.querySelector(".ms-pop").style.display = "none"; }); });

  /* ticked shipments (kept across pages and filters) */
  var picked = {};

  function enrich(r) {
    var cr = pd(r.cr), pu = pd(r.pu), ed = pd(r.ed), today = startOfToday();
    var x = { r: r, cr: cr, ed: ed, flags: {} };
    var base = pu || cr;
    x.age = base ? Math.max(0, Math.floor((Date.now() - base.getTime()) / 864e5)) : null;
    var open = r.b === "transit" || r.b === "ofd" || r.b === "exception";
    x.picked = !!r.pu || (r.b !== "pickup" && r.b !== "cancelled" && r.b !== "other");
    x.hv = hv[nawb(r.a)] || null;
    if (x.hv && !x.picked && r.b !== "cancelled" && x.hv.day < dayKey(new Date())) x.flags.handoverMiss = true;
    if (r.b === "pickup" && !x.picked) { x.flags.pickup = true; var pdd = r.pd ? new Date(r.pd + "T23:59:59") : null; if (pdd ? pdd < today : (cr && cr < new Date(today.getTime() - 864e5))) x.flags.pickupLate = true; }
    if (open) x.flags.transit = true;
    if (open && ((ed && ed < new Date()) || (!ed && x.age != null && x.age > DELAY_DAYS))) x.flags.late = true;
    if (r.b === "exception" || r.nd) x.flags.ndr = true;
    if (r.b === "delivered") x.flags.delivered = true;
    if (r.b === "rto" || r.b === "rto_delivered") x.flags.rto = true;
    return x;
  }

  var CARDS = [
    ["all", "All shipments", "ti-package", ""],
    ["pickup", "Pending pickup", "ti-clock", "amber"],
    ["pickupLate", "Pickup delayed", "ti-alert-triangle", "red", "Pickup date has passed, still not picked up"],
    ["handoverMiss", "Handed over, not picked", "ti-alert-octagon", "red", "Scanned in Courier Manifest, but NimbusPost still shows pickup pending the next day"],
    ["transit", "In transit", "ti-truck", "blue"],
    ["late", "Delayed delivery", "ti-alarm", "red", "Past courier EDD, or over " + DELAY_DAYS + " days in transit"],
    ["ndr", "NDR / exception", "ti-phone-x", "red"],
    ["delivered", "Delivered", "ti-circle-check", "green"],
    ["rto", "RTO", "ti-arrow-back-up", "muted"],
  ];
  function count(f) { return f === "all" ? rows.length : rows.filter(function (x) { return x.flags[f]; }).length; }

  function fillSelects() {
    var cs = {}, as = {}, ps = {};
    rows.forEach(function (x) { if (x.r.c) cs[x.r.c] = 1; var o = omsLookup(x.r.o); if (o) as[account(o.channel)] = 1; itemsOf(x.r.o).forEach(function (i) { ps[i.n] = 1; }); });
    var srt = function (o) { return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, "en", { sensitivity: "base" }); }); };
    msSet("ndCourier", srt(cs)); msSet("ndAcct", srt(as)); msSet("ndProd", srt(ps));
  }

  function filtered() {
    var q = document.getElementById("ndSearch").value.trim().toLowerCase();
    var c = msVal("ndCourier"), a = msVal("ndAcct"), pr = msVal("ndProd"), cOn = msAny("ndCourier"), aOn = msAny("ndAcct"), pOn = msAny("ndProd");
    var fl = filter === "all" ? [] : filter.split(",");
    var f = document.getElementById("ndFrom").value, t = document.getElementById("ndTo").value;
    var fd = f ? new Date(f + "T00:00:00") : null, td = t ? new Date(t + "T23:59:59") : null;
    return rows.filter(function (x) {
      if (fl.length && !fl.some(function (f) { return x.flags[f]; })) return false;
      if (dayF && (dayF.k === "hv" ? !(x.hv && x.hv.day === dayF.d) : !(x.cr && dayKey(x.cr) === dayF.d))) return false;
      if (cOn && !c[x.r.c]) return false;
      var o = omsLookup(x.r.o);
      if (aOn && (!o || !a[account(o.channel)])) return false;
      if (pOn && !itemsOf(x.r.o).some(function (i) { return pr[i.n]; })) return false;
      if (fd && (!x.cr || x.cr < fd)) return false;
      if (td && (!x.cr || x.cr > td)) return false;
      if (q) { var hay = [x.r.a, x.r.o, x.r.n, x.r.ci, x.r.pin, x.r.st, o && o.buyerName, prodText(x)].join(" ").toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    }).sort(function (p, q2) {
      var w = function (x) { return x.flags.handoverMiss ? -1 : x.flags.late || x.flags.pickupLate ? 0 : x.flags.ndr ? 1 : 2; };
      return w(p) - w(q2) || ((q2.cr || 0) - (p.cr || 0));
    });
  }

  function statusPill(x) {
    var b = x.r.b, cls = { pickup: "amber", transit: "blue", ofd: "blue", exception: "red", delivered: "green", rto: "muted", rto_delivered: "muted", cancelled: "muted" }[b] || "muted";
    var label = x.r.st || b;
    return '<span class="nd-pill nd-' + cls + '">' + esc(label.charAt(0).toUpperCase() + label.slice(1)) + "</span>" +
      (x.flags.handoverMiss ? '<div class="nd-flag">Handed over ' + dshort(new Date(x.hv.day + "T00:00:00")) + " — not picked up</div>" : x.flags.late ? '<div class="nd-flag">Delayed</div>' : x.flags.pickupLate ? '<div class="nd-flag">Pickup delayed</div>' : "") +
      (x.r.nr && x.flags.ndr ? '<div class="nb-muted nb-small">NDR: ' + esc(x.r.nr) + (x.r.at ? " · attempt " + x.r.at : "") + "</div>" : "");
  }

  function render() {
    if (!panel.classList.contains("active")) { updateSide(); return; }
    var setup = document.getElementById("ndSetup");
    if (!meta && !rows.length) {
      setup.style.display = "block";
      setup.innerHTML = '<h2><i class="ti ti-plug-connected" style="color:var(--x-gold)"></i> Connect NimbusPost (one time, 2 minutes)</h2>' +
        '<ol class="nd-steps"><li>Open <b>github.com/pransu49/oms-sync → Settings → Secrets and variables → Actions → New repository secret</b>.</li>' +
        '<li>Add <code>NIMBUS_API_KEY</code> = your NimbusPost key (starts with npk_).</li>' +
        '<li>Add <code>NIMBUS_API_SECRET</code> = the matching secret.</li>' +
        '<li>Shipments appear here within 30 minutes (or press <b>Run workflow</b> on “NimbusPost Sync” in GitHub Actions).</li></ol>';
    } else setup.style.display = "none";
    if (meta && meta.updatedAt && meta.updatedAt.toDate) {
      var m = Math.round((Date.now() - meta.updatedAt.toDate().getTime()) / 60000);
      document.getElementById("ndSynced").textContent = "Last synced " + (m < 1 ? "just now" : m < 120 ? m + " min ago" : Math.round(m / 60) + " h ago") + " · last " + (meta.daysBack || 30) + " days · " + rows.length + " shipments";
    }
    document.getElementById("ndKpis").innerHTML = CARDS.map(function (c) {
      var n = count(c[0]);
      var on = c[0] === "all" ? filter === "all" : ("," + filter + ",").indexOf("," + c[0] + ",") >= 0;
      return '<button type="button" class="nd-kpi nd-k-' + c[3] + (on ? " on" : "") + (n && (c[3] === "red") ? " alert" : "") + '" data-f="' + c[0] + '"' + (c[4] ? ' title="' + esc(c[4]) + '"' : "") + ">" +
        '<i class="ti ' + c[2] + '"></i><div class="nd-kpi-n">' + n.toLocaleString("en-IN") + '</div><div class="nd-kpi-l">' + c[1] + "</div></button>";
    }).join("");
    // cards can be combined: click several to see them together, "All shipments" resets
    document.querySelectorAll("#ndKpis .nd-kpi").forEach(function (b) { b.addEventListener("click", function () {
      var f = b.dataset.f;
      if (f === "all") filter = "all";
      else { var L = filter === "all" ? [] : filter.split(","), i = L.indexOf(f); if (i >= 0) L.splice(i, 1); else L.push(f); filter = L.length ? L.join(",") : "all"; }
      dayF = null; page = 0; render();
    }); });

    var list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page >= pages) page = pages - 1;
    var cardTxt = filter === "all" ? "All shipments" : filter.split(",").map(function (f) { var c = CARDS.filter(function (z) { return z[0] === f; })[0]; return c ? c[1] : f; }).join(" + ");
    document.getElementById("ndActive").innerHTML = "Showing <b>" + list.length.toLocaleString("en-IN") + "</b> · " + esc(cardTxt) +
      (dayF ? " · " + (dayF.k === "hv" ? "handed over " : "booked ") + esc(dshort(new Date(dayF.d + "T00:00:00"))) : "") +
      (filter !== "all" || dayF || msAny("ndCourier") || msAny("ndAcct") || msAny("ndProd") ? ' <button type="button" class="mini-link" id="ndShowAll">Show all</button>' : "");
    var sa = document.getElementById("ndShowAll"); if (sa) sa.addEventListener("click", function () { filter = "all"; dayF = null; ["ndCourier", "ndAcct", "ndProd"].forEach(function (k) { if (MS[k]) { MS[k].sel = {}; msLabel(k); } }); render(); });
    bulkBar(list);
    renderDays();
    var today = startOfToday();
    document.getElementById("ndBody").innerHTML = list.length ? list.slice(page * PAGE, page * PAGE + PAGE).map(function (x) {
      var r = x.r, o = omsLookup(r.o);
      var edCls = x.ed && x.ed < today && !x.flags.delivered && !x.flags.rto ? ' class="nd-red"' : "";
      var its = itemsOf(r.o);
      return '<tr class="' + (x.flags.handoverMiss ? "nd-row-late nd-row-err" : x.flags.late || x.flags.pickupLate ? "nd-row-late" : "") + (picked[r.a] ? " nd-picked" : "") + '">' +
        '<td class="nd-cb"><input type="checkbox" class="nd-rcb" data-a="' + esc(r.a) + '"' + (picked[r.a] ? " checked" : "") + "></td>" +
        '<td><div class="cx-awb">' + esc(r.a) + "</div></td>" +
        '<td><div class="cx-awb">' + esc(r.o || "—") + '</div><div class="nb-muted nb-small">' + esc(o ? account(o.channel) : (r.pt || "")) + "</div></td>" +
        '<td class="nd-prod">' + (its.length ? its.map(function (i) { return '<div class="nd-pl"><span>' + esc(i.n) + "</span>" + (i.q > 1 ? '<b class="nd-q">× ' + i.q + "</b>" : "") + "</div>"; }).join("") : '<span class="nb-muted">—</span>') + "</td>" +
        '<td><div class="nb-name">' + esc(r.n || (o && o.buyerName) || "") + '</div><div class="nb-muted nb-small">' + esc([r.ci || (o && o.buyerCity), r.pin || (o && o.buyerPincode)].filter(Boolean).join(", ")) + "</div></td>" +
        "<td>" + esc(r.c) + (r.i ? '<div class="nb-muted nb-small">' + esc(r.i) + "</div>" : "") + "</td>" +
        "<td>" + statusPill(x) + "</td>" +
        "<td>" + dshort(x.cr) + "</td>" +
        "<td" + edCls + ">" + dshort(x.ed) + "</td>" +
        "<td>" + (x.age == null ? "—" : x.age + "d") + "</td></tr>";
    }).join("") : '<tr><td colspan="10" class="nb-muted" style="text-align:center;padding:22px !important;">' + (rows.length ? "No shipments match." : "No NimbusPost data yet.") + "</td></tr>";
    var pageRows = list.slice(page * PAGE, page * PAGE + PAGE);
    document.querySelectorAll("#ndBody .nd-rcb").forEach(function (cb) {
      cb.addEventListener("change", function () { if (cb.checked) picked[cb.dataset.a] = 1; else delete picked[cb.dataset.a]; cb.closest("tr").classList.toggle("nd-picked", cb.checked); bulkBar(list); syncAllCb(pageRows); });
    });
    var acb = document.getElementById("ndAllCb");
    acb.onchange = function () { pageRows.forEach(function (x) { if (acb.checked) picked[x.r.a] = 1; else delete picked[x.r.a]; }); render(); };
    syncAllCb(pageRows);
    var pg = document.getElementById("ndPager");
    pg.innerHTML = pages > 1 ? '<button type="button" id="ndPrev"' + (page ? "" : " disabled") + '>← Prev</button><span class="nb-muted">Page ' + (page + 1) + " of " + pages + '</span><button type="button" id="ndNext"' + (page < pages - 1 ? "" : " disabled") + ">Next →</button>" : "";
    if (pages > 1) {
      document.getElementById("ndPrev").addEventListener("click", function () { page--; render(); });
      document.getElementById("ndNext").addEventListener("click", function () { page++; render(); });
    }
    updateSide();
  }
  function updateSide() {
    var n = count("late") + count("pickupLate") + count("handoverMiss"), el = document.getElementById("ndSideCount");
    if (el) { el.textContent = n; el.style.display = n ? "" : "none"; }
    banner();
  }
  /* date-wise: booked vs picked, handed over vs picked */
  function renderDays() {
    var body = document.getElementById("ndDays"); if (!body) return;
    var today = dayKey(new Date()), D = {};
    for (var i = 0; i < HV_DAYS; i++) { var dd = new Date(); dd.setDate(dd.getDate() - i); D[dayKey(dd)] = { bk: 0, bp: 0, bw: 0, hv: 0, hp: 0, hm: 0 }; }
    rows.forEach(function (x) {
      if (x.r.b === "cancelled") return;
      if (x.cr) { var k = dayKey(x.cr); if (D[k]) { D[k].bk++; if (x.picked) D[k].bp++; else D[k].bw++; } }
      if (x.hv && D[x.hv.day]) { var h = D[x.hv.day]; h.hv++; if (x.picked) h.hp++; else h.hm++; }
    });
    var cell = function (n, k, d, cls, title) {
      return n ? '<button type="button" class="nd-dn ' + (cls || "") + '" data-k="' + k + '" data-d="' + d + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + n.toLocaleString("en-IN") + "</button>" : '<span class="nb-muted">0</span>';
    };
    body.innerHTML = Object.keys(D).sort().reverse().filter(function (d) { return D[d].bk || D[d].hv || d === today; }).map(function (d) {
      var v = D[d], pct = v.bk ? Math.round(v.bp / v.bk * 100) : null, isToday = d === today;
      var lab = isToday ? "Today" : d === dayKey(new Date(Date.now() - 864e5)) ? "Yesterday" : new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      return "<tr" + (v.hm && !isToday ? ' class="nd-row-err"' : "") + "><td><b>" + lab + "</b></td>" +
        "<td>" + cell(v.bk, "cr", d, "", "All shipments booked this day") + "</td>" +
        '<td><span class="nd-ok">' + v.bp.toLocaleString("en-IN") + "</span>" + (pct != null ? ' <span class="nb-muted">(' + pct + "%)</span>" : "") + "</td>" +
        "<td>" + cell(v.bw, "crw", d, isToday ? "amb" : "red", "Booked this day, still waiting for pickup") + "</td>" +
        "<td>" + (v.hv ? v.hv.toLocaleString("en-IN") + ' <span class="nb-muted">· ' + v.hp + " picked</span>" : '<span class="nb-muted">—</span>') + "</td>" +
        "<td>" + (v.hm ? cell(v.hm, "hv", d, isToday ? "amb" : "red err", isToday ? "Scanned today — courier status usually updates by tomorrow" : "Error: handed over but NimbusPost still shows pickup pending") + (isToday ? ' <span class="nb-muted">waiting</span>' : ' <span class="nd-err-tag">ERROR</span>') : v.hv ? '<span class="nd-ok">✓ all picked</span>' : '<span class="nb-muted">—</span>') + "</td></tr>";
    }).join("");
    body.querySelectorAll(".nd-dn").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.dataset.k, d = b.dataset.d;
        if (k === "hv") { filter = "all"; dayF = { k: "hv", d: d }; filter = d === dayKey(new Date()) ? "all" : "handoverMiss"; }
        else if (k === "crw") { filter = "pickup"; dayF = { k: "cr", d: d }; }
        else { filter = "all"; dayF = { k: "cr", d: d }; }
        page = 0; render();
        var t = document.getElementById("ndTable"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }
  /* warning on the Courier Manifest tab */
  function banner() {
    var n = count("handoverMiss"), tab = document.getElementById("tab-courier"); if (!tab) return;
    var b = document.getElementById("ndHvBanner");
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div"); b.id = "ndHvBanner"; b.className = "nd-hv-banner no-print";
      tab.insertBefore(b, tab.firstChild);
      b.addEventListener("click", function (e) { if (!e.target.closest("button")) return; filter = "handoverMiss"; dayF = null; page = 0; btn.click(); });
    }
    b.innerHTML = '<i class="ti ti-alert-octagon"></i><div><b>' + n + " AWB" + (n > 1 ? "s" : "") + " handed over but not picked up</b>" +
      '<div class="nb-muted">Scanned in the manifest on an earlier day, but NimbusPost still shows “pickup pending”. Check with the courier.</div></div>' +
      '<button type="button" class="btn-gold">View AWBs</button>';
  }

  function syncAllCb(pageRows) {
    var acb = document.getElementById("ndAllCb"); if (!acb) return;
    var n = pageRows.filter(function (x) { return picked[x.r.a]; }).length;
    acb.checked = n > 0 && n === pageRows.length; acb.indeterminate = n > 0 && n < pageRows.length;
  }
  function bulkBar(list) {
    var bar = document.getElementById("ndBulk"); if (!bar) return;
    var sel = rows.filter(function (x) { return picked[x.r.a]; }), n = sel.length;
    if (!n) { bar.style.display = "none"; bar.innerHTML = ""; return; }
    bar.style.display = "flex";
    bar.innerHTML = '<i class="ti ti-checkbox"></i><b>' + n + " selected</b>" +
      '<button type="button" data-b="list">Select all ' + list.length.toLocaleString("en-IN") + " in this list</button>" +
      '<button type="button" data-b="copy"><i class="ti ti-copy"></i> Copy AWBs</button>' +
      '<button type="button" data-b="copyo"><i class="ti ti-copy"></i> Copy order IDs</button>' +
      '<button type="button" data-b="xls"><i class="ti ti-download"></i> Excel (selected)</button>' +
      '<button type="button" data-b="clear" class="nd-bclr">Clear selection</button>';
    bar.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var k = b.dataset.b;
      if (k === "list") { list.forEach(function (x) { picked[x.r.a] = 1; }); render(); }
      else if (k === "clear") { picked = {}; render(); }
      else if (k === "xls") exportXlsx(true);
      else {
        var t = sel.map(function (x) { return k === "copy" ? x.r.a : x.r.o; }).filter(Boolean).join("\n");
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.innerHTML = '<i class="ti ti-check"></i> Copied ' + n; }, function () { prompt("Copy:", t); });
      }
    };
  }
  function exportXlsx(onlySel) {
    if (typeof XLSX === "undefined") { alert("Excel library is still loading — try again in a moment."); return; }
    var src = onlySel === true ? rows.filter(function (x) { return picked[x.r.a]; }) : filtered();
    var data = src.map(function (x) {
      var r = x.r, o = omsLookup(r.o);
      return { AWB: r.a, "Order ID": r.o, Product: prodText(x), Account: o ? account(o.channel) : "", Customer: r.n || (o && o.buyerName) || "", City: r.ci || (o && o.buyerCity) || "", Pincode: r.pin || (o && o.buyerPincode) || "",
        Courier: r.c, Status: r.st, Delayed: x.flags.handoverMiss ? "Handed over, not picked up" : x.flags.late ? "Delivery delayed" : x.flags.pickupLate ? "Pickup delayed" : "", Booked: r.cr, "Handed over": x.hv ? x.hv.day : "", EDD: r.ed, "Age (days)": x.age == null ? "" : x.age,
        Payment: r.pt, "NDR remark": r.nr, Freight: r.f || "" };
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "NimbusPost");
    XLSX.writeFile(wb, "NimbusPost_Shipments_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }

  ["ndSearch"].forEach(function (id) { document.getElementById(id).addEventListener("input", function () { page = 0; render(); }); });
  ["ndFrom", "ndTo"].forEach(function (id) { document.getElementById(id).addEventListener("change", function () { page = 0; render(); }); });
  ["ndCourier", "ndAcct", "ndProd"].forEach(msInit);
  document.getElementById("ndExport").addEventListener("click", function () { exportXlsx(false); });
  setInterval(function () { loadHandover(false); if (panel.classList.contains("active")) render(); }, 60000);
  window.__ndReloadHandover = function () { loadHandover(true); };
  window.__ndRows = function () { return rows; };
  window.__ndInject = function (rs, m) { rows = rs.map(enrich); meta = m || meta; fillSelects(); render(); };
  window.__ndInjectHv = function (m) { hv = m; hvAt = Date.now(); rows = rows.map(function (x) { return enrich(x.r); }); render(); };

  var css = document.createElement("style");
  css.textContent = "@media screen{" +
    "html#aikm body .nd-days-panel{padding:18px 20px !important;}" +
    "html#aikm body .ms{position:relative;min-width:170px;}" +
    "html#aikm body .ms-btn{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:38px;padding:0 12px;border:1px solid var(--x-line);border-radius:8px;background:var(--x-surface);color:var(--x-text);font-size:13px;cursor:pointer;white-space:nowrap;}" +
    "html#aikm body .ms.on .ms-btn{border-color:var(--x-gold-line);background:var(--x-gold-soft);font-weight:600;}" +
    "html#aikm body .ms-lbl{overflow:hidden;text-overflow:ellipsis;max-width:220px;}" +
    "html#aikm body .ms-pop{position:absolute;z-index:60;top:calc(100% + 6px);left:0;width:320px;max-width:80vw;padding:10px;border:1px solid var(--x-line);border-radius:12px;background:var(--x-surface);box-shadow:0 14px 40px rgba(0,0,0,.25);}" +
    "html#aikm body .ms-q{width:100% !important;box-sizing:border-box;}" +
    "html#aikm body .ms-acts{display:flex;gap:6px;margin:8px 0;}html#aikm body .ms-acts button{all:unset;cursor:pointer;font-size:11.5px;font-weight:600;color:var(--x-gold);padding:3px 8px;border-radius:6px;background:var(--x-gold-soft);}" +
    "html#aikm body .ms-list{max-height:300px;overflow:auto;}" +
    "html#aikm body .ms-opt{display:flex;align-items:flex-start;gap:8px;padding:6px 6px;border-radius:6px;font-size:12.5px;color:var(--x-text);cursor:pointer;line-height:1.35;}html#aikm body .ms-opt:hover{background:var(--x-surface-2);}" +
    "html#aikm body .ms-opt input{width:15px;height:15px;margin:1px 0 0;accent-color:var(--x-gold);flex:0 0 auto;}" +
    "html#aikm body .ms-more{padding:6px;font-size:11.5px;}" +
    "html#aikm body .nd-filters{flex-wrap:wrap;}" +
    "html#aikm body th.nd-cb,html#aikm body td.nd-cb{width:30px;padding-right:0 !important;}html#aikm body .nd-cb input{width:16px;height:16px;accent-color:var(--x-gold);margin:0;}" +
    "html#aikm body tr.nd-picked td{background:var(--x-gold-soft) !important;}" +
    "html#aikm body td.nd-prod{min-width:220px;max-width:340px;font-size:12.5px;color:var(--x-text);}" +
    "html#aikm body .nd-pl{display:flex;gap:6px;align-items:baseline;line-height:1.35;}html#aikm body .nd-pl + .nd-pl{margin-top:4px;padding-top:4px;border-top:1px dashed var(--x-line);}" +
    "html#aikm body .nd-q{flex:0 0 auto;padding:0 6px;border-radius:5px;background:var(--x-text);color:var(--x-surface);font-size:11px;}" +
    "html#aikm body .nd-bulk{position:sticky;top:0;z-index:5;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 10px;padding:9px 12px;border-radius:10px;background:var(--x-gold-soft);border:1px solid var(--x-gold-line);font-size:12.5px;color:var(--x-text);}" +
    "html#aikm body .nd-bulk > i{color:var(--x-gold);font-size:17px;}html#aikm body .nd-bulk b{margin-right:6px;}" +
    "html#aikm body .nd-bulk button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:7px;background:var(--x-surface);border:1px solid var(--x-line);font-size:12px;font-weight:600;color:var(--x-text);}" +
    "html#aikm body .nd-bulk button:hover{border-color:var(--x-gold-line);}html#aikm body .nd-bulk .nd-bclr{color:var(--x-red);}" +
    "html#aikm body .nd-kpis{grid-template-columns:repeat(9,minmax(0,1fr)) !important;}@media (max-width:1500px){html#aikm body .nd-kpis{grid-template-columns:repeat(5,minmax(0,1fr)) !important;}}@media (max-width:900px){html#aikm body .nd-kpis{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}}" +
    "html#aikm body .nd-days-head{margin-bottom:12px;}html#aikm body .nd-days-title{font-family:var(--x-brand-font);font-size:16px;font-weight:600;color:var(--x-text);margin:3px 0 2px;}" +
    "html#aikm body table.nd-days td,html#aikm body table.nd-days th{white-space:nowrap;}" +
    "html#aikm body button.nd-dn{all:unset;cursor:pointer;font-weight:600;color:var(--x-text);padding:2px 9px;border-radius:20px;background:var(--x-surface-2);border:1px solid var(--x-line);font-variant-numeric:tabular-nums;}" +
    "html#aikm body button.nd-dn:hover{border-color:var(--x-gold-line);}" +
    "html#aikm body table.nd-days button.nd-dn.amb{background:var(--x-amber-soft) !important;color:var(--x-amber) !important;border-color:transparent !important;}" +
    "html#aikm body table.nd-days button.nd-dn.red{background:var(--x-red-soft) !important;color:var(--x-red) !important;border-color:transparent !important;}" +
    "html#aikm body .nd-ok{color:var(--x-green);font-weight:600;}" +
    "html#aikm body .nd-err-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:5px;background:var(--x-red);color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;}" +
    "html#aikm body table.nd-days tr.nd-row-err td{background:var(--x-red-soft) !important;}html#aikm body table.nd-days tr.nd-row-err td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}" +
    "html#aikm body .nd-hv-banner{display:flex;align-items:center;gap:14px;padding:12px 16px;margin:0 0 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--x-red) 40%,transparent);background:var(--x-red-soft);color:var(--x-text);}" +
    "html#aikm body .nd-hv-banner > i{font-size:24px;color:var(--x-red);}html#aikm body .nd-hv-banner > div{flex:1;}html#aikm body .nd-hv-banner b{color:var(--x-red);}" +
    "}";
  document.head.appendChild(css);
})();

/* ===== "Sync now" buttons: run the OMS Guru / NimbusPost sync immediately (GitHub Actions) ===== */
(function () {
  if (window.__aikmSyncNow) return; window.__aikmSyncNow = true;
  var REPO = "pransu49/oms-sync", TK = "aikm_gh_sync_token";
  var JOBS = { oms: { file: "sync-workflow.yml", name: "OMS Guru" }, nimbus: { file: "nimbus-sync.yml", name: "NimbusPost" },
    push: { file: "oms-push-tracking.yml", name: "Tracking push to OMS", inputs: { dry_run: "false" }, then: "oms" },
    amazon: { file: "amazon-confirm.yml", name: "Amazon confirmation", inputs: { dry_run: "false", probe: "false" } } };
  var running = {};

  // Token is shared: saved once in the console's cloud (same place as the rest of the console data),
  // so every computer/employee uses it automatically — nobody else is ever asked.
  var cloudTok = "", cloudRef = null;
  function hookCloudTok() {
    if (cloudRef || typeof fbDb === "undefined" || !fbDb) return;
    cloudRef = fbDb.collection("aikm_admin").doc("ghSync");
    cloudRef.onSnapshot(function (d) {
      cloudTok = String((d.exists && d.data().token) || "").replace(/^\s*bearer\s+/i, "").trim();
      if (cloudTok) try { localStorage.setItem(TK, cloudTok); } catch (e) {}
    }, function () {});
  }
  var ct = setInterval(function () { hookCloudTok(); if (cloudRef) clearInterval(ct); }, 1500);
  function saveCloudTok(t) { if (cloudRef) cloudRef.set({ token: t, savedAt: new Date().toISOString() }).catch(function () {}); }
  function forgetTok() {
    try { localStorage.removeItem(TK); } catch (e) {}
    if (cloudRef && cloudTok) cloudRef.set({ token: "" }).catch(function () {});
    cloudTok = "";
  }

  function token(ask) {
    var t = cloudTok; if (!t) try { t = (localStorage.getItem(TK) || "").replace(/^\s*bearer\s+/i, "").trim(); } catch (e) {}
    if (t || !ask) return t;
    t = (prompt(
      "One-time setup (only once for the whole company — every computer will use it):\n\n" +
      "Paste a GitHub token that can run the sync.\n" +
      "Make it at github.com → Settings → Developer settings → Fine-grained tokens → Generate new token:\n" +
      "  • Repository access: Only select → pransu49/oms-sync\n" +
      "  • Permissions: Actions → Read and write\n\n" +
      "(You can reuse the token you made for cron-job.org.)") || "").replace(/^\s*(authorization\s*:\s*)?bearer\s+/i, "").replace(/\s+/g, "").trim();
    if (t) { try { localStorage.setItem(TK, t); } catch (e) {} cloudTok = t; saveCloudTok(t); }
    return t;
  }
  function gh(path, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Accept: "application/vnd.github+json", Authorization: "Bearer " + token(false) }, opt.headers || {});
    return fetch("https://api.github.com/repos/" + REPO + path, opt);
  }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4200);
  }

  function setBtns(key, state, text) {
    document.querySelectorAll('[data-sync-now]').forEach(function (b) {
      if (b.dataset.syncNow.split(",").indexOf(key) < 0) return;
      b.classList.toggle("sn-busy", state === "busy");
      b.disabled = state === "busy";
      b.querySelector(".sn-txt").textContent = text || b.dataset.label;
    });
  }

  async function runOne(key) {
    if (running[key]) return;
    var job = JOBS[key]; running[key] = true;
    var started = Date.now();
    setBtns(key, "busy", "Starting…");
    try {
      var r = await gh("/actions/workflows/" + job.file + "/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job.inputs ? { ref: "main", inputs: job.inputs } : { ref: "main" }) });
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        forgetTok();
        throw new Error("GitHub token not accepted — click Sync now again and paste a valid token");
      }
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      // wait for the run to finish (usually 1–2 minutes)
      var runId = null, done = false, ok = false;
      while (!done && Date.now() - started < 8 * 60000) {
        await new Promise(function (res) { setTimeout(res, 5000); });
        var secs = Math.round((Date.now() - started) / 1000);
        setBtns(key, "busy", "Syncing… " + secs + "s");
        var lr = await gh("/actions/workflows/" + job.file + "/runs?per_page=5&event=workflow_dispatch");
        if (!lr.ok) continue;
        var runs = (await lr.json()).workflow_runs || [];
        var run = runId ? runs.filter(function (x) { return x.id === runId; })[0]
          : runs.filter(function (x) { return new Date(x.created_at).getTime() >= started - 20000; }).pop();
        if (!run) continue;
        runId = run.id;
        if (run.status === "completed") { done = true; ok = run.conclusion === "success"; }
      }
      if (!done) throw new Error("still running on GitHub — data will appear when it finishes");
      if (!ok) throw new Error("the sync run failed — check GitHub Actions");
      setBtns(key, "idle", key === "push" ? "Pushed ✓" : "Synced ✓");
      toast(key === "push" ? "Tracking pushed to OMS Guru — refreshing OMS data now." : key === "amazon" ? "Amazon confirmation finished — see the note next to the button." : job.name + " synced — fresh data is loading now.");
      if (job.then) runOne(job.then);
      setTimeout(function () { setBtns(key, "idle"); }, 6000);
    } catch (e) {
      setBtns(key, "idle");
      toast(job.name + ": " + e.message, true);
    } finally { running[key] = false; }
  }
  function syncNow(keys) {
    hookCloudTok();
    if (!token(!!cloudRef)) {
      if (!cloudRef) { toast("Still connecting — try again in a few seconds.", true); return; }
      return;
    }
    keys.forEach(function (k) { runOne(k); });
  }
  window.aikmSyncNow = syncNow;
  // used by other console tools (e.g. NimbusPost labels) to start a GitHub job with the shared token
  window.aikmGhDispatch = async function (file, inputs) {
    hookCloudTok();
    if (!token(!!cloudRef)) throw new Error("GitHub token missing — click any Sync now button once to set it");
    var r = await gh("/actions/workflows/" + file + "/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: inputs || {} }) });
    if (r.status === 401 || r.status === 403 || r.status === 404) { forgetTok(); throw new Error("GitHub token not accepted — paste a valid token"); }
    if (r.status !== 204) throw new Error("GitHub said " + r.status);
  };

  function makeBtn(keys, label) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "sn-btn"; b.dataset.syncNow = keys.join(","); b.dataset.label = label;
    b.innerHTML = '<i class="ti ti-refresh"></i><span class="sn-txt">' + label + "</span>";
    b.title = "Fetch the latest data now (takes about 1–2 minutes)";
    b.addEventListener("click", function () { syncNow(keys); });
    return b;
  }
  function place() {
    var spots = [
      ["subtab-nimbusdash", ["nimbus"], "Sync NimbusPost now"],
      ["subtab-omsorders", ["oms"], "Sync OMS now"],
      ["subtab-lossorders", ["oms"], "Sync OMS now"],
      ["subtab-selfship", ["oms", "nimbus"], "Sync OMS + NimbusPost now"],
      ["subtab-selfship", ["push"], "Push tracking to OMS", "sn-push"],
      ["subtab-nimbusdash", ["push"], "Push tracking to OMS", "sn-push"],
      ["subtab-selfship", ["amazon"], "Confirm on Amazon", "sn-amz"],
      ["subtab-nimbusdash", ["amazon"], "Confirm on Amazon", "sn-amz"],
    ];
    spots.forEach(function (s) {
      var el = document.getElementById(s[0]);
      if (!el || el.querySelector('[data-sync-now="' + s[1].join(",") + '"]')) return;
      var b = makeBtn(s[1], s[2]); if (!el.querySelector(".sn-btn")) b.classList.add("sn-right"); if (s[3]) b.classList.add(s[3]); el.appendChild(b);
      if (s[3] === "sn-push" && !el.querySelector(".sn-pushinfo")) { var i = document.createElement("span"); i.className = "sn-pushinfo"; el.appendChild(i); }
      if (s[3] === "sn-amz" && !el.querySelector(".sn-amzinfo")) { var j = document.createElement("span"); j.className = "sn-amzinfo sn-pushinfo-amz"; el.appendChild(j); }
    });
    // sidebar "Fetch OMS Now" link → real sync of both
    document.querySelectorAll('.backend-access a[href*="oms-sync/actions"]').forEach(function (a) {
      if (a.dataset.snHooked) return; a.dataset.snHooked = "1";
      a.addEventListener("click", function (e) { e.preventDefault(); syncNow(["oms", "nimbus"]); });
      a.title = "Run OMS Guru + NimbusPost sync now";
    });
  }
  place(); setTimeout(place, 1500); setTimeout(place, 5000);

  var pushHooked = false;
  function hookPushStatus() {
    if (pushHooked || typeof fbDb === "undefined" || !fbDb) return;
    pushHooked = true;
    fbDb.collection("aikm_admin").doc("omsTrackingPush").onSnapshot(function (d) {
      var l = d.exists && d.data().last; if (!l) return;
      var when = l.at && l.at.toDate ? l.at.toDate() : null;
      var ago = when ? Math.round((Date.now() - when.getTime()) / 60000) : null;
      var t = "Last push " + (ago == null ? "" : ago < 1 ? "just now" : ago < 120 ? ago + " min ago" : Math.round(ago / 60) + " h ago") + " · " +
        (l.error ? "failed: " + l.error : l.message ? l.message : l.count ? l.count + " AWB sent" : "nothing new");
      document.querySelectorAll(".sn-pushinfo").forEach(function (s) { s.textContent = t; s.title = l.message || l.error || ""; s.classList.toggle("sn-err", !!(l.error || l.failed)); });
    }, function () {});
  }
  var ph = setInterval(function () { hookPushStatus(); if (pushHooked) clearInterval(ph); }, 3000);

  var css = "@media screen{" +
    "html#aikm body .sn-btn{display:inline-flex !important;align-items:center;gap:6px;border-radius:20px !important;padding:6px 14px !important;min-height:0 !important;font-size:12px !important;font-weight:600 !important;background:var(--x-surface) !important;color:var(--x-text) !important;border:1px solid var(--x-gold-line) !important;cursor:pointer;}" +
    "html#aikm body .sn-btn .ti{color:var(--x-gold);font-size:14px;}" +
    "html#aikm body .sn-btn:hover{background:var(--x-gold-soft) !important;}" +
    "html#aikm body .sn-btn.sn-busy{opacity:1 !important;cursor:progress;border-color:var(--x-gold) !important;}" +
    "html#aikm body .sn-btn.sn-busy .ti{animation:snspin 1s linear infinite;}" +
    "html#aikm body .subtabbar .sn-right{margin-left:auto !important;}" +
    "html#aikm body .sn-btn.sn-amz{background:#FF9900 !important;color:#1A1405 !important;border-color:#FF9900 !important;}html#aikm body .sn-btn.sn-amz .ti{color:inherit;}html#aikm body .sn-amzinfo{font-size:11.5px;color:var(--x-muted);max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}html#aikm body .sn-amzinfo.sn-err{color:var(--x-red);}" +
    "html#aikm body .sn-btn.sn-push{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}html#aikm body .sn-btn.sn-push .ti{color:inherit;}" +
    "html#aikm body .sn-pushinfo{font-size:11.5px;color:var(--x-muted);}html#aikm body .sn-pushinfo.sn-err{color:var(--x-red);}" +
    "@keyframes snspin{to{transform:rotate(360deg)}}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
})();

/* ===== OMS tracking push: rejection remarks (per order) ===== */
(function () {
  if (window.__aikmPushErr) return; window.__aikmPushErr = true;
  var data = { failed: {}, stuck: {}, ids: {} }, amz = { ids: {} }, hooked = false;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nid(v) { return String(v || "").replace(/^`+/, "").replace(/^#/, "").replace(/\s+/g, "").trim(); }

  // plain-language reason + what to do
  function explain(raw) {
    var r = String(raw || "");
    if (/not permitted in this status/i.test(r)) return { why: "Order already Shipped in OMS — OMS doesn't allow adding AWB after shipping", fix: "Ask OMS Guru support to add the AWB, or check Amazon already has it" };
    if (/length can not be more than|20 chars/i.test(r)) return { why: "Courier name too long for OMS (max 20 letters)", fix: "Fixed automatically — will be sent again on the next push" };
    if (/not found|does not exist|invalid order/i.test(r)) return { why: "Order not found in OMS for this account", fix: "Check the order ID / seller account in OMS Guru" };
    if (/channel/i.test(r)) return { why: "Seller account (Channel Id) not accepted", fix: "Check the order's account in OMS Guru" };
    if (/duplicate|already/i.test(r)) return { why: "AWB already used on another order", fix: "Check this AWB in NimbusPost and OMS Guru" };
    return { why: r || "Rejected by OMS Guru", fix: "Open the order in OMS Guru and update it by hand" };
  }
  function explainAmz(raw) {
    var r = String(raw || "");
    if (/NonexistentOrder|not recognized/i.test(r)) return { why: "Amazon doesn't know this order for this account", fix: "Check the seller account of this order" };
    if (/cancel/i.test(r)) return { why: "Order cancelled on Amazon", fix: "Cancel the NimbusPost shipment if not picked up" };
    if (/carrier/i.test(r)) return { why: "Amazon didn't accept the courier name", fix: "Confirm this one with the confirmation file" };
    if (/tracking/i.test(r)) return { why: "Amazon didn't accept the tracking number", fix: "Check the AWB in NimbusPost, then confirm with the file" };
    if (/item|quantity/i.test(r)) return { why: "Order items didn't match Amazon", fix: "Confirm this one with the confirmation file" };
    if (/throttl|quota|429/i.test(r)) return { why: "Amazon was busy", fix: "Nothing — it retries automatically" };
    return { why: r || "Rejected by Amazon", fix: "Confirm this one with the confirmation file" };
  }
  function list() {
    var out = [];
    Object.keys(data.stuck || {}).forEach(function (id) {
      var x = data.stuck[id];
      out.push({ id: id, awb: x.a, c: x.c, acct: x.ch, raw: "not permitted in this status", st: x.st });
    });
    Object.keys(data.failed || {}).forEach(function (id) {
      if (data.stuck[id]) return;
      var p = (data.ids || {})[id] || {};
      out.push({ id: id, awb: p.a || "", c: "", acct: "", raw: data.failed[id] });
    });
    Object.keys(amz.ids || {}).forEach(function (id) {
      var x = amz.ids[id]; if (!x || x.ok) return;
      out.push({ id: id, awb: x.a || "", c: "", acct: x.acct === "praso" ? "PRASO ENTERPRISES" : x.acct === "sastastore" ? "SASTA STORE" : (x.acct || ""), raw: x.e || "Amazon error", src: "Amazon" });
    });
    return out;
  }
  window.__peDebug = function () { return { hooked: hooked, stuck: Object.keys(data.stuck || {}).length, n: list().length }; };
  function byId() { var m = {}; list().forEach(function (x) { m[nid(x.id)] = x; }); return m; }

  function hook() {
    if (hooked || typeof fbDb === "undefined" || !fbDb) return;
    hooked = true;
    var ref = fbDb.collection("aikm_admin").doc("omsTrackingPush");
    function apply(d) {
      var x = d.exists ? d.data() : {};
      data = { failed: (x.last && x.last.failed) || {}, stuck: x.stuck || {}, ids: x.ids || {} };
      paintBadges(); paintButtons();
    }
    ref.onSnapshot(apply, function () {});
    var aref = fbDb.collection("aikm_admin").doc("amazonConfirm");
    function applyA(d) {
      amz = d.exists ? d.data() : { ids: {} };
      var parts = [], err = false, newest = 0;
      ["praso", "sastastore"].forEach(function (k) {
        var l = amz["last_" + k]; if (!l) return;
        var when = l.at && l.at.toDate ? l.at.toDate().getTime() : 0; if (when > newest) newest = when;
        if (l.failed) err = true;
        parts.push((k === "praso" ? "Praso" : "Sasta Store") + ": " + (l.message || ""));
      });
      var ago = newest ? Math.round((Date.now() - newest) / 60000) : null;
      var t = parts.length ? "Amazon " + (ago == null ? "" : ago < 1 ? "just now" : ago < 120 ? ago + " min ago" : Math.round(ago / 60) + " h ago") + " · " + parts.join(" · ") : "";
      document.querySelectorAll(".sn-amzinfo").forEach(function (sp) { sp.textContent = t; sp.title = parts.join("\n"); sp.classList.toggle("sn-err", err); });
      paintBadges(); paintButtons();
    }
    aref.onSnapshot(applyA, function () {});
    function pull() { ref.get({ source: "server" }).then(apply).catch(function () {}); aref.get({ source: "server" }).then(applyA).catch(function () {}); }
    pull(); setInterval(pull, 1800000);
  }
  var h = setInterval(function () { hook(); if (hooked) clearInterval(h); }, 2000);

  /* red "Rejected by OMS (n)" button next to the push status */
  function paintButtons() {
    var n = list().length;
    document.querySelectorAll(".sn-pushinfo").forEach(function (info) {
      var b = info.parentNode.querySelector(".pe-btn");
      if (!b) {
        b = document.createElement("button"); b.type = "button"; b.className = "pe-btn";
        b.addEventListener("click", openModal);
        info.parentNode.insertBefore(b, info.nextSibling);
      }
      b.style.display = n ? "" : "none";
      b.innerHTML = '<i class="ti ti-alert-triangle"></i> Rejected · ' + n;
    });
  }

  /* remark under matching orders in the tables */
  function paintBadges() {
    var m = byId();
    document.querySelectorAll(".pe-remark").forEach(function (e) { e.remove(); });
    if (!Object.keys(m).length) return;
    document.querySelectorAll("#ndBody tr, #cfBody tr, #nbBody tr").forEach(function (tr) {
      var cells = tr.querySelectorAll(".cx-awb");
      for (var i = 0; i < cells.length; i++) {
        var x = m[nid(cells[i].textContent)];
        if (x) {
          var e = x.src === "Amazon" ? explainAmz(x.raw) : explain(x.raw), d = document.createElement("div");
          d.className = "pe-remark"; d.title = e.fix;
          d.innerHTML = '<i class="ti ti-alert-triangle"></i> ' + (x.src === "Amazon" ? "Amazon rejected: " : "OMS rejected: ") + esc(e.why);
          var td = tr.lastElementChild; td.appendChild(d);
          break;
        }
      }
    });
  }
  // tables re-render often — re-apply remarks after each change
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(paintBadges, 120); });
  function watch() { ["ndBody", "cfBody", "nbBody"].forEach(function (id) { var el = document.getElementById(id); if (el && !el.__peWatched) { el.__peWatched = 1; mo.observe(el, { childList: true }); } }); }
  setInterval(function () { watch(); paintButtons(); }, 3000);

  /* details popup */
  function openModal() {
    var rows = list(), ov = document.createElement("div");
    ov.className = "admin-modal-overlay"; ov.style.display = "flex";
    ov.innerHTML = '<div class="admin-modal-box pe-box"><div class="admin-modal-head"><span class="admin-modal-kicker">Tracking push · Amazon confirmation</span><h3>Rejected by OMS Guru / Amazon · ' + rows.length + '</h3></div>' +
      '<div class="admin-modal-body"><div class="table-scroll"><table class="data"><thead><tr><th>Order</th><th>AWB</th><th>Reason</th><th>What to do</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var e = x.src === "Amazon" ? explainAmz(x.raw) : explain(x.raw);
        return '<tr><td><div class="cx-awb">' + esc(x.id) + '</div><div class="nb-muted nb-small">' + esc([x.src === "Amazon" ? "Amazon" : "OMS Guru", x.acct, x.st].filter(Boolean).join(" · ")) + '</div></td>' +
          '<td><div class="cx-awb">' + esc(x.awb) + '</div><div class="nb-muted nb-small">' + esc(x.c) + '</div></td>' +
          '<td class="pe-why">' + esc(e.why) + '<div class="nb-muted nb-small">' + (x.src === "Amazon" ? "Amazon" : "OMS") + ' said: ' + esc(x.raw) + '</div></td><td>' + esc(e.fix) + '</td></tr>';
      }).join("") + '</tbody></table></div></div>' +
      '<div class="admin-modal-actions"><button type="button" class="admin-modal-btn ghost pe-copy">Copy list for OMS support</button><button type="button" class="admin-modal-btn gold pe-close">Close</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (ev) { if (ev.target === ov || ev.target.closest(".pe-close")) ov.remove(); });
    ov.querySelector(".pe-copy").addEventListener("click", function () {
      var t = "Please update AWB on these orders (already Shipped, AWB missing):\n" + rows.filter(function (x) { return x.src !== "Amazon" && /status/.test(x.raw); }).map(function (x) { return x.id + " → " + x.awb + (x.c ? " (" + x.c + ")" : ""); }).join("\n");
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { ov.querySelector(".pe-copy").textContent = "Copied ✓"; }, function () { prompt("Copy this:", t); });
    });
  }

  var st = document.createElement("style");
  st.textContent = "@media screen{" +
    "html#aikm body button.pe-btn{display:inline-flex !important;align-items:center;gap:6px;border-radius:20px !important;padding:6px 12px !important;min-height:0 !important;font-size:12px !important;font-weight:700 !important;background:var(--x-red-soft) !important;color:var(--x-red) !important;border:1px solid color-mix(in srgb,var(--x-red) 40%,transparent) !important;cursor:pointer;}" +
    "html#aikm body .pe-remark{margin-top:5px;font-size:11px;font-weight:600;color:var(--x-red);display:flex;gap:4px;align-items:flex-start;max-width:240px;line-height:1.35;}" +
    "html#aikm body .pe-box{max-width:980px !important;width:94vw;}" +
    "html#aikm body .pe-box .table-scroll{max-height:60vh;overflow:auto;}" +
    "html#aikm body .pe-box td{vertical-align:top !important;font-size:12.5px;}" +
    "html#aikm body .pe-why{color:var(--x-red) !important;font-weight:600;}" +
    "}";
  document.head.appendChild(st);
})();

/* ===== Order/AWB Scanner upgrade (Oct 2026): Scan Log first, Deliver By column, SLA pop-up,
   near-SLA colours (non-ATS), premium Excel export ===== */
(function () {
  if (window.__aikmScanUpgrade) return;
  window.__aikmScanUpgrade = true;
  var NEAR_DAYS = 4; /* non-ATS orders due within this many days of scanning get coloured */

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ymdLocal(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function pDate(s) {
    if (!s) return null;
    if (s instanceof Date) return isNaN(s) ? null : new Date(s.getFullYear(), s.getMonth(), s.getDate());
    s = String(s).trim();
    if (!s || s === "—") return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) return new Date(+m[3], m[2] - 1, +m[1]);
    var d = new Date(s.replace(/\s+\d{1,2}:\d{2}.*$/, ""));
    if (isNaN(d)) d = new Date(s);
    if (isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function fmtDay(s) {
    var d = pDate(s);
    if (!d) return s ? String(s) : "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function U(v) {
    return String(v || "").replace(/^`+/, "").trim().toUpperCase();
  }

  /* ---------- OMS lookup (for SLA / courier / deliver-by fallbacks) ---------- */
  var omsIdx = {}, omsIdxFor = null;
  function omsFor(e) {
    var raw = window.omsOrdersRaw || [];
    if (omsIdxFor !== raw) {
      omsIdx = {};
      raw.forEach(function (o) {
        [o.awb, o.channelOrderId, o.invoiceNumber].forEach(function (k) {
          k = U(k);
          if (k && !omsIdx[k]) omsIdx[k] = o;
        });
      });
      omsIdxFor = raw;
    }
    return omsIdx[U(e.AWB)] || omsIdx[U(e["Order No"])] || null;
  }
  function slaOf(e) {
    if (e["SLA Date"]) return e["SLA Date"];
    var o = omsFor(e);
    return (o && o.slaDate) || "";
  }
  /* Deliver By: from the scan entry, OMS (if it ever has it), or the Amazon SP-API map */
  function deliverByOf(e) {
    if (e["Deliver By"]) return e["Deliver By"];
    var o = omsFor(e);
    if (o) {
      var v = o.deliverBy || o.deliverByDate || o.latestDeliveryDate || o.promiseDate;
      if (v) return v;
    }
    var m = window.__aikmDeliverByMap;
    if (m) {
      var k = U(e["Order No"]) || U(e.AWB);
      if (k && m[k]) return m[k];
    }
    return "";
  }
  window.aikmDeliverByOf = deliverByOf;
  /* Amazon SP-API "deliver by" dates — published by the Amazon sync into deliverByIndex/<account> */
  var dbUnsub = null;
  function startDeliverBySync() {
    if (dbUnsub || typeof fbDb === "undefined" || !fbDb) return;
    dbUnsub = fbDb.collection("deliverByIndex").onSnapshot(
      function (snap) {
        var m = {};
        snap.forEach(function (d) {
          var o = (d.data() || {}).orders || {};
          Object.keys(o).forEach(function (k) { m[U(k)] = o[k]; });
        });
        window.__aikmDeliverByMap = m;
        if (typeof window.aikmRenderScanLog === "function") window.aikmRenderScanLog();
      },
      function (e) { console.warn("Deliver-by sync error", e); },
    );
  }
  var dbPoll = setInterval(function () { startDeliverBySync(); if (dbUnsub) clearInterval(dbPoll); }, 2000);
  setTimeout(function () { clearInterval(dbPoll); }, 120000);
  function courierOf(e) {
    var c = "";
    try {
      var r = window.resolveCourierForAwb && window.resolveCourierForAwb(e.AWB);
      if (r && r.courier) c = r.courier;
    } catch (x) {}
    if (!c) {
      var o = omsFor(e);
      c = (o && o.courier) || "";
    }
    return String(c).trim();
  }
  function isAts(e) {
    if (/easy\s*ship/i.test(e["Ship Type"] || "")) return true;
    var c = courierOf(e);
    return /^(ats|amazon|amzn)/i.test(c);
  }
  /* Everything is calculated from the Amazon Deliver By date only (SLA date is just the ship-by date and is ignored here). */
  function slaInfo(e) {
    var scan = pDate(e.date) || pDate(ymdLocal(new Date()));
    var sla = pDate(slaOf(e)), dlv = pDate(deliverByOf(e));
    if (dlv && dlv < scan) {
      var m = Math.round((scan - dlv) / 864e5);
      return { cls: "crossed", col: "db", short: "Passed " + m + "d", label: "Deliver-by date passed " + m + " day" + (m === 1 ? "" : "s") + " ago" };
    }
    if (dlv && !isAts(e)) {
      var d = Math.round((dlv - scan) / 864e5);
      if (d <= 1) return { cls: "urgent", col: "db", short: d === 0 ? "Deliver today" : "Deliver tomorrow", label: d === 0 ? "Must deliver today" : "Must deliver tomorrow" };
      if (d <= NEAR_DAYS) return { cls: "soon", col: "db", short: "Deliver in " + d + "d", label: "Must deliver in " + d + " days" };
    }
    return { cls: "", col: "", short: "", label: dlv ? "On time" : "" };
  }
  window.aikmSlaInfo = slaInfo;

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#scanLogTable tbody tr.sla-crossed td{background:rgba(229,72,77,.17)!important;}" +
    "#scanLogTable tbody tr.sla-crossed td:first-child{box-shadow:inset 4px 0 0 #E5484D;}" +
    "#scanLogTable tbody tr.sla-urgent td{background:rgba(240,140,40,.18)!important;}" +
    "#scanLogTable tbody tr.sla-urgent td:first-child{box-shadow:inset 4px 0 0 #F08C28;}" +
    "#scanLogTable tbody tr.sla-soon td{background:rgba(224,178,30,.15)!important;}" +
    "#scanLogTable tbody tr.sla-soon td:first-child{box-shadow:inset 4px 0 0 #E0B21E;}" +
    ".aikm-sla-pill{display:inline-block;margin-top:3px;padding:1px 8px;border-radius:10px;font-size:9.5px;font-weight:700;white-space:nowrap;}" +
    ".aikm-sla-pill.crossed{background:#E5484D;color:#fff;}.aikm-sla-pill.urgent{background:#F08C28;color:#fff;}.aikm-sla-pill.soon{background:#E0B21E;color:#1a1a1a;}" +
    ".aikm-sla-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:11px;margin:4px 0 8px;color:var(--shell-text-dim,#8891A3);}" +
    ".aikm-sla-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;}" +
    ".aikm-sla-banner{margin-bottom:8px;padding:8px 12px;border-radius:8px;font-weight:700;font-size:12px;}" +
    ".aikm-sla-banner.crossed{background:rgba(229,72,77,.15);color:#E5484D;border:1px solid rgba(229,72,77,.4);}" +
    ".aikm-sla-banner.urgent{background:rgba(240,140,40,.15);color:#D97706;border:1px solid rgba(240,140,40,.4);}" +
    ".aikm-sla-banner.soon{background:rgba(224,178,30,.14);color:#B98A00;border:1px solid rgba(224,178,30,.4);}" +
    ".aikm-sla-modal{z-index:2147483000!important;}" +
    ".aikm-sla-box{max-width:470px!important;border:1px solid rgba(229,72,77,.55)!important;}" +
    ".aikm-sla-icon{width:48px;height:48px;border-radius:50%;background:rgba(229,72,77,.15);color:#E5484D;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;animation:aikmSlaPulse 1.2s ease-in-out infinite;}" +
    "@keyframes aikmSlaPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,72,77,.45);}50%{box-shadow:0 0 0 10px rgba(229,72,77,0);}}" +
    ".aikm-sla-kicker{color:#E5484D!important;font-weight:800;letter-spacing:.14em;font-size:10.5px;}" +
    ".aikm-sla-title{margin:6px 0 4px;font-size:18px;color:var(--shell-text,#F5F4EC);}" +
    ".aikm-sla-sub{font-size:12px;color:var(--shell-text-dim,#AFB6C6);}" +
    ".aikm-sla-list{max-height:270px;overflow:auto;margin-top:12px;border:1px solid var(--shell-line,rgba(212,175,55,.2));border-radius:10px;}" +
    ".aikm-sla-item{padding:9px 12px;border-bottom:1px solid var(--shell-line,rgba(212,175,55,.2));font-size:12px;color:var(--shell-text,#F5F4EC);}" +
    ".aikm-sla-item:last-child{border-bottom:none;}" +
    ".aikm-sla-awb{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;color:#E5484D;}" +
    ".aikm-sla-meta{font-size:11px;color:var(--shell-text-mute,#8891A3);margin-top:2px;}" +
    ".aikm-sla-hint{font-size:11px;color:var(--shell-text-mute,#8891A3);margin-top:10px;}";
  document.head.appendChild(css);

  /* ---------- 1. Scan Log tab first, then Product Summary ---------- */
  (function reorderTabs() {
    var sl = document.getElementById("countScanLog"),
      su = document.getElementById("countSummary");
    var b1 = sl && sl.closest(".rtabbtn"),
      b2 = su && su.closest(".rtabbtn");
    if (!b1 || !b2 || b1.parentNode !== b2.parentNode) return;
    b2.parentNode.insertBefore(b1, b2);
    b1.click();
  })();

  /* ---------- 2. Deliver By column + SLA colours in Scan Log ---------- */
  var table = document.getElementById("scanLogTable");
  function ensureHead() {
    if (!table) return;
    var tr = table.querySelector("thead tr");
    if (!tr || tr.querySelector("[data-aikm-db]")) return;
    var ths = [].slice.call(tr.children);
    var wired = ths.some(function (t) { return t.dataset.sortWired; });
    var sla = ths.filter(function (th) { return /SLA\s*DATE/i.test(th.textContent); })[0];
    var th = document.createElement("th");
    th.dataset.aikmDb = "1";
    th.textContent = "Deliver By";
    if (sla) sla.after(th);
    else tr.appendChild(th);
    if (wired) {
      /* re-wire header sorting so column positions stay correct */
      [].slice.call(tr.children).forEach(function (t) {
        var c = t.cloneNode(true);
        delete c.dataset.sortWired;
        delete c.dataset.sortDir;
        c.querySelectorAll(".col-filter-btn,.sort-indicator").forEach(function (x) { x.remove(); });
        t.replaceWith(c);
      });
    }
  }
  function ensureLegend() {
    if (!table || document.getElementById("aikmSlaLegend")) return;
    var host = table.closest(".table-scroll") || table;
    var lg = document.createElement("div");
    lg.id = "aikmSlaLegend";
    lg.className = "aikm-sla-legend";
    lg.innerHTML =
      '<span><i style="background:#E5484D"></i>Deliver-by date passed</span>' +
      '<span><i style="background:#F08C28"></i>Deliver by today / tomorrow (non-ATS)</span>' +
      '<span><i style="background:#E0B21E"></i>Deliver by in 2–' + NEAR_DAYS + " days (non-ATS)</span>";
    host.parentNode.insertBefore(lg, host);
  }
  function filteredRows() {
    var q = ((typeof logSearch !== "undefined" && logSearch && logSearch.value) || "").trim().toLowerCase();
    var rows = scanLog.filter(function (e) { return passesColumnFilters("scanLogTable", e); });
    if (q)
      rows = rows.filter(function (e) {
        return Object.values(e).some(function (v) { return String(v || "").toLowerCase().indexOf(q) >= 0; });
      });
    return rows.slice().sort(function (a, b) {
      var x = pDate(slaOf(a)), y = pDate(slaOf(b));
      return x && y ? x - y : x ? -1 : y ? 1 : 0;
    });
  }
  var obs = null;
  function renderScanLog() {
    if (!table || typeof historyBody === "undefined" || !historyBody) return;
    ensureHead();
    ensureLegend();
    try { setupColumnFilterIcons("scanLogTable", scanLog); } catch (x) {}
    var html = filteredRows()
      .map(function (e) {
        var s = slaInfo(e),
          loss = e.Loss === "YES";
        var cls = (loss ? "loss-row " : "") + (s.cls ? "sla-" + s.cls : "");
        return (
          '<tr data-aikm="1" class="' + cls + '">' +
          "<td>" + esc(e.AWB || "—") + "</td>" +
          "<td>" + esc(e["Order No"] || "—") + "</td>" +
          "<td>" + esc(e.Product || "") + "</td>" +
          "<td>" + channelBadge(e.Channel) + "</td>" +
          "<td>" + esc(e.Qty) + "</td>" +
          "<td>" + fmtMoney(Number(e["Expected Profit"]) || 0) + (loss ? '<span class="loss-badge">LOSS</span>' : "") + "</td>" +
          "<td>" + fmtMoney(Number(e["Cost of Goods"]) || 0) + "</td>" +
          "<td>" + esc(e["Order Date"] || "—") + "</td>" +
          "<td>" + esc(fmtDay(slaOf(e)) || "—") + (s.col === "sla" ? '<div class="aikm-sla-pill ' + s.cls + '">' + esc(s.short) + "</div>" : "") + "</td>" +
          "<td>" + esc(fmtDay(deliverByOf(e)) || "—") + (s.col === "db" ? '<div class="aikm-sla-pill ' + s.cls + '">' + esc(s.short) + "</div>" : "") + "</td>" +
          "<td>" + esc(e["Source File"] || "—") + "</td>" +
          "<td>" + esc(e.date || "—") + "</td></tr>"
        );
      })
      .join("");
    if (obs) obs.disconnect();
    historyBody.innerHTML = html;
    if (obs) obs.observe(historyBody, { childList: true });
  }
  window.aikmRenderScanLog = renderScanLog;
  ensureHead();
  if (typeof historyBody !== "undefined" && historyBody) {
    obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var a = muts[i].addedNodes;
        for (var j = 0; j < a.length; j++) {
          if (a[j].nodeType === 1 && !a[j].dataset.aikm) {
            renderScanLog();
            return;
          }
        }
      }
    });
    obs.observe(historyBody, { childList: true });
  }
  setTimeout(renderScanLog, 0);
  /* refresh colours when OMS data or the date changes */
  var lastOms = null, lastDay = ymdLocal(new Date());
  setInterval(function () {
    var day = ymdLocal(new Date());
    if (window.omsOrdersRaw !== lastOms || day !== lastDay) {
      lastOms = window.omsOrdersRaw;
      lastDay = day;
      renderScanLog();
    }
  }, 5000);

  /* ---------- 3. SLA crossed pop-up when scanning ---------- */
  var modal = null, modalOpen = false, keyBuf = "";
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var ctx = beep.ctx || (beep.ctx = new C());
      [0, 0.22].forEach(function (t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch (x) {}
  }
  function closeModal(buf) {
    modalOpen = false;
    if (modal) modal.style.display = "none";
    if (typeof scanInput !== "undefined" && scanInput) scanInput.focus();
    /* if a new parcel was scanned while the pop-up was open, don't lose it */
    if (buf && buf.trim().length >= 6) {
      var c = cleanAwb(buf);
      if (c) showResult(c);
    }
  }
  function showSlaPopup(title, sub, items) {
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "admin-modal-overlay aikm-sla-modal";
      modal.style.display = "none";
      modal.innerHTML =
        '<div class="admin-modal-box aikm-sla-box">' +
        '<div class="aikm-sla-icon"><i class="ti ti-alarm"></i></div>' +
        '<div class="aikm-sla-kicker">LATE PARCEL</div>' +
        '<h3 class="aikm-sla-title"></h3><div class="aikm-sla-sub"></div>' +
        '<div class="aikm-sla-list"></div>' +
        '<div class="aikm-sla-hint">Keep this parcel aside and check with the team before handing it over.</div>' +
        '<div class="admin-modal-actions"><button type="button" class="admin-modal-btn gold aikm-sla-ok">OK, noted</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector(".aikm-sla-ok").addEventListener("click", function () { closeModal(""); });
      document.addEventListener(
        "keydown",
        function (ev) {
          if (!modalOpen) return;
          if (ev.key === "Enter" || ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            var b = ev.key === "Enter" ? keyBuf : "";
            keyBuf = "";
            closeModal(b);
          } else if (ev.key && ev.key.length === 1) {
            keyBuf += ev.key;
            ev.preventDefault();
          }
        },
        true,
      );
    }
    modal.querySelector(".aikm-sla-title").textContent = title;
    modal.querySelector(".aikm-sla-sub").textContent = sub;
    modal.querySelector(".aikm-sla-list").innerHTML = items
      .map(function (h) {
        return (
          '<div class="aikm-sla-item"><div class="aikm-sla-awb">' + esc(h.code) + "</div>" +
          "<div>" + esc(h.product) + (h.more ? " (+" + h.more + " more)" : "") + " · " + esc(h.channel) + "</div>" +
          '<div class="aikm-sla-meta">SLA ' + esc(fmtDay(h.sla)) + " · " + esc(h.label) +
          (h.deliverBy ? " · Deliver by " + esc(fmtDay(h.deliverBy)) : "") +
          (h.courier ? " · " + esc(h.courier) : "") + "</div></div>"
        );
      })
      .join("");
    keyBuf = "";
    modalOpen = true;
    modal.style.display = "flex";
    beep();
    setTimeout(function () {
      var ok = modal.querySelector(".aikm-sla-ok");
      if (ok) ok.focus();
    }, 30);
  }
  function infoForCode(code) {
    var list = awbMap[code] || orderMap[code];
    if (!list || !list.length) return null;
    var x = list[0];
    var e = {
      AWB: x.awb || code,
      "Order No": x.orderNo || "",
      Product: x.product,
      Channel: x.channel,
      "Ship Type": shipTypeLabel(x),
      "SLA Date": x.slaDate || "",
      date: ymdLocal(new Date()),
    };
    var s = slaInfo(e);
    return {
      code: code, e: e, s: s, product: x.product || "", channel: x.channel || "",
      more: list.length - 1, sla: slaOf(e), label: s.label, deliverBy: deliverByOf(e), courier: courierOf(e),
    };
  }
  function checkCodes(codes, bulk) {
    var hits = [];
    codes.forEach(function (c) {
      var i = infoForCode(c);
      if (i && i.s.cls === "crossed") hits.push(i);
    });
    if (!hits.length) return;
    if (bulk) showSlaPopup(hits.length + " parcel" + (hits.length === 1 ? " has" : "s have") + " past the deliver-by date", "From the list you just processed.", hits);
    else showSlaPopup("This parcel is late", hits[0].label, hits);
  }
  var _showResult = showResult;
  showResult = function (code) {
    var r = _showResult.apply(this, arguments);
    try {
      var i = infoForCode(code);
      if (i && i.s.cls && typeof resultBox !== "undefined" && resultBox)
        resultBox.insertAdjacentHTML("afterbegin", '<div class="aikm-sla-banner ' + i.s.cls + '">⚠ ' + esc(i.s.label) + "</div>");
      checkCodes([code], false);
    } catch (x) {
      console.warn("SLA check failed", x);
    }
    return r;
  };
  window.showResult = showResult;
  var bulkBtnEl = document.getElementById("bulkBtn");
  if (bulkBtnEl)
    bulkBtnEl.addEventListener(
      "click",
      function () {
        var ta = document.getElementById("bulkInput");
        var codes = ((ta && ta.value) || "").split(/\r?\n|,/).map(cleanAwb).filter(Boolean);
        setTimeout(function () { checkCodes(codes, true); }, 80);
      },
      true,
    );

  /* ---------- 4. Premium Excel export (ExcelJS loads only when you click Export) ---------- */
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    if (!loadExcelJS.p)
      loadExcelJS.p = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
        s.onload = res;
        s.onerror = function () {
          loadExcelJS.p = null;
          rej(new Error("Could not load the Excel tool — check your internet and try again."));
        };
        document.head.appendChild(s);
      });
    return loadExcelJS.p;
  }
  var NAVY = "FF0F1E35", NAVY2 = "FF16273F", GOLD = "FFD4AF37", CREAM = "FFFAF6EC", LINE = "FFE6E0D0";
  var FILL = { crossed: ["FFF8D7DA", "FF9B1C1C"], urgent: ["FFFFE0B2", "FF8A4B00"], soon: ["FFFFF3C4", "FF7A5B00"] };
  var MONEY = '"₹"#,##0.00';
  function solid(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
  function xDate(d) { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
  function addSheet(wb, o) {
    var n = o.cols.length;
    var ws = wb.addWorksheet(o.name, {
      properties: { tabColor: { argb: GOLD } },
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });
    o.cols.forEach(function (c, i) { ws.getColumn(i + 1).width = c.w; });
    ws.mergeCells(1, 1, 1, n);
    var t = ws.getCell(1, 1);
    t.value = o.title;
    t.font = { name: "Calibri", size: 15, bold: true, color: { argb: GOLD } };
    t.fill = solid(NAVY);
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, n);
    var s = ws.getCell(2, 1);
    s.value = o.subtitle;
    s.font = { size: 10, color: { argb: "FFF5F4EC" } };
    s.fill = solid(NAVY2);
    s.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(2).height = 20;
    ws.mergeCells(3, 1, 3, n);
    var lg = ws.getCell(3, 1);
    lg.fill = solid(CREAM);
    lg.alignment = { vertical: "middle", indent: 1 };
    if (o.legend) lg.value = { richText: o.legend };
    ws.getRow(3).height = o.legend ? 20 : 8;
    var hr = ws.getRow(4);
    hr.height = 26;
    o.cols.forEach(function (c, i) {
      var cell = hr.getCell(i + 1);
      cell.value = c.h;
      cell.font = { bold: true, size: 10, color: { argb: GOLD } };
      cell.fill = solid(NAVY);
      cell.alignment = { vertical: "middle", horizontal: c.t === "money" || c.t === "int" ? "right" : c.t === "date" ? "center" : "left", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: GOLD } } };
    });
    o.rows.forEach(function (r, ri) {
      var row = ws.getRow(5 + ri);
      row.height = 18;
      var st = r.status && FILL[r.status];
      r.v.forEach(function (val, i) {
        var c = o.cols[i], cell = row.getCell(i + 1);
        if (c.t === "date" && val instanceof Date) {
          cell.value = xDate(val);
          cell.numFmt = "dd-mmm-yyyy";
        } else cell.value = val == null ? "" : val;
        if (c.t === "money") cell.numFmt = MONEY;
        cell.fill = solid(st ? st[0] : ri % 2 ? CREAM : "FFFFFFFF");
        cell.font = { size: 10, color: { argb: st ? st[1] : "FF1B2430" }, bold: !!(st && c.key === "status") };
        cell.alignment = { vertical: "middle", horizontal: c.t === "money" || c.t === "int" ? "right" : c.t === "date" ? "center" : "left" };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      });
      if (r.loss && o.lossCol != null) row.getCell(o.lossCol + 1).font = { size: 10, bold: true, color: { argb: "FFC0392B" } };
    });
    var last = 4 + o.rows.length;
    if (o.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: n } };
    if (o.totals) {
      var tr = ws.getRow(last + 1);
      tr.height = 22;
      o.totals.forEach(function (val, i) {
        var c = o.cols[i], cell = tr.getCell(i + 1);
        cell.value = val == null ? "" : val;
        if (c.t === "money") cell.numFmt = MONEY;
        cell.font = { bold: true, size: 10.5, color: { argb: NAVY } };
        cell.fill = solid("FFF3E7C1");
        cell.border = { top: { style: "medium", color: { argb: GOLD } } };
        cell.alignment = { vertical: "middle", horizontal: c.t === "money" || c.t === "int" ? "right" : "left" };
      });
    }
    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return ws;
  }
  function toast(msg) {
    if (typeof window.cxToast === "function") return window.cxToast(msg);
  }
  async function premiumExport() {
    if (!scanLog.length) return void alert("No scans yet to export.");
    try {
      await loadExcelJS();
    } catch (e) {
      return void alert(e.message);
    }
    var ORDER = { crossed: 0, urgent: 1, soon: 2, "": 3 };
    var items = scanLog.map(function (e) { return { e: e, s: slaInfo(e) }; });
    items.sort(function (a, b) {
      var d = ORDER[a.s.cls] - ORDER[b.s.cls];
      if (d) return d;
      var x = pDate(slaOf(a.e)), y = pDate(slaOf(b.e));
      return x && y ? x - y : x ? -1 : y ? 1 : 0;
    });
    var cnt = { crossed: 0, urgent: 0, soon: 0 }, qty = 0, profit = 0, cost = 0;
    items.forEach(function (it) {
      if (cnt[it.s.cls] != null) cnt[it.s.cls]++;
      qty += Number(it.e.Qty) || 0;
      profit += Number(it.e["Expected Profit"]) || 0;
      cost += Number(it.e["Cost of Goods"]) || 0;
    });
    var now = new Date();
    var when = now.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var sub = "Generated " + when + "  ·  " + scanLog.length + " scans  ·  " + cnt.crossed + " deliver-by passed  ·  " + cnt.urgent + " deliver today/tomorrow  ·  " + cnt.soon + " deliver in 2–" + NEAR_DAYS + " days";
    var legend = [
      { text: "■ ", font: { size: 12, color: { argb: "FFE5484D" } } },
      { text: "Deliver-by date passed      ", font: { size: 10, color: { argb: NAVY } } },
      { text: "■ ", font: { size: 12, color: { argb: "FFF08C28" } } },
      { text: "Deliver by today / tomorrow (non-ATS)      ", font: { size: 10, color: { argb: NAVY } } },
      { text: "■ ", font: { size: 12, color: { argb: "FFE0B21E" } } },
      { text: "Deliver by in 2–" + NEAR_DAYS + " days (non-ATS)", font: { size: 10, color: { argb: NAVY } } },
    ];
    var wb = new ExcelJS.Workbook();
    wb.creator = "AIKM Pharma";
    wb.created = now;

    /* Sheet 1 — Scan Log */
    var c1 = [
      { h: "#", w: 6, t: "int" }, { h: "AWB", w: 22 }, { h: "Order No", w: 22 }, { h: "Product", w: 46 },
      { h: "Channel", w: 22 }, { h: "Courier", w: 18 }, { h: "Ship Type", w: 12 }, { h: "Qty", w: 7, t: "int" },
      { h: "Profit", w: 12, t: "money" }, { h: "Cost", w: 12, t: "money" }, { h: "Order Date", w: 13, t: "date" },
      { h: "SLA Date", w: 13, t: "date" }, { h: "Deliver By", w: 13, t: "date" }, { h: "Delivery Status", w: 30, key: "status" },
      { h: "Scanned At", w: 22 }, { h: "Source", w: 22 },
    ];
    var r1 = items.map(function (it, i) {
      var e = it.e;
      var c = courierOf(e);
      if (/^(ats|amazon|amzn)/i.test(c)) c = "Amazon Shipping (ATS)";
      return {
        status: it.s.cls,
        loss: e.Loss === "YES",
        v: [
          i + 1, e.AWB || "", e["Order No"] || "", e.Product || "", e.Channel || "", c, e["Ship Type"] || "",
          Number(e.Qty) || 0, Number(e["Expected Profit"]) || 0, Number(e["Cost of Goods"]) || 0,
          pDate(e["Order Date"]) || e["Order Date"] || "", pDate(slaOf(e)) || slaOf(e) || "",
          pDate(deliverByOf(e)) || "", e.Product === "NOT FOUND" ? "Not found" : it.s.label || "",
          e.ScannedAt || e.date || "", e["Source File"] || "",
        ],
      };
    });
    addSheet(wb, {
      name: "Scan Log", title: "AIKM Pharma — Order Scan Log", subtitle: sub, legend: legend, cols: c1, rows: r1, lossCol: 8,
      totals: ["", "TOTAL", "", "", "", "", "", qty, profit, cost, "", "", "", "", "", ""],
    });

    /* Sheet 2 — Product Summary */
    var sm = {};
    scanLog.forEach(function (e) {
      if (e.Product === "NOT FOUND") return;
      var k = e.Product + "||" + e.Channel;
      sm[k] || (sm[k] = { p: e.Product, c: e.Channel, q: 0, pr: 0, co: 0 });
      sm[k].q += Number(e.Qty) || 0;
      sm[k].pr += Number(e["Expected Profit"]) || 0;
      sm[k].co += Number(e["Cost of Goods"]) || 0;
    });
    var sl = Object.values(sm).sort(function (a, b) { return b.q - a.q; });
    var sq = 0, sp = 0, sc = 0;
    var r2 = sl.map(function (x, i) {
      sq += x.q; sp += x.pr; sc += x.co;
      return { loss: x.pr < 0, v: [i + 1, x.p, x.c, x.q, x.pr, x.co, x.q ? x.pr / x.q : 0] };
    });
    addSheet(wb, {
      name: "Product Summary", title: "AIKM Pharma — Product Summary",
      subtitle: "Generated " + when + "  ·  " + sl.length + " products  ·  " + sq + " units",
      cols: [
        { h: "#", w: 6, t: "int" }, { h: "Product", w: 50 }, { h: "Channel", w: 24 }, { h: "Total Qty", w: 11, t: "int" },
        { h: "Expected Profit", w: 16, t: "money" }, { h: "Cost of Goods", w: 16, t: "money" }, { h: "Profit / Unit", w: 14, t: "money" },
      ],
      rows: r2, lossCol: 4, totals: ["", "TOTAL", "", sq, sp, sc, sq ? sp / sq : 0],
    });

    /* Sheet 3 — Not Found */
    var nf = scanLog.filter(function (e) { return e.Product === "NOT FOUND"; });
    addSheet(wb, {
      name: "Not Found", title: "AIKM Pharma — Scans Not Found", subtitle: "Generated " + when + "  ·  " + nf.length + " not found",
      cols: [{ h: "#", w: 6, t: "int" }, { h: "AWB / Order No", w: 28 }, { h: "Date", w: 14 }, { h: "Scanned At", w: 24 }],
      rows: nf.map(function (e, i) { return { v: [i + 1, e.AWB || "", e.date || "", e.ScannedAt || ""] }; }),
    });

    /* Sheet 4 — Loss Orders */
    var lo = scanLog.filter(function (e) { return e.Loss === "YES"; });
    var lp = 0;
    addSheet(wb, {
      name: "Loss Orders", title: "AIKM Pharma — Loss Orders", subtitle: "Generated " + when + "  ·  " + lo.length + " loss orders",
      cols: [
        { h: "#", w: 6, t: "int" }, { h: "AWB", w: 22 }, { h: "Order No", w: 22 }, { h: "Product", w: 46 }, { h: "Channel", w: 22 },
        { h: "Ship Type", w: 12 }, { h: "Qty", w: 7, t: "int" }, { h: "Profit", w: 12, t: "money" }, { h: "Date", w: 13 },
      ],
      rows: lo.map(function (e, i) {
        lp += Number(e["Expected Profit"]) || 0;
        return { loss: true, v: [i + 1, e.AWB || "", e["Order No"] || "", e.Product || "", e.Channel || "", e["Ship Type"] || "", Number(e.Qty) || 0, Number(e["Expected Profit"]) || 0, e.date || ""] };
      }),
      lossCol: 7, totals: ["", "TOTAL", "", "", "", "", "", lp, ""],
    });

    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AIKM_Scan_Report_" + ymdLocal(now) + "_" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast("Excel report downloaded");
  }
  exportAllData = premiumExport;
  window.exportAllData = premiumExport;
  var dl = document.getElementById("downloadBtn");
  if (dl)
    dl.addEventListener(
      "click",
      function (ev) {
        ev.stopImmediatePropagation();
        premiumExport();
      },
      true,
    );
})();

/* ===== Order Mapper: "Send to LOTS Cart" (Oct 2026) =====
   Puts the LOTS vendor order into Firestore (lotsCartQueue). A GitHub robot
   (lots-price-sync / lots-cart-push.js) uploads it to LOTS Smart Cart in parts of 99
   and writes back what was added / what failed. It never places the order. */
(function () {
  if (window.__aikmLotsCartPush) return;
  window.__aikmLotsCartPush = true;
  var QUEUE = "lotsCartQueue", VENDOR = "LOTS";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function db() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
  function ago(ms) {
    if (!ms) return "";
    var m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  var css = document.createElement("style");
  css.textContent =
    "#lotsCartBtn{margin-left:8px;background:#0F1E35;color:#D4AF37;border:1px solid #D4AF37;font-weight:700;}" +
    "#lotsCartBtn:disabled{opacity:.6;cursor:wait;}" +
    "#lotsCartPanel{margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid rgba(212,175,55,.45);background:#FAF6EC;color:#0F1E35;font-size:13px;display:none;}" +
    "#lotsCartPanel .lc-head{display:flex;align-items:center;gap:10px;font-weight:800;font-size:14px;}" +
    "#lotsCartPanel .lc-sub{color:#5b6475;margin-top:4px;}" +
    "#lotsCartPanel .lc-dot{width:10px;height:10px;border-radius:50%;flex:none;}" +
    "#lotsCartPanel .lc-dot.wait{background:#E0B21E;animation:lcPulse 1.2s infinite;}" +
    "#lotsCartPanel .lc-dot.ok{background:#1F8A4C;}#lotsCartPanel .lc-dot.bad{background:#E5484D;}" +
    "@keyframes lcPulse{50%{opacity:.35}}" +
    "#lotsCartPanel table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;background:#fff;}" +
    "#lotsCartPanel th{background:#0F1E35;color:#D4AF37;text-align:left;padding:6px 8px;}" +
    "#lotsCartPanel td{padding:6px 8px;border-bottom:1px solid #eee3c8;}" +
    "#lotsCartPanel .lc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}" +
    "#lotsCartPanel .lc-actions a,#lotsCartPanel .lc-actions button{padding:6px 12px;border-radius:8px;border:1px solid #0F1E35;background:#fff;color:#0F1E35;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none;}" +
    "#lotsCartPanel .lc-actions .gold{background:#0F1E35;color:#D4AF37;}";
  document.head.appendChild(css);

  var dl = document.getElementById("orderMapperDownloadBtn");
  if (!dl) return;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "lotsCartBtn";
  btn.className = dl.className;
  btn.textContent = "🛒 Send to LOTS Cart";
  dl.after(btn);
  var panel = document.createElement("div");
  panel.id = "lotsCartPanel";
  (dl.closest(".card") || dl.parentNode).appendChild(panel);

  var latest = null;
  function render(d) {
    latest = d;
    if (!d) { panel.style.display = "none"; return; }
    panel.style.display = "block";
    var when = ago(d.createdAtMs), html = "";
    if (d.status === "pending" || d.status === "processing") {
      html =
        '<div class="lc-head"><span class="lc-dot wait"></span>Sending ' + d.sentCount + " products to your LOTS cart…</div>" +
        '<div class="lc-sub">' + esc(d.status === "processing" ? d.progress || "Robot is logging into LOTS…" : "Waiting for the robot — starts automatically within 5–15 minutes.") + " · requested " + when + "</div>";
    } else if (d.status === "failed") {
      html =
        '<div class="lc-head"><span class="lc-dot bad"></span>Could not send to LOTS</div>' +
        '<div class="lc-sub">' + esc(d.error || "Unknown error") + "</div>" +
        '<div class="lc-actions"><button type="button" class="gold" data-lc="retry">↻ Try again</button></div>';
    } else if (d.status === "done") {
      var f = d.failedItems || [];
      html =
        '<div class="lc-head"><span class="lc-dot ' + (f.length ? "bad" : "ok") + '"></span>' +
        d.addedCount + " of " + d.sentCount + " products added to your LOTS cart" + (f.length ? " · " + f.length + " need attention" : " ✓") + "</div>" +
        '<div class="lc-sub">Uploaded in ' + (d.parts || []).length + " part" + ((d.parts || []).length === 1 ? "" : "s") + " · cart now has " + (d.cartProductCount || 0) + " products" + (d.clearedCount ? " · " + d.clearedCount + " old products cleared first" : "") + (d.duplicatesMerged ? " · " + d.duplicatesMerged + " duplicate lines merged" : "") + " · " + when + "</div>";
      if (f.length)
        html +=
          "<table><thead><tr><th>Item Code</th><th>Product</th><th>Order Qty</th><th>In Cart</th><th>Reason</th></tr></thead><tbody>" +
          f.map(function (x) { return "<tr><td>" + esc(x.code) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.reason) + "</td></tr>"; }).join("") +
          "</tbody></table>";
      html +=
        '<div class="lc-actions"><a class="gold" href="https://www.lotswholesale.com/member/cart" target="_blank" rel="noopener">Open LOTS cart → review & place order</a>' +
        (f.length ? '<button type="button" data-lc="xls">⬇ Failed items Excel</button>' : "") +
        '<button type="button" data-lc="hide">Hide</button></div>';
    }
    panel.innerHTML = html;
    btn.disabled = d.status === "pending" || d.status === "processing";
  }
  panel.addEventListener("click", function (e) {
    var a = e.target.closest("[data-lc]");
    if (!a || !latest) return;
    if (a.dataset.lc === "hide") panel.style.display = "none";
    if (a.dataset.lc === "retry") send(latest.items);
    if (a.dataset.lc === "xls" && window.XLSX) {
      var ws = XLSX.utils.json_to_sheet((latest.failedItems || []).map(function (x, i) {
        return { "S.No": i + 1, "Item Code": x.code, "Product Name": x.name, "Order Qty": x.qty, "In Cart Qty": x.cartQty, "Failure Reason": x.reason };
      }));
      ws["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 50 }, { wch: 10 }, { wch: 11 }, { wch: 45 }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Failed Items");
      XLSX.writeFile(wb, "LOTS_Failed_Items_" + new Date().toISOString().slice(0, 10) + ".xlsx");
    }
  });

  function mergeDup(items) {
    var m = {}, out = [];
    items.forEach(function (x) {
      var k = String(x.code).trim().replace(/^0+(?=\d)/, "");
      if (m[k]) m[k].qty += Number(x.qty) || 0;
      else { m[k] = { code: String(x.code), name: x.name || "", qty: Number(x.qty) || 0 }; out.push(m[k]); }
    });
    return out;
  }
  function send(raw) {
    var d = db();
    var dup = raw.length, items = mergeDup(raw);
    dup = dup - items.length;
    if (!d) return void alert("Cloud sync isn't connected yet — wait a moment and try again.");
    var units = items.reduce(function (s, x) { return s + (Number(x.qty) || 0); }, 0);
    var parts = Math.ceil(items.length / 99);
    if (!confirm(
      "Send " + items.length + " LOTS products (" + units + " units) to your LOTS cart?\n\n" +
      (dup ? "• " + dup + " duplicate lines were merged (quantities added)\n" : "") +
      "• Uploaded in " + parts + " part" + (parts === 1 ? "" : "s") + " of up to 99 products\n" +
      "• Takes about 5–10 minutes\n" +
      "• Your LOTS cart is emptied first (old items removed)\n" +
      "• Only fills the cart — you place the order yourself"
    )) return;
    btn.disabled = true;
    d.collection(QUEUE)
      .add({
        status: "pending",
        vendor: VENDOR,
        items: items.map(function (x) { return { code: String(x.code), name: x.name || "", qty: Number(x.qty) || 0 }; }),
        sentCount: items.length,
        createdAtMs: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .catch(function (e) {
        btn.disabled = false;
        alert("Could not send: " + (e.message || e));
      });
  }

  btn.addEventListener("click", function () {
    if (latest && (latest.status === "pending" || latest.status === "processing"))
      return void alert("An order is already being sent to LOTS — wait for it to finish.");
    var by = typeof computeByVendor === "function" ? computeByVendor() : {};
    var items = (by[VENDOR] || []).filter(function (x) { return x.code && x.qty > 0; });
    if (!items.length) return void alert("No LOTS products with an item code and quantity yet — match products to LOTS first.");
    send(items);
  });

  var unsub = null;
  (function start() {
    var d = db();
    if (!d) return void setTimeout(start, 2000);
    if (unsub) return;
    unsub = d.collection(QUEUE).orderBy("createdAtMs", "desc").limit(1).onSnapshot(
      function (snap) { render(snap.empty ? null : snap.docs[0].data()); },
      function (e) { console.warn("LOTS cart status error", e); },
    );
  })();
})();

/* ===== Sync health: problems (quota, OMS page changes, login, keys…) + full logs ===== */
(function () {
  if (window.__aikmSyncHealth) return; window.__aikmSyncHealth = true;
  var JOBS = [
    ["oms", "OMS Guru sync", 40], ["nimbus", "NimbusPost sync", 150], ["push", "Tracking push to OMS", 0],
    ["amazon", "Amazon confirmation", 0], ["spapi_praso", "Amazon sync (Praso)", 150], ["spapi_sasta", "Amazon sync (Sasta Store)", 300],
    ["easyship", "Easy Ship labels", 0],
  ];
  var H = {}, U = null, hooked = false;
  var MET = [["reads", "Reads"], ["writes", "Writes"], ["deletes", "Deletes"]];
  function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
  // Firebase usage → list of {project, metric, used%, projected%, level}
  function usageRows() {
    var out = []; if (!U || !U.projects) return out;
    Object.keys(U.projects).forEach(function (k) {
      var p = U.projects[k]; if (!p.ok) return;
      MET.forEach(function (m) {
        var lim = (U.limits || {})[m[0]] || 1, used = p[m[0]] || 0, proj = p[m[0] + "Projected"] || used;
        var pct = Math.round(used / lim * 100), ppct = Math.round(proj / lim * 100);
        out.push({ k: k, label: p.label, m: m[1], used: used, lim: lim, pct: pct, ppct: ppct, hour: p[m[0] + "LastHour"] || 0,
          extra: Math.max(0, used - lim), level: pct >= 100 ? "over" : (pct >= 80 || ppct >= 100) ? "near" : "ok" });
      });
    });
    return out;
  }
  // on Blaze, going over the free limit only costs money — it is an issue only when the month heads past the budget
  function usageIssues() {
    var c = { bad: 0, stale: 0 }, k = U && U.cost, b = (U && U.budgetInr) || 500;
    if (k && k.monthInr >= b) c.bad++; else if (k && (k.monthProjectedInr >= b || k.monthInr >= b * 0.8)) c.stale++;
    return c;
  }
  function inr(n) { n = Number(n || 0); return "₹" + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString("en-IN")); }
  function usageFresh() { return U && U.at && U.at.toDate && Date.now() - U.at.toDate().getTime() < 3 * 3600e3; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ts(v) { return v && v.toDate ? v.toDate() : null; }
  function ago(d) {
    if (!d) return "never";
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    return m < 1 ? "just now" : m < 120 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago";
  }
  function state(j) {
    var e = H[j[0]]; if (!e) return { k: "none", t: "No report yet" };
    var at = ts(e.at);
    if (!e.ok) return { k: "bad", t: e.reason || "Failed" };
    if (j[2] && at && Date.now() - at.getTime() > j[2] * 60000) return { k: "stale", t: "Not run since " + ago(at) };
    return { k: "ok", t: "Working" };
  }
  function counts() {
    var c = { bad: 0, stale: 0 }; JOBS.forEach(function (j) { var s = state(j).k; if (c[s] != null) c[s]++; });
    if (usageFresh()) { var u = usageIssues(); c.bad += u.bad; c.stale += u.stale; }
    return c;
  }

  /* ---- top-bar pill ---- */
  function pill() {
    var hdr = document.querySelector(".app-header"); if (!hdr) return;
    var p = document.getElementById("shPill");
    if (!p) {
      p = document.createElement("button"); p.type = "button"; p.id = "shPill"; p.className = "sh-pill";
      p.addEventListener("click", openPanel);
      var sp = hdr.querySelector(".app-header-spacer"); hdr.insertBefore(p, sp ? sp.nextSibling : null);
    }
    var c = counts(), n = c.bad + c.stale;
    p.className = "sh-pill " + (c.bad ? "bad" : c.stale ? "stale" : "ok");
    var top = usageRows().sort(function (a, b) { return b.pct - a.pct; })[0];
    p.innerHTML = '<span class="sh-dot"></span>' + (n ? n + " sync issue" + (n > 1 ? "s" : "") : "All syncs OK") +
      (usageFresh() && U.cost ? '<span class="sh-fb">Firebase ' + inr(U.cost.monthInr) + " this month</span>" : (top && usageFresh() ? '<span class="sh-fb">Firebase ' + top.pct + "%</span>" : ""));
    p.title = "Click to see every sync and its log";
    var pnl = document.getElementById("shPanel"); if (pnl) fillPanel(pnl);
  }

  /* ---- panel with every sync ---- */
  function openPanel() {
    var ov = document.createElement("div"); ov.className = "admin-modal-overlay"; ov.style.display = "flex"; ov.id = "shOverlay";
    ov.innerHTML = '<div class="admin-modal-box sh-box"><div class="admin-modal-head"><span class="admin-modal-kicker">AIKM · Live status</span><h3>Sync health &amp; Firebase cost</h3></div>' +
      '<div class="admin-modal-body"><div id="shPanel"></div></div>' +
      '<div class="admin-modal-actions"><a class="admin-modal-btn ghost" href="https://github.com/pransu49/oms-sync/actions" target="_blank" rel="noopener">All runs on GitHub</a><button type="button" class="admin-modal-btn gold sh-close">Close</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".sh-close")) ov.remove(); });
    fillPanel(ov.querySelector("#shPanel"));
  }
  function usageHtml() {
    if (!U || !U.projects) return '<div class="fb-box"><div class="fb-head"><div><div class="fb-kick">Firebase</div><div class="fb-title">Usage &amp; cost</div></div></div><div class="nb-muted">Waiting for the first usage check (runs every 30 min).</div></div>';
    var at = ts(U.at), need = Object.keys(U.projects).filter(function (k) { return U.projects[k].needsPermission; });
    var k = U.cost || {}, bud = U.budgetInr || 500, bp = Math.min(100, (k.monthInr || 0) / bud * 100), pp = Math.min(100, (k.monthProjectedInr || 0) / bud * 100);
    var lvl = (k.monthInr || 0) >= bud ? "bad" : ((k.monthProjectedInr || 0) >= bud || (k.monthInr || 0) >= bud * 0.8) ? "warn" : "ok";
    var html = '<div class="fb-box">' +
      '<div class="fb-head"><div><div class="fb-kick">Firebase · Blaze plan</div><div class="fb-title">Usage &amp; extra cost</div></div>' +
      '<div class="fb-when">Checked ' + ago(at) + '<br>Free allowance resets ~12:30 pm IST</div></div>';
    if (U.cost) {
      html += '<div class="fb-kpis">' +
        '<div class="fb-kpi"><span>Extra cost today</span><b>' + inr(k.todayInr) + '</b><em>→ ' + inr(k.todayProjectedInr) + ' by reset</em></div>' +
        '<div class="fb-kpi fb-kpi-main"><span>Total this month</span><b>' + inr(k.monthInr) + '</b><em>of ' + inr(bud) + ' budget</em></div>' +
        '<div class="fb-kpi"><span>Month estimate</span><b>' + inr(k.monthProjectedInr) + '</b><em>at today\'s pace</em></div></div>' +
        '<div class="fb-budget fb-b-' + lvl + '"><div class="fb-btrack"><span style="width:' + bp.toFixed(1) + '%"></span><i style="left:' + pp.toFixed(1) + '%" title="Month estimate"></i></div>' +
        '<div class="fb-blabel"><span>Budget used <b>' + (bp < 1 && bp > 0 ? "<1" : Math.round(bp)) + '%</b></span><span>' + inr(Math.max(0, bud - (k.monthInr || 0))) + ' left this month</span></div></div>';
    }
    if (need.length) {
      html += '<div class="fb-need"><b>One-time setup needed to show usage</b> for: ' + need.map(function (x) { return esc(U.projects[x].projectId); }).join(", ") +
        '<ol><li>Open <b>console.cloud.google.com/iam-admin/iam</b> and pick the project at the top.</li>' +
        '<li>Find the account ending <b>…iam.gserviceaccount.com</b> named <b>firebase-adminsdk</b> → click the pencil.</li>' +
        '<li><b>Add another role</b> → search <b>Monitoring Viewer</b> → Save. Repeat for each project above.</li></ol></div>';
    }
    var byP = {};
    usageRows().forEach(function (r) { (byP[r.k] = byP[r.k] || []).push(r); });
    html += '<div class="fb-grid">' + Object.keys(byP).map(function (x) {
      var P = U.projects[x], c = P.monthInr || 0;
      return '<div class="fb-card"><div class="fb-chead"><div class="fb-pname">' + esc(byP[x][0].label) + '</div>' +
        '<span class="fb-cost' + (c > 0 ? " on" : "") + '">' + (c > 0 ? inr(c) + " this month" : "Free") + '</span></div>' +
        '<div class="fb-pid">' + esc(P.projectId) + (P.location ? ' · ' + esc(P.location) : '') + '</div>' +
        byP[x].map(function (r) {
          return '<div class="fb-line fb-' + r.level + '"><div class="fb-lt"><span class="fb-m">' + r.m + '</span><span class="fb-n">' + fmt(r.used) + ' <i>/ ' + fmt(r.lim) + '</i></span></div>' +
            '<div class="fb-bar"><span style="width:' + Math.min(100, r.pct) + '%"></span>' + (r.ppct > r.pct ? '<i style="left:' + Math.min(100, r.ppct) + '%" title="Expected by reset at the current pace"></i>' : '') + '</div>' +
            '<div class="fb-sub">' + (r.extra ? '<b>+' + fmt(r.extra) + ' extra</b> · billed' : r.pct + '% of free' + (r.ppct > r.pct ? ' · → ' + Math.min(999, r.ppct) + '% by reset' : '')) + '</div></div>';
        }).join("") + '</div>';
    }).join("") + '</div>';
    if (U.cost) html += '<div class="fb-foot">Only usage above the free daily allowance is charged. Amounts include 18% GST at ₹' + Number(U.usdInr || 0).toFixed(2) + '/$ — an estimate; the final bill is in Google Cloud Billing.</div>';
    if (lvl !== "ok" && U.cost) html += '<div class="fb-advice">⚠ This month is heading to ' + inr(k.monthProjectedInr) + ' — over the ' + inr(bud) + ' budget. Close console tabs that aren\'t needed and tell Claude to slow down the busiest sync.</div>';
    return html + "</div>";
  }
  function stChip(k) { return { ok: "Working", stale: "Delayed", bad: "Failed", none: "No report" }[k] || ""; }
  function fillPanel(el) {
    el.innerHTML = usageHtml() + '<div class="sh-sec">Background syncs</div>' + JOBS.map(function (j) {
      var e = H[j[0]] || {}, s = state(j), at = ts(e.at), fa = ts(e.failedAt);
      return '<div class="sh-row sh-' + s.k + '"><span class="sh-dot"></span><div class="sh-main"><div class="sh-name">' + esc(j[1]) + '<span class="sh-when">' + (at ? "last run " + ago(at) : "") + '</span></div>' +
        (s.k === "ok" && !e.fix ? '' : '<div class="sh-state">' + esc(s.t)) + (s.k === "ok" && !e.fix ? '' : (e.ok === false && e.fix ? ' — <span class="sh-fix">' + esc(e.fix) + "</span>" : "") + "</div>") +
        (e.ok === false && e.error ? '<div class="sh-err">' + esc(e.error) + "</div>" : "") +
        (e.ok !== false && fa ? '<div class="sh-prev">Last problem: ' + ago(fa) + "</div>" : "") + "</div>" +
        '<span class="sh-chip">' + stChip(s.k) + '</span>' +
        (e.log ? '<button type="button" class="sh-logbtn" data-k="' + j[0] + '">' + (e.ok === false ? "View error log" : "View log") + "</button>" : "") + "</div>";
    }).join("");
    el.querySelectorAll(".sh-logbtn").forEach(function (b) { b.addEventListener("click", function () { openLog(b.dataset.k); }); });
  }

  /* ---- full log, ready to copy ---- */
  function logText(k) {
    var e = H[k] || {}, j = JOBS.filter(function (x) { return x[0] === k; })[0] || [k, k];
    var at = ts(e.at);
    return "AIKM console — sync log\nJob: " + j[1] + "\nResult: " + (e.ok ? "OK" : "FAILED" + (e.reason ? " — " + e.reason : "")) +
      "\nTime: " + (at ? at.toLocaleString("en-IN") : "?") + "\nGitHub run: " + (e.run || "") + (e.error ? "\nError: " + e.error : "") +
      "\n\n----- log (last part) -----\n" + (e.log || "(no log)");
  }
  function openLog(k) {
    var t = logText(k), ov = document.createElement("div");
    ov.className = "admin-modal-overlay"; ov.style.display = "flex"; ov.style.zIndex = 100001;
    ov.innerHTML = '<div class="admin-modal-box sh-box sh-logbox"><div class="admin-modal-head"><span class="admin-modal-kicker">Copy and send this to Claude</span><h3>' + esc((JOBS.filter(function (x) { return x[0] === k; })[0] || [0, k])[1]) + " — log</h3></div>" +
      '<div class="admin-modal-body"><pre class="sh-pre"></pre></div>' +
      '<div class="admin-modal-actions">' + ((H[k] || {}).run ? '<a class="admin-modal-btn ghost" href="' + esc(H[k].run) + '" target="_blank" rel="noopener">Open on GitHub</a>' : "") +
      '<button type="button" class="admin-modal-btn ghost sh-copy">Copy full log</button><button type="button" class="admin-modal-btn gold sh-close2">Close</button></div></div>';
    ov.querySelector(".sh-pre").textContent = t;
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".sh-close2")) ov.remove(); });
    ov.querySelector(".sh-copy").addEventListener("click", function () {
      var btn = this;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { btn.textContent = "Copied ✓"; },
        function () { var r = document.createRange(); r.selectNodeContents(ov.querySelector(".sh-pre")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Press Ctrl+C"; });
    });
  }
  window.aikmOpenSyncLog = openLog;
  window.__shUsage = function (u) { U = u; pill(); };

  function hook() {
    if (hooked || typeof fbDb === "undefined" || !fbDb) return;
    hooked = true;
    var ref = fbDb.collection("aikm_admin").doc("syncHealth");
    function apply(d) { H = d.exists ? d.data() : {}; pill(); }
    ref.onSnapshot(apply, function () {});
    var uref = fbDb.collection("aikm_admin").doc("firebaseUsage");
    function applyU(d) { U = d.exists ? d.data() : null; pill(); }
    // usage changes every 30 min — a plain read every 10 min is enough (saves reads)
    function pullU() { uref.get({ source: "server" }).then(applyU).catch(function () {}); }
    pullU(); setInterval(pullU, 1800000);
    function pull() { ref.get({ source: "server" }).then(apply).catch(function () {}); }
    pull(); setInterval(pull, 1800000);
  }
  var hi = setInterval(function () { hook(); if (hooked) clearInterval(hi); }, 2000);
  setInterval(pill, 60000); setTimeout(pill, 1500);

  var st = document.createElement("style");
  st.textContent = "@media screen{" +
    "html#aikm body .sh-pill{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1px solid var(--x-line);background:var(--x-surface-2);color:var(--x-text-2);margin-left:8px;white-space:nowrap;}" +
    "html#aikm body .sh-dot{width:7px;height:7px;border-radius:50%;background:var(--x-muted);flex:0 0 7px;display:inline-block;}" +
    "html#aikm body .sh-pill.ok .sh-dot,html#aikm body .sh-row.sh-ok .sh-dot{background:var(--x-green);}" +
    "html#aikm body .sh-pill.stale{background:var(--x-amber-soft);color:var(--x-amber);border-color:transparent;}html#aikm body .sh-pill.stale .sh-dot,html#aikm body .sh-row.sh-stale .sh-dot{background:var(--x-amber);}" +
    "html#aikm body .sh-pill.bad{background:var(--x-red-soft);color:var(--x-red);border-color:color-mix(in srgb,var(--x-red) 40%,transparent);}html#aikm body .sh-pill.bad .sh-dot,html#aikm body .sh-row.sh-bad .sh-dot{background:var(--x-red);}" +
    "html#aikm body .sh-box{max-width:900px !important;width:94vw;max-height:calc(100vh - 32px);display:flex;flex-direction:column;padding-bottom:16px !important;}" +
    "html#aikm body .sh-box > .admin-modal-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;margin-right:-10px;padding-right:10px;}" +
    "html#aikm body .sh-box > .admin-modal-head,html#aikm body .sh-box > .admin-modal-actions{flex:0 0 auto;}" +
    "html#aikm body .admin-modal-overlay{z-index:1000 !important;}" +
    "html#aikm body .sh-sec{font-size:10.5px;font-weight:700;letter-spacing:.14em !important;text-transform:uppercase;color:var(--x-gold);margin:18px 2px 10px;}" +
    "html#aikm body .sh-row{position:relative;display:flex;align-items:center;gap:14px;padding:13px 16px 13px 18px;border:1px solid var(--x-line);border-radius:12px;margin-bottom:8px;background:var(--x-surface);box-shadow:var(--x-shadow);overflow:hidden;}" +
    "html#aikm body .sh-row:before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--x-green);}" +
    "html#aikm body .sh-row.sh-stale:before{background:var(--x-amber);}html#aikm body .sh-row.sh-bad:before{background:var(--x-red);}html#aikm body .sh-row.sh-none:before{background:var(--x-line-2);}" +
    "html#aikm body .sh-row .sh-dot{display:none;}" +
    "html#aikm body .sh-row.sh-bad{border-color:color-mix(in srgb,var(--x-red) 35%,var(--x-line));}" +
    "html#aikm body .sh-main{flex:1;min-width:0;}html#aikm body .sh-name{font-weight:600;color:var(--x-text);font-size:13.5px;}" +
    "html#aikm body .sh-when{font-weight:400;color:var(--x-muted);font-size:11.5px;margin-left:8px;}" +
    "html#aikm body .sh-state{font-size:12px;color:var(--x-muted);margin-top:2px;}html#aikm body .sh-bad .sh-state{color:var(--x-red);font-weight:600;}" +
    "html#aikm body .sh-fix{font-weight:400;color:var(--x-text-2);}" +
    "html#aikm body .sh-err{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--x-text-2);margin-top:6px;word-break:break-word;background:var(--x-red-soft);padding:6px 8px;border-radius:6px;}" +
    "html#aikm body .sh-prev{font-size:11px;color:var(--x-muted);margin-top:3px;}" +
    "html#aikm body .sh-chip{flex:0 0 auto;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;background:var(--x-green-soft);color:var(--x-green);}" +
    "html#aikm body .sh-stale .sh-chip{background:var(--x-amber-soft);color:var(--x-amber);}html#aikm body .sh-bad .sh-chip{background:var(--x-red-soft);color:var(--x-red);}html#aikm body .sh-none .sh-chip{background:var(--x-raise);color:var(--x-muted);}" +
    "html#aikm body button.sh-logbtn{flex:0 0 auto;font-size:12px !important;padding:6px 12px !important;min-height:0 !important;border-radius:8px !important;}" +
    "html#aikm body .sh-logbox{max-width:1000px !important;}" +
    "html#aikm body .sh-fb{margin-left:4px;padding-left:8px;border-left:1px solid currentColor;opacity:.9;}" +
    "html#aikm body .fb-box{border:1px solid var(--x-gold-line);border-radius:16px;padding:18px 20px;margin-bottom:6px;background:linear-gradient(180deg,var(--x-gold-soft),var(--x-surface) 120px);box-shadow:var(--x-shadow);}" +
    "html#aikm body .fb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;}" +
    "html#aikm body .fb-kick{font-size:10.5px;font-weight:700;letter-spacing:.14em !important;text-transform:uppercase;color:var(--x-gold);}" +
    "html#aikm body .fb-title{font-family:var(--x-brand-font);font-weight:600;font-size:18px;color:var(--x-text);margin-top:2px;}" +
    "html#aikm body .fb-when{font-size:11px;color:var(--x-muted);text-align:right;line-height:1.5;}" +
    "html#aikm body .fb-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}" +
    "html#aikm body .fb-kpi{background:var(--x-surface);border:1px solid var(--x-line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;}" +
    "html#aikm body .fb-kpi span{font-size:11px;color:var(--x-muted);font-weight:500;}" +
    "html#aikm body .fb-kpi b{font-family:var(--x-brand-font);font-size:24px;font-weight:600;color:var(--x-text);font-variant-numeric:tabular-nums;line-height:1.2;}" +
    "html#aikm body .fb-kpi em{font-style:normal;font-size:11px;color:var(--x-muted);}" +
    "html#aikm body .fb-kpi-main{border-color:var(--x-gold-line);background:var(--x-gold-soft);}html#aikm body .fb-kpi-main b{color:var(--x-gold);}" +
    "html#aikm body .fb-budget{margin:14px 0 4px;}" +
    "html#aikm body .fb-btrack{position:relative;height:8px;border-radius:8px;background:var(--x-raise);}" +
    "html#aikm body .fb-btrack span{display:block;height:100%;min-width:3px;border-radius:8px;background:linear-gradient(90deg,var(--x-gold-2),var(--x-gold));}" +
    "html#aikm body .fb-btrack i{position:absolute;top:-3px;width:2px;height:14px;border-radius:2px;background:var(--x-text-2);opacity:.5;}" +
    "html#aikm body .fb-b-warn .fb-btrack span{background:var(--x-amber);}html#aikm body .fb-b-bad .fb-btrack span{background:var(--x-red);}" +
    "html#aikm body .fb-blabel{display:flex;justify-content:space-between;font-size:11.5px;color:var(--x-muted);margin-top:6px;}html#aikm body .fb-blabel b{color:var(--x-text);}" +
    "html#aikm body .fb-need{background:var(--x-gold-soft);border:1px solid var(--x-gold-line);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--x-text);margin-top:12px;}" +
    "html#aikm body .fb-need ol{margin:6px 0 0 18px;padding:0;line-height:1.7;}" +
    "html#aikm body .fb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:14px;}" +
    "html#aikm body .fb-card{background:var(--x-surface);border:1px solid var(--x-line);border-radius:12px;padding:12px 14px;}" +
    "html#aikm body .fb-chead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}" +
    "html#aikm body .fb-pname{font-size:12.5px;font-weight:600;color:var(--x-text);line-height:1.35;}" +
    "html#aikm body .fb-pid{font-size:10.5px;color:var(--x-muted);margin:2px 0 8px;}" +
    "html#aikm body .fb-cost{flex:0 0 auto;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:20px;background:var(--x-green-soft);color:var(--x-green);white-space:nowrap;}" +
    "html#aikm body .fb-cost.on{background:var(--x-gold-soft);color:var(--x-gold);border:1px solid var(--x-gold-line);}" +
    "html#aikm body .fb-line{margin:8px 0 0;}" +
    "html#aikm body .fb-lt{display:flex;justify-content:space-between;font-size:11.5px;}" +
    "html#aikm body .fb-m{color:var(--x-text-2);font-weight:500;}" +
    "html#aikm body .fb-n{color:var(--x-text);font-variant-numeric:tabular-nums;font-weight:600;}html#aikm body .fb-n i{font-style:normal;color:var(--x-muted);font-weight:400;}" +
    "html#aikm body .fb-bar{position:relative;height:5px;border-radius:5px;background:var(--x-raise);margin-top:4px;}" +
    "html#aikm body .fb-bar span{display:block;height:100%;border-radius:5px;background:var(--x-green);}" +
    "html#aikm body .fb-bar i{position:absolute;top:-2px;width:2px;height:9px;background:var(--x-muted);opacity:.7;}" +
    "html#aikm body .fb-near .fb-bar span{background:var(--x-amber);}html#aikm body .fb-over .fb-bar span{background:linear-gradient(90deg,var(--x-gold-2),var(--x-gold));}" +
    "html#aikm body .fb-sub{font-size:10.5px;color:var(--x-muted);margin-top:3px;}html#aikm body .fb-over .fb-sub b{color:var(--x-gold);}" +
    "html#aikm body .fb-foot{margin-top:12px;font-size:11px;color:var(--x-muted);line-height:1.5;}" +
    "html#aikm body .fb-advice{margin-top:10px;font-size:12px;color:var(--x-amber);line-height:1.5;background:var(--x-amber-soft);padding:8px 10px;border-radius:8px;}" +
    "@media (max-width:640px){html#aikm body .fb-kpis{grid-template-columns:1fr;}html#aikm body .fb-head{flex-direction:column;}html#aikm body .fb-when{text-align:left;}}" +
    "html#aikm body .sh-pre{max-height:60vh;overflow:auto;background:#0B1220;color:#D7DEE9;border-radius:10px;padding:14px;font:11.5px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;margin:0;}" +
    "}";
  document.head.appendChild(st);
})();

/* ===== Courier Manifest: check each scanned AWB against its NimbusPost status ===== */
(function () {
  if (window.__aikmManifestNimbus) return; window.__aikmManifestNimbus = true;
  // statuses that are fine at handover: booked / pending pickup, picked / in transit, out for delivery
  var LABEL = { cancelled: "Cancelled", rto: "RTO", rto_delivered: "RTO delivered", delivered: "Already delivered", exception: "NDR / exception", other: "" };
  var BAD = { cancelled: 1, rto: 1, rto_delivered: 1, delivered: 1, exception: 1 };
  var map = {}, mapLen = -1, warned = {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(a) { return String(a || "").replace(/^`+/, "").replace(/\s+/g, "").toUpperCase(); }
  function build() {
    var rows = typeof window.__ndRows === "function" ? window.__ndRows() : [];
    if (rows.length === mapLen) return;
    mapLen = rows.length; map = {};
    rows.forEach(function (x) { var r = x.r || x; if (r.a) map[norm(r.a)] = r; if (r.ra) map[norm(r.ra)] = Object.assign({}, r, { b: "rto" }); });
  }
  function problem(awb) {
    var r = map[norm(awb)];
    if (!r || !BAD[r.b]) return null;
    var st = String(r.st || LABEL[r.b] || r.b);
    return { label: LABEL[r.b] || st, status: st.charAt(0).toUpperCase() + st.slice(1), order: r.o || "", remark: r.nr || "" };
  }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "mh-toast warn"; t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 6000);
  }
  var busy = false;
  function paint() {
    if (busy) return; busy = true;
    try {
      build();
      var flagged = [];
      // scan list
      document.querySelectorAll("#scanBody tr").forEach(function (tr) {
        var cell = tr.querySelector(".cx-awb"); if (!cell) return;
        var awb = cell.textContent.trim(), p = problem(awb), old = tr.querySelector(".nx-tag");
        if (!p) { if (old) old.remove(); tr.classList.remove("nx-row-bad"); return; }
        flagged.push(awb);
        tr.classList.add("nx-row-bad");
        if (!old) {
          var td = tr.children[2] || tr.lastElementChild, d = document.createElement("div");
          d.className = "nx-tag"; d.title = (p.order ? "Order " + p.order + " · " : "") + "NimbusPost status: " + p.status + (p.remark ? " · " + p.remark : "");
          d.innerHTML = '<i class="ti ti-alert-octagon"></i> NimbusPost: ' + esc(p.label);
          td.appendChild(d);
        }
      });
      // printed manifest sheet
      document.querySelectorAll("#manifest .awb-item").forEach(function (el) {
        var awb = el.textContent.replace(/^\s*\d+\.\s*/, "").replace(/\s+(CANCELLED|NIMBUS:.*)$/i, "").trim();
        var p = problem(awb), old = el.querySelector(".awb-nx-tag");
        if (!p) { if (old) old.remove(); el.classList.remove("awb-nx-bad"); return; }
        el.classList.add("awb-nx-bad");
        if (!old) el.insertAdjacentHTML("beforeend", ' <span class="awb-nx-tag">' + esc(p.label.toUpperCase()) + "</span>");
      });
      // banner above the scan list
      var tbl = document.getElementById("scanTable"), ban = document.getElementById("nxBanner");
      if (tbl && !ban) { ban = document.createElement("div"); ban.id = "nxBanner"; ban.className = "nx-banner"; tbl.parentNode.insertBefore(ban, tbl); }
      if (ban) {
        ban.style.display = flagged.length ? "" : "none";
        ban.innerHTML = '<i class="ti ti-alert-octagon"></i> <b>' + flagged.length + " scanned AWB" + (flagged.length > 1 ? "s are" : " is") +
          " not ready to ship in NimbusPost</b> (cancelled / RTO / delivered / NDR) — check before handing over. Highlighted in red below and on the manifest.";
      }
      var fresh = flagged.filter(function (a) { return !warned[a]; });
      if (fresh.length && mapLen > 0) {
        fresh.forEach(function (a) { warned[a] = 1; });
        var p0 = problem(fresh[0]);
        toast(fresh.length === 1 ? "⚠ AWB " + fresh[0] + " is " + p0.label + " in NimbusPost — check before shipping" : "⚠ " + fresh.length + " scanned AWBs have a problem status in NimbusPost");
      }
    } finally { busy = false; }
  }
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(paint, 150); });
  function watch() {
    ["scanBody", "manifest"].forEach(function (id) { var el = document.getElementById(id); if (el && !el.__nxW) { el.__nxW = 1; mo.observe(el, { childList: true, subtree: id === "manifest" }); } });
  }
  // first run: mark existing scans as already warned (no toast flood), then paint
  setTimeout(function () { build(); document.querySelectorAll("#scanBody .cx-awb").forEach(function (c) { if (problem(c.textContent.trim())) warned[c.textContent.trim()] = 1; }); watch(); paint(); }, 9000);
  setInterval(function () { watch(); paint(); }, 30000);

  var st = document.createElement("style");
  st.textContent =
    "@media screen{html#aikm body #scanTable tr.nx-row-bad td{background:var(--x-red-soft) !important;}" +
    "html#aikm body #scanTable tr.nx-row-bad td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}" +
    "html#aikm body #scanTable tr.nx-row-bad .cx-awb{color:var(--x-red) !important;font-weight:700;}" +
    "html#aikm body .nx-tag{display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#fff;background:var(--x-red);padding:2px 8px;border-radius:20px;}" +
    "html#aikm body .nx-banner{display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--x-red-soft);color:var(--x-red);border:1px solid color-mix(in srgb,var(--x-red) 40%,transparent);font-size:12.5px;line-height:1.45;}}" +
    "#manifest .awb-item.awb-nx-bad{color:#B42318 !important;background:#FDECEA;font-weight:700;}" +
    "#manifest .awb-nx-tag{font-size:9.5px;font-weight:800;color:#fff;background:#B42318;padding:0 5px;border-radius:4px;margin-left:4px;}" +
    "@media print{#manifest .awb-item.awb-nx-bad{color:#B42318 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}#manifest .awb-nx-tag{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}";
  document.head.appendChild(st);
  window.__nxProblem = function (a) { build(); return problem(a); };
})();

/* =====================================================================
   AIKM MAPPING FIX (Oct 2026)
   Paste this at the VERY END of dalbhaat-admin-console.js
   1) A mapping is saved under the ORDER product name (not the words you typed in search)
   2) A deleted mapping stays deleted on every computer
   3) Combo products remember all their parts and split automatically next time
   ===================================================================== */
(function () {
  if (window.__aikmMappingFix) return;
  window.__aikmMappingFix = true;
  if (
    typeof loadLearned !== "function" ||
    typeof saveLearned !== "function" ||
    typeof rememberMatch !== "function" ||
    typeof buildResult !== "function"
  ) {
    console.warn("[MappingFix] mapping functions not found — fix not applied");
    return;
  }

  const TOMB_KEY = "order_mapper_deleted_v1";
  const nowIso = () => new Date().toISOString();
  const hasDb = () => typeof fbDb !== "undefined" && !!fbDb;

  function loadTombs() {
    try {
      return JSON.parse(localStorage.getItem(TOMB_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function saveTombs(t) {
    try {
      localStorage.setItem(TOMB_KEY, JSON.stringify(t));
    } catch (e) {}
  }
  const encKey = (k) => encodeURIComponent(k).replace(/\./g, "%2E");
  function tombDoc() {
    return fbDb.collection("aikm_admin").doc("masterMappingDeleted");
  }
  function refreshMappingViews() {
    try {
      typeof clearSpapiMatchCache === "function" && clearSpapiMatchCache();
    } catch (e) {}
    try {
      typeof renderMasterMapping === "function" && renderMasterMapping();
    } catch (e) {}
  }
  function pushAll(map) {
    try {
      typeof saveAll === "function" && saveAll();
    } catch (e) {}
    try {
      typeof pushMasterMappingToCloud === "function" && pushMasterMappingToCloud(map);
    } catch (e) {}
  }

  /* ---------- FIX 2: deleted mappings never come back ---------- */
  const origSaveLearned = saveLearned;
  saveLearned = function (m) {
    if (m) {
      const tb = loadTombs();
      Object.keys(tb).forEach((k) => {
        if (m[k] && !(String(m[k].savedAt || "") > tb[k])) delete m[k];
      });
    }
    return origSaveLearned(m);
  };

  function markDeleted(key) {
    const ts = nowIso(),
      tb = loadTombs();
    tb[key] = ts;
    saveTombs(tb);
    if (hasDb()) {
      tombDoc()
        .set({ k: { [encKey(key)]: ts } }, { merge: true })
        .catch((e) => console.warn("[MappingFix] could not sync delete:", e.message));
    }
  }

  let tombStarted = false;
  function startTombSync() {
    if (tombStarted || !hasDb()) return;
    tombStarted = true;
    tombDoc().onSnapshot(
      (snap) => {
        const remote = (snap.exists && (snap.data() || {}).k) || {},
          tb = loadTombs();
        Object.keys(remote).forEach((enc) => {
          let key;
          try {
            key = decodeURIComponent(enc);
          } catch (e) {
            return;
          }
          if (!tb[key] || remote[enc] > tb[key]) tb[key] = remote[enc];
        });
        saveTombs(tb);
        saveLearned(loadLearned());
        refreshMappingViews();
      },
      (e) => console.warn("[MappingFix] delete-sync error", e),
    );
  }
  saveLearned(loadLearned());
  const waitDb = setInterval(() => {
    if (hasDb()) {
      clearInterval(waitDb);
      startTombSync();
    }
  }, 2000);

  if (typeof attachMasterMappingRowHandlers === "function") {
    attachMasterMappingRowHandlers = function () {
      document.querySelectorAll('[data-act="editMapping"]').forEach((b) =>
        b.addEventListener("click", (e) => {
          editingMappingKey = e.currentTarget.dataset.key;
          renderMasterMapping();
        }),
      );
      document.querySelectorAll('[data-act="cancelMappingEdit"]').forEach((b) =>
        b.addEventListener("click", () => {
          editingMappingKey = null;
          renderMasterMapping();
        }),
      );
      document.querySelectorAll('[data-act="deleteMapping"]').forEach((b) =>
        b.addEventListener("click", (e) => {
          const key = e.currentTarget.dataset.key;
          if (!confirm("Delete this mapping? It will need to be matched again next time this product appears.")) return;
          const n = loadLearned();
          delete n[key];
          markDeleted(key);
          saveLearned(n);
          pushAll(n);
          renderMasterMapping();
        }),
      );
      document.querySelectorAll('[data-act="saveMappingEdit"]').forEach((b) =>
        b.addEventListener("click", (e) => {
          const key = e.currentTarget.dataset.key,
            row = e.currentTarget.closest("tr"),
            val = (f) => {
              const el = row.querySelector(`[data-mmfield="${f}"]`);
              return el ? el.value.trim() : "";
            },
            all = loadLearned(),
            r = all[key];
          if (!r) return;
          r.name = val("vendorProduct");
          r.vendorName = val("vendor");
          r.code = val("itemCode");
          r.orderPackQty = Number(val("orderPack")) || 1;
          r.vendorPackQty = Number(val("vendorPack")) || 1;
          r.savedAt = nowIso();
          saveLearned(all);
          pushAll(all);
          editingMappingKey = null;
          renderMasterMapping();
        }),
      );
    };
  }

  /* ---------- FIX 3: combo products remember all parts ---------- */
  function saveComboRecipe(src) {
    if (!src) return;
    const key = normalize(src);
    if (!key) return;
    const parts = results.filter((r) => r.isSplitPart && r.comboSource === src),
      L = loadLearned();
    if (!parts.length) {
      if (L[key] && Array.isArray(L[key].parts)) {
        delete L[key];
        markDeleted(key);
        saveLearned(L);
        pushAll(L);
      }
      return;
    }
    const mapped = parts.filter((p) => p.selected);
    L[key] = {
      orderName: src,
      vendorName: mapped.length ? mapped[0].selected.vendorName : "",
      code: mapped
        .map((p) => p.selected.code || "")
        .filter(Boolean)
        .join(", "),
      name: parts.map((p) => (p.selected ? p.selected.name : "(part not mapped)")).join(" + "),
      orderPackQty: 1,
      vendorPackQty: 1,
      isComboPart: true,
      comboSource: parts.length + " products",
      parts: parts.map((p) =>
        p.selected
          ? {
              mapped: true,
              code: p.selected.code || "",
              name: p.selected.name,
              vendorName: p.selected.vendorName,
              plain: !!p.selected.plain,
              orderPackQty: Number(p.orderPackQty) || 1,
              vendorPackQty: Number(p.lotsPackQty) || 1,
            }
          : { mapped: false },
      ),
      savedAt: nowIso(),
    };
    saveLearned(L);
    pushAll(L);
  }

  /* ---------- FIX 1: always save under the order product name ---------- */
  persistIfSelected = function (i) {
    const t = results[i];
    if (!t || !t.selected) return;
    t.remembered = true;
    t.selected.score = 1;
    if (t.isSplitPart) return void saveComboRecipe(t.comboSource);
    rememberMatch(t.orderName || t.matchName, t.selected, t.orderPackQty, t.lotsPackQty, {});
  };

  if (typeof removeRow === "function") {
    const origRemoveRow = removeRow;
    removeRow = function (i) {
      const r = results[i],
        src = r && r.isSplitPart ? r.comboSource : null;
      origRemoveRow(i);
      if (src) saveComboRecipe(src);
    };
  }

  runMatching = function () {
    if (!orderItems) return;
    const L = loadLearned();
    results = [];
    orderItems.forEach((it) => {
      const rec = L[normalize(it.name)];
      if (rec && Array.isArray(rec.parts) && rec.parts.length) {
        const n = rec.parts.length;
        rec.parts.forEach((p, i) => {
          const row = buildResult(it.name, it.qty, "", {
            isSplitPart: true,
            comboSource: it.name,
            partLabel: `Part ${i + 1} of ${n}`,
          });
          if (p.mapped) {
            const prep = prepProduct(p.name || "");
            Object.assign(row, {
              matchName: p.name,
              prep: prep,
              vendorFilter: p.vendorName,
              selected: { code: p.code || "", name: p.name, vendorName: p.vendorName, score: 1, plain: !!p.plain },
              auto: true,
              remembered: true,
              orderPackQty: p.orderPackQty || 1,
              lotsPackQty: p.vendorPackQty || 1,
              candidates: lotsVendor.prepped ? topMatches(prep, allPrepped, 6) : [],
            });
          }
          results.push(row);
        });
      } else results.push(buildResult(it.name, it.qty, it.name, {}));
    });
    renderResults();
    hasMatched = true;
    updateNavAvailability();
    switchOrderMapperSection("resultsCard");
  };
  const mb = document.getElementById("matchBtn");
  if (mb) {
    const nb = mb.cloneNode(true);
    mb.parentNode.replaceChild(nb, mb);
    nb.addEventListener("click", () => runMatching());
  }

  console.log("[MappingFix] active");
})();

/* =====================================================================
   AIKM SCANNER UPGRADE (Oct 2026)
   Paste at the VERY END of dalbhaat-admin-console.js (after the Mapping Fix)
   - Cursor always returns to the scan box (Order/AWB Scanner + Courier Manifest)
   - Multi-product orders: "select products" pop-up stays — Enter = add selected, Space = tick/untick
   - Duplicate scans are skipped automatically (beep + message, no pop-up)
   - Every pop-up works with keyboard: Enter = OK, Esc = Cancel
   - A parcel scanned while a pop-up is open is NOT lost
   - Sounds: short beep = OK, low buzz = not found, double beep = duplicate
   - Ctrl+Z in the scan box = undo the last scan
   ===================================================================== */
(function () {
  if (window.__aikmScannerUpgrade) return;
  window.__aikmScannerUpgrade = true;

  const $id = (i) => document.getElementById(i);
  const orderBox = () => (typeof scanInput !== "undefined" && scanInput) || $id("scanInput");
  const courierBox = () => $id("courierScanInput");

  /* ---------- look & feel ---------- */
  const css = document.createElement("style");
  css.textContent = `
    #scanInput:focus,#courierScanInput:focus{outline:3px solid #2F8A4C!important;outline-offset:2px;box-shadow:0 0 0 6px rgba(47,138,76,.15)!important}
    .aikm-scanready{display:flex;flex-wrap:wrap;align-items:center;gap:2px 7px;margin:7px 0 2px;font:600 12px 'Lexend',sans-serif;color:#2F8A4C;line-height:1.3}
    .aikm-scanready i{width:8px;height:8px;border-radius:50%;background:#2F8A4C;display:inline-block;flex:none}
    .aikm-scanready.off{color:#C0392B}
    .aikm-scanready.off i{background:#C0392B}
    .aikm-scanready .aikm-scanready-hint{flex-basis:100%;padding-left:15px;font-weight:500;font-size:11px;color:#555}
    /* black text in tables + hints (light theme) */
    html#aikm body[data-theme="light"] :is(table.data,#resultsTable) tbody td,
    html#aikm body[data-theme="light"] :is(table.data,#resultsTable) tbody td :not([class*="badge"]):not([class*="pill"]):not([class*="tag"]):not([class*="aikm-sla"]):not(.loss-badge){color:#111 !important}
    html#aikm body[data-theme="light"] table.data thead th{color:#333 !important}
    html#aikm body #resultsTable thead th{color:#E9CC6E !important}
    html#aikm body #resultsTable tbody tr{background:transparent !important}
    html#aikm body #resultsTable tbody tr:nth-child(even){background:var(--x-surface-2) !important}
    html#aikm body:not([data-theme="light"]) #resultsTable .collapsed-row-btn :is(.cr-match,.cr-qty,.cr-value,.cr-arrow){color:var(--x-text-2,#B7C0D0) !important}
    html#aikm body:not([data-theme="light"]) #resultsTable .collapsed-row-btn .cr-vendor-tag{color:var(--x-gold,#D4AF37) !important;background:rgba(212,175,55,.12) !important}
    html#aikm body[data-theme="light"] .app-content :is(.hint,small.hint,.sub,.result,.result .prod-qty){color:#222 !important}
    .aikm-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;border-radius:12px;
      font:600 14px 'Lexend',sans-serif;color:#fff;background:#0F1E35;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .15s ease;pointer-events:none}
    .aikm-toast.show{opacity:1}.aikm-toast.ok{background:#2F8A4C}.aikm-toast.warn{background:#B8860B}.aikm-toast.err{background:#C0392B}
    .aikm-multi-note{font:600 12px 'Lexend',sans-serif;color:#2F8A4C;margin-bottom:6px}
    .result.aikm-dup{border-color:#D4AF37!important;background:rgba(212,175,55,.12)!important}`;
  document.head.appendChild(css);

  /* ---------- sounds ---------- */
  let actx = null;
  function sound(kind) {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      actx = actx || new C();
      const plan = kind === "ok" ? [[1200, 0, 0.08]] : kind === "dup" ? [[700, 0, 0.09], [700, 0.14, 0.09]] : [[220, 0, 0.35]];
      plan.forEach(([f, t, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === "err" ? "sawtooth" : "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, actx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + d);
        o.connect(g); g.connect(actx.destination);
        o.start(actx.currentTime + t); o.stop(actx.currentTime + t + d + 0.02);
      });
    } catch (e) {}
  }

  /* ---------- toast ---------- */
  let toastEl = null, toastT = null;
  function toast(msg, kind) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "aikm-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.className = "aikm-toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---------- helpers ---------- */
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
  /* pop-up list is cached (refreshed only when something is added to the page) — keeps the checks below cheap */
  let ovList = [], ovDirty = true;
  new MutationObserver(() => { ovDirty = true; }).observe(document.body, { childList: true });
  function openOverlay() {
    if (ovDirty) { ovList = [...document.querySelectorAll('.admin-modal-overlay, [id$="Modal"], .modal-overlay')]; ovDirty = false; }
    let top = null;
    for (const el of ovList) if (el.isConnected && el.style.display !== "none" && el.getClientRects().length) top = el;
    return top;
  }
  const isSla = (ov) => ov && ov.classList.contains("aikm-sla-modal");
  function isTyping(el) {
    if (!el) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    if (el.tagName === "INPUT") return !/^(checkbox|radio|button|submit|reset|file|range|color)$/i.test(el.type || "text");
    return false;
  }
  function activeScanBox() {
    for (const b of [orderBox(), courierBox()]) {
      if (!b) continue;
      const p = b.closest(".tabpanel");
      if ((!p || p.classList.contains("active")) && visible(b)) return b;
    }
    return null;
  }
  function popupBusy() {
    const fp = $id("columnFilterPopup");
    const sl = typeof globalSuggestList !== "undefined" ? globalSuggestList : null;
    return !!openOverlay() || (fp && fp.classList.contains("open")) || !!(sl && sl.classList.contains("open"));
  }
  function refocus() {
    setTimeout(() => {
      const b = activeScanBox(), a = document.activeElement;
      if (!b || popupBusy() || (a !== b && isTyping(a))) return;
      b.focus({ preventScroll: true });
    }, 30);
  }
  function feedScan(box, code) {
    if (!box || !code) return;
    box.value = code;
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }

  /* ---------- ready indicator under each scan box ---------- */
  function addIndicator(box, undoText) {
    if (!box || box.dataset.aikmReady) return;
    box.dataset.aikmReady = "1";
    const d = document.createElement("div");
    d.className = "aikm-scanready";
    d.innerHTML = `<i></i><span class="aikm-scanready-txt">Ready to scan</span><span class="aikm-scanready-hint">Ctrl+Z = ${undoText}</span>`;
    box.insertAdjacentElement("afterend", d);
    const upd = () => {
      const on = document.activeElement === box;
      d.classList.toggle("off", !on);
      d.querySelector(".aikm-scanready-txt").textContent = on ? "Ready to scan" : "Paused — scan or press any key";
    };
    box.addEventListener("focus", upd); box.addEventListener("blur", upd); upd();
  }
  addIndicator(orderBox(), "undo last scan");
  addIndicator(courierBox(), "undo last AWB");

  /* ---------- 1. Cursor always goes back to the scan box ---------- */
  function keepScanFocus() {
    const b = activeScanBox();
    if (!b || popupBusy() || document.activeElement === b) return;
    if (isTyping(document.activeElement)) return; /* user is typing in a search box — leave it */
    b.focus({ preventScroll: true });
  }

  /* ---------- 2. Keyboard for every pop-up + never lose a scan ---------- */
  let buf = "", bufT = null;
  function primaryBtn(ov) {
    return ov.querySelector(".admin-modal-btn.gold, .btn-gold, #multiItemModalConfirm, #courierModalSave, #fakeShipModalSave, #comboSplitConfirm, button.primary") ||
      [...ov.querySelectorAll("button")].filter(visible).pop();
  }
  function cancelBtn(ov) {
    return ov.querySelector(".admin-modal-btn.ghost, .btn-ghost, #modalCloseBtn, #courierModalSkip, #multiItemModalCancel, [id$='Cancel'], [id$='Close'], [id$='CloseBtn']");
  }
  /* focus the right thing when a pop-up opens */
  function focusPopup(ov) {
    if (!ov || isSla(ov) || ov.contains(document.activeElement)) return;
    const inp = [...ov.querySelectorAll("input, select, textarea")].find((x) => visible(x) && isTyping(x));
    const target = inp || primaryBtn(ov);
    target && target.focus();
  }
  /* one light timer for both jobs; does nothing while the browser tab is in the background */
  setInterval(() => {
    if (document.hidden) return;
    const ov = openOverlay();
    if (ov) focusPopup(ov); else keepScanFocus();
  }, 250);

  document.addEventListener(
    "keydown",
    (ev) => {
      const ov = openOverlay();
      const box = activeScanBox();

      /* no pop-up: any key while focus is lost goes straight into the scan box */
      if (!ov) {
        if (ev.ctrlKey && (ev.key === "z" || ev.key === "Z") && box && document.activeElement === box && !box.value) {
          ev.preventDefault();
          box === courierBox() ? undoCourier() : undoOrderScan();
          return;
        }
        if (box && !popupBusy() && !isTyping(document.activeElement) && ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) box.focus({ preventScroll: true });
        return;
      }
      if (isSla(ov)) return; /* late-parcel pop-up already has its own keyboard handling */

      const typingInside = isTyping(document.activeElement) && ov.contains(document.activeElement);
      if (typingInside) {
        if (ev.key === "Escape") { const c = cancelBtn(ov); if (c) { ev.preventDefault(); c.click(); refocus(); } }
        return; /* these pop-ups already save on Enter */
      }
      if (ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
        /* barcode scanner typing while a pop-up is open — keep it */
        buf += ev.key; ev.preventDefault();
        clearTimeout(bufT); bufT = setTimeout(() => (buf = ""), 1500);
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault(); ev.stopPropagation();
        const code = buf.trim(); buf = "";
        if (code.length >= 6) {
          /* a new parcel was scanned while a pop-up was open:
             product-selection pop-up → add the selected products first; any other pop-up → Cancel (safe).
             Then the new parcel is scanned. */
          const c = ov.id === "multiItemModal" ? primaryBtn(ov) : cancelBtn(ov) || primaryBtn(ov);
          c && c.click();
          setTimeout(() => feedScan(activeScanBox(), code), 80);
        } else {
          const p = primaryBtn(ov);
          p && p.click();
          refocus();
        }
      } else if (ev.key === "Escape") {
        ev.preventDefault(); buf = "";
        const c = cancelBtn(ov);
        c && c.click();
        refocus();
      }
    },
    true,
  );
  document.addEventListener("click", () => { if (!openOverlay()) refocus(); }, true);

  /* ---------- 3. Order/AWB scanner: duplicates skipped, sounds, undo ---------- */
  /* (multi-product orders still open the "select products" pop-up — Enter adds the selected products) */
  let lastOrderScan = null, sndT = null, sndErr = false;
  if (typeof addLogRow === "function") {
    const prevAddLogRow = addLogRow;
    addLogRow = function (awb, t) {
      const r = prevAddLogRow.apply(this, arguments);
      const e = scanLog[0];
      if (lastOrderScan && e && e.id) lastOrderScan.ids.push(e.id);
      if (t && t.product === "NOT FOUND") sndErr = true;
      clearTimeout(sndT);
      sndT = setTimeout(() => { sound(sndErr ? "err" : "ok"); sndErr = false; }, 40);
      return r;
    };
  }
  const bulkBtnEl = $id("bulkBtn");
  bulkBtnEl && bulkBtnEl.addEventListener("click", () => { lastOrderScan = { code: "bulk paste", ids: [] }; }, true);
  if (typeof showResult === "function") {
    const prevShowResult = showResult;
    showResult = function (code) {
      const list = (awbMap && awbMap[code]) || (orderMap && orderMap[code]);
      if (list && list.length && list.every((x) => isDuplicateScan(code, x.product))) {
        const when = typeof findDuplicateScanTime === "function" ? findDuplicateScanTime(code) : "";
        resultBox.className = "result aikm-dup";
        resultBox.innerHTML = `<div class="prod-name">Already scanned — skipped</div><div class="prod-qty">${escapeHtml(code)}${when ? " · first scanned " + escapeHtml(String(when)) : ""}</div>`;
        sound("dup"); toast("Duplicate skipped: " + code, "warn"); refocus();
        return;
      }
      lastOrderScan = { code, ids: [] };
      const r = prevShowResult.apply(this, arguments);
      if (!list) toast("Not found: " + code, "err");
      refocus();
      return r;
    };
    window.showResult = showResult;
  }
  function undoOrderScan() {
    if (!lastOrderScan) return toast("Nothing to undo", "warn");
    const ids = new Set(lastOrderScan.ids);
    scanLog = scanLog.filter((e) => !ids.has(e.id));
    notFoundCount = scanLog.filter((e) => e.Product === "NOT FOUND").length;
    lossCount = scanLog.filter((e) => e.Loss === "YES").length;
    try { renderSummary(); rebuildHistoryTable(); updateStats(); } catch (e) {}
    typeof deleteScanLogEntriesFromCloud === "function" && deleteScanLogEntriesFromCloud([...ids]);
    typeof saveAll === "function" && saveAll();
    resultBox.className = "result empty";
    resultBox.innerHTML = "Last scan removed.";
    toast("Removed last scan: " + lastOrderScan.code, "ok");
    lastOrderScan = null;
    refocus();
  }

  /* ---------- 4. Courier Manifest: duplicates skipped automatically ---------- */
  if (typeof askDuplicateConfirm === "function") {
    askDuplicateConfirm = function (awb) {
      sound("dup"); toast("Duplicate skipped: " + awb, "warn");
      return Promise.resolve(false);
    };
  }
  if (typeof addScan === "function") {
    const prevAddScan = addScan;
    addScan = async function (awb, opt) {
      const r = await prevAddScan.apply(this, arguments);
      if (!(opt && opt.silent) && r) sound("ok");
      refocus();
      return r;
    };
  }
  function undoCourier() {
    if (!courierScans || !courierScans.length) return toast("Nothing to undo", "warn");
    const last = courierScans[courierScans.length - 1];
    typeof undoScan === "function" && undoScan();
    toast("Removed last AWB: " + (last && last.awb), "ok");
    refocus();
  }

  refocus();
  console.log("[ScannerUpgrade] active");
})();


/* =====================================================================
   AIKM ORDER MAPPER — AUTO MODE (Oct 2026)
   Paste at the VERY END of dalbhaat-admin-console.js (after Mapping Fix + Scanner Upgrade)
   - No steps: Order Mapper fills itself from the Scan Log and updates live as you scan
     (fixes: AWBs scanned after "Use Current Product Summary" were not added)
   - NO auto-match. Mapping order: 1) Amazon mapping from the SP-API page (ASIN → LOTS items + qty)
     2) mappings you saved here  3) everything else = "Not mapped", map by hand
   - One clean action bar: status, Send to LOTS Cart, Cart PDF, Vendor files, More menu
   - Full-width screen while Order Mapper is open
   - Mapper window: image, MRP, slab rates, stock, pack qty, combos; saves for this console AND the Amazon page
   - Keyboard: "/" = open next unmapped product · ↑↓ choose · Enter add · Ctrl+Enter save & next · Esc close
   ===================================================================== */
(function () {
  if (window.__aikmOmAuto) return;
  window.__aikmOmAuto = true;
  const byId = (i) => document.getElementById(i);
  const panel = byId("rpanel4");
  if (!panel || typeof buildResult !== "function" || typeof renderResults !== "function") {
    console.warn("[OrderMapperAuto] Order Mapper not found — not applied");
    return;
  }

  /* ---------- 1. Source = live Scan Log (summary map could be stale / not updated) ---------- */
  function liveItems() {
    const m = new Map();
    (scanLog || []).forEach((r) => {
      if (!r || !r.Product || r.Product === "NOT FOUND") return;
      const n = String(r.Product).trim();
      m.set(n, (m.get(n) || 0) + (Number(r.Qty) || 0));
    });
    return [...m].map(([name, qty]) => ({ name, qty })).filter((x) => x.qty > 0);
  }
  ordersFromSummaryMap = function () { return liveItems(); };

  /* ---------- 2. Styles ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #rpanel4 #subtab-ordermapper,#rpanel4 .steps,#rpanel4 .wrap > .actions,#rpanel4 #orderFileSection,
  #resultsCard .results-head,#resultsCard #summaryPills,#resultsCard .filter-bar,#resultsCard .footer-actions{display:none!important}
  #tab-orders.om-full .split{display:block!important}
  #tab-orders.om-full .split>.left-col{display:none!important}
  #tab-orders.om-full .split>.right-col{width:100%!important;max-width:100%!important;flex:1 1 100%!important}
  #tab-orders.om-full .stats-bar{display:none!important}
  #tab-orders,#tab-orders .split,#tab-orders .right-col,#tab-orders .right-col>.panel{max-width:none!important;width:auto}
  /* every menu tab uses the full screen width (the page was shrinking to each tab's content) */
  @media screen{
    html#aikm>body{flex:1 1 100%!important;width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box}
    html#aikm body .app-shell{width:100%!important}
    html#aikm body .app-content>.tabpanel{max-width:none!important}
    html#aikm body .app-content>.tabpanel :is(.wrap,.wrap-wide),html#aikm body #tab-selfship>.wrap{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}
  }
  #tab-orders.om-full .right-col .table-scroll{max-height:calc(100vh - 260px)!important}
  #rpanel4 .wrap,#rpanel4 .wrap-wide{max-width:none!important;padding:0!important;margin:0!important}
  #omBar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:14px 16px;margin:0 0 12px;background:var(--x-surface,#fff);
    border:1px solid var(--x-line,#E6E2D8);border-radius:14px;box-shadow:var(--x-shadow);font-family:"Lexend","Inter",sans-serif}
  #omBar .om-src{display:flex;align-items:center;gap:10px;flex:1 1 300px;min-width:0}
  #omBar .om-dot{width:10px;height:10px;border-radius:50%;background:#2F8A4C;flex:none;box-shadow:0 0 0 4px rgba(47,138,76,.15)}
  #omBar.file .om-dot{background:#D4AF37;box-shadow:0 0 0 4px rgba(212,175,55,.18)}
  #omBar .om-src-t{display:flex;flex-direction:column;min-width:0}
  #omBar .om-src-t b{font-size:14.5px;font-weight:600;color:var(--x-text)}
  #omBar .om-src-t span{font-size:12px;color:var(--x-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  html#aikm body #omBar .om-link{background:none!important;border:0!important;box-shadow:none!important;min-height:0!important;padding:0!important;
    color:var(--x-gold)!important;font-size:12px!important;font-weight:600!important;text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap}
  #omBar .om-chips{display:inline-flex;gap:4px;background:var(--x-surface-2);border:1px solid var(--x-line);border-radius:10px;padding:3px}
  html#aikm body #omBar .om-chips button{background:transparent!important;border:0!important;box-shadow:none!important;min-height:30px!important;padding:4px 12px!important;
    border-radius:7px!important;font-size:12.5px!important;font-weight:600!important;color:var(--x-muted)!important;display:inline-flex;align-items:center;gap:6px}
  html#aikm body #omBar .om-chips button b{font-weight:700;color:var(--x-text)}
  html#aikm body #omBar .om-chips button.on{background:var(--x-surface)!important;color:var(--x-text)!important;box-shadow:0 0 0 1px var(--x-line),0 1px 2px rgba(0,0,0,.12)!important}
  html#aikm body #omBar .om-chips button.warn b{color:#C0392B}
  html#aikm body #omBar .om-chips button.ok b{color:#2F8A4C}
  #omBar .om-val{font-size:12.5px;color:var(--x-muted);white-space:nowrap}
  #omBar .om-val b{color:var(--x-text);font-weight:600}
  #omBar .om-act{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
  html#aikm body #omBar #lotsCartBtn{background:#0F1E35!important;color:#D4AF37!important;border-color:#0F1E35!important;margin:0!important}
  html#aikm body #omBar #lots62Store{margin:0!important}
  /* SIMPLE LAYOUT (Oct 2026): one bar — status · filter · value · store · Send · More. Everything else lives in More. */
  #omBar{flex-wrap:nowrap}
  @media (max-width:1100px){#omBar{flex-wrap:wrap}}
  #omBar:not(.file) #omSrcSwitch{display:none}
  #omMoreMenu{width:270px}
  #omMoreMenu .om-mh{padding:8px 10px 4px;font:700 10px "Lexend",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--x-muted)}
  html#aikm body #omMoreMenu button:disabled{opacity:.5;cursor:wait}
  html#aikm body #omMoreMenu #omDlSlot button{display:flex!important;width:100%!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important;
    min-height:0!important;padding:9px 10px!important;border-radius:8px!important;font-size:12.5px!important;font-weight:500!important;color:var(--x-text)!important;text-align:left;justify-content:flex-start}
  html#aikm body #omMoreMenu #omDlSlot button:hover{background:var(--x-gold-soft)!important}
  html#aikm body #omNeed.show{display:block!important;line-height:1.6}
  html#aikm body #resultsTable .row-collapsed td{vertical-align:middle}
  /* hand-filled LOTS cart read: shown inside Order Mapper only when there is a result */
  #rpanel4 #l62Extract{margin:0 0 12px;padding:10px 14px;background:var(--x-surface,#fff);color:var(--x-text,#0F1E35);border:1px solid var(--x-line,#E6E2D8);border-left:4px solid #D4AF37}
  #rpanel4 #l62Extract .lx-row{display:none}
  #rpanel4 #l62Extract .lx-res{margin:0;padding:0;border:0}
  #rpanel4 #l62Extract .lx-st span{color:var(--x-muted)}
  #rpanel4 #l62Extract:has(.lx-res:empty){display:none}
  /* robot status panel: same clean card style */
  #rpanel4 #lotsCartPanel{margin:0 0 12px;background:var(--x-surface,#fff);color:var(--x-text,#0F1E35);border:1px solid var(--x-line,#E6E2D8);border-left:4px solid #D4AF37}
  #rpanel4 #lotsCartPanel .lc-sub{color:var(--x-muted)}
  /* order rows: plain one-line rows instead of a box inside every row */
  html#aikm body #resultsTable .collapsed-row-btn{border:0!important;background:transparent!important;box-shadow:none!important;padding:2px 0!important;width:100%;text-align:left}
  html#aikm body #resultsTable .row-collapsed:hover td{background:var(--x-raise,#F7F5EF)}
  #omMoreWrap{position:relative}
  #omMoreMenu{display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:1000;width:250px;background:var(--x-surface);border:1px solid var(--x-line-2);
    border-top:3px solid #D4AF37;border-radius:12px;box-shadow:0 18px 44px rgba(6,10,20,.25);padding:6px}
  #omMoreMenu.open{display:block}
  html#aikm body #omMoreMenu button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent!important;border:0!important;box-shadow:none!important;
    min-height:0!important;padding:9px 10px!important;border-radius:8px!important;font-size:12.5px!important;font-weight:500!important;color:var(--x-text)!important}
  html#aikm body #omMoreMenu button:hover{background:var(--x-gold-soft)!important}
  #omMoreMenu hr{border:0;border-top:1px solid var(--x-line);margin:4px 0}
  #omNeed{display:none;align-items:center;gap:10px;margin:0 0 12px;padding:10px 14px;border-radius:10px;background:rgba(192,57,43,.08);
    border:1px solid rgba(192,57,43,.3);color:var(--x-text);font:500 13px "Lexend",sans-serif}
  #omNeed.show{display:flex}
  #omNeed kbd{font:600 11px "Lexend",sans-serif;padding:1px 6px;border-radius:5px;border:1px solid var(--x-line-2);background:var(--x-surface)}
  #omBack{display:none}
  #omBar[data-view]:not([data-view="orders"]) #omBack{display:inline-flex}
  .om-empty{padding:36px 16px!important;text-align:center;color:var(--x-muted)!important;font:500 13.5px "Lexend",sans-serif}
  .om-empty b{display:block;color:var(--x-text);font-size:15px;margin-bottom:4px}`;
  document.head.appendChild(css);

  /* ---------- 3. Action bar ---------- */
  const bar = document.createElement("div");
  bar.id = "omBar";
  bar.dataset.view = "orders";
  bar.innerHTML = `
    <div class="om-src"><span class="om-dot"></span>
      <div class="om-src-t"><b id="omSrcTitle">Live from Scan Log</b><span id="omSrcSub">—</span></div>
      <button type="button" class="om-link" id="omSrcSwitch">Use a file instead</button>
      <input type="file" id="omFile" accept=".xlsx,.xls,.csv" style="display:none">
    </div>
    <div class="om-chips" id="omChips"></div>
    <span class="om-val" id="omVal"></span>
    <div class="om-act" id="omAct">
      <button type="button" class="secondary" id="omBack">← Order list</button>
      <span id="omMoreWrap"><button type="button" class="secondary" id="omMoreBtn">More ▾</button>
        <div id="omMoreMenu">
          <div class="om-mh">Download</div>
          <span id="omDlSlot"></span>
          <hr>
          <div class="om-mh">LOTS cart</div>
          <button type="button" data-a="readcart" id="omReadCart" title="Filled the LOTS cart by hand, without scanning AWBs? The robot reads it (nothing is changed) — then get the Picking List PDF &amp; Cart Excel">📥 Read hand-filled LOTS cart</button>
          <hr>
          <div class="om-mh">View</div>
          <button type="button" data-v="summary">📊 Vendor order summary</button>
          <button type="button" data-v="mapping">🗂 Master mapping</button>
          <button type="button" data-v="vendors">🏬 Vendors &amp; LOTS price list</button>
          <hr>
          <div class="om-mh">Tools</div>
          <button type="button" data-a="file">📂 Use a file instead of Scan Log</button>
          <button type="button" data-a="refresh">↻ Re-match all products</button>
          <button type="button" data-a="exportmap">⬇ Export master mapping</button>
        </div></span>
    </div>`;
  const need = document.createElement("div");
  need.id = "omNeed";
  const firstInPanel = panel.querySelector("#subtab-ordermapper") || panel.firstChild;
  panel.insertBefore(bar, firstInPanel);
  bar.after(need);

  function moveActions() {
    const act = byId("omAct"), more = byId("omMoreWrap"), slot = byId("omDlSlot");
    const push = byId("lotsCartBtn"), dl = byId("orderMapperDownloadBtn");
    if (push && push.parentNode !== act) act.insertBefore(push, more);
    /* Cart PDF + Vendor files → More menu (Download) */
    const pdf = byId("lotsCartPdfBtn");
    if (pdf && pdf.parentNode !== slot) slot.appendChild(pdf);
    if (dl && dl.parentNode !== slot) { dl.textContent = "⬇ Vendor files (one per vendor)"; slot.appendChild(dl); }
    const cp = byId("lotsCartPanel");
    if (cp && cp.previousElementSibling !== need) need.after(cp);
    /* store switch sits next to the Send button */
    const sw = byId("lots62Store");
    if (push && sw && sw.nextElementSibling !== push) push.before(sw);
    /* hand-filled cart result: inside Order Mapper (not above every tab) */
    const ex = byId("l62Extract"), after = byId("omGuide") || cp || need;
    if (ex && ex.previousElementSibling !== after) after.after(ex);
    syncStores();
  }
  /* ONE store choice (LOTS-GN / LOTS-62) for Send, Cart PDF and the hand-filled cart read */
  function syncStores() {
    let s = "lots";
    try { s = localStorage.getItem("aikmLotsCartStore") || "lots"; } catch (e) {}
    const b = document.querySelector(`#l62Extract .lx-sw button[data-s="${s}"]`);
    if (b && !b.classList.contains("on")) b.click();
    const rc = byId("omReadCart"), go = document.querySelector("#l62Extract .lx-go");
    if (rc) {
      rc.textContent = "📥 Read hand-filled " + (s === "lots62" ? "LOTS-62" : "LOTS-GN") + " cart";
      rc.disabled = !go || go.disabled;
    }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("#lots62Store button")) setTimeout(syncStores, 0);
  });
  moveActions();
  setInterval(() => { if (!document.hidden) moveActions(); }, 2000);

  /* ---------- 4. Views (orders / summary / mapping / vendors) ---------- */
  const VIEWS = { orders: "resultsCard", summary: "vendorSummaryCard", mapping: "masterMappingCard", vendors: "vendorsSection" };
  function view(v) {
    bar.dataset.view = v;
    try { switchOrderMapperSection(VIEWS[v]); } catch (e) {}
    need.style.visibility = v === "orders" ? "" : "hidden";
  }
  byId("omBack").addEventListener("click", () => view("orders"));
  const moreMenu = byId("omMoreMenu");
  byId("omMoreBtn").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!byId("omMoreWrap").contains(e.target)) moreMenu.classList.remove("open"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") moreMenu.classList.remove("open"); });
  moreMenu.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    moreMenu.classList.remove("open");
    if (b.dataset.v) return view(b.dataset.v);
    if (b.dataset.a === "refresh") { view("orders"); sync(true); }
    if (b.dataset.a === "file") byId("omFile").click();
    if (b.dataset.a === "readcart") { syncStores(); const go = document.querySelector("#l62Extract .lx-go"); go ? go.click() : alert("LOTS cart reader is still loading — try again in a moment."); }
    if (b.dataset.a === "exportmap") { const x = byId("exportMasterMappingBtn"); x && x.click(); }
  });

  /* ---------- 5. Source: live Scan Log or an uploaded file ---------- */
  let mode = "live", fileItems = [], fileName = "";
  byId("omSrcSwitch").addEventListener("click", () => {
    if (mode === "file") { mode = "live"; sync(true); return; }
    byId("omFile").click();
  });
  byId("omFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const items = extractOrderItems(await readWorkbook(f));
      if (!items || !items.length) return alert("Could not find Product and Qty columns in this file.");
      mode = "file"; fileItems = items.filter((x) => x.qty > 0); fileName = f.name;
      sync(true);
    } catch (err) { alert("Could not read this file: " + err.message); }
  });

  /* ---------- 5b. NO auto-match: only mappings you made yourself are used ---------- */
  function clearAuto(r) {
    if (r && r.selected && !r.remembered) {
      r.selected = null; r.auto = false; r.lotsPackQty = 1; r.manualQty = null;
    }
    return r;
  }
  const origBuild = buildResult;
  buildResult = function () { return clearAuto(origBuild.apply(this, arguments)); };
  if (typeof applyVendorMode === "function") {
    const origVendorMode = applyVendorMode;
    applyVendorMode = function (i, vendor) {
      origVendorMode.apply(this, arguments);
      const r = results[i];
      /* picking another vendor by hand is a manual choice — keep it; a LOTS auto-pick is removed */
      if (r && r.selected && !r.selected.plain && !r.remembered) { clearAuto(r); r.expanded = true; renderResults(); }
    };
  }
  /* an unmapped row always counts as "needs mapping" (even if a suggestion looks close) */
  effectiveScore = function (r) { return r.selected ? r.selected.score : 0; };

  /* ---------- 5c. Amazon mappings from the SP-API page (dalbhaat.in/pages/amazon) ----------
     Order product → ASIN (from OMS orders) → LOTS item(s) + qty, exactly as mapped on the Amazon page.
     These win over everything else. */
  let amzMap = {}, amzVer = 0;
  (function watchAmz() {
    if (typeof fbDb === "undefined" || !fbDb) return void setTimeout(watchAmz, 2000);
    fbDb.collection("aikm_admin").doc("spapiAsinLotsMap").onSnapshot(
      (d) => { amzMap = (d.exists && d.data().map) || {}; amzVer++; },
      (e) => console.warn("[OrderMapperAuto] Amazon mapping read failed", e),
    );
  })();
  let nameAsin = {}, nameRow = {}, nameAsinFor = null, codeIdx = {}, codeIdxFor = null;
  const keyCode = (c) => String(c == null ? "" : c).trim().replace(/^0+(?=\d)/, "");
  /* a mapping deleted in Master Mapping stays deleted: ignore any saved record older than the delete */
  const TOMBS = "order_mapper_deleted_v1";
  function tombs() { try { return JSON.parse(localStorage.getItem(TOMBS) || "{}") || {}; } catch (e) { return {}; } }
  function deletedAfter(name, rec) {
    const t = tombs()[normalize(name)];
    return !!t && !(String((rec && rec.savedAt) || "") > t);
  }
  function asinFor(name) {
    const raw = window.omsOrdersRaw || [];
    if (nameAsinFor !== raw) {
      nameAsin = {}; nameRow = {};
      raw.forEach((o) => {
        if (!o || !o.productName) return;
        const k = String(o.productName).trim();
        if (!nameRow[k]) nameRow[k] = o;
        if (o.asin && !nameAsin[k]) nameAsin[k] = String(o.asin).trim();
      });
      nameAsinFor = raw;
    }
    return nameAsin[String(name).trim()] || "";
  }
  function lotsItem(code) {
    const prods = (lotsVendor && lotsVendor.products) || [];
    if (codeIdxFor !== prods) { codeIdx = {}; prods.forEach((p) => (codeIdx[keyCode(p.code)] = p)); codeIdxFor = prods; }
    return codeIdx[keyCode(code)] || null;
  }
  function amzParts(name) {
    const asin = asinFor(name);
    if (!asin) return null;
    const r = amzMap[asin] || amzMap[asin.toUpperCase()];
    if (!r || deletedAfter(name, r) || (r.vendorName && String(r.vendorName).toUpperCase() !== "LOTS")) return null;
    const parts = (Array.isArray(r.parts) && r.parts.length ? r.parts : r.code ? [{ code: r.code, qty: 1 }] : []).filter((p) => p && p.code);
    return parts.length ? { asin, parts } : null;
  }
  /* product mapped to another vendor on the Amazon page */
  function amzVendor(name) {
    const asin = asinFor(name);
    if (!asin) return null;
    const r = amzMap[asin] || amzMap[asin.toUpperCase()];
    return r && !deletedAfter(name, r) && r.vendorName && String(r.vendorName).toUpperCase() !== "LOTS" ? { asin, vendorName: r.vendorName, name: r.name || name } : null;
  }
  function amzRows(it, am) {
    const n = am.parts.length;
    return am.parts.map((p, i) => {
      const lp = lotsItem(p.code) || {}, nm = lp.name || p.name || "LOTS item " + p.code;
      const row = n > 1
        ? buildResult(it.name, it.qty, "", { isSplitPart: true, comboSource: it.name, partLabel: `Part ${i + 1} of ${n}` })
        : buildResult(it.name, it.qty, "", {});
      return Object.assign(row, {
        matchName: nm, prep: prepProduct(nm), vendorFilter: "LOTS",
        selected: { code: String(p.code), name: nm, vendorName: "LOTS", score: 1 },
        auto: true, remembered: true, amz: am.asin, expanded: false,
        orderPackQty: Math.max(1, Number(p.qty) || 1), lotsPackQty: Math.max(1, parseInt(p.lotsPack) || 1), manualQty: null, candidates: [],
      });
    });
  }

  /* ---------- 6. Build rows: Amazon mapping → your saved mapping → unmapped ---------- */
  function rowsFor(it) {
    const am = amzParts(it.name);
    if (am) return amzRows(it, am);
    const av = amzVendor(it.name);
    if (av) {
      const row = buildResult(it.name, it.qty, "", {});
      return [Object.assign(row, { matchName: av.name, vendorFilter: av.vendorName, selected: { code: "", name: av.name, vendorName: av.vendorName, score: 1, plain: true },
        auto: true, remembered: true, amz: av.asin, expanded: false, orderPackQty: 1, lotsPackQty: 1, candidates: [] })];
    }
    const rec = loadLearned()[normalize(it.name)];
    if (rec && Array.isArray(rec.parts) && rec.parts.length) {
      const n = rec.parts.length;
      return rec.parts.map((p, i) => {
        const row = buildResult(it.name, it.qty, "", { isSplitPart: true, comboSource: it.name, partLabel: `Part ${i + 1} of ${n}` });
        if (p.mapped) {
          const prep = prepProduct(p.name || "");
          Object.assign(row, {
            matchName: p.name, prep, vendorFilter: p.vendorName,
            selected: { code: p.code || "", name: p.name, vendorName: p.vendorName, score: 1, plain: !!p.plain },
            auto: true, remembered: true, orderPackQty: p.orderPackQty || 1, lotsPackQty: p.vendorPackQty || 1,
            candidates: lotsVendor.prepped ? topMatches(prep, allPrepped, 6) : [],
          });
        }
        return row;
      });
    }
    return [buildResult(it.name, it.qty, it.name, {})];
  }

  /* ---------- 7. Live sync: keeps your edits, adds new products, updates qty ---------- */
  let lastSig = "", lastLearnSig = "", lastCat = -1, lastExt = "", waiting = false;
  function busy() {
    const a = document.activeElement, rc = byId("resultsCard");
    if (rc && rc.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox") return true;
    if (typeof globalSuggestList !== "undefined" && globalSuggestList && globalSuggestList.classList.contains("open")) return true;
    if (typeof globalMoreMenuEl !== "undefined" && globalMoreMenuEl && globalMoreMenuEl.classList.contains("open")) return true;
    const cs = byId("comboSplitModal");
    if (cs && cs.style.display === "flex") return true;
    if (window.__ommOpen) return true;
    return results.some((r) => r.addingNewProduct);
  }
  function learnSig() { try { return String((localStorage.getItem(LEARN_KEY) || "").length); } catch (e) { return ""; } }
  function sync(force) {
    const items = mode === "file" ? fileItems : liveItems();
    const sig = mode + "|" + items.map((i) => i.name + "~" + i.qty).join("\n");
    const ls = learnSig(), cat = (allPrepped || []).length;
    const catChanged = cat !== lastCat && (lastCat <= 0 || force);
    const learnChanged = ls !== lastLearnSig;
    const ext = amzVer + ":" + (window.omsOrdersRaw || []).length, extChanged = ext !== lastExt;
    if (!force && sig === lastSig && !learnChanged && !catChanged && !extChanged) return;
    if (!force && busy()) { waiting = true; return; }
    waiting = false;
    const want = new Map(items.map((i) => [i.name, i.qty]));
    const keep = [], seen = new Set();
    if (!force && !catChanged) {
      /* products to rebuild: mapped on another computer, or Amazon mapping added / changed */
      const rebuild = new Set();
      results.forEach((r) => {
        const key = r.isSplitPart ? r.comboSource : r.orderName;
        if (learnChanged && !r.amz && !r.selected && !r.isSplitPart && learnedFor(key)) rebuild.add(key);
        if (extChanged && (r.amz || amzParts(key) || amzVendor(key))) rebuild.add(key);
      });
      results.forEach((r) => {
        const key = r.isSplitPart ? r.comboSource : r.orderName;
        if (!want.has(key) || rebuild.has(key)) return;
        if (seen.has(key) && !r.isSplitPart) return;
        const q = want.get(key);
        if (r.qty !== q) { r.qty = q; r.manualQty = null; }
        keep.push(r); seen.add(key);
      });
    }
    items.forEach((it) => { if (!seen.has(it.name)) keep.push(...rowsFor(it)); });
    results = keep;
    orderItems = items;
    hasMatched = true;
    lastSig = sig; lastLearnSig = ls; lastCat = cat; lastExt = ext;
    try { updateNavAvailability(); } catch (e) {}
    renderResults();
  }
  setInterval(() => { if (!document.hidden && (panel.classList.contains("active") || waiting)) sync(false); }, 1200);

  /* ---------- 8. Status bar ---------- */
  let filterNow = "all";
  function paint() {
    const isFile = mode === "file";
    bar.classList.toggle("file", isFile);
    const units = (orderItems || []).reduce((t, x) => t + (Number(x.qty) || 0), 0);
    byId("omSrcTitle").textContent = isFile ? "From file · " + fileName : "Live from Scan Log";
    byId("omSrcSub").textContent = (orderItems || []).length + " products · " + units + " units" + (isFile ? "" : " · updates as you scan");
    byId("omSrcSwitch").textContent = isFile ? "Back to live Scan Log" : "Use a file instead";
    const pending = typeof pendingMappingCount === "function" ? pendingMappingCount() : 0;
    if (pending === 0 && currentFilter === "needsMapping") { currentFilter = "all"; filterNow = "all"; }
    byId("omChips").innerHTML =
      `<button type="button" data-f="all" class="${currentFilter !== "needsMapping" ? "on" : ""}">All <b>${results.length}</b></button>` +
      `<button type="button" data-f="needsMapping" class="${pending ? "warn" : "ok"} ${currentFilter === "needsMapping" ? "on" : ""}">${pending ? "Need mapping" : "✓ All mapped"} <b>${pending}</b></button>`;
    let val = 0;
    results.forEach((r) => { if (r.include && r.selected) { const p = rowPricing(r); if (p) val += p.value; } });
    byId("omVal").innerHTML = val ? `Est. LOTS value <b>₹${Math.round(val).toLocaleString("en-IN")}</b>` : "";
    need.classList.toggle("show", pending > 0);
    need.innerHTML = `🔴 <b>${pending}</b>&nbsp;product${pending === 1 ? "" : "s"} need mapping — shown at the top. Pick the right product once; it's remembered on every computer. Products not mapped are not sent to LOTS. &nbsp;<span style="opacity:.75">Press <kbd>/</kbd> to jump to the next one.</span>`;
  }
  byId("omChips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]"); if (!b) return;
    currentFilter = filterNow = b.dataset.f;
    const sel = byId("confidenceFilter"); if (sel) sel.value = currentFilter;
    renderResults();
  });
  const origRender = renderResults;
  renderResults = function () {
    origRender.apply(this, arguments);
    /* status for unmapped rows: "Not mapped" instead of a % guess */
    results.forEach((r, i) => {
      const b = document.querySelector(`#resultsBody td[data-conf="${i}"] .badge`);
      if (!b) return;
      if (r.selected && !r.amz) {
        if (r.remembered) b.outerHTML = '<span class="badge green" title="Saved mapping — click the row to change it">✓ Mapped</span>';
        return;
      }
      b.outerHTML = r.amz
        ? `<span class="badge blue" title="Mapped on the Amazon page · ASIN ${r.amz}${r.orderPackQty > 1 ? " · " + r.orderPackQty + " LOTS units per order" : ""} — change it there">✓ Amazon map${r.orderPackQty > 1 ? " ×" + r.orderPackQty : ""}</span>`
        : '<span class="badge red">✕ Not mapped</span>';
    });
    if (!results.length) {
      const body = byId("resultsBody");
      if (body) body.innerHTML = `<tr><td colspan="7" class="om-empty"><b>${mode === "file" ? "No products in this file" : "No scanned orders yet"}</b>${mode === "file" ? "Check the Product and Qty columns." : "Scan AWBs in the scanner — products appear here automatically."}</td></tr>`;
    }
    paint();
  };
  if (typeof updateSummary === "function") {
    const origUpd = updateSummary;
    updateSummary = function () { origUpd.apply(this, arguments); paint(); };
  }

  /* ---------- 9. Keyboard: next unmapped product ---------- */
  function focusNextUnmapped() {
    const inp = [...document.querySelectorAll("#resultsBody .search-input")].find((x) => !x.disabled && x.offsetParent);
    if (inp) { inp.focus(); inp.select && inp.select(); return true; }
    return false;
  }
  if (typeof window.__selectSuggestItemFromEl === "function") {
    const origPick = window.__selectSuggestItemFromEl;
    window.__selectSuggestItemFromEl = function () {
      const r = origPick.apply(this, arguments);
      setTimeout(focusNextUnmapped, 60);
      return r;
    };
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || !panel.classList.contains("active")) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox") return;
    if (focusNextUnmapped()) e.preventDefault();
  });

  /* ---------- 10. Full-width while Order Mapper is open ---------- */
  /* Full width for Product Summary, Not Found, Loss Orders and Order Mapper.
     Scan Log keeps the scanner panel on the left (that is where AWBs are scanned). */
  function layout() {
    const on = panel.classList.contains("active");
    const log = byId("rpanel1");
    const full = !!document.querySelector("#tab-orders .rpanel.active") && !(log && log.classList.contains("active"));
    const tab = byId("tab-orders");
    tab && tab.classList.toggle("om-full", full);
    if (on) { if (bar.dataset.view === "orders") view("orders"); sync(false); }
  }
  document.querySelectorAll("#tab-orders .rpanel").forEach((rp) =>
    new MutationObserver(layout).observe(rp, { attributes: true, attributeFilter: ["class"] }));
  /* ---------- 11. Mapper window (image · MRP · slab rates · stock · pack qty · combos) ----------
     Click an unmapped product (or press "/") → pick the LOTS item(s) → Save.
     Saved for this console AND for the Amazon page (same ASIN mapping), so both tools stay in sync. */
  function omsRowFor(name) { asinFor(name); return nameRow[String(name).trim()] || null; }
  const inr = (n) => (n == null || isNaN(n) ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
  const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function bestRate(p) { const s = (p && p.slabs) || []; return s.length ? Math.min(...s.map((x) => x.price)) : null; }
  function rateFor(p, units) { const s = p && p.slabs; if (!s || !s.length) return null; const x = slabPriceFor(s, units); return x ? x.price : bestRate(p); }
  function slabTxt(x) { return x.max == null || x.max === Infinity ? x.min + "+" : x.min === x.max ? String(x.min) : x.min + "–" + x.max; }

  const mcss = document.createElement("style");
  mcss.textContent = `
  #omMapper{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(6,10,20,.55);font-family:"Lexend","Inter",sans-serif}
  #omMapper.open{display:flex}
  #omMapper .omm-box{width:min(1180px,96vw);height:min(86vh,820px);display:flex;flex-direction:column;background:var(--x-surface,#fff);color:var(--x-text,#14213A);
    border:1px solid var(--x-line,#E6E2D8);border-top:3px solid #D4AF37;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.35);overflow:hidden}
  #omMapper .omm-head{position:relative;padding:16px 56px 14px 20px;border-bottom:1px solid var(--x-line);background:var(--x-surface-2,#FAF9F6)}
  #omMapper .omm-kicker{font-size:10.5px;font-weight:700;letter-spacing:.12em;color:var(--x-gold,#B8901F)}
  #omMapper .omm-title{font-size:17px;font-weight:600;margin-top:3px;line-height:1.3}
  #omMapper .omm-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #omMapper .omm-chip{font-size:11.5px;font-weight:500;padding:2px 9px;border-radius:20px;background:var(--x-surface);border:1px solid var(--x-line);color:var(--x-text-2)}
  #omMapper .omm-chip b{color:var(--x-text);font-weight:600}
  #omMapper .omm-chip.amz{background:rgba(255,153,0,.1);border-color:rgba(255,153,0,.4);color:#9A3412}
  html#aikm body #omMapper .omm-x{position:absolute;right:14px;top:14px;width:32px;height:32px;min-height:0!important;padding:0!important;border-radius:8px!important;font-size:14px!important}
  #omMapper .omm-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr)}
  #omMapper .omm-left{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--x-line)}
  #omMapper .omm-search{padding:12px 16px;border-bottom:1px solid var(--x-line)}
  html#aikm body #omMapper .omm-search input{width:100%;box-sizing:border-box;min-height:42px!important;font-size:14px!important;border:1.5px solid #D4AF37!important;box-shadow:0 0 0 3px rgba(212,175,55,.15)!important}
  #omMapper .omm-list{flex:1;overflow:auto;padding:8px}
  #omMapper .omm-it{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px;border-radius:12px;border:1px solid transparent;cursor:pointer}
  #omMapper .omm-it:hover{background:var(--x-raise,#F3F1EB)}
  #omMapper .omm-it.hi{background:var(--x-gold-soft,#FBF4DF);border-color:#D4AF37}
  #omMapper .omm-it.on{box-shadow:inset 3px 0 0 #2F8A4C}
  #omMapper .omm-img{width:64px;height:64px;border-radius:10px;background:#fff;border:1px solid var(--x-line);display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--x-muted);font-size:20px}
  #omMapper .omm-img img{width:100%;height:100%;object-fit:contain;padding:4px}
  #omMapper .omm-n{font-size:13.5px;font-weight:600;line-height:1.35}
  #omMapper .omm-s{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;font-size:11.5px;color:var(--x-muted)}
  #omMapper .omm-s .br{font-weight:700;letter-spacing:.06em;color:var(--x-gold);text-transform:uppercase;font-size:10.5px}
  #omMapper .omm-slabs{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
  #omMapper .omm-slab{font-size:11px;padding:1px 7px;border-radius:6px;border:1px solid var(--x-line);background:var(--x-surface-2);white-space:nowrap}
  #omMapper .omm-slab b{font-weight:600;color:var(--x-text)}
  #omMapper .omm-slab.best{border-color:#D4AF37;background:var(--x-gold-soft)}
  #omMapper .omm-pr{text-align:right;white-space:nowrap}
  #omMapper .omm-pr .r{font-size:16px;font-weight:600}
  #omMapper .omm-pr .m{font-size:11.5px;color:var(--x-muted)}
  #omMapper .omm-pr .m s{opacity:.8}
  #omMapper .omm-st{display:inline-block;margin-top:4px;font-size:10.5px;font-weight:600;padding:1px 8px;border-radius:20px}
  #omMapper .omm-st.ok{background:rgba(47,138,76,.12);color:#2F8A4C}
  #omMapper .omm-st.low{background:rgba(242,184,75,.18);color:#A15C07}
  #omMapper .omm-st.out{background:#D92D20;color:#fff}
  #omMapper .omm-empty{padding:30px;text-align:center;color:var(--x-muted)}
  #omMapper .omm-right{display:flex;flex-direction:column;min-height:0;background:var(--x-surface-2)}
  #omMapper .omm-rt{padding:14px 16px 8px;font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--x-muted);text-transform:uppercase}
  #omMapper #ommParts{flex:1;overflow:auto;padding:0 12px}
  #omMapper .omm-part{display:grid;grid-template-columns:48px minmax(0,1fr);gap:10px;padding:10px;margin-bottom:8px;border-radius:12px;background:var(--x-surface);border:1px solid var(--x-line)}
  #omMapper .omm-part .omm-img{width:48px;height:48px}
  #omMapper .omm-pq{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:var(--x-text-2)}
  html#aikm body #omMapper .omm-pq input{width:64px;min-height:30px!important;text-align:center;font-weight:600!important}
  #omMapper .omm-split{display:inline-block;margin-top:6px;font-size:11.5px;font-weight:600;color:#8a6a1f;background:#F6EEDB;border:1px solid #EBDDBA;border-radius:7px;padding:3px 8px}
  html#aikm body #omMapper .omm-del{margin-left:auto;min-height:0!important;padding:2px 8px!important;font-size:11px!important;color:#C0392B!important;background:transparent!important;border:1px solid rgba(192,57,43,.35)!important}
  #omMapper .omm-none{margin:6px 4px;padding:18px;border:1.5px dashed var(--x-line-2);border-radius:12px;text-align:center;color:var(--x-muted);font-size:12.5px}
  #omMapper .omm-sum{padding:12px 16px;border-top:1px solid var(--x-line);font-size:12.5px;color:var(--x-text-2);display:flex;flex-direction:column;gap:4px}
  #omMapper .omm-sum div{display:flex;justify-content:space-between}
  #omMapper .omm-sum b{color:var(--x-text)}
  #omMapper .omm-sum .pos b{color:#2F8A4C} #omMapper .omm-sum .neg b{color:#C0392B}
  #omMapper .omm-plain{padding:0 4px}
  html#aikm body #omMapper .omm-plain input{width:100%}
  #omMapper .omm-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--x-line);background:var(--x-surface)}
  #omMapper .omm-keys{font-size:11.5px;color:var(--x-muted);margin-right:auto}
  #omMapper .omm-keys kbd{font:600 10.5px "Lexend",sans-serif;padding:1px 5px;border-radius:4px;border:1px solid var(--x-line-2);background:var(--x-surface-2)}
  html#aikm body #omMapper #ommSave{background:#0F1E35!important;color:#D4AF37!important;border-color:#0F1E35!important;min-width:150px}
  html#aikm body #omMapper select{min-height:36px!important}
  @media (max-width:900px){#omMapper .omm-body{grid-template-columns:1fr}#omMapper .omm-right{max-height:40%}}`;
  document.head.appendChild(mcss);

  const mw = document.createElement("div");
  mw.id = "omMapper";
  mw.innerHTML = `
    <div class="omm-box" role="dialog" aria-modal="true">
      <div class="omm-head"><div class="omm-kicker">MAP PRODUCT</div><div class="omm-title" id="ommTitle"></div><div class="omm-meta" id="ommMeta"></div>
        <button type="button" class="omm-x secondary" id="ommClose" title="Close (Esc)">✕</button></div>
      <div class="omm-body">
        <div class="omm-left"><div class="omm-search"><input id="ommQ" placeholder="Search LOTS — name, brand, item code or barcode" autocomplete="off"></div>
          <div class="omm-list" id="ommList"></div></div>
        <div class="omm-right"><div class="omm-rt" id="ommRt">Mapped to</div><div id="ommParts"></div><div class="omm-sum" id="ommSum"></div></div>
      </div>
      <div class="omm-foot">
        <span class="omm-keys"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> add · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save · <kbd>Esc</kbd> close</span>
        <select id="ommVendor" title="Vendor"></select>
        <button type="button" class="secondary" id="ommCancel">Cancel</button>
        <button type="button" id="ommSave">Save &amp; next →</button>
      </div>
    </div>`;
  document.body.appendChild(mw);
  const q = byId("ommQ"), listEl = byId("ommList"), partsEl = byId("ommParts"), vendSel = byId("ommVendor");
  let cur = null, hits = [], hi = 0, qT = null;

  function imgBox(p) {
    return p && p.img ? `<div class="omm-img"><img loading="lazy" src="${escH(p.img)}" alt="" onerror="this.parentNode.innerHTML='📦'"></div>` : `<div class="omm-img">📦</div>`;
  }
  function stockPill(p) {
    if (!p || p.qty == null) return "";
    const n = Number(p.qty);
    return n <= 0 ? '<span class="omm-st out">OUT OF STOCK</span>' : `<span class="omm-st ${n < 10 ? "low" : "ok"}">${n.toLocaleString("en-IN")} in stock</span>`;
  }
  function itemHtml(c, i) {
    const p = lotsItem(c.code) || { code: c.code, name: c.name };
    const slabs = (p.slabs || []).slice().sort((a, b) => a.min - b.min), best = bestRate(p);
    const on = cur && cur.parts.some((x) => keyCode(x.code) === keyCode(p.code));
    return `<div class="omm-it ${i === hi ? "hi" : ""} ${on ? "on" : ""}" data-i="${i}">${imgBox(p)}
      <div><div class="omm-n">${escH(p.name)}</div>
        <div class="omm-s">${p.brand ? `<span class="br">${escH(p.brand)}</span>` : ""}<span>Code ${escH(p.code)}</span>${p.barcode ? `<span>${escH(p.barcode)}</span>` : ""}${p.gst != null ? `<span>GST ${p.gst}%</span>` : ""}${on ? '<span style="color:#2F8A4C;font-weight:600">✓ added</span>' : ""}</div>
        ${slabs.length > 1 ? `<div class="omm-slabs">${slabs.map((x) => `<span class="omm-slab ${x.price === best ? "best" : ""}"><b>${inr(x.price)}</b> · ${slabTxt(x)} pcs</span>`).join("")}</div>` : ""}</div>
      <div class="omm-pr"><div class="r">${inr(best)}</div><div class="m">${p.mrp ? `MRP <s>${inr(p.mrp)}</s>` : "MRP —"}</div>${stockPill(p)}</div></div>`;
  }
  function search() {
    const s = q.value.trim();
    if (!allPrepped || !allPrepped.length) { hits = []; listEl.innerHTML = '<div class="omm-empty">LOTS catalogue is still loading…</div>'; return; }
    if (!s) hits = topMatches(prepProduct(cur.key), allPrepped, 30);
    else {
      hits = topMatchesForSearch(prepProduct(s), allPrepped, 30);
      if (/^\d{6,}$/.test(s)) {
        const b = ((lotsVendor && lotsVendor.products) || []).filter((p) => String(p.barcode || "").includes(s) || String(p.code || "").includes(s)).slice(0, 10);
        const seen = new Set(b.map((p) => keyCode(p.code)));
        hits = b.map((p) => ({ code: p.code, name: p.name })).concat(hits.filter((h) => !seen.has(keyCode(h.code))));
      }
    }
    hi = 0;
    paintList();
  }
  function paintList() {
    listEl.innerHTML = hits.length ? hits.map(itemHtml).join("") : '<div class="omm-empty">No LOTS product found — try a shorter word, the brand, or the item code.</div>';
    const h = listEl.querySelector(".omm-it.hi"); h && h.scrollIntoView({ block: "nearest" });
  }
  function paintParts() {
    const isLots = cur.vendor === "LOTS";
    listEl.parentNode.style.display = isLots ? "" : "none";
    byId("ommRt").textContent = isLots ? `Mapped to · ${cur.parts.length ? cur.parts.length + " LOTS item" + (cur.parts.length > 1 ? "s (combo)" : "") : "nothing yet"}` : "Mapped to · " + cur.vendor;
    if (!isLots) {
      partsEl.innerHTML = `<div class="omm-plain"><label style="font-size:12px;color:var(--x-muted)">Product name to send to ${escH(cur.vendor)}</label><input id="ommPlain" value="${escH(cur.plain || cur.key)}"></div>`;
      byId("ommSum").innerHTML = "";
      return;
    }
    partsEl.innerHTML = cur.parts.length
      ? cur.parts.map((x, i) => {
          const p = lotsItem(x.code) || { code: x.code, name: x.name || "LOTS item " + x.code };
          return `<div class="omm-part">${imgBox(p)}<div><div class="omm-n" style="font-size:12.5px">${escH(p.name)}</div>
            <div class="omm-s"><span>Code ${escH(p.code)}</span><span>${inr(bestRate(p))}</span>${p.mrp ? `<span>MRP ${inr(p.mrp)}</span>` : ""}</div>
            <div class="omm-pq">${(x.lotsPack || 1) > 1 ? "Pcs" : "LOTS units"} per 1 order <input type="number" min="1" value="${x.qty}" data-pq="${i}"> · LOTS pack <input type="number" min="1" value="${x.lotsPack || 1}" data-lp="${i}" title="Pieces in one LOTS unit. Example: LOTS sells 20 pcs, Amazon listing is 5 pcs → pcs 5, LOTS pack 20">pcs<button type="button" class="omm-del" data-del="${i}">Remove</button></div>
            ${(x.lotsPack || 1) > 1 ? `<div class="omm-split">Uses ${x.qty} of ${x.lotsPack} pcs · ${Math.round(x.qty / x.lotsPack * 1000) / 1000} LOTS unit per order</div>` : ""}</div></div>`;
        }).join("")
      : `<div class="omm-none">Pick the right LOTS product on the left.<br>Add more than one for a combo.</div>`;
    paintSum();
  }
  function paintSum() {
    if (cur.vendor !== "LOTS") return;
    let cost = 0, ok = cur.parts.length > 0;
    const u = (x) => x.qty / Math.max(1, x.lotsPack || 1);
    cur.parts.forEach((x) => { const p = lotsItem(x.code); const r = rateFor(p, Math.max(1, Math.ceil(u(x) * cur.qty))); if (r == null) ok = false; else cost += r * u(x); });
    const o = omsRowFor(cur.key), sell = o && Number(o.total) && Number(o.qty) ? Number(o.total) / Number(o.qty) : null;
    const m = ok && sell ? sell - cost : null;
    byId("ommSum").innerHTML = cur.parts.length
      ? `<div><span>LOTS cost per order</span><b>${ok ? inr(Math.round(cost * 100) / 100) : "—"}</b></div>` +
        (sell ? `<div><span>Selling price (OMS)</span><b>${inr(Math.round(sell * 100) / 100)}</b></div>` : "") +
        (m != null ? `<div class="${m >= 0 ? "pos" : "neg"}"><span>Gross difference</span><b>${inr(Math.round(m * 100) / 100)}</b></div>` : "") +
        `<div><span>Total LOTS units for ${cur.qty} order${cur.qty > 1 ? "s" : ""}</span><b>${cur.parts.reduce((t, x) => t + Math.ceil(u(x) * cur.qty), 0)}</b></div>`
      : "";
  }
  function addPart(c) {
    if (!c) return;
    const k = keyCode(c.code), ex = cur.parts.findIndex((x) => keyCode(x.code) === k);
    if (ex < 0) cur.parts.push({ code: String(c.code), name: c.name, qty: cur.defQty });
    paintParts(); paintList();
    const inp = partsEl.querySelector(`[data-pq="${ex < 0 ? cur.parts.length - 1 : ex}"]`);
    inp && (inp.focus(), inp.select());
  }
  function currentParts(key) {
    const am = amzParts(key);
    if (am) return am.parts.map((p) => ({ code: String(p.code), qty: Math.max(1, Number(p.qty) || 1), lotsPack: Math.max(1, parseInt(p.lotsPack) || 1) }));
    const rows = results.filter((r) => (r.isSplitPart ? r.comboSource : r.orderName) === key && r.selected && !r.selected.plain && r.selected.code);
    const split = (op, vp) => { op = Math.max(1, Number(op) || 1); vp = Math.max(1, Number(vp) || 1); return op % vp === 0 ? { qty: op / vp, lotsPack: 1 } : { qty: op, lotsPack: vp }; };
    if (rows.length) return rows.map((r) => Object.assign({ code: String(r.selected.code), name: r.selected.name }, split(r.orderPackQty, r.lotsPackQty)));
    /* not in today's list (e.g. opened from Master Mapping): read the saved mapping */
    const L = loadLearned()[normalize(key)];
    if (!L || (L.vendorName && L.vendorName !== "LOTS")) return [];
    if (Array.isArray(L.parts) && L.parts.length) return L.parts.filter((p) => p.mapped && p.code).map((p) => Object.assign({ code: String(p.code), name: p.name }, split(p.orderPackQty, p.vendorPackQty)));
    return L.code ? [Object.assign({ code: String(L.code), name: L.name }, split(L.orderPackQty, L.vendorPackQty))] : [];
  }
  function openFor(i) {
    const r = results[i]; if (!r) return;
    const key = r.isSplitPart ? r.comboSource : r.orderName;
    const plainRow = results.find((x) => (x.isSplitPart ? x.comboSource : x.orderName) === key && x.selected && x.selected.plain);
    openKey(key, Number(r.qty) || 1, plainRow ? { vendor: plainRow.selected.vendorName, name: plainRow.selected.name } : null, false);
  }
  /* Master Mapping → Edit opens the same window */
  function openFromMaster(mapKey) {
    const L = loadLearned()[mapKey]; if (!L) return;
    const key = L.orderName || mapKey;
    const row = results.find((x) => (x.isSplitPart ? x.comboSource : x.orderName) === key);
    const plain = L.vendorName && L.vendorName !== "LOTS" && !L.code ? { vendor: L.vendorName, name: L.name || key } : null;
    openKey(key, row ? Number(row.qty) || 1 : 1, plain, true);
  }
  function openKey(key, qty, plain, fromMaster) {
    cur = { key, qty, parts: currentParts(key), vendor: plain ? plain.vendor : "LOTS", plain: plain ? plain.name : "", fromMaster: !!fromMaster,
      defQty: Math.max(1, prepProduct(key).mult || 1) };
    byId("ommSave").textContent = fromMaster ? "Save mapping" : "Save & next →";
    const asin = asinFor(key), o = omsRowFor(key);
    byId("ommTitle").textContent = key;
    byId("ommMeta").innerHTML = `<span class="omm-chip">Order qty <b>${cur.qty}</b></span>` +
      (cur.defQty > 1 ? `<span class="omm-chip">Pack of <b>${cur.defQty}</b></span>` : "") +
      (asin ? `<span class="omm-chip amz">ASIN <b>${escH(asin)}</b> · also saved for the Amazon page</span>` : "") +
      (o && o.channel ? `<span class="omm-chip">${escH(o.channel)}</span>` : "") +
      (o && o.sku ? `<span class="omm-chip">SKU <b>${escH(o.sku)}</b></span>` : "");
    vendSel.innerHTML = ["LOTS"].concat(otherVendors || []).map((v) => `<option ${v === cur.vendor ? "selected" : ""}>${escH(v)}</option>`).join("");
    q.value = "";
    window.__ommOpen = true;
    mw.classList.add("open");
    paintParts(); search();
    setTimeout(() => q.focus(), 30);
  }
  function close() { window.__ommOpen = false; mw.classList.remove("open"); cur = null; }
  function nextUnmapped(afterKey) {
    const order = visibleIndices();
    return order.find((i) => results[i] && !results[i].selected && (results[i].isSplitPart ? results[i].comboSource : results[i].orderName) !== afterKey);
  }
  function rebuildKey(key, qty) {
    const idx = results.findIndex((r) => (r.isSplitPart ? r.comboSource : r.orderName) === key);
    results = results.filter((r) => (r.isSplitPart ? r.comboSource : r.orderName) !== key);
    results.splice(idx < 0 ? results.length : idx, 0, ...rowsFor({ name: key, qty }));
  }
  function save() {
    if (!cur) return;
    const key = cur.key, qty = cur.qty;
    if (cur.vendor !== "LOTS") {
      const nm = ((byId("ommPlain") || {}).value || key).trim();
      rememberMatch(key, { vendorName: cur.vendor, code: "", name: nm }, 1, 1, {});
      /* same format the Amazon page uses for "other vendor" (keeps any cost/GST/MRP already entered there) */
      const asinV = asinFor(key);
      if (asinV && typeof fbDb !== "undefined" && fbDb) {
        const old = amzMap[asinV] || {};
        const rec = { code: "", name: nm, vendorName: cur.vendor, parts: [], vendor: old.vendorName === cur.vendor && old.vendor ? old.vendor : {}, savedAt: new Date().toISOString() };
        amzMap[asinV] = rec; amzVer++;
        fbDb.collection("aikm_admin").doc("spapiAsinLotsMap").set({ map: { [asinV]: rec }, savedAt: new Date().toISOString() }, { merge: true })
          .catch((e) => alert("Saved here, but could not update the Amazon page mapping: " + e.message));
      }
    } else {
      if (!cur.parts.length) { q.focus(); q.style.borderColor = "#C0392B"; return; }
      const parts = cur.parts.map((x) => { const p = lotsItem(x.code) || {}, o = { code: String(x.code), name: p.name || x.name || "", qty: Math.max(1, Number(x.qty) || 1) }, lp = Math.max(1, parseInt(x.lotsPack) || 1); if (lp > 1) o.lotsPack = lp; return o; });
      if (parts.length === 1) {
        rememberMatch(key, { vendorName: "LOTS", code: parts[0].code, name: parts[0].name }, parts[0].qty, parts[0].lotsPack || 1, {});
      } else {
        const L = loadLearned();
        L[normalize(key)] = {
          orderName: key, vendorName: "LOTS", code: parts.map((p) => p.code).join(", "), name: parts.map((p) => p.name).join(" + "),
          orderPackQty: 1, vendorPackQty: 1, isComboPart: true, comboSource: parts.length + " products",
          parts: parts.map((p) => ({ mapped: true, code: p.code, name: p.name, vendorName: "LOTS", plain: false, orderPackQty: p.qty, vendorPackQty: p.lotsPack || 1 })),
          savedAt: new Date().toISOString(),
        };
        saveLearned(L);
        try { typeof saveAll === "function" && saveAll(); } catch (e) {}
        try { typeof pushMasterMappingToCloud === "function" && pushMasterMappingToCloud(L); } catch (e) {}
      }
      /* same mapping for the Amazon page (ASIN → LOTS item(s) + qty) */
      const asin = asinFor(key);
      if (asin && typeof fbDb !== "undefined" && fbDb) {
        /* exactly the record format the Amazon page saves (ASIN → parts [{code,name,qty}]) */
        const label = parts.length === 1
          ? (parts[0].lotsPack ? `${parts[0].qty} pcs of ${parts[0].name || parts[0].code} (LOTS pack of ${parts[0].lotsPack})` : parts[0].qty === 1 ? parts[0].name : `${parts[0].qty} × ${parts[0].name || parts[0].code}`)
          : "Combo: " + parts.map((x) => x.lotsPack ? `${x.name || x.code} ${x.qty}/${x.lotsPack} pcs` : `${x.name || x.code} ×${x.qty}`).join(" + ");
        const entry = { code: parts[0].code, name: label, vendorName: "LOTS", parts, savedAt: new Date().toISOString() };
        amzMap[asin] = entry; amzVer++;
        fbDb.collection("aikm_admin").doc("spapiAsinLotsMap").set({ map: { [asin]: entry }, savedAt: new Date().toISOString() }, { merge: true })
          .catch((e) => alert("Saved here, but could not update the Amazon page mapping: " + e.message));
      }
    }
    const fromMaster = cur.fromMaster;
    if (results.some((r) => (r.isSplitPart ? r.comboSource : r.orderName) === key)) rebuildKey(key, qty);
    renderResults();
    if (fromMaster) { close(); editingMappingKey = null; try { renderMasterMapping(); } catch (e) {} return; }
    const nx = nextUnmapped(key);
    if (nx != null) openFor(nx); else close();
  }
  q.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(search, 120); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hits.length - 1, hi + 1); paintList(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); paintList(); }
    else if (e.key === "Enter" && !e.ctrlKey) { e.preventDefault(); addPart(hits[hi]); }
  });
  listEl.addEventListener("click", (e) => { const it = e.target.closest(".omm-it"); if (it) { hi = +it.dataset.i; addPart(hits[hi]); } });
  partsEl.addEventListener("input", (e) => { const i = e.target.dataset.pq; if (i != null && cur.parts[i]) { cur.parts[i].qty = Math.max(1, Number(e.target.value) || 1); paintSum(); } const j = e.target.dataset.lp; if (j != null && cur.parts[j]) { cur.parts[j].lotsPack = Math.max(1, parseInt(e.target.value) || 1); paintSum(); } });
  partsEl.addEventListener("change", (e) => { if (e.target.dataset.lp != null || e.target.dataset.pq != null) { const f = e.target.dataset.lp != null ? "lp" : "pq", i = e.target.dataset[f]; paintParts(); const n = partsEl.querySelector(`[data-${f}="${i}"]`); n && n.focus(); } });
  partsEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target.dataset.pq != null || e.target.dataset.lp != null)) { e.preventDefault(); save(); } });
  partsEl.addEventListener("click", (e) => { const d = e.target.closest("[data-del]"); if (d) { cur.parts.splice(+d.dataset.del, 1); paintParts(); paintList(); q.focus(); } });
  vendSel.addEventListener("change", () => { cur.vendor = vendSel.value; paintParts(); if (cur.vendor === "LOTS") q.focus(); });
  byId("ommSave").addEventListener("click", save);
  byId("ommCancel").addEventListener("click", close);
  byId("ommClose").addEventListener("click", close);
  mw.addEventListener("mousedown", (e) => { if (e.target === mw) close(); });
  document.addEventListener("keydown", (e) => {
    if (!mw.classList.contains("open")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); save(); }
  }, true);

  /* open the window instead of the small inline search: click/focus a product's search box or a mapped (one-line) row */
  document.addEventListener("focus", (e) => {
    const s = e.target && e.target.closest && e.target.closest("#resultsBody .search-input");
    if (!s) return;
    e.stopPropagation();
    s.blur();
    try { typeof hideGlobalSuggestList === "function" && hideGlobalSuggestList(); } catch (x) {}
    openFor(+s.dataset.idx);
  }, true);
  document.addEventListener("click", (e) => {
    const m = e.target.closest && e.target.closest('#masterMappingBody [data-act="editMapping"]');
    if (m) { e.stopPropagation(); e.preventDefault(); openFromMaster(m.dataset.key); return; }
    const b = e.target.closest && e.target.closest('#resultsBody [data-act="expandRow"]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    openFor(+b.dataset.idx);
  }, true);
  /* row hint text */
  const origRender2 = renderResults;
  renderResults = function () {
    origRender2.apply(this, arguments);
    document.querySelectorAll("#resultsBody .search-input").forEach((s) => { s.placeholder = "🔗 Click to map (image · MRP · rates)"; s.value = ""; s.readOnly = true; });
  };

  /* ---------- DELETE = DELETED EVERYWHERE ----------
     Master Mapping → Delete removes the mapping from: this computer, the cloud master list,
     the Amazon page (ASIN record) and the Amazon page's quick-match copy. Every computer is told. */
  function deleteEverywhere(mapKey) {
    const ts = new Date().toISOString(), L = loadLearned(), rec = L[mapKey] || {};
    const name = rec.orderName || mapKey;
    const t = tombs(); t[mapKey] = ts;
    try { localStorage.setItem(TOMBS, JSON.stringify(t)); } catch (e) {}
    delete L[mapKey];
    saveLearned(L);
    try { typeof saveAll === "function" && saveAll(); } catch (e) {}
    if (typeof fbDb !== "undefined" && fbDb) {
      const A = fbDb.collection("aikm_admin"), enc = encodeURIComponent(mapKey).replace(/\./g, "%2E");
      A.doc("masterMappingDeleted").set({ k: { [enc]: ts } }, { merge: true }).catch((e) => console.warn("[Delete] tomb", e));
      A.doc("masterMapping").collection("chunks").doc("__spapi_live_" + mapKey.replace(/[^a-z0-9]/g, "_").slice(0, 60)).delete().catch(() => {});
      const asin = asinFor(name);
      if (asin) {
        const del = firebase.firestore.FieldValue.delete(), upd = { savedAt: ts };
        [asin, asin.toUpperCase()].forEach((a) => { if (amzMap[a]) { upd["map." + a] = del; delete amzMap[a]; } });
        if (Object.keys(upd).length > 1) A.doc("spapiAsinLotsMap").update(upd).catch((e) => console.warn("[Delete] asin", e));
        amzVer++;
      }
      try { pushMasterMappingToCloud(L); } catch (e) {}
    }
    try { typeof clearSpapiMatchCache === "function" && clearSpapiMatchCache(); } catch (e) {}
    try { renderMasterMapping(); } catch (e) {}
    sync(true);
  }
  document.addEventListener("click", (e) => {
    const d = e.target.closest && e.target.closest('#masterMappingBody [data-act="deleteMapping"]');
    if (!d) return;
    e.stopPropagation(); e.preventDefault();
    if (!confirm("Delete this mapping?\n\nIt is removed from every computer and from the Amazon page. You will map it again next time it is ordered.")) return;
    deleteEverywhere(d.dataset.key);
  }, true);

  /* self-heal: if an old/other computer pushes a deleted mapping back to the cloud, remove it again */
  let healT = null;
  const saveL3 = saveLearned;
  saveLearned = function (m) {
    if (m && typeof masterMappingChunksCache !== "undefined") {
      const t = tombs(), cloud = Object.assign({}, ...Object.values(masterMappingChunksCache || {}));
      const back = Object.keys(t).some((k) => cloud[k] && !(String(cloud[k].savedAt || "") > t[k]));
      if (back && !healT) healT = setTimeout(() => { healT = null; try { pushMasterMappingToCloud(loadLearned()); } catch (e) {} }, 4000);
    }
    return saveL3.apply(this, arguments);
  };

  /* ---------- 12. LOTS order guide: one clear step at a time (Oct 2026) ----------
     Replaces the busy robot panel with 5 steps: robot fills cart → edit on LOTS → save final cart →
     place order → next batch / Picking List. Uses the same robot requests as before. */
  const gcss = document.createElement("style");
  gcss.textContent = `
  #rpanel4 #lotsCartPanel.om-guided{display:none!important}
  #omGuide{display:none;margin:0 0 12px;padding:14px 16px;background:var(--x-surface,#fff);color:var(--x-text,#0F1E35);border:1px solid var(--x-line,#E6E2D8);
    border-left:4px solid #D4AF37;border-radius:14px;font-family:"Lexend","Inter",sans-serif}
  #omGuide.show{display:block}
  #rpanel4 #l62Extract.om-side{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}
  #omGuide .og-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
  #omGuide .og-h b{font-size:14.5px;font-weight:600}
  #omGuide .og-tag{font-size:11px;font-weight:700;padding:2px 9px;border-radius:6px;background:#0F1E35;color:#D4AF37}
  html#aikm body #omGuide .og-x{margin-left:auto;background:none!important;border:0!important;box-shadow:none!important;min-height:0!important;padding:2px 6px!important;color:var(--x-muted)!important;font-size:12px!important;cursor:pointer}
  #omGuide ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  #omGuide li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;align-items:start;padding:8px 10px;border-radius:10px}
  #omGuide li .n{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;
    background:var(--x-surface-2,#F3F1EB);color:var(--x-muted);border:1px solid var(--x-line)}
  #omGuide li.done .n{background:#2F8A4C;color:#fff;border-color:#2F8A4C}
  #omGuide li.now{background:var(--x-gold-soft,#FBF4DF);box-shadow:inset 0 0 0 1px rgba(212,175,55,.55)}
  #omGuide li.now .n{background:#D4AF37;color:#0F1E35;border-color:#D4AF37}
  #omGuide li.bad{background:rgba(192,57,43,.08);box-shadow:inset 0 0 0 1px rgba(192,57,43,.35)}
  #omGuide li.bad .n{background:#C0392B;color:#fff;border-color:#C0392B}
  #omGuide li.todo{opacity:.55}
  #omGuide .t{font-size:13.5px;font-weight:600;line-height:24px}
  #omGuide .s{font-size:12px;color:var(--x-muted);margin-top:1px}
  #omGuide li.bad .s{color:#C0392B}
  #omGuide .a{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  html#aikm body #omGuide .a button,html#aikm body #omGuide .a a{min-height:32px!important;padding:6px 14px!important;border-radius:8px!important;font-size:12.5px!important;
    font-weight:600!important;cursor:pointer;text-decoration:none;border:1px solid var(--x-line-2,#D9D3C3)!important;background:var(--x-surface)!important;color:var(--x-text)!important;box-shadow:none!important}
  html#aikm body #omGuide .a .go{background:#0F1E35!important;color:#D4AF37!important;border-color:#0F1E35!important}
  html#aikm body #omGuide .a .xl{background:#1F7A4D!important;color:#fff!important;border-color:#1F7A4D!important}
  html#aikm body #omGuide .a button:disabled{opacity:.55;cursor:wait}
  #omGuide .w{display:inline-block;width:9px;height:9px;border-radius:50%;background:#E0B21E;margin-right:6px;animation:lcPulse 1.2s infinite}
  @keyframes lcPulse{50%{opacity:.35}}`;
  document.head.appendChild(gcss);
  const guide = document.createElement("div");
  guide.id = "omGuide";
  need.after(guide);
  let gDoc = null, gId = null;
  const GHIDE = "aikm_om_guide_hidden";
  const sName = (s) => (s === "lots62" ? "LOTS-62" : "LOTS-GN");
  const busyS = (s) => s === "pending" || s === "processing";
  const hiddenBtn = (sel) => document.querySelector("#lotsCartPanel " + sel);
  function gAdd(data) {
    return fbDb.collection("lotsCartQueue").add(Object.assign(data, { createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
  }
  function gSave(btn) {
    const d = gDoc, nm = sName(d.store);
    if (busyS(d.status)) return alert("The LOTS robot is still busy — wait for it to finish.");
    if (!confirm(`Finished editing your ${nm} cart on LOTS?\n\n• The robot reads your cart and saves it — nothing is added, removed or ordered\n• Takes about 1–3 minutes\n• Do this BEFORE you place the order (after ordering, the cart is empty)`)) return;
    btn.disabled = true;
    gAdd({ status: "pending", type: "readCart", vendor: d.vendor || "LOTS", store: d.store || "lots", items: [], sentCount: 0,
      batchOf: d.batchOf || gId, batchNo: d.batchNo || 1, batchTotal: d.batchTotal || 1, refreshOf: d.refreshOf || gId,
      remainingItems: d.remainingItems || [], remainingCount: (d.remainingItems || []).length })
      .catch((e) => { btn.disabled = false; alert("Could not send: " + (e.message || e)); });
  }
  /* ----- not-added products → the other LOTS account (LOTS-GN ⇄ LOTS-62) -----
     A separate cart order on the other account. Its time is set just before this order,
     so the steps above keep following your main order. Picking List / Excel come from
     the same "hand-filled cart" tools (it is saved as a standalone cart). */
  let gList = [];
  const otherStore = (d) => (d.store === "lots62" ? "lots" : "lots62");
  const rootOf = (d, id) => d.batchOf || id;
  function stockOther(store, code) {
    if (store === "lots62") {
      try {
        if (!stockOther.c || stockOther.t < Date.now() - 60000) {
          const c = JSON.parse(localStorage.getItem("aikmLots62Cache") || "null"); stockOther.c = {}; stockOther.t = Date.now();
          ((c && c.products) || []).forEach((p) => (stockOther.c[keyCode(p.code)] = p));
        }
        const q = stockOther.c[keyCode(code)];
        return !q ? 0 : q.qty == null ? 1 : Number(q.qty);
      } catch (e) { return 1; }
    }
    const p = lotsItem(code); return !p ? 0 : p.qty == null ? 1 : Number(p.qty);
  }
  /* failed products (missing qty only) that the other account has in stock */
  function sideItems(d) {
    const o = otherStore(d);
    return (d.failedItems || []).map((f) => ({ code: String(f.code), name: f.name || "", qty: Math.max(0, (Number(f.qty) || 0) - (Number(f.cartQty) || 0)) }))
      .filter((x) => x.code && x.qty > 0 && stockOther(o, x.code) > 0);
  }
  /* side requests of this order: thisBatch=true → only for the batch on screen (for the Send button) */
  function sideDocs(thisBatch) {
    const d = gDoc; if (!d) return [];
    const root = rootOf(d, gId), bn = d.batchNo || 1;
    return gList.filter((x) => x.d.sideOf === root && (!thisBatch || (x.d.sideBatch || 1) === bn)).sort((a, b) => (b.d.createdAtMs || 0) - (a.d.createdAtMs || 0));
  }
  function sideDoc(thisBatch) { const l = sideDocs(thisBatch); return l.length ? l[0] : null; }
  function sidePush() { return sideDocs(false).find((x) => x.d.type !== "readCart") || null; }
  function sideHtml(d) {
    const sd = sideDoc(); if (!sd) return "";
    const x = sd.d, sp = sidePush(), o = sName(x.store), lines = (x.cartLines || []).length;
    let t, sub = "", act = "", cls = "done";
    if (busyS(x.status)) {
      cls = "now";
      t = x.type === "readCart" ? `${o}: saving your final cart…` : `${o}: robot is adding ${x.sentCount || 0} not-added products`;
      sub = `<span class="w"></span>${esc(x.status === "processing" ? x.progress || "Logging into LOTS…" : "Starts within 2 minutes…")}`;
    } else if (x.status === "failed") {
      cls = "bad"; t = `${o}: ${x.type === "readCart" ? "final cart not saved" : "could not add the products"}`; sub = esc(x.error || "Unknown error");
      act = x.type === "readCart" ? `<button type="button" class="go" data-g="sidesave">💾 Try again</button>` : `<button type="button" class="go" data-g="sideretry">↻ Try again</button>`;
    } else {
      const p = sp ? sp.d : x, nf = (p.failedItems || []).length;
      t = x.type === "readCart" ? `${o} cart saved — ${lines} products` : `${o}: ${p.addedCount || 0} of ${p.sentCount || 0} added to your ${o} cart`;
      sub = (x.type !== "readCart" && nf ? `${nf} not available there either. ` : "") + `Edit the ${o} cart if needed, save it, and place that order on ${o} too.`;
      act = `<a href="https://www.lotswholesale.com/member/cart" target="_blank" rel="noopener">Open ${o} cart ↗</a>` +
        `<button type="button" data-g="sidesave">💾 Save final ${o} cart</button>` +
        (lines ? `<button type="button" class="go" data-g="sidepdf">📄 ${o} Picking List</button><button type="button" class="xl" data-g="sidexl">⬇ ${o} Excel</button>` : "");
    }
    return `<li class="${cls}" style="margin-left:36px"><span class="n">${cls === "done" ? "✓" : cls === "bad" ? "!" : "↪"}</span><div><div class="t">${t}</div><div class="s">${sub}</div>${act ? `<div class="a">${act}</div>` : ""}</div></li>`;
  }
  function sideAdd(data, btn) {
    const d = gDoc, l = sideDocs();
    /* just before this order (keeps the steps on your main order), after any earlier side request */
    const base = (Number(d.createdAtMs) || Date.now()) - 2, at = l.length ? Math.max(base, (Number(l[0].d.createdAtMs) || base) + 0.01) : base;
    btn && (btn.disabled = true);
    return fbDb.collection("lotsCartQueue").add(Object.assign({ vendor: "LOTS", standalone: true, sideOf: rootOf(d, gId), sideBatch: d.batchNo || 1,
      batchNo: 1, batchTotal: 1, createdAtMs: at, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, data))
      .catch((e) => { btn && (btn.disabled = false); alert("Could not send: " + (e.message || e)); });
  }
  function gSide(btn, retry) {
    const d = gDoc, o = otherStore(d), items = retry && sidePush() ? sidePush().d.items || [] : sideItems(d);
    if (!items.length) return alert(`None of the not-added products are in stock at ${sName(o)}.`);
    const units = items.reduce((t, x) => t + x.qty, 0);
    if (!confirm(`Send ${items.length} not-added products (${units} units) to your ${sName(o)} cart?\n\n• Only products ${sName(o)} has in stock (from the last stock update)\n• Your ${sName(o)} cart is emptied first\n• Takes about 1–4 minutes\n• Your ${sName(d.store)} order is not changed`)) return;
    sideAdd({ status: "pending", store: o, items, sentCount: items.length }, btn);
  }
  function gSideSave(btn) {
    const sd = sideDoc(); if (!sd) return;
    if (busyS(sd.d.status)) return alert("The LOTS robot is still busy — wait for it to finish.");
    const o = sd.d.store;
    if (!confirm(`Finished editing your ${sName(o)} cart?\n\n• The robot reads it and saves it — nothing is changed\n• Takes about 1–3 minutes\n• Do this BEFORE placing the ${sName(o)} order`)) return;
    sideAdd({ status: "pending", type: "readCart", store: o, items: [], sentCount: 0 }, btn);
  }
  function gNext(btn) {
    const d = gDoc, rem = d.remainingItems || [], nm = sName(d.store), n = (d.batchNo || 1) + 1;
    if (!rem.length || busyS(d.status)) return;
    if (!confirm(`Send Batch ${n} (${Math.min(rem.length, 160)} products) to your ${nm} cart?\n\n⚠ Place the order for the products now in your ${nm} cart FIRST.\nThe robot empties the cart before adding this batch (it saves what was there first).\n\n• Takes about 1–4 minutes`)) return;
    btn.disabled = true;
    gAdd({ status: "pending", vendor: d.vendor || "LOTS", store: d.store || "lots", items: rem, sentCount: rem.length,
      batchNo: n, batchTotal: d.batchTotal || n, batchOf: d.batchOf || gId })
      .catch((e) => { btn.disabled = false; alert("Could not send: " + (e.message || e)); });
  }
  function step(n, state, title, sub, actions) {
    return `<li class="${state}"><span class="n">${state === "done" ? "✓" : state === "bad" ? "!" : n}</span><div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}${actions ? `<div class="a">${actions}</div>` : ""}</div></li>`;
  }
  function paintGuide() {
    const d = gDoc, cp = byId("lotsCartPanel");
    let hid = ""; try { hid = localStorage.getItem(GHIDE) || ""; } catch (e) {}
    const show = !!d && !d.standalone && (d.type !== "readCart" || !!d.refreshOf) && hid !== gId &&
      (busyS(d.status) || Date.now() - (d.createdAtMs || 0) < 36 * 3600 * 1000);
    guide.classList.toggle("show", show);
    if (cp) cp.classList.toggle("om-guided", show);
    if (!show) return;
    const nm = sName(d.store), bn = d.batchNo || 1, bt = d.batchTotal || 1, rem = d.remainingItems || [];
    const isSave = d.type === "readCart", st = d.status;
    const pushDone = isSave || st === "done";
    const saved = isSave && st === "done";
    const lines = (d.cartLines || []).length;
    const wait = (txt) => `<span class="w"></span>${esc(txt)}`;
    /* step 1: robot fills the cart */
    let s1;
    if (isSave) s1 = step(1, "done", `Robot filled your ${nm} cart`, "");
    else if (busyS(st)) s1 = step(1, "now", `Robot is filling your ${nm} cart — ${d.sentCount || 0} products`, wait(st === "processing" ? d.progress || "Logging into LOTS…" : "Starts within 2 minutes…"));
    else if (st === "failed") s1 = step(1, "bad", "Could not fill the LOTS cart", esc(d.error || "Unknown error"), `<button type="button" class="go" data-g="retry">↻ Try again</button>`);
    else {
      const f = (d.failedItems || []).length;
      const o = otherStore(d), av = f ? sideItems(d) : [];
      s1 = step(1, "done", `Robot filled your ${nm} cart — ${d.addedCount || 0} of ${d.sentCount || 0} added`,
        f ? `${f} product${f > 1 ? "s" : ""} not added (out of stock / limit)` + (sideDoc(true) ? "" : av.length ? ` — <b>${av.length}</b> of them in stock at ${sName(o)}` : ` — none in stock at ${sName(o)} either`) : "",
        f ? `<button type="button" data-g="failxl">⬇ Not-added list</button>` + (!sideDoc(true) && av.length ? `<button type="button" class="go" data-g="side">🛒 Send ${av.length} to ${sName(o)} cart</button>` : "") : "");
    }
    s1 += sideHtml(d);
    /* step 2: edit on LOTS */
    const s2 = step(2, pushDone && !saved && !(isSave && busyS(st)) && st !== "failed" ? "now" : pushDone ? "done" : "todo",
      "Check &amp; edit the cart on LOTS", "Change quantities, add or remove products — whatever you need.",
      pushDone ? `<a href="https://www.lotswholesale.com/member/cart" target="_blank" rel="noopener">Open ${nm} cart ↗</a>` : "");
    /* step 3: save final cart */
    let s3;
    if (isSave && busyS(st)) s3 = step(3, "now", "Saving your final cart…", wait("Robot is reading your cart — 1 to 3 minutes. Don't place the order yet."));
    else if (isSave && st === "failed") s3 = step(3, "bad", "Final cart not saved", esc(d.error || "Unknown error"), `<button type="button" class="go" data-g="save">💾 Try again</button>`);
    else if (saved) {
      const chg = (cp && cp.querySelector(".l62-chg")) ? cp.querySelector(".l62-chg").textContent.replace(/^✔\s*/, "") : `${lines} products saved`;
      s3 = step(3, "done", "Final cart saved", esc(chg), `<button type="button" data-g="save">↻ Save again</button>`);
    } else s3 = step(3, pushDone && st !== "failed" ? "now" : "todo", "Save my final cart", "When you're done editing — so the Picking List matches your real cart.",
      pushDone && st !== "failed" ? `<button type="button" class="go" data-g="save">💾 Save my final cart</button>` : "");
    /* step 4: place order */
    const s4 = step(4, saved ? "now" : "todo", "Place the order on LOTS", saved ? "Your final cart is saved — place the order for this cart on LOTS now." : "");
    /* step 5: next batch or picking list */
    let s5;
    const canPdf = pushDone && st === "done" && lines > 0;
    if (rem.length) {
      s5 = step(5, saved ? "now" : "todo", `Send Batch ${bn + 1} of ${bt} — ${rem.length} products waiting`,
        "LOTS takes max 160 products per cart. Place this order first, then send the next batch.",
        pushDone && st === "done" ? `<button type="button" class="go" data-g="next">▶ Send Batch ${bn + 1}</button><button type="button" data-g="waitxl">⬇ Waiting list</button>` : "");
    } else {
      s5 = step(5, saved ? "now" : "todo", bt > 1 ? `All ${bt} batches done — download your picking list` : "Download your picking list",
        bt > 1 ? "One PDF / Excel with every batch, including your edits." : "",
        canPdf ? `<button type="button" class="go" data-g="pdf">📄 Picking List PDF</button><button type="button" class="xl" data-g="xl">⬇ Cart Excel</button>` : "");
    }
    guide.innerHTML = `<div class="og-h"><span class="og-tag">${nm}${bt > 1 ? ` · Batch ${bn} of ${bt}` : ""}</span><b>LOTS order — follow the steps</b>` +
      `<button type="button" class="og-x" data-g="hide" title="Hide until the next order">Hide ✕</button></div><ol>${s1}${s2}${s3}${s4}${s5}</ol>`;
  }
  const esc = escH;
  guide.addEventListener("click", (e) => {
    const b = e.target.closest("[data-g]"); if (!b || !gDoc) return;
    const g = b.dataset.g;
    if (g === "hide") { try { localStorage.setItem(GHIDE, gId); } catch (x) {} paintGuide(); return; }
    if (g === "save") return gSave(b);
    if (g === "next") return gNext(b);
    if (g === "side") return gSide(b, false);
    if (g === "sideretry") return gSide(b, true);
    if (g === "sidesave") return gSideSave(b);
    if (g === "sidepdf" || g === "sidexl") {
      const h = document.querySelector(`#l62Extract [data-x="${g === "sidepdf" ? "pdf" : "xl"}"]`);
      return h ? h.click() : alert("Still loading — try again in a few seconds.");
    }
    const map = { retry: '[data-lc="retry"]', failxl: '[data-lc="xls"]', waitxl: '[data-l62="xlrem"]', pdf: '[data-l62="pdf"], .lc-pdf', xl: '[data-l62="xlcart"]' };
    const h = hiddenBtn(map[g]);
    if (h) h.click(); else alert("Still loading — try again in a few seconds.");
  });
  (function watchGuide() {
    if (typeof fbDb === "undefined" || !fbDb) return void setTimeout(watchGuide, 2000);
    fbDb.collection("lotsCartQueue").orderBy("createdAtMs", "desc").limit(1).onSnapshot((snap) => {
      gDoc = snap.empty ? null : snap.docs[0].data();
      gId = snap.empty ? null : snap.docs[0].id;
      setTimeout(paintGuide, 150); /* let the old panel add its buttons first */
    }, () => {});
    fbDb.collection("lotsCartQueue").orderBy("createdAtMs", "desc").limit(15).onSnapshot((snap) => {
      gList = snap.docs.map((x) => ({ id: x.id, d: x.data() }));
      /* the hand-filled cart box would show the same side cart again — hide it then */
      const sa = gList.find((x) => x.d.standalone), ex = byId("l62Extract");
      if (ex) ex.classList.toggle("om-side", !!(sa && sa.d.sideOf));
      setTimeout(paintGuide, 150);
    }, () => {});
    /* the old panel adds its buttons (PDF, Excel, change summary) a moment later — repaint then */
    const cp = byId("lotsCartPanel");
    if (cp) { let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(paintGuide, 200); }).observe(cp, { childList: true, subtree: true }); }
  })();

  view("orders");
  layout();
  sync(true);
  console.log("[OrderMapperAuto] active");
})();