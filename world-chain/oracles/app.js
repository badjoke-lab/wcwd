(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const rpcUrl = $("rpcUrl");
  const feedAddr = $("feedAddr");

  const btnFetch = $("btnFetch");
  const btnCopyCurl = $("btnCopyCurl");
  const btnSave = $("btnSave");
  const btnReset = $("btnReset");

  const out = $("out");

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

  function lsKey() { return "wcwd.worldchain.oracles"; }

  function load() {
    const d = WCWDCommon.lsGet(lsKey(), {});
    if (d && typeof d === "object") {
      rpcUrl.value = d.rpcUrl || "";
      feedAddr.value = d.feedAddr || "";
    }
  }

  function save() {
    WCWDCommon.lsSet(lsKey(), {
      rpcUrl: rpcUrl.value.trim(),
      feedAddr: feedAddr.value.trim(),
      savedAt: new Date().toISOString(),
    });
    showStatus("success", "Saved to browser.");
  }

  function reset() {
    WCWDCommon.lsSet(lsKey(), {});
    rpcUrl.value = "";
    feedAddr.value = "";
    clearOut();
    showStatus("warn", "Reset done.");
  }

  async function rpc(url, method, params) {
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

  function isHexAddr(a) {
    return /^0x[a-fA-F0-9]{40}$/.test(a || "");
  }

  function strip0x(h) {
    return (h || "").startsWith("0x") ? h.slice(2) : (h || "");
  }

  function chunk64(hexNo0x) {
    const s = strip0x(hexNo0x);
    const out = [];
    for (let i = 0; i < s.length; i += 64) out.push(s.slice(i, i + 64));
    return out;
  }

  function hexToBigInt(h) {
    if (!h) return 0n;
    return BigInt("0x" + h);
  }

  function hexToSignedBigInt(h) {
    const x = hexToBigInt(h);
    const TWO_255 = 1n << 255n;
    const TWO_256 = 1n << 256n;
    return x >= TWO_255 ? (x - TWO_256) : x;
  }

  function formatScaledInt(answer, decimals) {
    const neg = answer < 0n;
    const a = neg ? -answer : answer;
    const d = BigInt(decimals);
    const base = 10n ** d;
    const whole = a / base;
    const frac = a % base;
    let fracStr = frac.toString().padStart(Number(d), "0");
    fracStr = fracStr.replace(/0+$/, "");
    return (neg ? "-" : "") + whole.toString() + (fracStr ? "." + fracStr : "");
  }

  const SEL_DECIMALS = "0x313ce567";
  const SEL_LATEST = "0xfeaf968c";

  async function ethCall(url, to, data) {
    return rpc(url, "eth_call", [{ to, data }, "latest"]);
  }

  function curl(url, to, data) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"]
    }).replaceAll("'", "'\"'\"'");
    return `curl -sS '${url}' -H 'content-type: application/json' --data '${body}'`;
  }

  function apiUrl(url, addr) {
    const u = new URL("/api/oracles/feed", window.location.origin);
    u.searchParams.set("rpc", url);
    u.searchParams.set("feed", addr);
    return u.toString();
  }

  async function fetchViaSameOrigin(url, addr) {
    const res = await fetch(apiUrl(url, addr), { headers: { accept: "application/json" } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`API returned non-JSON: ${text.slice(0, 120)}`); }
    if (!res.ok) throw new Error((json.notes && json.notes[0]) || `API HTTP ${res.status}`);
    if (!json.ok) throw new Error((json.notes && json.notes[0]) || "oracle_api_unavailable");
    return json;
  }

  function renderApiResult(payload) {
    const r = payload.result || {};
    setOut([
      "Oracle Feed Result",
      "------------------",
      "source: same-origin API",
      `state: ${payload.state || "unknown"}`,
      `rpc host: ${payload.rpc_host || "—"}`,
      `feed: ${payload.feed || "—"}`,
      `generated_at: ${payload.generated_at || "—"}`,
      "",
      `decimals: ${r.decimals ?? "—"}`,
      `roundId: ${r.roundId ?? "—"}`,
      `answer (raw): ${r.answer_raw ?? "—"}`,
      `answer (scaled): ${r.answer_scaled ?? "—"}`,
      `startedAt (unix): ${r.startedAt ?? "—"}`,
      `updatedAt (unix): ${r.updatedAt ?? "—"}`,
      `answeredInRound: ${r.answeredInRound ?? "—"}`,
      `age_sec: ${r.age_sec ?? "—"}`,
      "",
      `notes: ${(payload.notes || []).join(", ") || "none"}`,
      "",
      "Fallback: if the same-origin API fails, this page can still try the old browser eth_call path."
    ].join("\n"));
  }

  async function fetchViaBrowserRpc(url, addr) {
    showStatus("info", "Same-origin failed. Trying browser RPC fallback: decimals()...");
    const decHex = await ethCall(url, addr, SEL_DECIMALS);
    const decChunks = chunk64(decHex);
    const decimals = Number(hexToBigInt(decChunks[0] || "0"));

    showStatus("info", "Browser RPC fallback: latestRoundData()...");
    const latestHex = await ethCall(url, addr, SEL_LATEST);
    const c = chunk64(latestHex);

    const roundId = hexToBigInt(c[0] || "0");
    const answer = hexToSignedBigInt(c[1] || "0");
    const startedAt = hexToBigInt(c[2] || "0");
    const updatedAt = hexToBigInt(c[3] || "0");
    const answeredInRound = hexToBigInt(c[4] || "0");
    const scaled = formatScaledInt(answer, decimals);

    setOut([
      "Oracle Feed Result",
      "------------------",
      "source: browser RPC fallback",
      `feed: ${addr}`,
      `decimals: ${decimals}`,
      "",
      `roundId: ${roundId.toString()}`,
      `answer (raw): ${answer.toString()}`,
      `answer (scaled): ${scaled}`,
      `startedAt (unix): ${startedAt.toString()}`,
      `updatedAt (unix): ${updatedAt.toString()}`,
      `answeredInRound: ${answeredInRound.toString()}`,
      "",
      "Note: Browser fallback can fail because of CORS. The preferred path is /api/oracles/feed."
    ].join("\n"));
  }

  btnSave.addEventListener("click", save);
  btnReset.addEventListener("click", reset);

  btnFetch.addEventListener("click", async () => {
    clearOut();
    const url = rpcUrl.value.trim();
    const addr = feedAddr.value.trim();

    if (!url) return showStatus("warn", "RPC URL is empty.");
    if (!isHexAddr(addr)) return showStatus("error", "Feed address must be 0x + 40 hex chars.");

    save();

    try {
      showStatus("info", "Fetching via same-origin API...");
      const payload = await fetchViaSameOrigin(url, addr);
      renderApiResult(payload);
      showStatus(payload.state === "stale" ? "warn" : "success", `Fetched via same-origin API (${payload.state || "unknown"}).`);
    } catch (apiError) {
      try {
        await fetchViaBrowserRpc(url, addr);
        showStatus("warn", `Same-origin API failed; browser fallback succeeded. API: ${apiError && apiError.message ? apiError.message : apiError}`);
      } catch (fallbackError) {
        setOut([
          "Oracle Feed Fetch Failed",
          "------------------------",
          `same-origin API: ${apiError && apiError.message ? apiError.message : apiError}`,
          `browser fallback: ${fallbackError && fallbackError.message ? fallbackError.message : fallbackError}`,
          "",
          "Likely causes: invalid RPC URL, CORS, wrong feed contract, or the feed is not AggregatorV3Interface-compatible."
        ].join("\n"));
        showStatus("error", "Fetch failed on both same-origin API and browser fallback.");
      }
    }
  });

  btnCopyCurl.addEventListener("click", async () => {
    const url = rpcUrl.value.trim();
    const addr = feedAddr.value.trim();
    if (!url) return showStatus("warn", "RPC URL is empty.");
    if (!isHexAddr(addr)) return showStatus("error", "Feed address invalid.");
    const cmd = curl(url, addr, SEL_LATEST);
    const ok = await WCWDCommon.copyText(cmd);
    showStatus(ok ? "success" : "error", ok ? "Copied curl (latestRoundData)." : "Copy failed.");
  });

  load();
})();
