# AboveBound: shared discoveries, thermodynamic kinetics and honest calibration

## 1. A discovery is not an automatic new law of physics

The four active local compute paths (building, passive RF electronics, chemistry
and membranes) exchange **typed, bounded discoveries**. Every finding carries
its generating model, an operating environment (vacuum, air, liquid water),
temperature (K), pressure (Pa), flow velocity (m/s), provenance, evidence
level and, if known, material properties.

Each later task probes findings using its OWN governing assumptions:

- A membrane need creates a target property request. Chemistry/material
  screening searches a small evidence-labelled reference catalogue.
  Unmet requests remain unmet rather than fabricating magical materials.
- A proposed isotope (e.g. elemental identity and mass number) is
  independently tested as a hypothesis, but its atomic mass alone does not
  determine melting point, conductivity, chemistry yield, nuclear lifetime,
  PCB impedance or structural strength. An isotope cannot be materialised
  by chemistry; nuclear transformations and experimental evidence are separate.
- RF signals cannot use V8 prime waves as frequency-dependent impedance.
  A material might be suitable as a generic heat spreader but unknown as a
  microwave transmission line or chemical catalyst.
- Buildings may inspect room-temperature thermal conductivity as one
  candidate sensitivity, but a bulk coefficient does not establish U-value,
  moisture resistance, code compliance or lifecycle manufacture.

Findings are embedded in *local result memory*. Up to 24 previous typed
discoveries are passed to the next browser Worker sweep and independently
re-evaluated. Optional user-owned Supabase storage backs up compact
summary/discovery records with RLS. No shared global user-to-user
self-learning or unreviewed material-physics mutation is enabled.

## 2. Conditions select the correct physical regime

Each membrane sweep explicitly labels a medium, absolute temperature,
pressure and flow speed. A vacuum has no bulk fluid convection, although
radiative cooling and solid conduction still exist. The simple screen cannot
calculate gas rarefaction, radiative transfer, phase evaporation, mechanical
creep, oxidation, corrosion or chemical stability; it declines qualification
at unsupported high temperatures.

A 5000 K near-vacuum requirement results in **no passing known material**
from this limited catalogue, NOT proof no matter could survive it.
For water the phase check rejects conditions above its ~647 K critical
temperature. This number comes from NIST Chemistry WebBook:
https://webbook.nist.gov/cgi/cbook.cgi?Name=water&cTG=on&cTP=on

Reference metal phase-change points (Cu ~1357.6 K, Al ~933.47 K,
W ~3695 K) are tabulated in NIST Monograph 126:
https://www.nist.gov/system/files/documents/calibrations/mono126.pdf

Thermal conductivities here are rounded **illustrative** ambient numbers,
not traceable measurement certificates. Only Fourier conduction through a
1 mm example slab with a hypothetical 15 K differential is calculated.
Flow membranes are NOT CFD or engineered channel geometries.
Use measured temperature-dependent transport data and validated
material/phase models for real engineering decisions.

## 3. Entropy logic: possible is not guaranteed

For an assumed activated step:

```
ΔG‡(T) = ΔH‡ − T ΔS‡
k(T) = (k_B T / h) × exp(−ΔG‡ / RT)
P(event by t) = 1 − exp(−k t)
```

Even an event with nonzero rate need NOT occur in a finite trial. Entropy
does not independently provide activation free energies, reaction
mechanisms, or a desired-product yield. A barrier estimate needs
independent thermodynamic/kinetic evidence.

For competing, irreversible *first-order* pathways where target and side
products share a limiting reactant, the preliminary model is:

```
k_target = A_target exp(−E_target / RT)
k_side   = A_side exp(−E_side / RT)
X(t) = 1 − exp(−(k_target + k_side) × t)
Y_target = [k_target / (k_target + k_side)] × X(t)
Y_side   = [k_side / (k_target + k_side)] × X(t)
```

Conservation: `Y_target + Y_side + unreacted = 1`. Changing a
**hypothetical** activation barrier changes model outcomes, but the
software does NOT know a feasible real catalyst, electric field, membrane
or engineered entropy condition to produce those barrier changes.

The old categorical probability gate still tracks target selectivity
separately from **absolute yield per original feed**; discarding
unfavourable incoming pathways may change conditional selectivity but
cannot create new molecules when true channel kinetics are unchanged.

## 4. First calibrate from measured known yields

The app accepts a user-supplied CSV of **observed, independently sourced**
target AND side-product yield fractions from a *single reaction and
unvarying chemistry* under distinct temperatures and durations:

```csv
id,reaction_id,environment,temperature_k,duration_s,target_fraction,side_fraction,source
```

Each row must have real unique experiment ID, the same reaction identity,
medium `air`, `water` or `vacuum`, Kelvin temperature, duration in seconds,
two measured yield fractions between 0 and 1 whose sum is below 1,
and a traceable source/experiment reference. A different solvent,
catalyst, reagent or process is NOT the same reaction configuration:
use a different reaction ID and dataset; the three-medium field by
itself is not enough to guarantee comparability.

**Important:** Many published reaction-yield databases report desired
product yield but not a complete side-product balance or consistent
temperature/time series. Such observations cannot identify the two
competing kinetic rates used here. DO NOT silently set missing
side-product measurements to zero.

If there are >=8 valid observations and >=6 distinct T/time condition
groups, calibration derives effective observed channel rates, then
fits two `ln(k) ~ 1/T` regressions. Repeated conditions remain on the
SAME side of a deterministic train/holdout split; at least two
observations must be held out and 3 different training temperatures
are required. The app reports:

- Mean absolute error (MAE), root mean square error (RMSE), signed bias
  measured as fractions of initial feed; UI converts MAE to percentage
  points of reaction yield.
- A naive constant-training-mean holdout MAE as a performance baseline.
  A model exceeding that error is labelled `worse_than_baseline`.
- Temperature coverage; counterfactual barrier perturbations and
  temperatures outside the training range are never certified.

**No actual experimental yields were supplied in this project.**
The repository's unit tests generate SYNTHETIC mathematically exact
first-order rates for debugging ONLY. Those test numbers are NOT
lab measurements, must never be advertised as calibration evidence,
and are not loaded into the public app by default. Experimental
calibration and a trustworthy measured error rate become available
only after a suitably documented real dataset is imported.

A possible future verified data source is the Open Reaction Database
(ORD): https://docs.open-reaction-database.org/en/latest/schema.html .
ORD describes reaction outcome yield analyses and rich experiment
provenance, but an ORD record needs real outcome extraction and
identical-context grouping before use; no cross-reaction pooled
yield claim is made here.

## 5. Scope of automatic learning

A finding first enters as a HYPOTHESIS or reference material datum,
then receives independent domain/equipment/temperature tests. It
does not alter trusted physics constants or the building model.
A genuine promotion to validated performance should require:

1. Source-traceable experimental measurements with unit/phase metadata.
2. Separate training and **untouched** holdout conditions, preferably
   across labs/batches (the current split only prevents identical
   T/time replicas leaking; it does NOT guarantee independent labs).
3. Error/uncertainty and negative-control baselines, not only a high
   fit score on one demonstration.
4. Check of stability across physical regimes (vacuum, liquids, flow,
   extreme temperature) and thermodynamic and material constraints.
5. Review before any "learned" hypothesis is permitted to modify
   real hardware, process conditions or scientific certificates.

Run `npm run test:discoveries` to check conservation, Eyring
finite-horizon probability, deterministic fit/holdout, cross-domain
reuse, isotope-property quarantine and 5000 K vacuum rejection.
Run `npm run test:worker` for actual end-to-end Worker dispatch.
