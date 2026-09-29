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
