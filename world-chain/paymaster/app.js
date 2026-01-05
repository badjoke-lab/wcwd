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
        // Put your real schema here later.
        user: "0x0000000000000000000000000000000000000000",
        action: "sponsorGas",
        data: {}
      }
    };
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
    if (!url) return showStatus("warn", "RPC URL is empty.");
    save();

    try {
      showStatus("info", "RPC calling...");
      const chainId = await rpcCall(url, "eth_chainId", []);
      const gasPrice = await rpcCall(url, "eth_gasPrice", []);
      const gwei = toGwei(gasPrice);
      setOut(
        [
          "RPC OK",
          `chainId: ${chainId}`,
          `gasPrice: ${gasPrice}` + (gwei !== null ? ` (~${gwei.toFixed(3)} gwei)` : ""),
        ].join("\n")
      );
      showStatus("success", "RPC OK.");
    } catch (e) {
      setOut(String(e && e.message ? e.message : e));
      showStatus("error", "RPC failed (maybe CORS).");
    }
  });

  btnSponsorPing.addEventListener("click", async () => {
    clearOut();
    const url = sponsorUrl.value.trim();
    if (!url) return showStatus("warn", "Sponsor endpoint is empty.");
    save();

    const payload = sampleSponsorPayload();
    try {
      showStatus("info", "POSTing sample...");
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      setOut(`HTTP ${res.status}\n\n${text}`);
      showStatus(res.ok ? "success" : "error", res.ok ? "Sponsor OK." : "Sponsor returned error.");
    } catch (e) {
      setOut(String(e && e.message ? e.message : e));
      showStatus("error", "Sponsor POST failed (CORS/network).");
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
