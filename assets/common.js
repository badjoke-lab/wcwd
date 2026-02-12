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

/* WCWD common.js: mobile nav */
(function(){
  try{
    var btn = document.querySelector('[data-nav-toggle]');
    var nav = document.querySelector('[data-site-nav]');
    if(!btn || !nav) return;

    function setOpen(open){
      nav.classList.toggle('is-open', !!open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('nav-open', !!open);
    }

    // 初期は閉じる
    setOpen(false);

    btn.addEventListener('click', function(){
      var open = nav.classList.contains('is-open');
      setOpen(!open);
    });

    // 背景クリックで閉じる（navの外側）
    document.addEventListener('click', function(e){
      if(!nav.classList.contains('is-open')) return;
      var t = e.target;
      if(btn.contains(t) || nav.contains(t)) return;
      setOpen(false);
    });

    // ESCで閉じる
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
    });

    // リンククリックで閉じる（モバイル想定）
    nav.addEventListener('click', function(e){
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if(a) setOpen(false);
    });

    // 画面が広がったら強制クローズ（折返し事故防止）
    window.addEventListener('resize', function(){
      if(window.matchMedia && window.matchMedia('(min-width: 768px)').matches){
        setOpen(false);
      }
    });
  }catch(_){}
})();

