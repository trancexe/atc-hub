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
      pttStatus.innerHTML = `<span class="text-emerald-300 font-bold"><i class="fa-solid fa-ruler"></i> TACTICAL RULER: Click first aircraft, then click second aircraft on radar to measure separation!</span>`;
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

