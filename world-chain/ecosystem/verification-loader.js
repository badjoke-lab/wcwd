(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const value = typeof request === "string" ? request : request?.url;
    const path = value ? new URL(value, location.href).pathname : "";
    if (path !== "/ecosystem.json") return nativeFetch(...args);

    const [dataResponse, verificationResponse] = await Promise.all([
      nativeFetch(...args),
      nativeFetch("/ecosystem.v2.json", { headers: { accept: "application/json" } }),
    ]);
    if (!dataResponse.ok || !verificationResponse.ok) return dataResponse;

    const data = await dataResponse.json();
    const verification = await verificationResponse.json();
    const byId = new Map((verification.records || []).map((item) => [item.id, item]));
    const merged = Array.isArray(data) ? data.map((item) => ({ ...item, ...(byId.get(item.id) || {}) })) : data;
    const headers = new Headers(dataResponse.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(merged), { status: dataResponse.status, headers });
  };
})();
