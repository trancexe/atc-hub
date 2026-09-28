// ATC HUB - Client logic & Web Audio / Multi-Canvas Engine + Easy Mode Copilot

let airportData = null;
let currentTab = 'radar';
let currentLayout = 'split'; // 'split', 'ground', 'tma'
let isEasyMode = true; // Easy mode ON by default

// Canvases
const groundCanvas = document.getElementById('ground-canvas');
const tmaCanvas = document.getElementById('tma-canvas');
const groundCtx = groundCanvas ? groundCanvas.getContext('2d') : null;
const tmaCtx = tmaCanvas ? tmaCanvas.getContext('2d') : null;

// View states for both screens
const viewState = {
  ground: {
    panX: 0,
    panY: 0,
    zoom: 0.35, // Perfect 1x airport overview: displays ALL 3 runways, North/South aprons, concourses & taxiways
    isDragging: false,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0
  },
  tma: {
    panX: 0,
    panY: 0,
    zoom: 0.016, // Perfect 1x TMA overview: displays ALL SIDs, STARs, ATS Airways, and 100NM boundary fixes
    isDragging: false,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0
  }
};

// Airport coordinate center
const refLat = -6.12557;
const refLon = 106.655998;
const BASE_SCALE = 60000;

// Simulation aircraft with Strict ICAO Standard Callsigns & Telephony
// Sole test aircraft: INDONESIA 502 departing from Gate E1 via RWY 25R to COP DOLTA (Jakarta Center South FL240)
let aircraft = [
  {
    id: "GIA502",
    callsign: "INDONESIA 502",
    airline: "Garuda Indonesia",
    type: "B738",
    lat: -6.121757,
    lon: 106.651077,
    heading: 70, // Parked facing concourse Gate E1 (east-northeast)
    altitude: 0,
    groundSpeed: 0,
    targetHeading: 70,
    state: "GATE",
    clearedRwy: "25R",
    squawk: "4215",
    hasCheckedIn: false,
    checkInPhrase: "Jakarta Ground, INDONESIA 502, Gate Echo 1, information Bravo, request push and start.",
    responsePrompt: "Indonesia 502 push and start approved, facing west"
  }
];

let selectedAircraftIndex = 0;
let incomingRadioQueue = [];
let isRadioTransmitting = false;

// Autonomous Waypoints Mission for GIA502 from Gate to Center Handoff
const flightRouteMission = {
  gate: { lat: -6.121483, lon: 106.651348, hdg: 250 },
  pushbackEnd: { lat: -6.122100, lon: 106.652800, hdg: 250 },
  taxiwayPoints: [
    { lat: -6.122100, lon: 106.652800, hdg: 70, desc: "Taxi NC1" },
    { lat: -6.118000, lon: 106.662000, hdg: 70, desc: "Taxiway NC1" },
    { lat: -6.113000, lon: 106.668500, hdg: 340, desc: "Turn N2" },
    { lat: -6.110065, lon: 106.669746, hdg: 250, desc: "Holding Point 25R" }
  ],
  runwayLineUp: { lat: -6.108959, lon: 106.669062, hdg: 250 },
  runwayRollEnd: { lat: -6.120986, lon: 106.638883, hdg: 250 },
  climbWaypoints: [
    { lat: -6.127500, lon: 106.658000, alt: 3000, spd: 210, hdg: 135, desc: "CKG VOR" },
    { lat: -6.200000, lon: 106.480000, alt: 7000, spd: 250, hdg: 160, desc: "IMUBA" },
    { lat: -6.345000, lon: 106.720000, alt: 14000, spd: 280, hdg: 135, desc: "DOLTA (COP Handsoff)" }
  ]
};

let missionLegIndex = 0;
let flightTickTimer = null;
let isDebugMuted = false; // Real pilot radio speech active
let showTaxiwayLabels = true; // Toggle for high-visibility taxiway badges
let showWeatherRadar = true; // Toggle for convective weather cells
let atisInfoLetter = 'A'; // ATIS designator: Alpha, Bravo, Charlie...
let atisAudioPlaying = false;
let atisAudioElement = null;

// Milestone 4: Weather Engine & Dynamic METAR Presets
const WEATHER_PRESETS = {
  CAVOK: {
    name: "CAVOK (Fair Weather)",
    windDir: 250,
    windSpd: 8,
    gust: 0,
    visMeters: 10000,
    visStr: "10 km+",
    clouds: "FEW020",
    tempC: 31,
    dewC: 25,
    qnh: 1011,
    weatherCond: "NIL",
    rainIntensity: 0,
    separationMinNm: 3.0,
    recommendedRunway: "25R",
    metarRaw: "WIII 280600Z 25008KT 9999 FEW020 31/25 Q1011 NOSIG"
  },
  TAILWIND_SHIFT: {
    name: "Wind Shift (East Ops)",
    windDir: 70,
    windSpd: 14,
    gust: 20,
    visMeters: 8000,
    visStr: "8 km",
    clouds: "SCT020",
    tempC: 30,
    dewC: 24,
    qnh: 1010,
    weatherCond: "HZ",
    rainIntensity: 0,
    separationMinNm: 3.0,
    recommendedRunway: "07L",
    metarRaw: "WIII 280600Z 07014G20KT 8000 HZ SCT020 30/24 Q1010 NOSIG"
  },
  TROPICAL_STORM: {
    name: "Tropical Storm / Heavy Rain",
    windDir: 280,
    windSpd: 20,
    gust: 32,
    visMeters: 2500,
    visStr: "2500 m",
    clouds: "BKN012 FEW018CB",
    tempC: 25,
    dewC: 24,
    qnh: 1006,
    weatherCond: "+TSRA",
    rainIntensity: 0.85,
    separationMinNm: 5.0, // Increased ICAO wet runway/severe turbulence separation
    recommendedRunway: "25R",
    metarRaw: "WIII 280600Z 28020G32KT 2500 +TSRA BKN012 FEW018CB 25/24 Q1006 TEMPO 1500 TSRA"
  },
  LOW_VISIBILITY: {
    name: "Low Visibility Ops (CAT II/III)",
    windDir: 40,
    windSpd: 3,
    gust: 0,
    visMeters: 600,
    visStr: "600 m (FG)",
    clouds: "OVC002",
    tempC: 23,
    dewC: 23,
    qnh: 1012,
    weatherCond: "FG",
    rainIntensity: 0.2,
    separationMinNm: 5.0, // CAT II/III longitudinal spacing
    recommendedRunway: "07L",
    metarRaw: "WIII 280600Z 04003KT 0600 R25R/0800 FG OVC002 23/23 Q1012 BECMG 1500 BR"
  }
};

let currentWeather = Object.assign({}, WEATHER_PRESETS.CAVOK);

// Convective weather cells drifting across TMA (Lat, Lon, Radius NM, Intensity 0-1)
let weatherRadarCells = [
  { lat: -5.95, lon: 106.50, rNm: 8.5, intensity: 0.9, dLat: 0.0003, dLon: 0.0005 },
  { lat: -6.22, lon: 106.90, rNm: 6.2, intensity: 0.6, dLat: 0.0002, dLon: 0.0004 },
  { lat: -6.05, lon: 106.35, rNm: 7.0, intensity: 0.75, dLat: 0.0004, dLon: 0.0003 },
  { lat: -5.75, lon: 106.85, rNm: 10.0, intensity: 0.8, dLat: 0.0003, dLon: 0.0006 }
];

// Milestone 3: Controller Role & Multi-Frequency Delegation
// Roles: 'ALL' (Manual omni-controller), 'GND' (Ground only), 'TWR' (Tower only), 'APP' (Approach only), 'SPECTATOR' (Full AI Spectator)
let controllerRole = 'ALL';
const FREQUENCIES = {
  GND: "121.600 MHz",
  TWR: "118.200 MHz",
  APP: "119.750 MHz",
  ATIS: "128.000 MHz",
  SPECTATOR: "AUTO FREQ"
};

// Global Radio Audio Queue & Mutex (FIFO queue to prevent pilot voice overlaps)
const radioTransmissionQueue = [];
let isRadioProcessing = false;

// Trigger pilot check-in transmission (Queued & non-overlapping)
