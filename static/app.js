// ATC HUB - Client logic & Web Audio / Canvas Engine

let airportData = null;
let currentTab = 'radar';
let radarMode = 'ground'; // 'ground' or 'tma'

// Canvas state
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
let width = 0;
let height = 0;

let panX = 0;
let panY = 0;
let zoom = 1.0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Airport coordinate center
let refLat = -6.12557;
let refLon = 106.655998;

// Scale factors (degrees to pixels)
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

// VHF Radio Sound Effect (squelch, bandpass filter, static hiss)
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
    
    // Choose appropriate voice if available
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
let micPermissionGranted = false;

async function setupRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("navigator.mediaDevices.getUserMedia not available (needs HTTPS or localhost)");
    updateMicStatusWarning("Browser requires HTTPS for Mic. Access via https:// or localhost");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    micPermissionGranted = true;

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

  // If mic not initialized yet, try request again
  if (!mediaRecorder) {
    await setupRecording();
  }

  if (!mediaRecorder) {
    alert("Microphone tidak dapat diakses! Pastikan membuka via HTTPS (contoh: https://100.75.217.97:8011) atau berikan izin mikrofon pada browser.");
    return;
  }

  try {
    isRecording = true;
    audioChunks = [];
    mediaRecorder.start();
    playRadioChirp();

    // Update UI
    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.textContent = "TRANSMITTING ON 118.10 MHz...";
      pttStatus.className = "text-xs font-radar mb-2 px-3 py-1 rounded border transition-all bg-red-950 text-red-400 border-red-700 animate-pulse";
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
      pttStatus.className = "text-xs font-radar mb-2 px-3 py-1 rounded border transition-all bg-slate-900 border-emerald-800 text-emerald-400";
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

// Radar Canvas Rendering
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  drawRadar();
}

function latLonToScreen(lat, lon) {
  const x = (lon - refLon) * BASE_SCALE * zoom + width / 2 + panX;
  const y = -(lat - refLat) * BASE_SCALE * zoom + height / 2 + panY;
  return { x, y };
}

function drawRadar() {
  ctx.clearRect(0, 0, width, height);

  // Draw Range Rings
  ctx.strokeStyle = "rgba(16, 185, 129, 0.12)";
  ctx.lineWidth = 1;
  const center = latLonToScreen(refLat, refLon);
  const ringDistances = radarMode === 'ground' ? [200, 400, 600] : [150, 300, 450, 600];
  
  ringDistances.forEach(r => {
    ctx.beginPath();
    ctx.arc(center.x, center.y, r * zoom, 0, Math.PI * 2);
    ctx.stroke();
  });

  if (!airportData) {
    requestAnimationFrame(drawRadar);
    return;
  }

  // 1. Draw Aprons
  if (radarMode === 'ground') {
    ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
    ctx.strokeStyle = "rgba(51, 65, 85, 0.7)";
    ctx.lineWidth = 1;
    (airportData.aprons || []).forEach(ap => {
      if (!ap.coords || ap.coords.length < 3) return;
      ctx.beginPath();
      const p0 = latLonToScreen(ap.coords[0][0], ap.coords[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < ap.coords.length; i++) {
        const pt = latLonToScreen(ap.coords[i][0], ap.coords[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // 2. Draw Taxiways
    (airportData.taxiways || []).forEach(tw => {
      if (!tw.coords || tw.coords.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
      ctx.lineWidth = Math.max(2, 2.5 * zoom);
      const p0 = latLonToScreen(tw.coords[0][0], tw.coords[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < tw.coords.length; i++) {
        const pt = latLonToScreen(tw.coords[i][0], tw.coords[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Taxiway label
      if (tw.ref && tw.coords.length > 2 && zoom > 1.2) {
        const mid = tw.coords[Math.floor(tw.coords.length / 2)];
        const mp = latLonToScreen(mid[0], mid[1]);
        ctx.font = "9px 'Share Tech Mono'";
        ctx.fillStyle = "rgba(52, 211, 153, 0.7)";
        ctx.fillText(tw.ref, mp.x + 3, mp.y - 3);
      }
    });

    // 3. Draw Holding Points
    (airportData.holding_positions || []).forEach(hp => {
      const p = latLonToScreen(hp.lat, hp.lon);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * zoom, 0, Math.PI * 2);
      ctx.fill();
      if (zoom > 1.5) {
        ctx.font = "8px 'Share Tech Mono'";
        ctx.fillText(hp.ref, p.x + 5, p.y + 3);
      }
    });
  }

  // 4. Draw Runways (Visible in both Ground and TMA)
  (airportData.runways || []).forEach(rw => {
    if (!rw.coords || rw.coords.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = Math.max(3, (rw.width || 45) * 0.15 * zoom);
    const p0 = latLonToScreen(rw.coords[0][0], rw.coords[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < rw.coords.length; i++) {
      const pt = latLonToScreen(rw.coords[i][0], rw.coords[i][1]);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Centerline dashed
    ctx.setLineDash([6 * zoom, 4 * zoom]);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Runway Designator
    const pEnd = latLonToScreen(rw.coords[rw.coords.length - 1][0], rw.coords[rw.coords.length - 1][1]);
    ctx.font = "bold 11px 'Share Tech Mono'";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(rw.ref, p0.x - 15, p0.y - 8);
    ctx.fillText(rw.ref, pEnd.x + 8, pEnd.y + 8);
  });

  // 5. Draw Waypoints / Navaids (TMA Mode)
  if (radarMode === 'tma') {
    (airportData.waypoints || []).concat(airportData.navaids || []).forEach(wp => {
      const p = latLonToScreen(wp.lat, wp.lon);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      
      // Triangle symbol for waypoint
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 5, p.y + 4);
      ctx.lineTo(p.x - 5, p.y + 4);
      ctx.closePath();
      ctx.stroke();

      ctx.font = "10px 'Share Tech Mono'";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(wp.id, p.x + 7, p.y + 3);
    });
  }

  // 6. Draw Aircraft & Radar Blips
  aircraft.forEach(ac => {
    const p = latLonToScreen(ac.lat, ac.lon);

    // Blip Target
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Velocity Leader Line
    const rad = (ac.heading - 90) * (Math.PI / 180);
    const leaderLen = (ac.groundSpeed || 10) * 0.15;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(rad) * leaderLen, p.y + Math.sin(rad) * leaderLen);
    ctx.stroke();

    // Flight Data Tag
    ctx.font = "10px 'Share Tech Mono'";
    ctx.fillStyle = "#4ade80";
    ctx.fillText(ac.id, p.x + 12, p.y - 12);
    
    ctx.fillStyle = "#94a3b8";
    const altStr = ac.altitude === 0 ? "GND" : `A${String(Math.round(ac.altitude/100)).padStart(3, '0')}`;
    const spdStr = `${ac.groundSpeed}K`;
    ctx.fillText(`${altStr} ${spdStr}`, p.x + 12, p.y);
    ctx.fillText(`${ac.state} [${ac.squawk}]`, p.x + 12, p.y + 12);
  });
}

// Pan & Zoom Event Listeners
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX - panX;
  startY = e.clientY - panY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  panX = e.clientX - startX;
  panY = e.clientY - startY;
  drawRadar();
});

window.addEventListener('mouseup', () => { isDragging = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
  zoomRadar(zoomFactor);
}, { passive: false });

function zoomRadar(factor) {
  zoom = Math.max(0.1, Math.min(25.0, zoom * factor));
  drawRadar();
}

function resetRadarView() {
  panX = 0;
  panY = 0;
  zoom = radarMode === 'ground' ? 2.5 : 0.4;
  drawRadar();
}

function toggleRadarMode() {
  radarMode = radarMode === 'ground' ? 'tma' : 'ground';
  const btn = document.getElementById('mode-btn');
  btn.textContent = `MODE: ${radarMode.toUpperCase()}`;
  resetRadarView();
}

// Flight Strips UI
function renderFlightStrips() {
  const container = document.getElementById('flight-strips');
  if (!container) return;
  container.innerHTML = aircraft.map(ac => `
    <div class="bg-slate-950 border border-emerald-950 p-2 rounded text-xs">
      <div class="flex justify-between items-center text-emerald-400 font-bold">
        <span>${ac.id} (${ac.type})</span>
        <span class="text-[10px] text-slate-400">${ac.airline}</span>
      </div>
      <div class="flex justify-between text-[11px] text-slate-400 mt-1">
        <span>STATE: <b class="text-white">${ac.state}</b></span>
        <span>RWY: <b class="text-white">${ac.clearedRwy}</b></span>
      </div>
    </div>
  `).join('');
  document.getElementById('aircraft-count').textContent = `${aircraft.length} Planes`;
}

// Navigation Tabs
function switchTab(tab) {
  currentTab = tab;
  const radarView = document.getElementById('radar-view');
  const academyView = document.getElementById('academy-view');
  const radarBtn = document.getElementById('tab-radar-btn');
  const acadBtn = document.getElementById('tab-academy-btn');

  if (tab === 'radar') {
    radarView.classList.remove('hidden');
    academyView.classList.add('hidden');
    radarBtn.className = "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white";
    acadBtn.className = "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition text-slate-400 hover:text-white";
    resizeCanvas();
  } else {
    radarView.classList.add('hidden');
    academyView.classList.remove('hidden');
    acadBtn.className = "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white";
    radarBtn.className = "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition text-slate-400 hover:text-white";
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

  // Show readback if score >= 55%
  if (res.score >= 55) {
    const rbCont = document.getElementById('readback-container');
    const rbText = document.getElementById('pilot-readback-text');
    rbCont.classList.remove('hidden');
    rbText.textContent = activeLesson.pilot_readback;
    speakPilotReadback(activeLesson.pilot_readback);
  }

  // Update total score
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
  window.addEventListener('resize', resizeCanvas);
  
  try {
    const res = await fetch('/api/airport/wiii');
    airportData = await res.json();
  } catch (e) {
    console.error(e);
  }

  resetRadarView();
  renderFlightStrips();
  resizeCanvas();

  // Try initial setup of recording
  setupRecording();
});
