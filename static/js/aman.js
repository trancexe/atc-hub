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
  ac.holdPhase = "INBOUND"; // INBOUND -> TURN1 -> OUTBOUND -> TURN2
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

  // Move aircraft towards holding fix if far
  ac.lat = fix.lat;
  ac.lon = fix.lon;

  // Start Racetrack Holding Flight Loop (1-minute inbound, 1-minute outbound, standard rate turns)
  startHoldingFlightLoop(ac, fix);

  if (typeof logTelemetry === 'function') {
    logTelemetry('BEHAVIOR', `${ac.id} Entered Holding Pattern`, `Fix: ${fix.name} | Level: ${level} | Racetrack Inbound ${fix.inboundHdg}° ${fix.turnDir}`);
  }

  const readback = `Hold at ${fix.name}, inbound track ${fix.inboundHdg} degrees, ${fix.turnDir.toLowerCase()} hand pattern, maintain ${level}, ${ac.callsign}`;
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

  const turnRateDegSec = 3.0; // Standard Rate Turn (3 deg/sec = 360 deg in 2 minutes)
  const outboundHdg = (fix.inboundHdg + 180) % 360;

  ac._holdInterval = setInterval(() => {
    if (!ac.isHolding || ac.state !== "HOLDING_AIR") {
      clearInterval(ac._holdInterval);
      ac._holdInterval = null;
      return;
    }

    ac.holdPhaseTimer += 1;

    // 4 phases of standard 4-minute racetrack holding pattern:
    // 0-60s: Inbound Leg (heading inbound to fix)
    // 60-120s: Turn to Outbound (rate one turn 180°)
    // 120-180s: Outbound Leg (heading outbound away from fix)
    // 180-240s: Turn to Inbound (rate one turn 180° back to fix)
    const t = ac.holdPhaseTimer % 240;

    if (t < 60) {
      ac.holdPhase = "INBOUND LEG";
      ac.heading = fix.inboundHdg;
    } else if (t < 120) {
      ac.holdPhase = "TURN TO OUTBOUND";
      const turnProgress = (t - 60) / 60.0;
      const turnDelta = turnProgress * 180.0;
      ac.heading = Math.round((fix.inboundHdg + (fix.turnDir === "RIGHT" ? turnDelta : -turnDelta) + 360) % 360);
    } else if (t < 180) {
      ac.holdPhase = "OUTBOUND LEG";
      ac.heading = outboundHdg;
    } else {
      ac.holdPhase = "TURN TO INBOUND";
      const turnProgress = (t - 180) / 60.0;
      const turnDelta = turnProgress * 180.0;
      ac.heading = Math.round((outboundHdg + (fix.turnDir === "RIGHT" ? turnDelta : -turnDelta) + 360) % 360);
    }

    // Kinematic motion during holding
    const spdNmSec = (ac.groundSpeed || 210) / 3600.0;
    const rad = (ac.heading - 90) * (Math.PI / 180);
    const dLat = (Math.sin(rad) * spdNmSec) / 60.0;
    const dLon = (Math.cos(rad) * spdNmSec) / (60.0 * Math.cos(ac.lat * Math.PI / 180));
    ac.lat += dLat * 0.05;
    ac.lon += dLon * 0.05;

    // Decrement hold expectancy timer
    if (ac.holdRemainingMinutes > 0) {
      ac.holdRemainingMinutes = Math.max(0, ac.holdRemainingMinutes - 1 / 60.0);
    }
  }, 1000);
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

  const readback = `Leave holding, resume approach runway ${ac.clearedRwy}, descend and maintain 3000 feet, ${ac.callsign}`;
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

  // Render Holding Stack Visualizer
  if (stackEl) {
    const holdingAc = sequence.filter(s => s.isHolding);
    if (holdingAc.length === 0) {
      stackEl.innerHTML = '<div class="text-slate-500 text-[10px] italic p-1 text-center">Tidak ada pesawat yang sedang holding.</div>';
    } else {
      const levels = ["FL140", "FL130", "FL120", "FL110", "FL100"];
      stackEl.innerHTML = levels.map(fl => {
        const atFl = holdingAc.filter(h => h.holdLevel === fl);
        return `
          <div class="flex items-center text-[10px] border-b border-slate-800/60 py-0.5">
            <span class="w-12 font-mono font-bold text-slate-400">${fl}</span>
            <div class="flex-1 flex gap-1 items-center">
              ${atFl.length > 0
                ? atFl.map(h => `<span class="px-1.5 py-0.2 rounded bg-purple-950 border border-purple-700 text-purple-300 font-mono font-bold">${h.id} (${h.holdFix || 'TEGID'})</span>`).join('')
                : '<span class="text-slate-600 text-[9px]">— empty slot —</span>'
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
    ctx.fillText(`HOLD ${fix.name}`, pFix.x + 8, pFix.y + 3);

    // Draw Racetrack shape centered on fix
    // Inbound leg length ~4 NM (~1 minute at 210 kts)
    const legLenPx = (4.0 / 60) * BASE_SCALE * st.zoom;
    const radInbound = (fix.inboundHdg - 90) * (Math.PI / 180);
    const radTurn = radInbound + (fix.turnDir === "RIGHT" ? Math.PI / 2 : -Math.PI / 2);
    const turnRadiusPx = (1.5 / 60) * BASE_SCALE * st.zoom; // ~1.5 NM standard turn radius

    ctx.strokeStyle = hasHoldingAc ? "#c084fc" : "rgba(168, 85, 247, 0.25)";
    ctx.lineWidth = hasHoldingAc ? 2.0 : 1.0;
    if (!hasHoldingAc) ctx.setLineDash([4, 4]);

    ctx.beginPath();
    // Inbound Leg: from outbound turn exit to fix
    const inStart = {
      x: pFix.x - Math.cos(radInbound) * legLenPx,
      y: pFix.y - Math.sin(radInbound) * legLenPx
    };
    ctx.moveTo(inStart.x, inStart.y);
    ctx.lineTo(pFix.x, pFix.y);

    // Turn 1 at fix: turn 180 deg to outbound
    const centerTurn1 = {
      x: pFix.x + Math.cos(radTurn) * turnRadiusPx,
      y: pFix.y + Math.sin(radTurn) * turnRadiusPx
    };
    const outStart = {
      x: centerTurn1.x + Math.cos(radTurn) * turnRadiusPx,
      y: centerTurn1.y + Math.sin(radTurn) * turnRadiusPx
    };
    ctx.lineTo(outStart.x, outStart.y);

    // Outbound Leg: parallel back
    const outEnd = {
      x: outStart.x - Math.cos(radInbound) * legLenPx,
      y: outStart.y - Math.sin(radInbound) * legLenPx
    };
    ctx.lineTo(outEnd.x, outEnd.y);
    // Turn 2 back to Inbound
    ctx.lineTo(inStart.x, inStart.y);
    ctx.stroke();

    // If active holding, draw level stack count badge
    if (hasHoldingAc) {
      ctx.fillStyle = "#9333ea";
      ctx.beginPath();
      ctx.arc(pFix.x, pFix.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px 'Share Tech Mono'";
      ctx.fillText(`${holdingAtFix.length}`, pFix.x - 2, pFix.y + 3);
    }

    ctx.restore();
  });
}
