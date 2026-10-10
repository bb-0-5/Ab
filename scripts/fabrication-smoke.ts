import assert from 'node:assert/strict';
import {
 DEFAULT_FAB_INPUT,optimizeFabricationPortfolio,optimizePrintablePanel,
 panelTriangles,panelSTL,checkPanelMesh,
} from '../src/local/fabrication';
const report=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT});
assert.equal(report.goal,'cosplay_forearm');
assert.equal(report.candidatesEvaluated,3*7*6);
assert.ok(report.selected,'A desktop FDM panel must have an eligible, low-cost candidate.');
assert.equal(report.selected?.printable,true);
assert.equal(report.viableForHumanFlight,false);
assert.ok(report.selected!.massG>0&&report.selected!.estimatedTotalCostAUD>0);
assert.ok(report.selected!.estimatedTotalCostAUD<=DEFAULT_FAB_INPUT.budgetAUD);
assert.ok(report.selected!.materialSavingPercent>10&&report.selected!.materialSavingPercent<100);
assert.ok(report.selected!.sectionIndexMm4>=DEFAULT_FAB_INPUT.minimumSectionIndexMm4);
const mesh=checkPanelMesh(report.selected!);
assert.equal(mesh.watertight,true);
assert.equal(mesh.nonManifoldEdges,0);
assert.equal(mesh.triangles,64);
assert.equal(panelTriangles(report.selected!).length,64);
const stl=panelSTL(report.selected!);
assert.match(stl,/^solid abovebound_decorative_frame_mm/);
assert.equal((stl.match(/facet normal/g)||[]).length,64);
assert.ok(stl.length>2000,'Downloaded CAD must contain valid nonempty facets.');
const flatArea=(report.selected!.solidMassG/report.selected!.densityGcm3)*1000/report.selected!.thicknessMm;
assert.ok(flatArea>0);

const alternate=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT});
assert.deepEqual(alternate,report,'Same geometry/material constraints must replay exactly.');

const tooBig=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT,printerBedXmm:60,printerBedYmm:60});
assert.equal(tooBig.selected,null,'Reject design larger than physical bed.');
const severe=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT,ambientTemperatureK:5000});
assert.equal(severe.selected,null,'Hobby filaments cannot be certified for 5000K.');
const costly=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT,budgetAUD:0});
assert.equal(costly.selected,null,'Hard budget must exclude even the cheapest physical print.');
const hard=optimizePrintablePanel({...DEFAULT_FAB_INPUT,minimumSectionIndexMm4:10000});
assert.equal(hard.selected,null,'Geometric section bound must be enforced.');
assert.throws(()=>optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT,widthMm:NaN}),/Invalid printable/);
assert.throws(()=>optimizePrintablePanel({...DEFAULT_FAB_INPUT,budgetAUD:-1}),/Invalid printable/);

const suit=optimizeFabricationPortfolio({...DEFAULT_FAB_INPUT,goal:'flight_suit_concept'});
assert.equal(suit.viableForHumanFlight,false);
assert.match(suit.flightAssessment,/NOT FEASIBLE/);
assert.ok(suit.selected?.printable,'Cosplay printable element may be feasible even though flight is not.');
console.log(JSON.stringify({
  printablePanel:!!report.selected,
  minimumEstimatedCostAUD:report.selected?.estimatedTotalCostAUD,
  materialSavedPercent:report.selected?.materialSavingPercent,
  generatedSTLFacets:mesh.triangles,
  watertight:mesh.watertight,
  candidateSamples:report.candidatesEvaluated,
  flightCertification:false,
  hotVacuumFDM:false,
},null,2));
