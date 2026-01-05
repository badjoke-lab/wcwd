(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const btnRun = $("btnRun");
  const btnClear = $("btnClear");
  const tbody = $("tbody");

  function badge(el, kind, text) {
    el.className = "badge" + (kind ? " " + kind : "");
    el.textContent = text;
  }

  function setText(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }

  function show(type, msg) {
    const mount = $("mount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function fmtMs(ms) {
    if (ms == null) return "-";
    if (ms < 1000) return ms.toFixed(0) + " ms";
    return (ms / 1000).toFixed(2) + " s";
  }

  function clearTable() {
    tbody.innerHTML = "";
  }

  function addRow(item) {
    const tr = document.createElement("tr");

    const tdTarget = document.createElement("td");
    tdTarget.textContent = item.target;

    const tdUrl = document.createElement("td");
    const a = document.createElement("a");
    a.href = item.url;
    a.textContent = item.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    tdUrl.appendChild(a);

    const tdRes = document.createElement("td");
    tdRes.innerHTML = item.ok
      ? '<span class="badge ok">OK</span>' + (item.status ? " " + item.status : "")
      : '<span class="badge bad">FAIL</span>' + (item.status ? " " + item.status : "");

    const tdMs = document.createElement("td");
    tdMs.textContent = fmtMs(item.ms);

    const tdNote = document.createElement("td");
    tdNote.textContent = item.note || "";

    tr.appendChild(tdTarget);
    tr.appendChild(tdUrl);
    tr.appendChild(tdRes);
    tr.appendChild(tdMs);
    tr.appendChild(tdNote);

    tbody.appendChild(tr);
  }

  async function check(url) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const t1 = performance.now();
      return { ok: res.ok, status: String(res.status), ms: t1 - t0, note: res.ok ? "" : ("HTTP " + res.status) };
    } catch (e) {
      const t1 = performance.now();
      const msg = (e && e.message) ? e.message : String(e);
      return { ok: false, status: "", ms: t1 - t0, note: msg };
    }
  }

  function buildTargets() {
    const origin = window.location.origin;
    return [
      { target: "Pages root", url: origin + "/" },
      { target: "Pages /api/hello", url: origin + "/api/hello" },
      { target: "History Worker /api/version", url: "https://wcwd-history.badjoke-lab.workers.dev/api/version" },
      { target: "Infra Status (page)", url: origin + "/infra/status/" },
    ];
  }

  function fillSnippets() {
    const origin = window.location.origin;
    const fetchSnip =
`// fetch template (no-store)
async function ping(url){
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return { ok: res.ok, status: res.status, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e), ms: performance.now() - t0 };
  }
}
await ping("${origin}/api/hello");`;

    const jsonSnip =
`[
  { "name": "Pages /api/hello", "url": "${origin}/api/hello" },
  { "name": "History Worker", "url": "https://wcwd-history.badjoke-lab.workers.dev/api/version" }
]`;

    $("snipFetch").textContent = fetchSnip;
    $("snipJson").textContent = jsonSnip;
  }

  function fillEnv() {
    const origin = window.location.origin;
    setText("siteOrigin", origin);
    setText("ua", navigator.userAgent);

    const isHttps = window.location.protocol === "https:";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    badge($("isHttps"), isHttps ? "ok" : "bad", isHttps ? "YES" : "NO");
    badge($("isLocal"), isLocal ? "warn" : "", isLocal ? "YES" : "NO");

    const docsRoot = "https://docs.world.org/";
    const docsWorldId = "https://docs.world.org/world-id";
    const docsWorldChain = "https://docs.world.org/world-chain";

    const a1 = $("docsRoot"); a1.href = docsRoot;
    const a2 = $("docsWorldId"); a2.href = docsWorldId;
    const a3 = $("docsWorldChain"); a3.href = docsWorldChain;
  }

  async function run() {
    clearTable();
    const targets = buildTargets();
    show("info", "Running preflight checks...");
    for (const t of targets) {
      const r = await check(t.url);
      addRow({ target: t.target, url: t.url, ...r });
    }
    show("success", "Done.");
  }

  btnRun.addEventListener("click", run);
  btnClear.addEventListener("click", () => {
    show("warn", "Cleared.");
    clearTable();
  });

  fillEnv();
  fillSnippets();
})();
