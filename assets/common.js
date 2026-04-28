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

/* WCWD common.js: stable route metadata / nav polish */
(function(){
  "use strict";

  var SITE = "https://wcwd.badjoke-lab.com";
  var OG_IMAGE = SITE + "/og.png";
  var ROUTES = {
    "/": {
      title: "WCWD — World Chain & World ID Builder Toolkit",
      description: "Lightweight World Chain snapshots, WLD market context, Sell Impact, and World ID builder tools."
    },
    "/about/": {
      title: "WCWD — About",
      description: "About WCWD, disclaimer, privacy notes, and the independent project scope."
    },
    "/donate/": {
      title: "WCWD — Donate",
      description: "Support WCWD development and maintenance."
    },
    "/world-chain/": {
      title: "WCWD — World Chain",
      description: "World Chain hub for Monitor, Sell Impact, Ecosystem, Oracles, and Paymaster pages."
    },
    "/world-chain/monitor/": {
      title: "WCWD — World Chain Monitor",
      description: "Detailed World Chain monitor with summary freshness, network stats, WLD market data, trends, alerts, events, and daily history."
    },
    "/world-chain/sell-impact/": {
      title: "WCWD — Sell Impact",
      description: "Estimate World Chain token sell impact, pool depth, conservative max sell size, and liquidity risk."
    },
    "/world-chain/ecosystem/": {
      title: "WCWD — World Chain Ecosystem",
      description: "World Chain ecosystem directory for tokens, dApps, infra, and oracle-related entries curated in ecosystem.json."
    },
    "/world-chain/oracles/": {
      title: "WCWD — Oracle Feed Tester",
      description: "Oracle feed tester via JSON-RPC eth_call with same-origin API support and browser fallback."
    },
    "/world-chain/paymaster/": {
      title: "WCWD — World Chain Paymaster Preflight",
      description: "Paymaster and sponsor endpoint preflight helper with same-origin RPC checks and browser fallback."
    },
    "/world-id/": {
      title: "WCWD — World ID Hub",
      description: "World ID builder hub for wizard, debugger, and playground tools."
    },
    "/world-id/wizard/": {
      title: "WCWD — World ID Wizard",
      description: "Static World ID integration wizard for frontend and backend template outputs."
    },
    "/world-id/debugger/": {
      title: "WCWD — World ID Debugger",
      description: "Inspect and diagnose World ID proof JSON structure safely in-browser."
    },
    "/world-id/playground/": {
      title: "WCWD — World ID Playground",
      description: "Generate verifier request examples and optionally run browser-based fetch tests for World ID proofs."
    }
  };

  function normalizePath(pathname){
    var p = pathname || "/";
    if(!p.endsWith("/")) p += "/";
    return p;
  }

  function ensureMeta(selector, create){
    var el = document.head.querySelector(selector);
    if(el) return el;
    el = create();
    document.head.appendChild(el);
    return el;
  }

  function setMetaName(name, content){
    var el = ensureMeta('meta[name="' + name + '"]', function(){
      var n = document.createElement('meta');
      n.setAttribute('name', name);
      return n;
    });
    el.setAttribute('content', content);
  }

  function setMetaProp(prop, content){
    var el = ensureMeta('meta[property="' + prop + '"]', function(){
      var n = document.createElement('meta');
      n.setAttribute('property', prop);
      return n;
    });
    el.setAttribute('content', content);
  }

  function setCanonical(href){
    var el = ensureMeta('link[rel="canonical"]', function(){
      var n = document.createElement('link');
      n.setAttribute('rel', 'canonical');
      return n;
    });
    el.setAttribute('href', href);
  }

  function removeSitemapExternalNav(){
    try{
      document.querySelectorAll('nav a[href="/test/"]').forEach(function(a){ a.remove(); });
    }catch(_){}
  }

  function applyMeta(){
    try{
      var path = normalizePath(location.pathname);
      var data = ROUTES[path];
      if(!data) return;
      var url = SITE + path;
      document.title = data.title;
      setMetaName('description', data.description);
      setCanonical(url);
      setMetaProp('og:type', 'website');
      setMetaProp('og:site_name', 'WCWD');
      setMetaProp('og:title', data.title);
      setMetaProp('og:description', data.description);
      setMetaProp('og:url', url);
      setMetaProp('og:image', OG_IMAGE);
      setMetaName('twitter:card', 'summary');
      setMetaName('twitter:title', data.title);
      setMetaName('twitter:description', data.description);
      setMetaName('twitter:image', OG_IMAGE);
    }catch(_){}
  }

  function run(){
    removeSitemapExternalNav();
    applyMeta();
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

