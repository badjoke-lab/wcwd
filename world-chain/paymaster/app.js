(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const rpcUrl = $("rpcUrl");
  const sponsorUrl = $("sponsorUrl");
  const appId = $("appId");
  const note = $("note");

  const btnSave = $("btnSave");
  const btnReset = $("btnReset");

  const btnRpcPing = $("btnRpcPing");
  const btnSponsorPing = $("btnSponsorPing");
  const btnCopyCurlRpc = $("btnCopyCurlRpc");
  const btnCopyCurlSponsor = $("btnCopyCurlSponsor");
  const btnCopyChecklist = $("btnCopyChecklist");

  const out = $("out");
  const checklist = $("checklist");

  function showStatus(type, msg) {
    const mount = $("statusMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function setOut(text) {
    out.style.display = "block";
    out.textContent = text;
  }
  function clearOut() {
    out.style.display = "none";
    out.textContent = "";
  }

  function lsKey() { return "wcwd.worldchain.paymaster"; }

  function getState() {
    const d = WCWDCommon.lsGet(lsKey(), {});
    return (d && typeof d === "object") ? d : {};
  }

  function save() {
    const d = {
      rpcUrl: rpcUrl.value.trim(),
      sponsorUrl: sponsorUrl.value.trim(),
      appId: appId.value.trim(),
      note: note.value.trim(),
      savedAt: new Date().toISOString(),
    };
    WCWDCommon.lsSet(lsKey(), d);
    renderChecklist();
    showStatus("success", "Saved to browser.");
  }

  function load() {
    const d = getState();
    rpcUrl.value = d.rpcUrl || "";
    sponsorUrl.value = d.sponsorUrl || "";
    appId.value = d.appId || "";
    note.value = d.note || "";
    renderChecklist();
  }

  function reset() {
    WCWDCommon.lsSet(lsKey(), {});
    rpcUrl.value = "";
    sponsorUrl.value = "";
    appId.value = "";
    note.value = "";
    clearOut();
    renderChecklist();
    showStatus("warn", "Reset done.");
  }

  async function rpcCall(url, method, params) {
    const body = { jsonrpc: "2.0", id: 1, method, params: params || [] };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    if (json && json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    return json.result;
  }

  function toGwei(hexWei) {
    try {
      const wei = BigInt(hexWei);
      const gwei = Number(wei) / 1e9;
      return gwei;
    } catch {
      return null;
    }
  }

  function curlRpc(url) {
    const body = JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_chainId", params:[] }).replaceAll("'", "'\"'\"'");
    return `curl -sS '${url}' -H 'content-type: application/json' --data '${body}'`;
  }

  function curlSponsor(url, payload) {
    const body = JSON.stringify(payload).replaceAll("'", "'\"'\"'");
    return `curl -sS -X POST '${url}' -H 'content-type: application/json' --data '${body}'`;
  }

  function sampleSponsorPayload() {
    const d = getState();
    return {
      appId: d.appId || "wcwd-dev",
      chain: "worldchain",
      purpose: "paymaster-preflight",
      note: d.note || "",
      timestamp: new Date().toISOString(),
      sample: {
        user: "0x0000000000000000000000000000000000000000",
        action: "sponsorGas",
        data: {}
      }
    };
  }

  function preflightUrl() {
    const u = new URL("/api/paymaster/preflight", window.location.origin);
    const rpc = rpcUrl.value.trim();
    const sponsor = sponsorUrl.value.trim();
    if (rpc) u.searchParams.set("rpc", rpc);
    if (sponsor) u.searchParams.set("sponsor", sponsor);
    return u.toString();
  }

  async function fetchPreflight() {
    const res = await fetch(preflightUrl(), { headers: { accept: "application/json" } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Preflight returned non-JSON: ${text.slice(0, 120)}`); }
    if (!res.ok) throw new Error((json.notes && json.notes[0]) || `Preflight HTTP ${res.status}`);
    return json;
  }

  function renderPreflight(payload) {
    const rpc = payload.rpc || null;
    const sponsor = payload.sponsor || null;
    const lines = [
      "Paymaster Preflight",
      "-------------------",
      "source: same-origin API",
      `state: ${payload.state || "unknown"}`,
      `generated_at: ${payload.generated_at || "—"}`,
      "",
      "RPC",
      `host: ${rpc && rpc.host ? rpc.host : "—"}`,
      `ok: ${rpc ? String(rpc.ok !== false) : "not provided"}`,
      `chainId: ${rpc && rpc.chainId ? rpc.chainId : "—"}`,
      `gasPrice: ${rpc && rpc.gasPrice ? rpc.gasPrice : "—"}`,
      `gasPriceGwei: ${rpc && rpc.gasPriceGwei != null ? Number(rpc.gasPriceGwei).toFixed(3) : "—"}`,
      rpc && rpc.error ? `error: ${rpc.error}` : "",
      "",
      "Sponsor",
      `provided: ${sponsor ? String(!!sponsor.provided) : "false"}`,
      `host: ${sponsor && sponsor.host ? sponsor.host : "—"}`,
      `valid: ${sponsor ? String(!!sponsor.valid) : "false"}`,
      `note: ${sponsor && sponsor.note ? sponsor.note : "—"}`,
      "",
      `notes: ${(payload.notes || []).join(", ") || "none"}`,
      "",
      `retention: ${(payload.retention && payload.retention.stored && payload.retention.stored.count) ? `${payload.retention.stored.count}/${payload.retention.stored.cap}` : "not stored"}`,
      "",
      "Safety: same-origin preflight validates sponsor URL only. It does not POST to arbitrary sponsor endpoints from the Worker."
    ].filter(Boolean);
    setOut(lines.join("\n"));
  }

  function renderChecklist() {
    const d = getState();
    checklist.value = [
      "World Chain Paymaster Preflight Checklist",
      "----------------------------------------",
      `- [ ] Identify sponsor approach: (endpoint / contract / AA)`,
      `- [ ] RPC reachable: ${d.rpcUrl || "(empty)"}`,
      `- [ ] Sponsor endpoint reachable: ${d.sponsorUrl || "(empty)"}`,
      `- [ ] App/Project ID: ${d.appId || "(empty)"}`,
      "- [ ] Confirm error handling: show status + response body",
      "- [ ] Confirm rate limits + retries policy",
      "- [ ] Add basic monitoring (status endpoint / logs)",
      "",
      "Notes:",
      (d.note || "(none)").trim()
    ].join("\n");
  }

  btnSave.addEventListener("click", save);
  btnReset.addEventListener("click", reset);

  btnRpcPing.addEventListener("click", async () => {
    clearOut();
    const url = rpcUrl.value.trim();
    save();

    if (!url) return showStatus("warn", "RPC URL is empty.");

    try {
      showStatus("info", "Checking via same-origin preflight API...");
      const payload = await fetchPreflight();
      renderPreflight(payload);
      showStatus(payload.state === "fresh" ? "success" : "warn", `Preflight completed via same-origin API (${payload.state || "unknown"}).`);
    } catch (apiError) {
      try {
        showStatus("info", "Same-origin preflight failed. Trying browser RPC fallback...");
        const chainId = await rpcCall(url, "eth_chainId", []);
        const gasPrice = await rpcCall(url, "eth_gasPrice", []);
        const gwei = toGwei(gasPrice);
        setOut(
          [
            "RPC OK",
            "source: browser RPC fallback",
            `chainId: ${chainId}`,
            `gasPrice: ${gasPrice}` + (gwei !== null ? ` (~${gwei.toFixed(3)} gwei)` : ""),
            "",
            `same-origin API error: ${apiError && apiError.message ? apiError.message : apiError}`,
          ].join("\n")
        );
        showStatus("warn", "Same-origin preflight failed; browser RPC fallback succeeded.");
      } catch (fallbackError) {
        setOut([
          "Paymaster Preflight Failed",
          "-------------------------",
          `same-origin API: ${apiError && apiError.message ? apiError.message : apiError}`,
          `browser RPC fallback: ${fallbackError && fallbackError.message ? fallbackError.message : fallbackError}`,
        ].join("\n"));
        showStatus("error", "Preflight failed on both same-origin API and browser fallback.");
      }
    }
  });

  btnSponsorPing.addEventListener("click", async () => {
    clearOut();
    const url = sponsorUrl.value.trim();
    if (!url) return showStatus("warn", "Sponsor endpoint is empty.");
    save();

    try {
      showStatus("info", "Validating sponsor URL via same-origin preflight API...");
      const payload = await fetchPreflight();
      renderPreflight(payload);
      if (payload.sponsor && payload.sponsor.valid) {
        showStatus("success", "Sponsor URL validated. Worker did not POST to it.");
      } else {
        showStatus("warn", "Sponsor URL is missing or invalid.");
      }
    } catch (apiError) {
      const payload = sampleSponsorPayload();
      try {
        showStatus("info", "Same-origin validation failed. Browser POST fallback is running...");
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        setOut(`Browser Sponsor POST fallback\nHTTP ${res.status}\n\n${text}\n\nSame-origin API error: ${apiError && apiError.message ? apiError.message : apiError}`);
        showStatus(res.ok ? "warn" : "error", res.ok ? "Browser sponsor POST succeeded after API validation failed." : "Browser sponsor POST returned error.");
      } catch (fallbackError) {
        setOut([
          "Sponsor Preflight Failed",
          "------------------------",
          `same-origin API: ${apiError && apiError.message ? apiError.message : apiError}`,
          `browser POST fallback: ${fallbackError && fallbackError.message ? fallbackError.message : fallbackError}`,
        ].join("\n"));
        showStatus("error", "Sponsor check failed on both same-origin validation and browser fallback.");
      }
    }
  });

  btnCopyCurlRpc.addEventListener("click", async () => {
    const url = rpcUrl.value.trim();
    if (!url) return showStatus("warn", "RPC URL is empty.");
    const ok = await WCWDCommon.copyText(curlRpc(url));
    showStatus(ok ? "success" : "error", ok ? "Copied RPC curl." : "Copy failed.");
  });

  btnCopyCurlSponsor.addEventListener("click", async () => {
    const url = sponsorUrl.value.trim();
    if (!url) return showStatus("warn", "Sponsor endpoint is empty.");
    const ok = await WCWDCommon.copyText(curlSponsor(url, sampleSponsorPayload()));
    showStatus(ok ? "success" : "error", ok ? "Copied Sponsor curl." : "Copy failed.");
  });

  btnCopyChecklist.addEventListener("click", async () => {
    const ok = await WCWDCommon.copyText(checklist.value);
    showStatus(ok ? "success" : "error", ok ? "Copied checklist." : "Copy failed.");
  });

  load();
})();
