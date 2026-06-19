(() => {
  const originalCard = renderEcoCard;

  isWorldChainVerified = (item) => {
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    const verified = Number.isFinite(Date.parse(item?.verified_at || ""));
    const current = !item?.review_after || Date.now() <= Date.parse(`${item.review_after}T23:59:59Z`);
    const identity = (item?.contracts || []).some((entry) => Number(entry?.chainId) === 480)
      || normalizeText(item?.links?.explorer).includes("worldscan.org/address/")
      || (item?.type === "offchain" && item?.offchain_verified === true);
    return identity && verified && current && sources.length > 0 && ["high", "medium"].includes(item?.confidence);
  };

  verificationStatus = (item) => {
    if (item?.review_after && Date.now() > Date.parse(`${item.review_after}T23:59:59Z`)) {
      return { label: "Review expired", className: "unverified" };
    }
    if (!isWorldChainVerified(item)) return { label: "Unverified", className: "unverified" };
    if (item?.type === "offchain") return { label: "Official offchain resource", className: "offchain" };
    return { label: "Reviewed on World Chain", className: "verified" };
  };

  renderEcoCard = (item) => {
    const card = originalCard(item);
    const review = document.createElement("div");
    review.className = "note mono";
    review.textContent = `Reviewed ${item?.verified_at || "—"} · confidence ${item?.confidence || "—"} · next review ${item?.review_after || "—"} · sources ${(item?.sources || []).length}`;
    const links = card.querySelector(".eco-links");
    card.insertBefore(review, links || null);
    return card;
  };

  renderHotList = () => {
    if (!ECO_UI.hotList || !ECO_UI.hotEmpty) return;
    const items = ECO_ITEMS.filter((item) => item?.editorial?.featured_until)
      .filter((item) => Date.now() <= Date.parse(`${item.editorial.featured_until}T23:59:59Z`))
      .filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
      .sort((a, b) => (a.editorial.rank || 999) - (b.editorial.rank || 999))
      .slice(0, 5);
    ECO_UI.hotList.innerHTML = "";
    ECO_UI.hotEmpty.style.display = items.length ? "none" : "block";
    items.forEach((item) => ECO_UI.hotList.appendChild(renderEcoCard(item)));
  };

  renderNewList = () => {
    if (!ECO_UI.newList || !ECO_UI.newEmpty) return;
    const items = ECO_ITEMS.filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
      .slice()
      .sort((a, b) => (b.verified_at || "").localeCompare(a.verified_at || ""))
      .slice(0, 5);
    ECO_UI.newList.innerHTML = "";
    ECO_UI.newEmpty.style.display = items.length ? "none" : "block";
    items.forEach((item) => ECO_UI.newList.appendChild(renderEcoCard(item)));
  };
})();
