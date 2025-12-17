import { onRequestGet as __api_summary_js_onRequestGet } from "/Users/lyla/wcwd/functions/api/summary.js"

export const routes = [
    {
      routePath: "/api/summary",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_summary_js_onRequestGet],
    },
  ]