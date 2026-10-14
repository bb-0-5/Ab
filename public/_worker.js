// Cloudflare Pages advanced-mode worker. Serve original V0–V13 assets
// and the independent local-first fluid research laboratory. No remote solver.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
