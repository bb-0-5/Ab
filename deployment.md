# Deployment

Static frontend: [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md).

**Production setup (11 October 2026 Melbourne):** Cloudflare Pages project `abovebound`, deployed from `bb-0-5/Ab` `main` automatically using `npm run build` into `dist`. Preview URL: `https://abovebound.pages.dev`. The production build completed successfully and both `abovebound.org` and `www.abovebound.org` were pointed via Cloudflare DNS to that Pages project.

At DNS cutover, `www.abovebound.org` had become active in Pages and `abovebound.org` still awaited final hostname verification. Check custom-domain status and HTTPS after propagation.

**Legacy data:** Old production used Cloudflare Tunnel CNAME `07e7a1e0-a9f8-44d9-92e0-3b36dccf44ae.cfargotunnel.com`. DNS was replaced, but the tunnel and AWS system have not been destroyed. Back up their `discovery_memory.json` volume before separately retiring billable infrastructure. The browser-only app does not migrate old results automatically.
