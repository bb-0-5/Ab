# AboveBound source import

This repository was imported from `dropkickfriend-spec/abovebound` at source commit `5ef84fcca4062ff1af1e0d1d93335558f49eddb4` (2026-08-26).

The `abovebound.org` Cloudflare DNS record points to a remotely managed tunnel named `abovebound-production`, which routes to the Docker application service at `http://beyondbound:3000`. The application's documented production deployment uses an AWS host with Docker Compose.

## Import boundaries

- This repository contains application source and deploy configuration, not the running server's private `.env.production`, Cloudflare tunnel token, or persistent Docker volume.
- The running website might contain newer changes than the imported GitHub source; verify the deployed server's checkout before using this repository to redeploy.
- Supabase connection details have not been confirmed for this application; do not copy credentials from unrelated projects into frontend code or version control.
- Production deployment and database migrations are intentionally not automatic.

Original source: https://github.com/dropkickfriend-spec/abovebound
