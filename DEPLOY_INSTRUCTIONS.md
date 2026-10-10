# Deploy AboveBound — static, local-first

The current app's execution is **entirely inside the user's web browser**.
There is no AWS instance, Express API, Docker volume, WebSocket server or
background simulation service required.

```sh
npm ci
npm run test:all
npm run build
```

Deploy the contents of `dist/` to **static** HTTPS hosting. Cloudflare Pages,
GitHub Pages, or an ordinary HTTPS static file host work. Make sure that the
bundled `*.worker-*.js` assets are served as ordinary JavaScript files with
the correct MIME type and that the origin uses HTTPS (localhost is fine for
development). The site uses a relative `base: './'` for subpath hosting.

### Current abovebound.org cutover is NOT automatic
The old public DNS/Cloudflare Tunnel currently routes to an AWS origin.
Publishing `dist/` to an independent static host does **not** replace the
origin or migrate its anonymous historical memory. First verify preview,
then export legacy data, configure Supabase with RLS, then plan DNS cutover.
Only after real-host acceptance testing should the AWS instance, attached
storage and Cloudflare Tunnel be decommissioned separately. Removing scripts
from this GitHub repo DOES NOT terminate running billable AWS infrastructure.

### Data and privacy
Results are saved locally on the device. Optional private Supabase backup
requires explicit project URL, PUBLIC publishable key, anonymous Auth, and
the owner-only migration in `supabase/migrations`. Do not put a service-role
key in a public build. Anonymous cloud sessions cannot be recovered after
browser storage is lost; add recoverable accounts before depending on cloud
memory for critical work.

The physics/chemistry/hardware screens remain educational, not certified.
