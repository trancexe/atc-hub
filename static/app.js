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
    dest: "WARR (Surabaya)",
    pob: 156,
    sid: "DOLTA 1C",
    initialAlt: "FL140",
    lat: -6.121757,
    lon: 106.651077,
    heading: 70, // Parked facing concourse Gate E1 (east-northeast)
    altitude: 0,
    groundSpeed: 0,
    targetHeading: 70,
    state: "GATE",
    clearedRwy: "25R",
    clearedSid: "DOLTA 1C",
    squawk: "4521",
    hasCheckedIn: false,
    checkInPhrase: "Jakarta Delivery, INDONESIA 502, Gate Echo 1, information Bravo, Boeing 737-800, destination Surabaya via DOLTA 1C departure, POB 156, request ATC clearance.",
    responsePrompt: "Indonesia 502 cleared to Surabaya, DOLTA 1C departure, runway 25R, climb FL140, squawk 4521"
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
// ATC HUB - Real-Time Telemetry & Blackbox Event Logger

let telemetryLogs = [];
let currentLogFilter = 'ALL';
let isLoggerPanelOpen = false;

function logTelemetry(category, title, details) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || "");

  const entry = {
    id: Date.now() + Math.random().toString(36).substr(2, 4),
    time: timeStr,
    category: category || 'SYSTEM',
    title: title || '',
    details: detailsStr
  };

  telemetryLogs.push(entry);
  if (telemetryLogs.length > 150) {
    telemetryLogs.shift();
  }

  // Update DOM if panel is mounted
  appendLogToUI(entry);

  // Update badge counter
  const badge = document.getElementById('logger-badge');
  if (badge) {
    badge.textContent = telemetryLogs.length;
  }

  // Fire-and-forget sync to backend API logger
  try {
    fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  } catch (e) {}

  console.log(`[ATC ${entry.category}] ${entry.time} | ${entry.title}`, entry.details);
}

function appendLogToUI(entry) {
  const stream = document.getElementById('telemetry-log-stream');
  if (!stream) return;

  // Check filter
  if (currentLogFilter !== 'ALL' && entry.category !== currentLogFilter) {
    return;
  }

  const badgeColorMap = {
    'VOICE': 'bg-sky-950/80 text-sky-300 border-sky-700',
    'BEHAVIOR': 'bg-amber-950/80 text-amber-300 border-amber-700',
    'READBACK': 'bg-emerald-950/80 text-emerald-300 border-emerald-700',
    'SAFETY': 'bg-red-950/90 text-red-300 border-red-700 animate-pulse font-bold',
    'AI': 'bg-purple-950/80 text-purple-300 border-purple-700',
    'SYSTEM': 'bg-slate-900 text-slate-400 border-slate-700'
  };

  const badgeClass = badgeColorMap[entry.category] || badgeColorMap['SYSTEM'];

  const row = document.createElement('div');
  row.className = "p-1.5 rounded bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition space-y-0.5";
  row.dataset.category = entry.category;

  row.innerHTML = `
    <div class="flex items-center justify-between text-[10px]">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 font-mono">${entry.time}</span>
        <span class="px-1 py-0.2 rounded border text-[9px] font-bold ${badgeClass}">
          ${entry.category}
        </span>
      </div>
      <span class="font-bold text-slate-200 truncate max-w-[200px]">${escapeHtml(entry.title)}</span>
    </div>
    ${entry.details ? `<div class="text-[10px] text-slate-400 font-mono pl-1 border-l border-slate-800 break-words">${escapeHtml(entry.details)}</div>` : ''}
  `;

  // Remove empty placeholder if present
  if (stream.children.length === 1 && stream.firstElementChild.classList.contains('italic')) {
    stream.innerHTML = '';
  }

  stream.appendChild(row);
  stream.scrollTop = stream.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAllLogs() {
  const stream = document.getElementById('telemetry-log-stream');
  if (!stream) return;

  stream.innerHTML = '';
  const filtered = currentLogFilter === 'ALL'
    ? telemetryLogs
    : telemetryLogs.filter(l => l.category === currentLogFilter);

  if (filtered.length === 0) {
    stream.innerHTML = '<div class="text-slate-500 italic text-[10px] p-2 text-center">Tidak ada event untuk filter ini.</div>';
    return;
  }

  filtered.forEach(entry => appendLogToUI(entry));
  stream.scrollTop = stream.scrollHeight;
}

function setLogFilter(filter) {
  currentLogFilter = filter;

  const btnMap = {
    'ALL': 'filter-all-btn',
    'VOICE': 'filter-voice-btn',
    'BEHAVIOR': 'filter-behavior-btn',
    'READBACK': 'filter-readback-btn',
    'SAFETY': 'filter-safety-btn'
  };

  Object.entries(btnMap).forEach(([f, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (f === filter) {
      el.className = "px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-200 font-bold";
    } else {
      el.className = "px-1.5 py-0.5 rounded text-slate-400 hover:bg-slate-800";
    }
  });

  renderAllLogs();
}

function toggleTelemetryLogger() {
  const panel = document.getElementById('telemetry-logger-panel');
  const btn = document.getElementById('toggle-logger-btn');
  if (!panel) return;

  isLoggerPanelOpen = !isLoggerPanelOpen;
  if (isLoggerPanelOpen) {
    panel.classList.remove('hidden');
    if (btn) {
      btn.classList.add('bg-emerald-950', 'border-emerald-500', 'text-emerald-300');
      btn.classList.remove('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
    renderAllLogs();
  } else {
    panel.classList.add('hidden');
    if (btn) {
      btn.classList.remove('bg-emerald-950', 'border-emerald-500', 'text-emerald-300');
      btn.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
  }
}

function clearTelemetryLogs() {
  telemetryLogs = [];
  const stream = document.getElementById('telemetry-log-stream');
  if (stream) {
    stream.innerHTML = '<div class="text-slate-500 italic text-[10px] p-2 text-center">Log telah dibersihkan. Menunggu event baru...</div>';
  }
  const badge = document.getElementById('logger-badge');
  if (badge) badge.textContent = '0';
}
function triggerPilotCheckIn(ac) {
  if (!ac || ac.hasCheckedIn) return;
  ac.hasCheckedIn = true;
  enqueueRadioTransmission({
    type: "CHECK_IN",
    callsign: ac.callsign,
    text: ac.checkInPhrase,
    onStart: () => {
      isRadioTransmitting = true;
      const pttStatus = document.getElementById('ptt-status');
      if (pttStatus) {
        pttStatus.innerHTML = `<span class="text-amber-400 font-bold animate-pulse"><i class="fa-solid fa-volume-high"></i> PILOT CALL: ${ac.callsign}</span>`;
      }
      renderFlightStrips();
      updateEasyModePrompter();
    },
    onEnd: () => {
      isRadioTransmitting = false;
      const pttStatus = document.getElementById('ptt-status');
      if (pttStatus) {
        pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> INSTRUKSI ATC SIAP DIKIRIM (KLIK TOMBOL / MIC)</span>`;
      }
      renderFlightStrips();
      updateEasyModePrompter();
    }
  });
}

function enqueueRadioTransmission(item) {
  radioTransmissionQueue.push(item);
  processRadioQueue();
}

async function processRadioQueue() {
  if (isRadioProcessing) return;
  isRadioProcessing = true;

  while (radioTransmissionQueue.length > 0) {
    const item = radioTransmissionQueue.shift();
    try {
      if (item.onStart) item.onStart();
      if (item.type === "READBACK") {
        await playSpeechAudio(item.text, "[READBACK]");
      } else {
        await playSpeechAudio(item.text, "[PILOT]");
      }
    } catch (err) {
      console.warn("[RADIO QUEUE] Error during speech:", err);
    } finally {
      if (item.onEnd) item.onEnd();
      // Brief 350ms pause between radio transmissions (natural ICAO frequency spacing)
      await new Promise(r => setTimeout(r, 350));
    }
  }

  isRadioProcessing = false;
}

async function playSpeechAudio(text, tagPrefix = "[RADIO]") {
  const recEl = document.getElementById('recognized-text');
  if (recEl) recEl.textContent = `${tagPrefix}: "${text}"`;

  playRadioChirp();
  try {
    const audioUrl = `/api/audio/tts?text=${encodeURIComponent(text)}&voice=en-US-GuyNeural`;
    const audio = new Audio(audioUrl);
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          playRadioChirp();
          resolve();
        }
      };

      audio.onended = done;
      audio.onerror = () => {
        fallbackBrowserSpeech(text);
        done();
      };
      // Fallback timeout in case audio stalls
      setTimeout(done, 12000);

      audio.play().catch(() => {
        fallbackBrowserSpeech(text);
        done();
      });
    });
  } catch (e) {
    fallbackBrowserSpeech(text);
  }
}

async function speakPilotTransmission(text) {
  return playSpeechAudio(text, "[PILOT]");
}

async function speakPilotReadback(text) {
  if (typeof logTelemetry === 'function') {
    logTelemetry('READBACK', `Pilot Readback`, text);
  }
  return new Promise((resolve) => {
    enqueueRadioTransmission({
      type: "READBACK",
      text: text,
      onStart: () => {
        isRadioTransmitting = true;
        renderFlightStrips();
      },
      onEnd: () => {
        isRadioTransmitting = false;
        renderFlightStrips();
        resolve();
      }
    });
  });
}

function executeDebugCommand() {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  
  console.log(`[DEBUG ATC] Executing command for ${ac.id}, current state: ${ac.state}`);

  const rwyKey = ac.clearedRwy || "25R";
  const mech = airportData && airportData.runway_mechanisms ? airportData.runway_mechanisms[rwyKey] : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N1";

  // Determine clearance action directly by current state machine
  let instructionText = "";
  if (ac.state === "GATE") {
    instructionText = `${ac.callsign} push and start approved, facing west`;
  } else if (ac.state === "PUSHBACK") {
    // Show clear status feedback if clicked during active pushback
    const recEl = document.getElementById('recognized-text');
    if (recEl) recEl.textContent = `[PILOT]: "Pushback in progress, approaching NC6 centerline, ${ac.callsign}."`;
    return;
  } else if (ac.state === "READY_TAXI") {
    instructionText = `${ac.callsign} taxi to holding point runway ${rwyKey} via ${hpName}`;
  } else if (ac.state === "HOLD_SHORT_CROSS") {
    instructionText = `${ac.callsign} cross runway 25R at November cross, report vacated`;
  } else if (ac.state === "TAXI") {
    console.log("[DEBUG ATC] Taxi already in progress...");
    return;
  } else if (ac.state === "HOLDING") {
    instructionText = `${ac.callsign} line up and wait runway ${rwyKey}`;
  } else if (ac.state === "LINE_UP" || ac.state === "LINING_UP") {
    instructionText = `${ac.callsign} wind 250 at 8 knots, runway ${rwyKey} cleared for takeoff`;
  } else if (ac.state === "TAKEOFF") {
    console.log("[DEBUG ATC] Takeoff roll already in progress...");
    return;
  } else if (ac.state === "APPROACH") {
    instructionText = `${ac.callsign} descend and maintain 3000 feet, cleared ILS approach runway ${rwyKey}`;
  } else if (ac.state === "FINAL") {
    instructionText = `${ac.callsign} wind 250 at 8 knots, runway ${rwyKey} cleared to land`;
  } else if (ac.state === "LANDED") {
    instructionText = `${ac.callsign} vacate runway via November 4, contact Ground 121 decimal 6`;
  } else if (ac.state === "TAXI_IN") {
    instructionText = `${ac.callsign} taxi to Gate Echo 1 via November Charlie`;
  } else if (ac.state === "PARKED") {
    instructionText = `${ac.callsign} shutdown approved, have a good day`;
  } else if (ac.state === "AIRBORNE") {
    instructionText = `${ac.callsign} contact Jakarta Approach 119 decimal 75, good day`;
  } else if (ac.state === "CLIMBING" || ac.state === "HANDOFF") {
    instructionText = `${ac.callsign} contact Jakarta Center 128 decimal 5, good day`;
  } else {
    instructionText = `${ac.callsign} roger and standby`;
  }

  const recEl = document.getElementById('recognized-text');
  if (recEl) recEl.textContent = `[ATC]: "${instructionText}"`;

  // Always force-release radio transmitting lock on debug command
  isRadioTransmitting = false;

  // Forward to radar command handler
  handleRadarVoiceCommand(instructionText, {});
}

// Helper to convert taxiway designator (e.g. NC6, NP2, N2, S4) into authentic spoken NATO phonetic
function formatTaxiwayPhonetic(twyCode) {
  if (!twyCode) return "";
  const nato = {
    A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo",
    F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliett",
    K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar",
    P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango",
    U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu"
  };
  const nums = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"
  };
  const parts = [];
  for (const ch of String(twyCode)) {
    const up = ch.toUpperCase();
    if (nato[up]) parts.push(nato[up]);
    else if (nums[up]) parts.push(nums[up]);
    else parts.push(ch);
  }
  return parts.join(" ");
}

// Build precise auto-suggested taxi route according to official Jeppesen 10-6 chart
function getAutoSuggestTaxiRoute(ac) {
  const rwy = ac.clearedRwy || "25R";
  const gateRef = ac.assignedGate || "E1";
  
  // Departure taxiway route auto-suggest (Chart 10-6S / 10-6S1)
  if (["GATE", "PUSHBACK", "READY_TAXI", "TAXI"].includes(ac.state)) {
    if (rwy === "25R") {
      if (gateRef.startsWith("A") || gateRef.startsWith("B") || gateRef.startsWith("C")) {
        return { via: ["SP1", "WC2", "NP2", "N1"], text: "Sierra Papa one, Whiskey Charlie two, November Papa two, November one", hp: "N1" };
      } else if (gateRef.startsWith("D")) {
        return { via: ["NC7", "NP2", "N1"], text: "November Charlie seven, November Papa two, November one", hp: "N1" };
      } else if (gateRef.startsWith("E")) {
        return { via: ["NC6", "NP2", "N1"], text: "November Charlie six, November Papa two, November one", hp: "N1" };
      } else if (gateRef.startsWith("F")) {
        return { via: ["NCY", "NP2", "N1"], text: "November Charlie Yankee, November Papa two, November one", hp: "N1" };
      } else {
        // Terminal 3
        return { via: ["NC3", "NP2", "N1"], text: "November Charlie three, November Papa two, November one", hp: "N1" };
      }
    } else if (rwy === "07L") {
      return { via: ["NP2", "N9"], text: "November Papa two, November nine", hp: "N9" };
    } else if (rwy === "25L") {
      if (gateRef.startsWith("E") || gateRef.startsWith("F") || !isNaN(parseInt(gateRef[0]))) {
        return { via: ["NP1", "WC1", "SP2", "S1"], text: "November Papa one, Whiskey Charlie one, Sierra Papa two, Sierra one", hp: "S1" };
      } else {
        return { via: ["SC4", "SP2", "S1"], text: "Sierra Charlie four, Sierra Papa two, Sierra one", hp: "S1" };
      }
    } else if (rwy === "07R") {
      return { via: ["SP1", "S9"], text: "Sierra Papa one, Sierra nine", hp: "S9" };
    } else if (rwy === "24") {
      return { via: ["NP3", "M1"], text: "November Papa three, Mike one", hp: "M1" };
    } else {
      return { via: ["NP3", "M8"], text: "November Papa three, Mike eight", hp: "M8" };
    }
  }

  // Arrival taxi-in route auto-suggest (Chart 10-6 / 10-6B / 10-6C / 10-6H)
  if (rwy === "25R") {
    if (gateRef.startsWith("E") || gateRef.startsWith("F")) {
      return { exit: "N5", exitSpoken: "November five", via: ["N5", "NC5", "NCY"], text: "November five, November Charlie five, November Charlie Yankee", gate: gateRef };
    } else if (gateRef.startsWith("D")) {
      return { exit: "N5", exitSpoken: "November five", via: ["N5", "NC6", "NPW"], text: "November five, November Charlie six, November Papa Whiskey", gate: gateRef };
    } else if (gateRef.startsWith("A") || gateRef.startsWith("B") || gateRef.startsWith("C")) {
      return { exit: "N5", exitSpoken: "November five", via: ["N5", "NC5", "NP1", "WC1"], text: "November five, November Charlie five, November Papa one, Whiskey Charlie one", gate: gateRef };
    } else {
      // Terminal 3
      return { exit: "N5", exitSpoken: "November five", via: ["N5", "NP2", "NC3"], text: "November five, November Papa two, November Charlie three", gate: gateRef };
    }
  } else if (rwy === "07L") {
    return { exit: "N3", exitSpoken: "November three", via: ["N3", "NP2", "NCY"], text: "November three, November Papa two, November Charlie Yankee", gate: gateRef };
  } else if (rwy === "25L") {
    return { exit: "S5", exitSpoken: "Sierra five", via: ["S5", "SC5", "SP1"], text: "Sierra five, Sierra Charlie five, Sierra Papa one", gate: gateRef };
  } else {
    return { exit: "S3", exitSpoken: "Sierra three", via: ["S3", "SP2", "SCX"], text: "Sierra three, Sierra Papa two, Sierra Charlie X-ray", gate: gateRef };
  }
}

function getDynamicEasyModePrompt(ac) {
  if (!ac) return { context: "Tidak ada pesawat.", speech: "Standby", actionDesc: "Standby" };

  const cs = ac.callsign || ac.id;
  const rwyKey = ac.clearedRwy || "25R";
  const sidKey = ac.clearedSid || "DOLTA 1C";
  const starKey = ac.clearedStar || "DOLTA 1A";
  const mech = (airportData && airportData.runway_mechanisms) ? airportData.runway_mechanisms[rwyKey] : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N1";
  const autoTaxi = getAutoSuggestTaxiRoute(ac);
  const exitTwy = autoTaxi && autoTaxi.exitSpoken ? autoTaxi.exitSpoken : (mech && mech.exit_taxiways && mech.exit_taxiways.length > 0 ? mech.exit_taxiways[0].name : "November 5");

  switch (ac.state) {
    case "GATE":
      return {
        context: `Pesawat di Gate ${ac.assignedGate || 'E1'} telah melaporkan initial check-in (POB ${ac.pob || 156}, tujuan ${ac.dest || 'Surabaya'}, via ${sidKey}). Siap push and start untuk Runway ${rwyKey}.`,
        speech: `${cs} push and start approved, facing west`,
        actionDesc: "Push & Start Approved"
      };
    case "PUSHBACK":
      return {
        context: `Pesawat sedang pushback mandiri menuju taxiway...`,
        speech: `Standby for taxi, ${cs}`,
        actionDesc: "Pushback in progress"
      };
    case "READY_TAXI":
      return {
        context: `Pesawat selesai pushback di ${ac.assignedGate ? 'Gate ' + ac.assignedGate : 'Gate E1'}. Berikan clearance taxi presisi via rute resmi Jeppesen 10-6.`,
        speech: `${cs} taxi holding point runway ${rwyKey} via ${autoTaxi.text || hpName}`,
        actionDesc: `Taxi via ${autoTaxi.via ? autoTaxi.via.join(' - ') : hpName}`
      };
    case "HOLD_SHORT_CROSS":
      return {
        context: `Pesawat berhenti di Stop Bar sebelum menyeberangi runway aktif! Wajib berikan izin cross runway.`,
        speech: `${cs} cross runway 25R at November cross, report vacated`,
        actionDesc: "Cross Runway Clearance"
      };
    case "TAXI":
      return {
        context: `Pesawat sedang taxi menyusuri ${autoTaxi.via ? autoTaxi.via.join(' - ') : hpName} menuju holding point Runway ${rwyKey}...`,
        speech: `Standby at holding point, ${cs}`,
        actionDesc: "Taxiing"
      };
    case "HOLDING":
      return {
        context: `Pesawat berhenti di Holding Point ${hpName} Runway ${rwyKey}, runway siap digunakan.`,
        speech: `${cs} runway ${rwyKey} line up and wait`,
        actionDesc: `Line up and wait Runway ${rwyKey}`
      };
    case "LINE_UP":
    case "LINING_UP":
      return {
        context: `Pesawat di posisi Runway ${rwyKey} via ${sidKey} siap lepas landas. Angin 250 derajat 8 knot.`,
        speech: `${cs} wind 250 degrees 8 knots, runway ${rwyKey} cleared for takeoff`,
        actionDesc: `Cleared Takeoff RWY ${rwyKey}`
      };
    case "TAKEOFF":
      return {
        context: `Pesawat akselerasi lepas landas dari Runway ${rwyKey}...`,
        speech: `Airborne climb out via ${sidKey}, ${cs}`,
        actionDesc: "Takeoff Roll"
      };
    case "APPROACH":
      return {
        context: `Pesawat inbound pada rute kedatangan ${starKey} menuju ILS Runway ${rwyKey}.`,
        speech: `${cs} descend 3000 feet, cleared ILS runway ${rwyKey}`,
        actionDesc: `Cleared ILS RWY ${rwyKey} (${starKey})`
      };
    case "FINAL":
      return {
        context: `Pesawat established di final approach 5 NM siap mendarat di Runway ${rwyKey}.`,
        speech: `${cs} wind 250 degrees 8 knots, runway ${rwyKey} cleared to land`,
        actionDesc: `Cleared to Land RWY ${rwyKey}`
      };
    case "LANDED":
      return {
        context: `Pesawat telah mendarat di Runway ${rwyKey}. Instruksikan keluar runway via rapid exit resmi ${exitTwy} ke Ground.`,
        speech: `${cs} vacate runway via ${exitTwy}, contact Ground 121 decimal 6`,
        actionDesc: `Vacate RWY via ${exitTwy}`
      };
    case "TAXI_IN":
      return {
        context: `Pesawat mendarat sedang taxi masuk menuju Gate ${ac.assignedGate || 'E1'}. Rute auto-suggest via ${autoTaxi.via ? autoTaxi.via.join(' - ') : 'NC'}.`,
        speech: `${cs} taxi to Gate ${formatTaxiwayPhonetic(ac.assignedGate || 'E1')} via ${autoTaxi.text || 'November Charlie'}`,
        actionDesc: `Taxi via ${autoTaxi.via ? autoTaxi.via.join(' - ') : 'NC'}`
      };
    case "PARKED":
      return {
        context: `Pesawat telah parkir sempurna di gate stand, mesin dimatikan.`,
        speech: `${cs} gate arrival confirmed, shutdown approved, good day`,
        actionDesc: "At Gate / Shutdown"
      };
    case "AIRBORNE":
      return {
        context: `Pesawat airborne passing 2000ft mengikuti SID ${sidKey}, transfer kendali ke Jakarta Approach.`,
        speech: `${cs} contact Jakarta Approach 119 decimal 75`,
        actionDesc: "Contact Approach"
      };
    case "CLIMBING":
      return {
        context: `Pesawat mengikuti SID ${sidKey}, climb passing FL120 menuju FL140.`,
        speech: `${cs} climb and maintain flight level 140 via ${sidKey}`,
        actionDesc: `Climb FL140 (${sidKey})`
      };
    case "HANDOFF":
      return {
        context: `Pesawat menyelesaikan rute SID ${sidKey} di FL140, transfer kendali ke Jakarta Center!`,
        speech: `${cs} contact Jakarta Center 128 decimal 5, good day`,
        actionDesc: "Handoff to Center"
      };
    case "HANDED_OFF":
      return {
        context: `Pesawat berhasil ditransfer ke Jakarta Center via ${sidKey}. Misi selesai!`,
        speech: "Mission Complete",
        actionDesc: "Enroute with Center"
      };
    default:
      return {
        context: `Pesawat dalam status ${ac.state} menuju Runway ${rwyKey}.`,
        speech: `${cs} roger and standby`,
        actionDesc: "Standby"
      };
  }
}

let isPrompterCollapsed = window.innerWidth < 768;

function togglePrompterCollapse() {
  isPrompterCollapsed = !isPrompterCollapsed;
  const prompter = document.getElementById('easy-mode-prompter');
  const chevron = document.getElementById('prompter-chevron');
  if (!prompter) return;

  if (isPrompterCollapsed) {
    prompter.classList.add('collapsed');
    if (chevron) chevron.className = "fa-solid fa-chevron-up";
  } else {
    prompter.classList.remove('collapsed');
    if (chevron) chevron.className = "fa-solid fa-chevron-down";
  }
}

function updateEasyModePrompter() {
  const prompter = document.getElementById('easy-mode-prompter');
  if (!prompter) return;

  if (!isEasyMode || currentTab !== 'radar') {
    prompter.classList.add('hidden');
    return;
  }
  prompter.classList.remove('hidden');

  // Apply initial collapsed state if not already set
  if (isPrompterCollapsed && !prompter.classList.contains('collapsed')) {
    prompter.classList.add('collapsed');
    const chevron = document.getElementById('prompter-chevron');
    if (chevron) chevron.className = "fa-solid fa-chevron-up";
  }

  if (aircraft.length === 0) return;
  const ac = aircraft[selectedAircraftIndex % aircraft.length];
  const info = getDynamicEasyModePrompt(ac);

  document.getElementById('prompt-ac-badge').textContent = `${ac.id} (${ac.state}) • RWY ${ac.clearedRwy || '25R'}`;
  document.getElementById('prompt-context').textContent = `Skenario: ${info.context}`;
  document.getElementById('prompt-speech-text').textContent = `"${info.speech}"`;

  // Show/Hide Tactical Quick Action Chips (only relevant when airborne)
  const chips = document.getElementById('prompt-tactical-chips');
  if (chips) {
    if (ac.altitude > 100 && !["PARKED", "GATE", "PUSHBACK", "TAXI", "READY_TAXI"].includes(ac.state)) {
      chips.classList.remove('hidden');
    } else {
      chips.classList.add('hidden');
    }
  }
}

// Easy Mode Quick Tactical Action Helpers
function quickTacticalVector(hdg) {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  const idx = aircraft.findIndex(a => a.id === ac.id);
  issueRadarVector(idx, String(hdg));
}

function quickTacticalSpeed(spd) {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  const idx = aircraft.findIndex(a => a.id === ac.id);
  issueSpeedControl(idx, String(spd));
}

function quickTacticalGoAround() {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  const idx = aircraft.findIndex(a => a.id === ac.id);
  issueGoAround(idx);
}

function quickTacticalResume() {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  const idx = aircraft.findIndex(a => a.id === ac.id);
  issueRadarVector(idx, "RESUME");
  issueSpeedControl(idx, "RESUME");
}

function toggleEasyMode() {
  isEasyMode = !isEasyMode;
  const btn = document.getElementById('easy-mode-btn');
  const label = document.getElementById('easy-mode-label');
  
  if (isEasyMode) {
    btn.className = "px-3 py-1.5 rounded-lg border font-radar text-xs font-bold flex items-center gap-1.5 transition bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-lg";
    label.textContent = "ON";
  } else {
    btn.className = "px-3 py-1.5 rounded-lg border font-radar text-xs font-bold flex items-center gap-1.5 transition bg-slate-900 text-slate-400 border-slate-700";
    label.textContent = "OFF";
  }
  updateEasyModePrompter();
}

function cyclePrompterAircraft() {
  selectedAircraftIndex = (selectedAircraftIndex + 1) % aircraft.length;
  const ac = aircraft[selectedAircraftIndex];
  if (ac) {
    focusAircraftOnGround(ac);
  }
  updateEasyModePrompter();
  renderFlightStrips();
  renderAllScreens();
  if (ac && !ac.hasCheckedIn && !isRadioTransmitting) {
    triggerPilotCheckIn(ac);
  }
}

function playCurrentPromptAudio() {
  const textEl = document.getElementById('prompt-speech-text');
  if (textEl) {
    const cleanText = textEl.textContent.replace(/"/g, '');
    speakPilotReadback(cleanText);
  }
}

// Audio Context & VHF Radio FX
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playRadioChirp() {
  try {
    const actx = getAudioContext();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, actx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.05);
  } catch (e) {
    console.error(e);
  }
}

// (speakPilotReadback implementation below line 142)

function fallbackBrowserSpeech(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (enVoice) utterance.voice = enVoice;
    utterance.onend = () => { playRadioChirp(); };
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("speechSynthesis error:", e);
  }
}

// Media Recorder for Push-To-Talk
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isStartingRecording = false;

async function setupRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("navigator.mediaDevices.getUserMedia not available");
    updateMicStatusWarning("Browser requires HTTPS or localhost for Mic");
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Choose best mime type supported by Firefox/Chrome
    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) {
        mimeType = 'audio/ogg; codecs=opus';
      } else {
        mimeType = ''; // browser default
      }
    }

    mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const type = mediaRecorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type });
      let ext = 'webm';
      if (type.includes('ogg')) ext = 'ogg';
      else if (type.includes('wav')) ext = 'wav';
      else if (type.includes('mp4') || type.includes('m4a')) ext = 'mp4';

      audioChunks = [];
      if (audioBlob.size < 500) {
        console.warn("Audio blob too short/empty:", audioBlob.size);
        const pttStatus = document.getElementById('ptt-status');
        if (pttStatus) pttStatus.textContent = "Tekan & tahan tombol mic saat berbicara!";
        return;
      }
      await sendAudioToWhisper(audioBlob, ext);
    };

    updateMicStatusWarning(null);
  } catch (err) {
    console.warn("Microphone access error:", err);
    updateMicStatusWarning("Mic permission denied or not found");
    throw err;
  }
}

function updateMicStatusWarning(msg) {
  const pttStatus = document.getElementById('ptt-status');
  const whisperStatus = document.getElementById('whisper-status');
  if (msg) {
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-amber-400 font-bold">${msg}</span>`;
    }
    if (whisperStatus) {
      whisperStatus.textContent = "MIC NEEDED";
      whisperStatus.classList.add('text-amber-400');
    }
  } else {
    if (whisperStatus) {
      whisperStatus.textContent = "WHISPER READY";
      whisperStatus.classList.remove('text-amber-400');
    }
  }
}

async function startRecording() {
  if (isRecording || isStartingRecording) return;
  isStartingRecording = true;
  const pttStatus = document.getElementById('ptt-status');

  if (!mediaRecorder) {
    if (pttStatus) pttStatus.innerHTML = `<span class="text-amber-400 font-bold">MENGHUBUNGKAN MIC...</span>`;
    try {
      await setupRecording();
    } catch (e) {
      console.error("Mic setup failed:", e);
      if (pttStatus) pttStatus.innerHTML = `<span class="text-red-400 font-bold">GAGAL AKSES MIC (${e.name || e.message})</span>`;
      isStartingRecording = false;
      return;
    }
  }

  if (!mediaRecorder) {
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-amber-400 font-bold">KLIK TOMBOL MIC DI BAWAH DULU UNTUK IZIN MIC!</span>`;
    }
    isStartingRecording = false;
    return;
  }

  try {
    if (mediaRecorder.state !== 'recording') {
      audioChunks = [];
      mediaRecorder.start();
      isRecording = true;
      playRadioChirp();

      if (pttStatus) {
        pttStatus.textContent = "TRANSMITTING ON 118.10 MHz...";
        pttStatus.className = "text-xs font-radar mb-1.5 px-3 py-1 rounded border transition-all bg-red-950 text-red-400 border-red-700 animate-pulse";
      }
      const acadRecStatus = document.getElementById('academy-rec-status');
      if (acadRecStatus) acadRecStatus.textContent = "Merekam suara... Lepas SPACEBAR untuk kirim.";
    }
  } catch (e) {
    console.error("Start recording failed:", e);
    isRecording = false;
  } finally {
    isStartingRecording = false;
  }
}

function stopRecording() {
  isStartingRecording = false;
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  try {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      playRadioChirp();
    }

    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.textContent = "PROCESSING WHISPER STT...";
      pttStatus.className = "text-xs font-radar mb-1.5 px-3 py-1 rounded border transition-all bg-slate-900 border-emerald-800 text-emerald-400";
    }
    const acadRecStatus = document.getElementById('academy-rec-status');
    if (acadRecStatus) acadRecStatus.textContent = "Memproses Whisper AI...";
  } catch (e) {
    console.error("Stop recording failed:", e);
  }
}

async function sendAudioToWhisper(blob, ext) {
  const formData = new FormData();
  formData.append('file', blob, `speech.${ext}`);

  let targetText = "";
  if (currentTab === 'academy' && activeLesson) {
    targetText = activeLesson.target_text;
    formData.append('target_text', targetText);
  }

  try {
    const resp = await fetch('/api/stt/transcribe', {
      method: 'POST',
      body: formData
    });
    const res = await resp.json();

    if (res.success) {
      if (currentTab === 'radar') {
        const recEl = document.getElementById('recognized-text');
        if (recEl) recEl.textContent = `"${res.text}"`;
        document.getElementById('ptt-status').textContent = `Transmitted (${res.duration}s)`;
        if (typeof logTelemetry === 'function') {
          logTelemetry('VOICE', `Voice Input: "${res.text}"`, {
            callsign: res.parsed?.callsign || 'N/A',
            runway: res.parsed?.runway || 'N/A',
            intent: res.parsed?.intent || 'N/A',
            duration: `${res.duration}s`
          });
        }
        handleRadarVoiceCommand(res.text, res.parsed);
      } else {
        handleAcademyResult(res);
      }
    } else {
      document.getElementById('ptt-status').textContent = `Error: ${res.error || 'STT failed'}`;
    }
  } catch (e) {
    console.error("Transcribe error:", e);
    document.getElementById('ptt-status').textContent = `Voice Error: ${e.message || 'Check Server'}`;
  }
}

// Multi-Screen Layout Switcher
function setLayout(mode) {
  // On mobile (<768px), fallback 'split' to single view ('ground' or last single view)
  const isMobile = window.innerWidth < 768;
  if (isMobile && mode === 'split') {
    mode = currentLayout === 'tma' ? 'tma' : 'ground';
  }

  currentLayout = mode;
  const container = document.getElementById('screens-container');
  const paneGround = document.getElementById('pane-ground');
  const paneTma = document.getElementById('pane-tma');

  const btnSplit = document.getElementById('view-split-btn');
  const btnGround = document.getElementById('view-ground-btn');
  const btnTma = document.getElementById('view-tma-btn');

  [btnSplit, btnGround, btnTma].forEach(b => {
    if (b) b.className = (b === btnSplit ? "hidden md:flex " : "flex ") + "px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition text-slate-400 hover:text-white";
  });

  if (mode === 'split' && !isMobile) {
    container.className = "flex-1 grid grid-cols-2 gap-1 bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "";
    paneTma.style.display = "";
    paneGround.classList.remove('hidden');
    paneTma.classList.remove('hidden');
    paneGround.classList.remove('col-span-2');
    paneTma.classList.remove('col-span-2');
    btnSplit.className = "hidden md:flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'ground') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "flex";
    paneTma.style.display = "none";
    paneGround.classList.remove('hidden');
    paneTma.classList.add('hidden');
    paneGround.classList.add('w-full', 'h-full');
    btnGround.className = "flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'tma') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "none";
    paneTma.style.display = "flex";
    paneGround.classList.add('hidden');
    paneTma.classList.remove('hidden');
    paneTma.classList.add('w-full', 'h-full');
    btnTma.className = "flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
  }

  setTimeout(() => {
    resizeCanvases();
  }, 30);
  setTimeout(() => {
    resizeCanvases();
  }, 120);
}

function resizeCanvases() {
  if (groundCanvas && !groundCanvas.parentElement.classList.contains('hidden')) {
    const rect = groundCanvas.parentElement.getBoundingClientRect();
    viewState.ground.width = rect.width;
    viewState.ground.height = rect.height;
    groundCanvas.width = rect.width * window.devicePixelRatio;
    groundCanvas.height = rect.height * window.devicePixelRatio;
    groundCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  if (tmaCanvas && !tmaCanvas.parentElement.classList.contains('hidden')) {
    const rect = tmaCanvas.parentElement.getBoundingClientRect();
    viewState.tma.width = rect.width;
    viewState.tma.height = rect.height;
    tmaCanvas.width = rect.width * window.devicePixelRatio;
    tmaCanvas.height = rect.height * window.devicePixelRatio;
    tmaCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  renderAllScreens();
}

function latLonToScreenCoord(lat, lon, st) {
  const x = (lon - refLon) * BASE_SCALE * st.zoom + st.width / 2 + st.panX;
  const y = -(lat - refLat) * BASE_SCALE * st.zoom + st.height / 2 + st.panY;
  return { x, y };
}

// Aircraft physical dimensions specification (length & wingspan in meters)
// B738: 39.5m L, 35.8m W
// A320: 37.6m L, 35.8m W
// A333 (A330-300): 63.7m L, 60.3m W
// B777 (B777-300ER): 73.9m L, 64.8m W
// B747 (B747-400/-8): 70.7m L, 64.4m W (B744) / 76.3m L, 68.4m W (B748)
const AIRCRAFT_SPECS = {
  "738": { length: 39.5, span: 35.8, category: "M", label: "B738" },
  "B738": { length: 39.5, span: 35.8, category: "M", label: "B738" },
  "320": { length: 37.6, span: 35.8, category: "M", label: "A320" },
  "A320": { length: 37.6, span: 35.8, category: "M", label: "A320" },
  "B739": { length: 42.1, span: 35.8, category: "M", label: "B739" },
  "333": { length: 63.7, span: 60.3, category: "H", label: "A333" },
  "A333": { length: 63.7, span: 60.3, category: "H", label: "A333" },
  "777": { length: 73.9, span: 64.8, category: "H", label: "B777" },
  "B777": { length: 73.9, span: 64.8, category: "H", label: "B777" },
  "B77W": { length: 73.9, span: 64.8, category: "H", label: "B77W" },
  "747": { length: 76.3, span: 68.4, category: "H", label: "B747" },
  "B747": { length: 76.3, span: 68.4, category: "H", label: "B747" },
  "B744": { length: 70.7, span: 64.4, category: "H", label: "B744" }
};

function getAircraftSpecs(type) {
  if (!type) return AIRCRAFT_SPECS["738"];
  const key = String(type).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (AIRCRAFT_SPECS[key]) return AIRCRAFT_SPECS[key];
  for (const k in AIRCRAFT_SPECS) {
    if (key.includes(k)) return AIRCRAFT_SPECS[k];
  }
  return AIRCRAFT_SPECS["738"];
}

// Draw accurate aerodynamic aircraft shape (Fuselage, swept wings, tailplane, cockpit nose)
function drawAircraftIcon(ctx, x, y, headingDeg, type, isSel, isHolding, isGroundView, zoomScale) {
  const specs = getAircraftSpecs(type);

  // In ground view, calculate real-world meter dimensions scaled to canvas pixels
  // BASE_SCALE = 60000 px/deg. 1 deg lat ~ 111,120 meters -> 1 meter = 60000 / 111120 = ~0.54 px at zoom 1.0
  const pxPerMeter = (BASE_SCALE / 111120) * zoomScale;
  let lenPx, spanPx;

  if (isGroundView) {
    // True physical size on Ground radar (clamped to legible minimum for low zoom overview)
    const minLen = isSel ? 16 : 12;
    lenPx = Math.max(minLen, specs.length * pxPerMeter);
    spanPx = Math.max(minLen * 0.9, specs.span * pxPerMeter);
  } else {
    // In TMA radar, use proportional tactical symbol size based on heavy/medium wake turbulence category
    const baseSize = specs.category === 'H' ? 19 : 14;
    lenPx = baseSize * (isSel ? 1.25 : 1.0);
    spanPx = lenPx * 0.92;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((headingDeg * Math.PI) / 180);

  // Styling colors
  const primaryColor = isHolding ? "#ef4444" : (isSel ? "#fbbf24" : (isGroundView ? "#10b981" : "#38bdf8"));
  const fillColor = isHolding ? "rgba(239, 68, 68, 0.45)" : (isSel ? "rgba(251, 191, 36, 0.45)" : (isGroundView ? "rgba(16, 185, 129, 0.35)" : "rgba(56, 189, 248, 0.35)"));

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = isSel ? 1.8 : 1.2;
  ctx.lineJoin = "round";

  // Coordinates normalized relative to nose at +Y (pointing up at 0 deg, heading offset adjusted):
  // Let nose be at (0, -lenPx * 0.52), tail at (0, lenPx * 0.48)
  const noseY = -lenPx * 0.52;
  const tailY = lenPx * 0.48;
  const halfSpan = spanPx * 0.5;
  const wingRootY = -lenPx * 0.05;
  const wingTrailingY = lenPx * 0.16;
  const wingTipY = lenPx * 0.06;
  const fuseHalfW = Math.max(1.5, lenPx * 0.075);
  const stabHalfW = halfSpan * 0.42;
  const stabRootY = lenPx * 0.34;
  const stabTipY = lenPx * 0.44;

  ctx.beginPath();
  // Cockpit nose
  ctx.moveTo(0, noseY);
  // Right nose curvature to right wing root
  ctx.lineTo(fuseHalfW, -lenPx * 0.25);
  ctx.lineTo(fuseHalfW, wingRootY);
  // Right Swept Wing leading edge to wingtip
  ctx.lineTo(halfSpan, wingTipY);
  // Right Wingtip
  ctx.lineTo(halfSpan, wingTipY + lenPx * 0.035);
  // Right Wing trailing edge back to fuselage
  ctx.lineTo(fuseHalfW, wingTrailingY);
  // Right fuselage to horizontal stabilizer root
  ctx.lineTo(fuseHalfW * 0.85, stabRootY);
  // Right stabilizer leading edge to tip
  ctx.lineTo(stabHalfW, stabTipY);
  ctx.lineTo(stabHalfW, stabTipY + lenPx * 0.03);
  // Right stabilizer trailing edge to tail cone
  ctx.lineTo(fuseHalfW * 0.4, tailY);
  ctx.lineTo(0, tailY + lenPx * 0.04);

  // Left side symmetrical
  ctx.lineTo(-fuseHalfW * 0.4, tailY);
  ctx.lineTo(-stabHalfW, stabTipY + lenPx * 0.03);
  ctx.lineTo(-stabHalfW, stabTipY);
  ctx.lineTo(-fuseHalfW * 0.85, stabRootY);
  ctx.lineTo(-fuseHalfW, wingTrailingY);
  ctx.lineTo(-halfSpan, wingTipY + lenPx * 0.035);
  ctx.lineTo(-halfSpan, wingTipY);
  ctx.lineTo(-fuseHalfW, wingRootY);
  ctx.lineTo(-fuseHalfW, -lenPx * 0.25);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // If selected, draw rotating tactical ring around aircraft
  if (isSel) {
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(lenPx, spanPx) * 0.68, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGroundScreen() {
  if (!groundCtx || !viewState.ground.width) return;
  const st = viewState.ground;
  const ctx = groundCtx;
  ctx.clearRect(0, 0, st.width, st.height);

  ctx.strokeStyle = "rgba(16, 185, 129, 0.12)";
  ctx.lineWidth = 1;
  const c = latLonToScreenCoord(refLat, refLon, st);
  [150, 300, 450].forEach(r => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (st.zoom / 2.5), 0, Math.PI * 2);
    ctx.stroke();
  });

  if (!airportData) return;

  const selAc = (selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length)
    ? aircraft[selectedAircraftIndex]
    : null;
  const activeRwyKey = selAc ? (selAc.clearedRwy || "25R") : null;

  // 0. Terminals & Buildings footprint
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
  ctx.lineWidth = 1;
  (airportData.terminals || []).forEach(tm => {
    if (!tm.coords || tm.coords.length < 3) return;
    ctx.beginPath();
    const p0 = latLonToScreenCoord(tm.coords[0][0], tm.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < tm.coords.length; i++) {
      const pt = latLonToScreenCoord(tm.coords[i][0], tm.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 1. Aprons
  ctx.fillStyle = "rgba(30, 41, 59, 0.4)";
  ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
  ctx.lineWidth = 1;
  (airportData.aprons || []).forEach(ap => {
    if (!ap.coords || ap.coords.length < 3) return;
    ctx.beginPath();
    const p0 = latLonToScreenCoord(ap.coords[0][0], ap.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ap.coords.length; i++) {
      const pt = latLonToScreenCoord(ap.coords[i][0], ap.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 2. Parking Positions / Aircraft Stands (Centroids & Lines)
  if (st.zoom > 1.8) {
    (airportData.parking_stands || []).forEach(ps => {
      if (ps.coords && ps.coords.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
        ctx.lineWidth = 1;
        const p0 = latLonToScreenCoord(ps.coords[0][0], ps.coords[0][1], st);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ps.coords.length; i++) {
          const pt = latLonToScreenCoord(ps.coords[i][0], ps.coords[i][1], st);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      if (ps.ref && st.zoom > 3.0) {
        const p = latLonToScreenCoord(ps.lat, ps.lon, st);
        ctx.font = "7px 'Share Tech Mono'";
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.fillText(ps.ref, p.x - 6, p.y + 2);
      }
    });
  }

  // 3. Passenger Gates (Terminal 1, 2, 3) & Jet Bridges
  (airportData.gates || []).forEach(gt => {
    const p = latLonToScreenCoord(gt.lat, gt.lon, st);
    ctx.fillStyle = "#38bdf8";
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(p.x - 3, p.y - 3, 6, 6);
    ctx.fill();
    ctx.stroke();

    if (st.zoom > 1.8 && gt.ref) {
      ctx.font = "bold 9px 'Share Tech Mono'";
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(gt.ref, p.x + 5, p.y + 3);
    }
  });

  // 4. Taxiways (Centerlines & High-Visibility Aviation Signboards)
  const renderedMacroLabels = new Set((airportData.taxiway_labels || []).map(l => l.ref));
  (airportData.taxiways || []).forEach(tw => {
    if (!tw.coords || tw.coords.length < 2) return;
    
    // Physical taxiway pavement underlay when zoomed in
    if (st.zoom > 1.2) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.45)"; // Dark asphalt shoulder
      ctx.lineWidth = Math.max(3, 4.5 * st.zoom);
      const p0 = latLonToScreenCoord(tw.coords[0][0], tw.coords[0][1], st);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < tw.coords.length; i++) {
        const pt = latLonToScreenCoord(tw.coords[i][0], tw.coords[i][1], st);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // High-visibility luminous green taxiway centerline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
    ctx.lineWidth = Math.max(1.8, 2.2 * (st.zoom / 1.5));
    const p0 = latLonToScreenCoord(tw.coords[0][0], tw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < tw.coords.length; i++) {
      const pt = latLonToScreenCoord(tw.coords[i][0], tw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // High-Visibility ICAO Yellow-on-Black Aviation Taxiway Signboards
    // Skip if already rendered in macro labels to prevent overlapping double-badges
    if (tw.ref && tw.coords.length >= 2 && st.zoom > 1.8 && !renderedMacroLabels.has(tw.ref)) {
      const mid = tw.coords[Math.floor(tw.coords.length / 2)];
      const mp = latLonToScreenCoord(mid[0], mid[1], st);
      const text = String(tw.ref).trim();
      
      ctx.font = "bold 11px 'Share Tech Mono', monospace";
      const textWidth = ctx.measureText(text).width;
      const boxW = Math.max(18, textWidth + 8);
      const boxH = 14;
      const boxX = mp.x - boxW / 2;
      const boxY = mp.y - boxH / 2;

      // Outer badge (Yellow border + Solid Pitch Black fill like real airport airfield guidance sign)
      ctx.fillStyle = "rgba(5, 5, 8, 0.92)";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "#fbbf24"; // Aviation yellow border
      ctx.lineWidth = 1.2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Yellow signage text
      ctx.fillStyle = "#fef08a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mp.x, mp.y + 0.5);

      // Reset text alignment
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  });

  // 4c. Macro Taxiway Signboards (Always Visible at ALL Zoom Levels, including Scale 1.0 & Overview)
  if (showTaxiwayLabels) {
    const twLabels = airportData.taxiway_labels || [];
    twLabels.forEach(lbl => {
      const p = latLonToScreenCoord(lbl.lat, lbl.lon, st);
      const text = lbl.ref;

      // Fixed readable typography regardless of scale
      ctx.font = "900 12px 'Share Tech Mono', monospace";
      const textWidth = ctx.measureText(text).width;
      const boxW = Math.max(22, textWidth + 10);
      const boxH = 16;
      const boxX = p.x - boxW / 2;
      const boxY = p.y - boxH / 2;

      // High contrast black pill with neon aviation yellow border
      ctx.fillStyle = "#000000";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "#facc15"; // Neon Amber Yellow
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Glowing yellow letters
      ctx.fillStyle = "#fef08a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, p.x, p.y + 0.5);

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    });
  }

  // 4b. Pushback Waypoints & Release Point Indicator (Debug / Operational)
  if (airportData.routes && airportData.routes.pushback_waypoints) {
    const pts = airportData.routes.pushback_waypoints;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const pStart = latLonToScreenCoord(pts[0].lat, pts[0].lon, st);
    ctx.moveTo(pStart.x, pStart.y);
    for (let i = 1; i < pts.length; i++) {
      const pNext = latLonToScreenCoord(pts[i].lat, pts[i].lon, st);
      ctx.lineTo(pNext.x, pNext.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Stop / Release Point on Taxiway
    const relPt = pts[pts.length - 1];
    const sp = latLonToScreenCoord(relPt.lat, relPt.lon, st);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    if (st.zoom > 2.0) {
      ctx.font = "bold 9px 'Share Tech Mono'";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("PUSH RELEASE", sp.x + 8, sp.y + 3);
    }
  }

  // 4d. Runway Crossing Stop Bar Indicator (Only if explicitly required by actual runway intersection)

  // 5. Holding Positions (Stop Bars)
  (airportData.holding_positions || []).forEach(hp => {
    const p = latLonToScreenCoord(hp.lat, hp.lon, st);
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3, 3.5 * (st.zoom / 2)), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (st.zoom > 2.0) {
      ctx.font = "bold 9px 'Share Tech Mono'";
      ctx.fillStyle = "#fde68a";
      const hpName = hp.name || hp.ref || 'STOP BAR';
      // Offset holding point label slightly so it never collides with yellow taxiway badges
      ctx.fillText(`HOLD ${hpName}`, p.x + 8, p.y - 6);
    }
  });

  // 6. Runways
  (airportData.runways || []).forEach(rw => {
    if (!rw.coords || rw.coords.length < 2) return;
    const isAssignedRwy = (activeRwyKey && (rw.ref === activeRwyKey || rw.ref.includes(activeRwyKey)));

    ctx.beginPath();
    ctx.strokeStyle = isAssignedRwy ? "#10b981" : "#065f46";
    ctx.lineWidth = Math.max(6, (rw.width || 60) * 0.16 * st.zoom);
    const p0 = latLonToScreenCoord(rw.coords[0][0], rw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < rw.coords.length; i++) {
      const pt = latLonToScreenCoord(rw.coords[i][0], rw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Centerline dashed marking
    ctx.beginPath();
    ctx.strokeStyle = isAssignedRwy ? "#fef08a" : "#ffffff";
    ctx.lineWidth = Math.max(1.5, 1.2 * (st.zoom / 2));
    ctx.setLineDash([8 * st.zoom, 5 * st.zoom]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < rw.coords.length; i++) {
      const pt = latLonToScreenCoord(rw.coords[i][0], rw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Runway Designator Badges
    const pEnd = latLonToScreenCoord(rw.coords[rw.coords.length - 1][0], rw.coords[rw.coords.length - 1][1], st);
    ctx.font = isAssignedRwy ? "bold 14px 'Share Tech Mono'" : "bold 13px 'Share Tech Mono'";
    ctx.fillStyle = isAssignedRwy ? "#fef08a" : "#ffffff";
    ctx.fillText(`${rw.ref}${isAssignedRwy ? ' [ACTIVE]' : ''}`, p0.x - 14, p0.y - 8);
    ctx.fillText(`${rw.ref}${isAssignedRwy ? ' [ACTIVE]' : ''}`, pEnd.x + 8, pEnd.y + 8);
  });

  // Highlight tactical taxi path to cleared runway for selected aircraft on Ground
  if (selAc && ["GATE", "PUSHBACK", "READY_TAXI", "TAXI", "HOLDING"].includes(selAc.state)) {
    // If aircraft has its own calculated taxiway route (from Dijkstra or clearance), prioritize it
    let taxiCoords = null;
    if (selAc.route && selAc.route.length > 1) {
      taxiCoords = selAc.route.map(p => Array.isArray(p) ? p : [p.lat, p.lon]);
    } else {
      const dynRoute = (airportData && airportData.taxi_routes_by_runway && airportData.taxi_routes_by_runway[activeRwyKey])
        ? airportData.taxi_routes_by_runway[activeRwyKey]
        : null;
      if (dynRoute && dynRoute.coords && dynRoute.coords.length > 1) {
        taxiCoords = dynRoute.coords;
      }
    }

    if (taxiCoords && taxiCoords.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
      ctx.lineWidth = Math.max(2.5, 1.8 * st.zoom);
      ctx.setLineDash([6, 6]);
      const r0 = latLonToScreenCoord(taxiCoords[0][0], taxiCoords[0][1], st);
      ctx.moveTo(r0.x, r0.y);
      for (let i = 1; i < taxiCoords.length; i++) {
        const rp = latLonToScreenCoord(taxiCoords[i][0], taxiCoords[i][1], st);
        ctx.lineTo(rp.x, rp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Aircraft on ground (rendered as true scaled aerodynamic aircraft icons)
  aircraft.forEach((ac, idx) => {
    const p = latLonToScreenCoord(ac.lat, ac.lon, st);
    const isSel = idx === selectedAircraftIndex;

    // Draw scaled aircraft icon with physical fuselage, wingspan, and heading
    drawAircraftIcon(ctx, p.x, p.y, ac.heading, ac.type, isSel, ac.isHoldingForTraffic, true, st.zoom);

    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = isSel ? "#fbbf24" : "#4ade80";
    ctx.fillText(`${ac.id} (${ac.type})`, p.x + 14, p.y - 10);
    ctx.fillStyle = ac.isHoldingForTraffic ? "#f87171" : "#94a3b8";
    const statusLabel = ac.isHoldingForTraffic ? "HOLD (TRAFFIC AHEAD)" : `${ac.state} [${ac.squawk}]`;
    ctx.fillText(statusLabel, p.x + 14, p.y + 2);
  });
}

function drawTmaScreen() {
  if (!tmaCtx || !viewState.tma.width) return;
  const st = viewState.tma;
  const ctx = tmaCtx;
  ctx.clearRect(0, 0, st.width, st.height);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
  ctx.lineWidth = 1;
  // Range Rings (15NM, 30NM, 45NM, 60NM, 80NM, 100NM)
  const c = latLonToScreenCoord(refLat, refLon, st);
  [15, 30, 45, 60, 80, 100].forEach((nm) => {
    // 1 deg lat is approx 60 NM, BASE_SCALE = 60000
    // Radius in screen pixels for nm nautical miles:
    const rPixels = (nm / 60) * BASE_SCALE * st.zoom;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rPixels, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "9px 'Share Tech Mono'";
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    ctx.fillText(`${nm}NM`, c.x + rPixels + 3, c.y - 3);
  });

  // Milestone 4: Weather Radar Layer (Precipitation reflectivity overlay)
  drawWeatherRadarOverlay(ctx, st);

  // Milestone 5: Tactical Vectors & Separation Ruler Tool
  drawTacticalOverlays(ctx, st);

  // Milestone 6: Draw Holding Pattern Racetracks on Active Holding Fixes
  drawHoldingPatternOverlays(ctx, st);

  if (!airportData) return;

  // Runways simplified
  (airportData.runways || []).forEach(rw => {
    if (!rw.coords || rw.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    const p0 = latLonToScreenCoord(rw.coords[0][0], rw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < rw.coords.length; i++) {
      const pt = latLonToScreenCoord(rw.coords[i][0], rw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    drawExtendedCenterline(ctx, rw.coords, st);
  });

  // 1. Airways (ATS / RNAV Enroute routes - Solid thin lines with airway ID)
  (airportData.airways || []).forEach(aw => {
    if (!aw.coords || aw.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = aw.color || "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1.0;
    const p0 = latLonToScreenCoord(aw.coords[0][0], aw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < aw.coords.length; i++) {
      const pt = latLonToScreenCoord(aw.coords[i][0], aw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Airway Designator Badge
    const midIdx = Math.floor(aw.coords.length / 2);
    const pm = latLonToScreenCoord(aw.coords[midIdx][0], aw.coords[midIdx][1], st);
    ctx.font = "bold 9px 'Share Tech Mono'";
    ctx.fillStyle = aw.color || "#94a3b8";
    ctx.fillText(`${aw.id}`, pm.x - 8, pm.y + 14);
  });

  // Get selected aircraft cleared SID or STAR to highlight ONLY relevant active tactical route
  const selAc = (selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length)
    ? aircraft[selectedAircraftIndex]
    : null;
  const isSelectedArrival = selAc ? ["APPROACH", "FINAL", "LANDED", "TAXI_IN", "PARKED"].includes(selAc.state) : false;
  // If selected is departure: highlight clearedSid; if arrival: highlight clearedStar
  const activeSidId = (selAc && !isSelectedArrival) ? selAc.clearedSid : null;
  const activeStarId = (selAc && isSelectedArrival) ? selAc.clearedStar : null;

  // 2. SIDs (Standard Instrument Departures) - Orange/Amber dashed routes
  (airportData.sids || []).forEach(sid => {
    if (!sid.coords || sid.coords.length < 2) return;
    const isActive = activeSidId === sid.id;
    ctx.beginPath();
    ctx.strokeStyle = isActive ? "#f59e0b" : "rgba(245, 158, 11, 0.22)";
    ctx.lineWidth = isActive ? 3.0 : 1.2;
    ctx.setLineDash(isActive ? [8, 4] : [4, 4]);
    const p0 = latLonToScreenCoord(sid.coords[0][0], sid.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < sid.coords.length; i++) {
      const pt = latLonToScreenCoord(sid.coords[i][0], sid.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // SID Route Label (rendered at midpoint of first leg to avoid waypoint clutter)
    const pA = latLonToScreenCoord(sid.coords[0][0], sid.coords[0][1], st);
    const pB = latLonToScreenCoord(sid.coords[1][0], sid.coords[1][1], st);
    const pm = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    ctx.font = isActive ? "bold 10px 'Share Tech Mono'" : "8px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#fbbf24" : "rgba(245, 158, 11, 0.4)";
    ctx.fillText(`${isActive ? '★ ' : ''}${sid.id}`, pm.x - 12, pm.y - 6);
  });

  // 3. STARs (Standard Terminal Arrival Routes) - Cyan dashed routes
  (airportData.stars || []).forEach(star => {
    if (!star.coords || star.coords.length < 2) return;
    const isActive = activeStarId === star.id;
    ctx.beginPath();
    ctx.strokeStyle = isActive ? "#06b6d4" : "rgba(6, 182, 212, 0.22)";
    ctx.lineWidth = isActive ? 3.0 : 1.2;
    ctx.setLineDash(isActive ? [8, 4] : [3, 4]);
    const p0 = latLonToScreenCoord(star.coords[0][0], star.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < star.coords.length; i++) {
      const pt = latLonToScreenCoord(star.coords[i][0], star.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // STAR Route Label (rendered at midpoint of first leg to avoid waypoint clutter)
    const pA = latLonToScreenCoord(star.coords[0][0], star.coords[0][1], st);
    const pB = latLonToScreenCoord(star.coords[1][0], star.coords[1][1], st);
    const pm = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    ctx.font = isActive ? "bold 10px 'Share Tech Mono'" : "8px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#67e8f9" : "rgba(6, 182, 212, 0.4)";
    ctx.fillText(`${isActive ? '★ ' : ''}${star.id}`, pm.x + 6, pm.y - 6);
  });

  // 4. Center Coordination & Handoff Gateways (Entry / Exit fixes)
  (airportData.handoff_points || []).forEach(cop => {
    const p = latLonToScreenCoord(cop.lat, cop.lon, st);
    
    // Rotating / Pulsing Diamond Box for Handoff Boundary Gate
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.strokeRect(p.x - 7, p.y - 7, 14, 14);

    ctx.fillStyle = "rgba(168, 85, 247, 0.2)";
    ctx.fillRect(p.x - 7, p.y - 7, 14, 14);

    // Gateway Label
    ctx.font = "bold 9px 'Share Tech Mono'";
    ctx.fillStyle = "#c084fc";
    ctx.fillText(`COP ${cop.id}`, p.x + 10, p.y - 4);
    
    if (st.zoom > 0.4) {
      ctx.font = "8px 'Share Tech Mono'";
      ctx.fillStyle = "#e9d5ff";
      ctx.fillText(`${cop.sector}`, p.x + 10, p.y + 5);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`IN: ${cop.inbound_level} | OUT: ${cop.outbound_level}`, p.x + 10, p.y + 14);
    }
  });

  // 5. Regular Waypoints & Navaids
  (airportData.waypoints || []).concat(airportData.navaids || []).forEach(wp => {
    const p = latLonToScreenCoord(wp.lat, wp.lon, st);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x + 5, p.y + 4);
    ctx.lineTo(p.x - 5, p.y + 4);
    ctx.closePath();
    ctx.stroke();

    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(wp.id, p.x + 7, p.y + 3);
  });

  // 6. Airborne Safety Monitoring: STCA (Short Term Conflict Alert) & MSAW (Minimum Safe Altitude Warning)
  const activeAlerts = checkAirborneConflicts();

  // Draw STCA Conflict Vectors and Warning Rings between conflicting pairs
  activeAlerts.stcaPairs.forEach(pair => {
    const p1 = latLonToScreenCoord(pair.ac1.lat, pair.ac1.lon, st);
    const p2 = latLonToScreenCoord(pair.ac2.lat, pair.ac2.lon, st);

    // Flashing red conflict line connecting targets
    ctx.save();
    ctx.strokeStyle = (Math.floor(Date.now() / 250) % 2 === 0) ? "#ef4444" : "#fca5a5";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Red separation buffer ring (3 NM = 3 * 1852 meters)
    const nmInMeters = 1852;
    const centerLat = (pair.ac1.lat + pair.ac2.lat) / 2;
    const centerLon = (pair.ac1.lon + pair.ac2.lon) / 2;
    const midPt = latLonToScreenCoord(centerLat, centerLon, st);
    
    ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
    ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
    ctx.setLineDash([]);
    ctx.beginPath();
    // 3 NM radius converted to screen pixels
    const refPt = latLonToScreenCoord(centerLat + (3 / 60), centerLon, st);
    const radPx = Math.abs(refPt.y - midPt.y);
    ctx.arc(midPt.x, midPt.y, radPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    // Alert Badge in mid-distance
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 11px 'Share Tech Mono'";
    ctx.fillText(`⚡ STCA CONFLICT: ${pair.distNm.toFixed(1)}NM / ${Math.abs(pair.ac1.altitude - pair.ac2.altitude)}FT`, midPt.x - 70, midPt.y - 12);
    ctx.restore();
  });

  // Aircraft targets (rendered as true scaled aerodynamic aircraft icons with velocity vector)
  aircraft.forEach((ac, idx) => {
    const p = latLonToScreenCoord(ac.lat, ac.lon, st);
    const isSel = idx === selectedAircraftIndex;
    const hasStca = activeAlerts.conflictingIds.has(ac.id);
    const hasMsaw = activeAlerts.msawIds.has(ac.id);

    // Draw scaled aircraft icon with physical fuselage, wingspan, and heading
    drawAircraftIcon(ctx, p.x, p.y, ac.heading, ac.type, isSel, false, false, st.zoom);

    // Velocity vector leader line
    const rad = (ac.heading - 90) * (Math.PI / 180);
    const leaderLen = (ac.groundSpeed || 50) * 0.18;
    ctx.strokeStyle = hasStca ? "#ef4444" : (isSel ? "#f59e0b" : "#38bdf8");
    ctx.lineWidth = hasStca ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(rad) * leaderLen, p.y + Math.sin(rad) * leaderLen);
    ctx.stroke();

    // STCA / MSAW Flashing halo around aircraft target
    if (hasStca || hasMsaw) {
      ctx.save();
      const flash = (Math.floor(Date.now() / 300) % 2 === 0);
      ctx.strokeStyle = flash ? "#ef4444" : "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Squawk IDENT Radar Flash Effect (blooming cyan circle)
    const isIdent = ac.isIdentActive && Date.now() < (ac.identEndTime || 0);
    if (isIdent) {
      ctx.save();
      const identFlash = (Math.floor(Date.now() / 200) % 2 === 0);
      ctx.strokeStyle = identFlash ? "#38bdf8" : "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = hasStca ? "#f87171" : (isSel ? "#fbbf24" : "#bae6fd");
    ctx.fillText(`${ac.id} (${ac.type})`, p.x + 14, p.y - 10);
    
    ctx.fillStyle = "#94a3b8";
    // Milestone 4: QNH vs Standard Pressure Transition Altitude (11,000 ft WIII)
    // Below 11000 ft -> Altitude in feet (e.g. A030), at or above 11000 ft -> Flight Level (e.g. FL120, FL140)
    let altStr = "GND";
    if (ac.altitude > 0) {
      if (ac.altitude >= 11000) {
        altStr = `FL${String(Math.round(ac.altitude/100))}`;
      } else {
        altStr = `A${String(Math.round(ac.altitude/100)).padStart(3, '0')}`;
      }
    }
    const spdStr = `${ac.groundSpeed}K`;
    
    // FDE Scratchpad Overlay on Radar Tag (CFL / Assigned SPD / Direct Fix)
    const cflStr = (ac.fde && ac.fde.assignedAlt) ? `→${ac.fde.assignedAlt}` : "";
    const assignedSpdStr = (ac.fde && ac.fde.assignedSpd) ? `→${ac.fde.assignedSpd}` : "";
    const dirStr = (ac.fde && ac.fde.directFix) ? ` [${ac.fde.directFix}]` : "";

    ctx.fillText(`${altStr}${cflStr} ${spdStr}${assignedSpdStr}`, p.x + 14, p.y);

    if (isIdent) {
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px 'Share Tech Mono'";
      ctx.fillText(`★ IDENT`, p.x + 14, p.y + 10);
    } else if (hasStca) {
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 10px 'Share Tech Mono'";
      ctx.fillText(`⚡ STCA ALERT`, p.x + 14, p.y + 10);
    } else if (hasMsaw) {
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px 'Share Tech Mono'";
      ctx.fillText(`⚠ MSAW TERRAIN`, p.x + 14, p.y + 10);
    } else {
      ctx.fillText(`${ac.state}${dirStr}`, p.x + 14, p.y + 10);
    }
  });
}

function drawExtendedCenterline(ctx, coords, st) {
  if (coords.length < 2) return;
  const p0 = latLonToScreenCoord(coords[0][0], coords[0][1], st);
  const p1 = latLonToScreenCoord(coords[1][0], coords[1][1], st);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;

  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p0.x - ux * 180, p0.y - uy * 180);
  ctx.stroke();

  ctx.setLineDash([]);
}

function renderAllScreens() {
  drawGroundScreen();
  drawTmaScreen();
}

function setupCanvasInteraction(cElem, screenKey) {
  const st = viewState[screenKey];
  if (!cElem) return;

  let dragStartX = 0;
  let dragStartY = 0;
  let hasMovedSignificantly = false;

  let lastTouchDist = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  cElem.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      st.isDragging = true;
      hasMovedSignificantly = false;
      const t = e.touches[0];
      dragStartX = t.clientX;
      dragStartY = t.clientY;
      st.startX = t.clientX - st.panX;
      st.startY = t.clientY - st.panY;
    } else if (e.touches.length === 2) {
      // Pinch to zoom start
      e.preventDefault();
      st.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.hypot(dx, dy);
    }
  }, { passive: false });

  cElem.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && st.isDragging) {
      const t = e.touches[0];
      if (Math.abs(t.clientX - dragStartX) > 4 || Math.abs(t.clientY - dragStartY) > 4) {
        hasMovedSignificantly = true;
      }
      st.panX = t.clientX - st.startX;
      st.panY = t.clientY - st.startY;
      renderAllScreens();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastTouchDist > 0 && dist > 0) {
        const factor = dist / lastTouchDist;
        const clampedFactor = Math.max(0.7, Math.min(1.4, factor));
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = cElem.getBoundingClientRect();
        zoomScreen(screenKey, clampedFactor, midX - rect.left, midY - rect.top);
      }
      lastTouchDist = dist;
    }
  }, { passive: false });

  cElem.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      st.isDragging = false;
      lastTouchDist = 0;
    } else if (e.touches.length === 1) {
      // Switched from pinch to single touch
      lastTouchDist = 0;
      st.isDragging = true;
      const t = e.touches[0];
      st.startX = t.clientX - st.panX;
      st.startY = t.clientY - st.panY;
    }
  }, { passive: false });

  cElem.addEventListener('mousedown', (e) => {
    st.isDragging = true;
    hasMovedSignificantly = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    st.startX = e.clientX - st.panX;
    st.startY = e.clientY - st.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!st.isDragging) return;
    if (Math.abs(e.clientX - dragStartX) > 4 || Math.abs(e.clientY - dragStartY) > 4) {
      hasMovedSignificantly = true;
    }
    st.panX = e.clientX - st.startX;
    st.panY = e.clientY - st.startY;
    renderAllScreens();
  });

  window.addEventListener('mouseup', () => {
    st.isDragging = false;
  });

  // Direct Click on Radar Target to Select Aircraft
  cElem.addEventListener('click', (e) => {
    if (hasMovedSignificantly) return; // User was panning, ignore click
    const rect = cElem.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check hit radius with all active aircraft targets
    let closestAcIdx = -1;
    let minDistance = 28; // 28px generous click radius around aircraft silhouette

    aircraft.forEach((ac, idx) => {
      const p = latLonToScreenCoord(ac.lat, ac.lon, st);
      const d = Math.hypot(clickX - p.x, clickY - p.y);
      if (d < minDistance) {
        minDistance = d;
        closestAcIdx = idx;
      }
    });

    if (closestAcIdx !== -1) {
      if (rulerToolActive) {
        if (!rulerSelectedAc1) {
          rulerSelectedAc1 = aircraft[closestAcIdx];
          const pttStatus = document.getElementById('ptt-status');
          if (pttStatus) {
            pttStatus.innerHTML = `<span class="text-emerald-300 font-bold"><i class="fa-solid fa-ruler"></i> Target 1 (${rulerSelectedAc1.callsign}) dipilih! Sekarang klik target kedua...</span>`;
          }
        } else if (!rulerSelectedAc2 && aircraft[closestAcIdx].id !== rulerSelectedAc1.id) {
          rulerSelectedAc2 = aircraft[closestAcIdx];
          const distNm = calculateDistanceNm(rulerSelectedAc1.lat, rulerSelectedAc1.lon, rulerSelectedAc2.lat, rulerSelectedAc2.lon);
          const pttStatus = document.getElementById('ptt-status');
          if (pttStatus) {
            pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> SEPARASI: ${distNm.toFixed(2)} NM (${rulerSelectedAc1.callsign} ↔ ${rulerSelectedAc2.callsign})</span>`;
          }
        } else {
          // Reset anchor to this clicked aircraft
          rulerSelectedAc1 = aircraft[closestAcIdx];
          rulerSelectedAc2 = null;
        }
        renderAllScreens();
        return;
      }
      selectAircraft(closestAcIdx);
    } else {
      // Clicked on empty space: deselect aircraft
      if (!rulerToolActive) {
        selectedAircraftIndex = -1;
        renderFlightStrips();
        updateEasyModePrompter();
        renderAllScreens();
      }
    }
  });

  cElem.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const rect = cElem.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    zoomScreen(screenKey, factor, mouseX, mouseY);
  }, { passive: false });
}

function zoomScreen(screenKey, factor, anchorCanvasX = null, anchorCanvasY = null) {
  const st = viewState[screenKey];
  const minZoom = screenKey === 'tma' ? 0.01 : 0.05;
  const oldZoom = st.zoom;
  const newZoom = Math.max(minZoom, Math.min(25.0, oldZoom * factor));
  if (newZoom === oldZoom) return;

  // If anchor coordinates provided (e.g. cursor mousewheel position), zoom centered on anchor
  if (anchorCanvasX !== null && anchorCanvasY !== null) {
    const centerOffsetX = anchorCanvasX - st.width / 2;
    const centerOffsetY = anchorCanvasY - st.height / 2;
    st.panX = centerOffsetX - (centerOffsetX - st.panX) * (newZoom / oldZoom);
    st.panY = centerOffsetY - (centerOffsetY - st.panY) * (newZoom / oldZoom);
  } else {
    // Zoom centered around the current view center (keeping center locked)
    st.panX = st.panX * (newZoom / oldZoom);
    st.panY = st.panY * (newZoom / oldZoom);
  }

  st.zoom = newZoom;
  renderAllScreens();
}

function toggleTaxiwayLabels() {
  showTaxiwayLabels = !showTaxiwayLabels;
  const btn = document.getElementById('btn-toggle-tw-labels');
  if (btn) {
    if (showTaxiwayLabels) {
      btn.textContent = "TWY: ON";
      btn.className = "px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-600/80 text-amber-300 font-bold hover:bg-amber-900 mr-1 text-[10px]";
    } else {
      btn.textContent = "TWY: OFF";
      btn.className = "px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-600 text-slate-400 font-bold hover:bg-slate-700 mr-1 text-[10px]";
    }
  }
  renderAllScreens();
}

function resetScreen(screenKey) {
  const st = viewState[screenKey];
  st.panX = 0;
  st.panY = 0;
  st.zoom = screenKey === 'ground' ? 0.35 : 0.016;
  renderAllScreens();
}

let activeStripBayFilter = "ALL"; // 'ALL', 'DEP', 'TWR', 'APP'

function makeElementDraggable(headerEl, windowEl) {
  if (!headerEl || !windowEl) return;
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  headerEl.addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    if (e.touches.length !== 1) return;
    isDragging = true;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;

    const rect = windowEl.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    windowEl.style.transition = 'none';
    windowEl.style.right = 'auto';
    windowEl.style.bottom = 'auto';
    windowEl.style.left = `${initialLeft}px`;
    windowEl.style.top = `${initialTop}px`;
    windowEl.style.zIndex = '60';

    const onTouchMove = (ev) => {
      if (!isDragging || ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - windowEl.offsetWidth, initialLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - windowEl.offsetHeight, initialTop + dy));
      windowEl.style.left = `${newLeft}px`;
      windowEl.style.top = `${newTop}px`;
    };

    const onTouchEnd = () => {
      isDragging = false;
      windowEl.style.transition = '';
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }, { passive: true });

  headerEl.addEventListener('mousedown', (e) => {
    // Only drag with left mouse button and not on interactive buttons
    if (e.button !== 0 || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = windowEl.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Instantly disable CSS transitions during drag so movement is 1:1 instantaneous without rubber-banding
    windowEl.style.transition = 'none';
    windowEl.style.right = 'auto';
    windowEl.style.bottom = 'auto';
    windowEl.style.left = `${initialLeft}px`;
    windowEl.style.top = `${initialTop}px`;
    windowEl.style.zIndex = '60';

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - windowEl.offsetWidth, initialLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - windowEl.offsetHeight, initialTop + dy));
      windowEl.style.left = `${newLeft}px`;
      windowEl.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      windowEl.style.transition = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

function initDraggablePanels() {
  makeElementDraggable(document.getElementById('flight-strips-header'), document.getElementById('flight-strips-window'));
  makeElementDraggable(document.getElementById('aman-sequencer-header'), document.getElementById('aman-sequencer-panel'));
  makeElementDraggable(document.getElementById('logger-header'), document.getElementById('telemetry-logger-panel'));
}

window.addEventListener('DOMContentLoaded', () => {
  initDraggablePanels();
});

// Also call immediately in case DOM is already parsed
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initDraggablePanels();
}

// Strips Panel Visibility and Compact Mode State
let isFlightStripsOpen = true;
let isStripCompactMode = false;

function toggleFlightStripsPanel() {
  const panel = document.getElementById('flight-strips-window');
  const btn = document.getElementById('toggle-strips-btn');
  if (!panel) return;

  isFlightStripsOpen = !isFlightStripsOpen;
  if (isFlightStripsOpen) {
    panel.classList.remove('hidden');
    // If on mobile or dragged offscreen, position cleanly below navbar
    if (window.innerWidth < 768) {
      panel.style.left = '8px';
      panel.style.top = '72px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    if (btn) {
      btn.classList.add('bg-emerald-950', 'border-emerald-500', 'text-emerald-300');
      btn.classList.remove('bg-slate-900', 'border-emerald-800');
    }
    renderFlightStrips();
  } else {
    panel.classList.add('hidden');
    if (btn) {
      btn.classList.remove('bg-emerald-950', 'border-emerald-500');
      btn.classList.add('bg-slate-900', 'border-emerald-800');
    }
  }
}

function toggleStripCompactMode() {
  isStripCompactMode = !isStripCompactMode;
  const label = document.getElementById('strip-compact-label');
  const win = document.getElementById('flight-strips-window');
  if (label) label.textContent = isStripCompactMode ? "FULL" : "MINI";
  if (win) {
    if (isStripCompactMode) {
      win.classList.remove('w-80');
      win.classList.add('w-64');
    } else {
      win.classList.remove('w-64');
      win.classList.add('w-80');
    }
  }
  renderFlightStrips();
}

function setStripBayFilter(bay) {
  activeStripBayFilter = bay;
  ["all", "dep", "twr", "app"].forEach(b => {
    const el = document.getElementById(`bay-tab-${b}`);
    if (el) {
      if (b === bay.toLowerCase()) {
        el.className = "flex-1 py-0.5 rounded font-bold transition bg-emerald-700 text-white";
      } else {
        el.className = "flex-1 py-0.5 rounded transition text-slate-400 hover:text-white";
      }
    }
  });
  renderFlightStrips();
}

function getAircraftBayCategory(ac) {
  if (["GATE", "PUSHBACK", "READY_TAXI", "TAXI"].includes(ac.state)) return "DEP";
  if (["HOLD_SHORT_CROSS", "HOLDING", "LINE_UP", "LINING_UP", "TAKEOFF", "LANDED"].includes(ac.state)) return "TWR";
  if (["APPROACH", "FINAL", "AIRBORNE", "CLIMBING", "HANDOFF", "HANDED_OFF", "TAXI_IN", "PARKED"].includes(ac.state)) return "APP";
  return "DEP";
}

function triggerSquawkIdent(idx) {
  const ac = aircraft[idx];
  if (!ac) return;
  ac.isIdentActive = true;
  ac.identEndTime = Date.now() + 18000; // IDENT flashes for 18 seconds (standard radar spec)
  renderFlightStrips();
  renderAllScreens();
  playRadioChirp();
}

function updateAircraftScratchpad(idx, field, val) {
  const ac = aircraft[idx];
  if (!ac) return;
  if (!ac.fde) ac.fde = {};
  ac.fde[field] = val;
  renderFlightStrips();
  renderAllScreens();
}

function renderFlightStrips() {
  if (typeof updateAircraftFuelEndurance === 'function') {
    updateAircraftFuelEndurance();
  }
  if (typeof renderAmanSequencerPanel === 'function') {
    renderAmanSequencerPanel();
  }
  const container = document.getElementById('flight-strips');
  if (!container) return;

  const filtered = aircraft.map((ac, idx) => ({ ac, idx })).filter(item => {
    // Hide archived parked aircraft (turnaround phase) from cluttering the flight strips
    if (item.ac.isArchivedParked) return false;
    if (activeStripBayFilter === "ALL") return true;
    return getAircraftBayCategory(item.ac) === activeStripBayFilter;
  });

  const activeCount = aircraft.filter(a => !a.isArchivedParked).length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs italic">Tidak ada strip di Bay ${activeStripBayFilter}</div>`;
    document.getElementById('aircraft-count').textContent = `${activeCount} Active`;
    return;
  }

  container.innerHTML = filtered.map(({ ac, idx }) => {
    const isPending = !ac.hasCheckedIn;
    const isSel = idx === selectedAircraftIndex;
    const bayCat = getAircraftBayCategory(ac);
    const isIdent = ac.isIdentActive && Date.now() < (ac.identEndTime || 0);

    const availableRwys = ["25R", "07L", "25L", "07R", "24", "06"];
    const allSids = (airportData && airportData.sids) ? airportData.sids : [];
    const validSidsForRwy = allSids.filter(s => !s.runways || s.runways.includes(ac.clearedRwy)).map(s => s.id);
    const availableSids = validSidsForRwy.length > 0 ? validSidsForRwy : ["DOLTA 1C", "BUNTO 1C", "KRAKE 1C"];
    if (!availableSids.includes(ac.clearedSid)) {
      ac.clearedSid = availableSids[0];
    }

    const isArrival = ["APPROACH", "FINAL", "LANDED", "TAXI_IN", "PARKED"].includes(ac.state);
    const allStars = (airportData && airportData.stars) ? airportData.stars : [];
    const validStarsForRwy = allStars.filter(s => !s.runways || s.runways.includes(ac.clearedRwy)).map(s => s.id);
    const availableStars = validStarsForRwy.length > 0 ? validStarsForRwy : ["DOLTA 1A", "BUNTO 1A", "KRAKE 1A"];
    if (isArrival && !availableStars.includes(ac.clearedStar)) {
      ac.clearedStar = availableStars[0];
    }

    const assignedAlt = (ac.fde && ac.fde.assignedAlt) ? ac.fde.assignedAlt : "";
    const assignedSpd = (ac.fde && ac.fde.assignedSpd) ? ac.fde.assignedSpd : "";
    const directFix = (ac.fde && ac.fde.directFix) ? ac.fde.directFix : "";

    if (isStripCompactMode) {
      // MINIMALIST COMPACT STRIP (Clean, sleek, non-intrusive)
      return `
        <div onclick="selectAircraft(${idx})" class="p-1.5 rounded text-xs border transition cursor-pointer select-none ${isSel ? 'bg-amber-950/70 border-amber-500 ring-1 ring-amber-500' : 'bg-slate-950 border-emerald-950/80 hover:bg-slate-900/90'} ${isPending ? 'ring-1 ring-amber-400' : ''}">
          <div class="flex justify-between items-center text-[11px] font-mono">
            <div class="flex items-center gap-1 font-bold ${isSel ? 'text-amber-400' : 'text-emerald-400'}">
              <span class="text-[8px] px-1 py-0.1 rounded ${bayCat === 'DEP' ? 'bg-blue-950 text-blue-300' : (bayCat === 'TWR' ? 'bg-emerald-950 text-emerald-300' : 'bg-purple-950 text-purple-300')}">${bayCat}</span>
              <span>${ac.id}</span>
              <span class="text-[9px] text-slate-400">RWY${ac.clearedRwy || '25R'}</span>
            </div>
            <div class="flex items-center gap-1 text-[10px]">
              <span class="text-sky-300 font-bold">${ac.altitude}FT</span>
              <span class="text-slate-400">${ac.groundSpeed || 210}K</span>
              <span class="${ac.isHolding ? 'text-purple-400 font-bold' : 'text-slate-500'}">${ac.isHolding ? 'HOLD' : ac.state}</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div onclick="selectAircraft(${idx})" class="p-2.5 rounded text-xs border transition cursor-pointer select-none ${isSel ? 'bg-amber-950/50 border-amber-500 shadow-lg ring-1 ring-amber-500/80' : 'bg-slate-950 border-emerald-950/80 hover:bg-slate-900/90 hover:border-emerald-800'} ${isPending ? 'ring-1 ring-amber-400' : ''}">
        <!-- Strip Header: Callsign, Type, Bay Badge, Fuel, & Ident Button -->
        <div class="flex flex-wrap justify-between items-center gap-1">
          <div class="flex items-center gap-1.5 flex-wrap ${isSel ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}">
            <span class="text-[9px] px-1 py-0.2 rounded ${bayCat === 'DEP' ? 'bg-blue-900/80 text-blue-200' : (bayCat === 'TWR' ? 'bg-emerald-900/80 text-emerald-200' : 'bg-purple-900/80 text-purple-200')} font-mono">
              ${bayCat}
            </span>
            <span class="text-sm tracking-wide font-mono">${ac.id}</span>
            <span class="text-[10px] text-slate-400 font-normal">(${ac.type})</span>
            ${ac.pob ? `<span class="text-[9px] px-1 bg-slate-800 text-teal-300 font-mono rounded" title="Persons On Board">POB ${ac.pob}</span>` : ''}
            ${ac.dest ? `<span class="text-[9px] px-1 bg-slate-800 text-sky-300 font-mono rounded" title="Destination Airport">${ac.dest.split(' ')[0]}</span>` : ''}
            ${isSel ? '<span class="text-[9px] px-1 bg-amber-500 text-slate-950 font-bold rounded">ACTIVE</span>' : ''}
          </div>
          <div class="flex items-center gap-1 ml-auto">
            <!-- Fuel / Endurance Indicator -->
            <span class="text-[9px] px-1 py-0.2 rounded border font-mono ${ac.fuelMinutes < 15 ? 'bg-red-950 text-red-300 border-red-700 animate-pulse font-bold' : 'bg-slate-950 text-emerald-400 border-slate-800'}" title="Fuel Remaining / Endurance">
              <i class="fa-solid fa-gas-pump text-[8px] mr-0.5"></i>${(ac.fuelMinutes !== undefined ? ac.fuelMinutes : 45).toFixed(0)}m
            </span>
            <button onclick="event.stopPropagation(); triggerSquawkIdent(${idx})" class="text-[9px] px-1.5 py-0.5 rounded border transition font-bold font-mono ${isIdent ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}" title="Squawk IDENT Flash">
              ${isIdent ? '★ IDENT' : 'IDENT'}
            </button>
            <span class="text-[10px] truncate max-w-[90px] ${isPending ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400'}" title="${ac.airline}">
              ${isPending ? 'CALLING...' : ac.airline}
            </span>
          </div>
        </div>

        <!-- Clearance & Procedure Controls -->
        <div onclick="event.stopPropagation()" class="grid grid-cols-2 gap-1 text-[11px] text-slate-300 mt-1.5 bg-slate-900/90 p-1.5 rounded border border-slate-800">
          <div>
            <span class="text-[8px] text-slate-500 block uppercase">State</span>
            <b class="text-emerald-400 font-mono text-[10px]">${ac.state}</b>
          </div>
          <div>
            <span class="text-[8px] text-slate-500 block uppercase">Squawk Code</span>
            <input type="text" maxlength="4" value="${ac.squawk || '4215'}" onchange="aircraft[${idx}].squawk = this.value; renderFlightStrips(); renderAllScreens();" class="w-14 bg-slate-950 border border-slate-700 text-amber-300 font-mono text-[10px] rounded px-1 py-0 text-center focus:outline-none" />
          </div>
          <div class="col-span-1">
            <span class="text-[8px] text-slate-500 block uppercase">Cleared RWY</span>
            <select onchange="changeAircraftRunway(${idx}, this.value)" class="w-full bg-slate-950 border border-slate-700 text-amber-300 text-[10px] rounded px-1 py-0.5 focus:outline-none">
              ${availableRwys.map(r => `<option value="${r}" ${ac.clearedRwy === r ? 'selected' : ''}>RWY ${r}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-1">
            <span class="text-[8px] text-slate-500 block uppercase">${isArrival ? 'Assigned STAR' : 'Assigned SID'}</span>
            ${isArrival ? `
              <select onchange="changeAircraftStar(${idx}, this.value)" class="w-full bg-slate-950 border border-slate-700 text-cyan-300 text-[10px] rounded px-1 py-0.5 focus:outline-none">
                ${availableStars.map(s => `<option value="${s}" ${(ac.clearedStar || 'DOLTA 1A') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            ` : `
              <select onchange="changeAircraftSid(${idx}, this.value)" class="w-full bg-slate-950 border border-slate-700 text-sky-300 text-[10px] rounded px-1 py-0.5 focus:outline-none">
                ${availableSids.map(s => `<option value="${s}" ${(ac.clearedSid || 'DOLTA 1C') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            `}
          </div>
          <div class="col-span-2 flex items-center justify-between gap-1 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
            <span class="text-[8px] text-teal-400 font-mono font-bold uppercase">Stand / Gate</span>
            <select onchange="changeAircraftGate(${idx}, this.value)" class="bg-slate-950 border border-slate-700 text-teal-300 text-[10px] rounded px-1 py-0 focus:outline-none max-w-[140px]">
              ${(airportData.gates || []).map(g => `<option value="${g.ref}" ${(ac.assignedGate || 'E1') === g.ref ? 'selected' : ''}>${g.terminal ? g.terminal + ' · ' : ''}Gate ${g.ref}</option>`).join('')}
            </select>
          </div>
          ${["GATE", "PUSHBACK", "READY_TAXI", "TAXI", "LANDED", "TAXI_IN"].includes(ac.state) ? `
            <div class="col-span-2 flex items-center justify-between gap-1 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-900/40">
              <span class="text-[8px] text-amber-400 font-mono font-bold uppercase">Taxi Suggest</span>
              <span class="text-[9px] text-amber-300 font-mono truncate" title="${(typeof getAutoSuggestTaxiRoute === 'function' && getAutoSuggestTaxiRoute(ac).via) ? getAutoSuggestTaxiRoute(ac).via.join(' - ') : 'AUTO'}">
                ${(typeof getAutoSuggestTaxiRoute === 'function' && getAutoSuggestTaxiRoute(ac).via) ? getAutoSuggestTaxiRoute(ac).via.join(' ➔ ') : 'NC / NP'}
              </span>
            </div>
          ` : ''}
        </div>

        <!-- TACTICAL RESOLUTION CONTROLS (Milestone 5: Vector, Altitude Step, Speed, Go-Around) -->
        ${(ac.altitude > 100 && !["PARKED", "GATE", "PUSHBACK", "TAXI", "READY_TAXI"].includes(ac.state)) ? `
          <div onclick="event.stopPropagation()" class="mt-1 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[9px]">
            <!-- Tactical Vector Heading -->
            <div class="flex items-center gap-0.5">
              <span class="text-amber-400 font-mono font-bold">HDG:</span>
              <select onchange="issueRadarVector(${idx}, this.value)" class="bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[9px] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500 max-w-[85px]">
                <option value="" disabled selected>Turn...</option>
                <option value="090">090° (E)</option>
                <option value="180">180° (S)</option>
                <option value="250">250° (ILS)</option>
                <option value="270">270° (W)</option>
                <option value="360">360° (N)</option>
                <option value="RESUME">Resume</option>
              </select>
            </div>
            <!-- Tactical Speed Control -->
            <div class="flex items-center gap-0.5">
              <span class="text-sky-400 font-mono font-bold">SPD:</span>
              <select onchange="issueSpeedControl(${idx}, this.value)" class="bg-slate-950 border border-slate-800 text-sky-300 font-mono text-[9px] rounded px-1 py-0.5 focus:outline-none focus:border-sky-500 max-w-[85px]">
                <option value="" disabled selected>Speed...</option>
                <option value="160">160K</option>
                <option value="180">180K</option>
                <option value="210">210K</option>
                <option value="250">250K</option>
                <option value="RESUME">Resume</option>
              </select>
            </div>
            <!-- Tactical Holding Pattern Quick Control -->
            <div class="flex items-center gap-0.5">
              <span class="text-purple-400 font-mono font-bold">HOLD:</span>
              ${ac.isHolding ? `
                <button onclick="leaveHoldingPattern(${idx})" class="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300 font-bold hover:bg-emerald-900 text-[9px]" title="Leave Holding & Resume Approach">
                  LEAVE
                </button>
              ` : `
                <select onchange="if(this.value){ issueHoldingPattern(${idx}, this.value, 'FL100'); this.value=''; }" class="bg-slate-950 border border-slate-800 text-purple-300 font-mono text-[9px] rounded px-1 py-0.5 focus:outline-none focus:border-purple-500 max-w-[100px]">
                  <option value="" disabled selected>Hold At...</option>
                  <option value="TEGID">TEGID (FL100)</option>
                  <option value="BUNTO">BUNTO (FL100)</option>
                  <option value="DOLTA">DOLTA (FL100)</option>
                  <option value="TOPIN">TOPIN (FL100)</option>
                </select>
              `}
            </div>
            <!-- Go-Around (Missed Approach Button) -->
            ${ac.state === "FINAL" ? `
              <button onclick="issueGoAround(${idx})" class="px-2 py-0.5 rounded bg-red-950/80 border border-red-600/80 text-red-300 font-bold hover:bg-red-900 text-[9px]" title="Initiate Missed Approach & Go-Around">
                GO-AROUND
              </button>
            ` : ''}
          </div>
        ` : ''}

        <!-- FDE SCRATCHPAD (Flight Data Entry: CFL Altitude, Speed, Direct Fix) -->
        <div onclick="event.stopPropagation()" class="mt-1 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[9px]">
          <div class="flex items-center gap-1">
            <span class="text-slate-500 font-mono font-bold">CFL:</span>
            <input type="text" placeholder="A040" value="${assignedAlt}" onchange="updateAircraftScratchpad(${idx}, 'assignedAlt', this.value)" class="w-14 bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-[9px] rounded px-1 py-0.5 text-center focus:outline-none focus:border-emerald-500" title="Cleared Flight Level / Altitude" />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-slate-500 font-mono font-bold">SPD:</span>
            <input type="text" placeholder="210K" value="${assignedSpd}" onchange="updateAircraftScratchpad(${idx}, 'assignedSpd', this.value)" class="w-14 bg-slate-950 border border-slate-800 text-sky-300 font-mono text-[9px] rounded px-1 py-0.5 text-center focus:outline-none focus:border-sky-500" title="Assigned Airspeed" />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-slate-500 font-mono font-bold">DIR:</span>
            <input type="text" placeholder="TOPIN" value="${directFix}" onchange="updateAircraftScratchpad(${idx}, 'directFix', this.value)" class="w-16 bg-slate-950 border border-slate-800 text-amber-200 font-mono text-[9px] rounded px-1 py-0.5 text-center focus:outline-none focus:border-amber-500" title="Direct-To Fix" />
          </div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('aircraft-count').textContent = `${activeCount} Active`;
}

function changeAircraftRunway(idx, newRwy) {
  const ac = aircraft[idx];
  if (!ac) return;
  const oldRwy = ac.clearedRwy;
  ac.clearedRwy = newRwy;

  if (typeof logTelemetry === 'function') {
    logTelemetry('BEHAVIOR', `${ac.id} Runway Changed: ${oldRwy} -> ${newRwy}`, {
      state: ac.state,
      oldRunway: oldRwy,
      newRunway: newRwy,
      reroute: ['APPROACH', 'FINAL'].includes(ac.state) ? 'In-Flight ILS Recalculated' : 'Ground/SID Updated'
    });
  }

  if (ac.state === "HOLD_SHORT_CROSS") {
    ac._aiCrossIssued = false;
  }

  const isArrival = ["APPROACH", "FINAL", "LANDED", "TAXI_IN", "PARKED"].includes(ac.state);
  if (isArrival) {
    const allStars = (airportData && airportData.stars) ? airportData.stars : [];
    const validStars = allStars.filter(s => !s.runways || s.runways.includes(newRwy)).map(s => s.id);
    if (validStars.length > 0 && !validStars.includes(ac.clearedStar)) {
      ac.clearedStar = validStars[0];
    }

    // DYNAMIC IN-FLIGHT RE-ROUTING FOR ARRIVALS
    // If the aircraft is currently airborne approaching runway, recalculate flight path immediately to new runway!
    if (ac.state === "APPROACH" || ac.state === "FINAL") {
      console.log(`[ATC REROUTE] Dynamically splicing approach path for ${ac.id} from ${oldRwy} to ${newRwy}`);
      executeApproachMovement(ac);
    }
  } else {
    // Auto update clearedSid to a valid SID matching the new runway
    const allSids = (airportData && airportData.sids) ? airportData.sids : [];
    const validSids = allSids.filter(s => !s.runways || s.runways.includes(newRwy)).map(s => s.id);
    if (validSids.length > 0 && !validSids.includes(ac.clearedSid)) {
      ac.clearedSid = validSids[0];
    }
  }

  const mech = airportData && airportData.runway_mechanisms ? airportData.runway_mechanisms[newRwy] : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : newRwy;
  console.log(`[ATC ROUTE] Aircraft ${ac.id} assigned Runway ${newRwy} (HP: ${hpName})`);
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

function changeAircraftSid(idx, newSid) {
  const ac = aircraft[idx];
  if (!ac) return;
  ac.clearedSid = newSid;
  console.log(`[ATC ROUTE] Aircraft ${ac.id} assigned SID ${newSid}`);
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

function changeAircraftStar(idx, newStar) {
  const ac = aircraft[idx];
  if (!ac) return;
  const oldStar = ac.clearedStar;
  ac.clearedStar = newStar;
  console.log(`[ATC ROUTE] Aircraft ${ac.id} assigned STAR ${newStar}`);

  // Clear tactical vector so aircraft turns to follow the new STAR
  ac._tacticalVector = null;
  if (ac.fde) ac.fde.directFix = null;

  // If currently approaching, re-route trajectory to new STAR waypoints immediately
  if (ac.state === "APPROACH" || ac.state === "FINAL") {
    ac._forceRouteReset = (oldStar !== newStar);
    executeApproachMovement(ac);
  }

  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

function changeAircraftGate(idx, newGateRef) {
  const ac = aircraft[idx];
  if (!ac) return;
  ac.assignedGate = newGateRef;
  const gObj = (airportData && airportData.gates) ? airportData.gates.find(g => g.ref === newGateRef) : null;
  if (gObj) {
    ac.assignedGateCoord = [gObj.lat, gObj.lon];
    if (ac.state === "GATE" || ac.state === "PARKED") {
      ac.lat = gObj.lat;
      ac.lon = gObj.lon;
    }
  }
  console.log(`[ATC ROUTE] Aircraft ${ac.id} assigned Gate ${newGateRef}`);
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

let _cameraAnimFrame = null;

function focusAircraftOnGround(ac, optimalZoom = null) {
  if (!ac) return;
  const st = viewState.ground;

  if (_cameraAnimFrame) {
    cancelAnimationFrame(_cameraAnimFrame);
    _cameraAnimFrame = null;
  }

  const startZoom = st.zoom;
  const startPanX = st.panX;
  const startPanY = st.panY;

  // Keep current user zoom level (or default 1.0) so no forced unwanted close-up zoom happens
  const targetZoom = (optimalZoom !== null) ? optimalZoom : st.zoom;
  const targetPanX = - (ac.lon - refLon) * BASE_SCALE * targetZoom;
  const targetPanY = (ac.lat - refLat) * BASE_SCALE * targetZoom;

  const duration = 400; // ms
  const startTime = performance.now();

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = easeOutCubic(progress);

    st.zoom = startZoom + (targetZoom - startZoom) * ease;
    st.panX = startPanX + (targetPanX - startPanX) * ease;
    st.panY = startPanY + (targetPanY - startPanY) * ease;

    renderAllScreens();

    if (progress < 1) {
      _cameraAnimFrame = requestAnimationFrame(step);
    } else {
      _cameraAnimFrame = null;
    }
  }

  _cameraAnimFrame = requestAnimationFrame(step);
}

function selectAircraft(idx) {
  selectedAircraftIndex = idx;
  const ac = aircraft[idx];

  // Update active VHF Frequency display based on selected aircraft sector
  updateActiveFrequencyUI();

  // Center smoothly on selected aircraft without modifying current zoom scale (stays 1.0)
  if (ac) {
    focusAircraftOnGround(ac);
  }

  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();

  // If selected aircraft has not checked in, trigger check-in call!
  if (ac && !ac.hasCheckedIn && !isRadioTransmitting) {
    triggerPilotCheckIn(ac);
  }
}

function switchTab(tab) {
  currentTab = tab;
  const radarView = document.getElementById('radar-view');
  const academyView = document.getElementById('academy-view');
  const radarBtn = document.getElementById('tab-radar-btn');
  const acadBtn = document.getElementById('tab-academy-btn');

  if (tab === 'radar') {
    radarView.classList.remove('hidden');
    academyView.classList.add('hidden');
    radarBtn.className = "px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white";
    acadBtn.className = "px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition text-slate-400 hover:text-white";
    resizeCanvases();
    updateEasyModePrompter();
  } else {
    radarView.classList.add('hidden');
    academyView.classList.remove('hidden');
    acadBtn.className = "px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white";
    radarBtn.className = "px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition text-slate-400 hover:text-white";
    loadAcademyLessons();
    if (typeof initAcademyTutorial === 'function') {
      initAcademyTutorial();
    }
  }
}

// Flight Academy Logic
let lessons = [];
let activeLesson = null;
let lessonScores = {};

async function loadAcademyLessons() {
  try {
    const resp = await fetch('/api/academy/lessons');
    lessons = await resp.json();
    renderLessonList();
    if (lessons.length > 0 && !activeLesson) {
      selectLesson(lessons[0].id);
    }
  } catch (e) {
    console.error("Failed to load lessons:", e);
  }
}

function renderLessonList() {
  const container = document.getElementById('lesson-list');
  if (!container) return;
  container.innerHTML = lessons.map((l, idx) => {
    const score = lessonScores[l.id];
    const scoreBadge = score !== undefined ? `<span class="text-[10px] text-emerald-400 font-radar">${score}%</span>` : '';
    const isActive = activeLesson && activeLesson.id === l.id;
    return `
      <div onclick="selectLesson('${l.id}')" class="p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${isActive ? 'bg-emerald-950/60 border-emerald-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'}">
        <div>
          <div class="text-[10px] font-radar uppercase text-emerald-500">${l.phase.split('/')[0]}</div>
          <div class="text-xs font-semibold mt-0.5">${idx + 1}. ${l.title}</div>
        </div>
        ${scoreBadge}
      </div>
    `;
  }).join('');
}

function selectLesson(id) {
  activeLesson = lessons.find(l => l.id === id);
  if (!activeLesson) return;

  renderLessonList();
  document.getElementById('drill-phase').textContent = activeLesson.phase;
  document.getElementById('drill-title').textContent = activeLesson.title;
  document.getElementById('drill-badge').textContent = `${activeLesson.aircraft.callsign} (${activeLesson.aircraft.type})`;
  document.getElementById('drill-situation').textContent = activeLesson.situation;
  document.getElementById('drill-target').textContent = activeLesson.target_text;
  document.getElementById('drill-tips').textContent = activeLesson.phonetic_tips;

  document.getElementById('academy-transcript').textContent = "Belum ada transmisi...";
  document.getElementById('drill-score').textContent = lessonScores[id] !== undefined ? `${lessonScores[id]}%` : "--";
  document.getElementById('readback-container').classList.add('hidden');
}

function playExampleSpeech() {
  if (activeLesson) {
    speakPilotReadback(activeLesson.target_text);
  }
}

function handleAcademyResult(res) {
  document.getElementById('academy-transcript').textContent = `"${res.text}"`;
  document.getElementById('drill-score').textContent = `${res.score}%`;
  lessonScores[activeLesson.id] = res.score;
  renderLessonList();

  if (res.score >= 55) {
    const rbCont = document.getElementById('readback-container');
    const rbText = document.getElementById('pilot-readback-text');
    rbCont.classList.remove('hidden');
    rbText.textContent = activeLesson.pilot_readback;
    speakPilotReadback(activeLesson.pilot_readback);
  }

  const scores = Object.values(lessonScores);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  document.getElementById('academy-score-total').textContent = `${avg}%`;
}

function handleRadarVoiceCommand(text, parsedData) {
  const parsed = parsedData || {};
  const norm = (parsed.normalized || text).toLowerCase();
  
  // Find matching aircraft
  let matchedAc = null;
  if (parsed.callsign) {
    const cs = parsed.callsign.toLowerCase().replace(/\s+/g, '');
    matchedAc = aircraft.find(a => a.id.toLowerCase() === cs || a.callsign.toLowerCase().includes(cs));
  }
  if (!matchedAc) {
    matchedAc = aircraft.find(a => norm.includes(a.id.toLowerCase()) || norm.includes(a.callsign.toLowerCase()));
  }
  if (!matchedAc) {
    if (norm.includes("garuda") || norm.includes("indonesia") || norm.includes("502")) {
      matchedAc = aircraft.find(a => a.id.includes("502") || a.callsign.includes("502"));
    } else if (norm.includes("supergreen") || norm.includes("citilink") || norm.includes("123")) {
      matchedAc = aircraft.find(a => a.id.includes("123") || a.callsign.includes("123"));
    } else if (norm.includes("lion") || norm.includes("712")) {
      matchedAc = aircraft.find(a => a.id.includes("712") || a.callsign.includes("712"));
    } else if (norm.includes("batik") || norm.includes("650")) {
      matchedAc = aircraft.find(a => a.id.includes("650") || a.callsign.includes("650"));
    }
  }

  // Fallback: If no callsign in transmission, apply to currently selected aircraft or solitary active aircraft
  if (!matchedAc) {
    if (selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length) {
      matchedAc = aircraft[selectedAircraftIndex];
    } else if (aircraft.length === 1) {
      matchedAc = aircraft[0];
    } else {
      const approachAc = aircraft.filter(a => ["APPROACH", "FINAL"].includes(a.state));
      if (approachAc.length === 1) {
        matchedAc = approachAc[0];
      }
    }
  }
  
  if (matchedAc) {
    let readback = "";
    const intent = parsed.intent || "";

    // Extract commanded runway if specified in speech
    let commandedRwy = null;
    if (parsed.runway) {
      const cr = parsed.runway.toUpperCase().replace(/\s+/g, '');
      if (["25L", "25R", "07L", "07R", "24", "06"].includes(cr)) {
        commandedRwy = cr;
      }
    }
    if (!commandedRwy) {
      if (/\b(?:25\s*l(?:eft)?|two\s*five\s*left)\b/i.test(norm)) commandedRwy = "25L";
      else if (/\b(?:25\s*r(?:ight)?|two\s*five\s*right)\b/i.test(norm)) commandedRwy = "25R";
      else if (/\b(?:0?7\s*l(?:eft)?|zero\s*seven\s*left|seven\s*left)\b/i.test(norm)) commandedRwy = "07L";
      else if (/\b(?:0?7\s*r(?:ight)?|zero\s*seven\s*right|seven\s*right)\b/i.test(norm)) commandedRwy = "07R";
      else if (/\b(?:24|two\s*four)\b/i.test(norm)) commandedRwy = "24";
      else if (/\b(?:0?6|zero\s*six)\b/i.test(norm)) commandedRwy = "06";
    }

    const acIdx = aircraft.findIndex(a => a.id === matchedAc.id);
    if (commandedRwy && acIdx >= 0 && commandedRwy !== matchedAc.clearedRwy) {
      changeAircraftRunway(acIdx, commandedRwy);
    }

    const rwyKey = matchedAc.clearedRwy || commandedRwy || "25R";
    const rwyPhoneticMap = {
      "25R": "two five right",
      "25L": "two five left",
      "07L": "zero seven left",
      "07R": "zero seven right",
      "24": "two four",
      "06": "zero six"
    };
    const rwySpoken = rwyPhoneticMap[rwyKey] || rwyKey;
    const mech = airportData && airportData.runway_mechanisms ? airportData.runway_mechanisms[rwyKey] : null;
    const hpName = mech && mech.holding_point ? mech.holding_point.name : "N1";

    if (matchedAc.state === "GATE" && (intent === "PUSHBACK" || norm.includes("push") || norm.includes("start"))) {
      matchedAc.state = "PUSHBACK";
      readback = "Push and start approved, facing west, " + matchedAc.callsign;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Pushback & Start Approved`, 'Facing West | State -> PUSHBACK');
      }
      executePushbackMovement(matchedAc);
    } else if (matchedAc.state === "READY_TAXI" && (intent === "TAXI" || norm.includes("taxi"))) {
      matchedAc.state = "TAXI";
      matchedAc._runwayCrossCleared = false;

      // Extract spoken taxiway via from ATC voice command if any
      const spokenViaList = [];
      const twyDict = [
        { pattern: /\b(?:sierra\s+papa\s+(?:1|one)|sp\s*1)\b/i, code: "SP1", spoken: "Sierra Papa one" },
        { pattern: /\b(?:sierra\s+papa\s+(?:2|two)|sp\s*2)\b/i, code: "SP2", spoken: "Sierra Papa two" },
        { pattern: /\b(?:november\s+papa\s+(?:1|one)|np\s*1)\b/i, code: "NP1", spoken: "November Papa one" },
        { pattern: /\b(?:november\s+papa\s+(?:2|two)|np\s*2)\b/i, code: "NP2", spoken: "November Papa two" },
        { pattern: /\b(?:november\s+papa\s+(?:3|three)|np\s*3)\b/i, code: "NP3", spoken: "November Papa three" },
        { pattern: /\b(?:whiskey\s+charlie\s+(?:1|one)|wc\s*1)\b/i, code: "WC1", spoken: "Whiskey Charlie one" },
        { pattern: /\b(?:whiskey\s+charlie\s+(?:2|two)|wc\s*2)\b/i, code: "WC2", spoken: "Whiskey Charlie two" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:1|one)|sc\s*1)\b/i, code: "SC1", spoken: "Sierra Charlie one" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:2|two)|sc\s*2)\b/i, code: "SC2", spoken: "Sierra Charlie two" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:4|four)|sc\s*4)\b/i, code: "SC4", spoken: "Sierra Charlie four" },
        { pattern: /\b(?:november\s+charlie\s+(?:1|one)|nc\s*1)\b/i, code: "NC1", spoken: "November Charlie one" },
        { pattern: /\b(?:november\s+charlie\s+(?:2|two)|nc\s*2)\b/i, code: "NC2", spoken: "November Charlie two" },
        { pattern: /\b(?:november\s+charlie\s+(?:3|three)|nc\s*3)\b/i, code: "NC3", spoken: "November Charlie three" },
        { pattern: /\b(?:november\s+charlie\s+(?:6|six)|nc\s*6)\b/i, code: "NC6", spoken: "November Charlie six" },
        { pattern: /\b(?:november\s+charlie\s+(?:7|seven)|nc\s*7)\b/i, code: "NC7", spoken: "November Charlie seven" },
        { pattern: /\b(?:november\s+charlie\s+yankee|ncy)\b/i, code: "NCY", spoken: "November Charlie Yankee" },
        { pattern: /\b(?:november\s+(?:1|one)|n\s*1)\b/i, code: "N1", spoken: "November one" },
        { pattern: /\b(?:november\s+(?:2|two)|n\s*2)\b/i, code: "N2", spoken: "November two" },
        { pattern: /\b(?:november\s+(?:3|three)|n\s*3)\b/i, code: "N3", spoken: "November three" },
        { pattern: /\b(?:november\s+(?:9|nine)|n\s*9)\b/i.test(norm) ? "N9" : null, code: "N9", spoken: "November nine" },
        { pattern: /\b(?:sierra\s+(?:1|one)|s\s*1)\b/i, code: "S1", spoken: "Sierra one" },
        { pattern: /\b(?:sierra\s+(?:2|two)|s\s*2)\b/i, code: "S2", spoken: "Sierra two" },
        { pattern: /\b(?:sierra\s+(?:9|nine)|s\s*9)\b/i, code: "S9", spoken: "Sierra nine" }
      ];

      for (const twy of twyDict) {
        if (twy.pattern && twy.pattern.test(norm)) {
          spokenViaList.push(twy);
        }
      }

      let taxiRouteSpoken = hpName;
      if (spokenViaList.length > 0) {
        matchedAc.assignedTaxiVia = spokenViaList.map(item => item.code);
        taxiRouteSpoken = spokenViaList.map(item => item.spoken).join(", ");
      } else {
        const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(matchedAc) : null;
        if (autoTaxi && autoTaxi.via) {
          matchedAc.assignedTaxiVia = autoTaxi.via;
          taxiRouteSpoken = autoTaxi.text || autoTaxi.via.join(", ");
        }
      }

      readback = `Taxi holding point runway ${rwySpoken} via ${taxiRouteSpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Taxi Clearance Granted`, `Holding Point: ${hpName} (RWY ${rwySpoken}) via ${taxiRouteSpoken} | State -> TAXI`);
      }
      executeTaxiMovement(matchedAc);
    } else if (matchedAc.state === "HOLD_SHORT_CROSS" && (norm.includes("cross") || norm.includes("continue") || norm.includes("proceed"))) {
      matchedAc.state = "TAXI";
      matchedAc._runwayCrossCleared = true;
      readback = `Cross runway two five right, November cross, wilco, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Runway Crossing Approved`, 'Cross RWY 25R at November Cross');
      }
      executeTaxiMovement(matchedAc);
    } else if ((matchedAc.state === "HOLDING" || matchedAc.state === "TAXI") && (intent === "LINE_UP" || norm.includes("line up") || norm.includes("wait"))) {
      matchedAc.state = "LINE_UP";
      readback = `Line up and wait, runway ${rwySpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Line Up and Wait`, `Runway: ${rwySpoken} | State -> LINE_UP`);
      }
      executeLineUpMovement(matchedAc);
    } else if ((matchedAc.state === "LINE_UP" || matchedAc.state === "LINING_UP" || matchedAc.state === "HOLDING") && (intent === "TAKEOFF" || norm.includes("takeoff") || norm.includes("take off") || norm.includes("cleared"))) {
      readback = `Cleared for takeoff runway ${rwySpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Cleared for Takeoff`, `Runway: ${rwySpoken} | State -> TAKEOFF (Rolling)`);
      }
      if (matchedAc.state === "LINING_UP") {
        // Pilot acknowledges clearance, completes the lineup curve first to runway threshold, then rolls!
        matchedAc.takeoffQueued = true;
      } else {
        matchedAc.state = "TAKEOFF";
        executeTakeoffMovement(matchedAc);
      }
    } else if (matchedAc.state === "APPROACH" && (norm.includes("ils") || norm.includes("descend") || norm.includes("approach") || norm.includes("cleared"))) {
      if (!matchedAc.fde) matchedAc.fde = {};
      matchedAc.fde.assignedAlt = "A030";
      readback = `Descend 3000 feet, cleared ILS runway ${rwySpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Cleared ILS Approach`, `Runway: ${rwySpoken} | Assigned Alt: A030 (3000ft)`);
      }
    } else if ((matchedAc.state === "FINAL" || matchedAc.state === "APPROACH") && (norm.includes("land") || norm.includes("cleared"))) {
      if (!matchedAc.fde) matchedAc.fde = {};
      matchedAc.fde.assignedAlt = "GND";
      readback = `Cleared to land runway ${rwySpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Cleared to Land`, `Runway: ${rwySpoken} | Landing Rollout Authorized`);
      }
    } else if (norm.includes("leave hold") || norm.includes("resume approach") || norm.includes("cancel hold")) {
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = leaveHoldingPattern(idx);
    } else if (norm.includes("hold") || norm.includes("holding")) {
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      let fix = "TEGID";
      if (norm.includes("bunto")) fix = "BUNTO";
      else if (norm.includes("dolta")) fix = "DOLTA";
      else if (norm.includes("topin")) fix = "TOPIN";
      else if (norm.includes("rakit")) fix = "RAKIT";
      readback = issueHoldingPattern(idx, fix, "FL100");
    } else if (commandedRwy) {
      readback = `Expect runway ${rwySpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Runway Assignment Updated`, `Runway: ${rwySpoken}`);
      }
    } else if (norm.includes("go around") || norm.includes("missed approach") || norm.includes("go round") || intent === "GO_AROUND") {
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = issueGoAround(idx);
      if (typeof logTelemetry === 'function') {
        logTelemetry('SAFETY', `${matchedAc.id} Go-Around / Missed Approach`, 'Immediate Climb & Abort Landing');
      }
    } else if ((norm.includes("turn") || norm.includes("heading") || intent === "VECTOR") && matchedAc.altitude > 100) {
      const hdgMatch = norm.match(/\b(?:heading|turn\s*(?:left|right)?(?:\s*heading)?)\s*(\d{2,3})\b/);
      const targetHdg = hdgMatch ? parseInt(hdgMatch[1], 10) : 180;
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = issueRadarVector(idx, targetHdg);
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Tactical Vector Heading`, `Assigned Heading: ${targetHdg}°`);
      }
    } else if ((norm.includes("speed") || norm.includes("reduce") || norm.includes("maintain") || intent === "SPEED") && matchedAc.altitude > 100) {
      const spdMatch = norm.match(/\b(?:speed|to|reduce|maintain)\s*(\d{2,3})\s*(?:knots|kts)?\b/);
      const targetSpd = spdMatch ? parseInt(spdMatch[1], 10) : 210;
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = issueSpeedControl(idx, targetSpd);
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Tactical Speed Adjustment`, `Target Airspeed: ${targetSpd} kts`);
      }
    } else if ((norm.includes("climb") || norm.includes("descend")) && matchedAc.altitude > 100) {
      const flMatch = norm.match(/\b(?:flight\s*level|fl)\s*(\d{2,3})\b/);
      const altMatch = norm.match(/\b(\d{1,2})\s*(?:thousand)?\s*(?:feet|ft)?\b/);
      const targetAlt = flMatch ? `FL${flMatch[1]}` : (altMatch ? `A${String(parseInt(altMatch[1], 10) * 10).padStart(3, '0')}` : "A050");
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = issueAltitudeStep(idx, targetAlt);
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Altitude Step Adjustment`, `Assigned Altitude: ${targetAlt}`);
      }
    } else if (matchedAc.state === "LANDED" && (norm.includes("ground") || norm.includes("vacate") || norm.includes("121") || norm.includes("taxi"))) {
      matchedAc.state = "TAXI_IN";
      const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(matchedAc) : null;
      const exitSpoken = (autoTaxi && autoTaxi.exitSpoken) ? autoTaxi.exitSpoken : "November five";
      const gateSpoken = (typeof formatTaxiwayPhonetic === "function") ? formatTaxiwayPhonetic(matchedAc.assignedGate || "E1") : (matchedAc.assignedGate || "Echo one");
      const routeSpoken = (autoTaxi && autoTaxi.text) ? autoTaxi.text : "November Charlie";
      readback = `Vacating via ${exitSpoken}, taxi to Gate ${gateSpoken} via ${routeSpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Runway Vacated & Taxi In`, `Exit: ${exitSpoken} | Gate: ${matchedAc.assignedGate || 'E1'} via ${autoTaxi && autoTaxi.via ? autoTaxi.via.join(' - ') : 'NC'}`);
      }
      executeTaxiInMovement(matchedAc);
    } else if (matchedAc.state === "TAXI_IN" && (norm.includes("gate") || norm.includes("stand") || norm.includes("taxi") || norm.includes("continue"))) {
      readback = `Taxi to Gate Echo 1 via November Charlie, ${matchedAc.callsign}`;
      executeTaxiInMovement(matchedAc);
    } else if (matchedAc.state === "AIRBORNE" && (norm.includes("approach") || norm.includes("radar") || norm.includes("119") || norm.includes("125"))) {
      matchedAc.state = "CLIMBING";
      if (!matchedAc.fde) matchedAc.fde = {};
      matchedAc.fde.assignedAlt = "FL140";
      readback = "119 decimal 75, " + matchedAc.callsign;
      executeClimbEnroute(matchedAc);
    } else if ((matchedAc.state === "CLIMBING" || matchedAc.state === "HANDOFF") && (norm.includes("center") || norm.includes("128") || norm.includes("handoff") || norm.includes("good day"))) {
      matchedAc.state = "HANDED_OFF";
      if (!matchedAc.fde) matchedAc.fde = {};
      matchedAc.fde.assignedAlt = "FL240";
      readback = "128 decimal 5, good day, " + matchedAc.callsign;
      executeHandoffComplete(matchedAc);
    } else {
      readback = "Roger, " + matchedAc.callsign;
    }

    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();
    speakPilotReadback(readback);
  }
}

// Autonomous Flight Movement Sequences for GIA502
// Min-Heap Priority Queue for high-performance Dijkstra pathfinding
class TaxiMinHeap {
  constructor() { this.data = []; }
  push(item) {
    this.data.push(item);
    this.up(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.down(0);
    }
    return top;
  }
  up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[i].d < this.data[p].d) {
        [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
        i = p;
      } else break;
    }
  }
  down(i) {
    const len = this.data.length;
    while ((i << 1) + 1 < len) {
      let left = (i << 1) + 1;
      let right = left + 1;
      let best = (right < len && this.data[right].d < this.data[left].d) ? right : left;
      if (this.data[best].d < this.data[i].d) {
        [this.data[i], this.data[best]] = [this.data[best], this.data[i]];
        i = best;
      } else break;
    }
  }
  isEmpty() { return this.data.length === 0; }
}

// Authentic Dijkstra Taxiway Routing on WIII OSM Graph with Tactical VIA Waypoint Enforcement
let _twyRefToNodesCache = null;

function buildTaxiwayRefNodeMap() {
  if (_twyRefToNodesCache) return _twyRefToNodesCache;
  if (!airportData || !airportData.taxi_graph || !airportData.taxiways) return {};

  const nodes = airportData.taxi_graph.nodes;
  const taxiways = airportData.taxiways;
  const coordToNode = new Map();

  for (const nid in nodes) {
    const pt = nodes[nid];
    const key = `${Math.round(pt[0] * 100000)},${Math.round(pt[1] * 100000)}`;
    coordToNode.set(key, nid);
  }

  const map = {};
  for (const twy of taxiways) {
    const ref = twy.ref;
    if (!ref) continue;
    const refUpper = ref.toUpperCase();
    if (!map[refUpper]) map[refUpper] = new Set();
    for (const c of (twy.coords || [])) {
      const key = `${Math.round(c[0] * 100000)},${Math.round(c[1] * 100000)}`;
      const nid = coordToNode.get(key);
      if (nid) map[refUpper].add(nid);
    }
  }

  _twyRefToNodesCache = map;
  return map;
}

function findTaxiwayPath(startLat, startLon, endLat, endLon, requestedVia = null) {
  if (!airportData || !airportData.taxi_graph) return null;
  const graph = airportData.taxi_graph;
  const nodes = graph.nodes;
  const adj = graph.adj;

  let startNode = null, minDistStart = Infinity;
  let endNode = null, minDistEnd = Infinity;

  for (const nid in nodes) {
    const pt = nodes[nid];
    const dStart = (pt[0] - startLat) ** 2 + (pt[1] - startLon) ** 2;
    if (dStart < minDistStart) {
      minDistStart = dStart;
      startNode = nid;
    }
    const dEnd = (pt[0] - endLat) ** 2 + (pt[1] - endLon) ** 2;
    if (dEnd < minDistEnd) {
      minDistEnd = dEnd;
      endNode = nid;
    }
  }

  if (!startNode || !endNode || startNode === endNode) {
    return [[startLat, startLon], [endLat, endLon]];
  }

  const twyMap = buildTaxiwayRefNodeMap();
  const avoidNodes = new Set();
  const preferNodes = new Set();

  if (requestedVia && requestedVia.length > 0) {
    for (const v of requestedVia) {
      const vUpper = String(v).toUpperCase().trim();
      if (twyMap[vUpper]) {
        for (const nid of twyMap[vUpper]) preferNodes.add(nid);
      }
      // If ATC explicitly commands one parallel corridor, penalize the opposite parallel corridor
      if (vUpper === "SP1" && twyMap["SP2"]) {
        for (const nid of twyMap["SP2"]) avoidNodes.add(nid);
      } else if (vUpper === "SP2" && twyMap["SP1"]) {
        for (const nid of twyMap["SP1"]) avoidNodes.add(nid);
      } else if (vUpper === "NP1" && twyMap["NP2"]) {
        for (const nid of twyMap["NP2"]) avoidNodes.add(nid);
      } else if (vUpper === "NP2" && twyMap["NP1"]) {
        for (const nid of twyMap["NP1"]) avoidNodes.add(nid);
      }
    }
  }

  const dist = {};
  const prev = {};
  const pq = new TaxiMinHeap();
  dist[startNode] = 0;
  pq.push({ id: startNode, d: 0 });

  while (!pq.isEmpty()) {
    const cur = pq.pop();
    const u = cur.id;
    if (u === endNode) break;
    if (cur.d > dist[u]) continue;

    const neighbors = adj[u];
    if (!neighbors) continue;
    const uPt = nodes[u];

    for (let i = 0; i < neighbors.length; i++) {
      const v = neighbors[i];
      const vPt = nodes[v];
      const dLat = (vPt[0] - uPt[0]) * 111000;
      const dLon = (vPt[1] - uPt[1]) * 111000 * Math.cos(uPt[0] * Math.PI / 180);
      let weight = Math.hypot(dLat, dLon);

      if (avoidNodes.has(v)) {
        weight += 10000.0; // Heavy penalty to prevent diverting into forbidden taxiway
      }
      if (preferNodes.has(v)) {
        weight *= 0.1; // 10x attraction bonus to follow commanded taxiway
      }

      const newDist = cur.d + weight;

      if (dist[v] === undefined || newDist < dist[v]) {
        dist[v] = newDist;
        prev[v] = u;
        pq.push({ id: v, d: newDist });
      }
    }
  }

  if (dist[endNode] === undefined) {
    return [[startLat, startLon], [endLat, endLon]];
  }

  const path = [];
  let curr = endNode;
  while (curr) {
    const pt = nodes[curr];
    path.push([pt[0], pt[1]]);
    curr = prev[curr];
  }
  path.reverse();
  return [[startLat, startLon], ...path, [endLat, endLon]];
}

// Real-world Airline & Terminal Allocation for Soekarno-Hatta (WIII)
function assignRealisticGate(airline, callsign) {
  const gates = (airportData && airportData.gates) ? airportData.gates : [];
  if (!gates.length) return { ref: "E1", lat: -6.121757, lon: 106.651077, terminal: "T2" };

  const t1A = gates.filter(g => g.ref && g.ref.startsWith("A"));
  const t1B = gates.filter(g => g.ref && g.ref.startsWith("B"));
  const t1C = gates.filter(g => g.ref && g.ref.startsWith("C"));
  const t2D = gates.filter(g => g.ref && g.ref.startsWith("D"));
  const t2E = gates.filter(g => g.ref && g.ref.startsWith("E"));
  const t2F = gates.filter(g => g.ref && g.ref.startsWith("F"));
  const t3 = gates.filter(g => g.ref && !["A","B","C","D","E","F"].includes(g.ref[0]));

  const airUpper = (airline || "").toUpperCase();
  const csUpper = (callsign || "").toUpperCase();

  let pool = [];
  // Terminal 3 (Pier Gates 1-16 / 1A-2D):
  // Gates 1 - 10: International Pier (Garuda International widebodies, Singapore Airlines, foreign carriers)
  // Gates 11 - 16 / 1A - 2D: Domestic Pier (Garuda Indonesia domestic, Citilink)
  const t3Intl = t3.filter(g => ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(g.ref));
  const t3Dom = t3.filter(g => !["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(g.ref));

  if (airUpper.includes("SINGAPORE") || csUpper.includes("SIA") || airUpper.includes("CARGOLUX") || csUpper.includes("CLX") || airUpper.includes("QATAR") || airUpper.includes("EMIRATES") || airUpper.includes("CATHAY") || airUpper.includes("ANA") || airUpper.includes("JAL")) {
    pool = t3Intl.length ? t3Intl : t3;
  } else if (airUpper.includes("GARUDA") || csUpper.includes("GIA")) {
    // If widebody / international callsign (e.g. 800-series), assign T3 International; otherwise T3 Domestic
    if (csUpper.includes("880") || csUpper.includes("888") || csUpper.includes("8") || airUpper.includes("330") || airUpper.includes("777")) {
      pool = t3Intl.length ? t3Intl : t3;
    } else {
      pool = t3Dom.length ? t3Dom : t3;
    }
  } else if (airUpper.includes("CITILINK") || csUpper.includes("CTV") || csUpper.includes("SUPERGREEN")) {
    // Citilink uses Terminal 1C and Terminal 3 Domestic
    pool = t1C.length ? t1C : t3Dom;
  } else if (airUpper.includes("LION") || csUpper.includes("LNI") || airUpper.includes("SUPER AIR") || csUpper.includes("SJV") || airUpper.includes("BATIK") || csUpper.includes("BTK")) {
    if (airUpper.includes("BATIK") || csUpper.includes("BTK")) {
      pool = t2D.length ? t2D : t2E;
    } else {
      // Distribute across Terminal 1 sub-terminals (1A, 1B, 1C) to avoid stacking in a single cul-de-sac
      const t1All = [...t1A, ...t1B, ...t1C];
      pool = t1All.length ? t1All : gates;
    }
  } else if (airUpper.includes("AIRASIA") || csUpper.includes("AWQ") || csUpper.includes("AXM") || airUpper.includes("SCOOT")) {
    // Low-Cost International / Domestic at Terminal 2F
    pool = t2F.length ? t2F : t2E;
  } else {
    pool = gates;
  }

  const occupiedGates = new Set(aircraft.map(a => a.assignedGate).filter(Boolean));
  const availablePool = pool.filter(g => !occupiedGates.has(g.ref));
  const finalPool = availablePool.length ? availablePool : pool;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

function getGateByName(ref) {
  if (!airportData || !airportData.gates) return null;
  return airportData.gates.find(g => g.ref === ref) || null;
}

function executePushbackMovement(ac) {
  // Clear any existing interval
  if (ac._pushInterval) clearInterval(ac._pushInterval);

  const gateRef = ac.assignedGate || "E1";
  const relPoint = (airportData && airportData.pushback_release_points && airportData.pushback_release_points[gateRef])
    ? airportData.pushback_release_points[gateRef]
    : null;

  let pushNodes = null;
  let finalHdg = 355;

  if (relPoint) {
    const startLat = ac.lat;
    const startLon = ac.lon;
    const endLat = relPoint.release_lat;
    const endLon = relPoint.release_lon;
    // Intermediate point along apron taxilane before turning out onto taxiway
    const midLat = startLat + (endLat - startLat) * 0.45;
    const midLon = startLon + (endLon - startLon) * 0.45;
    pushNodes = [
      { lat: startLat, lon: startLon },
      { lat: midLat, lon: midLon },
      { lat: endLat, lon: endLon }
    ];
    finalHdg = relPoint.heading_deg !== undefined ? relPoint.heading_deg : 355;
  } else {
    pushNodes = (airportData && airportData.routes && airportData.routes.pushback_gate_e1)
      ? airportData.routes.pushback_gate_e1.map(p => ({ lat: p[0], lon: p[1] }))
      : [
          { lat: -6.121757, lon: 106.651077 },
          { lat: -6.121650, lon: 106.650600 },
          { lat: -6.121480, lon: 106.650280 },
          { lat: -6.121260, lon: 106.650050 },
          { lat: -6.121013, lon: 106.650012 }
        ];
  }

  let nodeIdx = 1; // start moving to P1
  ac.groundSpeed = 4;

  function moveNextPushNode() {
    if (nodeIdx >= pushNodes.length) {
      // Reached centerline of Taxiway release point!
      ac.groundSpeed = 0;
      ac.lat = pushNodes[pushNodes.length - 1].lat;
      ac.lon = pushNodes[pushNodes.length - 1].lon;
      ac.heading = finalHdg;
      ac.state = "READY_TAXI";
      ac.hasCheckedIn = false;
      const rwySpoken = ac.clearedRwy || "25R";
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, ready to taxi, runway ${rwySpoken}.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      // Trigger Pilot Request to Taxi
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 800);
      return;
    }

    const targetPt = pushNodes[nodeIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    // Pushback heading: airplane moves backward (tail first)
    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let pushHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      pushHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 180 + 360) % 360);
    }

    // Full realistic pushback pace: 160m total maneuver (~45 seconds)
    const distM = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
    const durSec = Math.max(6, distM / 3.5);
    const totalSteps = Math.max(25, Math.round(durSec * 15)); // 15 fps
    let step = 0;

    ac._pushInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      // Smooth nose rotation during pushback turn
      const angleDelta = ((pushHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._pushInterval);
        ac._pushInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        nodeIdx++;
        moveNextPushNode();
      }
    }, 66);
  }

  moveNextPushNode();
}

function executeTaxiMovement(ac) {
  // Read dynamic route according to cleared runway mechanism
  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N1";
  const hpCoord = mech && mech.holding_point ? [mech.holding_point.lat, mech.holding_point.lon] : [-6.1104895, 106.6679684];

  // Dynamically compute authentic taxiway path via Dijkstra if departed from any gate
  let points = null;
  if (airportData && airportData.taxi_graph && ac.lat && ac.lon) {
    const viaReq = ac.assignedTaxiVia || (ac.commandedTaxiVia ? [ac.commandedTaxiVia] : null);
    const calculated = findTaxiwayPath(ac.lat, ac.lon, hpCoord[0], hpCoord[1], viaReq);
    if (calculated && calculated.length > 3) {
      points = calculated.map(p => ({ lat: p[0], lon: p[1] }));
      ac.route = calculated;
    }
  }

  if (!points) {
    const dynamicRoutes = airportData && airportData.taxi_routes_by_runway ? airportData.taxi_routes_by_runway[rwyKey] : null;
    points = (dynamicRoutes && dynamicRoutes.coords)
      ? dynamicRoutes.coords.map(p => ({ lat: p[0], lon: p[1] }))
      : ((airportData && airportData.routes && airportData.routes.taxi_nc6_to_hp_n2)
          ? airportData.routes.taxi_nc6_to_hp_n2.map(p => ({ lat: p[0], lon: p[1] }))
          : flightRouteMission.taxiwayPoints);
    ac.route = points.map(p => [p.lat, p.lon]);
  }

  let ptIdx = (ac._crossSavedIndex !== undefined && ac._crossSavedIndex !== null) ? ac._crossSavedIndex : 0;
  ac._crossSavedIndex = null;

  function moveNextTaxiNode() {

    if (ptIdx >= points.length) {
      // Arrived precisely at designated Runway Holding Point!
      ac.groundSpeed = 0;
      ac.lat = points[points.length - 1].lat;
      ac.lon = points[points.length - 1].lon;
      ac.heading = mech ? mech.heading : 335;
      ac.state = "HOLDING";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, holding point ${hpName} runway ${rwyKey}, ready for departure.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const targetPt = points[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    // Calculate heading towards next taxiway point
    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // Realistic taxi speed: straight 15 kts, turns 8 kts
    const hdgDiff = Math.abs((targetHdg - ac.heading + 540) % 360 - 180);
    ac.groundSpeed = hdgDiff > 20 ? 8 : 15;

    // Realistic step timing
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(10, Math.round(distDeg * 110000));
    let step = 0;

    const stepInterval = setInterval(() => {
      // Ground collision prevention: if another aircraft is in front, hold brakes!
      if (checkGroundConflictAhead(ac, targetPt.lat, targetPt.lon)) {
        ac.groundSpeed = 0;
        ac.isHoldingForTraffic = true;
        renderAllScreens();
        return; // hold position until path is clear
      }
      ac.isHoldingForTraffic = false;
      ac.groundSpeed = hdgDiff > 20 ? 8 : 15;

      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      // Smooth heading turn
      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.15 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(stepInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        ac.heading = targetHdg;
        ptIdx++;
        moveNextTaxiNode();
      }
    }, 75);
    ac._activeInterval = stepInterval;
  }

  moveNextTaxiNode();
}

function executeLineUpMovement(ac) {
  // Clear any existing active movement interval to avoid competing position glitches
  if (ac._activeInterval) {
    clearInterval(ac._activeInterval);
    ac._activeInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;

  // Continuous, unbroken lead-in curve into Runway threshold
  const entryNodes = mech && mech.lineup_path
    ? mech.lineup_path.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.runway_25r_entry_lineup)
        ? airportData.routes.runway_25r_entry_lineup.map(p => ({ lat: p[0], lon: p[1] }))
        : [
            { lat: -6.110490, lon: 106.667968 },
            { lat: -6.109798, lon: 106.667797 },
            { lat: -6.109270, lon: 106.668258 },
            { lat: -6.108959, lon: 106.669062 }
          ]);

  const targetHeading = mech ? mech.heading : 250;
  let eIdx = 1;
  ac.state = "LINING_UP";
  ac.groundSpeed = 10;
  renderFlightStrips();
  updateEasyModePrompter();

  function moveNextEntryNode() {
    if (eIdx >= entryNodes.length) {
      // Perfectly lined up on Runway centerline threshold!
      if (ac._activeInterval) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
      }
      const lastPt = entryNodes[entryNodes.length - 1];
      ac.lat = lastPt.lat;
      ac.lon = lastPt.lon;
      ac.heading = targetHeading; // Aligned perfectly down the runway

      if (ac.takeoffQueued) {
        // Clearance was given while lining up; now that alignment is 100% complete at threshold, start takeoff roll!
        ac.takeoffQueued = false;
        ac.state = "TAKEOFF";
        renderFlightStrips();
        updateEasyModePrompter();
        renderAllScreens();
        executeTakeoffMovement(ac);
        return;
      }

      ac.groundSpeed = 0;
      ac.state = "LINE_UP";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, runway ${rwyKey} lined up and ready for departure.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 700);
      return;
    }

    const targetPt = entryNodes[eIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(12, Math.round(distDeg * 110000));
    let step = 0;

    ac._activeInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.18 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        ac.heading = targetHdg;
        eIdx++;
        moveNextEntryNode();
      }
    }, 75);
  }

  moveNextEntryNode();
}

function executeTakeoffMovement(ac) {
  // Clear any active movement interval (such as lineup loop still ticking)
  if (ac._activeInterval) {
    clearInterval(ac._activeInterval);
    ac._activeInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;

  // Continuous real runway centerline roll along designated Runway direction
  const rollNodes = mech && mech.takeoff_roll_path
    ? mech.takeoff_roll_path.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.runway_25r_takeoff_roll)
        ? airportData.routes.runway_25r_takeoff_roll.map(p => ({ lat: p[0], lon: p[1] }))
        : [
            { lat: -6.108959, lon: 106.669062 },
            { lat: -6.113463, lon: 106.657748 },
            { lat: -6.117106, lon: 106.648619 },
            { lat: -6.120986, lon: 106.638883 }
          ]);

  const targetHeading = mech ? mech.heading : 250;
  // Snap smoothly to threshold starting point to prevent any coordinate warp
  if (rollNodes.length > 0) {
    ac.lat = rollNodes[0].lat;
    ac.lon = rollNodes[0].lon;
  }
  ac.heading = targetHeading;

  let rIdx = 1;
  const totalRollPoints = rollNodes.length;

  function moveNextRollNode() {
    if (rIdx >= totalRollPoints) {
      if (ac._activeInterval) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
      }
      ac.state = "AIRBORNE";
      ac.hasCheckedIn = false;
      ac.groundSpeed = 185;
      ac.altitude = 1500;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, airborne runway ${rwyKey} passing one thousand five hundred feet.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      // Trigger Pilot Airborne Callout
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 700);

      // Seamlessly continue flying and climbing enroute without freezing in midair!
      executeClimbEnroute(ac);
      return;
    }

    const targetPt = rollNodes[rIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const progOverall = rIdx / totalRollPoints;
    ac.groundSpeed = Math.round(15 + Math.pow(progOverall, 1.3) * 145);

    if (progOverall > 0.60) {
      const climbP = (progOverall - 0.60) / 0.40;
      ac.altitude = Math.round(climbP * 1500);
    } else {
      ac.altitude = 0;
    }

    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    // Smooth step interval calculation across segments (minimum 10 steps to avoid jumpy frames)
    const totalSteps = Math.max(10, Math.round(distDeg * 45000));
    let step = 0;

    ac._activeInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;
      ac.heading = targetHeading;

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        rIdx++;
        moveNextRollNode();
      }
    }, 45);
  }

  moveNextRollNode();
}

// Safety Alerts Engine: ICAO Separation, STCA (3 NM / 1000 FT), and MSAW
let lastAlertChirpTime = 0;

function playAlertChirp() {
  const now = Date.now();
  if (now - lastAlertChirpTime < 2500) return; // Rate limit chirp to once every 2.5s
  lastAlertChirpTime = now;
  try {
    const actx = getAudioContext();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, actx.currentTime); // A5 alert tone
    osc.frequency.setValueAtTime(440, actx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, actx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, actx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.25);
  } catch (e) {}
}

function checkAirborneConflicts() {
  const conflictingIds = new Set();
  const msawIds = new Set();
  const stcaPairs = [];

  const airborne = aircraft.filter(a => a.altitude > 150 && !["PARKED", "GATE", "PUSHBACK", "TAXI", "READY_TAXI"].includes(a.state));

  for (let i = 0; i < airborne.length; i++) {
    const a1 = airborne[i];

    // MSAW Check: Minimum Safe Altitude in WIII TMA is 2000 ft (except on final approach intercept below 10 NM)
    const distToWiii = calculateDistanceNm(a1.lat, a1.lon, refLat, refLon);
    if (a1.altitude < 1800 && distToWiii > 7.5 && a1.state !== "FINAL") {
      msawIds.add(a1.id);
    }

    // STCA Pairwise Check (Current & 60-second Lookahead Vector)
    for (let j = i + 1; j < airborne.length; j++) {
      const a2 = airborne[j];

      // 1. Current Separation
      const currentDistNm = calculateDistanceNm(a1.lat, a1.lon, a2.lat, a2.lon);
      const currentAltDiff = Math.abs(a1.altitude - a2.altitude);

      // 2. Predictive 60s Lookahead (Forward vector extrapolation)
      // Heading: 0 = North, 90 = East, 180 = South, 270 = West
      const lookaheadSec = 60;
      const rad1 = (a1.heading * Math.PI) / 180;
      const rad2 = (a2.heading * Math.PI) / 180;
      const distNm1 = ((a1.groundSpeed || 200) / 3600) * lookaheadSec;
      const distNm2 = ((a2.groundSpeed || 200) / 3600) * lookaheadSec;

      // 1 deg lat = 60 NM; 1 deg lon = 60 * cos(lat) NM
      const predLat1 = a1.lat + (distNm1 * Math.cos(rad1)) / 60;
      const predLon1 = a1.lon + (distNm1 * Math.sin(rad1)) / (60 * Math.cos((a1.lat * Math.PI) / 180));
      const predLat2 = a2.lat + (distNm2 * Math.cos(rad2)) / 60;
      const predLon2 = a2.lon + (distNm2 * Math.sin(rad2)) / (60 * Math.cos((a2.lat * Math.PI) / 180));

      const predDistNm = calculateDistanceNm(predLat1, predLon1, predLat2, predLon2);

      // Standard ICAO TMA Separation: 3.0 NM horizontal (increases to 5.0 NM in Tropical Storm / LVP) & 1,000 ft vertical
      const reqSepNm = (typeof currentWeather !== 'undefined' && currentWeather && currentWeather.separationMinNm) ? currentWeather.separationMinNm : 3.0;
      const isLossOfSeparation = (currentDistNm < reqSepNm && currentAltDiff < 1000);
      const isPredictedConflict = (predDistNm < reqSepNm && currentAltDiff < 1000);

      if (isLossOfSeparation || isPredictedConflict) {
        conflictingIds.add(a1.id);
        conflictingIds.add(a2.id);
        stcaPairs.push({
          ac1: a1,
          ac2: a2,
          distNm: currentDistNm,
          predictedDistNm: predDistNm,
          isImmediate: isLossOfSeparation
        });
      }
    }
  }

  if (stcaPairs.length > 0 || msawIds.size > 0) {
    playAlertChirp();
  }

  return { conflictingIds, msawIds, stcaPairs };
}

function calculateDistanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in NM
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLam = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLam / 2) * Math.sin(dLam / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance in meters on ground
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  return calculateDistanceNm(lat1, lon1, lat2, lon2) * 1852.0;
}

// ========================================================
// MILESTONE 5: TACTICAL CONFLICT RESOLUTION & RULER ENGINE
// ========================================================

let rulerToolActive = false;
let rulerSelectedAc1 = null;
let rulerSelectedAc2 = null;

function toggleRulerTool() {
  rulerToolActive = !rulerToolActive;
  const btn = document.getElementById('btn-toggle-ruler');
  if (rulerToolActive) {
    rulerSelectedAc1 = null;
    rulerSelectedAc2 = null;
    if (btn) {
      btn.className = "px-1.5 py-0.5 rounded bg-emerald-700 border border-emerald-400 text-white font-bold mr-1 text-[10px]";
      btn.innerHTML = `<i class="fa-solid fa-ruler-combined"></i> RULER: ON`;
    }
    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-emerald-300 font-bold"><i class="fa-solid fa-ruler"></i> TACTICAL RULER: Klik pesawat pertama, lalu klik pesawat kedua di radar untuk ukur separasi!</span>`;
    }
  } else {
    rulerSelectedAc1 = null;
    rulerSelectedAc2 = null;
    if (btn) {
      btn.className = "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 mr-1 text-[10px]";
      btn.innerHTML = `<i class="fa-solid fa-ruler-combined"></i> RULER`;
    }
    renderAllScreens();
  }
}

// Tactical Vectoring: Immediate heading assignment with radar projection line
function issueRadarVector(idx, targetHdgStr) {
  const ac = aircraft[idx];
  if (!ac) return "";

  if (targetHdgStr === "RESUME") {
    ac._tacticalVector = null;
    if (ac.fde) ac.fde.directFix = null;
    console.log(`[TACTICAL VECTOR] ${ac.id} resuming standard navigation.`);
    const rb = `Resuming own navigation, ${ac.callsign}`;
    if (ac.state === "APPROACH" && typeof executeApproachMovement === 'function') {
      executeApproachMovement(ac);
    }
    renderFlightStrips();
    renderAllScreens();
    speakPilotReadback(rb);
    return rb;
  }

  const targetHdg = parseInt(targetHdgStr, 10);
  if (isNaN(targetHdg)) return "";

  ac._tacticalVector = targetHdg;
  ac.heading = targetHdg; // Immediate heading turn
  if (!ac.fde) ac.fde = {};
  ac.fde.directFix = `H${String(targetHdg).padStart(3, '0')}`;

  const hdgPhonetic = String(targetHdg).padStart(3, '0').split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const readback = `Fly heading ${hdgPhonetic}, ${ac.callsign}`;

  console.log(`[TACTICAL VECTOR] ${ac.id} assigned heading ${targetHdg}°`);
  
  // Re-trigger movement under tactical vectoring mode immediately
  if (ac.state === "APPROACH" && ac._approachInterval && typeof executeApproachMovement === 'function') {
    executeApproachMovement(ac);
  }

  renderFlightStrips();
  renderAllScreens();
  speakPilotReadback(readback);
  return readback;
}

// Tactical Speed Control: Immediate airspeed adjustment
function issueSpeedControl(idx, targetSpdStr) {
  const ac = aircraft[idx];
  if (!ac) return "";

  if (targetSpdStr === "RESUME") {
    ac._assignedSpeed = null;
    if (ac.fde) ac.fde.assignedSpd = null;
    const rb = `No speed restriction, resuming normal speed, ${ac.callsign}`;
    renderFlightStrips();
    renderAllScreens();
    speakPilotReadback(rb);
    return rb;
  }

  const targetSpd = parseInt(targetSpdStr, 10);
  if (isNaN(targetSpd)) return "";

  ac._assignedSpeed = targetSpd;
  ac.groundSpeed = targetSpd;
  if (!ac.fde) ac.fde = {};
  ac.fde.assignedSpd = `${targetSpd}K`;

  const spdPhonetic = String(targetSpd).split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const readback = `Maintain speed ${spdPhonetic} knots, ${ac.callsign}`;

  console.log(`[TACTICAL SPEED] ${ac.id} assigned speed ${targetSpd} kts`);
  renderFlightStrips();
  renderAllScreens();
  speakPilotReadback(readback);
  return readback;
}

// Tactical Altitude Step: Immediate altitude step instruction
function issueAltitudeStep(idx, targetAltStr) {
  const ac = aircraft[idx];
  if (!ac) return "";

  let targetFeet = 3000;
  if (targetAltStr.startsWith("FL")) {
    targetFeet = parseInt(targetAltStr.replace("FL", ""), 10) * 100;
  } else if (targetAltStr.startsWith("A")) {
    targetFeet = parseInt(targetAltStr.replace("A", ""), 10) * 100;
  }

  ac.altitude = targetFeet;
  if (!ac.fde) ac.fde = {};
  ac.fde.assignedAlt = targetAltStr;

  const isClimb = targetFeet > ac.altitude;
  const verb = isClimb ? "Climb" : "Descend";
  const readback = `${verb} ${targetAltStr}, ${ac.callsign}`;

  console.log(`[TACTICAL ALT] ${ac.id} assigned altitude ${targetAltStr} (${targetFeet} ft)`);
  renderFlightStrips();
  renderAllScreens();
  speakPilotReadback(readback);
  return readback;
}

// Go-Around / Missed Approach Procedure: Abort final, climb straight to 3,000 ft, and enter re-sequencing holding
function issueGoAround(idx) {
  const ac = aircraft[idx];
  if (!ac) return "";

  if (ac._approachInterval) {
    clearInterval(ac._approachInterval);
    ac._approachInterval = null;
  }

  ac.state = "APPROACH";
  ac.altitude = 3000;
  ac.groundSpeed = 220;
  if (!ac.fde) ac.fde = {};
  ac.fde.assignedAlt = "A030";
  ac.fde.directFix = "MISSED";

  // Heading straight along runway heading for 2 NM, then re-sequence
  const rwyKey = ac.clearedRwy || "25R";
  const mech = (typeof airportData !== 'undefined' && airportData && airportData.runway_mechanisms) ? airportData.runway_mechanisms[rwyKey] : null;
  const rwyHdg = mech ? mech.heading : 250;
  ac.heading = rwyHdg;

  const readback = `Going around, climb to three thousand feet, ${ac.callsign}`;
  console.log(`[GO-AROUND] ${ac.id} initiated missed approach procedure on runway ${rwyKey}!`);

  const pttStatus = document.getElementById('ptt-status');
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-red-400 font-bold animate-pulse"><i class="fa-solid fa-plane-circle-exclamation"></i> MISSED APPROACH: ${ac.callsign} GO-AROUND! CLIMBING 3000 FT.</span>`;
  }

  // Resume approach re-entry after climbing past runway
  setTimeout(() => {
    if (typeof executeApproachMovement === 'function') {
      executeApproachMovement(ac);
    }
  }, 2500);

  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
  speakPilotReadback(readback);
  return readback;
}

// Draw Tactical Vectors & Ruler Tool Overlay on TMA Screen
function drawTacticalOverlays(ctx, st) {
  // 1. Draw Radar Tactical Vector Lines (Dashed amber trajectory forward along heading)
  aircraft.forEach((ac) => {
    if (ac._tacticalVector !== undefined && ac._tacticalVector !== null && ac.altitude > 100) {
      const p = latLonToScreenCoord(ac.lat, ac.lon, st);
      const rad = (ac._tacticalVector - 90) * (Math.PI / 180);
      const vectorLenNm = 12; // 12 NM lookahead vector
      const vectorLenPx = (vectorLenNm / 60) * BASE_SCALE * st.zoom;

      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(rad) * vectorLenPx, p.y + Math.sin(rad) * vectorLenPx);
      ctx.stroke();

      // Heading label at end of vector
      ctx.font = "bold 9px 'Share Tech Mono'";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`HDG ${String(ac._tacticalVector).padStart(3, '0')}°`, p.x + Math.cos(rad) * vectorLenPx + 5, p.y + Math.sin(rad) * vectorLenPx - 3);
      ctx.restore();
    }
  });

  // 2. Tactical Separation Ruler (Visual Distance & Closing Rate Tool)
  if (rulerSelectedAc1) {
    const p1 = latLonToScreenCoord(rulerSelectedAc1.lat, rulerSelectedAc1.lon, st);

    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 22, 0, Math.PI * 2);
    ctx.stroke();

    if (rulerSelectedAc2) {
      const p2 = latLonToScreenCoord(rulerSelectedAc2.lat, rulerSelectedAc2.lon, st);
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 22, 0, Math.PI * 2);
      ctx.stroke();

      // Connecting line between aircraft
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Calculate exact distance & altitude separation
      const distNm = calculateDistanceNm(rulerSelectedAc1.lat, rulerSelectedAc1.lon, rulerSelectedAc2.lat, rulerSelectedAc2.lon);
      const altDiffFt = Math.abs(rulerSelectedAc1.altitude - rulerSelectedAc2.altitude);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Distance Badge in Middle
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = distNm < 3.0 ? "#ef4444" : "#10b981";
      ctx.lineWidth = 1.5;
      ctx.fillRect(midX - 55, midY - 14, 110, 28);
      ctx.strokeRect(midX - 55, midY - 14, 110, 28);

      ctx.font = "bold 10px 'Share Tech Mono'";
      ctx.fillStyle = distNm < 3.0 ? "#f87171" : "#34d399";
      ctx.textAlign = "center";
      ctx.fillText(`${distNm.toFixed(2)} NM | Δ${altDiffFt} FT`, midX, midY + 4);
      ctx.textAlign = "start";
    }
    ctx.restore();
  }
}

// ==========================================
// MILESTONE 4: DYNAMIC WEATHER & ATIS ENGINE
// ==========================================

// ATC HUB - Milestone 6: Arrival Sequencer (AMAN) & Holding Pattern Management Engine

// Available Holding Fixes at WIII TMA with standard racetrack configuration
const HOLDING_FIXES = {
  "TEGID": { name: "TEGID", lat: -6.100, lon: 106.850, inboundHdg: 250, turnDir: "RIGHT", desc: "Intermediate Fix RWY 25" },
  "BUNTO": { name: "BUNTO", lat: -6.120, lon: 106.950, inboundHdg: 250, turnDir: "RIGHT", desc: "East Holding Fix" },
  "DOLTA": { name: "DOLTA", lat: -6.345, lon: 106.720, inboundHdg: 315, turnDir: "RIGHT", desc: "South-East Holding Fix" },
  "TOPIN": { name: "TOPIN", lat: -5.950, lon: 106.450, inboundHdg: 70, turnDir: "LEFT", desc: "North-West Transition" }
};

let amanManualOrder = []; // Array of aircraft IDs for manual slot assignment
let isAmanPanelOpen = false;

// Initialize or update fuel endurance on aircraft
function updateAircraftFuelEndurance() {
  if (!Array.isArray(aircraft)) return;

  aircraft.forEach(ac => {
    // If fuel not initialized, set standard endurance (default ~45 to 65 mins of reserve/holding)
    if (ac.fuelMinutes === undefined) {
      ac.fuelMinutes = 45.0 + Math.floor(Math.random() * 20); // 45 - 65 minutes
      ac.initialFuelMinutes = ac.fuelMinutes;
      ac.fuelBurnRate = 1.0; // 1.0 min per real min (or dynamic burn)
    }

    // Decrement fuel gradually over real time (approx 1 minute per 60 seconds)
    if (!ac._lastFuelTick) ac._lastFuelTick = Date.now();
    const elapsedSec = (Date.now() - ac._lastFuelTick) / 1000.0;
    ac._lastFuelTick = Date.now();

    // Burn slightly more when holding or maneuvering
    const burnMult = ac.isHolding ? 1.2 : 1.0;
    ac.fuelMinutes = Math.max(0, ac.fuelMinutes - (elapsedSec / 60.0) * burnMult);

    // Bingo fuel alert (< 15 mins) & Emergency (< 5 mins)
    if (ac.fuelMinutes < 15.0 && !ac._bingoAlerted) {
      ac._bingoAlerted = true;
      if (typeof logTelemetry === 'function') {
        logTelemetry('SAFETY', `⚠️ BINGO FUEL ADVISORY: ${ac.id}`, `Endurance remaining: ${ac.fuelMinutes.toFixed(1)} mins! Prioritize landing.`);
      }
    }
  });
}

// Calculate AMAN Runway Threshold coordinates
function getRunwayThresholdCoords(rwyKey) {
  if (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey]) {
    const t = airportData.runway_mechanisms[rwyKey].threshold;
    return [t.lat, t.lon];
  }
  return [-6.108959, 106.669062]; // Default RWY 25R threshold
}

// Calculate Estimated Landing Time (ELDT) and sequencing for arrival flights
function calculateAmanArrivalSequence() {
  if (!Array.isArray(aircraft)) return [];

  // Filter airborne arrival aircraft
  const arrivalFlights = aircraft.filter(ac =>
    ["APPROACH", "FINAL", "HOLDING_AIR"].includes(ac.state) ||
    (ac.state === "APPROACH" && ac.altitude > 100)
  );

  const now = Date.now();

  const seq = arrivalFlights.map(ac => {
    const rwy = ac.clearedRwy || "25R";
    const thr = getRunwayThresholdCoords(rwy);
    const distNm = calculateDistanceNm(ac.lat, ac.lon, thr[0], thr[1]);
    const spdKts = Math.max(120, ac.groundSpeed || 180);

    // Flight time to threshold in minutes: (dist / spd) * 60
    let etaMinutes = (distNm / spdKts) * 60.0;

    // If aircraft is in holding, add remaining holding delay
    if (ac.isHolding && ac.holdRemainingMinutes) {
      etaMinutes += ac.holdRemainingMinutes;
    }

    const eldtTimestamp = now + etaMinutes * 60 * 1000;
    const eldtDate = new Date(eldtTimestamp);
    const eldtStr = eldtDate.toTimeString().split(' ')[0]; // HH:MM:SS

    return {
      ac: ac,
      id: ac.id,
      callsign: ac.callsign,
      rwy: rwy,
      state: ac.state,
      altitude: ac.altitude,
      speed: spdKts,
      distNm: distNm,
      etaMinutes: etaMinutes,
      eldtStr: eldtStr,
      eldtTimestamp: eldtTimestamp,
      fuelMinutes: ac.fuelMinutes || 45,
      isHolding: !!ac.isHolding,
      holdFix: ac.holdFix || null,
      holdLevel: ac.holdLevel || null
    };
  });

  // Sort based on manual order if assigned, otherwise by calculated ELDT
  seq.sort((a, b) => {
    const idxA = amanManualOrder.indexOf(a.id);
    const idxB = amanManualOrder.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.eldtTimestamp - b.eldtTimestamp;
  });

  // Spacing Advisor: Calculate target spacing gaps between consecutive arrivals to same runway
  for (let i = 0; i < seq.length; i++) {
    if (i === 0) {
      seq[i].targetSpacingNm = 0;
      seq[i].spacingDiffNm = 0;
      seq[i].spacingAdvice = "NUMBER 1 • CLEARED SPEED";
    } else {
      const prev = seq[i - 1];
      const gapNm = Math.abs(seq[i].distNm - prev.distNm);
      const minSeparation = 5.0; // 5.0 NM standard radar wake / arrival separation
      seq[i].targetSpacingNm = minSeparation;
      seq[i].spacingDiffNm = gapNm - minSeparation;

      if (gapNm < minSeparation) {
        // Too close: recommend speed reduction
        const recSpeed = Math.max(160, Math.round(seq[i].speed - 20));
        seq[i].spacingAdvice = `REDUCE SPEED TO ${recSpeed}K (GAP ${gapNm.toFixed(1)}NM < 5.0NM)`;
      } else if (gapNm > minSeparation + 3.0) {
        // Too wide: recommend speed increase if safe
        const recSpeed = Math.min(220, Math.round(seq[i].speed + 15));
        seq[i].spacingAdvice = `INCREASE SPEED TO ${recSpeed}K (GAP ${gapNm.toFixed(1)}NM)`;
      } else {
        seq[i].spacingAdvice = `ON SEQUENCE • MAINTAIN ${seq[i].speed}K (GAP ${gapNm.toFixed(1)}NM)`;
      }
    }
  }

  return seq;
}

// ==========================================
// HOLDING PATTERN & HOLDING STACK MANAGEMENT
// ==========================================

// Issue Holding Clearance to an aircraft
function issueHoldingPattern(acIdx, fixName, assignedFL) {
  const ac = aircraft[acIdx];
  if (!ac) return "Aircraft not found";

  const fixKey = (fixName || "TEGID").toUpperCase();
  const fix = HOLDING_FIXES[fixKey] || HOLDING_FIXES["TEGID"];
  const level = assignedFL || "FL100";

  // Stop standard approach progression if holding
  if (ac._approachInterval) {
    clearInterval(ac._approachInterval);
    ac._approachInterval = null;
  }

  ac.state = "HOLDING_AIR";
  ac.isHolding = true;
  ac.holdFix = fix.name;
  ac.holdLevel = level;
  ac.holdInboundHdg = fix.inboundHdg;
  ac.holdTurnDir = fix.turnDir; // RIGHT standard
  ac.holdPhase = "FLYING_TO_FIX"; // Smooth navigation towards fix, then enter racetrack!
  ac.holdPhaseTimer = 0;
  ac.holdRemainingMinutes = 10.0; // Default holding expectancy
  ac.targetHeading = fix.inboundHdg;

  // Set Altitude
  if (level.startsWith("FL")) {
    const targetFt = parseInt(level.replace("FL", ""), 10) * 100;
    ac.altitude = targetFt;
  }

  if (!ac.fde) ac.fde = {};
  ac.fde.directFix = `H/${fix.name}`;
  ac.fde.assignedAlt = level;
  ac.fde.assignedSpd = "210K";
  ac.groundSpeed = 210;

  // Start Racetrack Holding Flight Loop (Navigates smoothly to fix first, then flies 4-min racetrack)
  startHoldingFlightLoop(ac, fix);

  if (typeof logTelemetry === 'function') {
    logTelemetry('BEHAVIOR', `${ac.id} Holding Clearance Issued`, `Fix: ${fix.name} | Level: ${level} | Navigating to fix then Racetrack Inbound ${fix.inboundHdg}° ${fix.turnDir}`);
  }

  const readback = `Hold at ${fix.name}, inbound track ${fix.inboundHdg} degrees, ${fix.turnDir.toLowerCase()} hand pattern, maintain ${level}, ${ac.callsign}`;
  if (typeof speakPilotReadback === 'function') {
    speakPilotReadback(readback);
  }
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
  return readback;
}

// Physical Racetrack kinematics for holding
function startHoldingFlightLoop(ac, fix) {
  if (ac._holdInterval) {
    clearInterval(ac._holdInterval);
    ac._holdInterval = null;
  }

  const turnSign = fix.turnDir === "RIGHT" ? 1.0 : -1.0;
  const outboundHdg = (fix.inboundHdg + 180) % 360;
  const stepIntervalMs = 50; // 20 FPS smooth real-time kinematics
  const dtSec = stepIntervalMs / 1000.0;
  let elapsedRacetrackSec = (ac.holdPhase !== "FLYING_TO_FIX") ? (ac.holdPhaseTimer || 0) : 0;

  // Determine target holding altitude in feet (e.g. FL100 -> 10,000 ft)
  let targetHoldAltFt = ac.altitude;
  if (ac.holdLevel && ac.holdLevel.startsWith("FL")) {
    targetHoldAltFt = parseInt(ac.holdLevel.replace("FL", ""), 10) * 100;
  }

  ac._holdInterval = setInterval(() => {
    if (!ac.isHolding || ac.state !== "HOLDING_AIR") {
      clearInterval(ac._holdInterval);
      ac._holdInterval = null;
      return;
    }

    // PHASE 1: FLYING_TO_FIX (Realistic navigational transit from current position to fix)
    if (ac.holdPhase === "FLYING_TO_FIX") {
      const dLat = (fix.lat - ac.lat) * 60.0;
      const dLon = (fix.lon - ac.lon) * 60.0 * Math.cos(Math.radians ? Math.radians((ac.lat + fix.lat) / 2.0) : ((ac.lat + fix.lat) / 2.0) * Math.PI / 180.0);
      const distNm = Math.hypot(dLat, dLon);

      if (distNm <= 0.4) {
        // Arrived at fix! Smoothly enter Racetrack Pattern Turn 1 at the fix
        ac.holdPhase = "TURN TO OUTBOUND";
        ac.holdPhaseTimer = 0;
        elapsedRacetrackSec = 0;
      } else {
        // Steer heading towards the fix (standard rate turn 3°/sec)
        const targetBearing = (Math.atan2(dLon, dLat) * 180.0 / Math.PI + 360.0) % 360.0;
        const turnDiff = ((targetBearing - ac.heading + 540) % 360) - 180;
        const maxTurnStep = 3.0 * dtSec;
        const turnStep = Math.max(-maxTurnStep, Math.min(maxTurnStep, turnDiff));
        ac.heading = Math.round((ac.heading + turnStep + 360.0) % 360.0);

        // Climb or descend towards assigned holding level at 1500 ft/min
        const altDiff = targetHoldAltFt - ac.altitude;
        if (Math.abs(altDiff) > 5) {
          const maxAltStep = (1500.0 / 60.0) * dtSec; // ~1.25 ft per 50ms
          ac.altitude = Math.round(ac.altitude + Math.max(-maxAltStep, Math.min(maxAltStep, altDiff)));
        } else {
          ac.altitude = targetHoldAltFt;
        }

        // Kinematic step along bearing
        const spd = ac.groundSpeed || 210;
        const distNmStep = (spd / 3600.0) * dtSec;
        const radHdg = (ac.heading * Math.PI) / 180.0;
        ac.lat += (distNmStep * Math.cos(radHdg)) / 60.0;
        ac.lon += (distNmStep * Math.sin(radHdg)) / (60.0 * Math.cos(ac.lat * Math.PI / 180.0));

        if (typeof renderAllScreens === 'function') renderAllScreens();
        return;
      }
    }

    // PHASE 2: RACETRACK PATTERN (Flown at/around the fix)
    elapsedRacetrackSec += dtSec;
    ac.holdPhaseTimer = elapsedRacetrackSec;

    // Standard 4-minute (240s) ICAO holding pattern:
    // Phase 0 (0-60s): Turn 1 at fix to Outbound (180° turn at 3°/s standard rate)
    // Phase 1 (60-120s): Outbound Leg (straight leg at outbound heading)
    // Phase 2 (120-180s): Turn 2 back to Inbound (180° turn at 3°/s standard rate)
    // Phase 3 (180-240s): Inbound Leg back to fix (straight leg ending at fix)
    const t = elapsedRacetrackSec % 240.0;

    if (t < 60.0) {
      ac.holdPhase = "TURN TO OUTBOUND";
      const turnProgress = t / 60.0;
      ac.heading = Math.round((fix.inboundHdg + turnSign * turnProgress * 180.0 + 360.0) % 360.0);
    } else if (t < 120.0) {
      ac.holdPhase = "OUTBOUND LEG";
      ac.heading = outboundHdg;
    } else if (t < 180.0) {
      ac.holdPhase = "TURN TO INBOUND";
      const turnProgress = (t - 120.0) / 60.0;
      ac.heading = Math.round((outboundHdg + turnSign * turnProgress * 180.0 + 360.0) % 360.0);
    } else {
      ac.holdPhase = "INBOUND LEG";
      ac.heading = fix.inboundHdg;
    }

    // Kinematic motion: calculate true 1:1 displacement in NM & lat/lon
    const spd = ac.groundSpeed || 210;
    const distNmStep = (spd / 3600.0) * dtSec;
    const radHdg = (ac.heading * Math.PI) / 180.0;

    // Standard aviation spherical displacement:
    // 1 deg latitude = 60 NM
    // 1 deg longitude = 60 * cos(latitude) NM
    ac.lat += (distNmStep * Math.cos(radHdg)) / 60.0;
    ac.lon += (distNmStep * Math.sin(radHdg)) / (60.0 * Math.cos(ac.lat * Math.PI / 180.0));

    // Maintain holding level
    if (ac.altitude !== targetHoldAltFt) {
      const altDiff = targetHoldAltFt - ac.altitude;
      const maxAltStep = (1500.0 / 60.0) * dtSec;
      ac.altitude = Math.round(ac.altitude + Math.max(-maxAltStep, Math.min(maxAltStep, altDiff)));
    }

    // Decrement hold expectancy timer
    if (ac.holdRemainingMinutes > 0) {
      ac.holdRemainingMinutes = Math.max(0, ac.holdRemainingMinutes - dtSec / 60.0);
    }

    // Trigger smooth radar canvas update
    if (typeof renderAllScreens === 'function') {
      renderAllScreens();
    }
  }, stepIntervalMs);
}

// Leave holding pattern and resume approach
function leaveHoldingPattern(acIdx) {
  const ac = aircraft[acIdx];
  if (!ac) return "Aircraft not found";

  if (ac._holdInterval) {
    clearInterval(ac._holdInterval);
    ac._holdInterval = null;
  }

  ac.isHolding = false;
  ac.state = "APPROACH";
  ac.holdFix = null;
  ac.holdLevel = null;
  ac.holdPhase = null;
  if (!ac.fde) ac.fde = {};
  ac.fde.directFix = "";
  ac.fde.assignedAlt = "A030";
  ac.fde.assignedSpd = "180K";
  ac.groundSpeed = 180;
  ac.altitude = 3000;

  if (typeof logTelemetry === 'function') {
    logTelemetry('BEHAVIOR', `${ac.id} Left Holding Pattern`, `Resumed Standard Approach to RWY ${ac.clearedRwy}`);
  }

  if (typeof executeApproachMovement === 'function') {
    executeApproachMovement(ac);
  }

  const readback = `Leave holding, resume approach runway ${ac.clearedRwy}, descend 3000 feet, ${ac.callsign}`;
  if (typeof speakPilotReadback === 'function') {
    speakPilotReadback(readback);
  }
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
  return readback;
}

// Reorder AMAN slot assignment (Drag & Drop or Manual Reorder)
function reorderAmanSlot(fromIdx, toIdx) {
  const seq = calculateAmanArrivalSequence();
  if (fromIdx < 0 || fromIdx >= seq.length || toIdx < 0 || toIdx >= seq.length) return;

  const currentOrder = seq.map(s => s.id);
  const [movedId] = currentOrder.splice(fromIdx, 1);
  currentOrder.splice(toIdx, 0, movedId);
  amanManualOrder = currentOrder;

  if (typeof logTelemetry === 'function') {
    logTelemetry('BEHAVIOR', `AMAN Arrival Slot Reordered`, `Moved ${movedId} to position #${toIdx + 1}`);
  }

  renderAmanSequencerPanel();
  renderFlightStrips();
}

// Toggle AMAN Panel UI
function toggleAmanPanel() {
  const panel = document.getElementById('aman-sequencer-panel');
  const btn = document.getElementById('toggle-aman-btn');
  if (!panel) return;

  isAmanPanelOpen = !isAmanPanelOpen;
  if (isAmanPanelOpen) {
    panel.classList.remove('hidden');
    if (btn) {
      btn.classList.add('bg-sky-950', 'border-sky-500', 'text-sky-300');
      btn.classList.remove('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
    renderAmanSequencerPanel();
  } else {
    panel.classList.add('hidden');
    if (btn) {
      btn.classList.remove('bg-sky-950', 'border-sky-500', 'text-sky-300');
      btn.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
  }
}

// Render AMAN UI list and Holding Stack visualizer
function renderAmanSequencerPanel() {
  const listEl = document.getElementById('aman-sequence-list');
  const stackEl = document.getElementById('holding-stack-visualizer');
  if (!listEl) return;

  updateAircraftFuelEndurance();
  const sequence = calculateAmanArrivalSequence();

  // Update badge count
  const badge = document.getElementById('aman-count-badge');
  if (badge) badge.textContent = sequence.length;

  if (sequence.length === 0) {
    listEl.innerHTML = '<div class="p-3 text-center text-slate-500 text-xs italic">Tidak ada pesawat arrival inbound saat ini. Klik "+ Inbound" untuk spawn pesawat kedatangan.</div>';
    if (stackEl) stackEl.innerHTML = '<div class="text-slate-600 text-[10px] italic p-1">Holding stack kosong.</div>';
    return;
  }

  // Render Arrival Sequence with Spacing Advisor
  listEl.innerHTML = sequence.map((item, idx) => {
    const isBingo = item.fuelMinutes < 15;
    const isCritical = item.fuelMinutes < 5;
    const fuelColor = isCritical ? 'text-red-400 font-bold animate-pulse' : (isBingo ? 'text-amber-400 font-bold' : 'text-emerald-400');
    const acIdx = aircraft.findIndex(a => a.id === item.id);

    return `
      <div class="p-2 rounded bg-slate-900 border ${item.isHolding ? 'border-purple-600/70' : 'border-slate-800'} text-xs space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-sky-900 text-sky-200 flex items-center justify-center font-bold text-[10px]">#${idx + 1}</span>
            <span class="font-bold text-white font-mono">${item.id}</span>
            <span class="text-[10px] text-slate-400">RWY ${item.rwy}</span>
            ${item.isHolding ? '<span class="text-[9px] px-1 bg-purple-900 text-purple-200 rounded font-bold">HOLDING</span>' : ''}
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400">ELDT:</span>
            <b class="text-amber-300 font-mono text-xs ml-1">${item.eldtStr}</b>
          </div>
        </div>

        <div class="flex items-center justify-between text-[10px] text-slate-300 bg-slate-950 p-1 rounded font-mono">
          <span>DIST: ${item.distNm.toFixed(1)}NM</span>
          <span>SPD: ${item.speed}K</span>
          <span>ALT: ${item.altitude}FT</span>
          <span class="${fuelColor}" title="Fuel Remaining"><i class="fa-solid fa-gas-pump mr-0.5"></i> ${item.fuelMinutes.toFixed(0)}m</span>
        </div>

        <!-- Spacing Advisor Advice -->
        <div class="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center justify-between font-mono">
          <span class="truncate"><i class="fa-solid fa-arrows-left-right text-sky-400 mr-1"></i>${item.spacingAdvice}</span>
          <div class="flex items-center gap-1 shrink-0 ml-1">
            ${item.isHolding
              ? `<button onclick="leaveHoldingPattern(${acIdx})" class="px-1.5 py-0.2 rounded bg-emerald-900 text-emerald-200 hover:bg-emerald-800 text-[9px] font-bold" title="Tinggalkan Holding & Masuk Approach">LEAVE HOLD</button>`
              : `<button onclick="issueHoldingPattern(${acIdx}, 'TEGID', 'FL100')" class="px-1.5 py-0.2 rounded bg-purple-900 text-purple-200 hover:bg-purple-800 text-[9px] font-bold" title="Tugaskan Holding di TEGID FL100">HOLD</button>`
            }
            <button onclick="reorderAmanSlot(${idx}, Math.max(0, ${idx - 1}))" class="px-1 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-[9px]" title="Pindahkan Urutan Naik">▲</button>
            <button onclick="reorderAmanSlot(${idx}, Math.min(${sequence.length - 1}, ${idx + 1}))" class="px-1 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-[9px]" title="Pindahkan Urutan Turun">▼</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render Holding Stack Visualizer (Sleek Eurocat/TopSky Flight Level Ladder)
  if (stackEl) {
    const holdingAc = sequence.filter(s => s.isHolding);
    if (holdingAc.length === 0) {
      stackEl.innerHTML = '<div class="text-slate-600 text-[10px] italic py-1 text-center font-mono">No traffic in holding stack.</div>';
    } else {
      const levels = ["FL140", "FL130", "FL120", "FL110", "FL100"];
      stackEl.innerHTML = levels.map(fl => {
        const atFl = holdingAc.filter(h => h.holdLevel === fl);
        const isOccupied = atFl.length > 0;
        return `
          <div class="flex items-center text-[10px] py-0.5 border-b border-slate-800/40 font-mono">
            <span class="w-12 font-bold ${isOccupied ? 'text-purple-300' : 'text-slate-500'}">${fl}</span>
            <div class="flex-1 flex gap-1.5 items-center">
              ${isOccupied
                ? atFl.map(h => `<span class="px-1.5 py-0.2 rounded bg-purple-950/80 border border-purple-500/70 text-purple-200 font-bold shadow-sm flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>${h.id} <span class="text-[9px] text-purple-300/80">(${h.holdFix || 'TEGID'})</span></span>`).join('')
                : '<span class="text-slate-700/60 font-mono tracking-widest text-[9px]">— · —</span>'
              }
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// Draw Holding Pattern Racetrack Overlays on TMA Radar
function drawHoldingPatternOverlays(ctx, st) {
  if (typeof HOLDING_FIXES === 'undefined') return;

  Object.values(HOLDING_FIXES).forEach(fix => {
    // Check if any aircraft is currently holding at this fix
    const holdingAtFix = (aircraft || []).filter(a => a.isHolding && a.holdFix === fix.name);
    const hasHoldingAc = holdingAtFix.length > 0;

    const pFix = latLonToScreenCoord(fix.lat, fix.lon, st);

    ctx.save();
    ctx.font = "bold 9px 'Share Tech Mono'";
    ctx.fillStyle = hasHoldingAc ? "#c084fc" : "rgba(168, 85, 247, 0.4)";
    ctx.fillText(`HOLD ${fix.name}`, pFix.x + 8, pFix.y - 4);

    // Draw Racetrack shape centered on fix
    // 1-minute leg at 210 kts = 3.5 NM; Rate 1 standard turn radius = 3.5 / PI = ~1.114 NM
    const legLenPx = (3.5 / 60) * BASE_SCALE * st.zoom;
    const turnRadiusPx = (1.114 / 60) * BASE_SCALE * st.zoom;
    const turnSign = fix.turnDir === "RIGHT" ? 1.0 : -1.0;

    // Angle of inbound heading in canvas coordinate system (0° heading points -Y/North)
    const radInbound = (fix.inboundHdg - 90) * (Math.PI / 180);
    // Unit vector along inbound heading
    const ux = Math.cos(radInbound);
    const uy = Math.sin(radInbound);
    // Normal vector pointing towards center of Turn 1
    const radTurn = radInbound + (fix.turnDir === "RIGHT" ? Math.PI / 2 : -Math.PI / 2);
    const nx = Math.cos(radTurn);
    const ny = Math.sin(radTurn);

    // Center of Turn 1 (at fix)
    const c1 = {
      x: pFix.x + nx * turnRadiusPx,
      y: pFix.y + ny * turnRadiusPx
    };

    // Outbound leg start (exit of Turn 1)
    const outStart = {
      x: c1.x + nx * turnRadiusPx,
      y: c1.y + ny * turnRadiusPx
    };

    // Outbound leg end (start of Turn 2)
    const outEnd = {
      x: outStart.x - ux * legLenPx,
      y: outStart.y - uy * legLenPx
    };

    // Center of Turn 2
    const c2 = {
      x: outEnd.x - nx * turnRadiusPx,
      y: outEnd.y - ny * turnRadiusPx
    };

    // Inbound leg start (exit of Turn 2)
    const inStart = {
      x: c2.x - nx * turnRadiusPx,
      y: c2.y - ny * turnRadiusPx
    };

    // Professional Aviation Racetrack Styling: Crisp, thin tactical dashed line
    ctx.strokeStyle = hasHoldingAc ? "rgba(192, 132, 252, 0.85)" : "rgba(168, 85, 247, 0.35)";
    ctx.lineWidth = hasHoldingAc ? 1.4 : 1.0;
    ctx.setLineDash(hasHoldingAc ? [6, 3] : [4, 4]);

    ctx.beginPath();
    // 1. Inbound Leg: from inStart straight to fix
    ctx.moveTo(inStart.x, inStart.y);
    ctx.lineTo(pFix.x, pFix.y);

    // 2. Turn 1 (at fix): semicircular arc 180° to outStart
    const angle1Start = Math.atan2(pFix.y - c1.y, pFix.x - c1.x);
    const angle1End = Math.atan2(outStart.y - c1.y, outStart.x - c1.x);
    ctx.arc(c1.x, c1.y, turnRadiusPx, angle1Start, angle1End, fix.turnDir !== "RIGHT");

    // 3. Outbound Leg: straight from outStart to outEnd
    ctx.lineTo(outEnd.x, outEnd.y);

    // 4. Turn 2: semicircular arc 180° back to inStart
    const angle2Start = Math.atan2(outEnd.y - c2.y, outEnd.x - c2.x);
    const angle2End = Math.atan2(inStart.y - c2.y, inStart.x - c2.x);
    ctx.arc(c2.x, c2.y, turnRadiusPx, angle2Start, angle2End, fix.turnDir !== "RIGHT");

    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Outbound leg tactical direction arrow
    const midOutX = (outStart.x + outEnd.x) / 2;
    const midOutY = (outStart.y + outEnd.y) / 2;
    const arrowRad = Math.atan2(outEnd.y - outStart.y, outEnd.x - outStart.x);
    ctx.save();
    ctx.translate(midOutX, midOutY);
    ctx.rotate(arrowRad);
    ctx.fillStyle = hasHoldingAc ? "#c084fc" : "rgba(168, 85, 247, 0.4)";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // If active holding, draw level stack count badge
    if (hasHoldingAc) {
      ctx.fillStyle = "#9333ea";
      ctx.beginPath();
      ctx.arc(pFix.x, pFix.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px 'Share Tech Mono'";
      ctx.fillText(`${holdingAtFix.length}`, pFix.x - 2, pFix.y + 3);
    }

    ctx.restore();
  });
}
// ATC HUB - Milestone 7: Interactive Scenario-Driven Flight Academy

// 6 Interactive Hands-on Training Scenarios with live simulation spawning & objective tracking
const INTERACTIVE_SCENARIOS = [
  {
    id: "lesson-1",
    num: 1,
    title: "Lesson 1: Pengenalan Radar & Seleksi Target",
    category: "Radar Basics",
    desc: "Latihan langsung memilih pesawat di radar/strip, membaca data block, dan mengidentifikasi squawk code.",
    instruction: "Klik strip penerbangan atau klik simbol pesawat <b>GIA502</b> pada radar untuk memilih target aktif.",
    targetPhrase: "Klik strip GIA502",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "GIA502",
        callsign: "INDONESIA 502",
        airline: "Garuda Indonesia",
        type: "B738",
        gate: "Gate E1",
        lat: -6.1255,
        lon: 106.6558,
        heading: 90,
        altitude: 0,
        groundSpeed: 0,
        state: "PARKED",
        clearedRwy: "25R",
        squawk: "4215",
        fde: { assignedAlt: "FL140", assignedSpd: "250K" }
      });
      selectedAircraftIndex = -1;
      renderFlightStrips();
      renderAllScreens();
    },
    checkSuccess: () => {
      return selectedAircraftIndex !== -1 && aircraft[selectedAircraftIndex] && aircraft[selectedAircraftIndex].id === "GIA502";
    },
    successMessage: "Bagus! Target GIA502 berhasil dipilih. Data block aktif dan siap menerima instruksi."
  },
  {
    id: "lesson-2",
    num: 2,
    title: "Lesson 2: Komunikasi Radio PTT & IFR Clearance",
    category: "Radio Phraseology",
    desc: "Praktek langsung menekan tombol SPASI (PTT) dan berbicara ke mikrofon atau klik Kirim ATC untuk memberikan izin IFR.",
    instruction: "Pilih <b>GIA502</b>, lalu ucapkan ke Mic atau tekan tombol Kirim ATC:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521\"</span>",
    targetPhrase: "Indonesia 502 cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "GIA502",
        callsign: "INDONESIA 502",
        airline: "Garuda Indonesia",
        type: "B738",
        gate: "Gate E1",
        lat: -6.1255,
        lon: 106.6558,
        heading: 90,
        altitude: 0,
        groundSpeed: 0,
        state: "PARKED",
        clearedRwy: "25R",
        squawk: "1000",
        fde: {}
      });
      selectedAircraftIndex = 0;
      renderFlightStrips();
      renderAllScreens();
      updateEasyModePrompter();
    },
    checkSuccess: () => {
      const ac = aircraft.find(a => a.id === "GIA502");
      return ac && (ac.squawk === "4521" || (ac.fde && ac.fde.assignedAlt === "FL140"));
    },
    successMessage: "Pilot GIA502 membaca readback resmi dan menyetel squawk 4521! IFR clearance sukses."
  },
  {
    id: "lesson-3",
    num: 3,
    title: "Lesson 3: Ground Control — Pushback & Taxi",
    category: "Ground Control",
    desc: "Instruksikan pesawat untuk dorong mundur dan taxi ke holding point Runway 25R.",
    instruction: "Ucapkan ke mic atau kirim instruksi:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 push and start approved, facing west\"</span> kemudian setelah pushback berikan <span class='text-sky-300 font-bold'>\"Indonesia 502 taxi to holding point runway 25R\"</span>",
    targetPhrase: "Indonesia 502 push and start approved, facing west",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "GIA502",
        callsign: "INDONESIA 502",
        airline: "Garuda Indonesia",
        type: "B738",
        gate: "Gate E1",
        lat: -6.1255,
        lon: 106.6558,
        heading: 90,
        altitude: 0,
        groundSpeed: 0,
        state: "PARKED",
        clearedRwy: "25R",
        fde: {}
      });
      selectedAircraftIndex = 0;
      renderFlightStrips();
      renderAllScreens();
      updateEasyModePrompter();
    },
    checkSuccess: () => {
      const ac = aircraft.find(a => a.id === "GIA502");
      return ac && ["PUSHBACK", "TAXI", "HOLDING"].includes(ac.state);
    },
    successMessage: "Pesawat GIA502 bergerak keluar dari gate dan mulai taxi di taxiway menuju holding point!"
  },
  {
    id: "lesson-4",
    num: 4,
    title: "Lesson 4: Tower Control — Line Up & Takeoff",
    category: "Tower Control",
    desc: "Berikan izin masuk ke runway aktif dan otorisasi lepas landas setelah kondisi aman.",
    instruction: "GIA502 berada di holding point 25R. Berikan izin lepas landas:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 runway 25R cleared for takeoff\"</span>",
    targetPhrase: "Indonesia 502 runway 25R cleared for takeoff",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "GIA502",
        callsign: "INDONESIA 502",
        airline: "Garuda Indonesia",
        type: "B738",
        gate: "Holding Point 25R",
        lat: -6.1130,
        lon: 106.6710,
        heading: 250,
        altitude: 0,
        groundSpeed: 0,
        state: "HOLDING",
        clearedRwy: "25R",
        fde: {}
      });
      selectedAircraftIndex = 0;
      renderFlightStrips();
      renderAllScreens();
      updateEasyModePrompter();
    },
    checkSuccess: () => {
      const ac = aircraft.find(a => a.id === "GIA502");
      return ac && ["TAKEOFF", "CLIMB", "AIRBORNE"].includes(ac.state);
    },
    successMessage: "GIA502 full throttle, lepas landas dan mengudara menuju initial altitude!"
  },
  {
    id: "lesson-5",
    num: 5,
    title: "Lesson 5: Approach Control — ILS Clearance",
    category: "Approach Control",
    desc: "Pandu pesawat kedatangan (Arrival) yang mendekati localizer untuk intercept glide slope dan mendarat.",
    instruction: "Lion Inter 650 sedang berada di TMA mendekati runway 25L. Berikan ILS clearance:<br><span class='text-amber-300 font-bold'>\"Lion Inter 650 descend to 3000 feet, cleared ILS runway 25L\"</span>",
    targetPhrase: "Lion Inter 650 descend to 3000 feet, cleared ILS runway 25L",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "LNI650",
        callsign: "LION INTER 650",
        airline: "Lion Air",
        type: "A333",
        lat: -6.135,
        lon: 106.900,
        heading: 250,
        altitude: 5000,
        groundSpeed: 210,
        state: "APPROACH",
        clearedRwy: "25L",
        fde: {}
      });
      selectedAircraftIndex = 0;
      renderFlightStrips();
      renderAllScreens();
      updateEasyModePrompter();
    },
    checkSuccess: () => {
      const ac = aircraft.find(a => a.id === "LNI650");
      return ac && ac.fde && ac.fde.assignedAlt === "A030";
    },
    successMessage: "LNI650 menangkap localizer dan glide slope ILS runway 25L serta turun ke 3000 ft!"
  },
  {
    id: "lesson-6",
    num: 6,
    title: "Lesson 6: Emergency Handling — Go-Around",
    category: "Emergency & Safety",
    desc: "Runway terhalang! Batalkan pendaratan pesawat di short final dengan instruksi Go-Around darurat.",
    instruction: "Garuda 502 berada di short final tetapi runway tidak steril. Segera instruksikan:<br><span class='text-red-400 font-bold'>\"Indonesia 502 go around!\"</span>",
    targetPhrase: "Indonesia 502 go around",
    spawnAircraft: () => {
      resetScenarioAircraft();
      aircraft.push({
        id: "GIA502",
        callsign: "INDONESIA 502",
        airline: "Garuda Indonesia",
        type: "B738",
        lat: -6.110,
        lon: 106.720,
        heading: 250,
        altitude: 800,
        groundSpeed: 145,
        state: "FINAL",
        clearedRwy: "25R",
        fde: {}
      });
      selectedAircraftIndex = 0;
      renderFlightStrips();
      renderAllScreens();
      updateEasyModePrompter();
    },
    checkSuccess: () => {
      const ac = aircraft.find(a => a.id === "GIA502");
      return ac && (ac.state === "GO_AROUND" || (ac.fde && ac.fde.directFix === "GO_AROUND"));
    },
    successMessage: "Pesawat segera batalkan pendaratan, mendaki tajam ke 3000 ft dan menjauh dari runway!"
  }
];

let activePracticeScenario = null;
let practiceCheckInterval = null;

function resetScenarioAircraft() {
  if (typeof aircraft !== 'undefined' && Array.isArray(aircraft)) {
    aircraft.forEach(ac => {
      if (ac._approachInterval) clearInterval(ac._approachInterval);
      if (ac._holdInterval) clearInterval(ac._holdInterval);
      if (ac._groundTimer) clearInterval(ac._groundTimer);
    });
    aircraft.length = 0;
  }
  selectedAircraftIndex = -1;
}

// Render Scenario Cards on Academy Page
function initAcademyTutorial() {
  const container = document.getElementById('academy-tutorial-grid');
  if (!container) return;

  container.innerHTML = INTERACTIVE_SCENARIOS.map(s => {
    return `
      <div class="bg-slate-900 border border-slate-800 hover:border-emerald-700/80 p-4 rounded-xl transition flex flex-col justify-between space-y-3 group shadow-lg">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 uppercase">
              ${s.category}
            </span>
            <span class="text-[10px] font-mono text-amber-400 font-bold">PRAKTEK LANGSUNG</span>
          </div>
          <h4 class="text-sm font-bold text-white font-radar mt-2 group-hover:text-emerald-400 transition">${s.title}</h4>
          <p class="text-xs text-slate-400 mt-1 leading-relaxed">${s.desc}</p>
        </div>
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span class="text-[10px] text-slate-500 font-mono"><i class="fa-solid fa-plane-departure text-emerald-500 mr-1"></i>Live Scenario</span>
          <button onclick="startHandsOnScenario('${s.id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold font-radar flex items-center gap-1.5 shadow transition active:scale-95">
            <i class="fa-solid fa-gamepad text-[11px]"></i> Mainkan Misi
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Launch Hands-on Practice Scenario
function startHandsOnScenario(scenarioId) {
  const scenario = INTERACTIVE_SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) return;

  activePracticeScenario = scenario;

  // 1. Spawn live scenario aircraft
  scenario.spawnAircraft();

  // 2. Switch to Radar View
  if (typeof switchTab === 'function') {
    switchTab('radar');
  }

  // 3. Show Mission HUD Overlay on Radar View
  showPracticeMissionHUD(scenario);

  // 4. Start Continuous Evaluator Loop
  if (practiceCheckInterval) clearInterval(practiceCheckInterval);
  practiceCheckInterval = setInterval(() => {
    if (!activePracticeScenario) {
      clearInterval(practiceCheckInterval);
      return;
    }

    if (activePracticeScenario.checkSuccess()) {
      clearInterval(practiceCheckInterval);
      showMissionSuccessModal(activePracticeScenario);
    }
  }, 500);

  if (typeof logTelemetry === 'function') {
    logTelemetry('SYSTEM', `Academy Practice Started: ${scenario.title}`, 'Spawning mission simulation');
  }
}

// Show Mission HUD Banner atop Radar
function showPracticeMissionHUD(scenario) {
  let hud = document.getElementById('practice-mission-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'practice-mission-hud';
    hud.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[95vw] bg-slate-950/95 backdrop-blur border border-amber-500/80 rounded-xl shadow-2xl p-3 text-white font-radar transition-all';
    document.body.appendChild(hud);
  }

  hud.classList.remove('hidden');
  hud.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
        <span class="text-xs font-bold text-amber-400 uppercase tracking-wider"><i class="fa-solid fa-crosshairs mr-1"></i>MISI PRAKTEK: ${scenario.title}</span>
      </div>
      <button onclick="quitPracticeScenario()" class="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800" title="Keluar Misi">
        <i class="fa-solid fa-xmark"></i> Batal
      </button>
    </div>
    <div class="text-xs text-slate-200 leading-relaxed font-sans mb-2">
      ${scenario.instruction}
    </div>
    <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
      <span class="text-slate-400 font-mono">Status Misi: <b class="text-amber-400 animate-pulse">MENUNGGU AKSI ANDA...</b></span>
      <button onclick="autoExecuteScenarioHelp()" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold font-mono text-[10px]" title="Kirim otomatis perintah target">
        <i class="fa-solid fa-bolt mr-1"></i>Bantu Kirim
      </button>
    </div>
  `;
}

// Helper button to execute target voice command
function autoExecuteScenarioHelp() {
  if (!activePracticeScenario || !activePracticeScenario.targetPhrase) return;
  const phrase = activePracticeScenario.targetPhrase;
  if (typeof handleRadarVoiceCommand === 'function') {
    handleRadarVoiceCommand(phrase, { intent: "AUTO_LESSON" });
  }
}

// Success Modal upon mission accomplishment
function showMissionSuccessModal(scenario) {
  let modal = document.getElementById('practice-success-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'practice-success-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm font-radar p-4';
    document.body.appendChild(modal);
  }

  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="bg-slate-900 border-2 border-emerald-500 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl text-white">
      <div class="w-16 h-16 rounded-full bg-emerald-950 border-2 border-emerald-400 text-emerald-300 mx-auto flex items-center justify-center text-3xl shadow-lg">
        <i class="fa-solid fa-trophy"></i>
      </div>
      <div>
        <span class="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">Misi Berhasil Diselesaikan!</span>
        <h3 class="text-lg font-bold text-white mt-2">${scenario.title}</h3>
        <p class="text-xs text-slate-300 mt-1 leading-relaxed font-sans">
          ${scenario.successMessage}
        </p>
      </div>
      <div class="pt-2 flex items-center justify-center gap-3">
        <button onclick="quitPracticeScenario()" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono">
          Tutup
        </button>
        <button onclick="nextPracticeScenario('${scenario.id}')" class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono shadow-lg flex items-center gap-1.5">
          Lanjut Misi Berikutnya <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  `;

  if (typeof logTelemetry === 'function') {
    logTelemetry('SYSTEM', `🏆 Mission Accomplished: ${scenario.title}`, 'Student successfully performed required ATC action');
  }
}

function nextPracticeScenario(currentId) {
  const idx = INTERACTIVE_SCENARIOS.findIndex(s => s.id === currentId);
  const next = INTERACTIVE_SCENARIOS[idx + 1] || INTERACTIVE_SCENARIOS[0];
  const modal = document.getElementById('practice-success-modal');
  if (modal) modal.classList.add('hidden');
  startHandsOnScenario(next.id);
}

function quitPracticeScenario() {
  activePracticeScenario = null;
  if (practiceCheckInterval) clearInterval(practiceCheckInterval);
  const hud = document.getElementById('practice-mission-hud');
  if (hud) hud.classList.add('hidden');
  const modal = document.getElementById('practice-success-modal');
  if (modal) modal.classList.add('hidden');
}
function toggleWeatherRadar() {
  showWeatherRadar = !showWeatherRadar;
  const btn = document.getElementById('btn-toggle-wx');
  if (btn) {
    btn.textContent = showWeatherRadar ? "WX: ON" : "WX: OFF";
    btn.className = showWeatherRadar 
      ? "px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-600/80 text-sky-300 font-bold hover:bg-sky-900 mr-1 text-[10px]"
      : "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-500 font-bold hover:bg-slate-700 mr-1 text-[10px]";
  }
  renderAllScreens();
}

function calculateWindComponents(rwyHeading, windDir, windSpd) {
  const diffRad = (windDir - rwyHeading) * Math.PI / 180;
  const headwind = Math.round(windSpd * Math.cos(diffRad));
  const crosswind = Math.round(Math.abs(windSpd * Math.sin(diffRad)));
  const tailwind = -headwind;
  return { headwind, crosswind, tailwind };
}

function getRecommendedRunwayConfig(weather = currentWeather) {
  // WIII Primary Runways: 25R/25L (Heading 250) vs 07L/07R (Heading 070)
  const comp25 = calculateWindComponents(250, weather.windDir, weather.windSpd);
  const comp07 = calculateWindComponents(70, weather.windDir, weather.windSpd);
  
  // ICAO Annex 14 recommendation: Runway switch advised when tailwind exceeds 10 knots
  if (comp25.tailwind > 10 || comp07.headwind > comp25.headwind + 8) {
    return {
      config: "07_OPS",
      name: "Operations East (Runway 07L / 07R)",
      primaryDep: "07L",
      primaryArr: "07R",
      headwind: comp07.headwind,
      crosswind: comp07.crosswind,
      tailwindOn25: comp25.tailwind,
      reason: `Tailwind ${comp25.tailwind}KT on 25R/L exceeds 10KT threshold.`
    };
  }
  
  return {
    config: "25_OPS",
    name: "Operations West (Runway 25R / 25L)",
    primaryDep: "25R",
    primaryArr: "25L",
    headwind: comp25.headwind,
    crosswind: comp25.crosswind,
    tailwindOn25: comp25.tailwind,
    reason: `Favorable headwind ${comp25.headwind}KT on 25R/L.`
  };
}

function setWeatherPreset(presetKey) {
  const preset = WEATHER_PRESETS[presetKey];
  if (!preset) return;
  currentWeather = Object.assign({}, preset);

  // Increment ATIS identifier letter: A -> B -> C...
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const curIdx = letters.indexOf(atisInfoLetter);
  atisInfoLetter = letters[(curIdx + 1) % letters.length];

  updateWeatherHeaderDisplay();

  const rec = getRecommendedRunwayConfig(currentWeather);
  console.log(`[WEATHER SHIFT] Preset ${presetKey} activated: ${preset.metarRaw}`);
  console.log(`[RUNWAY ADVISORY] ${rec.name} (${rec.reason})`);

  // Prompt controller if active runway assignment on strip differs from optimal
  if (aircraft.length > 0 && rec.config === "07_OPS" && aircraft[0].clearedRwy.startsWith("25")) {
    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-amber-300 font-bold animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> ADVISORY: ANGIN ${String(currentWeather.windDir).padStart(3, '0')}/${currentWeather.windSpd}KT. DISARANKAN BERALIH KE RUNWAY 07L/07R!</span>`;
    }
  }

  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

function updateWeatherHeaderDisplay() {
  const bar = document.getElementById('metar-bar');
  if (bar) {
    const gustStr = currentWeather.gust ? `G${currentWeather.gust}` : "";
    bar.textContent = `QNH ${currentWeather.qnh} | WIND ${String(currentWeather.windDir).padStart(3, '0')}/${String(currentWeather.windSpd).padStart(2, '0')}${gustStr}KT | VIS ${currentWeather.visStr}`;
  }
}

function generateAtisReport(weather = currentWeather, infoLetter = atisInfoLetter) {
  const rec = getRecommendedRunwayConfig(weather);
  const depRwyPhonetic = rec.primaryDep === "25R" ? "two five right" : (rec.primaryDep === "07L" ? "zero seven left" : rec.primaryDep);
  const arrRwyPhonetic = rec.primaryArr === "25L" ? "two five left" : (rec.primaryArr === "07R" ? "zero seven right" : rec.primaryArr);
  
  // Digit expansion
  const windDirWords = String(weather.windDir).padStart(3, '0').split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const windSpdWords = String(weather.windSpd).split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const qnhWords = String(weather.qnh).split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');

  const letterNames = {
    'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo',
    'F': 'Foxtrot', 'G': 'Golf', 'H': 'Hotel', 'I': 'India', 'J': 'Juliet',
    'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November', 'O': 'Oscar'
  };
  const phoneticLetter = letterNames[infoLetter] || infoLetter;

  let report = `Soekarno-Hatta Information ${phoneticLetter}. `;
  report += `Runway in use departure ${depRwyPhonetic}, arrival ${arrRwyPhonetic}. `;
  report += `Transition level one two zero. `;
  report += `Wind ${windDirWords} degrees, ${windSpdWords} knots. `;
  if (weather.gust) report += `Gusting ${weather.gust} knots. `;
  report += `Visibility ${weather.visStr}. `;
  if (weather.weatherCond !== "NIL") report += `Weather condition ${weather.weatherCond}. `;
  report += `Temperature ${weather.tempC}, dew point ${weather.dewC}. `;
  report += `QNH ${qnhWords} hectopascals. `;
  if (weather.separationMinNm > 3.0) {
    report += `Caution, radar separation increased to five miles due to weather. `;
  }
  report += `Advise controller on initial contact you have information ${phoneticLetter}.`;
  return report;
}

async function playAtisBroadcast() {
  const btn = document.getElementById('btn-listen-atis');
  if (atisAudioPlaying) {
    if (atisAudioElement) {
      atisAudioElement.pause();
      atisAudioElement = null;
    }
    atisAudioPlaying = false;
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400"></i> ATIS`;
      btn.classList.remove('bg-amber-600', 'text-white');
    }
    updateActiveFrequencyDisplay();
    return;
  }

  atisAudioPlaying = true;
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-circle-stop text-amber-400 animate-pulse"></i> ATIS [128.0]`;
    btn.classList.add('bg-amber-600', 'text-white');
  }

  // Update VHF panel to indicate ATIS 128.000 MHz monitoring
  const lbl = document.getElementById('active-freq-label');
  const tag = document.getElementById('active-sector-tag');
  if (lbl && tag) {
    lbl.textContent = FREQUENCIES.ATIS;
    tag.textContent = `ATIS ${atisInfoLetter}`;
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-amber-900/80 text-amber-200 font-mono";
  }

  const atisText = generateAtisReport();
  const recEl = document.getElementById('recognized-text');
  if (recEl) recEl.textContent = `[ATIS 128.0 MHz]: "${atisText}"`;

  try {
    const audioUrl = `/api/audio/tts?text=${encodeURIComponent(atisText)}&voice=en-US-GuyNeural`;
    atisAudioElement = new Audio(audioUrl);
    atisAudioElement.volume = 0.9;
    
    await new Promise((resolve) => {
      atisAudioElement.onended = resolve;
      atisAudioElement.onerror = resolve;
      atisAudioElement.play().catch(resolve);
    });
  } catch (e) {
    console.warn("[ATIS] Broadcast error:", e);
  } finally {
    atisAudioPlaying = false;
    atisAudioElement = null;
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400"></i> ATIS`;
      btn.classList.remove('bg-amber-600', 'text-white');
    }
    updateActiveFrequencyDisplay();
  }
}

// Weather Radar Display Overlay (Canvas Precipitation Cells)
function drawWeatherRadarOverlay(ctx, st) {
  if (!showWeatherRadar || !currentWeather) return;

  // If Low Visibility Fog, draw a subtle atmospheric mist over the center
  if (currentWeather.visMeters < 1500) {
    const c = latLonToScreenCoord(refLat, refLon, st);
    const fogGrad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 140 * st.zoom * 10);
    fogGrad.addColorStop(0, "rgba(226, 232, 240, 0.16)");
    fogGrad.addColorStop(0.6, "rgba(203, 213, 225, 0.08)");
    fogGrad.addColorStop(1, "rgba(203, 213, 225, 0)");
    ctx.fillStyle = fogGrad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 140 * st.zoom * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (currentWeather.rainIntensity > 0) {
    ctx.save();
    const intensity = currentWeather.rainIntensity;

    // Slowly drift cells along wind direction
    const windRad = (currentWeather.windDir * Math.PI) / 180;
    const driftSpeed = (currentWeather.windSpd * 0.0000008);

    weatherRadarCells.forEach((cell, idx) => {
      cell.lat += Math.cos(windRad) * driftSpeed;
      cell.lon += Math.sin(windRad) * driftSpeed;

      // Wrap around bounds to keep rain cells inside TMA
      if (cell.lat > -5.60) cell.lat = -6.50;
      if (cell.lat < -6.50) cell.lat = -5.60;
      if (cell.lon > 107.40) cell.lon = 106.10;
      if (cell.lon < 106.10) cell.lon = 107.40;

      const p = latLonToScreenCoord(cell.lat, cell.lon, st);
      const rPx = (cell.rNm / 60) * BASE_SCALE * st.zoom;

      // Multi-tier radar precipitation echo rings:
      // Outer: Green (Light rain / 30 dBZ)
      ctx.beginPath();
      ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 197, 94, ${0.18 * intensity})`;
      ctx.fill();

      // Mid: Yellow/Amber (Moderate / 40 dBZ)
      if (cell.intensity > 0.4) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rPx * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(234, 179, 8, ${0.28 * intensity})`;
        ctx.fill();
      }

      // Core: Red/Magenta (Severe convective thunderstorm cell / 50+ dBZ)
      if (cell.intensity > 0.7) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rPx * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.40 * intensity})`;
        ctx.fill();

        // Flashing storm center marker
        if (Math.floor(Date.now() / 600) % 2 === 0) {
          ctx.font = "bold 9px 'Share Tech Mono'";
          ctx.fillStyle = "#fca5a5";
          ctx.fillText("⚡ TS CELL", p.x - 20, p.y - 4);
        }
      }
    });
    ctx.restore();
  }

  // Wind Rose Tactical Overlay in Top-Left of TMA
  ctx.save();
  const wxBoxX = 14;
  const wxBoxY = st.height - 48;
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1;
  ctx.fillRect(wxBoxX, wxBoxY, 150, 40);
  ctx.strokeRect(wxBoxX, wxBoxY, 150, 40);

  ctx.font = "bold 10px 'Share Tech Mono'";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(`WIND: ${String(currentWeather.windDir).padStart(3, '0')}° / ${currentWeather.windSpd}KT`, wxBoxX + 8, wxBoxY + 16);
  ctx.font = "9px 'Share Tech Mono'";
  ctx.fillStyle = currentWeather.separationMinNm > 3.0 ? "#f87171" : "#94a3b8";
  ctx.fillText(`MIN SEP: ${currentWeather.separationMinNm.toFixed(1)} NM ${currentWeather.separationMinNm > 3.0 ? '(WX EXPAND)' : '(ICAO)'}`, wxBoxX + 8, wxBoxY + 30);

  ctx.restore();
}

// Ground collision avoidance check (Wingspan separation & conflict detection)
// Returns true if there is a conflict ahead and this aircraft must hold/brake
function checkGroundConflictAhead(currentAc, targetLat, targetLon) {
  // Determine aircraft physical footprint / wingspan envelope
  const isWidebody = (type) => ["777", "B777", "77W", "773", "330", "A330", "333", "747", "B747", "787", "B787", "350", "A350", "380", "A380"].some(t => (type || "").toUpperCase().includes(t));
  const mySpan = isWidebody(currentAc.type) ? 65 : 36;
  const myLength = isWidebody(currentAc.type) ? 65 : 40;

  for (const other of aircraft) {
    if (other.id === currentAc.id) continue;
    // Only check conflict with aircraft that are also on ground
    if (other.altitude > 100) continue;

    // Skip conflict check if the other aircraft is parked at a gate stand and not moving
    if (other.state === "PARKED" || (other.state === "GATE" && other.groundSpeed === 0)) {
      continue;
    }

    const otherSpan = isWidebody(other.type) ? 65 : 36;
    const otherLength = isWidebody(other.type) ? 65 : 40;

    // Safe stopping sight distance and wingtip envelope (ICAO Code E clearance buffer)
    const requiredSeparationMeters = Math.max(120, (mySpan + otherSpan) * 1.1);
    const junctionBufferMeters = Math.max(90, (myLength + otherLength) * 0.9);

    // Direct distance between both aircraft centers
    const distBetweenMeters = calculateDistanceMeters(currentAc.lat, currentAc.lon, other.lat, other.lon);
    // Distance from other aircraft to our intended next node / trajectory
    const distTargetMeters = calculateDistanceMeters(targetLat, targetLon, other.lat, other.lon);

    // 1. Emergency Proximity Stop (if aircraft are dangerously close anywhere)
    if (distBetweenMeters < requiredSeparationMeters) {
      const myBearing = currentAc.heading * Math.PI / 180;
      const dLat = other.lat - currentAc.lat;
      const dLon = (other.lon - currentAc.lon) * Math.cos(currentAc.lat * Math.PI / 180);
      const forwardDot = Math.sin(myBearing) * dLon + Math.cos(myBearing) * dLat;

      // Other aircraft is anywhere in our forward 180-degree visual cone
      if (forwardDot > -0.0001 || distBetweenMeters < 75) {
        // Interlocking & Right-of-Way Resolution (Prevent mutual deadlock):
        // If other aircraft is already holding for traffic, WE must wait if we are the converging traffic,
        // or the aircraft closer to the target node / with higher groundSpeed has right-of-way.
        if (other.isHoldingForTraffic && !currentAc.isHoldingForTraffic && distBetweenMeters > 70) {
          // If other is already yielding and we are not yet locked, let the other wait or let us pass safely
        }
        return true;
      }
    }

    // 2. Junction / Intersection Interlocking Buffer (Hold short before entering junction node)
    // If the next node we want to enter is occupied or being approached by another aircraft:
    if (distTargetMeters < junctionBufferMeters) {
      const myDistToTarget = calculateDistanceMeters(currentAc.lat, currentAc.lon, targetLat, targetLon);
      const otherDistToTarget = calculateDistanceMeters(other.lat, other.lon, targetLat, targetLon);

      // If other aircraft is closer to the junction node, or already entering it, we MUST hold short!
      if (otherDistToTarget < myDistToTarget || (other.groundSpeed > 0 && otherDistToTarget < 60)) {
        return true;
      }

      // Tie-breaker to prevent simultaneous dual-stop deadlock:
      // If distances are almost equal, lower alphabetical callsign yields right of way
      if (Math.abs(myDistToTarget - otherDistToTarget) < 15 && currentAc.id > other.id) {
        return true;
      }
    }
  }
  return false;
}

function calculateDepartureClimbPath(startLat, startLon, startHdg, sidPoints) {
  if (!sidPoints || sidPoints.length === 0) return [];
  const firstFix = sidPoints[0];
  
  // Calculate initial departure climb vector straight ahead on runway heading
  // (Standard Instrument Departure: maintain runway heading to DER + 2-3 NM until reaching safe altitude)
  const radHdg = (90 - startHdg) * (Math.PI / 180);
  const straightDistDeg = 0.035; // ~2.1 NM
  const derLat = startLat + Math.sin(radHdg) * straightDistDeg;
  const derLon = startLon + Math.cos(radHdg) * straightDistDeg;

  // Build a smooth cubic Bezier turning arc from (derLat, derLon) to first SID fix (CKG VOR)
  // Control point 1: Continuing along runway heading forward
  const ctrl1Dist = 0.045;
  const ctrl1Lat = derLat + Math.sin(radHdg) * ctrl1Dist;
  const ctrl1Lon = derLon + Math.cos(radHdg) * ctrl1Dist;

  // Control point 2: Inbound tangent to first SID fix
  const targetLat = firstFix.lat;
  const targetLon = firstFix.lon;
  const dAngle = Math.atan2(targetLat - ctrl1Lat, targetLon - ctrl1Lon);
  const ctrl2Dist = 0.045;
  const ctrl2Lat = targetLat - Math.sin(dAngle) * ctrl2Dist;
  const ctrl2Lon = targetLon - Math.cos(dAngle) * ctrl2Dist;

  const transitionArc = [];
  // Initial straight climb leg
  transitionArc.push({
    lat: derLat,
    lon: derLon,
    alt: 2200,
    spd: 195,
    desc: "RUNWAY TRACK CLIMB"
  });

  // 6 intermediate smooth curve banking points (realistic standard-rate turn arc)
  const arcSteps = 6;
  for (let i = 1; i <= arcSteps; i++) {
    const t = i / (arcSteps + 1);
    const b0 = Math.pow(1 - t, 3);
    const b1 = 3 * Math.pow(1 - t, 2) * t;
    const b2 = 3 * (1 - t) * Math.pow(t, 2);
    const b3 = Math.pow(t, 3);

    const pLat = b0 * derLat + b1 * ctrl1Lat + b2 * ctrl2Lat + b3 * targetLat;
    const pLon = b0 * derLon + b1 * ctrl1Lon + b2 * ctrl2Lon + b3 * targetLon;
    const pAlt = Math.round(2200 + t * 1800);
    const pSpd = Math.round(195 + t * 35);
    transitionArc.push({
      lat: pLat,
      lon: pLon,
      alt: pAlt,
      spd: pSpd,
      desc: `SID TURNING ARC ${i}`
    });
  }

  // Combine transition arc with the main SID enroute waypoints
  return [...transitionArc, ...sidPoints];
}

function executeClimbEnroute(ac) {
  // Prevent duplicate intervals if called while airborne
  if (ac._climbInterval) return;

  const sidKey = ac.clearedSid || "DOLTA 1C";
  const sidObj = (airportData && airportData.sids)
    ? airportData.sids.find(s => s.id === sidKey)
    : null;

  const rawSidPoints = (sidObj && sidObj.coords)
    ? sidObj.coords.map((c, i) => ({
        lat: c[0],
        lon: c[1],
        alt: 4000 + i * 4000,
        spd: 230 + i * 25,
        desc: sidObj.waypoints[i] || "WAYPOINT"
      }))
    : flightRouteMission.climbWaypoints;

  // Generate realistic smooth departure turning arc (no abrupt 90-degree snap!)
  const points = calculateDepartureClimbPath(ac.lat, ac.lon, ac.heading, rawSidPoints);

  let ptIdx = 0;

  function moveNextClimbLeg() {
    if (ptIdx >= points.length) {
      if (ac._climbInterval) {
        clearInterval(ac._climbInterval);
        ac._climbInterval = null;
      }
      // Arrived at DOLTA COP Gateway!
      ac.state = "HANDOFF";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = "Jakarta Approach, INDONESIA 502, passing flight level one four zero, reaching DOLTA.";
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const leg = points[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;
    const startAlt = ac.altitude;
    const startSpd = ac.groundSpeed;
    const targetAlt = leg.alt;
    const targetSpd = leg.spd;

    // Calculate heading towards target departure fix
    const dLat = leg.lat - startLat;
    const dLon = leg.lon - startLon;
    let targetHdg = (ac.heading !== undefined && !isNaN(ac.heading)) ? ac.heading : 250;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    const legDistNm = calculateDistanceNm(startLat, startLon, leg.lat, leg.lon);
    const avgSpeedKts = Math.max(40, (startSpd + targetSpd) / 2);
    // Real-Time 1:1 Physics Engine (1 real second = 1 simulation second)
    // Time (seconds) = (legDistNm / avgSpeedKts) * 3600
    const SIM_SPEED_MULT = 1.0;
    const legDurationSec = Math.max(0.1, (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT));
    const stepIntervalMs = 50;
    const totalSteps = Math.max(2, Math.round((legDurationSec * 1000) / stepIntervalMs));
    let step = 0;

    ac._climbInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (leg.lat - startLat) * prog;
      ac.lon = startLon + (leg.lon - startLon) * prog;
      ac.altitude = Math.round(startAlt + (targetAlt - startAlt) * prog);
      ac.groundSpeed = Math.round(startSpd + (targetSpd - startSpd) * prog);

      if (ac._tacticalVector !== undefined && ac._tacticalVector !== null) {
        ac.heading = ac._tacticalVector;
      } else {
        const curHdg = (ac.heading !== undefined && !isNaN(ac.heading)) ? ac.heading : targetHdg;
        const angleDelta = ((targetHdg - curHdg + 540) % 360) - 180;
        ac.heading = Math.round((curHdg + angleDelta * 0.08 + 360) % 360);
      }
      if (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) {
        ac.groundSpeed = ac._assignedSpeed;
      }

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._climbInterval);
        ac._climbInterval = null;
        if (ac._tacticalVector === undefined || ac._tacticalVector === null) {
          ac.heading = targetHdg;
        }
        ptIdx++;
        moveNextClimbLeg();
      }
    }, stepIntervalMs);
  }

  moveNextClimbLeg();
}

function executeHandoffComplete(ac) {
  const pttStatus = document.getElementById('ptt-status');
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check"></i> HANDOFF COMPLETE - CRUISE ENROUTE JAKARTA CENTER</span>`;
  }
}

// Inbound Arrival Flight Planning and Smooth STAR Descent Engine
function calculateStarArrivalPath(starCoords, rwyKey) {
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const threshold = mech ? [mech.threshold.lat, mech.threshold.lon] : [-6.108959, 106.669062];
  const rwyHeading = mech ? mech.heading : 250;

  const rad = (90 - rwyHeading) * (Math.PI / 180);
  const fafDist = 0.08; // ~4.8 NM final
  const fafLat = threshold[0] - Math.sin(rad) * fafDist;
  const fafLon = threshold[1] - Math.cos(rad) * fafDist;

  const lastStar = starCoords[starCoords.length - 1];
  const ctrl1Lat = lastStar[0];
  const ctrl1Lon = lastStar[1];
  const ctrl2Lat = fafLat - Math.sin(rad) * 0.035;
  const ctrl2Lon = fafLon - Math.cos(rad) * 0.035;

  const path = [];
  // 0. Pre-STAR feeder leg (from 15 NM outer radius entering the STAR entry fix)
  if (starCoords.length > 1) {
    const wp0 = starCoords[0];
    const wp1 = starCoords[1];
    const dLat = wp0[0] - wp1[0];
    const dLon = wp0[1] - wp1[1];
    const distDeg = Math.hypot(dLat, dLon) || 0.1;
    const feederLat = wp0[0] + (dLat / distDeg) * 0.25;
    const feederLon = wp0[1] + (dLon / distDeg) * 0.25;
    path.push({ lat: feederLat, lon: feederLon, alt: 12000, spd: 260, desc: `FEEDER INBOUND (15NM OUT)` });
  }

  // 1. STAR enroute waypoints
  for (let i = 0; i < starCoords.length; i++) {
    const alt = Math.max(4000, 10000 - i * 3000);
    const spd = Math.max(190, 250 - i * 20);
    path.push({ lat: starCoords[i][0], lon: starCoords[i][1], alt: alt, spd: spd, desc: `STAR WP ${i}` });
  }

  // 2. Smooth cubic Bezier intercept arc onto ILS localizer
  for (let i = 1; i <= 5; i++) {
    const t = i / 6.0;
    const b0 = Math.pow(1 - t, 3);
    const b1 = 3 * Math.pow(1 - t, 2) * t;
    const b2 = 3 * (1 - t) * Math.pow(t, 2);
    const b3 = Math.pow(t, 3);
    const pLat = b0 * lastStar[0] + b1 * ctrl1Lat + b2 * ctrl2Lat + b3 * fafLat;
    const pLon = b0 * lastStar[1] + b1 * ctrl1Lon + b2 * ctrl2Lon + b3 * fafLon;
    const alt = Math.round(4000 - t * 1500);
    const spd = Math.round(190 - t * 25);
    path.push({ lat: pLat, lon: pLon, alt: alt, spd: spd, desc: `ILS INTERCEPT ARC ${i}` });
  }

  // 3. Final Approach Fix (FAF)
  path.push({ lat: fafLat, lon: fafLon, alt: 2500, spd: 160, desc: "FAF ILS GLIDESLOPE" });

  // 4. Glideslope 3-degree descent to threshold
  for (let i = 1; i <= 4; i++) {
    const t = i / 5.0;
    const pLat = fafLat + (threshold[0] - fafLat) * t;
    const pLon = fafLon + (threshold[1] - fafLon) * t;
    const alt = Math.round(2500 * (1 - t) + 50);
    const spd = Math.round(160 - t * 20);
    path.push({ lat: pLat, lon: pLon, alt: alt, spd: spd, desc: `FINAL ${i}` });
  }

  // 5. Touchdown threshold
  path.push({ lat: threshold[0], lon: threshold[1], alt: 0, spd: 135, desc: "TOUCHDOWN" });

  // 6. Realistic Landing Rollout on Runway Centerline to Rapid Exit Taxiway
  const rollPath = mech && mech.takeoff_roll_path ? mech.takeoff_roll_path : [];
  const taxiInData = (airportData && airportData.taxi_in_routes && airportData.taxi_in_routes[rwyKey])
    ? airportData.taxi_in_routes[rwyKey]
    : null;
  const targetExitPoint = taxiInData ? taxiInData.exit_point : null;

  if (rollPath && rollPath.length > 2) {
    // Find the exact roll node closest to the rapid exit taxiway point
    let bestExitIdx = Math.min(rollPath.length - 1, Math.max(3, Math.floor(rollPath.length * 0.65)));
    if (targetExitPoint) {
      let minDistSq = Infinity;
      rollPath.forEach((pt, i) => {
        const dSq = Math.pow(pt[0] - targetExitPoint[0], 2) + Math.pow(pt[1] - targetExitPoint[1], 2);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          bestExitIdx = i;
        }
      });
    }

    const exitNodeCount = Math.max(2, bestExitIdx);
    for (let r = 1; r <= exitNodeCount; r++) {
      const prog = r / exitNodeCount;
      const rollPt = rollPath[r];
      // Decelerate smoothly from 135 knots touchdown to 60 knots taxi exit speed
      const rollSpd = Math.round(135 - (135 - 60) * prog);
      path.push({
        lat: rollPt[0],
        lon: rollPt[1],
        alt: 0,
        spd: rollSpd,
        desc: `LANDING ROLLOUT ${Math.round(prog * 100)}%`
      });
    }
  }

  return path;
}

// Schedule Turnaround for Parked Aircraft (Auto-reborn as Outbound after turnaround window)
function scheduleTurnaroundOutbound(ac, delayMs = 25000) {
  if (ac._turnaroundTimer) clearTimeout(ac._turnaroundTimer);

  ac._turnaroundTimer = setTimeout(() => {
    // Check if aircraft still exists in simulation
    const idx = aircraft.findIndex(a => a.id === ac.id);
    if (idx === -1) return;

    // Convert arrival aircraft to fresh outbound departure!
    console.log(`[TURNAROUND] Aircraft ${ac.id} turnaround completed at ${ac.assignedGate || 'Gate'}. Re-appearing on Flight Strips as Outbound.`);

    const rwy = (ac.clearedRwy && ["25R", "25L", "07L", "07R"].includes(ac.clearedRwy)) ? ac.clearedRwy : "25R";
    const allSids = (airportData && airportData.sids) ? airportData.sids : [];
    const validSids = allSids.filter(s => !s.runways || s.runways.includes(rwy)).map(s => s.id);
    const chosenSid = validSids.length ? validSids[0] : "DOLTA 2A";

    const destPool = [
      { code: "WARR (Surabaya)", sid: "DOLTA 2A" },
      { code: "WADD (Bali)", sid: "DOLTA 2A" },
      { code: "WAAA (Makassar)", sid: "DOLTA 2A" },
      { code: "WIPT (Padang)", sid: "BUNIK 2H" },
      { code: "WIMM (Medan)", sid: "BUNIK 2H" },
      { code: "WIDD (Batam)", sid: "AKSOX 2A" },
      { code: "WBSB (Brunei)", sid: "AKSOX 2A" }
    ];
    const destObj = destPool[Math.floor(Math.random() * destPool.length)];

    // Reset outbound states
    ac.state = "GATE";
    ac.groundSpeed = 0;
    ac.altitude = 0;
    ac.dest = destObj.code;
    ac.pob = Math.floor(120 + Math.random() * 80);
    ac.clearedRwy = rwy;
    ac.clearedSid = destObj.sid || chosenSid;
    ac.squawk = String(Math.floor(1000 + Math.random() * 8000));
    ac.isArchivedParked = false; // Un-hide from flight strips!
    ac.hasCheckedIn = false;
    ac._aiShutdownIssued = false;
    ac._aiGateIssued = false;
    ac._aiCenterHandoffIssued = false;
    ac._aiIlsIssued = false;
    ac._aiLandIssued = false;
    ac._aiVacateIssued = false;
    ac._aiTaxiInIssued = false;
    ac._runwayCrossCleared = false;
    ac.takeoffQueued = false;

    const gateStr = ac.assignedGate ? `Gate ${ac.assignedGate}` : "Gate Echo 1";
    ac.checkInPhrase = `Jakarta Delivery, ${ac.callsign}, ${gateStr}, information Charlie, destination ${destObj.code.split(' ')[0]} via ${ac.clearedSid} departure, POB ${ac.pob}, request ATC clearance.`;

    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();

    // Trigger departure clearance request
    setTimeout(() => {
      triggerPilotCheckIn(ac);
    }, 1500);
  }, delayMs);
}

function spawnInboundArrival() {
  const arrivalCallsigns = [
    { id: "CTV123", callsign: "SUPERGREEN 123", airline: "Citilink", type: "320" },
    { id: "GIA880", callsign: "INDONESIA 880", airline: "Garuda Indonesia", type: "333" },
    { id: "SIA958", callsign: "SINGAPORE 958", airline: "Singapore Airlines", type: "777" },
    { id: "CLX742", callsign: "CARGOLUX 742", airline: "Cargolux", type: "747" },
    { id: "LNI712", callsign: "LION INTER 712", airline: "Lion Air", type: "738" }
  ];
  const arrivalEntryStars = [
    { star: "LADIR 1C", rwy: "25L", desc: "via LADIR (East / Primary Inbound)" },
    { star: "TOPAR 1C", rwy: "25L", desc: "via TOPAR (East / North-East)" },
    { star: "DOLTA 1A", rwy: "25R", desc: "via DOLTA (South-East)" },
    { star: "AKSOX 2G", rwy: "25L", desc: "via AKSOX (North)" },
    { star: "BUNTO 1A", rwy: "25R", desc: "via BUNTO (East)" }
  ];
  const chosen = arrivalCallsigns[aircraft.length % arrivalCallsigns.length];
  const chosenEntry = arrivalEntryStars[aircraft.length % arrivalEntryStars.length];
  const targetRwy = chosenEntry.rwy;
  const defaultStar = chosenEntry.star;

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === defaultStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  // Calculate pre-entry feeder position: 15 NM before the first STAR fix along the inbound inbound bearing
  const wp0 = starCoords[0];
  const wp1 = starCoords.length > 1 ? starCoords[1] : [wp0[0] + 0.1, wp0[1] + 0.1];
  const feederDLat = wp0[0] - wp1[0];
  const feederDLon = wp0[1] - wp1[1];
  const feederDistDeg = Math.hypot(feederDLat, feederDLon) || 0.1;
  const entryOffsetDeg = 0.25; // ~15 Nautical Miles before waypoint 0
  const spawnLat = wp0[0] + (feederDLat / feederDistDeg) * entryOffsetDeg;
  const spawnLon = wp0[1] + (feederDLon / feederDistDeg) * entryOffsetDeg;

  // Initial heading aligned directly towards the first STAR fix
  const angleRad = Math.atan2(wp0[0] - spawnLat, (wp0[1] - spawnLon) * Math.cos(spawnLat * Math.PI / 180));
  const initialHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);

  const assignedGate = (typeof assignRealisticGate === "function")
    ? assignRealisticGate(chosen.airline, chosen.callsign)
    : { ref: "E1", lat: -6.121757, lon: 106.651077, terminal: "T2" };

  const newAc = {
    id: chosen.id,
    callsign: chosen.callsign,
    airline: chosen.airline,
    type: chosen.type,
    lat: spawnLat,
    lon: spawnLon,
    heading: initialHdg,
    altitude: 12000,
    groundSpeed: 260,
    state: "APPROACH",
    clearedRwy: targetRwy,
    clearedStar: defaultStar,
    assignedGate: assignedGate.ref,
    assignedGateCoord: [assignedGate.lat, assignedGate.lon],
    squawk: String(Math.floor(1000 + Math.random() * 8000)),
    hasCheckedIn: false,
    checkInPhrase: `Jakarta Approach, ${chosen.callsign}, 15 miles before ${starObj.waypoints ? starObj.waypoints[0] : 'entry fix'}, inbound flight level one two zero.`
  };

  aircraft.push(newAc);
  selectedAircraftIndex = aircraft.length - 1;
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();

  setTimeout(() => {
    triggerPilotCheckIn(newAc);
  }, 1000);

  executeApproachMovement(newAc);
}

function spawnOutboundDeparture() {
  const outboundCallsigns = [
    { id: "BTK652", callsign: "BATIK 652", airline: "Batik Air", type: "320", dest: "WADD (Bali)" },
    { id: "LNI530", callsign: "LION INTER 530", airline: "Lion Air", type: "738", dest: "WIMM (Medan)" },
    { id: "SJV182", callsign: "SUPERJET 182", airline: "Super Air Jet", type: "320", dest: "WARR (Surabaya)" },
    { id: "AWQ751", callsign: "WAGON AIR 751", airline: "Indonesia AirAsia", type: "320", dest: "WBSB (Brunei)" },
    { id: "GIA888", callsign: "INDONESIA 888", airline: "Garuda Indonesia", type: "777", dest: "RJAA (Tokyo)" }
  ];

  const chosen = outboundCallsigns[aircraft.length % outboundCallsigns.length];
  const assignedGate = (typeof assignRealisticGate === "function")
    ? assignRealisticGate(chosen.airline, chosen.callsign)
    : { ref: "E1", lat: -6.121757, lon: 106.651077, terminal: "T2" };

  const rwyKey = (aircraft.length % 2 === 0) ? "25R" : "25L";
  const allSids = (airportData && airportData.sids) ? airportData.sids : [];
  const validSids = allSids.filter(s => !s.runways || s.runways.includes(rwyKey)).map(s => s.id);
  const defaultSid = validSids.length ? validSids[0] : "DOLTA 2A";

  const newAc = {
    id: chosen.id,
    callsign: chosen.callsign,
    airline: chosen.airline,
    type: chosen.type,
    dest: chosen.dest,
    pob: Math.floor(130 + Math.random() * 70),
    lat: assignedGate.lat,
    lon: assignedGate.lon,
    heading: 70, // Parked at stand facing terminal/gate
    altitude: 0,
    groundSpeed: 0,
    state: "GATE",
    clearedRwy: rwyKey,
    clearedSid: defaultSid,
    assignedGate: assignedGate.ref,
    assignedGateCoord: [assignedGate.lat, assignedGate.lon],
    squawk: String(Math.floor(1000 + Math.random() * 8000)),
    hasCheckedIn: false,
    checkInPhrase: `Jakarta Delivery, ${chosen.callsign}, Gate ${assignedGate.ref}, information Delta, destination ${chosen.dest.split(' ')[0]} via ${defaultSid} departure, POB 150, request ATC clearance.`
  };

  aircraft.push(newAc);
  selectedAircraftIndex = aircraft.length - 1;
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();

  setTimeout(() => {
    triggerPilotCheckIn(newAc);
  }, 1000);
}

function executeApproachMovement(ac) {
  if (ac._approachInterval) {
    clearInterval(ac._approachInterval);
    ac._approachInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const threshold = mech ? [mech.threshold.lat, mech.threshold.lon] : [-6.108959, 106.669062];
  const rwyHeading = mech ? mech.heading : 250;

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === ac.clearedStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  const rawFullPath = calculateStarArrivalPath(starCoords, rwyKey);

  // In-flight Dynamic Splice:
  // If aircraft is already airborne, smoothly transition towards the new flight plan:
  // 1. If switching runway/STAR to an entirely different entry corridor (e.g. from East BUNTO to North GOMBA),
  //    join the new route from its first entry/enroute fix (ptIdx = 0 or 1).
  // 2. Only splice forward if the aircraft is already aligned on that corridor's sequence.
  let ptIdx = 0;
  if (ac._forceRouteReset) {
    ac._forceRouteReset = false;
    ptIdx = 0; // Direct aircraft to fly towards the entry waypoint of the new STAR!
  } else if (ac.lat && ac.lon) {
    let closestIdx = 0;
    let minD = Infinity;
    // Only search among enroute/intercept legs (indices 0 to FAF index), never rollout/touchdown legs!
    const maxSearchIdx = Math.max(1, rawFullPath.findIndex(p => p.desc.includes("FAF") || p.desc.includes("TOUCHDOWN")));
    for (let i = 0; i <= maxSearchIdx; i++) {
      const d = calculateDistanceNm(ac.lat, ac.lon, rawFullPath[i].lat, rawFullPath[i].lon);
      if (d < minD) {
        minD = d;
        closestIdx = i;
      }
    }

    // If the closest waypoint is very far (> 18 NM, e.g. switching across opposite side of airport),
    // navigate from the start of the new route (ptIdx = 0) so the aircraft flies through the approach properly
    if (minD > 18) {
      ptIdx = 0;
    } else {
      ptIdx = Math.min(rawFullPath.length - 1, closestIdx + 1);
    }
  }

  const fullPath = rawFullPath;

  function moveNextArrivalLeg() {
    if (ptIdx >= fullPath.length) {
      if (ac._approachInterval) {
        clearInterval(ac._approachInterval);
        ac._approachInterval = null;
      }
      ac.state = "LANDED";
      ac.groundSpeed = 60;
      ac.altitude = 0;
      ac.hasCheckedIn = false;
      const exitName = rwyKey.startsWith("25") ? "November four" : "runway exit";
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, slowed to sixty knots, runway vacated at ${exitName}.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const leg = fullPath[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;
    const startAlt = ac.altitude;
    const startSpd = ac.groundSpeed;
    const targetAlt = leg.alt;
    const targetSpd = leg.spd;

    // Calculate heading towards target fix
    const dLat = leg.lat - startLat;
    const dLon = leg.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // When near final glideslope, trigger tower check-in
    if (leg.desc.includes("FAF") && ac.state !== "FINAL") {
      ac.state = "FINAL";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, established ILS runway ${rwyKey}.`;
      renderFlightStrips();
      updateEasyModePrompter();
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 500);
    }

    const legDistNm = calculateDistanceNm(startLat, startLon, leg.lat, leg.lon);
    const avgSpeedKts = Math.max(40, (startSpd + targetSpd) / 2);
    // Real-Time 1:1 Physics Engine (1 real second = 1 simulation second)
    // Time (seconds) = (legDistNm / avgSpeedKts) * 3600
    const SIM_SPEED_MULT = 1.0;
    const legDurationSec = Math.max(0.1, (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT));
    const stepIntervalMs = 50;
    const totalSteps = Math.max(2, Math.round((legDurationSec * 1000) / stepIntervalMs));
    let step = 0;

    ac._approachInterval = setInterval(() => {
      if (ac._tacticalVector !== undefined && ac._tacticalVector !== null) {
        // TACTICAL RADAR VECTORING: Fly along assigned heading vector!
        const spd = (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) ? ac._assignedSpeed : ac.groundSpeed;
        ac.heading = ac._tacticalVector;
        ac.groundSpeed = spd;
        // Distance traveled in 50ms (0.05s) at speed kts:
        const distNmStep = (spd / 3600.0) * (stepIntervalMs / 1000.0);
        const radHdg = (ac.heading * Math.PI) / 180.0;
        // 1 deg lat = 60 NM; 1 deg lon = 60 * cos(lat) NM
        ac.lat += (distNmStep * Math.cos(radHdg)) / 60.0;
        ac.lon += (distNmStep * Math.sin(radHdg)) / (60.0 * Math.cos(ac.lat * Math.PI / 180.0));
      } else {
        step++;
        const prog = step / totalSteps;
        ac.lat = startLat + (leg.lat - startLat) * prog;
        ac.lon = startLon + (leg.lon - startLon) * prog;
        ac.altitude = Math.round(startAlt + (targetAlt - startAlt) * prog);
        ac.groundSpeed = Math.round(startSpd + (targetSpd - startSpd) * prog);

        const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
        ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

        if (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) {
          ac.groundSpeed = ac._assignedSpeed;
        }

        if (step >= totalSteps) {
          clearInterval(ac._approachInterval);
          ac._approachInterval = null;
          ac.lat = leg.lat;
          ac.lon = leg.lon;
          ac.heading = targetHdg;
          ptIdx++;
          moveNextArrivalLeg();
          return;
        }
      }

      renderAllScreens();
    }, stepIntervalMs);
  }

  moveNextArrivalLeg();
}

function executeTaxiInMovement(ac) {
  if (ac._taxiInInterval) return;

  const rwyKey = ac.clearedRwy || "25R";
  const taxiInData = (airportData && airportData.taxi_in_routes && airportData.taxi_in_routes[rwyKey])
    ? airportData.taxi_in_routes[rwyKey]
    : null;

  // Resolve target gate stand
  let targetGate = null;
  if (ac.assignedGate && airportData && airportData.gates) {
    targetGate = airportData.gates.find(g => g.ref === ac.assignedGate);
  }
  if (!targetGate && typeof assignRealisticGate === "function") {
    targetGate = assignRealisticGate(ac.airline, ac.callsign);
    ac.assignedGate = targetGate.ref;
    ac.assignedGateCoord = [targetGate.lat, targetGate.lon];
  }

  // Calculate dynamic authentic taxiway path via Dijkstra to target gate
  let taxiInPoints = null;
  if (targetGate && typeof findTaxiwayPath === "function") {
    const calculated = findTaxiwayPath(ac.lat, ac.lon, targetGate.lat, targetGate.lon);
    if (calculated && calculated.length > 3) {
      taxiInPoints = calculated.map(p => ({ lat: p[0], lon: p[1] }));
    }
  }

  // Fallback to static verified taxi_in_routes if needed
  if (!taxiInPoints) {
    taxiInPoints = (taxiInData && taxiInData.coords)
      ? taxiInData.coords.map(p => ({ lat: p[0], lon: p[1] }))
      : [
          { lat: ac.lat, lon: ac.lon },
          { lat: -6.118502, lon: 106.652425 },
          { lat: -6.121013, lon: 106.650012 },
          { lat: -6.121480, lon: 106.650280 },
          { lat: -6.121757, lon: 106.651077 }
        ];
  }

  let nodeIdx = 0;
  ac.groundSpeed = 15;

  function moveNextTaxiInNode() {
    if (nodeIdx >= taxiInPoints.length) {
      if (ac._taxiInInterval) {
        clearInterval(ac._taxiInInterval);
        ac._taxiInInterval = null;
      }
      ac.state = "PARKED";
      ac.groundSpeed = 0;
      ac.altitude = 0;
      ac.hasCheckedIn = false;
      const gateStr = ac.assignedGate ? `Gate ${ac.assignedGate}` : "Gate Echo 1";
      const termStr = (targetGate && targetGate.terminal) ? `(${targetGate.terminal})` : "";
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, parked at ${gateStr} ${termStr}, engines shutdown, good day.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);

      // After 5s, mark as parked-turnaround (hide from flight strips to avoid clutter)
      // and schedule turnaround to reappear as outbound departure after turnaround duration!
      setTimeout(() => {
        if (ac.state === "PARKED") {
          ac.isArchivedParked = true;
          renderFlightStrips();
          scheduleTurnaroundOutbound(ac, 30000); // 30s turnaround
        }
      }, 5000);
      return;
    }

    const targetNode = taxiInPoints[nodeIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const dLat = targetNode.lat - startLat;
    const dLon = targetNode.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // Realistic taxi speed: straight 15 kts, turns 8 kts, stand entry 5 kts
    const hdgDiff = Math.abs((targetHdg - ac.heading + 540) % 360 - 180);
    let targetSpd = hdgDiff > 25 ? 8 : 15;
    if (nodeIdx >= taxiInPoints.length - 3) {
      targetSpd = 5;
    }
    ac.groundSpeed = targetSpd;

    // Use consistent step timing identical to departure taxiway movement
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(12, Math.round(distDeg * 120000));
    let step = 0;

    ac._taxiInInterval = setInterval(() => {
      // Ground collision prevention: if another aircraft is in front, hold brakes!
      if (checkGroundConflictAhead(ac, targetNode.lat, targetNode.lon)) {
        ac.groundSpeed = 0;
        ac.isHoldingForTraffic = true;
        renderAllScreens();
        return; // hold position until path is clear
      }
      ac.isHoldingForTraffic = false;
      ac.groundSpeed = targetSpd;

      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetNode.lat - startLat) * prog;
      ac.lon = startLon + (targetNode.lon - startLon) * prog;

      // Smooth heading turn
      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.15 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._taxiInInterval);
        ac._taxiInInterval = null;
        ac.lat = targetNode.lat;
        ac.lon = targetNode.lon;
        ac.heading = targetHdg;
        nodeIdx++;
        moveNextTaxiInNode();
      }
    }, 75);
  }

  moveNextTaxiInNode();
}

// Push to talk event bindings
function bindPTT() {
  const pttBtn = document.getElementById('ptt-btn');
  const acadMicBtn = document.getElementById('academy-mic-btn');

  const addListeners = (el) => {
    if (!el) return;
    el.addEventListener('mousedown', (e) => { e.preventDefault(); startRecording(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); stopRecording(); });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startRecording(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); stopRecording(); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); e.stopPropagation(); stopRecording(); }, { passive: false });
  };

  addListeners(pttBtn);
  addListeners(acadMicBtn);

  // Global Keydown for Spacebar PTT
  let isSpaceHeld = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && currentTab === 'radar') {
      e.preventDefault();
      cyclePrompterAircraft();
      return;
    }

    if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      if (e.repeat || isSpaceHeld) return; // Ignore continuous OS key repeat
      isSpaceHeld = true;
      if (!isRecording) {
        startRecording();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      isSpaceHeld = false;
      if (isRecording) {
        stopRecording();
      }
    }
  });

  // Guard against focus loss while holding space
  window.addEventListener('blur', () => {
    if (isSpaceHeld || isRecording) {
      isSpaceHeld = false;
      stopRecording();
    }
  });
}

function setControllerRole(newRole) {
  controllerRole = newRole;
  console.log(`[ATC ROLE] Active controller role switched to: ${controllerRole}`);

  const roles = ['all', 'gnd', 'twr', 'app', 'spectator'];
  roles.forEach(r => {
    const btn = document.getElementById(`role-${r}-btn`);
    if (!btn) return;
    if (r.toUpperCase() === newRole) {
      if (r === 'spectator') {
        btn.className = "px-2 py-0.5 rounded text-[11px] font-bold transition bg-purple-700 text-white shadow-lg ring-1 ring-purple-400";
      } else {
        btn.className = "px-2 py-0.5 rounded text-[11px] font-semibold transition bg-emerald-700 text-white shadow-md";
      }
    } else {
      if (r === 'spectator') {
        btn.className = "px-2 py-0.5 rounded text-[11px] font-bold transition text-purple-300 hover:text-white hover:bg-purple-900/60";
      } else {
        btn.className = "px-2 py-0.5 rounded text-[11px] font-semibold transition text-slate-400 hover:text-white";
      }
    }
  });

  updateActiveFrequencyUI();

  // If Spectator mode, auto-cycle aircraft or declutter Easy Mode
  const prompter = document.getElementById('easy-mode-prompter');
  if (controllerRole === 'SPECTATOR') {
    if (prompter) prompter.classList.add('opacity-40');
    // Clear any pending busy flags so AI starts acting immediately on current aircraft states
    aircraft.forEach(ac => {
      ac._aiClearanceBusy = false;
      ac._aiPushIssued = false;
      ac._aiTaxiIssued = false;
      ac._aiCrossIssued = false;
      ac._aiLineupIssued = false;
      ac._aiTakeoffIssued = false;
      ac._aiAppHandoffIssued = false;
      ac._aiCenterHandoffIssued = false;
      ac._aiIlsIssued = false;
      ac._aiLandIssued = false;
      ac._aiVacateIssued = false;
      ac._aiTaxiInStandIssued = false;
    });
  } else {
    if (prompter) prompter.classList.remove('opacity-40');
  }

  // Trigger immediate tick check
  runAiCoControllerCycle();
}

function getStripBayCategory(state) {
  if (['GATE', 'PUSHBACK', 'READY_TAXI', 'TAXI', 'HOLD_SHORT_CROSS', 'TAXI_IN', 'PARKED'].includes(state)) {
    return 'DEP';
  } else if (['HOLDING', 'LINE_UP', 'LINING_UP', 'TAKEOFF', 'FINAL', 'LANDED'].includes(state)) {
    return 'TWR';
  } else if (['AIRBORNE', 'CLIMBING', 'APPROACH', 'HANDOFF', 'HANDED_OFF'].includes(state)) {
    return 'APP';
  }
  return 'DEP';
}

function updateActiveFrequencyUI() {
  const lbl = document.getElementById('active-freq-label');
  const tag = document.getElementById('active-sector-tag');
  if (!lbl || !tag) return;

  if (controllerRole === 'SPECTATOR') {
    lbl.textContent = "AI AUTO FREQ";
    tag.textContent = "AUTO";
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-purple-900/80 text-purple-200 font-mono";
  } else if (controllerRole === 'GND') {
    lbl.textContent = FREQUENCIES.GND;
    tag.textContent = "GND";
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-blue-900/80 text-blue-200 font-mono";
  } else if (controllerRole === 'TWR') {
    lbl.textContent = FREQUENCIES.TWR;
    tag.textContent = "TWR";
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-emerald-900/80 text-emerald-200 font-mono";
  } else if (controllerRole === 'APP') {
    lbl.textContent = FREQUENCIES.APP;
    tag.textContent = "APP";
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-sky-900/80 text-sky-200 font-mono";
  } else {
    // ALL
    const selAc = aircraft[selectedAircraftIndex] || aircraft[0];
    const cat = selAc ? getStripBayCategory(selAc.state) : "GND";
    const freq = FREQUENCIES[cat] || FREQUENCIES.GND;
    lbl.textContent = freq;
    tag.textContent = cat;
    tag.className = `ml-1.5 text-[9px] px-1 py-0.2 rounded ${cat === 'DEP' || cat === 'GND' ? 'bg-blue-900/80 text-blue-200' : (cat === 'TWR' ? 'bg-emerald-900/80 text-emerald-200' : 'bg-sky-900/80 text-sky-200')} font-mono`;
  }
}

// Check if a specific runway is currently occupied by any aircraft (lineup, takeoff, rollout, or crossing)
function isRunwayPhysicallyOccupied(rwyKey, excludeAcId = null) {
  for (const ac of aircraft) {
    if (ac.id === excludeAcId) continue;
    if (ac.clearedRwy !== rwyKey) continue;
    // States that physically occupy the runway strip
    if (["LINE_UP", "LINING_UP", "TAKEOFF", "FINAL", "LANDED"].includes(ac.state)) {
      return true;
    }
  }
  return false;
}

// Autonomous AI Co-Controller Cycle (Runs every 1.5 seconds)
function runAiCoControllerCycle() {
  if (aircraft.length === 0) return;

  aircraft.forEach((ac, idx) => {
    const bayCat = getStripBayCategory(ac.state); // 'DEP', 'TWR', 'APP'
    
    // Determine if this aircraft's sector should be handled by AI Co-Controller
    let isAiControlled = false;
    if (controllerRole === 'SPECTATOR') {
      isAiControlled = true;
    } else if (controllerRole === 'GND') {
      // User controls Ground; AI controls Tower and Approach
      if (bayCat === 'TWR' || bayCat === 'APP') isAiControlled = true;
    } else if (controllerRole === 'TWR') {
      // User controls Tower; AI controls Ground (DEP) and Approach
      if (bayCat === 'DEP' || bayCat === 'APP') isAiControlled = true;
    } else if (controllerRole === 'APP') {
      // User controls Approach; AI controls Ground and Tower
      if (bayCat === 'DEP' || bayCat === 'TWR') isAiControlled = true;
    }

    if (!isAiControlled) return;

    // AI Safety Guard & State Machine Dispatch
    handleAiAutonomousDispatch(ac, idx);
  });
}

  // AI Controller Clearance Transmission Helper
  function transmitAiClearance(ac, atcText, readbackText, executeCallback) {
    const recEl = document.getElementById('recognized-text');
    if (recEl) recEl.textContent = `[AI ATC]: "${atcText}"`;

    // Realistic human ATC reaction delay before flight action starts (1.5 - 2.5s)
    setTimeout(() => {
      if (executeCallback) executeCallback();
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();
    }, 1500);

    // Enqueue ATC Controller Voice & Readback without blocking future clearances
    enqueueRadioTransmission({
      type: "AI_ATC",
      callsign: "JAKARTA ATC",
      text: atcText,
      onStart: () => {
        isRadioTransmitting = true;
        const pttStatus = document.getElementById('ptt-status');
        if (pttStatus) {
          pttStatus.innerHTML = `<span class="text-purple-400 font-bold">AI ATC TRANSMITTING:</span> ${atcText}`;
          pttStatus.className = "text-xs font-radar text-purple-300 mb-1.5 px-3 py-1 bg-purple-950/90 rounded border border-purple-800 transition-all shadow";
        }
      },
      onEnd: () => {
        isRadioTransmitting = false;
        const pttStatus = document.getElementById('ptt-status');
        if (pttStatus) {
          pttStatus.innerHTML = `Press & Hold <span class="text-emerald-400 font-bold">SPACEBAR</span> or Mic to Transmit`;
          pttStatus.className = "text-xs font-radar text-slate-400 mb-1.5 px-3 py-1 bg-slate-900/90 rounded border border-slate-800 transition-all shadow";
        }

        // Enqueue Pilot Readback
        enqueueRadioTransmission({
          type: "READBACK",
          callsign: ac.callsign,
          text: readbackText,
          onStart: () => {
            isRadioTransmitting = true;
          },
          onEnd: () => {
            isRadioTransmitting = false;
            renderFlightStrips();
            updateEasyModePrompter();
            renderAllScreens();
            setTimeout(runAiCoControllerCycle, 200);
          }
        });
      }
    });
  }

function handleAiAutonomousDispatch(ac, idx) {
  const rwyKey = ac.clearedRwy || "25R";
  const sidKey = ac.clearedSid || "DOLTA 1C";
  const mech = airportData && airportData.runway_mechanisms ? airportData.runway_mechanisms[rwyKey] : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N1";

  // AI GATE: Execute pushback with A-CDM Slot Sequencing & Concourse Protection
  if (ac.state === "GATE" && !ac._aiPushIssued) {
    // 1. Assign realistic Scheduled Pushback Time (TSAT / EOBT) upon arriving at gate if not set
    const now = Date.now();
    if (!ac._scheduledPushTime) {
      // In Spectator / AI mode: staggered departure schedule (each departure waits 15-45s after gate readiness)
      // Count other departures currently parked or preparing
      const gateIndex = aircraft.filter(a => a.state === "GATE" && a.id !== ac.id).length;
      ac._scheduledPushTime = now + (10000 + gateIndex * 20000); // Stagger by 20 seconds between departures
      return;
    }

    // Wait until scheduled pushback time arrives (mimics ATC departure slot / pilot pushback request)
    if (now < ac._scheduledPushTime) {
      return;
    }

    // 2. Concourse & Apron Alleyway Mutual Exclusion Check
    const getGateConcourse = (gRef) => {
      if (!gRef) return "T2E";
      const c = gRef[0].toUpperCase();
      if (["A","B","C","D","E","F"].includes(c)) return c;
      return "T3";
    };

    const myConcourse = getGateConcourse(ac.assignedGate);
    const isAlleywayBusy = aircraft.some(other => {
      if (other.id === ac.id) return false;
      const otherConcourse = getGateConcourse(other.assignedGate);
      if (otherConcourse === myConcourse) {
        if (other.state === "PUSHBACK" || (other.state === "READY_TAXI" && !other._runwayCrossCleared)) {
          return true;
        }
      }
      if (ac.lat && ac.lon && other.lat && other.lon && other.groundSpeed > 0) {
        const d = calculateDistanceMeters(ac.lat, ac.lon, other.lat, other.lon);
        if (d < 140) return true;
      }
      return false;
    });

    if (isAlleywayBusy) {
      // Defer pushback approval until the cul-de-sac / alleyway is clear of conflicting pushback traffic
      return;
    }

    ac._aiPushIssued = true;
    transmitAiClearance(
      ac,
      `${ac.callsign}, push and start approved, facing west.`,
      `Push and start approved, facing west, ${ac.callsign}.`,
      () => {
        ac.state = "PUSHBACK";
        executePushbackMovement(ac);
      }
    );
    return;
  }

  // AI READY_TAXI: Issue taxi clearance to holding point immediately
  if (ac.state === "READY_TAXI" && !ac._aiTaxiIssued) {
    ac._aiTaxiIssued = true;
    const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(ac) : null;
    const taxiRouteSpoken = (autoTaxi && autoTaxi.text) ? autoTaxi.text : hpName;
    transmitAiClearance(
      ac,
      `${ac.callsign}, taxi to holding point runway ${rwyKey} via ${taxiRouteSpoken}.`,
      `Taxi to holding point runway ${rwyKey} via ${taxiRouteSpoken}, ${ac.callsign}.`,
      () => {
        ac.state = "TAXI";
        ac._runwayCrossCleared = false;
        executeTaxiMovement(ac);
      }
    );
    return;
  }

  // AI HOLD_SHORT_CROSS: Verify runway clear, then grant cross clearance
  if (ac.state === "HOLD_SHORT_CROSS" && !ac._aiCrossIssued) {
    const northRwy = (rwyKey === "07R" || rwyKey === "07L") ? "07L" : "25R";
    if (!isRunwayPhysicallyOccupied(northRwy, ac.id)) {
      ac._aiCrossIssued = true;
      transmitAiClearance(
        ac,
        `${ac.callsign}, cross runway ${northRwy} at November cross, report vacated.`,
        `Cross runway ${northRwy} at November cross, ${ac.callsign}.`,
        () => {
          ac.state = "TAXI";
          ac._runwayCrossCleared = true;
          executeTaxiMovement(ac);
        }
      );
      return;
    }
  }

  // AI HOLDING POINT (Tower Sector): Issue Line-Up & Wait if runway clear
  if (ac.state === "HOLDING" && !ac._aiLineupIssued) {
    if (!isRunwayPhysicallyOccupied(rwyKey, ac.id)) {
      ac._aiLineupIssued = true;
      transmitAiClearance(
        ac,
        `${ac.callsign}, line up and wait runway ${rwyKey}.`,
        `Line up and wait runway ${rwyKey}, ${ac.callsign}.`,
        () => {
          ac.state = "LINE_UP";
          executeLineUpMovement(ac);
        }
      );
      return;
    }
  }

  // AI LINE_UP / LINING_UP (Tower Sector): Issue Takeoff Clearance if runway clear
  if ((ac.state === "LINE_UP" || ac.state === "LINING_UP") && !ac._aiTakeoffIssued) {
    if (!isRunwayPhysicallyOccupied(rwyKey, ac.id)) {
      ac._aiTakeoffIssued = true;
      transmitAiClearance(
        ac,
        `${ac.callsign}, wind 250 at 8 knots, runway ${rwyKey} cleared for takeoff.`,
        `Runway ${rwyKey} cleared for takeoff, ${ac.callsign}.`,
        () => {
          if (ac.state === "LINING_UP") {
            ac.takeoffQueued = true;
          } else {
            ac.state = "TAKEOFF";
            executeTakeoffMovement(ac);
          }
        }
      );
      return;
    }
  }

  // AI AIRBORNE: Handover to Jakarta Approach
  if (ac.state === "AIRBORNE" && !ac._aiAppHandoffIssued) {
    ac._aiAppHandoffIssued = true;
    setTimeout(() => {
      if (ac.state !== "AIRBORNE") return;
      transmitAiClearance(
        ac,
        `${ac.callsign}, contact Jakarta Approach 119 decimal 75, good day.`,
        `Contact Jakarta Approach 119 decimal 75, ${ac.callsign}.`,
        () => {
          ac.state = "CLIMBING";
          if (!ac.fde) ac.fde = {};
          ac.fde.assignedAlt = "FL140";
          executeClimbEnroute(ac);
        }
      );
    }, 3000);
  }

  // AI CLIMBING: Handover to Jakarta Center
  if (ac.state === "CLIMBING" && !ac._aiCenterHandoffIssued && ac.altitude >= 6000) {
    ac._aiCenterHandoffIssued = true;
    setTimeout(() => {
      if (ac.state !== "CLIMBING") return;
      transmitAiClearance(
        ac,
        `${ac.callsign}, contact Jakarta Center 128 decimal 5, good day.`,
        `Contact Jakarta Center 128 decimal 5, ${ac.callsign}.`,
        () => {
          ac.state = "HANDED_OFF";
          if (!ac.fde) ac.fde = {};
          ac.fde.assignedAlt = "FL240";
          executeHandoffComplete(ac);
        }
      );
    }, 2000);
  }

  // AI APPROACH (Arrivals): Clear ILS approach
  if (ac.state === "APPROACH" && !ac._aiIlsIssued) {
    ac._aiIlsIssued = true;
    setTimeout(() => {
      if (ac.state !== "APPROACH") return;
      transmitAiClearance(
        ac,
        `${ac.callsign}, descend and maintain 3000 feet, cleared ILS runway ${rwyKey}.`,
        `Descend and maintain 3000 feet, cleared ILS runway ${rwyKey}, ${ac.callsign}.`,
        () => {
          if (!ac.fde) ac.fde = {};
          ac.fde.assignedAlt = "A030";
        }
      );
    }, 2500);
  }

  // AI FINAL (Arrivals): Clear to land when runway clear
  if (ac.state === "FINAL" && !ac._aiLandIssued) {
    if (!isRunwayPhysicallyOccupied(rwyKey, ac.id)) {
      ac._aiLandIssued = true;
      setTimeout(() => {
        if (ac.state !== "FINAL") return;
        transmitAiClearance(
          ac,
          `${ac.callsign}, wind 250 at 8 knots, runway ${rwyKey} cleared to land.`,
          `Runway ${rwyKey} cleared to land, ${ac.callsign}.`,
          () => {
            if (!ac.fde) ac.fde = {};
            ac.fde.assignedAlt = "GND";
          }
        );
      }, 1500);
    }
  }

  // AI LANDED (Vacating): Handover to Ground Control with auto-suggested rapid exit & route
  if (ac.state === "LANDED" && !ac._aiVacateIssued) {
    ac._aiVacateIssued = true;
    setTimeout(() => {
      if (ac.state !== "LANDED") return;
      const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(ac) : null;
      const exitSpoken = (autoTaxi && autoTaxi.exitSpoken) ? autoTaxi.exitSpoken : "November five";
      const gateSpoken = (typeof formatTaxiwayPhonetic === "function") ? formatTaxiwayPhonetic(ac.assignedGate || "E1") : (ac.assignedGate || "Echo one");
      const routeSpoken = (autoTaxi && autoTaxi.text) ? autoTaxi.text : "November Charlie";
      transmitAiClearance(
        ac,
        `${ac.callsign}, vacate via ${exitSpoken}, taxi to Gate ${gateSpoken} via ${routeSpoken}.`,
        `Vacating via ${exitSpoken}, taxi to Gate ${gateSpoken} via ${routeSpoken}, ${ac.callsign}.`,
        () => {
          ac.state = "TAXI_IN";
          executeTaxiInMovement(ac);
        }
      );
    }, 2000);
  }

  // AI TAXI_IN (Ground): Taxi to gate stand
  if (ac.state === "TAXI_IN" && !ac._aiTaxiInStandIssued) {
    ac._aiTaxiInStandIssued = true;
    setTimeout(() => {
      if (ac.state !== "TAXI_IN") return;
      const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(ac) : null;
      const gateSpoken = (typeof formatTaxiwayPhonetic === "function") ? formatTaxiwayPhonetic(ac.assignedGate || "E1") : (ac.assignedGate || "Echo one");
      const routeSpoken = (autoTaxi && autoTaxi.text) ? autoTaxi.text : "November Charlie";
      transmitAiClearance(
        ac,
        `${ac.callsign}, taxi to Gate ${gateSpoken} via ${routeSpoken}.`,
        `Taxi to Gate ${gateSpoken} via ${routeSpoken}, ${ac.callsign}.`,
        () => {
          executeTaxiInMovement(ac);
        }
      );
    }, 1500);
  }

  // AI PARKED: Shutdown approved
  if (ac.state === "PARKED" && !ac._aiShutdownIssued) {
    ac._aiShutdownIssued = true;
    setTimeout(() => {
      if (ac.state !== "PARKED") return;
      transmitAiClearance(
        ac,
        `${ac.callsign}, shutdown approved, have a good day.`,
        `Shutdown approved, good day, ${ac.callsign}.`,
        () => {
          console.log(`[AI ATC] Flight cycle complete for ${ac.id}`);
        }
      );
    }, 2000);
  }
}

// Start Background AI Co-Controller Evaluation Loop (Every 1.5s)
setInterval(() => {
  runAiCoControllerCycle();
}, 1500);

// Clock UTC
setInterval(() => {
  const now = new Date();
  const utc = now.toUTCString().split(' ')[4];
  const clock = document.getElementById('utc-clock');
  if (clock) clock.textContent = `${utc} UTC`;
}, 1000);

// Init
window.addEventListener('DOMContentLoaded', async () => {
  bindPTT();
  setupCanvasInteraction(groundCanvas, 'ground');
  setupCanvasInteraction(tmaCanvas, 'tma');
  window.addEventListener('resize', resizeCanvases);
  
  try {
    const res = await fetch('/api/airport/wiii');
    airportData = await res.json();
  } catch (e) {
    console.error(e);
  }

  const isMobile = window.innerWidth < 768;
  const initialLayout = isMobile ? 'ground' : 'split';
  setLayout(initialLayout);
  renderFlightStrips();
  updateEasyModePrompter();
  if (!isMobile) {
    setupRecording().catch(err => console.log("Desktop mic auto-init deferred"));
  }

  // Pilot initiates check-in transmission after 2 seconds!
  setTimeout(() => {
    if (aircraft.length > 0) {
      triggerPilotCheckIn(aircraft[0]);
    }
  }, 2000);
});
