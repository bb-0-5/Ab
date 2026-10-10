# AboveBound local-first memory

The CURRENT `src/main.tsx` entry loads `src/local/LocalApp.tsx`, a static
one-page app. Browser Worker executes all simulations. Results are written to
this device's localStorage (latest 32) and can be exported to JSON.

Optional user-configured Supabase:
- User selects a project URL and `sb_publishable_` key in the app's
  collapsed memory disclosure. No server secret is used or shipped.
- Apply `supabase/migrations/20261011000000_ab_computation_memory.sql` to
  the **intended** project. Two connected projects currently exist but it is
  **not confirmed which one belongs to AboveBound**, so NO live project or
  data was modified.
- Enable anonymous sign-ins. GoTrue provides an anonymous JWT; the
  `ab_computation_memory` table enforces user-id ownership with RLS for
  SELECT/INSERT/UPDATE/DELETE, and denies unauthenticated writes/reads.
- User-owned compact summaries are sent via Supabase PostgREST, never
  temperature vectors, site maps or full optimizer state.
- Anonymous accounts are **not portable across devices**. To recover on a
  new device, permanent identity linking/sign-in must be added separately.
- Local storage works offline. Supabase networking may be unavailable:
  a failed sync must not stop the computation or wipe local results.

### Migration caveat
Old AWS Express `discovery_memory.json` is NOT automatically migrated to
Supabase or localStorage. It must be exported by the old operator first, before
the AWS service is retired. Legacy `src/App.tsx` and `server.ts` are left
in the repository for this historical export only, but they are not used by
the active browser app or its build.

### Go-live requirements
Static asset hosting (e.g. Cloudflare Pages), HTTPS, correctly configured
Supabase project, enabled anonymous authentication, and cross-user RLS tests
must all be verified. An existing Cloudflare Tunnel aimed at AWS is NOT
a deploy target for a static build. Changing DNS/tunnels prematurely can
take down the current public site.
