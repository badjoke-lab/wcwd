/* WCWD common.js (Spec v3)
   Shared helpers: clipboard, localStorage, status banner, optional escaping.
   No external deps. */

(function () {
  "use strict";

  function escapeText(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (_e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function ensureStatusHost() {
    let host = document.getElementById("wcwd-status");
    if (host) return host;

    host = document.createElement("div");
    host.id = "wcwd-status";

    const header = document.querySelector("header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(host, header.nextSibling);
    } else {
      document.body.insertBefore(host, document.body.firstChild);
    }
    return host;
  }

  function showStatus(type, message) {
    const host = ensureStatusHost();
    host.innerHTML = "";
    if (!message) return;

    const box = document.createElement("div");
    box.className = "status " + (type || "info");
    box.textContent = String(message);
    host.appendChild(box);
  }

  async function copyText(textOrEl) {
    const text =
      typeof textOrEl === "string"
        ? textOrEl
        : (textOrEl && "value" in textOrEl ? String(textOrEl.value) : "");

    if (!text) return false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_e) {}
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (_e) {
      return false;
    }
  }

  function bindCopyButton(buttonEl, textareaEl) {
    if (!buttonEl || !textareaEl) return;
    const original = buttonEl.textContent || "Copy";

    buttonEl.addEventListener("click", async function () {
      const ok = await copyText(textareaEl);
      if (ok) {
        buttonEl.textContent = "Copied";
        setTimeout(function () {
          buttonEl.textContent = original;
        }, 900);
      } else {
        showStatus("error", "Copy failed. Please select and copy manually.");
      }
    });
  }

  window.WCWDCommon = {
    escapeText,
    lsGet,
    lsSet,
    showStatus,
    copyText,
    bindCopyButton,
  };
})();
