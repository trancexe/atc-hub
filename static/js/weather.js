function toggleWeatherRadar() {
  showWeatherRadar = !showWeatherRadar;
  const btn = document.getElementById('btn-toggle-wx');
  if (btn) {
    btn.textContent = showWeatherRadar ? "WX: ON" : "WX: OFF";
    btn.className = showWeatherRadar 
      ? "px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-600/80 text-sky-300 font-bold hover:bg-sky-900 mr-1 text-[10px]"
      : "px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-500 font-bold hover:bg-slate-700 mr-1 text-[10px]";
  }
  renderAllScreens();
}

function calculateWindComponents(rwyHeading, windDir, windSpd) {
  const diffRad = (windDir - rwyHeading) * Math.PI / 180;
  const headwind = Math.round(windSpd * Math.cos(diffRad));
  const crosswind = Math.round(Math.abs(windSpd * Math.sin(diffRad)));
  const tailwind = -headwind;
  return { headwind, crosswind, tailwind };
}

function getRecommendedRunwayConfig(weather = currentWeather) {
  // WIII Primary Runways: 25R/25L (Heading 250) vs 07L/07R (Heading 070)
  const comp25 = calculateWindComponents(250, weather.windDir, weather.windSpd);
  const comp07 = calculateWindComponents(70, weather.windDir, weather.windSpd);
  
  // ICAO Annex 14 recommendation: Runway switch advised when tailwind exceeds 10 knots
  if (comp25.tailwind > 10 || comp07.headwind > comp25.headwind + 8) {
    return {
      config: "07_OPS",
      name: "Operations East (Runway 07L / 07R)",
      primaryDep: "07L",
      primaryArr: "07R",
      headwind: comp07.headwind,
      crosswind: comp07.crosswind,
      tailwindOn25: comp25.tailwind,
      reason: `Tailwind ${comp25.tailwind}KT on 25R/L exceeds 10KT threshold.`
    };
  }
  
  return {
    config: "25_OPS",
    name: "Operations West (Runway 25R / 25L)",
    primaryDep: "25R",
    primaryArr: "25L",
    headwind: comp25.headwind,
    crosswind: comp25.crosswind,
    tailwindOn25: comp25.tailwind,
    reason: `Favorable headwind ${comp25.headwind}KT on 25R/L.`
  };
}

function setWeatherPreset(presetKey) {
  const preset = WEATHER_PRESETS[presetKey];
  if (!preset) return;
  currentWeather = Object.assign({}, preset);

  // Increment ATIS identifier letter: A -> B -> C...
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const curIdx = letters.indexOf(atisInfoLetter);
  atisInfoLetter = letters[(curIdx + 1) % letters.length];

  updateWeatherHeaderDisplay();

  const rec = getRecommendedRunwayConfig(currentWeather);
  console.log(`[WEATHER SHIFT] Preset ${presetKey} activated: ${preset.metarRaw}`);
  console.log(`[RUNWAY ADVISORY] ${rec.name} (${rec.reason})`);

  // Prompt controller if active runway assignment on strip differs from optimal
  if (aircraft.length > 0 && rec.config === "07_OPS" && aircraft[0].clearedRwy.startsWith("25")) {
    const pttStatus = document.getElementById('ptt-status');
    if (pttStatus) {
      pttStatus.innerHTML = `<span class="text-amber-300 font-bold animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> ADVISORY: ANGIN ${String(currentWeather.windDir).padStart(3, '0')}/${currentWeather.windSpd}KT. DISARANKAN BERALIH KE RUNWAY 07L/07R!</span>`;
    }
  }

  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();
}

function updateWeatherHeaderDisplay() {
  const bar = document.getElementById('metar-bar');
  if (bar) {
    const gustStr = currentWeather.gust ? `G${currentWeather.gust}` : "";
    bar.textContent = `QNH ${currentWeather.qnh} | WIND ${String(currentWeather.windDir).padStart(3, '0')}/${String(currentWeather.windSpd).padStart(2, '0')}${gustStr}KT | VIS ${currentWeather.visStr}`;
  }
}

function generateAtisReport(weather = currentWeather, infoLetter = atisInfoLetter) {
  const rec = getRecommendedRunwayConfig(weather);
  const depRwyPhonetic = rec.primaryDep === "25R" ? "two five right" : (rec.primaryDep === "07L" ? "zero seven left" : rec.primaryDep);
  const arrRwyPhonetic = rec.primaryArr === "25L" ? "two five left" : (rec.primaryArr === "07R" ? "zero seven right" : rec.primaryArr);
  
  // Digit expansion
  const windDirWords = String(weather.windDir).padStart(3, '0').split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const windSpdWords = String(weather.windSpd).split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');
  const qnhWords = String(weather.qnh).split('').map(d => ["zero","one","two","three","four","five","six","seven","eight","nine"][parseInt(d)]).join(' ');

  const letterNames = {
    'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo',
    'F': 'Foxtrot', 'G': 'Golf', 'H': 'Hotel', 'I': 'India', 'J': 'Juliet',
    'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November', 'O': 'Oscar'
  };
  const phoneticLetter = letterNames[infoLetter] || infoLetter;

  let report = `Soekarno-Hatta Information ${phoneticLetter}. `;
  report += `Runway in use departure ${depRwyPhonetic}, arrival ${arrRwyPhonetic}. `;
  report += `Transition level one two zero. `;
  report += `Wind ${windDirWords} degrees, ${windSpdWords} knots. `;
  if (weather.gust) report += `Gusting ${weather.gust} knots. `;
  report += `Visibility ${weather.visStr}. `;
  if (weather.weatherCond !== "NIL") report += `Weather condition ${weather.weatherCond}. `;
  report += `Temperature ${weather.tempC}, dew point ${weather.dewC}. `;
  report += `QNH ${qnhWords} hectopascals. `;
  if (weather.separationMinNm > 3.0) {
    report += `Caution, radar separation increased to five miles due to weather. `;
  }
  report += `Advise controller on initial contact you have information ${phoneticLetter}.`;
  return report;
}

async function playAtisBroadcast() {
  const btn = document.getElementById('btn-listen-atis');
  if (atisAudioPlaying) {
    if (atisAudioElement) {
      atisAudioElement.pause();
      atisAudioElement = null;
    }
    atisAudioPlaying = false;
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400"></i> ATIS`;
      btn.classList.remove('bg-amber-600', 'text-white');
    }
    updateActiveFrequencyDisplay();
    return;
  }

  atisAudioPlaying = true;
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-circle-stop text-amber-400 animate-pulse"></i> ATIS [128.0]`;
    btn.classList.add('bg-amber-600', 'text-white');
  }

  // Update VHF panel to indicate ATIS 128.000 MHz monitoring
  const lbl = document.getElementById('active-freq-label');
  const tag = document.getElementById('active-sector-tag');
  if (lbl && tag) {
    lbl.textContent = FREQUENCIES.ATIS;
    tag.textContent = `ATIS ${atisInfoLetter}`;
    tag.className = "ml-1.5 text-[9px] px-1 py-0.2 rounded bg-amber-900/80 text-amber-200 font-mono";
  }

  const atisText = generateAtisReport();
  const recEl = document.getElementById('recognized-text');
  if (recEl) recEl.textContent = `[ATIS 128.0 MHz]: "${atisText}"`;

  try {
    const audioUrl = `/api/audio/tts?text=${encodeURIComponent(atisText)}&voice=en-US-GuyNeural`;
    atisAudioElement = new Audio(audioUrl);
    atisAudioElement.volume = 0.9;
    
    await new Promise((resolve) => {
      atisAudioElement.onended = resolve;
      atisAudioElement.onerror = resolve;
      atisAudioElement.play().catch(resolve);
    });
  } catch (e) {
    console.warn("[ATIS] Broadcast error:", e);
  } finally {
    atisAudioPlaying = false;
    atisAudioElement = null;
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400"></i> ATIS`;
      btn.classList.remove('bg-amber-600', 'text-white');
    }
    updateActiveFrequencyDisplay();
  }
}

// Weather Radar Display Overlay (Canvas Precipitation Cells)
function drawWeatherRadarOverlay(ctx, st) {
  if (!showWeatherRadar || !currentWeather) return;

  // If Low Visibility Fog, draw a subtle atmospheric mist over the center
  if (currentWeather.visMeters < 1500) {
    const c = latLonToScreenCoord(refLat, refLon, st);
    const fogGrad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 140 * st.zoom * 10);
    fogGrad.addColorStop(0, "rgba(226, 232, 240, 0.16)");
    fogGrad.addColorStop(0.6, "rgba(203, 213, 225, 0.08)");
    fogGrad.addColorStop(1, "rgba(203, 213, 225, 0)");
    ctx.fillStyle = fogGrad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 140 * st.zoom * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (currentWeather.rainIntensity > 0) {
    ctx.save();
    const intensity = currentWeather.rainIntensity;

    // Slowly drift cells along wind direction
    const windRad = (currentWeather.windDir * Math.PI) / 180;
    const driftSpeed = (currentWeather.windSpd * 0.0000008);

    weatherRadarCells.forEach((cell, idx) => {
      cell.lat += Math.cos(windRad) * driftSpeed;
      cell.lon += Math.sin(windRad) * driftSpeed;

      // Wrap around bounds to keep rain cells inside TMA
      if (cell.lat > -5.60) cell.lat = -6.50;
      if (cell.lat < -6.50) cell.lat = -5.60;
      if (cell.lon > 107.40) cell.lon = 106.10;
      if (cell.lon < 106.10) cell.lon = 107.40;

      const p = latLonToScreenCoord(cell.lat, cell.lon, st);
      const rPx = (cell.rNm / 60) * BASE_SCALE * st.zoom;

      // Multi-tier radar precipitation echo rings:
      // Outer: Green (Light rain / 30 dBZ)
      ctx.beginPath();
      ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 197, 94, ${0.18 * intensity})`;
      ctx.fill();

      // Mid: Yellow/Amber (Moderate / 40 dBZ)
      if (cell.intensity > 0.4) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rPx * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(234, 179, 8, ${0.28 * intensity})`;
        ctx.fill();
      }

      // Core: Red/Magenta (Severe convective thunderstorm cell / 50+ dBZ)
      if (cell.intensity > 0.7) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rPx * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.40 * intensity})`;
        ctx.fill();

        // Flashing storm center marker
        if (Math.floor(Date.now() / 600) % 2 === 0) {
          ctx.font = "bold 9px 'Share Tech Mono'";
          ctx.fillStyle = "#fca5a5";
          ctx.fillText("⚡ TS CELL", p.x - 20, p.y - 4);
        }
      }
    });
    ctx.restore();
  }

  // Wind Rose Tactical Overlay in Top-Left of TMA
  ctx.save();
  const wxBoxX = 14;
  const wxBoxY = st.height - 48;
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1;
  ctx.fillRect(wxBoxX, wxBoxY, 150, 40);
  ctx.strokeRect(wxBoxX, wxBoxY, 150, 40);

  ctx.font = "bold 10px 'Share Tech Mono'";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(`WIND: ${String(currentWeather.windDir).padStart(3, '0')}° / ${currentWeather.windSpd}KT`, wxBoxX + 8, wxBoxY + 16);
  ctx.font = "9px 'Share Tech Mono'";
  ctx.fillStyle = currentWeather.separationMinNm > 3.0 ? "#f87171" : "#94a3b8";
  ctx.fillText(`MIN SEP: ${currentWeather.separationMinNm.toFixed(1)} NM ${currentWeather.separationMinNm > 3.0 ? '(WX EXPAND)' : '(ICAO)'}`, wxBoxX + 8, wxBoxY + 30);

  ctx.restore();
}

// Ground collision avoidance check (Wingspan separation & conflict detection)
// Returns true if there is a conflict ahead and this aircraft must hold/brake
