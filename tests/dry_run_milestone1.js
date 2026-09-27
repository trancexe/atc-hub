// Dry Run Test for Milestone 1: STCA (Short Term Conflict Alert) & MSAW (Minimum Safe Altitude Warning)
const fs = require('fs');

const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

// Mock browser environment
global.refLat = -6.125556;
global.refLon = 106.655833;
global.getAudioContext = () => ({
  createOscillator: () => ({ type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {} }),
  createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }),
  currentTime: 0,
  destination: {}
});

// Extract functions fresh from static/app.js
eval(appJs.slice(appJs.indexOf('function calculateDistanceNm('), appJs.indexOf('// Distance in meters on ground')));
eval(appJs.slice(appJs.indexOf('let lastAlertChirpTime = 0;'), appJs.indexOf('function calculateDistanceNm(')));

console.log("=== ATC-HUB DRY RUN: MILESTONE 1 SAFETY SUITE ===");

// TEST SCENARIO 1: Separasi Aman (No Conflict)
// Two aircraft 9 NM apart, 1000 ft vertical separation
global.aircraft = [
  { id: "GIA502", callsign: "INDONESIA 502", lat: -6.10, lon: 106.65, altitude: 4000, groundSpeed: 210, heading: 250, state: "CLIMBING" },
  { id: "CTV123", callsign: "SUPERGREEN 123", lat: -6.25, lon: 106.65, altitude: 5000, groundSpeed: 210, heading: 70, state: "APPROACH" }
];

let res = checkAirborneConflicts();
console.log("\nScenario 1 (Safe Separation - 9 NM apart):");
console.log(`STCA Conflicts: ${res.stcaPairs.length}, MSAW Violations: ${res.msawIds.size}`);
if (res.stcaPairs.length !== 0) throw new Error("Expected 0 conflicts");
if (res.msawIds.size !== 0) throw new Error("Expected 0 MSAW");
console.log("✓ PASS: Separasi aman terdeteksi valid.");

// TEST SCENARIO 2: Immediate Loss of Separation (STCA Active Conflict)
// Two aircraft 1.34 NM apart and at same altitude 3,000 ft (< 3 NM and < 1000 ft)
global.aircraft = [
  { id: "GIA502", callsign: "INDONESIA 502", lat: -6.100, lon: 106.650, altitude: 3000, groundSpeed: 200, heading: 250, state: "CLIMBING" },
  { id: "CTV123", callsign: "SUPERGREEN 123", lat: -6.120, lon: 106.660, altitude: 3200, groundSpeed: 180, heading: 70, state: "APPROACH" }
];

res = checkAirborneConflicts();
console.log("\nScenario 2 (Immediate STCA Loss of Separation):");
console.log(`STCA Conflicts: ${res.stcaPairs.length}`);
if (res.stcaPairs.length > 0) {
  const p = res.stcaPairs[0];
  console.log(`Pair: ${p.ac1.id} & ${p.ac2.id}, Current Dist: ${p.distNm.toFixed(2)} NM, Alt Diff: ${Math.abs(p.ac1.altitude - p.ac2.altitude)} ft`);
}
if (res.stcaPairs.length !== 1) throw new Error("Expected 1 active STCA conflict");
if (!res.conflictingIds.has("GIA502") || !res.conflictingIds.has("CTV123")) throw new Error("Expected both aircraft flagged");
console.log("✓ PASS: Immediate Loss of Separation berhasil memicu STCA Alert.");

// TEST SCENARIO 3: Predictive 60s Lookahead Convergence (STCA Predictive Conflict)
// Aircraft currently 5.0 NM apart (safe > 3 NM), but flying head-on directly towards each other at 220 kts at 4000 ft
// In 60s each covers 3.67 NM towards each other -> collision course
global.aircraft = [
  { id: "LNI712", callsign: "LION INTER 712", lat: -6.10, lon: 106.75, altitude: 4000, groundSpeed: 220, heading: 270, state: "APPROACH" },
  { id: "SIA958", callsign: "SINGAPORE 958", lat: -6.10, lon: 106.67, altitude: 4000, groundSpeed: 220, heading: 90, state: "CLIMBING" }
];

res = checkAirborneConflicts();
const currentDist = calculateDistanceNm(global.aircraft[0].lat, global.aircraft[0].lon, global.aircraft[1].lat, global.aircraft[1].lon);
console.log("\nScenario 3 (Predictive 60-second STCA Convergence):");
console.log(`Current Distance: ${currentDist.toFixed(2)} NM (Safe > 3.0 NM)`);
console.log(`STCA Conflicts Triggered: ${res.stcaPairs.length}`);
if (res.stcaPairs.length > 0) {
  console.log(`Predicted Distance in 60s: ${res.stcaPairs[0].predictedDistNm.toFixed(2)} NM`);
}
if (res.stcaPairs.length !== 1) throw new Error("Expected predictive conflict triggered");
console.log("✓ PASS: Prediksi tabrakan 60 detik ke depan berhasil dideteksi sebelum terjadi loss of separation.");

// TEST SCENARIO 4: MSAW Terrain Warning (Low Altitude outside final approach)
// Aircraft flying at 1,200 ft 20 NM away from airport
global.aircraft = [
  { id: "CLX742", callsign: "CARGOLUX 742", lat: -6.35, lon: 106.75, altitude: 1200, groundSpeed: 220, heading: 320, state: "APPROACH" }
];

res = checkAirborneConflicts();
console.log("\nScenario 4 (MSAW Terrain Warning):");
console.log(`MSAW Flagged IDs:`, Array.from(res.msawIds));
if (!res.msawIds.has("CLX742")) throw new Error("Expected CLX742 flagged for MSAW");
console.log("✓ PASS: Ketinggian di bawah batas aman TMA (1800 ft) memicu peringatan MSAW TERRAIN.");

console.log("\n>>> ALL 4 DRY RUN TESTS PASSED (100% SUCCESS) <<<");
