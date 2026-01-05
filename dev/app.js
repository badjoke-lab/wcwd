/* WCWD Dev Hub: sitemap renderer + filter */
(function () {
  const PAGES = [
    { title: "Dashboard", desc: "Main dashboard (ecosystem + metrics).", url: "/" },
    { title: "Dev Hub", desc: "Sitemap and docs links.", url: "/dev/" },

    { title: "World ID (Hub)", desc: "World ID hub.", url: "/world-id/" },
    { title: "World ID — Verify", desc: "Verify reference/playground page.", url: "/world-id/verify/" },
    { title: "World ID — Migration", desc: "Migration reference page.", url: "/world-id/migration/" },

    { title: "World Chain (Hub)", desc: "World Chain hub.", url: "/world-chain/" },
    { title: "World Chain — Paymaster", desc: "Paymaster reference page.", url: "/world-chain/paymaster/" },
    { title: "World Chain — Oracles", desc: "Oracles reference page.", url: "/world-chain/oracles/" },

    { title: "Infra — Status", desc: "Endpoint checker page.", url: "/infra/status/" },

    { title: "Mini Apps — Preflight", desc: "Preflight checks for mini apps.", url: "/mini-apps/preflight/" },

    { title: "404 (test)", desc: "Not Found page (for debugging).", url: "/404.html" },
  ];

  const $ = (id) => document.getElementById(id);
  const listEl = $("list");
  const emptyEl = $("empty");
  const qEl = $("q");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function card(p) {
    return `
      <div class="col-6">
        <div class="card" style="margin:0;">
          <p class="card-title">${esc(p.title)}</p>
          <p class="muted small">${esc(p.desc || "")}</p>
          <p style="margin-top:10px;">
            <a class="btn" href="${esc(p.url)}">Open</a>
            <button class="btn btn-ghost" data-copy="${esc(p.url)}" type="button">Copy URL</button>
          </p>
          <p class="muted small" style="margin-top:8px;">${esc(p.url)}</p>
        </div>
      </div>
    `;
  }

  function render(filterText) {
    const q = (filterText || "").trim().toLowerCase();
    const rows = PAGES.filter((p) => {
      if (!q) return true;
      const hay = `${p.title} ${p.desc || ""} ${p.url}`.toLowerCase();
      return hay.includes(q);
    });

    listEl.innerHTML = rows.map(card).join("");
    emptyEl.style.display = rows.length ? "none" : "block";

    // copy handlers
    listEl.querySelectorAll("button[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const path = btn.getAttribute("data-copy") || "/";
        const full = new URL(path, location.origin).toString();
        try {
          await navigator.clipboard.writeText(full);
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy URL"), 900);
        } catch {
          // fallback: prompt
          window.prompt("Copy URL:", full);
        }
      });
    });
  }

  // chips
  document.querySelectorAll("[data-chip]").forEach((b) => {
    b.addEventListener("click", () => {
      const word = b.getAttribute("data-chip") || "";
      qEl.value = word;
      render(word);
      qEl.focus();
    });
  });

  qEl.addEventListener("input", () => render(qEl.value));
  render("");
})();
