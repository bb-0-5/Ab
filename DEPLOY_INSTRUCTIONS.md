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

Before linking `abovebound.org`, verify a `*.pages.dev` preview:
single page loads, Worker script loads, building/impedance/probability
runs finish and local history reloads across refresh. Then install the
owner-only Supabase migration in the correct, intentionally selected
project and test two separate authenticated identities.

**Do not point the apex hostname to Pages while the old Cloudflare Tunnel
is the only working production origin.** Plan DNS cutover after backups.
The previous app's Docker volume `discovery_memory.json` is NOT
automatically migrated. Export it and independently verify records
before retiring AWS. Removing AWS-oriented files from this repository
does not stop or delete any cloud resources, routes or billable volumes.
Stop/retire those separately after successful static deployment.

## Security
Only publishable Supabase keys are accepted in the optional cloud UI;
server service-role keys are forbidden in frontend code. Apply
`supabase/migrations/20261011000000_ab_computation_memory.sql`
and verify RLS. Supabase anonymous auth identities will not be recoverable
from another device until an identity-linking login flow is implemented.
