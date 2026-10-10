# Static local-first deployment

All runtime simulations are Web Workers in the user's own browser.
There is **no AWS, Express API, WebSocket, Docker, Supabase Edge Function
or paid cloud compute** in the new runtime.

```sh
npm ci
npm run test:all
npm run build
```

Upload `dist/` to HTTPS static hosting, such as Cloudflare Pages,
GitHub Pages or comparable CDN. Serve hashed worker assets as JavaScript
and test on a real mobile device: source files are not required on
the runtime machine. Vite's relative base supports project subpaths.

## Cloudflare Pages option (no origin server)
Connect the GitHub repository `bb-0-5/Ab` to Cloudflare Pages; set:
- framework preset: Vite
- build command: `npm run build`
- output directory: `dist`
- no runtime environment variables needed for device-only operation

Before any further production changes, verify the `abovebound.pages.dev` deployment:
single page loads, Worker script loads, building/impedance/probability
runs finish and local history reloads across refresh. Then install the
owner-only Supabase migration in the correct, intentionally selected
project and test two separate authenticated identities.

**Cutover status (2026-10-11 Melbourne):** The Pages Git build succeeded,
`www.abovebound.org` was marked active by Pages, and both public hostname
DNS records were pointed at `abovebound.pages.dev`. The apex certificate
validation may take more time. This is a DNS cutover only; the previous app's
Docker volume `discovery_memory.json` is NOT migrated. Export and check
legacy records before terminating the old AWS origin. Removing AWS-oriented
files from this repository does not stop or delete cloud resources, routes,
or billable volumes. Old Tunnel target:
`07e7a1e0-a9f8-44d9-92e0-3b36dccf44ae.cfargotunnel.com`.

## Security
Only publishable Supabase keys are accepted in the optional cloud UI;
server service-role keys are forbidden in frontend code. Apply
`supabase/migrations/20261011000000_ab_computation_memory.sql`
and verify RLS. Supabase anonymous auth identities will not be recoverable
from another device until an identity-linking login flow is implemented.
