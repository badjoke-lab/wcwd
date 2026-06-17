(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const feedAddr = $("feedAddr");
  const out = $("out");

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
    return "wcwd.worldchain.oracles";
  }

  function isAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value || "");
  }

  function save() {
    WCWDCommon.lsSet(storageKey(), {
      feedAddr: feedAddr.value.trim(),
      savedAt: new Date().toISOString(),
    });
    showStatus("success", "Feed address saved in this browser.");
  }

  function load() {
    const saved = WCWDCommon.lsGet(storageKey(), {});
    feedAddr.value = saved && typeof saved === "object" ? saved.feedAddr || "" : "";
  }

  function reset() {
    WCWDCommon.lsSet(storageKey(), {});
    feedAddr.value = "";
    clearOut();
    showStatus("warn", "Saved feed address cleared.");
  }

  function apiUrl(address) {
    const url = new URL("/api/oracles/feed", window.location.origin);
    url.searchParams.set("feed", address);
    return url;
  }

  async function fetchFeed(address) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(apiUrl(address), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("API returned invalid JSON");
      }
      if (!response.ok || !body.ok) {
        throw new Error((body.notes && body.notes[0]) || body.error || `API HTTP ${response.status}`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  function render(payload) {
    const result = payload.result || {};
    setOut([
      "Oracle Feed Result",
      "------------------",
      `source: ${payload.source || "same-origin API"}`,
      `state: ${payload.state || "unknown"}`,
      `rpc host: ${payload.rpc_host || "—"}`,
      `feed: ${payload.feed || "—"}`,
      `generated_at: ${payload.generated_at || "—"}`,
      "",
      `decimals: ${result.decimals ?? "—"}`,
      `roundId: ${result.roundId ?? "—"}`,
      `answer (raw): ${result.answer_raw ?? "—"}`,
      `answer (scaled): ${result.answer_scaled ?? "—"}`,
      `startedAt (unix): ${result.startedAt ?? "—"}`,
      `updatedAt (unix): ${result.updatedAt ?? "—"}`,
      `answeredInRound: ${result.answeredInRound ?? "—"}`,
      `age_sec: ${result.age_sec ?? "—"}`,
      "",
      `notes: ${(payload.notes || []).join(", ") || "none"}`,
      `stored: ${payload.retention && payload.retention.stored === false ? "no" : "unknown"}`,
    ].join("\n"));
  }

  $("btnSave").addEventListener("click", save);
  $("btnReset").addEventListener("click", reset);

  $("btnFetch").addEventListener("click", async () => {
    clearOut();
    const address = feedAddr.value.trim();
    if (!isAddress(address)) {
      showStatus("error", "Feed address must be 0x followed by 40 hexadecimal characters.");
      return;
    }
    save();
    showStatus("info", "Fetching through the fixed same-origin World Chain RPC path...");
    try {
      const payload = await fetchFeed(address);
      render(payload);
      showStatus(payload.state === "fresh" ? "success" : "warn", `Feed check completed (${payload.state || "unknown"}).`);
    } catch (error) {
      const reason = error && error.name === "AbortError" ? "Request timed out" : error && error.message ? error.message : String(error);
      setOut(`Oracle Feed Fetch Failed\n------------------------\n${reason}`);
      showStatus("error", reason);
    }
  });

  $("btnCopyCurl").addEventListener("click", async () => {
    const address = feedAddr.value.trim();
    if (!isAddress(address)) {
      showStatus("error", "Feed address is invalid.");
      return;
    }
    const command = `curl -sS '${apiUrl(address).toString()}' -H 'accept: application/json'`;
    const copied = await WCWDCommon.copyText(command);
    showStatus(copied ? "success" : "error", copied ? "Copied same-origin API curl." : "Copy failed.");
  });

  load();
})();
