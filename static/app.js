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

// Milestone 3: Controller Role & Multi-Frequency Delegation
// Roles: 'ALL' (Manual omni-controller), 'GND' (Ground only), 'TWR' (Tower only), 'APP' (Approach only), 'SPECTATOR' (Full AI Spectator)
let controllerRole = 'ALL';
const FREQUENCIES = {
  GND: "121.600 MHz",
  TWR: "118.200 MHz",
  APP: "119.750 MHz",
  SPECTATOR: "AUTO FREQ"
};

// Global Radio Audio Queue & Mutex (FIFO queue to prevent pilot voice overlaps)
const radioTransmissionQueue = [];
let isRadioProcessing = false;

// Trigger pilot check-in transmission (Queued & non-overlapping)
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
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";

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

function getDynamicEasyModePrompt(ac) {
  if (!ac) return { context: "Tidak ada pesawat.", speech: "Standby", actionDesc: "Standby" };

  const cs = ac.callsign || ac.id;
  const rwyKey = ac.clearedRwy || "25R";
  const sidKey = ac.clearedSid || "DOLTA 1C";
  const starKey = ac.clearedStar || "DOLTA 1A";
  const mech = (airportData && airportData.runway_mechanisms) ? airportData.runway_mechanisms[rwyKey] : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";
  const exitTwy = mech && mech.exit_taxiways && mech.exit_taxiways.length > 0 ? mech.exit_taxiways[0].name : "November 4";

  switch (ac.state) {
    case "GATE":
      return {
        context: `Pesawat parkir di Gate, siap pushback dan engine start untuk Runway ${rwyKey} via ${sidKey}.`,
        speech: `${cs} push and start approved, facing west`,
        actionDesc: "Pushback & Start Approved"
      };
    case "PUSHBACK":
      return {
        context: `Pesawat sedang pushback mandiri menuju taxiway...`,
        speech: `Standby for taxi request, ${cs}`,
        actionDesc: "Pushback in progress"
      };
    case "READY_TAXI":
      return {
        context: `Pesawat selesai pushback, pilot check-in meminta clearance taxi menuju Runway ${rwyKey}.`,
        speech: `${cs} taxi to holding point runway ${rwyKey} via ${hpName}`,
        actionDesc: `Taxi to Holding Point ${rwyKey}`
      };
    case "HOLD_SHORT_CROSS":
      return {
        context: `Pesawat berhenti di Stop Bar sebelum menyeberangi runway aktif! Wajib berikan izin cross runway.`,
        speech: `${cs} cross runway 25R at November cross, report vacated`,
        actionDesc: "Cross Runway Clearance"
      };
    case "TAXI":
      return {
        context: `Pesawat sedang taxi menyusuri taxiway menuju holding point Runway ${rwyKey} (${hpName})...`,
        speech: `Standby at holding point, ${cs}`,
        actionDesc: "Taxiing"
      };
    case "HOLDING":
      return {
        context: `Pesawat berhenti di Holding Point ${hpName} Runway ${rwyKey}, runway siap digunakan.`,
        speech: `${cs} line up and wait runway ${rwyKey}`,
        actionDesc: `Line up and wait Runway ${rwyKey}`
      };
    case "LINE_UP":
    case "LINING_UP":
      return {
        context: `Pesawat di posisi Runway ${rwyKey} via ${sidKey} siap lepas landas. Angin 250 derajat 8 knot.`,
        speech: `${cs} wind 250 at 8 knots, runway ${rwyKey} cleared for takeoff`,
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
        speech: `${cs} descend and maintain 3000 feet, cleared ILS approach runway ${rwyKey}`,
        actionDesc: `Cleared ILS RWY ${rwyKey} (${starKey})`
      };
    case "FINAL":
      return {
        context: `Pesawat established di final approach 5 NM siap mendarat di Runway ${rwyKey}.`,
        speech: `${cs} wind 250 at 8 knots, runway ${rwyKey} cleared to land`,
        actionDesc: `Cleared to Land RWY ${rwyKey}`
      };
    case "LANDED":
      return {
        context: `Pesawat telah mendarat di Runway ${rwyKey}. Berikan izin keluar runway via ${exitTwy} ke Ground.`,
        speech: `${cs} vacate runway via ${exitTwy}, contact Ground 121 decimal 6`,
        actionDesc: `Vacate RWY via ${exitTwy}`
      };
    case "TAXI_IN":
      return {
        context: `Pesawat sedang taxi masuk (taxi in) dari Runway ${rwyKey} menuju gate stand.`,
        speech: `${cs} taxi to Gate Echo 1 via November Charlie`,
        actionDesc: "Taxi to Gate"
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

function updateEasyModePrompter() {
  const prompter = document.getElementById('easy-mode-prompter');
  if (!prompter) return;

  if (!isEasyMode || currentTab !== 'radar') {
    prompter.classList.add('hidden');
    return;
  }
  prompter.classList.remove('hidden');

  if (aircraft.length === 0) return;
  const ac = aircraft[selectedAircraftIndex % aircraft.length];
  const info = getDynamicEasyModePrompt(ac);

  document.getElementById('prompt-ac-badge').textContent = `${ac.id} (${ac.state}) • RWY ${ac.clearedRwy || '25R'}`;
  document.getElementById('prompt-context').textContent = `Skenario: ${info.context}`;
  document.getElementById('prompt-speech-text').textContent = `"${info.speech}"`;
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

      audioChunks = [];
      await sendAudioToWhisper(audioBlob, ext);
    };

    updateMicStatusWarning(null);
  } catch (err) {
    console.warn("Microphone access error:", err);
    updateMicStatusWarning("Mic permission denied or not found");
    alert("Detail error microphone: " + (err.name || err.message || err));
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
  if (isRecording) return;
  const pttStatus = document.getElementById('ptt-status');

  if (!mediaRecorder) {
    if (pttStatus) pttStatus.innerHTML = `<span class="text-amber-400 font-bold">MENGHUBUNGKAN MIC...</span>`;
    try {
      await setupRecording();
    } catch (e) {
      console.error("Mic setup failed:", e);
      if (pttStatus) pttStatus.innerHTML = `<span class="text-red-400 font-bold">GAGAL AKSES MIC (${e.name || e.message})</span>`;
      return;
    }
  }

  if (!mediaRecorder) {
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-amber-400 font-bold">KLIK TOMBOL MIC DI BAWAH DULU UNTUK IZIN MIC!</span>`;
    }
    return;
  }

  try {
    isRecording = true;
    audioChunks = [];
    mediaRecorder.start();
    playRadioChirp();

    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.textContent = "TRANSMITTING ON 118.10 MHz...";
      pttStatus.className = "text-xs font-radar mb-1.5 px-3 py-1 rounded border transition-all bg-red-950 text-red-400 border-red-700 animate-pulse";
    }
    const acadRecStatus = document.getElementById('academy-rec-status');
    if (acadRecStatus) acadRecStatus.textContent = "Merekam suara... Lepas SPACEBAR untuk kirim.";
  } catch (e) {
    console.error("Start recording failed:", e);
    isRecording = false;
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  try {
    mediaRecorder.stop();
    playRadioChirp();

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
        document.getElementById('recognized-text').textContent = `"${res.text}"`;
        document.getElementById('ptt-status').textContent = `Transmitted (${res.duration}s)`;
        handleRadarVoiceCommand(res.text, res.parsed);
      } else {
        handleAcademyResult(res);
      }
    } else {
      document.getElementById('ptt-status').textContent = `Error: ${res.error || 'STT failed'}`;
    }
  } catch (e) {
    console.error("Transcribe error:", e);
    document.getElementById('ptt-status').textContent = "Voice Error / Check Server";
  }
}

// Multi-Screen Layout Switcher
function setLayout(mode) {
  currentLayout = mode;
  const container = document.getElementById('screens-container');
  const paneGround = document.getElementById('pane-ground');
  const paneTma = document.getElementById('pane-tma');

  const btnSplit = document.getElementById('view-split-btn');
  const btnGround = document.getElementById('view-ground-btn');
  const btnTma = document.getElementById('view-tma-btn');

  [btnSplit, btnGround, btnTma].forEach(b => {
    b.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition text-slate-400 hover:text-white";
  });

  if (mode === 'split') {
    container.className = "flex-1 grid grid-cols-2 gap-1 bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "";
    paneTma.style.display = "";
    paneGround.classList.remove('hidden');
    paneTma.classList.remove('hidden');
    paneGround.classList.remove('col-span-2');
    paneTma.classList.remove('col-span-2');
    btnSplit.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'ground') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "flex";
    paneTma.style.display = "none";
    paneGround.classList.remove('hidden');
    paneTma.classList.add('hidden');
    paneGround.classList.add('w-full', 'h-full');
    btnGround.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'tma') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "none";
    paneTma.style.display = "flex";
    paneGround.classList.add('hidden');
    paneTma.classList.remove('hidden');
    paneTma.classList.add('w-full', 'h-full');
    btnTma.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
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
    if (tw.ref && tw.coords.length >= 2 && st.zoom > 0.85) {
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

  // 4d. Runway Crossing Stop Bar Indicator (Visible if route crosses North Runway)
  if (selAc && (selAc.clearedRwy === "25L" || selAc.clearedRwy === "07R")) {
    const crossPt = latLonToScreenCoord(-6.1220515, 106.6481632, st);
    ctx.beginPath();
    ctx.arc(crossPt.x, crossPt.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = selAc.state === "HOLD_SHORT_CROSS" ? "rgba(239, 68, 68, 0.85)" : "rgba(245, 158, 11, 0.75)";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = "bold 10px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#fef08a";
    ctx.fillText("STOP BAR: CROSS 25R/07L", crossPt.x + 12, crossPt.y + 3);
  }

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
      ctx.fillText(`HOLD ${hpName}`, p.x + 5, p.y + 3);
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
    const dynRoute = (airportData && airportData.taxi_routes_by_runway && airportData.taxi_routes_by_runway[activeRwyKey])
      ? airportData.taxi_routes_by_runway[activeRwyKey]
      : null;
    if (dynRoute && dynRoute.coords && dynRoute.coords.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
      ctx.lineWidth = Math.max(2.5, 1.8 * st.zoom);
      ctx.setLineDash([6, 6]);
      const r0 = latLonToScreenCoord(dynRoute.coords[0][0], dynRoute.coords[0][1], st);
      ctx.moveTo(r0.x, r0.y);
      for (let i = 1; i < dynRoute.coords.length; i++) {
        const rp = latLonToScreenCoord(dynRoute.coords[i][0], dynRoute.coords[i][1], st);
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

  // Get selected aircraft cleared SID and STAR to highlight active tactical route
  const selAc = (selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length)
    ? aircraft[selectedAircraftIndex]
    : null;
  const activeSidId = selAc ? selAc.clearedSid : null;
  const activeStarId = selAc ? selAc.clearedStar : null;

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

    // SID Label
    const midIdx = Math.floor(sid.coords.length / 2);
    const pm = latLonToScreenCoord(sid.coords[midIdx][0], sid.coords[midIdx][1], st);
    ctx.font = isActive ? "bold 11px 'Share Tech Mono'" : "9px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#fbbf24" : "rgba(245, 158, 11, 0.4)";
    ctx.fillText(`${isActive ? '★ [ACTIVE SID] ' : '[SID] '}${sid.id}`, pm.x - 15, pm.y - 8);
  });

  // STARs (Standard Terminal Arrival Routes) - Cyan/Blue dashed routes
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

    // STAR Label
    const midIdx = Math.floor(star.coords.length / 2);
    const pm = latLonToScreenCoord(star.coords[midIdx][0], star.coords[midIdx][1], st);
    ctx.font = isActive ? "bold 11px 'Share Tech Mono'" : "9px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#67e8f9" : "rgba(6, 182, 212, 0.4)";
    ctx.fillText(`${isActive ? '★ [ACTIVE STAR] ' : '[STAR] '}${star.id}`, pm.x + 8, pm.y + 12);
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
    const altStr = ac.altitude === 0 ? "GND" : `A${String(Math.round(ac.altitude/100)).padStart(3, '0')}`;
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
      selectAircraft(closestAcIdx);
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
  const container = document.getElementById('flight-strips');
  if (!container) return;

  const filtered = aircraft.map((ac, idx) => ({ ac, idx })).filter(item => {
    if (activeStripBayFilter === "ALL") return true;
    return getAircraftBayCategory(item.ac) === activeStripBayFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs italic">Tidak ada strip di Bay ${activeStripBayFilter}</div>`;
    document.getElementById('aircraft-count').textContent = `${aircraft.length} In Flight`;
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

    return `
      <div onclick="selectAircraft(${idx})" class="p-2.5 rounded text-xs border transition cursor-pointer select-none ${isSel ? 'bg-amber-950/50 border-amber-500 shadow-lg ring-1 ring-amber-500/80' : 'bg-slate-950 border-emerald-950/80 hover:bg-slate-900/90 hover:border-emerald-800'} ${isPending ? 'ring-1 ring-amber-400' : ''}">
        <!-- Strip Header: Callsign, Type, Bay Badge, & Ident Button -->
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1.5 ${isSel ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}">
            <span class="text-[9px] px-1 py-0.2 rounded ${bayCat === 'DEP' ? 'bg-blue-900/80 text-blue-200' : (bayCat === 'TWR' ? 'bg-emerald-900/80 text-emerald-200' : 'bg-purple-900/80 text-purple-200')} font-mono">
              ${bayCat}
            </span>
            <span class="text-sm tracking-wide font-mono">${ac.id}</span>
            <span class="text-[10px] text-slate-400 font-normal">(${ac.type})</span>
            ${isSel ? '<span class="text-[9px] px-1 bg-amber-500 text-slate-950 font-bold rounded">ACTIVE</span>' : ''}
          </div>
          <div class="flex items-center gap-1">
            <button onclick="event.stopPropagation(); triggerSquawkIdent(${idx})" class="text-[9px] px-1.5 py-0.5 rounded border transition font-bold font-mono ${isIdent ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}" title="Squawk IDENT Flash">
              ${isIdent ? '★ IDENT' : 'IDENT'}
            </button>
            <span class="text-[10px] ${isPending ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400'}">
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
        </div>

        <!-- FDE SCRATCHPAD (Flight Data Entry: CFL Altitude, Speed, Direct Fix) -->
        <div onclick="event.stopPropagation()" class="mt-1 pt-1 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[9px]">
          <div class="flex items-center gap-0.5">
            <span class="text-slate-500 font-mono">CFL:</span>
            <input type="text" placeholder="A040" value="${assignedAlt}" onchange="updateAircraftScratchpad(${idx}, 'assignedAlt', this.value)" class="w-11 bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-[9px] rounded px-1 py-0 text-center focus:outline-none focus:border-emerald-500" title="Cleared Flight Level / Altitude" />
          </div>
          <div class="flex items-center gap-0.5">
            <span class="text-slate-500 font-mono">SPD:</span>
            <input type="text" placeholder="210K" value="${assignedSpd}" onchange="updateAircraftScratchpad(${idx}, 'assignedSpd', this.value)" class="w-11 bg-slate-950 border border-slate-800 text-sky-300 font-mono text-[9px] rounded px-1 py-0 text-center focus:outline-none focus:border-sky-500" title="Assigned Airspeed" />
          </div>
          <div class="flex items-center gap-0.5">
            <span class="text-slate-500 font-mono">DIR:</span>
            <input type="text" placeholder="TOPIN" value="${directFix}" onchange="updateAircraftScratchpad(${idx}, 'directFix', this.value)" class="w-14 bg-slate-950 border border-slate-800 text-amber-200 font-mono text-[9px] rounded px-1 py-0 text-center focus:outline-none focus:border-amber-500" title="Direct-To Fix" />
          </div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('aircraft-count').textContent = `${aircraft.length} In Flight`;
}

function changeAircraftRunway(idx, newRwy) {
  const ac = aircraft[idx];
  if (!ac) return;
  const oldRwy = ac.clearedRwy;
  ac.clearedRwy = newRwy;

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
      if (ac._approachInterval) {
        clearInterval(ac._approachInterval);
        ac._approachInterval = null;
      }
      console.log(`[ATC REROUTE] Recalculating live approach path for ${ac.id} from ${oldRwy} to ${newRwy}`);
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
  ac.clearedStar = newStar;
  console.log(`[ATC ROUTE] Aircraft ${ac.id} assigned STAR ${newStar}`);

  // If currently approaching, re-route trajectory to new STAR waypoints immediately
  if (ac.state === "APPROACH" || ac.state === "FINAL") {
    if (ac._approachInterval) {
      clearInterval(ac._approachInterval);
      ac._approachInterval = null;
    }
    executeApproachMovement(ac);
  }

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

  // Fallback: If no callsign in transmission, apply to currently selected aircraft
  if (!matchedAc && selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length) {
    matchedAc = aircraft[selectedAircraftIndex];
  }
  
  if (matchedAc) {
    let readback = "";
    const intent = parsed.intent || "";

    const rwyKey = matchedAc.clearedRwy || "25R";
    const mech = airportData && airportData.runway_mechanisms ? airportData.runway_mechanisms[rwyKey] : null;
    const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";

    if (matchedAc.state === "GATE" && (intent === "PUSHBACK" || norm.includes("push") || norm.includes("start"))) {
      matchedAc.state = "PUSHBACK";
      readback = "Push and start approved, facing west, " + matchedAc.callsign;
      executePushbackMovement(matchedAc);
    } else if (matchedAc.state === "READY_TAXI" && (intent === "TAXI" || norm.includes("taxi"))) {
      matchedAc.state = "TAXI";
      matchedAc._runwayCrossCleared = false;
      readback = `Taxi to holding point runway ${rwyKey} via ${hpName}, ${matchedAc.callsign}`;
      executeTaxiMovement(matchedAc);
    } else if (matchedAc.state === "HOLD_SHORT_CROSS" && (norm.includes("cross") || norm.includes("continue") || norm.includes("proceed"))) {
      matchedAc.state = "TAXI";
      matchedAc._runwayCrossCleared = true;
      readback = `Cross runway two five right at November cross, report vacated, ${matchedAc.callsign}`;
      executeTaxiMovement(matchedAc);
    } else if ((matchedAc.state === "HOLDING" || matchedAc.state === "TAXI") && (intent === "LINE_UP" || norm.includes("line up") || norm.includes("wait"))) {
      matchedAc.state = "LINE_UP";
      readback = `Line up and wait runway ${rwyKey}, ${matchedAc.callsign}`;
      executeLineUpMovement(matchedAc);
    } else if ((matchedAc.state === "LINE_UP" || matchedAc.state === "LINING_UP" || matchedAc.state === "HOLDING") && (intent === "TAKEOFF" || norm.includes("takeoff") || norm.includes("take off") || norm.includes("cleared"))) {
      readback = `Runway ${rwyKey} cleared for takeoff, ${matchedAc.callsign}`;
      if (matchedAc.state === "LINING_UP") {
        // Pilot acknowledges clearance, completes the lineup curve first to runway threshold, then rolls!
        matchedAc.takeoffQueued = true;
      } else {
        matchedAc.state = "TAKEOFF";
        executeTakeoffMovement(matchedAc);
      }
    } else if (matchedAc.state === "APPROACH" && (norm.includes("ils") || norm.includes("descend") || norm.includes("approach") || norm.includes("cleared"))) {
      readback = `Descend and maintain 3000 feet, cleared ILS runway ${rwyKey}, ${matchedAc.callsign}`;
    } else if (matchedAc.state === "FINAL" && (norm.includes("land") || norm.includes("cleared"))) {
      readback = `Runway ${rwyKey} cleared to land, ${matchedAc.callsign}`;
    } else if (matchedAc.state === "LANDED" && (norm.includes("ground") || norm.includes("vacate") || norm.includes("121") || norm.includes("taxi"))) {
      matchedAc.state = "TAXI_IN";
      readback = `Vacating runway via November 4, contacting Ground 121 decimal 6, ${matchedAc.callsign}`;
      executeTaxiInMovement(matchedAc);
    } else if (matchedAc.state === "TAXI_IN" && (norm.includes("gate") || norm.includes("stand") || norm.includes("taxi") || norm.includes("continue"))) {
      readback = `Taxi to Gate Echo 1 via November Charlie, ${matchedAc.callsign}`;
      executeTaxiInMovement(matchedAc);
    } else if (matchedAc.state === "AIRBORNE" && (norm.includes("approach") || norm.includes("radar") || norm.includes("119") || norm.includes("125"))) {
      matchedAc.state = "CLIMBING";
      readback = "Contact Jakarta Approach 119 decimal 75, good day, " + matchedAc.callsign;
      executeClimbEnroute(matchedAc);
    } else if ((matchedAc.state === "CLIMBING" || matchedAc.state === "HANDOFF") && (norm.includes("center") || norm.includes("128") || norm.includes("handoff") || norm.includes("good day"))) {
      matchedAc.state = "HANDED_OFF";
      readback = "Contact Jakarta Center 128 decimal 5, thank you for service, " + matchedAc.callsign;
      executeHandoffComplete(matchedAc);
    } else {
      readback = "Roger instructions, " + matchedAc.callsign;
    }

    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();
    speakPilotReadback(readback);
  }
}

// Autonomous Flight Movement Sequences for GIA502
function executePushbackMovement(ac) {
  // Clear any existing interval
  if (ac._pushInterval) clearInterval(ac._pushInterval);

  // Discrete, verifiable pushback points:
  // Waypoint 0: Gate E1 Stand (Parked, lat -6.121757, lon 106.651077)
  // Waypoint 1: Apron Taxilane (Clear of concourse building, lat -6.121650, lon 106.650600)
  // Waypoint 2: Apron Alley curve (lat -6.121480, lon 106.650280)
  // Waypoint 3: Intersection into Taxiway NC6 (lat -6.121260, lon 106.650050)
  // Waypoint 4: PUSH RELEASE POINT on Taxiway NC6 centerline (lat -6.121013, lon 106.650012)
  const pushNodes = (airportData && airportData.routes && airportData.routes.pushback_gate_e1)
    ? airportData.routes.pushback_gate_e1.map(p => ({ lat: p[0], lon: p[1] }))
    : [
        { lat: -6.121757, lon: 106.651077 },
        { lat: -6.121650, lon: 106.650600 },
        { lat: -6.121480, lon: 106.650280 },
        { lat: -6.121260, lon: 106.650050 },
        { lat: -6.121013, lon: 106.650012 }
      ];

  let nodeIdx = 1; // start moving to P1
  ac.groundSpeed = 4;

  function moveNextPushNode() {
    if (nodeIdx >= pushNodes.length) {
      // Reached centerline of Taxiway NC6!
      ac.groundSpeed = 0;
      ac.lat = pushNodes[pushNodes.length - 1].lat;
      ac.lon = pushNodes[pushNodes.length - 1].lon;
      ac.heading = 355; // Aligned along Taxiway NC6 facing north
      ac.state = "READY_TAXI";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = "Ground, INDONESIA 502, ready to taxi, request clearance.";
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
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";

  const dynamicRoutes = airportData && airportData.taxi_routes_by_runway ? airportData.taxi_routes_by_runway[rwyKey] : null;

  const points = (dynamicRoutes && dynamicRoutes.coords)
    ? dynamicRoutes.coords.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.taxi_nc6_to_hp_n2)
        ? airportData.routes.taxi_nc6_to_hp_n2.map(p => ({ lat: p[0], lon: p[1] }))
        : flightRouteMission.taxiwayPoints);

  let ptIdx = (ac._crossSavedIndex !== undefined && ac._crossSavedIndex !== null) ? ac._crossSavedIndex : 0;
  ac._crossSavedIndex = null;

  function moveNextTaxiNode() {
    // Check if crossing runway stop bar (e.g. going south towards 25L or 07R)
    if ((rwyKey === "25L" || rwyKey === "07R") && !ac._runwayCrossCleared && ptIdx === 22) {
      // Reached holding stop bar before crossing North Runway 25R/07L!
      ac.groundSpeed = 0;
      ac.lat = points[ptIdx].lat;
      ac.lon = points[ptIdx].lon;
      ac.state = "HOLD_SHORT_CROSS";
      ac._crossSavedIndex = ptIdx;
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, holding short runway two five right at November cross.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 800);
      return;
    }

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
    ac.heading = targetHeading;
  }

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

      // Standard ICAO TMA Separation: 3.0 NM horizontal & 1,000 ft vertical
      const isLossOfSeparation = (currentDistNm < 3.0 && currentAltDiff < 1000);
      const isPredictedConflict = (predDistNm < 3.0 && currentAltDiff < 1000);

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

// Ground collision avoidance check (Wingspan separation & conflict detection)
// Returns true if there is a conflict ahead and this aircraft must hold/brake
function checkGroundConflictAhead(currentAc, targetLat, targetLon) {
  for (const other of aircraft) {
    if (other.id === currentAc.id) continue;
    // Only check conflict with aircraft that are also on ground
    if (other.altitude > 100) continue;

    // Skip conflict check if the other aircraft is parked at a gate stand and not moving
    if (other.state === "PARKED" || (other.state === "GATE" && other.groundSpeed === 0)) {
      continue;
    }

    // Direct distance between both aircraft centers
    const distBetweenMeters = calculateDistanceMeters(currentAc.lat, currentAc.lon, other.lat, other.lon);
    // Distance from other aircraft to our intended next node / trajectory
    const distTargetMeters = calculateDistanceMeters(targetLat, targetLon, other.lat, other.lon);

    // If another aircraft is within safe wingtip cushion (70 meters) in front of us
    if (distBetweenMeters < 70 || distTargetMeters < 50) {
      // Determine if other aircraft is ahead in our travel vector
      const myBearing = currentAc.heading * Math.PI / 180;
      const dLat = other.lat - currentAc.lat;
      const dLon = (other.lon - currentAc.lon) * Math.cos(currentAc.lat * Math.PI / 180);
      const dot = Math.sin(myBearing) * dLon + Math.cos(myBearing) * dLat;
      
      // If other aircraft is in front (dot > -0.0001) or dangerously close (<45m), hold brakes!
      if (dot > -0.0001 || distBetweenMeters < 45) {
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
    const targetHdg = leg.hdg;

    const legDistNm = calculateDistanceNm(startLat, startLon, leg.lat, leg.lon);
    const avgSpeedKts = Math.max(40, (startSpd + targetSpd) / 2);
    // Unclamped linear physics: Simulation multiplier 4.0 (1 real second = 4 simulation seconds)
    // Time (seconds) = (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT)
    const SIM_SPEED_MULT = 4.0;
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

      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._climbInterval);
        ac._climbInterval = null;
        ac.heading = targetHdg;
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

function spawnInboundArrival() {
  const arrivalCallsigns = [
    { id: "CTV123", callsign: "SUPERGREEN 123", airline: "Citilink", type: "320" },
    { id: "GIA880", callsign: "INDONESIA 880", airline: "Garuda Indonesia", type: "333" },
    { id: "SIA958", callsign: "SINGAPORE 958", airline: "Singapore Airlines", type: "777" },
    { id: "CLX742", callsign: "CARGOLUX 742", airline: "Cargolux", type: "747" },
    { id: "LNI712", callsign: "LION INTER 712", airline: "Lion Air", type: "738" }
  ];
  const chosen = arrivalCallsigns[aircraft.length % arrivalCallsigns.length];
  const targetRwy = "25R";
  const defaultStar = "DOLTA 1A";

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === defaultStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  const newAc = {
    id: chosen.id,
    callsign: chosen.callsign,
    airline: chosen.airline,
    type: chosen.type,
    lat: starCoords[0][0],
    lon: starCoords[0][1],
    heading: 320,
    altitude: 10000,
    groundSpeed: 250,
    state: "APPROACH",
    clearedRwy: targetRwy,
    clearedStar: defaultStar,
    squawk: String(Math.floor(1000 + Math.random() * 8000)),
    hasCheckedIn: false,
    checkInPhrase: `Jakarta Approach, ${chosen.callsign}, inbound via ${defaultStar}, descending through flight level one zero zero.`
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

function executeApproachMovement(ac) {
  if (ac._approachInterval) return;

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const threshold = mech ? [mech.threshold.lat, mech.threshold.lon] : [-6.108959, 106.669062];
  const rwyHeading = mech ? mech.heading : 250;

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === ac.clearedStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  const fullPath = calculateStarArrivalPath(starCoords, rwyKey);
  let ptIdx = 0;

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
    // Unclamped linear physics: Simulation multiplier 4.0 (1 real second = 4 simulation seconds)
    // Time (seconds) = (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT)
    const SIM_SPEED_MULT = 4.0;
    const legDurationSec = Math.max(0.1, (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT));
    const stepIntervalMs = 50;
    const totalSteps = Math.max(2, Math.round((legDurationSec * 1000) / stepIntervalMs));
    let step = 0;

    ac._approachInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (leg.lat - startLat) * prog;
      ac.lon = startLon + (leg.lon - startLon) * prog;
      ac.altitude = Math.round(startAlt + (targetAlt - startAlt) * prog);
      ac.groundSpeed = Math.round(startSpd + (targetSpd - startSpd) * prog);

      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._approachInterval);
        ac._approachInterval = null;
        ac.lat = leg.lat;
        ac.lon = leg.lon;
        ac.heading = targetHdg;
        ptIdx++;
        moveNextArrivalLeg();
      }
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

  // Use the verified OSM Dijkstra path from runway exit point to Gate E1 stand
  const taxiInPoints = (taxiInData && taxiInData.coords)
    ? taxiInData.coords.map(p => ({ lat: p[0], lon: p[1] }))
    : [
        { lat: ac.lat, lon: ac.lon },
        { lat: -6.118502, lon: 106.652425 },
        { lat: -6.121013, lon: 106.650012 },
        { lat: -6.121480, lon: 106.650280 },
        { lat: -6.121757, lon: 106.651077 }
      ];

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
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, parked at Gate Echo 1, engines shutdown, good day.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
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
    el.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });
  };

  addListeners(pttBtn);
  addListeners(acadMicBtn);

  // Global Keydown for Spacebar PTT
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
      if (isRecording) {
        stopRecording();
      }
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

    // Immediately execute the flight maneuver callback
    if (executeCallback) executeCallback();
    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();

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
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";

  // AI GATE: Execute pushback immediately without timer lag
  if (ac.state === "GATE" && !ac._aiPushIssued) {
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
    transmitAiClearance(
      ac,
      `${ac.callsign}, taxi to holding point runway ${rwyKey} via ${hpName}.`,
      `Taxi to holding point runway ${rwyKey} via ${hpName}, ${ac.callsign}.`,
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
          // Approach already descending
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
            // Cleared to land
          }
        );
      }, 1500);
    }
  }

  // AI LANDED (Vacating): Handover to Ground Control
  if (ac.state === "LANDED" && !ac._aiVacateIssued) {
    ac._aiVacateIssued = true;
    setTimeout(() => {
      if (ac.state !== "LANDED") return;
      transmitAiClearance(
        ac,
        `${ac.callsign}, vacate runway via November 4, contact Ground 121 decimal 6.`,
        `Vacating runway via November 4, contacting Ground 121 decimal 6, ${ac.callsign}.`,
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
      transmitAiClearance(
        ac,
        `${ac.callsign}, taxi to Gate Echo 1 via November Charlie.`,
        `Taxi to Gate Echo 1 via November Charlie, ${ac.callsign}.`,
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

  setLayout('split');
  renderFlightStrips();
  updateEasyModePrompter();
  setupRecording();

  // Pilot initiates check-in transmission after 2 seconds!
  setTimeout(() => {
    if (aircraft.length > 0) {
      triggerPilotCheckIn(aircraft[0]);
    }
  }, 2000);
});
