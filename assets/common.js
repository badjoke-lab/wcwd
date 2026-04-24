// WCWD-HEADER-INJECT:DISABLED (build-time partials now provide deterministic header/footer)

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

/* WCWD common.js: responsive header nav */
(function(){
  "use strict";

  function initMobileNav(){
    try{
      var header = document.querySelector('.header');
      var inner = document.querySelector('.header-inner') || (header && header.querySelector('.container'));
      var nav = document.querySelector('[data-site-nav]') || (header && header.querySelector('.nav'));
      if(!header || !inner || !nav) return;

      nav.setAttribute('data-site-nav', '');
      nav.id = nav.id || 'wcwd-site-nav';

      var btn = document.querySelector('[data-nav-toggle]');
      if(!btn){
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-toggle';
        btn.setAttribute('data-nav-toggle', '');
        btn.setAttribute('aria-controls', nav.id);
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Open navigation');
        btn.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
        inner.insertBefore(btn, nav);
      }

      function setOpen(open){
        nav.classList.toggle('is-open', !!open);
        btn.classList.toggle('is-open', !!open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        document.body.classList.toggle('nav-open', !!open);
      }

      setOpen(false);

      btn.addEventListener('click', function(){
        setOpen(!nav.classList.contains('is-open'));
      });

      document.addEventListener('click', function(e){
        if(!nav.classList.contains('is-open')) return;
        var t = e.target;
        if(btn.contains(t) || nav.contains(t)) return;
        setOpen(false);
      });

      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
      });

      nav.addEventListener('click', function(e){
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if(a) setOpen(false);
      });

      window.addEventListener('resize', function(){
        if(window.matchMedia && window.matchMedia('(min-width: 769px)').matches){
          setOpen(false);
        }
      });
    }catch(_){}
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();

