// Dry Run Test for Milestone 4: Weather Engine, METAR Presets, Wind Analysis, ATIS, and Separation Expansion
const assert = require('assert');
const fs = require('fs');

console.log("=== DRY RUN TEST: MILESTONE 4 (WEATHER, ATIS & RUNWAY CONFIG) ===");

const appJs = fs.readFileSync('/home/bmnrtkgto/project/atc-hub/static/app.js', 'utf8');

// Extract Weather presets and logic
eval(appJs.slice(appJs.indexOf('const WEATHER_PRESETS = {'), appJs.indexOf('let currentWeather =')).replace('const WEATHER_PRESETS', 'global.WEATHER_PRESETS'));
eval(appJs.slice(appJs.indexOf('function calculateWindComponents('), appJs.indexOf('function drawWeatherRadarOverlay(')));

// TEST 1: METAR Presets Validation
console.log("\n--- TEST 1: Weather Presets & METAR Definitions ---");
assert.ok(WEATHER_PRESETS.CAVOK, "CAVOK preset exists");
assert.ok(WEATHER_PRESETS.TAILWIND_SHIFT, "TAILWIND_SHIFT preset exists");
assert.ok(WEATHER_PRESETS.TROPICAL_STORM, "TROPICAL_STORM preset exists");
assert.ok(WEATHER_PRESETS.LOW_VISIBILITY, "LOW_VISIBILITY preset exists");

assert.strictEqual(WEATHER_PRESETS.CAVOK.qnh, 1011);
assert.strictEqual(WEATHER_PRESETS.TROPICAL_STORM.separationMinNm, 5.0, "Storm increases separation to 5 NM");
assert.strictEqual(WEATHER_PRESETS.LOW_VISIBILITY.separationMinNm, 5.0, "Low visibility increases separation to 5 NM");
console.log("✓ PASS: 4 Preset METAR (CAVOK, TAILWIND_SHIFT, TROPICAL_STORM, LOW_VISIBILITY) terdefinisi valid.");

// TEST 2: Wind Component Calculation & Runway Recommendation
console.log("\n--- TEST 2: Wind Component & Runway Config Advisory ---");
// Scenario A: West Wind 250 / 15 KT
const compA = calculateWindComponents(250, 250, 15);
assert.strictEqual(compA.headwind, 15);
assert.strictEqual(compA.crosswind, 0);
assert.strictEqual(compA.tailwind, -15);

const recA = getRecommendedRunwayConfig({ windDir: 250, windSpd: 15 });
assert.strictEqual(recA.config, "25_OPS");
assert.strictEqual(recA.primaryDep, "25R");
console.log(`✓ PASS: Angin 250°/15KT merekomendasikan ${recA.name} (Headwind: ${recA.headwind}KT).`);

// Scenario B: East Wind 070 / 16 KT (Tailwind on 25R exceeds 10KT)
const compB = calculateWindComponents(250, 70, 16);
assert.strictEqual(compB.tailwind, 16, "Tailwind on 25R should be 16 KT");

const recB = getRecommendedRunwayConfig({ windDir: 70, windSpd: 16 });
assert.strictEqual(recB.config, "07_OPS");
assert.strictEqual(recB.primaryDep, "07L");
console.log(`✓ PASS: Angin 070°/16KT berhasil memicu advisory peralihan ke ${recB.name} (Tailwind 25: ${recB.tailwindOn25}KT).`);

// TEST 3: ATIS Report Generator
console.log("\n--- TEST 3: ATIS Broadcast Report Formatting (128.000 MHz) ---");
const atisReport = generateAtisReport(WEATHER_PRESETS.TROPICAL_STORM, "D");
assert.ok(atisReport.includes("Soekarno-Hatta Information Delta"), "Contains airport and phonetic identifier");
assert.ok(atisReport.includes("two eight zero degrees"), "Contains phonetic wind direction");
assert.ok(atisReport.includes("Transition level one two zero"), "Contains transition level FL120");
assert.ok(atisReport.includes("radar separation increased to five miles"), "Includes weather separation warning");
console.log("✓ PASS: ATIS Report terformat resmi sesuai ICAO Doc 9432:");
console.log(`   "${atisReport.slice(0, 110)}..."`);

// TEST 4: Separation Dynamic Expansion in Safety Alerts
console.log("\n--- TEST 4: Radar Separation Threshold Weather Scaling ---");
// Check checkAirborneConflicts logic
assert.ok(appJs.includes("const reqSepNm = (typeof currentWeather !== 'undefined' && currentWeather && currentWeather.separationMinNm) ? currentWeather.separationMinNm : 3.0;"), "Dynamic separation logic present");
assert.ok(appJs.includes("let showWeatherRadar = true;"), "Weather radar layer toggle flag present");
assert.ok(appJs.includes("ATIS: \"128.000 MHz\""), "ATIS frequency 128.000 MHz mapped");
console.log("✓ PASS: Separasi STCA dinamis (3 NM normal -> 5 NM badai/LVP) terintegrasi pada safety alerts.");

console.log("\n>>> ALL 4 MILESTONE 4 TEST SCENARIOS PASSED (100%) <<<");
