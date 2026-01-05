/* WCWD World ID Migration Helper (static memo + checklist generator) */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const appId = $("appId");
  const actionId = $("actionId");
  const verificationLevel = $("verificationLevel");
  const verifyEndpoint = $("verifyEndpoint");
  const notes = $("notes");

  const btnSave = $("btnSave");
  const btnReset = $("btnReset");
  const btnCopy = $("btnCopy");

  const btnCopyChecklist = $("btnCopyChecklist");
  const checklistOut = $("checklistOut");

  function showInlineStatus(type, msg) {
    const mount = $("statusMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function load() {
    const data = WCWDCommon.lsGet("wcwd.worldid.migration", {});
    if (data && typeof data === "object") {
      appId.value = data.appId || "";
      actionId.value = data.actionId || "";
      verificationLevel.value = data.verificationLevel || "";
      verifyEndpoint.value = data.verifyEndpoint || "";
      notes.value = data.notes || "";
    }
    renderChecklist();
  }

  function save() {
    const data = {
      appId: appId.value.trim(),
      actionId: actionId.value.trim(),
      verificationLevel: verificationLevel.value.trim(),
      verifyEndpoint: verifyEndpoint.value.trim(),
      notes: notes.value.trim(),
      savedAt: new Date().toISOString(),
    };
    WCWDCommon.lsSet("wcwd.worldid.migration", data);
    showInlineStatus("success", "Saved to your browser.");
    renderChecklist();
  }

  function reset() {
    WCWDCommon.lsSet("wcwd.worldid.migration", {});
    appId.value = "";
    actionId.value = "";
    verificationLevel.value = "";
    verifyEndpoint.value = "";
    notes.value = "";
    renderChecklist();
    showInlineStatus("warn", "Reset done (browser storage cleared for this tool).");
  }

  function summaryText() {
    const data = WCWDCommon.lsGet("wcwd.worldid.migration", {});
    const lines = [
      "WCWD — World ID Migration Summary",
      "--------------------------------",
      `App ID / Project ID: ${data.appId || "(empty)"}`,
      `Action ID: ${data.actionId || "(empty)"}`,
      `Verification Level: ${data.verificationLevel || "(empty)"}`,
      `Verify Endpoint: ${data.verifyEndpoint || "(empty)"}`,
      "",
      "Notes:",
      (data.notes || "(none)").trim(),
      "",
      `SavedAt: ${data.savedAt || "(unknown)"}`,
    ];
    return lines.join("\n");
  }

  function checklistText() {
    const data = WCWDCommon.lsGet("wcwd.worldid.migration", {});
    const a = data.actionId || "<ACTION_ID>";
    const v = data.verificationLevel || "<LEVEL>";
    const ep = data.verifyEndpoint || "<VERIFY_ENDPOINT>";
    const pid = data.appId || "<APP_ID>";

    return [
      "World ID Migration Checklist",
      "----------------------------",
      `- [ ] Decide identifiers: appId=${pid}, actionId=${a}, verificationLevel=${v}`,
      `- [ ] Ensure frontend uses the exact same actionId in IDKit config`,
      `- [ ] Ensure backend verifies proof for the same actionId & signal rules`,
      `- [ ] Verify endpoint configured: ${ep}`,
      "- [ ] Add logging for verify failures (HTTP status + body)",
      "- [ ] Confirm replay protection behavior (nullifier uniqueness) in backend",
      "- [ ] Confirm credential constraints (orb/device) if required",
      "- [ ] Add a smoke test: paste a sample proof → generate payload → POST → expect 200",
      "- [ ] Rollout: deploy backend first, then frontend; monitor errors",
      "",
      "Notes:",
      (data.notes || "").trim() || "(none)",
    ].join("\n");
  }

  function renderChecklist() {
    checklistOut.value = checklistText();
  }

  btnSave.addEventListener("click", save);
  btnReset.addEventListener("click", reset);

  btnCopy.addEventListener("click", async () => {
    const ok = await WCWDCommon.copyText(summaryText());
    showInlineStatus(ok ? "success" : "error", ok ? "Copied summary." : "Copy failed.");
  });

  btnCopyChecklist.addEventListener("click", async () => {
    const ok = await WCWDCommon.copyText(checklistOut.value);
    showInlineStatus(ok ? "success" : "error", ok ? "Copied checklist." : "Copy failed.");
  });

  // live updates
  [appId, actionId, verificationLevel, verifyEndpoint, notes].forEach((el) => {
    el.addEventListener("input", renderChecklist);
    el.addEventListener("change", renderChecklist);
  });

  load();
})();
