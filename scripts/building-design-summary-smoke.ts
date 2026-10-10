import assert from 'node:assert/strict';
import { summarizeBuildingDesign } from '../src/lib/building_design_summary';
import { optimizeSiteGeometry, SITE_LOCATION_PRESETS } from '../src/lib/site_geometry_optimizer';
import { searchCoupledSiteMechanicalPortfolio, screenCoupledSiteAirflow } from '../src/lib/site_whole_house_coupling';

const loading = summarizeBuildingDesign(null, null);
assert.equal(loading.status, 'searching');
assert.equal(loading.estimatedLifecycleEnergyKWh, null);

const site = optimizeSiteGeometry({
  location: SITE_LOCATION_PRESETS.bendigo,
  targetFloorAreaM2: 130,
  minFloorAreaM2: 123.5,
  maxFloorAreaM2: 136.5,
  iterations: 300,
  seed: 377,
});
const linked = screenCoupledSiteAirflow(site, { maximumCandidates: 48 });
linked.jointSearch = searchCoupledSiteMechanicalPortfolio(site, site.feasibleShortlist, {
  maximumCandidates: 48,
});

const summary = summarizeBuildingDesign(site, linked);
assert.ok(['screening_candidate', 'screening_improvement', 'no_feasible_design'].includes(summary.status));
assert.equal(summary.siteFormsTested, site.candidatesEvaluated);
assert.equal(summary.mechanicalOptionsTested, linked.jointSearch.mechanicalCandidatesEvaluated);
assert.equal(summary.searchSeed, site.searchSeed);
assert.match(summary.caution, /not a survey, certificate/i);
if (linked.jointSearch.selected) {
  assert.ok(summary.estimatedLifecycleEnergyKWh && summary.estimatedLifecycleEnergyKWh > 0);
  assert.equal(summary.buildingForm, linked.jointSearch.selected.site.design.form.replaceAll('_', ' '));
  assert.equal(summary.ventilationStrategy,
    linked.jointSearch.selected.selectedAirflow.control.replaceAll('_', ' '));
}

const missing = structuredClone(linked);
missing.jointSearch!.selected = null;
missing.jointSearch!.qualifiesAsImprovement = false;
const unavailable = summarizeBuildingDesign(site, missing);
assert.equal(unavailable.status, 'no_feasible_design');
assert.equal(unavailable.annualElectricalKWh, null, 'Never print phantom performance for infeasible design.');
assert.equal(unavailable.lifecycleDifferenceKWh, null);

const noReference = structuredClone(linked);
if (noReference.jointSearch?.selected) {
  noReference.jointSearch.lifecycleSavingsAgainstReferenceKWh = null;
  noReference.jointSearch.qualifiesAsImprovement = false;
  const provisional = summarizeBuildingDesign(site, noReference);
  assert.equal(provisional.status, 'screening_candidate');
  assert.match(provisional.explanation, /reference is not suitable/i);
}
assert.deepEqual(summary, summarizeBuildingDesign(site, linked), 'Human-readable summary must be reproducible.');
console.log('Human building-design summary OK:', summary.status, summary.buildingForm, summary.siteFormsTested);
