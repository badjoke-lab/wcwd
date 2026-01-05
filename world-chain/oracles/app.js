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

  // int256 decode (two's complement)
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

    // trim trailing zeros in fractional part
    let fracStr = frac.toString().padStart(Number(d), "0");
    fracStr = fracStr.replace(/0+$/, "");
    return (neg ? "-" : "") + whole.toString() + (fracStr ? "." + fracStr : "");
  }

  // selectors (keccak-256 first 4 bytes)
  const SEL_DECIMALS = "0x313ce567";        // decimals()
  const SEL_LATEST = "0xfeaf968c";          // latestRoundData()

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
      showStatus("info", "Fetching decimals()...");
      const decHex = await ethCall(url, addr, SEL_DECIMALS);
      const decChunks = chunk64(decHex);
      const decimals = Number(hexToBigInt(decChunks[0] || "0"));

      showStatus("info", "Fetching latestRoundData()...");
      const latestHex = await ethCall(url, addr, SEL_LATEST);
      const c = chunk64(latestHex);

      // latestRoundData returns: (uint80, int256, uint256, uint256, uint80)
      const roundId = hexToBigInt(c[0] || "0");
      const answer = hexToSignedBigInt(c[1] || "0");
      const startedAt = hexToBigInt(c[2] || "0");
      const updatedAt = hexToBigInt(c[3] || "0");
      const answeredInRound = hexToBigInt(c[4] || "0");

      const scaled = formatScaledInt(answer, decimals);

      setOut([
        "Oracle Feed Result",
        "------------------",
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
        "Note: If this fails, likely CORS or the contract is not AggregatorV3Interface."
      ].join("\n"));

      showStatus("success", "Fetched successfully.");
    } catch (e) {
      setOut(String(e && e.message ? e.message : e));
      showStatus("error", "Fetch failed (maybe CORS / wrong contract).");
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
