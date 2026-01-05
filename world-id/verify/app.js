(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const proofJson = $("proofJson");
  const actionId = $("actionId");
  const signal = $("signal");
  const endpoint = $("endpoint");
  const credentialType = $("credentialType");

  const btnParse = $("btnParse");
  const btnClear = $("btnClear");
  const btnCopyPayload = $("btnCopyPayload");
  const btnCopyCurl = $("btnCopyCurl");
  const btnPost = $("btnPost");

  const payloadOut = $("payloadOut");
  const postResult = $("postResult");

  function show(type, msg) {
    const mount = $("statusMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function parseJson(raw) {
    try { return { ok: true, v: JSON.parse(raw) }; }
    catch (e) { return { ok: false, e: String(e && e.message ? e.message : e) }; }
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return undefined;
  }

  function normalize(input) {
    const root = input || {};
    const nested = (root.proof && typeof root.proof === "object") ? root.proof : null;

    const merkle_root =
      pick(root, ["merkle_root", "merkleRoot", "root"]) ??
      pick(nested, ["merkle_root", "merkleRoot", "root"]);

    const nullifier_hash =
      pick(root, ["nullifier_hash", "nullifierHash", "nullifier"]) ??
      pick(nested, ["nullifier_hash", "nullifierHash", "nullifier"]);

    const proof =
      pick(root, ["proof", "zkProof", "proof_hex", "proofHex"]) ??
      pick(nested, ["proof", "zkProof", "proof_hex", "proofHex"]);

    const actionFromJson = pick(root, ["action_id", "actionId", "action"]);
    const signalFromJson = pick(root, ["signal", "external_nullifier", "externalNullifier"]);
    const credFromJson = pick(root, ["credential_type", "credentialType", "credential"]);

    return {
      action_id: actionId.value.trim() || (actionFromJson ? String(actionFromJson) : ""),
      signal: signal.value.trim() || (signalFromJson ? String(signalFromJson) : ""),
      credential_type: credentialType.value.trim() || (credFromJson ? String(credFromJson) : ""),
      merkle_root: merkle_root,
      nullifier_hash: nullifier_hash,
      proof: proof
    };
  }

  function validate(p) {
    const missing = [];
    if (!p.merkle_root) missing.push("merkle_root");
    if (!p.nullifier_hash) missing.push("nullifier_hash");
    if (!p.proof) missing.push("proof");
    return { ok: missing.length === 0, missing };
  }

  function fmt(obj) { return JSON.stringify(obj, null, 2); }

  function curl(url, payload) {
    const body = JSON.stringify(payload).replaceAll("'", "'\"'\"'");
    return `curl -sS -X POST '${url}' \\\n  -H 'content-type: application/json' \\\n  --data '${body}'`;
  }

  function setPostResult(text) {
    postResult.style.display = "block";
    postResult.textContent = text;
  }
  function clearPostResult() {
    postResult.style.display = "none";
    postResult.textContent = "";
  }

  function loadEndpoint() {
    const v = WCWDCommon.lsGet("wcwd.worldid.verify.endpoint", "");
    endpoint.value = typeof v === "string" ? v : "";
  }
  function saveEndpoint() {
    WCWDCommon.lsSet("wcwd.worldid.verify.endpoint", endpoint.value.trim());
  }

  btnParse.addEventListener("click", () => {
    clearPostResult();
    const raw = proofJson.value.trim();
    if (!raw) return show("error", "Paste proof JSON first.");

    const r = parseJson(raw);
    if (!r.ok) return show("error", "Invalid JSON: " + r.e);

    const payload = normalize(r.v);
    const v = validate(payload);

    payloadOut.value = fmt(payload);
    if (v.ok) show("success", "OK: payload looks valid (shape check).");
    else show("warn", "Missing fields: " + v.missing.join(", "));
  });

  btnClear.addEventListener("click", () => {
    proofJson.value = "";
    payloadOut.value = "";
    clearPostResult();
    show("", "");
  });

  btnCopyPayload.addEventListener("click", async () => {
    if (!payloadOut.value.trim()) return show("warn", "Generate payload first.");
    const ok = await WCWDCommon.copyText(payloadOut.value);
    show(ok ? "success" : "error", ok ? "Copied payload." : "Copy failed.");
  });

  btnCopyCurl.addEventListener("click", async () => {
    const url = endpoint.value.trim();
    if (!url) return show("warn", "Set Verify Endpoint first.");
    if (!payloadOut.value.trim()) return show("warn", "Generate payload first.");
    const cmd = curl(url, JSON.parse(payloadOut.value));
    const ok = await WCWDCommon.copyText(cmd);
    show(ok ? "success" : "error", ok ? "Copied curl." : "Copy failed.");
  });

  btnPost.addEventListener("click", async () => {
    const url = endpoint.value.trim();
    if (!url) return show("warn", "Verify Endpoint is empty.");

    if (!payloadOut.value.trim()) return show("warn", "Generate payload first.");
    saveEndpoint();

    let payload;
    try { payload = JSON.parse(payloadOut.value); }
    catch { return show("error", "Payload JSON broken (unexpected)."); }

    const v = validate(payload);
    if (!v.ok) show("warn", "Missing fields: " + v.missing.join(", ") + " (POST may fail)");
    else show("info", "Posting...");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      setPostResult(`HTTP ${res.status}\n\n${text}`);
      show(res.ok ? "success" : "error", res.ok ? "POST success." : "POST failed.");
    } catch (e) {
      setPostResult(String(e && e.message ? e.message : e));
      show("error", "POST error: " + String(e && e.message ? e.message : e));
    }
  });

  loadEndpoint();
})();
