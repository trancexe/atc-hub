// Automated Dry-Run Verification for Multi-Terminal Gate Routing & Full WIII Taxiway Network
const fs = require('fs');
const assert = require('assert');

const wiii = JSON.parse(fs.readFileSync('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'utf8'));
const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

global.airportData = wiii;

eval(appJs.slice(appJs.indexOf('class TaxiMinHeap {'), appJs.indexOf('function executePushbackMovement(')));

console.log("=== DRY RUN: MULTI-TERMINAL GATE ROUTING & TAXIWAY NETWORK ===");

// 1. Verify all 66 gates are present and distributed across T1, T2, T3
const gates = wiii.gates;
assert.strictEqual(gates.length, 66, "Expected exactly 66 gates from OSM WIII");

const t1Gates = gates.filter(g => g.terminal === "T1");
const t2Gates = gates.filter(g => g.terminal === "T2");
const t3Gates = gates.filter(g => g.terminal === "T3");

console.log(`✓ Terminal 1 (Concourses A, B, C): ${t1Gates.length} gates`);
console.log(`✓ Terminal 2 (Concourses D, E, F): ${t2Gates.length} gates`);
console.log(`✓ Terminal 3 (Piers 1 & 2): ${t3Gates.length} gates`);

assert(t1Gates.length >= 20, "T1 gates count");
assert(t2Gates.length >= 20, "T2 gates count");
assert(t3Gates.length >= 20, "T3 gates count");

// 2. Verify airline allocation logic
const testPairs = [
  { airline: "Garuda Indonesia", cs: "GIA880", expectedTerm: "T3" },
  { airline: "Singapore Airlines", cs: "SIA958", expectedTerm: "T3" },
  { airline: "Lion Air", cs: "LNI712", expectedTerm: "T1" },
  { airline: "Batik Air", cs: "BTK6521", expectedTerm: "T2" },
  { airline: "AirAsia", cs: "AWQ501", expectedTerm: "T2" }
];

testPairs.forEach(({ airline, cs, expectedTerm }) => {
  const assigned = assignRealisticGate(airline, cs);
  assert(assigned, `Gate assigned for ${airline}`);
  assert.strictEqual(assigned.terminal, expectedTerm, `Expected ${airline} to park at ${expectedTerm}, got ${assigned.terminal} (Gate ${assigned.ref})`);
  console.log(`✓ Airline Allocation: ${airline.padEnd(19)} -> ${assigned.terminal} (Gate ${assigned.ref})`);
});

// 3. Verify Taxi-In pathfinding from Runway Exits to sample gates across all terminals
const rwys = ["25R", "25L", "07L", "07R"];
const sampleGateRefs = ["A3", "B2", "C5", "D4", "E1", "F6", "1", "5", "10", "16"];

let verifiedRoutes = 0;
rwys.forEach(rwy => {
  const taxiIn = wiii.taxi_in_routes[rwy];
  const exitPt = taxiIn.exit_point;
  sampleGateRefs.forEach(gRef => {
    const g = gates.find(x => x.ref === gRef);
    const path = findTaxiwayPath(exitPt[0], exitPt[1], g.lat, g.lon);
    assert(path && path.length > 5, `Failed path from RWY ${rwy} to Gate ${gRef}`);
    verifiedRoutes++;
  });
});

console.log(`✓ Verified ${verifiedRoutes}/${rwys.length * sampleGateRefs.length} dynamic taxiway routes across complex intersections`);
console.log("\n>>> ALL MULTI-TERMINAL & DYNAMIC ROUTING TESTS PASSED 100% <<<");
