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

## Single-screen visual laboratory + machine-printable components

The home screen now includes a unified SVG field linking **building,
chemistry, membranes, circuits, and Iron Man-inspired costume design**.
Every domain has a clickable node, contextual physical constraints and
a shared discovery indicator; scenes are intentionally **schematic**,
not a rendered CFD, electromagnetic or quantum result. No additional
tabs are required. The fabrication case draws an artistic full-body
sci-fi suit, with the printed part's actual scope carefully separated.

The new suit design goal automatically sweeps **126** combinations
(PLA/PETG/TPU × frame thickness × frame rim), minimizes modeled
production cost **only after** filtering by 3D printer bed size,
user budget, ambient temperature and a required geometric frame-section
index. Its result shows gram/material savings versus a solid plaque,
assumed AUD cost and a cost-vs-section cloud on the same visual display.

If a candidate passes, **Download STL** exports a closed, watertight
triangulated decorative frame in millimetres for a home FDM slicer.
This is a single cosmetic costume component, not a wearable structural
system; the user must check slicing, nozzle/material compatibility and
physical fit. No automatically validated filament strength is inferred.

**Flight status is always unqualified/false.** No real Iron Man flight,
propulsion, exoskeleton load or human safety capacity is established
by local costume printing. Real flight demands fundamentally
independent evidence, tests and safety engineering.

See [Printable/Overlay Constraints](docs/PRINTABLE_CONSTRAINT_OVERLAY.md)
and run `npm run test:fabrication`, which tests closed STL mesh,
printer-bed/budget/temperature rejection, repeatability and a
non-flying output.

## Shared discoveries and entropy-based chemistry

Every local Worker task produces typed **discoveries** with provenance,
units and an operating environment. Previous findings are reused on the
next run: membrane needs can trigger a new chemistry/material screen;
chemistry can propose an isotope/material hypothesis; building and
electronics can test it under their own constraints. Unverified or
physically incompatible properties NEVER enter another simulation as
trusted constants. A bounded environmental sweep compares air, water,
room-temperature vacuum and 5000 K vacuum; unknowns remain unknown.

Chemistry calibration now checks source labels, optional
`batch_id`/`protocol_id`, zero/blank yield handling, train-versus-batch
separation and target + side-product holdout errors. Condition-split fits
without distinct batches or an identified unchanged protocol are **not
reused** as new discovery evidence. A numerical fit never proves a
hypothetical catalyst or new isotope can exist.

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

**Production deployment:** Cloudflare Pages project `abovebound` is linked
to this GitHub repository's `main` branch. Its static Vite build was
successfully deployed to `https://abovebound.pages.dev`. DNS for
`abovebound.org` and `www.abovebound.org` was updated to point at
Pages on 2026-10-11 (Melbourne time); hostname certificate validation may
still be pending immediately after the change. This does **not** stop the
old AWS server or migrate its `discovery_memory.json`. Back up the old
volume and retire AWS resources separately, after confirming all saved
legacy data has been recovered. The old Tunnel DNS target was
`07e7a1e0-a9f8-44d9-92e0-3b36dccf44ae.cfargotunnel.com`.

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
