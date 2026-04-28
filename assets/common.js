// WCWD-HEADER-INJECT:DISABLED (build-time partials now provide deterministic header/footer)

/* WCWD common.js
   Shared helpers, responsive nav, and metadata fallback.
   Static HTML head remains the SEO source of truth; this file only backfills older pages. */

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
      return raw == null ? fallback : JSON.parse(raw);
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
    if (header && header.parentNode) header.parentNode.insertBefore(host, header.nextSibling);
    else document.body.insertBefore(host, document.body.firstChild);
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
    const text = typeof textOrEl === "string" ? textOrEl : (textOrEl && "value" in textOrEl ? String(textOrEl.value) : "");
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
      if (!ok) {
        showStatus("error", "Copy failed. Please select and copy manually.");
        return;
      }
      buttonEl.textContent = "Copied";
      setTimeout(function () { buttonEl.textContent = original; }, 900);
    });
  }

  window.WCWDCommon = { escapeText, lsGet, lsSet, showStatus, copyText, bindCopyButton };
})();

(function () {
  "use strict";

  function initMobileNav() {
    try {
      var header = document.querySelector(".header");
      var inner = document.querySelector(".header-inner") || (header && header.querySelector(".container"));
      var nav = document.querySelector("[data-site-nav]") || (header && header.querySelector(".nav"));
      if (!header || !inner || !nav) return;

      nav.setAttribute("data-site-nav", "");
      nav.id = nav.id || "wcwd-site-nav";

      var btn = document.querySelector("[data-nav-toggle]");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-toggle";
        btn.setAttribute("data-nav-toggle", "");
        btn.setAttribute("aria-controls", nav.id);
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", "Open navigation");
        btn.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
        inner.insertBefore(btn, nav);
      }

      function setOpen(open) {
        nav.classList.toggle("is-open", !!open);
        btn.classList.toggle("is-open", !!open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        document.body.classList.toggle("nav-open", !!open);
      }

      setOpen(false);
      btn.addEventListener("click", function () { setOpen(!nav.classList.contains("is-open")); });
      document.addEventListener("click", function (e) {
        if (!nav.classList.contains("is-open")) return;
        var t = e.target;
        if (btn.contains(t) || nav.contains(t)) return;
        setOpen(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && nav.classList.contains("is-open")) setOpen(false);
      });
      nav.addEventListener("click", function (e) {
        var a = e.target && e.target.closest ? e.target.closest("a") : null;
        if (a) setOpen(false);
      });
      window.addEventListener("resize", function () {
        if (window.matchMedia && window.matchMedia("(min-width: 769px)").matches) setOpen(false);
      });
    } catch (_e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMobileNav);
  else initMobileNav();
})();

(function () {
  "use strict";

  var SITE = "https://wcwd.badjoke-lab.com";
  var OG_IMAGE = SITE + "/og.png";
  var ROUTES = {
    "/": {
      title: "WCWD — Worldcoin, World Chain, WLD & World ID Tools",
      description: "Unofficial Worldcoin toolkit for World Chain monitoring, WLD market context, Sell Impact checks, ecosystem browsing, and World ID builder workflows."
    },
    "/about/": {
      title: "WCWD — About This Unofficial Worldcoin Toolkit",
      description: "About WCWD, an independent Worldcoin, World Chain, and World ID toolkit with best-effort data, disclaimers, and privacy notes."
    },
    "/donate/": {
      title: "WCWD — Support This Free Worldcoin Toolkit",
      description: "Support WCWD's free Worldcoin, World Chain, WLD, and World ID tools, including data engine maintenance, Workers Cron, and bounded history."
    },
    "/world-chain/": {
      title: "WCWD — World Chain Tools",
      description: "World Chain tool hub for Monitor, Sell Impact, Ecosystem, Oracles, and Paymaster utilities."
    },
    "/world-chain/monitor/": {
      title: "WCWD — World Chain Monitor for WLD, Gas, Activity & History",
      description: "Monitor World Chain health, WLD market context, gas, activity, alerts, events, and bounded history using WCWD's best-effort server-owned summaries."
    },
    "/world-chain/sell-impact/": {
      title: "WCWD — World Chain Sell Impact & Liquidity Risk Tool",
      description: "Estimate World Chain token sell impact, conservative max sell size, pool depth, liquidity risk, and rough exit conditions using public pool snapshots."
    },
    "/world-chain/ecosystem/": {
      title: "WCWD — World Chain Ecosystem Directory",
      description: "Browse World Chain tokens, dApps, infrastructure, oracle-related entries, and curated ecosystem links from WCWD's best-effort directory."
    },
    "/world-chain/oracles/": {
      title: "WCWD — World Chain Oracle Feed Tester",
      description: "Test oracle feed responses through same-origin API support and browser fallback for World Chain builder workflows."
    },
    "/world-chain/paymaster/": {
      title: "WCWD — World Chain Paymaster Preflight",
      description: "Check paymaster and sponsor endpoint readiness with same-origin RPC preflight, validation notes, and browser fallback."
    },
    "/world-id/": {
      title: "WCWD — World ID Builder Tools",
      description: "World ID builder hub for integration snippets, proof debugging, and verifier request testing."
    },
    "/world-id/wizard/": {
      title: "WCWD — World ID Integration Wizard",
      description: "Generate frontend and backend template snippets for World ID integration workflows."
    },
    "/world-id/debugger/": {
      title: "WCWD — World ID Proof Debugger",
      description: "Inspect and diagnose World ID proof JSON structure safely in the browser."
    },
    "/world-id/playground/": {
      title: "WCWD — World ID Verifier Playground",
      description: "Generate verifier request examples and test browser-based World ID proof requests with clear CORS feedback."
    }
  };

  function normalizePath(pathname) {
    var p = pathname || "/";
    if (!p.endsWith("/")) p += "/";
    return p;
  }

  function ensureMeta(selector, create) {
    var el = document.head.querySelector(selector);
    if (el) return el;
    el = create();
    document.head.appendChild(el);
    return el;
  }

  function setMetaName(name, content) {
    var el = ensureMeta('meta[name="' + name + '"]', function () {
      var n = document.createElement("meta");
      n.setAttribute("name", name);
      return n;
    });
    el.setAttribute("content", content);
  }

  function setMetaProp(prop, content) {
    var el = ensureMeta('meta[property="' + prop + '"]', function () {
      var n = document.createElement("meta");
      n.setAttribute("property", prop);
      return n;
    });
    el.setAttribute("content", content);
  }

  function setCanonical(href) {
    var el = ensureMeta('link[rel="canonical"]', function () {
      var n = document.createElement("link");
      n.setAttribute("rel", "canonical");
      return n;
    });
    el.setAttribute("href", href);
  }

  function removeSitemapExternalNav() {
    try { document.querySelectorAll('nav a[href="/test/"]').forEach(function (a) { a.remove(); }); } catch (_e) {}
  }

  function applyMeta() {
    try {
      var path = normalizePath(location.pathname);
      var data = ROUTES[path];
      if (!data) return;
      var url = SITE + path;
      document.title = data.title;
      setMetaName("description", data.description);
      setCanonical(url);
      setMetaProp("og:type", "website");
      setMetaProp("og:site_name", "WCWD");
      setMetaProp("og:title", data.title);
      setMetaProp("og:description", data.description);
      setMetaProp("og:url", url);
      setMetaProp("og:image", OG_IMAGE);
      setMetaName("twitter:card", "summary_large_image");
      setMetaName("twitter:title", data.title);
      setMetaName("twitter:description", data.description);
      setMetaName("twitter:image", OG_IMAGE);
    } catch (_e) {}
  }

  function run() {
    removeSitemapExternalNav();
    applyMeta();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
