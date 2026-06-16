import worker from "./index.js";

// Production entrypoint deliberately exposes fetch only.
// Cloudflare Cron is disabled and scheduled handlers must never be exported here.
export default {
  fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },
};
