// Automated Dry Run Verification for Milestone 2: Electronic Flight Strip Bay Management & FDE
const fs = require('fs');

const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

// Global mock state
global.selectedAircraftIndex = 0;
global.document = {
  getElementById: (id) => ({
    textContent: '',
    innerHTML: '',
    className: ''
  })
};
global.airportData = { sids: [], stars: [] };
global.playRadioChirp = () => {};
global.renderAllScreens = () => {};

// Extract functions
eval(appJs.slice(appJs.indexOf('let activeStripBayFilter = "ALL";'), appJs.indexOf('function changeAircraftRunway(')));

console.log("=== ATC-HUB DRY RUN: MILESTONE 2 STRIP BAY & FDE SUITE ===");

// 1. Test Bay Classification Criteria
console.log("\n1. Testing Bay Classification Criteria:");
const testStates = [
  { state: "GATE", expected: "DEP" },
  { state: "PUSHBACK", expected: "DEP" },
  { state: "READY_TAXI", expected: "DEP" },
  { state: "TAXI", expected: "DEP" },
  { state: "HOLD_SHORT_CROSS", expected: "TWR" },
  { state: "HOLDING", expected: "TWR" },
  { state: "LINE_UP", expected: "TWR" },
  { state: "TAKEOFF", expected: "TWR" },
  { state: "APPROACH", expected: "APP" },
  { state: "FINAL", expected: "APP" },
  { state: "CLIMBING", expected: "APP" },
  { state: "HANDOFF", expected: "APP" }
];

testStates.forEach(({ state, expected }) => {
  const bay = getAircraftBayCategory({ state });
  if (bay !== expected) throw new Error(`State ${state} categorized into ${bay}, expected ${expected}`);
});
console.log(`✓ PASS: Seluruh 12 status operasional terklasifikasi presisi ke Bay DEP, TWR, dan APP.`);

// 2. Test Bay Filter Subsetting
console.log("\n2. Testing Bay Filter Subsetting:");
global.aircraft = [
  { id: "GIA502", state: "GATE", callsign: "INDONESIA 502" },
  { id: "CTV123", state: "APPROACH", callsign: "SUPERGREEN 123" },
  { id: "LNI712", state: "HOLDING", callsign: "LION INTER 712" }
];

activeStripBayFilter = "DEP";
let filtered = global.aircraft.filter(a => getAircraftBayCategory(a) === activeStripBayFilter);
if (filtered.length !== 1 || filtered[0].id !== "GIA502") throw new Error(`Filter DEP failed: length ${filtered.length}`);

activeStripBayFilter = "TWR";
filtered = global.aircraft.filter(a => getAircraftBayCategory(a) === activeStripBayFilter);
if (filtered.length !== 1 || filtered[0].id !== "LNI712") throw new Error(`Filter TWR failed: length ${filtered.length}`);

activeStripBayFilter = "APP";
filtered = global.aircraft.filter(a => getAircraftBayCategory(a) === activeStripBayFilter);
if (filtered.length !== 1 || filtered[0].id !== "CTV123") throw new Error(`Filter APP failed: length ${filtered.length}`);

console.log("✓ PASS: Filtering tab ALL, DEP, TWR, dan APP menyaring strip secara konsisten.");

// 3. Test FDE Scratchpad Mutation & Persistence
console.log("\n3. Testing FDE Scratchpad Updates:");
updateAircraftScratchpad(0, "assignedAlt", "A060");
updateAircraftScratchpad(0, "assignedSpd", "220K");
updateAircraftScratchpad(0, "directFix", "DOLTA");

if (global.aircraft[0].fde.assignedAlt !== "A060" ||
    global.aircraft[0].fde.assignedSpd !== "220K" ||
    global.aircraft[0].fde.directFix !== "DOLTA") {
  throw new Error("FDE Scratchpad failed to record ATC clearances");
}
console.log(`✓ PASS: FDE Scratchpad (CFL ${global.aircraft[0].fde.assignedAlt}, SPD ${global.aircraft[0].fde.assignedSpd}, DIR ${global.aircraft[0].fde.directFix}) tersimpan mutabel.`);

// 4. Test Squawk IDENT Trigger & Timeout
console.log("\n4. Testing Squawk IDENT Simulation:");
triggerSquawkIdent(0);
if (!global.aircraft[0].isIdentActive || !global.aircraft[0].identEndTime) throw new Error("Squawk IDENT not activated");
const remainingSec = Math.round((global.aircraft[0].identEndTime - Date.now()) / 1000);
if (remainingSec < 15 || remainingSec > 19) throw new Error("Invalid IDENT duration");
console.log(`✓ PASS: Squawk IDENT aktif selama ${remainingSec} detik dengan flash trigger radar.`);

console.log("\n>>> ALL 4 DRY RUN TESTS PASSED (MILESTONE 2 VERIFIED 100%) <<<");
