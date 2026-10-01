// ATC HUB - Milestone 7: Interactive Scenario-Driven Flight Academy

// 6 Interactive Hands-on Training Scenarios with live simulation spawning & objective tracking
const INTERACTIVE_SCENARIOS = [
  {
    id: "lesson-1",
    num: 1,
    title: "Lesson 1: Radar Introduction & Target Selection",
    category: "Radar Basics",
    desc: "Hands-on practice selecting aircraft on radar/strip, reading data blocks, and identifying squawk codes.",
    instruction: "Click the flight strip or click the aircraft symbol <b>GIA502</b> on the radar scope to select active target.",
    targetPhrase: "Click strip GIA502",
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
    successMessage: "Great job! Target GIA502 selected. Data block is active and ready for control instructions."
  },
  {
    id: "lesson-2",
    num: 2,
    title: "Lesson 2: PTT Radio Comms & IFR Clearance",
    category: "Radio Phraseology",
    desc: "Hands-on practice holding SPACEBAR (PTT) and speaking into microphone or pressing Send ATC to issue IFR clearance.",
    instruction: "Select <b>GIA502</b>, then speak into Mic or press Send ATC:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521\"</span>",
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
    successMessage: "Pilot GIA502 read back official clearance and squawked 4521! IFR clearance successful."
  },
  {
    id: "lesson-3",
    num: 3,
    title: "Lesson 3: Ground Control — Pushback & Taxi",
    category: "Ground Control",
    desc: "Instruct aircraft to push back and taxi to Runway 25R holding point.",
    instruction: "Speak into mic or send clearance:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 push and start approved, facing west\"</span> then upon pushback completion grant <span class='text-sky-300 font-bold'>\"Indonesia 502 taxi to holding point runway 25R\"</span>",
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
    successMessage: "Aircraft GIA502 pushed back from gate and commenced taxi towards holding point!"
  },
  {
    id: "lesson-4",
    num: 4,
    title: "Lesson 4: Tower Control — Line Up & Takeoff",
    category: "Tower Control",
    desc: "Authorize aircraft to enter active runway and issue takeoff clearance when clear.",
    instruction: "GIA502 is at holding point 25R. Issue takeoff clearance:<br><span class='text-amber-300 font-bold'>\"Indonesia 502 runway 25R cleared for takeoff\"</span>",
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
    successMessage: "GIA502 rolling full throttle, airborne and climbing out towards initial altitude!"
  },
  {
    id: "lesson-5",
    num: 5,
    title: "Lesson 5: Approach Control — ILS Clearance",
    category: "Approach Control",
    desc: "Guide inbound arrival aircraft approaching localizer to intercept glide slope and land.",
    instruction: "Lion Inter 650 is in TMA approaching runway 25L. Issue ILS clearance:<br><span class='text-amber-300 font-bold'>\"Lion Inter 650 descend to 3000 feet, cleared ILS runway 25L\"</span>",
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
    successMessage: "LNI650 intercepted localizer and ILS glide slope for Runway 25L descending to 3000 ft!"
  },
  {
    id: "lesson-6",
    num: 6,
    title: "Lesson 6: Emergency Handling — Go-Around",
    category: "Emergency & Safety",
    desc: "Runway obstructed! Abort aircraft landing on short final with emergency Go-Around instruction.",
    instruction: "Garuda 502 is on short final but runway is not sterilized. Immediately instruct:<br><span class='text-red-400 font-bold'>\"Indonesia 502 go around!\"</span>",
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
    successMessage: "Aircraft promptly initiated go-around, climbing steeply to 3000 ft clear of runway!"
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
            <span class="text-[10px] font-mono text-amber-400 font-bold">HANDS-ON DRILL</span>
          </div>
          <h4 class="text-sm font-bold text-white font-radar mt-2 group-hover:text-emerald-400 transition">${s.title}</h4>
          <p class="text-xs text-slate-400 mt-1 leading-relaxed">${s.desc}</p>
        </div>
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span class="text-[10px] text-slate-500 font-mono"><i class="fa-solid fa-plane-departure text-emerald-500 mr-1"></i>Live Scenario</span>
          <button onclick="startHandsOnScenario('${s.id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold font-radar flex items-center gap-1.5 shadow transition active:scale-95">
            <i class="fa-solid fa-gamepad text-[11px]"></i> Launch Mission
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
        <span class="text-xs font-bold text-amber-400 uppercase tracking-wider"><i class="fa-solid fa-crosshairs mr-1"></i>PRACTICE MISSION: ${scenario.title}</span>
      </div>
      <button onclick="quitPracticeScenario()" class="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800" title="Abort Mission">
        <i class="fa-solid fa-xmark"></i> Abort
      </button>
    </div>
    <div class="text-xs text-slate-200 leading-relaxed font-sans mb-2">
      ${scenario.instruction}
    </div>
    <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
      <span class="text-slate-400 font-mono">Mission Status: <b class="text-amber-400 animate-pulse">AWAITING YOUR ACTION...</b></span>
      <button onclick="autoExecuteScenarioHelp()" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold font-mono text-[10px]" title="Auto transmit target clearance">
        <i class="fa-solid fa-bolt mr-1"></i>Auto Transmit
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
        <span class="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">Mission Successfully Completed!</span>
        <h3 class="text-lg font-bold text-white mt-2">${scenario.title}</h3>
        <p class="text-xs text-slate-300 mt-1 leading-relaxed font-sans">
          ${scenario.successMessage}
        </p>
      </div>
      <div class="pt-2 flex items-center justify-center gap-3">
        <button onclick="quitPracticeScenario()" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono">
          Close
        </button>
        <button onclick="nextPracticeScenario('${scenario.id}')" class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono shadow-lg flex items-center gap-1.5">
          Next Mission <i class="fa-solid fa-arrow-right"></i>
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
