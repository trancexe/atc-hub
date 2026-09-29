// Dry Run Test for Milestone 6: Arrival Sequencer (AMAN) & Holding Pattern
const assert = require('assert');
const fs = require('fs');

console.log("=== DRY RUN TEST: MILESTONE 6 (AMAN & HOLDING PATTERN) ===");

// Global mock context
global.aircraft = [
  {
    id: "GIA502",
    callsign: "INDONESIA 502",
    lat: -6.115,
    lon: 106.850,
    heading: 250,
    altitude: 4000,
    groundSpeed: 180,
    state: "APPROACH",
    clearedRwy: "25R",
    fuelMinutes: 42.0,
    fde: {}
  },
  {
    id: "CTV123",
    callsign: "SUPERGREEN 123",
    lat: -6.120,
    lon: 106.980,
    heading: 250,
    altitude: 7000,
    groundSpeed: 210,
    state: "APPROACH",
    clearedRwy: "25R",
    fuelMinutes: 14.5, // Below 15 min threshold -> Bingo Fuel
    fde: {}
  },
  {
    id: "LNI712",
    callsign: "LION INTER 712",
    lat: -6.130,
    lon: 107.150,
    heading: 250,
    altitude: 10000,
    groundSpeed: 230,
    state: "APPROACH",
    clearedRwy: "25R",
    fuelMinutes: 55.0,
    fde: {}
  }
];

global.airportData = {
  runway_mechanisms: {
    "25R": {
      threshold: { lat: -6.108959, lon: 106.669062 }
    }
  }
};

global.selectedAircraftIndex = 0;
global.renderFlightStrips = () => {};
global.renderAllScreens = () => {};
global.updateEasyModePrompter = () => {};
global.speakPilotReadback = () => {};
global.logTelemetry = (cat, title, desc) => {
  // console.log(`[TELEMETRY] [${cat}] ${title} - ${desc}`);
};
global.document = {
  getElementById: (id) => ({
    innerHTML: '',
    textContent: '',
    className: '',
    classList: { add: () => {}, remove: () => {} }
  })
};

// Distance calculation mock
global.calculateDistanceNm = function(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Load aman.js module
const amanJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/js/aman.js', 'utf8');
eval(amanJs);

// TEST 1: AMAN Arrival Sequencing & ELDT Calculation
console.log("\n--- TEST 1: AMAN Arrival Sequencing & ELDT Calculation ---");
const seq = calculateAmanArrivalSequence();
assert.strictEqual(seq.length, 3, "All 3 arrival flights sequenced");
assert.strictEqual(seq[0].id, "GIA502", "GIA502 is #1 on sequence (closest to threshold)");
assert.strictEqual(seq[1].id, "CTV123", "CTV123 is #2 on sequence");
assert.strictEqual(seq[2].id, "LNI712", "LNI712 is #3 on sequence");
assert.ok(seq[0].distNm < seq[1].distNm && seq[1].distNm < seq[2].distNm, "Distances monotonically increasing");
console.log(`✓ PASS: Sequence verified: #1 ${seq[0].id} (ELDT ${seq[0].eldtStr}), #2 ${seq[1].id} (ELDT ${seq[1].eldtStr}), #3 ${seq[2].id} (ELDT ${seq[2].eldtStr})`);

// TEST 2: Spacing Advisor Recommendations
console.log("\n--- TEST 2: Spacing Advisor Recommendations ---");
assert.ok(seq[0].spacingAdvice.includes("NUMBER 1"), "Lead aircraft advised as Number 1");
console.log(`✓ Lead Aircraft Advice: "${seq[0].spacingAdvice}"`);
console.log(`✓ Trailing Aircraft #2 Advice: "${seq[1].spacingAdvice}"`);
console.log(`✓ Trailing Aircraft #3 Advice: "${seq[2].spacingAdvice}"`);
assert.ok(seq[1].spacingAdvice.length > 0, "Trailing aircraft received tactical spacing advisory");

// TEST 3: Slot Reordering (Manual Drag & Drop or Priority Swap)
console.log("\n--- TEST 3: Slot Assignment & Priority Reordering ---");
// Move LNI712 from position #3 (index 2) to position #1 (index 0)
reorderAmanSlot(2, 0);
const newSeq = calculateAmanArrivalSequence();
assert.strictEqual(newSeq[0].id, "LNI712", "LNI712 successfully promoted to #1 in arrival sequence");
assert.strictEqual(newSeq[1].id, "GIA502", "GIA502 now in slot #2");
assert.strictEqual(newSeq[2].id, "CTV123", "CTV123 now in slot #3");
console.log(`✓ PASS: Priority slot reordered: #1 ${newSeq[0].id} -> #2 ${newSeq[1].id} -> #3 ${newSeq[2].id}`);

// Reset manual order
amanManualOrder = [];

// TEST 4: Holding Pattern Entry & Kinematics
console.log("\n--- TEST 4: Holding Pattern Entry (TEGID FL100) ---");
const rbHold = issueHoldingPattern(1, "TEGID", "FL100");
const acHold = global.aircraft[1];
assert.strictEqual(acHold.state, "HOLDING_AIR", "Aircraft state set to HOLDING_AIR");
assert.strictEqual(acHold.isHolding, true, "isHolding flag active");
assert.strictEqual(acHold.holdFix, "TEGID", "Holding fix set to TEGID");
assert.strictEqual(acHold.holdLevel, "FL100", "Holding flight level set to FL100");
assert.strictEqual(acHold.altitude, 10000, "Altitude leveled at 10,000 ft");
assert.strictEqual(acHold.fde.directFix, "H/TEGID", "FDE strip reflects holding fix H/TEGID");
assert.ok(rbHold.includes("Hold at TEGID"), "Pilot readback conforms to ICAO holding clearance");
console.log(`✓ PASS: Holding clearance issued: "${rbHold}"`);

// TEST 5: Holding Stack Management
console.log("\n--- TEST 5: Holding Stack Allocation ---");
const stackSeq = calculateAmanArrivalSequence();
const holdingList = stackSeq.filter(s => s.isHolding);
assert.strictEqual(holdingList.length, 1, "1 aircraft registered in holding stack");
assert.strictEqual(holdingList[0].holdLevel, "FL100", "Aircraft stacked at FL100");
console.log(`✓ PASS: Holding Stack reflects ${holdingList[0].id} holding at fix ${holdingList[0].holdFix} level ${holdingList[0].holdLevel}`);

// TEST 6: Leave Holding Clearance & Resume Approach
console.log("\n--- TEST 6: Leave Holding Clearance ---");
const rbLeave = leaveHoldingPattern(1);
assert.strictEqual(acHold.isHolding, false, "isHolding flag cleared");
assert.strictEqual(acHold.state, "APPROACH", "State transitioned back to APPROACH");
assert.strictEqual(acHold.fde.assignedAlt, "A030", "Cleared descend to 3000 ft (A030)");
assert.ok(rbLeave.includes("Leave holding, resume approach"), "Pilot readback confirms approach resumption");
console.log(`✓ PASS: Hold exit clearance issued: "${rbLeave}"`);

// TEST 7: Fuel & Endurance Timer & Bingo Advisory
console.log("\n--- TEST 7: Fuel Remaining & Bingo Fuel Advisory ---");
updateAircraftFuelEndurance();
assert.ok(global.aircraft[1].fuelMinutes < 15.0, "CTV123 fuel endurance correctly recognized under 15 mins");
assert.strictEqual(global.aircraft[1]._bingoAlerted, true, "Bingo fuel advisory safety event triggered");
console.log(`✓ PASS: CTV123 Endurance ${global.aircraft[1].fuelMinutes.toFixed(1)} mins -> Bingo fuel advisory successfully fired!`);

console.log("\n=======================================================");
console.log("ALL 7 MILESTONE 6 ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");
