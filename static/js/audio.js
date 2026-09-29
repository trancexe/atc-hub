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
