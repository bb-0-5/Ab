# Deployment

Static frontend: [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md).

Cloudflare Pages project: `abovebound` (`https://abovebound.pages.dev`), linked to `bb-0-5/Ab` branch `main` with automatic Git deployments.

Build command: `npm run build`; output: `dist`; runtime compute: browser Web Workers only. No AWS backend is needed for this new application.

The production apex `abovebound.org` currently resolves through an older Cloudflare Tunnel. **Do not cut over DNS until the Pages deployment has been verified and the old origin's `discovery_memory.json` has been backed up.** After a successful cutover, the legacy AWS host and resources must be retired separately.
