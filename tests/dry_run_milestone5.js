// Dry Run Test for Milestone 5: Tactical Conflict Resolution & Separation Tools
const assert = require('assert');
const fs = require('fs');

console.log("=== DRY RUN TEST: MILESTONE 5 (TACTICAL CONFLICT RESOLUTION) ===");

const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

// Global mock context
global.aircraft = [
  {
    id: "GIA502",
    callsign: "INDONESIA 502",
    lat: -6.115,
    lon: 106.660,
    heading: 250,
    altitude: 1500,
    groundSpeed: 160,
    state: "FINAL",
    clearedRwy: "25R",
    fde: {}
  },
  {
    id: "CTV123",
    callsign: "SUPERGREEN 123",
    lat: -6.140,
    lon: 106.610,
    heading: 70,
    altitude: 4000,
    groundSpeed: 240,
    state: "APPROACH",
    clearedRwy: "07L",
    fde: {}
  }
];

global.selectedAircraftIndex = 0;
global.renderFlightStrips = () => {};
global.renderAllScreens = () => {};
global.updateEasyModePrompter = () => {};
global.speakPilotReadback = () => {};
global.document = {
  getElementById: () => ({ innerHTML: '', textContent: '', className: '' })
};

eval(appJs.slice(appJs.indexOf('function calculateDistanceNm('), appJs.indexOf('function checkGroundConflictAhead(')));
eval(appJs.slice(appJs.indexOf('function toggleRulerTool()'), appJs.indexOf('// ==========================================\n// MILESTONE 4')));

// TEST 1: Radar Vectoring
console.log("\n--- TEST 1: Tactical Radar Vectoring ---");
const rbVector = issueRadarVector(1, "180");
assert.strictEqual(global.aircraft[1].heading, 180, "Heading immediately updated to 180");
assert.strictEqual(global.aircraft[1]._tacticalVector, 180, "Tactical vector registered");
assert.strictEqual(global.aircraft[1].fde.directFix, "H180", "FDE directFix updated to H180");
assert.ok(rbVector.includes("Fly heading one eight zero"), "Readback matches standard ICAO phraseology");
console.log(`✓ PASS: Vector heading 180° berhasil ditugaskan ke CTV123: "${rbVector}"`);

// Resume navigation
const rbResume = issueRadarVector(1, "RESUME");
assert.strictEqual(global.aircraft[1]._tacticalVector, null, "Vector cleared on resume");
assert.ok(rbResume.includes("Resuming own navigation"));
console.log(`✓ PASS: Resume navigation berhasil: "${rbResume}"`);

// TEST 2: Speed Control
console.log("\n--- TEST 2: Tactical Speed Control ---");
const rbSpeed = issueSpeedControl(1, "210");
assert.strictEqual(global.aircraft[1].groundSpeed, 210, "Speed immediately set to 210 kts");
assert.strictEqual(global.aircraft[1]._assignedSpeed, 210, "Assigned speed registered");
assert.strictEqual(global.aircraft[1].fde.assignedSpd, "210K", "FDE assignedSpd updated to 210K");
assert.ok(rbSpeed.includes("Maintain speed two one zero knots"), "Readback matches standard speed phraseology");
console.log(`✓ PASS: Speed control 210 kts berhasil: "${rbSpeed}"`);

// TEST 3: Immediate Altitude Step
console.log("\n--- TEST 3: Immediate Altitude Step ---");
const rbAlt = issueAltitudeStep(1, "FL100");
assert.strictEqual(global.aircraft[1].altitude, 10000, "Altitude updated to 10,000 ft (FL100)");
assert.strictEqual(global.aircraft[1].fde.assignedAlt, "FL100", "FDE assignedAlt updated");
assert.ok(rbAlt.includes("FL100"), "Readback contains target FL");
assert.ok(rbAlt.includes("Descend FL100"), "Readback uses concise ICAO verb Descend");
console.log(`✓ PASS: Altitude step FL100 berhasil: "${rbAlt}"`);

// TEST 4: Go-Around / Missed Approach
console.log("\n--- TEST 4: Go-Around / Missed Approach Procedure ---");
const rbGoAround = issueGoAround(0); // GIA502 on FINAL
assert.strictEqual(global.aircraft[0].state, "APPROACH", "State transitioned to APPROACH");
assert.strictEqual(global.aircraft[0].altitude, 3000, "Climb to 3000 ft initiated");
assert.strictEqual(global.aircraft[0].fde.directFix, "MISSED", "FDE marked MISSED");
assert.ok(rbGoAround.includes("Going around, climb to three thousand feet"), "Readback confirms go-around");
console.log(`✓ PASS: Go-Around sukses membatalkan pendaratan GIA502: "${rbGoAround}"`);

// TEST 5: Tactical Ruler Tool (Separation Measuring)
console.log("\n--- TEST 5: Tactical Ruler Separation Calculation ---");
const dist = calculateDistanceNm(global.aircraft[0].lat, global.aircraft[0].lon, global.aircraft[1].lat, global.aircraft[1].lon);
assert.ok(dist > 0, "Distance calculation returns positive value");
console.log(`✓ PASS: Jarak antar target GIA502 & CTV123 terukur presisi: ${dist.toFixed(2)} NM`);

console.log("\n>>> ALL 5 MILESTONE 5 TEST SCENARIOS PASSED (100%) <<<");
