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
    panX: -280,
    panY: -120,
    zoom: 6.5, // Crisp, close-up tactical view for small displays & laptop screens
    isDragging: false,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0
  },
  tma: {
    panX: 0,
    panY: 0,
    zoom: 0.16, // Optimal default to display full 80 NM TMA + SIDs, STARs, and Center Gateway fixes
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
let isDebugMuted = true; // DEBUG MODE: Suara di-mute & bypass audio wait
let showTaxiwayLabels = true; // Toggle for high-visibility taxiway badges

// Trigger pilot initial check-in transmission
async function triggerPilotCheckIn(ac) {
  if (ac.hasCheckedIn || isRadioTransmitting) return;
  ac.hasCheckedIn = true;
  isRadioTransmitting = true;

  // Visual notify in PTT banner & strips
  const pttStatus = document.getElementById('ptt-status');
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-amber-400 font-bold animate-pulse"><i class="fa-solid fa-volume-high"></i> PILOT CALL: ${ac.callsign}</span>`;
  }
  renderFlightStrips();
  updateEasyModePrompter();

  // Speak pilot check-in via radio (skipped instantly in debug mode)
  await speakPilotTransmission(ac.checkInPhrase);
  
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> INSTRUKSI ATC SIAP DIKIRIM (KLIK TOMBOL / MIC)</span>`;
  }
  isRadioTransmitting = false;
  renderFlightStrips();
  updateEasyModePrompter();
}

async function speakPilotTransmission(text) {
  if (isDebugMuted) {
    // Tampilkan transkrip tanpa putar audio
    const recEl = document.getElementById('recognized-text');
    if (recEl) recEl.textContent = `[PILOT]: "${text}"`;
    return new Promise(r => setTimeout(r, 600));
  }
  playRadioChirp();
  try {
    const audioUrl = `/api/audio/tts?text=${encodeURIComponent(text)}&voice=en-US-GuyNeural`;
    const audio = new Audio(audioUrl);
    await new Promise((resolve) => {
      audio.onended = () => {
        playRadioChirp();
        resolve();
      };
      audio.onerror = () => { resolve(); };
      audio.play().catch(() => { resolve(); });
    });
  } catch (e) {
  }
}

async function speakPilotReadback(text) {
  const recEl = document.getElementById('recognized-text');
  if (recEl) recEl.textContent = `[READBACK]: "${text}"`;
  if (isDebugMuted) {
    return new Promise(r => setTimeout(r, 500));
  }
  try {
    const audioUrl = `/api/audio/tts?text=${encodeURIComponent(text)}&voice=en-US-GuyNeural`;
    const audio = new Audio(audioUrl);
    await audio.play().catch(() => {});
  } catch (e) {}
}

function executeDebugCommand() {
  const ac = aircraft[selectedAircraftIndex] || aircraft[0];
  if (!ac) return;
  
  console.log(`[DEBUG ATC] Executing command for ${ac.id}, current state: ${ac.state}`);

  // Determine clearance action directly by current state machine
  let instructionText = "";
  if (ac.state === "GATE") {
    instructionText = "Indonesia 502 push and start approved, facing west";
  } else if (ac.state === "PUSHBACK") {
    // If user clicks while in pushback, fast-forward to release point so simulation doesn't stall
    ac.lat = -6.121013;
    ac.lon = 106.650012;
    ac.heading = 355;
    ac.state = "READY_TAXI";
    ac.hasCheckedIn = false;
    ac.checkInPhrase = "Ground, INDONESIA 502, ready to taxi, request clearance.";
    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();
    setTimeout(() => { triggerPilotCheckIn(ac); }, 400);
    return;
  } else if (ac.state === "READY_TAXI") {
    instructionText = "Indonesia 502 taxi to holding point runway 25R via NC1 and N2";
  } else if (ac.state === "TAXI") {
    console.log("[DEBUG ATC] Taxi already in progress...");
    return;
  } else if (ac.state === "HOLDING") {
    instructionText = "Indonesia 502 line up and wait runway 25R";
  } else if (ac.state === "LINE_UP") {
    instructionText = "Indonesia 502 wind 250 at 8 knots, runway 25R cleared for takeoff";
  } else if (ac.state === "TAKEOFF") {
    console.log("[DEBUG ATC] Takeoff roll already in progress...");
    return;
  } else if (ac.state === "AIRBORNE") {
    instructionText = "Indonesia 502 contact Jakarta Approach 119 decimal 75, good day";
  } else if (ac.state === "CLIMBING" || ac.state === "HANDOFF") {
    instructionText = "Indonesia 502 contact Jakarta Center 128 decimal 5, good day";
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

// Easy Mode Dynamic Prompts by Aircraft State (Strict ICAO Standard Telephony)
const stateInstructions = {
  "GATE": {
    context: "Pesawat parkir di Gate Echo 1 Terminal 3, siap pushback dan engine start.",
    speech: "Indonesia 502 push and start approved, facing west",
    actionDesc: "Pushback & Start Approved"
  },
  "PUSHBACK": {
    context: "Pesawat sedang pushback mandiri ke taxiway...",
    speech: "Standby for taxi request",
    actionDesc: "Pushback in progress"
  },
  "READY_TAXI": {
    context: "Pesawat selesai pushback di NC1, pilot check-in meminta clearance taxi menuju Runway 25R.",
    speech: "Indonesia 502 taxi to holding point runway 25R via NC1, N2",
    actionDesc: "Taxi to Holding Point 25R"
  },
  "TAXI": {
    context: "Pesawat sedang taxi menuju holding point 25R...",
    speech: "Standby at holding point",
    actionDesc: "Taxiing"
  },
  "HOLDING": {
    context: "Pesawat berhenti di Holding Point 25R, runway sedang menunggu antrean.",
    speech: "Indonesia 502 line up and wait runway 25R",
    actionDesc: "Line up and wait"
  },
  "LINE_UP": {
    context: "Pesawat sudah berada di posisi runway 25R siap lepas landas, angin 250 derajat 8 knot.",
    speech: "Indonesia 502 wind 250 at 8 knots, runway 25R cleared for takeoff",
    actionDesc: "Cleared for Takeoff"
  },
  "TAKEOFF": {
    context: "Pesawat akselerasi dan lepas landas dari runway 25R...",
    speech: "Airborne climb out",
    actionDesc: "Takeoff roll"
  },
  "AIRBORNE": {
    context: "Pesawat airborne passing 2000ft, transfer kendali dari Tower ke Jakarta Approach.",
    speech: "Indonesia 502 contact Jakarta Approach 119 decimal 75",
    actionDesc: "Contact Approach"
  },
  "CLIMBING": {
    context: "Pesawat mengikuti SID DOLTA 1C, climb passing FL120 menuju FL140.",
    speech: "Indonesia 502 climb and maintain flight level 140",
    actionDesc: "Climb FL140"
  },
  "HANDOFF": {
    context: "Pesawat mendekati batas COP DOLTA (14.000 ft), handoff transfer kendali ke Jakarta Center!",
    speech: "Indonesia 502 contact Jakarta Center 128 decimal 5, good day",
    actionDesc: "Handsoff to Center"
  },
  "HANDED_OFF": {
    context: "Pesawat berhasil ditransfer ke Jakarta Center. Misi selesai!",
    speech: "Mission Complete",
    actionDesc: "Enroute with Center"
  }
};

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
  const info = stateInstructions[ac.state] || {
    context: `Pesawat sedang dalam status ${ac.state}.`,
    speech: `${ac.callsign} roger and standby`,
    actionDesc: "Standby"
  };

  document.getElementById('prompt-ac-badge').textContent = `${ac.id} (${ac.state})`;
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
    focusAircraftOnGround(ac, 6.5);
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
    paneGround.classList.remove('hidden');
    paneTma.classList.remove('hidden');
    btnSplit.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'ground') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.classList.remove('hidden');
    paneTma.classList.add('hidden');
    btnGround.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'tma') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.classList.add('hidden');
    paneTma.classList.remove('hidden');
    btnTma.className = "px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition bg-emerald-600 text-white";
  }

  setTimeout(() => {
    resizeCanvases();
  }, 50);
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
    ctx.beginPath();
    ctx.strokeStyle = "#059669";
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
    ctx.strokeStyle = "#ffffff";
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
    ctx.font = "bold 13px 'Share Tech Mono'";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(rw.ref, p0.x - 14, p0.y - 8);
    ctx.fillText(rw.ref, pEnd.x + 8, pEnd.y + 8);
  });

  // Aircraft on ground
  aircraft.forEach((ac, idx) => {
    const p = latLonToScreenCoord(ac.lat, ac.lon, st);
    const isSel = idx === selectedAircraftIndex;

    ctx.fillStyle = isSel ? "#f59e0b" : "#22c55e";
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSel ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (isSel) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = isSel ? "#fbbf24" : "#4ade80";
    ctx.fillText(ac.id, p.x + 10, p.y - 10);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`${ac.state} [${ac.squawk}]`, p.x + 10, p.y + 2);
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

  // 2. SIDs (Standard Instrument Departures) - Orange/Amber dashed routes
  (airportData.sids || []).forEach(sid => {
    if (!sid.coords || sid.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = sid.color || "rgba(245, 158, 11, 0.65)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
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
    ctx.font = "bold 9px 'Share Tech Mono'";
    ctx.fillStyle = sid.color || "#f59e0b";
    ctx.fillText(`[SID] ${sid.id}`, pm.x - 15, pm.y - 8);
  });

  // STARs (Standard Terminal Arrival Routes) - Cyan/Blue dashed routes
  (airportData.stars || []).forEach(star => {
    if (!star.coords || star.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = star.color || "rgba(6, 182, 212, 0.75)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
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
    ctx.font = "bold 9px 'Share Tech Mono'";
    ctx.fillStyle = star.color || "#06b6d4";
    ctx.fillText(`[STAR] ${star.id}`, pm.x + 8, pm.y + 12);
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

  // Aircraft targets
  aircraft.forEach((ac, idx) => {
    const p = latLonToScreenCoord(ac.lat, ac.lon, st);
    const isSel = idx === selectedAircraftIndex;

    ctx.fillStyle = isSel ? "#f59e0b" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSel ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    const rad = (ac.heading - 90) * (Math.PI / 180);
    const leaderLen = (ac.groundSpeed || 50) * 0.18;
    ctx.strokeStyle = isSel ? "#f59e0b" : "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(rad) * leaderLen, p.y + Math.sin(rad) * leaderLen);
    ctx.stroke();

    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = isSel ? "#fbbf24" : "#bae6fd";
    ctx.fillText(ac.id, p.x + 12, p.y - 10);
    
    ctx.fillStyle = "#94a3b8";
    const altStr = ac.altitude === 0 ? "GND" : `A${String(Math.round(ac.altitude/100)).padStart(3, '0')}`;
    const spdStr = `${ac.groundSpeed}K`;
    ctx.fillText(`${altStr} ${spdStr}`, p.x + 12, p.y);
    ctx.fillText(`${ac.state}`, p.x + 12, p.y + 10);
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

  cElem.addEventListener('mousedown', (e) => {
    st.isDragging = true;
    st.startX = e.clientX - st.panX;
    st.startY = e.clientY - st.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!st.isDragging) return;
    st.panX = e.clientX - st.startX;
    st.panY = e.clientY - st.startY;
    renderAllScreens();
  });

  window.addEventListener('mouseup', () => {
    st.isDragging = false;
  });

  cElem.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    zoomScreen(screenKey, factor);
  }, { passive: false });
}

function zoomScreen(screenKey, factor) {
  const st = viewState[screenKey];
  const minZoom = screenKey === 'tma' ? 0.01 : 0.05;
  st.zoom = Math.max(minZoom, Math.min(25.0, st.zoom * factor));
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
  st.zoom = screenKey === 'ground' ? 6.5 : 0.16;
  renderAllScreens();
}

function renderFlightStrips() {
  const container = document.getElementById('flight-strips');
  if (!container) return;
  container.innerHTML = aircraft.map((ac, idx) => {
    const isPending = !ac.hasCheckedIn;
    const isSel = idx === selectedAircraftIndex;
    return `
      <div onclick="selectAircraft(${idx})" class="p-2 rounded text-xs cursor-pointer border transition ${isSel ? 'bg-amber-950/40 border-amber-500' : 'bg-slate-950 border-emerald-950 hover:bg-slate-900'} ${isPending ? 'ring-1 ring-amber-400' : ''}">
        <div class="flex justify-between items-center ${isSel ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}">
          <span>${ac.id} (${ac.type})</span>
          <span class="text-[10px] ${isPending ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400'}">
            ${isPending ? 'CALLING...' : ac.airline}
          </span>
        </div>
        <div class="flex justify-between text-[11px] text-slate-400 mt-1">
          <span>STATE: <b class="text-white">${ac.state}</b></span>
          <span>RWY: <b class="text-white">${ac.clearedRwy}</b></span>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('aircraft-count').textContent = `${aircraft.length} In Flight`;
}

function focusAircraftOnGround(ac, optimalZoom = 6.5) {
  if (!ac) return;
  const st = viewState.ground;
  st.zoom = optimalZoom;
  // Calculate panX and panY so that (ac.lat, ac.lon) is placed directly in the center of the canvas
  st.panX = - (ac.lon - refLon) * BASE_SCALE * st.zoom;
  st.panY = (ac.lat - refLat) * BASE_SCALE * st.zoom;
  renderAllScreens();
}

function selectAircraft(idx) {
  selectedAircraftIndex = idx;
  const ac = aircraft[idx];

  // If selecting aircraft, smoothly focus ground radar on this aircraft with clear close-up distance
  if (ac) {
    focusAircraftOnGround(ac, 6.5);
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
    matchedAc = aircraft.find(a => norm.includes(a.id.toLowerCase()) || norm.includes("garuda") || norm.includes("indonesia"));
  }
  
  if (matchedAc) {
    let readback = "";
    const intent = parsed.intent || "";

    if (matchedAc.state === "GATE" && (intent === "PUSHBACK" || norm.includes("push") || norm.includes("start"))) {
      matchedAc.state = "PUSHBACK";
      readback = "Push and start approved, facing west, " + matchedAc.callsign;
      executePushbackMovement(matchedAc);
    } else if (matchedAc.state === "READY_TAXI" && (intent === "TAXI" || norm.includes("taxi"))) {
      matchedAc.state = "TAXI";
      readback = "Taxi to holding point runway 25R via NC1 and N2, " + matchedAc.callsign;
      executeTaxiMovement(matchedAc);
    } else if ((matchedAc.state === "HOLDING" || matchedAc.state === "TAXI") && (intent === "LINE_UP" || norm.includes("line up") || norm.includes("wait"))) {
      matchedAc.state = "LINE_UP";
      readback = "Line up and wait runway 25R, " + matchedAc.callsign;
      executeLineUpMovement(matchedAc);
    } else if ((matchedAc.state === "LINE_UP" || matchedAc.state === "HOLDING") && (intent === "TAKEOFF" || norm.includes("cleared for takeoff") || norm.includes("takeoff"))) {
      matchedAc.state = "TAKEOFF";
      readback = "Runway 25R cleared for takeoff, " + matchedAc.callsign;
      executeTakeoffMovement(matchedAc);
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

  let nodeIdx = 1; // start from P1
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
      }, 1000);
      return;
    }

    const targetPt = pushNodes[nodeIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    // Pushback heading: airplane moves backward (tail first), heading stays facing terminal or curves as tug turns it
    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let pushHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      // Reverse vector because aircraft is being pushed tail-first:
      pushHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 180 + 360) % 360);
    }

    // Dynamic, well-paced pushback: ~18 seconds total maneuver (not 55 seconds dragging)
    const distM = distDeg * 111000;
    const durSec = Math.max(3, distM / 8.0);
    const totalSteps = Math.max(15, Math.round(durSec * 15)); // 15 fps
    let step = 0;

    const pushStepInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      // Smooth nose rotation during pushback turn
      const angleDelta = ((pushHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(pushStepInterval);
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
  // Use exact real taxiway centerline points from OSM graph (NC6 to HP N2 on RWY 25R)
  const points = (airportData && airportData.routes && airportData.routes.taxi_nc6_to_hp_n2) 
    ? airportData.routes.taxi_nc6_to_hp_n2.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.taxi_nc6_to_rwy25r)
        ? airportData.routes.taxi_nc6_to_rwy25r.map(p => ({ lat: p[0], lon: p[1] }))
        : flightRouteMission.taxiwayPoints);

  let ptIdx = 0;

  function moveNextTaxiNode() {
    if (ptIdx >= points.length) {
      // Arrived precisely at Holding Point N2! Stop bar lock.
      ac.groundSpeed = 0;
      // Exact stop coordinates at HP N2 (-6.1104895, 106.6679684)
      ac.lat = points[points.length - 1].lat;
      ac.lon = points[points.length - 1].lon;
      ac.heading = 335; // Aligned along Taxiway N2 facing holding bar into Runway 25R
      ac.state = "HOLDING";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = "Jakarta Tower, INDONESIA 502, holding point November two runway two five right, ready for departure.";
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
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        ac.heading = targetHdg;
        ptIdx++;
        moveNextTaxiNode();
      }
    }, 75);
  }

  moveNextTaxiNode();
}

function executeLineUpMovement(ac) {
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
  ac.groundSpeed = 10;

  function moveNextEntryNode() {
    if (eIdx >= entryNodes.length) {
      // Perfectly lined up on Runway centerline threshold!
      ac.groundSpeed = 0;
      const lastPt = entryNodes[entryNodes.length - 1];
      ac.lat = lastPt.lat;
      ac.lon = lastPt.lon;
      ac.heading = targetHeading; // Aligned perfectly down the runway
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();
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

    const entryInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.18 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(entryInterval);
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
  let rIdx = 1;
  const totalRollPoints = rollNodes.length;

  function moveNextRollNode() {
    if (rIdx >= totalRollPoints) {
      ac.state = "AIRBORNE";
      ac.hasCheckedIn = false;
      ac.groundSpeed = 185;
      ac.altitude = 1500;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, airborne runway ${rwyKey} passing one thousand five hundred feet.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const targetPt = rollNodes[rIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const progOverall = rIdx / totalRollPoints;
    ac.groundSpeed = Math.round(15 + Math.pow(progOverall, 1.3) * 145);

    if (progOverall > 0.55) {
      const climbP = (progOverall - 0.55) / 0.45;
      ac.altitude = Math.round(climbP * 1500);
    } else {
      ac.altitude = 0;
    }

    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    // Faster steps as aircraft accelerates down the runway
    const stepSpeedFactor = Math.max(25000, 90000 - ac.groundSpeed * 400);
    const totalSteps = Math.max(6, Math.round(distDeg * stepSpeedFactor));
    let step = 0;

    const rollStepInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;
      ac.heading = targetHeading;

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(rollStepInterval);
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        rIdx++;
        moveNextRollNode();
      }
    }, 45);
  }

  moveNextRollNode();
}

function executeClimbEnroute(ac) {
  const points = flightRouteMission.climbWaypoints;
  let ptIdx = 0;

  function moveNextClimbLeg() {
    if (ptIdx >= points.length) {
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

    const totalSteps = 180;
    let step = 0;

    const legInterval = setInterval(() => {
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
        clearInterval(legInterval);
        ac.heading = targetHdg;
        ptIdx++;
        moveNextClimbLeg();
      }
    }, 100);
  }

  moveNextClimbLeg();
}

function executeHandoffComplete(ac) {
  const pttStatus = document.getElementById('ptt-status');
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check"></i> HANDOFF COMPLETE - CRUISE ENROUTE JAKARTA CENTER</span>`;
  }
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
