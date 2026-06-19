(() => {
  const targets = {
    tps_spike: document.getElementById("serverAlertSpike"),
    tps_drop: document.getElementById("serverAlertDrop"),
    gas_high: document.getElementById("serverAlertHighGas"),
  };

  function format(value, digits) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
  }

  function renderDecision(decision) {
    const target = targets[decision?.id];
    if (!target) return;
    if (!decision || decision.state === "insufficient_data") {
      target.textContent = "Insufficient data";
      target.title = "The server-owned policy does not have enough baseline samples.";
      return;
    }
    if (!decision.active) {
      target.textContent = "Clear";
      target.title = `${decision.label}: ratio ${format(decision.ratio, 3)}.`;
      return;
    }
    const digits = decision.id === "gas_high" ? 6 : 2;
    target.textContent = `Active · ${format(decision.current, digits)} / ${format(decision.baseline, digits)}`;
    target.title = `${decision.label}: threshold ${decision.threshold_ratio}, ratio ${format(decision.ratio, 3)}.`;
  }

  function render(summary) {
    const decisions = Array.isArray(summary?.alerts?.decisions) ? summary.alerts.decisions : [];
    for (const id of Object.keys(targets)) {
      renderDecision(decisions.find((item) => item?.id === id) || { id, state: "insufficient_data" });
    }
    document.documentElement.dataset.alertPolicySource = decisions.length ? "summary-api" : "unavailable";
  }

  document.addEventListener("wcwd:summary", (event) => render(event.detail));
  document.addEventListener("DOMContentLoaded", () => render(null), { once: true });
})();
