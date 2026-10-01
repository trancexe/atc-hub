function setLayout(mode) {
  // On mobile (<768px), fallback 'split' to single view ('ground' or last single view)
  const isMobile = window.innerWidth < 768;
  if (isMobile && mode === 'split') {
    mode = currentLayout === 'tma' ? 'tma' : 'ground';
  }

  currentLayout = mode;
  const container = document.getElementById('screens-container');
  const paneGround = document.getElementById('pane-ground');
  const paneTma = document.getElementById('pane-tma');

  const btnSplit = document.getElementById('view-split-btn');
  const btnGround = document.getElementById('view-ground-btn');
  const btnTma = document.getElementById('view-tma-btn');

  [btnSplit, btnGround, btnTma].forEach(b => {
    if (b) b.className = (b === btnSplit ? "hidden md:flex " : "flex ") + "px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition text-slate-400 hover:text-white";
  });

  if (mode === 'split' && !isMobile) {
    container.className = "flex-1 grid grid-cols-2 gap-1 bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "";
    paneTma.style.display = "";
    paneGround.classList.remove('hidden');
    paneTma.classList.remove('hidden');
    paneGround.classList.remove('col-span-2');
    paneTma.classList.remove('col-span-2');
    btnSplit.className = "hidden md:flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'ground') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "flex";
    paneTma.style.display = "none";
    paneGround.classList.remove('hidden');
    paneTma.classList.add('hidden');
    paneGround.classList.add('w-full', 'h-full');
    btnGround.className = "flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
  } else if (mode === 'tma') {
    container.className = "flex-1 flex bg-slate-900 p-1 h-full overflow-hidden";
    paneGround.style.display = "none";
    paneTma.style.display = "flex";
    paneGround.classList.add('hidden');
    paneTma.classList.remove('hidden');
    paneTma.classList.add('w-full', 'h-full');
    btnTma.className = "flex px-2 py-0.5 rounded text-[11px] font-semibold items-center gap-1 transition bg-emerald-600 text-white";
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
  const renderedMacroLabels = new Set((airportData.taxiway_labels || []).map(l => l.ref));
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
    // Skip if already rendered in macro labels to prevent overlapping double-badges
    if (tw.ref && tw.coords.length >= 2 && st.zoom > 1.8 && !renderedMacroLabels.has(tw.ref)) {
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

  // 4d. Runway Crossing Stop Bar Indicator (Only if explicitly required by actual runway intersection)

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
      // Offset holding point label slightly so it never collides with yellow taxiway badges
      ctx.fillText(`HOLD ${hpName}`, p.x + 8, p.y - 6);
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
    // If aircraft has its own calculated taxiway route (from Dijkstra or clearance), prioritize it
    let taxiCoords = null;
    if (selAc.route && selAc.route.length > 1) {
      taxiCoords = selAc.route.map(p => Array.isArray(p) ? p : [p.lat, p.lon]);
    } else {
      const dynRoute = (airportData && airportData.taxi_routes_by_runway && airportData.taxi_routes_by_runway[activeRwyKey])
        ? airportData.taxi_routes_by_runway[activeRwyKey]
        : null;
      if (dynRoute && dynRoute.coords && dynRoute.coords.length > 1) {
        taxiCoords = dynRoute.coords;
      }
    }

    if (taxiCoords && taxiCoords.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
      ctx.lineWidth = Math.max(2.5, 1.8 * st.zoom);
      ctx.setLineDash([6, 6]);
      const r0 = latLonToScreenCoord(taxiCoords[0][0], taxiCoords[0][1], st);
      ctx.moveTo(r0.x, r0.y);
      for (let i = 1; i < taxiCoords.length; i++) {
        const rp = latLonToScreenCoord(taxiCoords[i][0], taxiCoords[i][1], st);
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

  // Milestone 4: Weather Radar Layer (Precipitation reflectivity overlay)
  drawWeatherRadarOverlay(ctx, st);

  // Milestone 5: Tactical Vectors & Separation Ruler Tool
  drawTacticalOverlays(ctx, st);

  // Milestone 6: Draw Holding Pattern Racetracks on Active Holding Fixes
  drawHoldingPatternOverlays(ctx, st);

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

  // Get selected aircraft cleared SID or STAR to highlight ONLY relevant active tactical route
  const selAc = (selectedAircraftIndex >= 0 && selectedAircraftIndex < aircraft.length)
    ? aircraft[selectedAircraftIndex]
    : null;
  const isSelectedArrival = selAc ? ["APPROACH", "FINAL", "LANDED", "TAXI_IN", "PARKED"].includes(selAc.state) : false;
  // If selected is departure: highlight clearedSid; if arrival: highlight clearedStar
  const activeSidId = (selAc && !isSelectedArrival) ? selAc.clearedSid : null;
  const activeStarId = (selAc && isSelectedArrival) ? selAc.clearedStar : null;

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

    // SID Route Label (rendered at midpoint of first leg to avoid waypoint clutter)
    const pA = latLonToScreenCoord(sid.coords[0][0], sid.coords[0][1], st);
    const pB = latLonToScreenCoord(sid.coords[1][0], sid.coords[1][1], st);
    const pm = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    ctx.font = isActive ? "bold 10px 'Share Tech Mono'" : "8px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#fbbf24" : "rgba(245, 158, 11, 0.4)";
    ctx.fillText(`${isActive ? '★ ' : ''}${sid.id}`, pm.x - 12, pm.y - 6);
  });

  // 3. STARs (Standard Terminal Arrival Routes) - Cyan dashed routes
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

    // STAR Route Label (rendered at midpoint of first leg to avoid waypoint clutter)
    const pA = latLonToScreenCoord(star.coords[0][0], star.coords[0][1], st);
    const pB = latLonToScreenCoord(star.coords[1][0], star.coords[1][1], st);
    const pm = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    ctx.font = isActive ? "bold 10px 'Share Tech Mono'" : "8px 'Share Tech Mono'";
    ctx.fillStyle = isActive ? "#67e8f9" : "rgba(6, 182, 212, 0.4)";
    ctx.fillText(`${isActive ? '★ ' : ''}${star.id}`, pm.x + 6, pm.y - 6);
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
    // Milestone 4: QNH vs Standard Pressure Transition Altitude (11,000 ft WIII)
    // Below 11000 ft -> Altitude in feet (e.g. A030), at or above 11000 ft -> Flight Level (e.g. FL120, FL140)
    let altStr = "GND";
    if (ac.altitude > 0) {
      if (ac.altitude >= 11000) {
        altStr = `FL${String(Math.round(ac.altitude/100))}`;
      } else {
        altStr = `A${String(Math.round(ac.altitude/100)).padStart(3, '0')}`;
      }
    }
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

  let lastTouchDist = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  cElem.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      st.isDragging = true;
      hasMovedSignificantly = false;
      const t = e.touches[0];
      dragStartX = t.clientX;
      dragStartY = t.clientY;
      st.startX = t.clientX - st.panX;
      st.startY = t.clientY - st.panY;
    } else if (e.touches.length === 2) {
      // Pinch to zoom start
      e.preventDefault();
      st.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.hypot(dx, dy);
    }
  }, { passive: false });

  cElem.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && st.isDragging) {
      const t = e.touches[0];
      if (Math.abs(t.clientX - dragStartX) > 4 || Math.abs(t.clientY - dragStartY) > 4) {
        hasMovedSignificantly = true;
      }
      st.panX = t.clientX - st.startX;
      st.panY = t.clientY - st.startY;
      renderAllScreens();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastTouchDist > 0 && dist > 0) {
        const factor = dist / lastTouchDist;
        const clampedFactor = Math.max(0.7, Math.min(1.4, factor));
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = cElem.getBoundingClientRect();
        zoomScreen(screenKey, clampedFactor, midX - rect.left, midY - rect.top);
      }
      lastTouchDist = dist;
    }
  }, { passive: false });

  cElem.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      st.isDragging = false;
      lastTouchDist = 0;
    } else if (e.touches.length === 1) {
      // Switched from pinch to single touch
      lastTouchDist = 0;
      st.isDragging = true;
      const t = e.touches[0];
      st.startX = t.clientX - st.panX;
      st.startY = t.clientY - st.panY;
    }
  }, { passive: false });

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
      if (rulerToolActive) {
        if (!rulerSelectedAc1) {
          rulerSelectedAc1 = aircraft[closestAcIdx];
          const pttStatus = document.getElementById('ptt-status');
          if (pttStatus) {
            pttStatus.innerHTML = `<span class="text-emerald-300 font-bold"><i class="fa-solid fa-ruler"></i> Target 1 (${rulerSelectedAc1.callsign}) selected! Now click second aircraft...</span>`;
          }
        } else if (!rulerSelectedAc2 && aircraft[closestAcIdx].id !== rulerSelectedAc1.id) {
          rulerSelectedAc2 = aircraft[closestAcIdx];
          const distNm = calculateDistanceNm(rulerSelectedAc1.lat, rulerSelectedAc1.lon, rulerSelectedAc2.lat, rulerSelectedAc2.lon);
          const pttStatus = document.getElementById('ptt-status');
          if (pttStatus) {
            pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-check"></i> SEPARATION: ${distNm.toFixed(2)} NM (${rulerSelectedAc1.callsign} ↔ ${rulerSelectedAc2.callsign})</span>`;
          }
        } else {
          // Reset anchor to this clicked aircraft
          rulerSelectedAc1 = aircraft[closestAcIdx];
          rulerSelectedAc2 = null;
        }
        renderAllScreens();
        return;
      }
      selectAircraft(closestAcIdx);
    } else {
      // Clicked on empty space: deselect aircraft
      if (!rulerToolActive) {
        selectedAircraftIndex = -1;
        renderFlightStrips();
        updateEasyModePrompter();
        renderAllScreens();
      }
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

