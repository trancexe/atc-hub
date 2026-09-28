function playAlertChirp() {
  const now = Date.now();
  if (now - lastAlertChirpTime < 2500) return; // Rate limit chirp to once every 2.5s
  lastAlertChirpTime = now;
  try {
    const actx = getAudioContext();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, actx.currentTime); // A5 alert tone
    osc.frequency.setValueAtTime(440, actx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, actx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, actx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.25);
  } catch (e) {}
}

function checkAirborneConflicts() {
  const conflictingIds = new Set();
  const msawIds = new Set();
  const stcaPairs = [];

  const airborne = aircraft.filter(a => a.altitude > 150 && !["PARKED", "GATE", "PUSHBACK", "TAXI", "READY_TAXI"].includes(a.state));

  for (let i = 0; i < airborne.length; i++) {
    const a1 = airborne[i];

    // MSAW Check: Minimum Safe Altitude in WIII TMA is 2000 ft (except on final approach intercept below 10 NM)
    const distToWiii = calculateDistanceNm(a1.lat, a1.lon, refLat, refLon);
    if (a1.altitude < 1800 && distToWiii > 7.5 && a1.state !== "FINAL") {
      msawIds.add(a1.id);
    }

    // STCA Pairwise Check (Current & 60-second Lookahead Vector)
    for (let j = i + 1; j < airborne.length; j++) {
      const a2 = airborne[j];

      // 1. Current Separation
      const currentDistNm = calculateDistanceNm(a1.lat, a1.lon, a2.lat, a2.lon);
      const currentAltDiff = Math.abs(a1.altitude - a2.altitude);

      // 2. Predictive 60s Lookahead (Forward vector extrapolation)
      // Heading: 0 = North, 90 = East, 180 = South, 270 = West
      const lookaheadSec = 60;
      const rad1 = (a1.heading * Math.PI) / 180;
      const rad2 = (a2.heading * Math.PI) / 180;
      const distNm1 = ((a1.groundSpeed || 200) / 3600) * lookaheadSec;
      const distNm2 = ((a2.groundSpeed || 200) / 3600) * lookaheadSec;

      // 1 deg lat = 60 NM; 1 deg lon = 60 * cos(lat) NM
      const predLat1 = a1.lat + (distNm1 * Math.cos(rad1)) / 60;
      const predLon1 = a1.lon + (distNm1 * Math.sin(rad1)) / (60 * Math.cos((a1.lat * Math.PI) / 180));
      const predLat2 = a2.lat + (distNm2 * Math.cos(rad2)) / 60;
      const predLon2 = a2.lon + (distNm2 * Math.sin(rad2)) / (60 * Math.cos((a2.lat * Math.PI) / 180));

      const predDistNm = calculateDistanceNm(predLat1, predLon1, predLat2, predLon2);

      // Standard ICAO TMA Separation: 3.0 NM horizontal (increases to 5.0 NM in Tropical Storm / LVP) & 1,000 ft vertical
      const reqSepNm = (typeof currentWeather !== 'undefined' && currentWeather && currentWeather.separationMinNm) ? currentWeather.separationMinNm : 3.0;
      const isLossOfSeparation = (currentDistNm < reqSepNm && currentAltDiff < 1000);
      const isPredictedConflict = (predDistNm < reqSepNm && currentAltDiff < 1000);

      if (isLossOfSeparation || isPredictedConflict) {
        conflictingIds.add(a1.id);
        conflictingIds.add(a2.id);
        stcaPairs.push({
          ac1: a1,
          ac2: a2,
          distNm: currentDistNm,
          predictedDistNm: predDistNm,
          isImmediate: isLossOfSeparation
        });
      }
    }
  }

  if (stcaPairs.length > 0 || msawIds.size > 0) {
    playAlertChirp();
  }

  return { conflictingIds, msawIds, stcaPairs };
}

function calculateDistanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in NM
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLam = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLam / 2) * Math.sin(dLam / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance in meters on ground
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  return calculateDistanceNm(lat1, lon1, lat2, lon2) * 1852.0;
}

// ========================================================
// MILESTONE 5: TACTICAL CONFLICT RESOLUTION & RULER ENGINE
// ========================================================

let rulerToolActive = false;
let rulerSelectedAc1 = null;
let rulerSelectedAc2 = null;

