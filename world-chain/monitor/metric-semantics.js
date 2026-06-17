(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const unavailableIds = [
    "tx24h",
    "newAddr24h",
    "totalAddr",
    "wldChg24h",
    "wldMc",
    "wldVol",
    "wldSpark7d",
    "chartWld7d",
    "pctContract",
    "pctOther",
  ];
  const dailyIds = [
    "dailyDate",
    "dailyHealth",
    "dailyTpsMax",
    "dailyTpsMin",
    "dailyGasMax",
    "dailyWldUsdChange",
    "dailyWldJpyChange",
  ];

  function setText(id, value) {
    const element = byId(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function setUnavailable(id, reason) {
    const element = byId(id);
    if (!element) return;
    if (element.textContent !== "Unavailable") element.textContent = "Unavailable";
    element.title = reason;
  }

  function formatTime(value) {
    const ms = Date.parse(value || "");
    return Number.isFinite(ms) ? new Date(ms).toLocaleString() : "Unavailable";
  }

  function parseRaw() {
    const text = byId("raw")?.textContent?.trim();
    if (!text || text === "—") return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function enforceStaticSemantics() {
    for (const id of unavailableIds) {
      setUnavailable(id, "This value is not measured by the current WCWD data source.");
    }
    setText("tx24hNote", "No measured rolling 24-hour counter is available. TPS is not multiplied into a daily total.");
    setText("newAddrNote", "Unavailable: WCWD does not run a full address indexer.");
    setText("totalAddrNote", "Unavailable: WCWD does not run a full address indexer.");
  }

  function renderDaily(daily) {
    if (daily?.available === true && daily?.calendar_basis === "utc_calendar_day") {
      setText("dailyDate", `${daily.date} UTC`);
      setText("dailyNote", `Verified UTC calendar day: ${daily.day_start_utc} to ${daily.day_end_utc_exclusive} (exclusive).`);
      return;
    }
    for (const id of dailyIds) setUnavailable(id, "The stored daily record does not prove UTC calendar-day boundaries.");
    const reason = daily?.reason || "no_data";
    setText("dailyNote", `Unavailable: ${reason}. Legacy daily compacts are withheld unless their UTC day boundary is explicit.`);
  }

  function renderFromRaw() {
    enforceStaticSemantics();
    const payload = parseRaw();
    const latest = payload?.latest;
    setText("metricObservedAt", formatTime(latest?.observed_at || latest?.ts));
    setText("metricSource", latest?.source || (latest ? "Existing KV snapshot" : "Unavailable"));
    setText("tpsNote", Number.isFinite(latest?.tps)
      ? "Estimated from the sampled block window; not a chain-wide daily count."
      : "Unavailable: the latest snapshot has no TPS estimate.");
    setText("gasNote", Number.isFinite(latest?.gas_gwei)
      ? "Observed in the latest stored snapshot."
      : "Unavailable: the latest snapshot has no gas value.");
    renderDaily(payload?.daily);
  }

  const raw = byId("raw");
  if (raw) new MutationObserver(renderFromRaw).observe(raw, { childList: true, characterData: true, subtree: true });
  const tx24h = byId("tx24h");
  if (tx24h) new MutationObserver(enforceStaticSemantics).observe(tx24h, { childList: true, characterData: true, subtree: true });
  renderFromRaw();
})();
