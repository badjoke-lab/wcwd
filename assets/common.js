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

(function () {
  "use strict";

  var SUPPORT_BY_PATH = {
    "/": {
      title: "Support WCWD",
      text: "WCWD is free to use, but the data engine, history worker, and API maintenance have real infrastructure costs.",
      anchor: "main"
    },
    "/world-chain/monitor/": {
      title: "Support the Monitor",
      text: "The Monitor uses server-owned summaries, Workers Cron, and bounded history. Support helps keep this free public dashboard running.",
      anchor: "main"
    },
    "/world-chain/sell-impact/": {
      title: "Support Sell Impact",
      text: "If this estimate helped, consider supporting WCWD so the free Sell Impact tool can keep improving.",
      anchor: "#conclusionCard"
    },
    "/world-chain/ecosystem/": {
      title: "Support the Ecosystem Directory",
      text: "WCWD keeps this ecosystem directory free and best-effort. Support helps maintain data quality and public tooling.",
      anchor: "main"
    }
  };

  function normalizePath(pathname) {
    var p = pathname || "/";
    if (!p.endsWith("/")) p += "/";
    return p;
  }

  function makeSupportCard(config) {
    var section = document.createElement("section");
    section.className = "card support-card";
    section.setAttribute("aria-label", config.title);
    section.setAttribute("data-wcwd-support-card", "true");
    section.innerHTML = [
      '<p class="card-title">' + config.title + '</p>',
      '<p class="muted small">' + config.text + '</p>',
      '<p><a class="btn donate-primary" href="/donate/">Support WCWD</a></p>'
    ].join("");
    return section;
  }

  function insertAfter(target, node) {
    if (!target || !target.parentNode) return false;
    target.parentNode.insertBefore(node, target.nextSibling);
    return true;
  }

  function insertBeforeEnd(target, node) {
    if (!target) return false;
    target.appendChild(node);
    return true;
  }

  function injectSupportCard() {
    try {
      if (document.querySelector('[data-wcwd-support-card="true"]')) return;
      var path = normalizePath(location.pathname);
      var config = SUPPORT_BY_PATH[path];
      if (!config) return;
      var card = makeSupportCard(config);

      if (config.anchor && config.anchor.charAt(0) === "#") {
        var target = document.querySelector(config.anchor);
        if (insertAfter(target, card)) return;
      }

      var main = document.querySelector("main");
      if (main) {
        var cards = main.querySelectorAll(".card");
        var after = cards.length ? cards[cards.length - 1] : null;
        if (after && insertAfter(after, card)) return;
        insertBeforeEnd(main, card);
      }
    } catch (_e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectSupportCard);
  else injectSupportCard();
})();

(function () {
  "use strict";

  function injectDonateCopy() {
    try {
      var path = location.pathname || "/";
      if (path !== "/donate/" && path !== "/donate/index.html") return;
      if (document.querySelector('[data-wcwd-donate-copy="true"]')) return;

      var main = document.querySelector("main");
      if (!main) return;

      var firstCard = main.querySelector(".card");
      var section = document.createElement("section");
      section.className = "card support-card";
      section.setAttribute("data-wcwd-donate-copy", "true");
      section.innerHTML = [
        '<p class="card-title">What your support funds</p>',
        '<p class="muted small">WCWD is a free, independent, unofficial Worldcoin / World Chain / World ID toolkit. Support helps keep the data engine, history worker, and public tools online.</p>',
        '<ul class="list">',
          '<li>Cloudflare paid infrastructure</li>',
          '<li>Workers Cron and bounded KV history</li>',
          '<li>World Chain Monitor maintenance</li>',
          '<li>Sell Impact and ecosystem data improvements</li>',
          '<li>World ID builder tools</li>',
        '</ul>',
        '<p class="muted small">Support is optional. WCWD is independent and unofficial. Nothing on this site is financial advice.</p>'
      ].join("");

      if (firstCard && firstCard.parentNode) {
        firstCard.parentNode.insertBefore(section, firstCard);
      } else {
        main.appendChild(section);
      }
    } catch (_e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectDonateCopy);
  else injectDonateCopy();
})();

(function () {
  "use strict";

  var SITE = "https://wcwd.badjoke-lab.com";
  var ORG = {
    "@type": "Organization",
    "@id": SITE + "/#organization",
    "name": "BadJoke-Lab",
    "url": SITE + "/",
    "description": "Independent maintainer of the unofficial WCWD Worldcoin, World Chain, and World ID toolkit."
  };

  var TOOL_ROUTES = {
    "/world-chain/monitor/": ["WCWD World Chain Monitor", "Monitor World Chain health, WLD market context, gas, activity, alerts, events, and bounded history using best-effort server-owned summaries.", "FinanceApplication"],
    "/world-chain/sell-impact/": ["WCWD World Chain Sell Impact", "Estimate token sell impact, conservative max sell size, pool depth, liquidity risk, and rough exit conditions using public pool snapshots.", "FinanceApplication"],
    "/world-chain/ecosystem/": ["WCWD World Chain Ecosystem Directory", "Browse World Chain tokens, dApps, infrastructure, oracle-related entries, and curated ecosystem links from a best-effort directory.", "ReferenceApplication"],
    "/world-chain/oracles/": ["WCWD World Chain Oracle Feed Tester", "Test oracle feed responses through same-origin API support and browser fallback for World Chain builder workflows.", "DeveloperApplication"],
    "/world-chain/paymaster/": ["WCWD World Chain Paymaster Preflight", "Check paymaster and sponsor endpoint readiness with same-origin RPC preflight, validation notes, and browser fallback.", "DeveloperApplication"],
    "/world-id/wizard/": ["WCWD World ID Integration Wizard", "Generate frontend and backend template snippets for World ID integration workflows.", "DeveloperApplication"],
    "/world-id/debugger/": ["WCWD World ID Proof Debugger", "Inspect and diagnose World ID proof JSON structure safely in the browser.", "DeveloperApplication"],
    "/world-id/playground/": ["WCWD World ID Verifier Playground", "Generate verifier request examples and test browser-based World ID proof requests with clear CORS feedback.", "DeveloperApplication"]
  };

  var BREADCRUMBS = {
    "/about/": ["About"],
    "/donate/": ["Support"],
    "/world-chain/": ["World Chain"],
    "/world-chain/monitor/": ["World Chain", "Monitor"],
    "/world-chain/sell-impact/": ["World Chain", "Sell Impact"],
    "/world-chain/ecosystem/": ["World Chain", "Ecosystem"],
    "/world-chain/oracles/": ["World Chain", "Oracles"],
    "/world-chain/paymaster/": ["World Chain", "Paymaster"],
    "/world-id/": ["World ID"],
    "/world-id/wizard/": ["World ID", "Wizard"],
    "/world-id/debugger/": ["World ID", "Debugger"],
    "/world-id/playground/": ["World ID", "Playground"]
  };

  function normalizePath(pathname) {
    var p = pathname || "/";
    if (!p.endsWith("/")) p += "/";
    return p;
  }

  function addJsonLd(data, id) {
    if (document.querySelector('script[data-wcwd-jsonld="' + id + '"]')) return;
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-wcwd-jsonld", id);
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function breadcrumbJson(names, path) {
    var items = [{ name: "Home", url: SITE + "/" }];
    var running = "";
    names.forEach(function (name) {
      if (name === "World Chain") running = "/world-chain/";
      else if (name === "World ID") running = "/world-id/";
      else running = path;
      items.push({ name: name, url: SITE + running });
    });
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items.map(function (item, index) {
        return {
          "@type": "ListItem",
          "position": index + 1,
          "name": item.name,
          "item": item.url
        };
      })
    };
  }

  function injectStructuredData() {
    try {
      var path = normalizePath(location.pathname);
      var url = SITE + path;

      if (path === "/") {
        addJsonLd({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": SITE + "/#website",
          "name": "WCWD",
          "url": SITE + "/",
          "description": "Unofficial Worldcoin toolkit for World Chain monitoring, WLD market context, Sell Impact checks, ecosystem browsing, and World ID builder workflows.",
          "publisher": { "@id": ORG["@id"] }
        }, "website");
        addJsonLd(Object.assign({ "@context": "https://schema.org" }, ORG), "organization");
        return;
      }

      if (TOOL_ROUTES[path]) {
        addJsonLd({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": TOOL_ROUTES[path][0],
          "url": url,
          "applicationCategory": TOOL_ROUTES[path][2],
          "operatingSystem": "Web",
          "isAccessibleForFree": true,
          "description": TOOL_ROUTES[path][1],
          "publisher": { "@id": ORG["@id"] }
        }, "webapp");
      }

      if (BREADCRUMBS[path]) {
        addJsonLd(breadcrumbJson(BREADCRUMBS[path], path), "breadcrumb");
      }
    } catch (_e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectStructuredData);
  else injectStructuredData();
})();
