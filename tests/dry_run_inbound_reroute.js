// Automated Dry Run Verification for Dynamic Inbound Runway Re-routing & Taxi-In Connectivity
const fs = require('fs');

const wiii = JSON.parse(fs.readFileSync('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'utf8'));
const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

global.airportData = wiii;
global.calculateDistanceNm = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLam = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

eval(appJs.slice(appJs.indexOf('function calculateStarArrivalPath('), appJs.indexOf('function executeApproachMovement(')));

console.log("=== DRY RUN: INBOUND RUNWAY REROUTING & TAXI-IN CONNECTIVITY ===");

const runways = ["25R", "25L", "07L", "07R", "24", "06"];
let allPassed = true;

runways.forEach(rwyKey => {
  const starCoords = [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];
  const path = calculateStarArrivalPath(starCoords, rwyKey);
  const touchdown = path.find(p => p.desc === "TOUCHDOWN");
  const lastRoll = path[path.length - 1];

  const mech = wiii.runway_mechanisms[rwyKey];
  const taxiIn = wiii.taxi_in_routes[rwyKey];

  if (!mech) throw new Error(`Missing mechanism for ${rwyKey}`);
  if (!taxiIn) throw new Error(`Missing taxi_in_routes for ${rwyKey}`);

  // Test 1: Touchdown matches threshold
  const dTouchdown = Math.hypot(touchdown.lat - mech.threshold.lat, touchdown.lon - mech.threshold.lon);
  if (dTouchdown > 0.0001) {
    console.error(`FAIL: ${rwyKey} touchdown does not match threshold!`);
    allPassed = false;
  }

  // Test 2: Last rollout node matches taxi-in exit point (within 15 meters)
  const exitPoint = taxiIn.exit_point;
  const dExit = Math.hypot(lastRoll.lat - exitPoint[0], lastRoll.lon - exitPoint[1]) * 111139; // meters
  if (dExit > 15) {
    console.error(`FAIL: ${rwyKey} last roll node is ${dExit.toFixed(1)}m away from taxi-in exit point!`);
    allPassed = false;
  }

  // Test 3: Taxi-in route connects seamlessly to gate
  const lastTaxiNode = taxiIn.coords[taxiIn.coords.length - 1];
  const dGate = Math.hypot(lastTaxiNode[0] - (-6.121757), lastTaxiNode[1] - 106.651077) * 111139;
  if (dGate > 5) {
    console.error(`FAIL: ${rwyKey} taxi-in does not end at Gate E1!`);
    allPassed = false;
  }

  console.log(`✓ RWY ${rwyKey}: Path points = ${path.length}, Rollout Exit Gap = ${dExit.toFixed(1)}m, Taxi-In Nodes = ${taxiIn.coords.length} -> Gate E1`);
});

if (allPassed) {
  console.log("\n>>> ALL 6 RUNWAYS CONNECTIVITY & REROUTING VERIFIED 100% <<<");
} else {
  process.exit(1);
}
