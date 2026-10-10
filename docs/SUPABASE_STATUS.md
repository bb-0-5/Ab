# AboveBound persistence and Supabase integration status

## Verified source behavior

The imported AboveBound application runs an Express API and a React/Vite client.
`server.ts` currently persists discovery and anonymous workspace history in
`${DATA_DIR}/discovery_memory.json` (production: the `beyondbound-data` Docker
volume). It does **not** import the Supabase SDK, contain Supabase SQL migrations,
or read `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in the imported source.

The browser's anonymous workspace ID is stored in localStorage and forwarded in
`X-AboveBound-Workspace`. This value is chosen by the client and **is not proof
of user identity**. Do not use it alone as an RLS ownership predicate.

## Before enabling Supabase

1. Identify the Supabase project used by AboveBound (do not assume the
   separately connected Hexfield project is the same one).
2. Define which data will be persisted: simulations, anonymous workspace events,
   user projects, public read-only research results, and backups.
3. Decide between authenticated accounts and intentionally public anonymous
   sessions. For private data, use Supabase Auth user IDs with restrictive RLS.
4. Create reviewed SQL migrations, with RLS enabled on every exposed table.
   Restrict SELECT, INSERT, UPDATE and DELETE to the correct owner; avoid
   permissive `TO authenticated` policies without an ownership predicate.
5. Keep service-role and database credentials server-side, in production
   environment secrets (never `VITE_*` variables, git, or public client code).
6. Build a data migration and rollback plan for the existing Docker volume,
   then test the API and RLS with at least two distinct user sessions.

**Current status:** Supabase has not been linked or modified by this source
migration. The Docker volume remains the source of truth for deployed state,
and pushing to GitHub does not redeploy the live AWS application.
