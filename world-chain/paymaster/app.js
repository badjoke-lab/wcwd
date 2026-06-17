(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const sponsorUrl = $("sponsorUrl");
  const appId = $("appId");
  const note = $("note");
  const out = $("out");
  const checklist = $("checklist");

  function showStatus(type, message) {
    const mount = $("statusMount");
    mount.innerHTML = "";
    if (!message) return;
    const element = document.createElement("div");
    element.className = `status ${type || "info"}`;
    element.textContent = message;
    mount.appendChild(element);
  }

  function setOut(text) {
    out.style.display = "block";
    out.textContent = text;
  }

  function clearOut() {
    out.style.display = "none";
    out.textContent = "";
  }

  function storageKey() {
    return "wcwd.worldchain.paymaster";
  }

  function getState() {
    const saved = WCWDCommon.lsGet(storageKey(), {});
    return saved && typeof saved === "object" ? saved : {};
  }

  function currentState() {
    return {
      sponsorUrl: sponsorUrl.value.trim(),
      appId: appId.value.trim(),
      note: note.value.trim(),
    };
  }

  function save() {
    WCWDCommon.lsSet(storageKey(), { ...currentState(), savedAt: new Date().toISOString() });
    renderChecklist();
    showStatus("success", "Template settings saved in this browser.");
  }

  function load() {
    const saved = getState();
    sponsorUrl.value = saved.sponsorUrl || "";
    appId.value = saved.appId || "";
    note.value = saved.note || "";
    renderChecklist();
  }

  function reset() {
    WCWDCommon.lsSet(storageKey(), {});
    sponsorUrl.value = "";
    appId.value = "";
    note.value = "";
    clearOut();
    renderChecklist();
    showStatus("warn", "Saved template settings cleared.");
  }

  function parseSponsorUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error("Sponsor endpoint must use HTTPS.");
      if (url.username || url.password) throw new Error("Sponsor endpoint must not contain URL credentials.");
      return url;
    } catch (error) {
      throw new Error(error && error.message ? error.message : "Sponsor endpoint is invalid.");
    }
  }

  function sampleSponsorPayload() {
    const state = currentState();
    return {
      appId: state.appId || "wcwd-dev",
      chain: "worldchain",
      purpose: "paymaster-preflight",
      note: state.note || "",
      timestamp: new Date().toISOString(),
      sample: {
        user: "0x0000000000000000000000000000000000000000",
        action: "sponsorGas",
        data: {},
      },
    };
  }

  function sponsorCurl(url, payload) {
    const body = JSON.stringify(payload).replaceAll("'", "'\"'\"'");
    return `curl -sS -X POST '${url.toString()}' -H 'content-type: application/json' --data '${body}'`;
  }

  async function fetchPreflight() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/paymaster/preflight", {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("Preflight returned invalid JSON");
      }
      if (!response.ok) throw new Error((body.notes && body.notes[0]) || body.error || `HTTP ${response.status}`);
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  function renderPreflight(payload) {
    const rpc = payload.rpc || {};
    const sponsor = payload.sponsor || {};
    setOut([
      "Paymaster Preflight",
      "-------------------",
      `source: ${payload.source || "same-origin API"}`,
      `state: ${payload.state || "unknown"}`,
      `generated_at: ${payload.generated_at || "—"}`,
      "",
      "World Chain RPC",
      `host: ${rpc.host || "—"}`,
      `ok: ${String(rpc.ok === true)}`,
      `chainId: ${rpc.chainId || "—"}`,
      `expectedChainId: ${rpc.expectedChainId || "—"}`,
      `chainMatches: ${String(rpc.chainMatches === true)}`,
      `gasPrice: ${rpc.gasPrice || "—"}`,
      `gasPriceGwei: ${rpc.gasPriceGwei != null ? Number(rpc.gasPriceGwei).toFixed(3) : "—"}`,
      rpc.error ? `error: ${rpc.error}` : "",
      "",
      "Sponsor endpoint",
      `server checked: ${String(sponsor.provided === true)}`,
      `note: ${sponsor.note || "not checked"}`,
      "",
      `notes: ${(payload.notes || []).join(", ") || "none"}`,
      `stored: ${payload.retention && payload.retention.stored === false ? "no" : "unknown"}`,
    ].filter(Boolean).join("\n"));
  }

  function renderChecklist() {
    const state = currentState();
    checklist.value = [
      "World Chain Paymaster Preflight Checklist",
      "----------------------------------------",
      "- [ ] Confirm World Chain RPC preflight is fresh",
      `- [ ] Review sponsor endpoint locally: ${state.sponsorUrl || "(empty)"}`,
      `- [ ] App/Project ID: ${state.appId || "(empty)"}`,
      "- [ ] Review the generated request body before running curl",
      "- [ ] Confirm sponsor authentication requirements",
      "- [ ] Confirm rate limits, retries, and error handling",
      "- [ ] Do not paste secrets into this page",
      "",
      "Notes:",
      state.note || "(none)",
    ].join("\n");
  }

  $("btnSave").addEventListener("click", save);
  $("btnReset").addEventListener("click", reset);

  $("btnRpcPing").addEventListener("click", async () => {
    clearOut();
    showStatus("info", "Checking the fixed World Chain RPC through WCWD...");
    try {
      const payload = await fetchPreflight();
      renderPreflight(payload);
      showStatus(payload.state === "fresh" ? "success" : "warn", `Preflight completed (${payload.state || "unknown"}).`);
    } catch (error) {
      const reason = error && error.name === "AbortError" ? "Request timed out" : error && error.message ? error.message : String(error);
      setOut(`Paymaster Preflight Failed\n-------------------------\n${reason}`);
      showStatus("error", reason);
    }
  });

  $("btnCopyCurlSponsor").addEventListener("click", async () => {
    try {
      const url = parseSponsorUrl(sponsorUrl.value.trim());
      const command = sponsorCurl(url, sampleSponsorPayload());
      const copied = await WCWDCommon.copyText(command);
      showStatus(copied ? "success" : "error", copied ? "Copied sponsor curl. Review it before running." : "Copy failed.");
    } catch (error) {
      showStatus("error", error && error.message ? error.message : String(error));
    }
  });

  $("btnCopyChecklist").addEventListener("click", async () => {
    const copied = await WCWDCommon.copyText(checklist.value);
    showStatus(copied ? "success" : "error", copied ? "Copied checklist." : "Copy failed.");
  });

  for (const input of [sponsorUrl, appId, note]) {
    input.addEventListener("input", renderChecklist);
  }

  load();
})();
