// Dry Run Test for Milestone 7: Learning Academy & Guided Training
const assert = require('assert');
const fs = require('fs');

console.log("=== DRY RUN TEST: MILESTONE 7 (LEARNING ACADEMY & GUIDED TRAINING) ===");

// 1. Validate Backend Lessons Syllabus in app.py
const appPy = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/app.py', 'utf8');
assert.ok(appPy.includes('"id": "del-1"'), "Contains IFR Clearance Lesson (del-1)");
assert.ok(appPy.includes('"id": "gnd-1"'), "Contains Pushback Lesson (gnd-1)");
assert.ok(appPy.includes('"id": "gnd-2"'), "Contains Taxi Lesson (gnd-2)");
assert.ok(appPy.includes('"id": "twr-1"'), "Contains Line Up & Wait Lesson (twr-1)");
assert.ok(appPy.includes('"id": "twr-2"'), "Contains Takeoff Clearance Lesson (twr-2)");
assert.ok(appPy.includes('"id": "app-1"'), "Contains ILS Approach Clearance Lesson (app-1)");
assert.ok(appPy.includes('"id": "app-2"'), "Contains Holding Pattern Lesson (app-2)");
assert.ok(appPy.includes('"id": "emg-1"'), "Contains Go-Around Missed Approach Lesson (emg-1)");
assert.ok(appPy.includes('Cleared Surabaya, DOLTA 1C'), "Validates concise ICAO departure readback");
assert.ok(appPy.includes('Taxi holding point runway 25R'), "Validates concise ICAO taxi readback");
console.log("✓ PASS: Backend Academy Syllabus contains full progression (IFR, Pushback, Taxi, Lineup, Takeoff, ILS, Holding, Go-Around)");

// 2. Validate Interactive Hands-on Scenario Engine in academy.js
const academyJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/js/academy.js', 'utf8');

// Global mock DOM environment
global.aircraft = [];
global.selectedAircraftIndex = -1;
global.renderFlightStrips = () => {};
global.renderAllScreens = () => {};
global.updateEasyModePrompter = () => {};
global.handleRadarVoiceCommand = () => {};
global.logTelemetry = () => {};

let domElements = {
  'academy-tutorial-grid': { innerHTML: '' },
  'practice-mission-hud': { classList: { add: () => {}, remove: () => {} }, innerHTML: '' },
  'practice-success-modal': { classList: { add: () => {}, remove: () => {} }, innerHTML: '' }
};

global.document = {
  body: { appendChild: () => {} },
  createElement: () => ({ classList: { add: () => {}, remove: () => {} }, innerHTML: '', style: {} }),
  getElementById: (id) => domElements[id] || { innerHTML: '', textContent: '', className: '', classList: { add: () => {}, remove: () => {} } }
};
global.switchTab = (tab) => {
  // console.log(`[TAB] Switched to ${tab}`);
};

// Load academy.js in global context
const vm = require('vm');
vm.runInThisContext(academyJs);

// TEST 1: Hands-on Scenarios Structure
console.log("\n--- TEST 1: Interactive Hands-on Scenarios Syllabus ---");
assert.strictEqual(INTERACTIVE_SCENARIOS.length, 6, "Must define exactly 6 hands-on practice missions");

const s1 = INTERACTIVE_SCENARIOS[0];
assert.strictEqual(s1.id, "lesson-1");
assert.ok(s1.title.includes("Lesson 1: Pengenalan Radar"), "Lesson 1 covers Radar");

const s2 = INTERACTIVE_SCENARIOS[1];
assert.strictEqual(s2.id, "lesson-2");
assert.ok(s2.title.includes("Lesson 2: Komunikasi Radio"), "Lesson 2 covers Radio Phraseology & IFR");

const s3 = INTERACTIVE_SCENARIOS[2];
assert.strictEqual(s3.id, "lesson-3");
assert.ok(s3.title.includes("Lesson 3: Ground Control"), "Lesson 3 covers Ground Pushback & Taxi");

const s4 = INTERACTIVE_SCENARIOS[3];
assert.strictEqual(s4.id, "lesson-4");
assert.ok(s4.title.includes("Lesson 4: Tower Control"), "Lesson 4 covers Lineup & Takeoff");

const s5 = INTERACTIVE_SCENARIOS[4];
assert.strictEqual(s5.id, "lesson-5");
assert.ok(s5.title.includes("Lesson 5: Approach Control"), "Lesson 5 covers STAR & ILS");

const s6 = INTERACTIVE_SCENARIOS[5];
assert.strictEqual(s6.id, "lesson-6");
assert.ok(s6.title.includes("Lesson 6: Emergency"), "Lesson 6 covers Go-around");

console.log("✓ PASS: All 6 hands-on interactive scenarios verified!");

// TEST 2: Hands-on Mission Execution & Aircraft Spawning
console.log("\n--- TEST 2: Mission Launch, Aircraft Spawning & Objective Evaluation ---");

// Test Mission 1: Select Aircraft Target
startHandsOnScenario("lesson-1");
assert.strictEqual(global.aircraft.length, 1, "Scenario spawned 1 target aircraft GIA502");
assert.strictEqual(global.aircraft[0].id, "GIA502");
assert.strictEqual(s1.checkSuccess(), false, "Not completed before user selects aircraft");

// User selects aircraft
global.selectedAircraftIndex = 0;
assert.strictEqual(s1.checkSuccess(), true, "Objective completed when user clicks strip / selects aircraft");
console.log(`✓ Mission 1 Success Evaluator: "${s1.successMessage}"`);

// Test Mission 3: Ground Pushback & Taxi
startHandsOnScenario("lesson-3");
assert.strictEqual(global.aircraft[0].state, "PARKED");
assert.strictEqual(s3.checkSuccess(), false, "Not completed while parked");

// Controller approves pushback
global.aircraft[0].state = "PUSHBACK";
assert.strictEqual(s3.checkSuccess(), true, "Objective completed when pushback starts");
console.log(`✓ Mission 3 Success Evaluator: "${s3.successMessage}"`);

// Test Mission 6: Emergency Go-Around
startHandsOnScenario("lesson-6");
assert.strictEqual(global.aircraft[0].state, "FINAL");
assert.strictEqual(s6.checkSuccess(), false, "Not completed while on final");

// Controller issues Go-Around
global.aircraft[0].state = "GO_AROUND";
assert.strictEqual(s6.checkSuccess(), true, "Objective completed when aircraft executes Go-Around");
console.log(`✓ Mission 6 Success Evaluator: "${s6.successMessage}"`);

quitPracticeScenario();
assert.strictEqual(activePracticeScenario, null, "Scenario quit successfully");

console.log("\n=======================================================");
console.log("ALL HANDS-ON ACADEMY ACCEPTANCE TESTS PASSED (100%)!");
console.log("=======================================================");
