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
console.log("✓ PASS: Backend Academy Syllabus contains full progression (IFR, Pushback, Taxi, Lineup, Takeoff, ILS, Holding, Go-Around)");

// 2. Validate Interactive Tutorial Engine in academy.js
const academyJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/js/academy.js', 'utf8');

// Global mock DOM environment
let domElements = {
  'pane-ground': { getBoundingClientRect: () => ({ top: 100, left: 50, width: 400, height: 300 }), scrollIntoView: () => {} },
  'pane-tma': { getBoundingClientRect: () => ({ top: 100, left: 460, width: 400, height: 300 }), scrollIntoView: () => {} },
  'flight-strips-panel': { getBoundingClientRect: () => ({ top: 50, left: 900, width: 250, height: 600 }), scrollIntoView: () => {} },
  'tutorial-spotlight-overlay': { classList: { add: () => {}, remove: () => {} } },
  'tutorial-spotlight-box': { style: {}, classList: { add: () => {}, remove: () => {} } },
  'tutorial-guidance-card': { classList: { add: () => {}, remove: () => {} } },
  'tutorial-step-indicator': { textContent: '' },
  'tutorial-lesson-title': { textContent: '' },
  'tutorial-step-title': { textContent: '' },
  'tutorial-step-desc': { textContent: '' },
  'tutorial-next-btn': { innerHTML: '' },
  'academy-tutorial-grid': { innerHTML: '' }
};

global.document = {
  getElementById: (id) => domElements[id] || { innerHTML: '', textContent: '', className: '', classList: { add: () => {}, remove: () => {} } }
};
global.switchTab = (tab) => {
  // console.log(`[TAB] Switched to ${tab}`);
};

// Load academy.js in global context
const vm = require('vm');
vm.runInThisContext(academyJs);

// TEST 1: Tutorial Lessons Structure
console.log("\n--- TEST 1: Interactive Tutorial Syllabus & Structure ---");
assert.strictEqual(TUTORIAL_LESSONS.length, 6, "Must define exactly 6 structured tutorial modules (Lessons 1-6)");

const l1 = TUTORIAL_LESSONS[0];
assert.strictEqual(l1.id, "lesson-1");
assert.ok(l1.title.includes("Lesson 1: Pengenalan Radar"), "Lesson 1 covers Radar");
assert.strictEqual(l1.steps.length, 4, "Lesson 1 has 4 interactive steps");

const l2 = TUTORIAL_LESSONS[1];
assert.strictEqual(l2.id, "lesson-2");
assert.ok(l2.title.includes("Lesson 2: Komunikasi Radio"), "Lesson 2 covers Radio Phraseology");

const l3 = TUTORIAL_LESSONS[2];
assert.strictEqual(l3.id, "lesson-3");
assert.ok(l3.title.includes("Lesson 3: Ground Control"), "Lesson 3 covers Ground Pushback & Taxi");

const l4 = TUTORIAL_LESSONS[3];
assert.strictEqual(l4.id, "lesson-4");
assert.ok(l4.title.includes("Lesson 4: Tower Control"), "Lesson 4 covers Lineup & Takeoff/Landing");

const l5 = TUTORIAL_LESSONS[4];
assert.strictEqual(l5.id, "lesson-5");
assert.ok(l5.title.includes("Lesson 5: Approach Control"), "Lesson 5 covers STAR & ILS");

const l6 = TUTORIAL_LESSONS[5];
assert.strictEqual(l6.id, "lesson-6");
assert.ok(l6.title.includes("Lesson 6: Emergency"), "Lesson 6 covers Go-around & Holding");

console.log("✓ PASS: All 6 interactive tutorial syllabus lessons verified!");

// TEST 2: Spotlight Engine & Step Navigation
console.log("\n--- TEST 2: Interactive Spotlight Walkthrough Progression ---");
startInteractiveTutorial("lesson-1");
assert.strictEqual(isTutorialOverlayActive, true, "Overlay active");
assert.strictEqual(currentTutorialStepIndex, 0, "Starts at step 0");
assert.strictEqual(domElements['tutorial-step-indicator'].textContent, "Langkah 1 dari 4");
assert.strictEqual(domElements['tutorial-step-title'].textContent, "1. Ground Radar (ASDE)");
console.log(`✓ Step 1 Spotlight: "${domElements['tutorial-step-title'].textContent}"`);

nextTutorialStep();
assert.strictEqual(currentTutorialStepIndex, 1, "Advanced to step 1");
assert.strictEqual(domElements['tutorial-step-indicator'].textContent, "Langkah 2 dari 4");
assert.strictEqual(domElements['tutorial-step-title'].textContent, "2. Terminal Radar (TMA)");
console.log(`✓ Step 2 Spotlight: "${domElements['tutorial-step-title'].textContent}"`);

nextTutorialStep();
assert.strictEqual(currentTutorialStepIndex, 2, "Advanced to step 2");
assert.strictEqual(domElements['tutorial-step-title'].textContent, "3. Electronic Flight Progress Strips");
console.log(`✓ Step 3 Spotlight: "${domElements['tutorial-step-title'].textContent}"`);

prevTutorialStep();
assert.strictEqual(currentTutorialStepIndex, 1, "Navigated back to step 1");
console.log(`✓ Prev step works: back to step ${currentTutorialStepIndex + 1}`);

// Advance to finish
nextTutorialStep(); // to step 2
nextTutorialStep(); // to step 3 (last step)
assert.strictEqual(currentTutorialStepIndex, 3);
assert.ok(domElements['tutorial-next-btn'].innerHTML.includes("Selesai"), "Next button changes to 'Selesai' on final step");
nextTutorialStep(); // finishes
assert.strictEqual(isTutorialOverlayActive, false, "Tutorial completed and closed overlay");
console.log("✓ PASS: Step-by-step navigation, spotlight focus, and completion flow verified!");

console.log("\n=======================================================");
console.log("ALL MILESTONE 7 ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");
