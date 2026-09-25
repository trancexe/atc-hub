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
    zoom: 2.8,
    isDragging: false,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0
  },
  tma: {
    panX: 0,
    panY: 0,
    zoom: 0.35,
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

// Simulation aircraft
let aircraft = [
  {
    id: "GIA123",
    callsign: "Garuda 123",
    airline: "Garuda Indonesia",
    type: "B738",
    lat: -6.1265,
    lon: 106.6540,
    heading: 90,
    altitude: 0,
    groundSpeed: 0,
    targetHeading: 90,
    state: "GATE",
    clearedRwy: "25R",
    squawk: "4215"
  },
  {
    id: "LNI456",
    callsign: "Lion 456",
    airline: "Lion Air",
    type: "A333",
    lat: -6.1800,
    lon: 106.8500,
    heading: 260,
    altitude: 8000,
    groundSpeed: 240,
    targetHeading: 260,
    state: "APPROACH",
    clearedRwy: "25L",
    squawk: "5521"
  }
];

let selectedAircraftIndex = 0;

// Easy Mode Dynamic Prompts by Aircraft State
const stateInstructions = {
  "GATE": {
    context: "Pesawat parkir di Terminal 3, siap pushback dan engine start.",
    speech: "Garuda 123 push and start approved, facing west",
    actionDesc: "Pushback & Start Approved"
  },
  "PUSHBACK": {
    context: "Pesawat selesai pushback, meminta izin taxi menuju Runway 25R.",
    speech: "Garuda 123 taxi to holding point runway 25R via NC1",
    actionDesc: "Taxi Clearance via NC1"
  },
  "TAXI": {
    context: "Pesawat tiba di holding point Runway 25R, runway sedang ada traffic mendarat.",
    speech: "Garuda 123 line up and wait runway 25R",
    actionDesc: "Line up and wait"
  },
  "LINE_UP": {
    context: "Runway sudah bebas dan aman untuk keberangkatan, angin 250 derajat 8 knot.",
    speech: "Garuda 123 wind 250 at 8 knots, runway 25R cleared for takeoff",
    actionDesc: "Cleared for Takeoff"
  },
  "DEPARTURE": {
    context: "Pesawat sudah airborne, kontak Jakarta Radar untuk climb cruise.",
    speech: "Garuda 123 contact Jakarta Radar 125 decimal 1",
    actionDesc: "Contact Radar"
  },
  "APPROACH": {
    context: "Lion 456 mendekat via STAR DOLTA 1A, arahkan intercept localizer ILS 25L.",
    speech: "Lion 456 descend to 3000 feet, cleared ILS runway 25L",
    actionDesc: "Descend & Cleared ILS"
  },
  "FINAL": {
    context: "Lion 456 sudah di short final 3 mile, runway 25L clear.",
    speech: "Lion 456 runway 25L cleared to land, wind 250 at 6",
    actionDesc: "Cleared to Land"
  },
  "LANDED": {
    context: "Pesawat sudah mendarat dan memperlambat laju, arahkan keluar via exit taxiway.",
    speech: "Lion 456 vacate runway via taxiway South Charlie, taxi to Terminal 2",
    actionDesc: "Vacate & Taxi to Gate"
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
  updateEasyModePrompter();
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

function speakPilotReadback(text) {
  if (!('speechSynthesis' in window)) return;
  playRadioChirp();

  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (enVoice) utterance.voice = enVoice;

    utterance.onend = () => {
      playRadioChirp();
    };

    window.speechSynthesis.speak(utterance);
  }, 100);
}

// Media Recorder for Push-To-Talk
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function setupRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("navigator.mediaDevices.getUserMedia not available");
    updateMicStatusWarning("Browser requires HTTPS for Mic. Access via https:// or localhost");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const ext = mimeType.includes('webm') ? 'webm' : 'wav';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];
      await sendAudioToWhisper(audioBlob, ext);
    };

    updateMicStatusWarning(null);
  } catch (err) {
    console.warn("Microphone access error:", err);
    updateMicStatusWarning("Mic permission denied or not found");
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
  if (!mediaRecorder) {
    await setupRecording();
  }

  if (!mediaRecorder) {
    alert("Microphone tidak dapat diakses! Buka lewat HTTPS: https://100.75.217.97:8011 dan izinkan akses microphone.");
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
        handleRadarVoiceCommand(res.text);
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

  // 1. Aprons
  ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
  ctx.strokeStyle = "rgba(51, 65, 85, 0.7)";
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

  // 2. Taxiways
  (airportData.taxiways || []).forEach(tw => {
    if (!tw.coords || tw.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = Math.max(2, 2.5 * (st.zoom / 2));
    const p0 = latLonToScreenCoord(tw.coords[0][0], tw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < tw.coords.length; i++) {
      const pt = latLonToScreenCoord(tw.coords[i][0], tw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    if (tw.ref && tw.coords.length > 2 && st.zoom > 1.8) {
      const mid = tw.coords[Math.floor(tw.coords.length / 2)];
      const mp = latLonToScreenCoord(mid[0], mid[1], st);
      ctx.font = "9px 'Share Tech Mono'";
      ctx.fillStyle = "rgba(52, 211, 153, 0.75)";
      ctx.fillText(tw.ref, mp.x + 3, mp.y - 3);
    }
  });

  // 3. Holding Points
  (airportData.holding_positions || []).forEach(hp => {
    const p = latLonToScreenCoord(hp.lat, hp.lon, st);
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * (st.zoom / 2), 0, Math.PI * 2);
    ctx.fill();
    if (st.zoom > 2.0) {
      ctx.font = "8px 'Share Tech Mono'";
      ctx.fillText(hp.ref, p.x + 5, p.y + 3);
    }
  });

  // 4. Runways
  (airportData.runways || []).forEach(rw => {
    if (!rw.coords || rw.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = Math.max(4, (rw.width || 45) * 0.12 * st.zoom);
    const p0 = latLonToScreenCoord(rw.coords[0][0], rw.coords[0][1], st);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < rw.coords.length; i++) {
      const pt = latLonToScreenCoord(rw.coords[i][0], rw.coords[i][1], st);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    ctx.setLineDash([5 * st.zoom, 3 * st.zoom]);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    const pEnd = latLonToScreenCoord(rw.coords[rw.coords.length - 1][0], rw.coords[rw.coords.length - 1][1], st);
    ctx.font = "bold 11px 'Share Tech Mono'";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(rw.ref, p0.x - 12, p0.y - 6);
    ctx.fillText(rw.ref, pEnd.x + 6, pEnd.y + 6);
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
  const c = latLonToScreenCoord(refLat, refLon, st);
  [80, 160, 240, 320].forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (st.zoom / 0.35), 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "9px 'Share Tech Mono'";
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    ctx.fillText(`${(idx + 1) * 15}NM`, c.x + r * (st.zoom / 0.35) + 3, c.y - 3);
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

  // Waypoints & Navaids
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
  st.zoom = Math.max(0.05, Math.min(25.0, st.zoom * factor));
  renderAllScreens();
}

function resetScreen(screenKey) {
  const st = viewState[screenKey];
  st.panX = 0;
  st.panY = 0;
  st.zoom = screenKey === 'ground' ? 2.8 : 0.35;
  renderAllScreens();
}

function renderFlightStrips() {
  const container = document.getElementById('flight-strips');
  if (!container) return;
  container.innerHTML = aircraft.map((ac, idx) => `
    <div onclick="selectAircraft(${idx})" class="p-2 rounded text-xs cursor-pointer border transition ${idx === selectedAircraftIndex ? 'bg-amber-950/40 border-amber-500' : 'bg-slate-950 border-emerald-950 hover:bg-slate-900'}">
      <div class="flex justify-between items-center ${idx === selectedAircraftIndex ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}">
        <span>${ac.id} (${ac.type})</span>
        <span class="text-[10px] text-slate-400">${ac.airline}</span>
      </div>
      <div class="flex justify-between text-[11px] text-slate-400 mt-1">
        <span>STATE: <b class="text-white">${ac.state}</b></span>
        <span>RWY: <b class="text-white">${ac.clearedRwy}</b></span>
      </div>
    </div>
  `).join('');
  document.getElementById('aircraft-count').textContent = `${aircraft.length} In Flight`;
}

function selectAircraft(idx) {
  selectedAircraftIndex = idx;
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
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

function handleRadarVoiceCommand(text) {
  const lower = text.toLowerCase();
  let matchedAc = aircraft.find(a => lower.includes(a.id.toLowerCase()) || lower.includes("garuda") || lower.includes("lion"));
  
  if (matchedAc) {
    let readback = "";
    if (lower.includes("push") || lower.includes("start")) {
      matchedAc.state = "PUSHBACK";
      readback = "Push and start approved, facing west, " + matchedAc.callsign;
    } else if (lower.includes("taxi")) {
      matchedAc.state = "TAXI";
      readback = "Taxi to holding point runway 25R via NC1, " + matchedAc.callsign;
    } else if (lower.includes("line up") || lower.includes("wait")) {
      matchedAc.state = "LINE_UP";
      readback = "Line up and wait runway 25R, " + matchedAc.callsign;
    } else if (lower.includes("cleared for takeoff")) {
      matchedAc.state = "DEPARTURE";
      matchedAc.groundSpeed = 160;
      readback = "Runway 25R cleared for takeoff, " + matchedAc.callsign;
    } else if (lower.includes("cleared to land")) {
      matchedAc.state = "LANDED";
      readback = "Cleared to land runway 25L, " + matchedAc.callsign;
    } else {
      readback = "Roger instructions, " + matchedAc.callsign;
    }
    renderFlightStrips();
    updateEasyModePrompter();
    renderAllScreens();
    speakPilotReadback(readback);
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

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && currentTab === 'radar') {
      e.preventDefault();
      cyclePrompterAircraft();
    }
    if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      startRecording();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      stopRecording();
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
});
