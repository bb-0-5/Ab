import type { SiteGeometryOptimizationResult } from './site_geometry_optimizer';
import type { CoupledSiteFlowResult } from './site_whole_house_coupling';

/**
 * Presentation layer only: rank caveats are mandatory and cannot be inferred
 * from displayed kWh alone. Do not describe screening as verified savings.
 */
export interface BuildingDesignSummary {
  status: 'searching' | 'no_feasible_design' | 'screening_candidate' | 'screening_improvement';
  headline: string;
  explanation: string;
  buildingForm: string | null;
  floorAreaM2: number | null;
  ventilationStrategy: string | null;
  annualElectricalKWh: number | null;
  estimatedLifecycleEnergyKWh: number | null;
  lifecycleDifferenceKWh: number | null;
  siteFormsTested: number;
  mechanicalOptionsTested: number;
  searchSeed: number | null;
  caution: string;
}

export function summarizeBuildingDesign(
  site: SiteGeometryOptimizationResult | null,
  linked: CoupledSiteFlowResult | null,
): BuildingDesignSummary {
  const searching = !site || !linked?.jointSearch;
  const joint = linked?.jointSearch;
  const base = {
    siteFormsTested: site?.candidatesEvaluated ?? 0,
    mechanicalOptionsTested: joint?.mechanicalCandidatesEvaluated ?? 0,
    searchSeed: site?.searchSeed ?? null,
    caution: 'Preliminary model only: generated room plans, simplified climate, estimated manufacturing energy and screening rules are not a survey, certificate, legal approval or measured energy savings.',
  };
  if (searching) {
    return {
      ...base,
      status: 'searching',
      headline: 'Comparing building designs',
      explanation: 'Automatically searching building shapes, solar exposure and ventilation options. No manual parameter combinations needed.',
      buildingForm: null, floorAreaM2: null, ventilationStrategy: null,
      annualElectricalKWh: null, estimatedLifecycleEnergyKWh: null,
      lifecycleDifferenceKWh: null,
    };
  }
  const candidate = joint.selected;
  if (!candidate) {
    return {
      ...base,
      status: 'no_feasible_design',
      headline: 'No supported design found',
      explanation: 'None of the tested building and ventilation combinations passed the area and model screening constraints. The result is not a recommendation to build.',
      buildingForm: null, floorAreaM2: null, ventilationStrategy: null,
      annualElectricalKWh: null, estimatedLifecycleEnergyKWh: null,
      lifecycleDifferenceKWh: null,
    };
  }
  const improvement = joint.qualifiesAsImprovement;
  const referenceKnown = joint.lifecycleSavingsAgainstReferenceKWh !== null;
  return {
    ...base,
    status: improvement ? 'screening_improvement' : 'screening_candidate',
    headline: improvement ? 'Promising design found' : 'Best passing design in this search',
    explanation: improvement
      ? 'This building-and-ventilation pairing has the lowest estimated lifecycle energy among the feasible, similarly sized designs tested. It also beats the screened reference under the model assumptions.'
      : referenceKnown
        ? 'This is the lowest-energy passing pairing tested, but its modeled improvement over the reference was too small to qualify. It is not a verified real-world winner.'
        : 'This pairing passes its own screening rules, but the reference is not suitable for a defensible savings comparison.',
    buildingForm: candidate.site.design.form.replaceAll('_', ' '),
    floorAreaM2: candidate.site.design.floorAreaM2,
    ventilationStrategy: candidate.selectedAirflow.control.replaceAll('_', ' '),
    annualElectricalKWh: candidate.energy.annualCombinedElectricalKWh,
    estimatedLifecycleEnergyKWh: candidate.energy.totalLifecycleKWh,
    lifecycleDifferenceKWh: joint.lifecycleSavingsAgainstReferenceKWh,
  };
}
