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
    container.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs italic">No flight strips in Bay ${activeStripBayFilter}</div>`;
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
    const csClean = parsed.callsign.toLowerCase().replace(/[^a-z0-9]/g, '');
    matchedAc = aircraft.find(a => {
      const aIdClean = a.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const aCsClean = a.callsign.toLowerCase().replace(/[^a-z0-9]/g, '');
      return aIdClean === csClean || aCsClean === csClean || aCsClean.includes(csClean) || csClean.includes(aCsClean);
    });
  }
  if (!matchedAc) {
    const normClean = norm.replace(/[^a-z0-9]/g, '');
    matchedAc = aircraft.find(a => {
      const aIdClean = a.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const aCsClean = a.callsign.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normClean.includes(aIdClean) || normClean.includes(aCsClean);
    });
  }
  if (!matchedAc) {
    if (norm.includes("garuda") || norm.includes("indonesia")) {
      const numMatch = norm.match(/\b(?:502|880|888)\b/);
      const targetNum = numMatch ? numMatch[0] : "502";
      matchedAc = aircraft.find(a => a.id.includes(targetNum) || a.callsign.includes(targetNum));
    } else if (norm.includes("supergreen") || norm.includes("citilink")) {
      matchedAc = aircraft.find(a => a.id.includes("123") || a.callsign.includes("123"));
    } else if (norm.includes("lion")) {
      const numMatch = norm.match(/\b(?:712|530|650)\b/);
      const targetNum = numMatch ? numMatch[0] : "712";
      matchedAc = aircraft.find(a => a.id.includes(targetNum) || a.callsign.includes(targetNum));
    } else if (norm.includes("batik")) {
      const numMatch = norm.match(/\b(?:650|652)\b/);
      const targetNum = numMatch ? numMatch[0] : "650";
      matchedAc = aircraft.find(a => a.id.includes(targetNum) || a.callsign.includes(targetNum));
    } else if (norm.includes("singapore")) {
      matchedAc = aircraft.find(a => a.id.includes("958") || a.callsign.includes("958"));
    } else if (norm.includes("cargolux")) {
      matchedAc = aircraft.find(a => a.id.includes("742") || a.callsign.includes("742"));
    } else if (norm.includes("superjet")) {
      matchedAc = aircraft.find(a => a.id.includes("182") || a.callsign.includes("182"));
    } else if (norm.includes("wagon")) {
      matchedAc = aircraft.find(a => a.id.includes("751") || a.callsign.includes("751"));
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

    if (matchedAc.state === "GATE" && (intent === "DELIVERY" || norm.includes("cleared to") || norm.includes("clearance") || (norm.includes("cleared") && (norm.includes("surabaya") || norm.includes("bali") || norm.includes("medan") || norm.includes("dolta") || norm.includes("bunto"))))) {
      matchedAc.hasDepartureClearance = true;
      const destName = matchedAc.dest ? matchedAc.dest.replace(/^[A-Z]{4}\s*\((.*?)\)$/, '$1') : "Surabaya";
      const sidName = matchedAc.clearedSid || "DOLTA 1C";
      const flName = matchedAc.initialAlt || "FL140";
      const sqCode = matchedAc.squawk || "4521";
      readback = `Cleared to ${destName} via ${sidName} departure, runway ${rwySpoken}, climb ${flName}, squawk ${sqCode}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} IFR Delivery Clearance`, `Cleared to ${destName} via ${sidName} RWY ${rwySpoken} | Squawk: ${sqCode}`);
      }
      matchedAc.checkInPhrase = `Jakarta Ground, ${matchedAc.callsign}, Gate Echo 1, ready for push and start, facing west.`;
      matchedAc.responsePrompt = `${matchedAc.callsign} push and start approved, facing west`;
      updateEasyModePrompter();
    } else if (matchedAc.state === "GATE" && (intent === "PUSHBACK" || norm.includes("push") || norm.includes("start"))) {
      matchedAc.state = "PUSHBACK";
      readback = "Push and start approved, facing west, " + matchedAc.callsign;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Pushback & Start Approved`, 'Facing West | State -> PUSHBACK');
      }
      executePushbackMovement(matchedAc);
    } else if (matchedAc.state === "READY_TAXI" && (intent === "TAXI" || norm.includes("taxi"))) {
      matchedAc.state = "TAXI";
      matchedAc._runwayCrossCleared = false;

      // Extract spoken taxiway via & target holding point from ATC voice command per Jeppesen 10-6
      const spokenViaList = [];
      const twyDict = [
        // North Parallels & Connectors
        { pattern: /\b(?:november\s+papa\s+(?:1|one)|np\s*1)\b/i, code: "NP1", spoken: "November Papa one" },
        { pattern: /\b(?:november\s+papa\s+(?:2|two)|np\s*2)\b/i, code: "NP2", spoken: "November Papa two" },
        { pattern: /\b(?:november\s+papa\s+(?:3|three)|np\s*3)\b/i, code: "NP3", spoken: "November Papa three" },
        { pattern: /\b(?:november\s+papa\s+whiskey|npw)\b/i, code: "NPW", spoken: "November Papa Whiskey" },
        { pattern: /\b(?:november\s+papa\s+echo|npe)\b/i, code: "NPE", spoken: "November Papa Echo" },
        // North Central Taxilanes
        { pattern: /\b(?:november\s+charlie\s+(?:1|one)|nc\s*1)\b/i, code: "NC1", spoken: "November Charlie one" },
        { pattern: /\b(?:november\s+charlie\s+(?:2|two)|nc\s*2)\b/i, code: "NC2", spoken: "November Charlie two" },
        { pattern: /\b(?:november\s+charlie\s+(?:3|three)|nc\s*3)\b/i, code: "NC3", spoken: "November Charlie three" },
        { pattern: /\b(?:november\s+charlie\s+(?:4|four)|nc\s*4)\b/i, code: "NC4", spoken: "November Charlie four" },
        { pattern: /\b(?:november\s+charlie\s+(?:5|five)|nc\s*5)\b/i, code: "NC5", spoken: "November Charlie five" },
        { pattern: /\b(?:november\s+charlie\s+(?:6|six)|nc\s*6)\b/i, code: "NC6", spoken: "November Charlie six" },
        { pattern: /\b(?:november\s+charlie\s+(?:7|seven)|nc\s*7)\b/i, code: "NC7", spoken: "November Charlie seven" },
        { pattern: /\b(?:november\s+charlie\s+yankee|ncy)\b/i, code: "NCY", spoken: "November Charlie Yankee" },
        { pattern: /\b(?:november\s+charlie\s+zulu|ncz)\b/i, code: "NCZ", spoken: "November Charlie Zulu" },
        { pattern: /\b(?:november\s+charlie\s+(?:9|nine)|nc\s*9)\b/i, code: "NC9", spoken: "November Charlie nine" },
        // Runway 25R / 07L Connectors & Holding Points
        { pattern: /\b(?:november\s+(?:1|one)|n\s*1)\b/i, code: "N1", spoken: "November one", isHp: true },
        { pattern: /\b(?:november\s+(?:2|two)|n\s*2)\b/i, code: "N2", spoken: "November two", isHp: true },
        { pattern: /\b(?:november\s+(?:3|three)|n\s*3)\b/i, code: "N3", spoken: "November three", isHp: true },
        { pattern: /\b(?:november\s+(?:4|four)|n\s*4)\b/i, code: "N4", spoken: "November four" },
        { pattern: /\b(?:november\s+(?:5|five)|n\s*5)\b/i, code: "N5", spoken: "November five" },
        { pattern: /\b(?:november\s+(?:6|six)|n\s*6)\b/i, code: "N6", spoken: "November six" },
        { pattern: /\b(?:november\s+(?:7|seven)|n\s*7)\b/i, code: "N7", spoken: "November seven" },
        { pattern: /\b(?:november\s+(?:8|eight)|n\s*8)\b/i, code: "N8", spoken: "November eight", isHp: true },
        { pattern: /\b(?:november\s+(?:9|nine)|n\s*9)\b/i, code: "N9", spoken: "November nine", isHp: true },
        // South Parallels & Connectors
        { pattern: /\b(?:sierra\s+papa\s+(?:1|one)|sp\s*1)\b/i, code: "SP1", spoken: "Sierra Papa one" },
        { pattern: /\b(?:sierra\s+papa\s+(?:2|two)|sp\s*2)\b/i, code: "SP2", spoken: "Sierra Papa two" },
        { pattern: /\b(?:sierra\s+papa\s+whiskey|spw)\b/i, code: "SPW", spoken: "Sierra Papa Whiskey" },
        { pattern: /\b(?:sierra\s+papa\s+echo|spe)\b/i, code: "SPE", spoken: "Sierra Papa Echo" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:1|one)|sc\s*1)\b/i, code: "SC1", spoken: "Sierra Charlie one" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:2|two)|sc\s*2)\b/i, code: "SC2", spoken: "Sierra Charlie two" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:3|three)|sc\s*3)\b/i, code: "SC3", spoken: "Sierra Charlie three" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:4|four)|sc\s*4)\b/i, code: "SC4", spoken: "Sierra Charlie four" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:5|five)|sc\s*5)\b/i, code: "SC5", spoken: "Sierra Charlie five" },
        { pattern: /\b(?:sierra\s+charlie\s+(?:6|six)|sc\s*6)\b/i, code: "SC6", spoken: "Sierra Charlie six" },
        { pattern: /\b(?:sierra\s+charlie\s+x\-?ray|scx)\b/i, code: "SCX", spoken: "Sierra Charlie X-ray" },
        // Runway 25L / 07R Connectors & Holding Points
        { pattern: /\b(?:sierra\s+(?:1|one)|s\s*1)\b/i, code: "S1", spoken: "Sierra one", isHp: true },
        { pattern: /\b(?:sierra\s+(?:2|two)|s\s*2)\b/i, code: "S2", spoken: "Sierra two", isHp: true },
        { pattern: /\b(?:sierra\s+(?:3|three)|s\s*3)\b/i, code: "S3", spoken: "Sierra three", isHp: true },
        { pattern: /\b(?:sierra\s+(?:4|four)|s\s*4)\b/i, code: "S4", spoken: "Sierra four" },
        { pattern: /\b(?:sierra\s+(?:5|five)|s\s*5)\b/i, code: "S5", spoken: "Sierra five" },
        { pattern: /\b(?:sierra\s+(?:6|six)|s\s*6)\b/i, code: "S6", spoken: "Sierra six" },
        { pattern: /\b(?:sierra\s+(?:7|seven)|s\s*7)\b/i, code: "S7", spoken: "Sierra seven" },
        { pattern: /\b(?:sierra\s+(?:8|eight)|s\s*8)\b/i, code: "S8", spoken: "Sierra eight", isHp: true },
        { pattern: /\b(?:sierra\s+(?:9|nine)|s\s*9)\b/i, code: "S9", spoken: "Sierra nine", isHp: true },
        // West & East Crossovers
        { pattern: /\b(?:whiskey\s+charlie\s+(?:1|one)|wc\s*1)\b/i, code: "WC1", spoken: "Whiskey Charlie one" },
        { pattern: /\b(?:whiskey\s+charlie\s+(?:2|two)|wc\s*2)\b/i, code: "WC2", spoken: "Whiskey Charlie two" },
        { pattern: /\b(?:echo\s+charlie\s+(?:1|one)|ec\s*1)\b/i, code: "EC1", spoken: "Echo Charlie one" },
        { pattern: /\b(?:echo\s+charlie\s+(?:2|two)|ec\s*2)\b/i, code: "EC2", spoken: "Echo Charlie two" },
        // Runway 3 Connectors (24 / 06)
        { pattern: /\b(?:mike\s+(?:1|one)|m\s*1)\b/i, code: "M1", spoken: "Mike one", isHp: true },
        { pattern: /\b(?:mike\s+(?:2|two)|m\s*2)\b/i, code: "M2", spoken: "Mike two" },
        { pattern: /\b(?:mike\s+(?:7|seven)|m\s*7)\b/i, code: "M7", spoken: "Mike seven", isHp: true },
        { pattern: /\b(?:mike\s+(?:8|eight)|m\s*8)\b/i, code: "M8", spoken: "Mike eight", isHp: true }
      ];

      // Check for explicit "avoid" taxiway instructions (e.g. "avoid NP1", "do not use NP1")
      const avoidList = [];
      const avoidMatch = norm.match(/\b(?:avoid|do\s*not\s*use)\s+([a-z0-9\s]+?)(?=\s+(?:via|to|and|runway)|$)/i);
      if (avoidMatch) {
        const avoidPhrase = avoidMatch[1];
        for (const twy of twyDict) {
          if (twy.pattern && twy.pattern.test(avoidPhrase)) {
            avoidList.push(twy.code);
          }
        }
      }
      matchedAc.avoidTaxiways = avoidList;

      // Extract spoken taxiways in chronological order of appearance in the sentence
      const detectedIndices = [];
      for (const twy of twyDict) {
        if (twy.pattern) {
          const m = norm.match(twy.pattern);
          if (m && m.index !== undefined) {
            // Check if this taxiway was part of the avoid clause
            if (!avoidList.includes(twy.code)) {
              detectedIndices.push({ idx: m.index, twy });
            }
          }
        }
      }
      detectedIndices.sort((a, b) => a.idx - b.idx);
      detectedIndices.forEach(item => {
        if (!spokenViaList.some(v => v.code === item.twy.code)) {
          spokenViaList.push(item.twy);
        }
      });

      // Detect commanded holding point from the spoken taxiways (e.g. N2, N1, N9, S1, S8)
      let designatedHp = null;
      for (let i = spokenViaList.length - 1; i >= 0; i--) {
        if (spokenViaList[i].isHp) {
          designatedHp = spokenViaList[i];
          break;
        }
      }

      let activeHpName = designatedHp ? designatedHp.code : hpName;
      matchedAc.assignedHp = activeHpName;

      let taxiRouteSpoken = activeHpName;
      if (spokenViaList.length > 0) {
        matchedAc.assignedTaxiVia = spokenViaList.map(item => item.code);
        taxiRouteSpoken = spokenViaList.map(item => item.spoken).join(", ");
      } else {
        const autoTaxi = (typeof getAutoSuggestTaxiRoute === "function") ? getAutoSuggestTaxiRoute(matchedAc) : null;
        if (autoTaxi && autoTaxi.via) {
          matchedAc.assignedTaxiVia = autoTaxi.via;
          taxiRouteSpoken = autoTaxi.text || autoTaxi.via.join(", ");
          if (autoTaxi.hp) {
            matchedAc.assignedHp = autoTaxi.hp;
            activeHpName = autoTaxi.hp;
          }
        }
      }

      readback = `Taxi holding point runway ${rwySpoken} via ${taxiRouteSpoken}, ${matchedAc.callsign}`;
      if (typeof logTelemetry === 'function') {
        logTelemetry('BEHAVIOR', `${matchedAc.id} Taxi Clearance Granted`, `Holding Point: ${activeHpName} (RWY ${rwySpoken}) via ${taxiRouteSpoken} | State -> TAXI`);
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
    } else if ((norm.includes("leave hold") || norm.includes("resume approach") || norm.includes("cancel hold")) && matchedAc.altitude > 100) {
      const idx = aircraft.findIndex(a => a.id === matchedAc.id);
      readback = leaveHoldingPattern(idx);
    } else if ((norm.includes("hold") || norm.includes("holding")) && !norm.includes("holding point") && !norm.includes("hold short") && matchedAc.altitude > 100) {
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
