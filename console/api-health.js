/* AIKM · Amazon page · 🩺 API health pill
   Shows today's Amazon API error % for the selected account (green under 2%, gold under 5%, red above).
   Click it for the per-operation breakdown and any API paused for "no permission".
   Data: spapiSnapshots/<acct>_guard (SP-API Firebase), written by sp-guard.js once per sync run.
   Cost: 1 read per page open / account switch. Loaded by the block at the end of console/amazon-name-search.js (aikmApiHealthJs). */
(function () {
  if (window.__aikmApiHealth) return; window.__aikmApiHealth = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var db = function () { return typeof fbDbSpapi !== "undefined" ? fbDbSpapi : null; };
  var data = null;

  var css = document.createElement("style");
  css.textContent = ".ah-pill{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:9px;font-size:12.5px;font-weight:600;color:#fff;border:1px solid rgba(255,255,255,.25);white-space:nowrap}" +
    ".ah-dot{width:8px;height:8px;border-radius:50%;background:#8B909B}" +
    ".ah-ov{position:fixed;inset:0;background:rgba(15,30,53,.45);backdrop-filter:blur(3px);z-index:1500;display:none;align-items:center;justify-content:center;padding:16px}" +
    ".ah-box{background:#fff;border-radius:16px;width:min(760px,96vw);max-height:90vh;overflow:auto;border-top:3px solid #C9A24B;font-family:Inter,system-ui,sans-serif;color:#14213D;box-shadow:0 24px 70px rgba(15,30,53,.3)}" +
    ".ah-hd{display:flex;align-items:center;padding:18px 22px 10px;border-bottom:1px solid #F0ECE2}.ah-hd h3{font:600 17px Lexend,sans-serif;margin:0}.ah-x{all:unset;cursor:pointer;margin-left:auto;font-size:20px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9px}.ah-x:hover{background:#FBF9F4}" +
    ".ah-sum{display:flex;gap:10px;flex-wrap:wrap;padding:14px 22px}.ah-k{flex:1;min-width:120px;background:#FBF9F4;border:1px solid #F0ECE2;border-radius:10px;padding:10px 12px}.ah-k b{display:block;font:600 20px Lexend,sans-serif}.ah-k span{font-size:11px;color:#8B909B;text-transform:uppercase;letter-spacing:.06em}" +
    ".ah-warn{margin:0 22px 12px;padding:10px 14px;border-radius:10px;background:#FCECEA;border:1px solid #F3C9C4;font-size:12.5px;line-height:1.5}" +
    ".ah-t{width:100%;border-collapse:collapse;font-size:12.5px}.ah-t th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8B909B;padding:8px 22px;background:#FBF9F4;border-bottom:1px solid #E7E1D3}.ah-t td{padding:8px 22px;border-bottom:1px solid #F0ECE2;font-variant-numeric:tabular-nums}.ah-bad{color:#B42318;font-weight:600}";
  document.head.appendChild(css);

  var ov = document.createElement("div"); ov.className = "ah-ov";
  ov.innerHTML = '<div class="ah-box"><div class="ah-hd"><h3>🩺 Amazon API health — today</h3><button type="button" class="ah-x" id="ahX">×</button></div><div id="ahBody"></div></div>';
  document.body.appendChild(ov);
  $("ahX").onclick = function () { ov.style.display = "none"; };
  ov.addEventListener("click", function (e) { if (e.target === ov) ov.style.display = "none"; });

  function color(p) { return p < 2 ? "#2FA36B" : p < 5 ? "#C9A24B" : "#E5484D"; }
  function paint() {
    var b = $("ahPill"); if (!b) return;
    var t = data && data.today;
    if (!t || !t.calls) { b.innerHTML = '<span class="ah-dot"></span>API health'; return; }
    b.innerHTML = '<span class="ah-dot" style="background:' + color(t.errPct) + '"></span>API errors ' + t.errPct + "%";
    b.title = t.calls + " Amazon calls today, " + t.bad + " failed";
  }
  function show() {
    var d = data || {}, t = d.today || {}, st = d.stats || {}, bl = d.blocked || {};
    var ops = Object.keys(st).sort(function (a, b) { return st[b].calls - st[a].calls; });
    var paused = Object.keys(bl).filter(function (k) { return bl[k].until > Date.now(); });
    var h = '<div class="ah-sum"><div class="ah-k"><span>Calls</span><b>' + (t.calls || 0) + '</b></div><div class="ah-k"><span>Errors</span><b style="color:' + color(t.errPct || 0) + '">' + (t.errPct || 0) + '%</b></div><div class="ah-k"><span>Stopped before sending</span><b>' + (t.skipped || 0) + "</b></div></div>";
    if (paused.length) h += '<div class="ah-warn">⛔ <b>Paused — no permission from Amazon:</b> ' + paused.map(function (k) { return esc(k.split(".")[0]) + " (until " + new Date(bl[k].until).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) + ")"; }).join(", ") + ".<br>Starts working by itself after Amazon approves the role and the new token is saved.</div>";
    h += '<table class="ah-t"><tr><th>Operation</th><th>Calls</th><th>OK</th><th>Too fast</th><th>No permission</th><th>Not found</th><th>Other</th></tr>';
    ops.forEach(function (k) { var o = st[k], c = function (n) { return n ? '<span class="ah-bad">' + n + "</span>" : "0"; };
      h += "<tr><td>" + esc(k) + "</td><td>" + o.calls + "</td><td>" + o.ok + "</td><td>" + c(o.e429) + "</td><td>" + c(o.e403) + "</td><td>" + c(o.e404) + "</td><td>" + c(o.other) + "</td></tr>"; });
    if (!ops.length) h += '<tr><td colspan="7" style="text-align:center;color:#8B909B;padding:30px">No data yet — appears after the next sync.</td></tr>';
    $("ahBody").innerHTML = h + "</table>"; ov.style.display = "flex";
  }
  function load() { if (!db()) return; db().collection("spapiSnapshots").doc(acct() + "_guard").get().then(function (d) { data = d.exists ? d.data() : null; paint(); }).catch(function () {}); }
  function addBtn() {
    var r = $("spRefreshBtn"); if (!r) return false; if ($("ahPill")) return true;
    var b = document.createElement("button"); b.type = "button"; b.id = "ahPill"; b.className = "ah-pill"; b.onclick = show;
    r.parentNode.insertBefore(b, r); paint(); return true;
  }
  var n = 0, t = setInterval(function () { if ((addBtn() && db()) || ++n > 60) { clearInterval(t); if (db()) setTimeout(load, 2500); } }, 500);
  document.addEventListener("click", function (e) { if (e.target.closest("#spapiAccountSwitcherWrap button[data-acct]")) setTimeout(load, 400); }, true);
})();
