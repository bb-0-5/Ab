# AboveBound — your computer does the exploring

The current public entrypoint is a **static, local-first** single-page design
lab: location/area → automatic building & HVAC search → one understandable
result. Users can also select a **passive RF impedance match** or a
**probability-path selectivity thought experiment**.

## How it works now

- All computation runs in the user's browser, in a Web Worker that is
  terminated/restarted for each new design. **No AWS, Docker, Express,
  WebSocket server, external AI or remote computation is required.**
- The normal building run automatically samples hundreds of geometry
  candidates, re-evaluates the promising site/room/HVAC alternatives
  under the same location, annual weather and balance temperature, and
  reports tested coverage. Constraints gate the recommendation.
- **Explore a different building** uses a reproducible deterministic seed.
  A local EPW weather file (max 5 MB, ≤75 km from chosen preset) can be
  read by the user's device; it is never uploaded. Without EPW, an
  approximate climate preset is used and labelled.
- RF demonstration sweeps E12 two-element passive L matches with Ohms,
  Henries, Farads and frequency; checks delivered power against available
  source power. Component Q is estimated. This **does not validate DDR,
  high-speed motherboard signal integrity, PCB traces or VNA results.**
- Chemistry demonstration enumerates hypothetical probability gates and
  separately reports **conditional selectivity** and **absolute target
  output per original input**. Discarding unfavorable routes without
  changing branching kinetics cannot automatically increase chemical
  yield. This is **not quantum chemical reaction modeling**.
- One-page UI intentionally has no simulation tabs or parameter maze.
  Technical details and history are behind collapsible disclosures.

## Shared discoveries and entropy-based chemistry

Every local Worker task produces typed **discoveries** with provenance,
units and an operating environment. Previous findings are reused on the
next run: membrane needs can trigger a new chemistry/material screen;
chemistry can propose an isotope/material hypothesis; building and
electronics can test it under their own constraints. Unverified or
physically incompatible properties NEVER enter another simulation as
trusted constants. A bounded environmental sweep compares air, water,
room-temperature vacuum and 5000 K vacuum; unknowns remain unknown.

A new membrane goal asks what material can carry, block or channel heat
in a specified medium, T, pressure and flow regime. High-temperature
phase failure and missing properties produce a clear "no supported
material" result, not a fictional material or engineering approval.

The chemistry goal can import real **observed target + side yield**
CSV records and calibrate an effective competing first-order
temperature-dependent rate model, with a deterministic condition-grouped
train/holdout split. It displays **holdout MAE versus the training-mean
baseline**. Without measured records, no calibrated yield claim is made.
Hypothetical entropy/barrier changes are not verified catalysts.

See [Calibration & Cross-Simulation Protocol](docs/ENTROPY_DISCOVERY_CALIBRATION.md).
Run `npm run test:discoveries`.

## Device memory + optional Supabase

Latest 32 results stay on your device; download full JSON any time.
For cloud backups the user can optionally supply a Supabase project URL
and PUBLIC publishable key in Memory → Cloud backup. Anonymous GoTrue
authentication then provides a JWT; `supabase/migrations/20261011000000_ab_computation_memory.sql`
defines a protected owner-only `public.ab_computation_memory` table.
Only compact summary records are uploaded, never full EPW/hourly arrays.

**Supabase project selection isn't complete.** The connected accounts have
projects named `Bb5` and `hexfield`, but neither has been confirmed as
AboveBound's cloud memory database. **No existing database was changed.**
Apply the migration ONLY to the intended project, enable anonymous sign-in,
configure CORS/security and verify cross-user RLS before relying on backup.
Anonymous cloud accounts cannot restore themselves from a new device.
Offline device-local use does not require a cloud connection.

## Run locally

```sh
npm ci
npm run dev
```

Open the locally displayed Vite URL. For static HTTPS hosting:

```sh
npm run test:all
npm run build
```

Upload the contents of `dist/` to a static host such as Cloudflare Pages.
The Worker bundle is part of the assets. There is no Node backend on the
runtime host. See `DEPLOY_INSTRUCTIONS.md` for a safe cutover plan.

**Production warning:** `abovebound.org` still points to the **old AWS
origin through Cloudflare Tunnel** until the public hostname is explicitly
migrated. Repository changes do **not** shut down the old AWS host, prevent
billing or migrate its existing `discovery_memory.json`. Confirm static
preview and export old saved data before switching DNS, then retire AWS
separately. Do not delete current Tunnel while it still serves production.

## Source and engineering boundaries

- `src/main.tsx` → `src/local/LocalApp.tsx`: static UI.
- `src/local/compute.worker.ts`: all device-only search. Main UI does
  not call the old `/api` or `/ws` endpoints.
- `src/local/impedance.ts`: bounded complex passive RF power screening.
- `src/local/selectivity.ts`: probabilistic pathway exclusion / throughput.
- `src/local/memory.ts`: browser memory + optional authenticated Supabase.
- `src/lib/site_geometry_optimizer.ts`,
  `src/lib/site_whole_house_coupling.ts`: building search, still
  a **screening** model with synthetic room topology and unsourced embodied
  coefficients; no certified building energy rating or structural check.
- `docs/SIMULATION_AUDIT.md`: V0–V13 mathematical/engineering audit with
  the specific evidence limitations and invariants.
- `src/App.tsx`, `server.ts`: retired research/legacy API source,
  deliberately **not imported into the static production app**. Preserve
  only for historical data export and backcompat tests until cutover.

`npm run test:all` runs legacy smoke (not model validation), building
physics checks, device RF conservation and categorical yield invariants,
and a production static bundle check. Scientific assumptions remain
simplified and should be treated as hypotheses until independently
benchmarked against hardware measurements or chemical experiments.

## Laptop / desktop automated experiments (no backend)

With Node installed on **your computer**, run:

```sh
npm run explore:local -- --goal building --preset melbourne --area 130 --count 4
npm run explore:local -- --goal circuits --frequency 100 --source 50 --load 100
npm run explore:local -- --goal chemistry --min-accept 0.5
```

Building mode automatically evaluates multiple reproducible seeds and writes
the lowest-energy passing design among the sampled options to a timestamped
JSON report inside `runs/` on **your computer**. It does not call an
external API. Maximum 8 seed runs per invocation prevents runaway searches.

This is a bounded experimental design generator, **not** an unrestricted
self-modifying code agent. A browser cannot freely write files or alter the
machine; local CLI file writes are explicit and confined to `runs/`.
If later implementing autonomous source edits, require local sandboxing,
visible diffs, tests and explicit write approval.
