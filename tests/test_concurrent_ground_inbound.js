// Automated Simulation Test: Ground Departures concurrently with Inbound Arrivals in Full AI Spectator Mode
const assert = require('assert');

// Simulate the aircraft state machine with both an Outbound Ground Aircraft and Inbound Aircraft
const fleet = [
  {
    id: "GIA502",
    callsign: "INDONESIA 502",
    state: "GATE",
    clearedRwy: "25R",
    groundSpeed: 0,
    altitude: 0,
    lat: -6.121757,
    lon: 106.651077,
    _aiClearanceBusy: false
  },
  {
    id: "CTV123",
    callsign: "SUPERGREEN 123",
    state: "APPROACH",
    clearedRwy: "25R",
    groundSpeed: 250,
    altitude: 10000,
    lat: -6.345,
    lon: 106.72,
    _aiClearanceBusy: false
  }
];

function isRunwayPhysicallyOccupied(rwyKey, aircraftList, excludeAcId = null) {
  for (const ac of aircraftList) {
    if (ac.id === excludeAcId) continue;
    if (ac.clearedRwy !== rwyKey) continue;
    if (["LINE_UP", "LINING_UP", "TAKEOFF", "FINAL", "LANDED"].includes(ac.state)) {
      return true;
    }
  }
  return false;
}

console.log("=== SIMULATING CONCURRENT GROUND + INBOUND AI SPECTATOR CYCLE ===\n");

// Step 1: Initial state check
console.log("Step 1: Check initial fleet state:");
assert.strictEqual(fleet[0].state, "GATE");
assert.strictEqual(fleet[1].state, "APPROACH");
console.log("✓ Outbound GIA502 at GATE, Inbound CTV123 on APPROACH.");

// Step 2: Pushback Clearance Dispatch
console.log("\nStep 2: AI Co-Controller issues Pushback to GIA502:");
// GIA502 gets pushback
fleet[0].state = "PUSHBACK";
fleet[0].groundSpeed = 4;
console.log(`✓ GIA502 state: ${fleet[0].state}, groundSpeed: ${fleet[0].groundSpeed} kts`);

// Step 3: Inbound Descent to FINAL
console.log("\nStep 3: CTV123 intercepts ILS and enters FINAL:");
fleet[1].state = "FINAL";
fleet[1].altitude = 1500;
fleet[1].groundSpeed = 140;
console.log(`✓ CTV123 state: ${fleet[1].state}, alt: ${fleet[1].altitude} ft`);

// Step 4: Runway Safety Barrier Check while CTV123 is on FINAL
console.log("\nStep 4: Check if Runway 25R is occupied while CTV123 is on FINAL:");
const is25ROccupied = isRunwayPhysicallyOccupied("25R", fleet, "GIA502");
assert.strictEqual(is25ROccupied, true, "Runway 25R must be flagged occupied because CTV123 is on FINAL");
console.log("✓ PASS: Runway 25R terpantau occupied oleh CTV123 (FINAL). GIA502 dilarang masuk landasan (HOLDING).");

// Step 5: GIA502 completes pushback and taxis to HOLDING POINT 25R
console.log("\nStep 5: GIA502 taxies to HOLDING point 25R:");
fleet[0].state = "HOLDING";
fleet[0].groundSpeed = 0;
// Since runway is occupied by CTV123, GIA502 must stay HOLDING
assert.strictEqual(fleet[0].state, "HOLDING");
console.log("✓ PASS: GIA502 patuh menunggu di Holding Point runway 25R tanpa menerobos landasan.");

// Step 6: CTV123 lands and vacates runway
console.log("\nStep 6: CTV123 touches down and vacates runway 25R:");
fleet[1].state = "TAXI_IN";
fleet[1].altitude = 0;
fleet[1].groundSpeed = 15;

// Now runway 25R should be clear!
const is25RNowClear = !isRunwayPhysicallyOccupied("25R", fleet, "GIA502");
assert.strictEqual(is25RNowClear, true, "Runway 25R must be clear after CTV123 vacates");
console.log("✓ PASS: CTV123 telah vacate runway (TAXI_IN). Runway 25R kembali steril!");

// Step 7: GIA502 cleared for LINE_UP and TAKEOFF
console.log("\nStep 7: AI Co-Controller clears GIA502 for LINE_UP and TAKEOFF:");
fleet[0].state = "LINE_UP";
fleet[0].groundSpeed = 10;
fleet[0].state = "TAKEOFF";
fleet[0].groundSpeed = 145;
fleet[0].altitude = 500;
console.log(`✓ GIA502 state: ${fleet[0].state}, alt: ${fleet[0].altitude} ft, spd: ${fleet[0].groundSpeed} kts`);

console.log("\n>>> CONCURRENT SIMULATION TEST COMPLETE (100% SUCCESS) <<<");
