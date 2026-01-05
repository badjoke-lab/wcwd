(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const btnCheckAll = $("btnCheckAll");
  const btnClear = $("btnClear");
  const btnAdd = $("btnAdd");
  const btnResetSaved = $("btnResetSaved");

  const newName = $("newName");
  const newUrl = $("newUrl");

  const tbody = $("tbody");

  function showStatus(type, msg) {
    const mount = $("statusMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  const LS_KEY = "wcwd.infra.status.endpoints";

  function normalizeUrl(u) {
    const s = (u || "").trim();
    if (!s) return "";
    return s;
  }

  function getSaved() {
    const arr = WCWDCommon.lsGet(LS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function setSaved(arr) {
    WCWDCommon.lsSet(LS_KEY, arr);
  }

  // Defaults (always included)
  function getDefaults() {
    const origin = window.location.origin;
    return [
      { id: "pages-root", name: "WCWD Pages (root)", url: origin + "/" , fixed: true },
      { id: "pages-api-hello", name: "WCWD Pages /api/hello", url: origin + "/api/hello", fixed: true },
      { id: "history-worker", name: "History Worker (base)", url: "https://wcwd-history.badjoke-lab.workers.dev/api/version", fixed: true },
    ];
  }

  function allEndpoints() {
    const defaults = getDefaults();
    const saved = getSaved().map((x, i) => ({
      id: x.id || ("saved-" + i),
      name: x.name || ("Saved " + (i + 1)),
      url: x.url || "",
      fixed: false,
    }));
    // filter invalid
    const cleaned = saved.filter(x => x.url && typeof x.url === "string");
    return defaults.concat(cleaned);
  }

  const results = new Map(); // id -> { ok, status, ms, at, note }

  function fmtMs(ms) {
    if (ms == null) return "-";
    if (ms < 1000) return ms.toFixed(0) + " ms";
    return (ms / 1000).toFixed(2) + " s";
  }

  function fmtTime(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  function render() {
    tbody.innerHTML = "";
    const eps = allEndpoints();

    for (const ep of eps) {
      const tr = document.createElement("tr");

      const r = results.get(ep.id) || null;

      const tdName = document.createElement("td");
      tdName.textContent = ep.name;

      const tdUrl = document.createElement("td");
      const a = document.createElement("a");
      a.href = ep.url;
      a.textContent = ep.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      tdUrl.appendChild(a);

      const tdStatus = document.createElement("td");
      if (!r) {
        tdStatus.innerHTML = '<span class="badge">-</span>';
      } else if (r.ok) {
        tdStatus.innerHTML = '<span class="badge ok">OK</span> ' + (r.status != null ? String(r.status) : "");
      } else {
        tdStatus.innerHTML = '<span class="badge bad">FAIL</span> ' + (r.status != null ? String(r.status) : "");
      }

      const tdMs = document.createElement("td");
      tdMs.textContent = r ? fmtMs(r.ms) : "-";

      const tdAt = document.createElement("td");
      tdAt.textContent = r ? fmtTime(r.at) : "-";

      const tdAct = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "btn secondary";
      btn.type = "button";
      btn.textContent = "Check";
      btn.addEventListener("click", () => checkOne(ep));
      tdAct.appendChild(btn);

      if (!ep.fixed) {
        const del = document.createElement("button");
        del.className = "btn ghost";
        del.type = "button";
        del.textContent = "Remove";
        del.style.marginLeft = "8px";
        del.addEventListener("click", () => removeSaved(ep.id));
        tdAct.appendChild(del);
      }

      tr.appendChild(tdName);
      tr.appendChild(tdUrl);
      tr.appendChild(tdStatus);
      tr.appendChild(tdMs);
      tr.appendChild(tdAt);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);

      // optional note row
      if (r && r.note) {
        const tr2 = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.className = "muted small";
        td.style.paddingTop = "6px";
        td.style.paddingBottom = "10px";
        td.textContent = "note: " + r.note;
        tr2.appendChild(td);
        tbody.appendChild(tr2);
      }
    }
  }

  async function tryFetch(url) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const t1 = performance.now();
      return {
        ok: res.ok,
        status: res.status,
        ms: t1 - t0,
        note: res.ok ? "" : ("HTTP " + res.status),
      };
    } catch (e) {
      const t1 = performance.now();
      const msg = (e && e.message) ? e.message : String(e);
      return { ok: false, status: null, ms: t1 - t0, note: msg };
    }
  }

  async function checkOne(ep) {
    showStatus("info", "Checking: " + ep.name);
    const r = await tryFetch(ep.url);
    results.set(ep.id, { ...r, at: new Date().toISOString() });
    render();
    showStatus(r.ok ? "success" : "error", (r.ok ? "OK: " : "FAIL: ") + ep.name);
  }

  async function checkAll() {
    const eps = allEndpoints();
    showStatus("info", "Checking all endpoints...");
    for (const ep of eps) {
      // sequential (safe for rate limits)
      const r = await tryFetch(ep.url);
      results.set(ep.id, { ...r, at: new Date().toISOString() });
      render();
    }
    showStatus("success", "Done.");
  }

  function addSaved() {
    const name = (newName.value || "").trim() || "Custom Endpoint";
    const url = normalizeUrl(newUrl.value);
    if (!url) return showStatus("warn", "URL is empty.");

    const id = "saved-" + Math.random().toString(16).slice(2);
    const saved = getSaved();
    saved.push({ id, name, url });
    setSaved(saved);

    newName.value = "";
    newUrl.value = "";

    showStatus("success", "Added.");
    render();
  }

  function removeSaved(id) {
    const saved = getSaved().filter(x => x.id !== id);
    setSaved(saved);
    results.delete(id);
    showStatus("warn", "Removed.");
    render();
  }

  function resetSaved() {
    setSaved([]);
    // keep results for defaults only
    for (const k of Array.from(results.keys())) {
      if (String(k).startsWith("saved-")) results.delete(k);
    }
    showStatus("warn", "Saved endpoints reset.");
    render();
  }

  function clearResults() {
    results.clear();
    showStatus("warn", "Results cleared.");
    render();
  }

  btnCheckAll.addEventListener("click", checkAll);
  btnClear.addEventListener("click", clearResults);
  btnAdd.addEventListener("click", addSaved);
  btnResetSaved.addEventListener("click", resetSaved);

  render();
})();
