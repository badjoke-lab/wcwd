window.dsFetchSummaryFallback = async function () {
  try {
    const response = await fetch(`${window.dsApiBase()}/api/summary?limit=96&event_limit=20`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return null;
  }
};
