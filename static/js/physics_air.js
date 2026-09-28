function checkGroundConflictAhead(currentAc, targetLat, targetLon) {
  for (const other of aircraft) {
    if (other.id === currentAc.id) continue;
    // Only check conflict with aircraft that are also on ground
    if (other.altitude > 100) continue;

    // Skip conflict check if the other aircraft is parked at a gate stand and not moving
    if (other.state === "PARKED" || (other.state === "GATE" && other.groundSpeed === 0)) {
      continue;
    }

    // Direct distance between both aircraft centers
    const distBetweenMeters = calculateDistanceMeters(currentAc.lat, currentAc.lon, other.lat, other.lon);
    // Distance from other aircraft to our intended next node / trajectory
    const distTargetMeters = calculateDistanceMeters(targetLat, targetLon, other.lat, other.lon);

    // If another aircraft is within safe wingtip cushion (70 meters) in front of us
    if (distBetweenMeters < 70 || distTargetMeters < 50) {
      // Determine if other aircraft is ahead in our travel vector
      const myBearing = currentAc.heading * Math.PI / 180;
      const dLat = other.lat - currentAc.lat;
      const dLon = (other.lon - currentAc.lon) * Math.cos(currentAc.lat * Math.PI / 180);
      const dot = Math.sin(myBearing) * dLon + Math.cos(myBearing) * dLat;
      
      // If other aircraft is in front (dot > -0.0001) or dangerously close (<45m), hold brakes!
      if (dot > -0.0001 || distBetweenMeters < 45) {
        return true;
      }
    }
  }
  return false;
}

function calculateDepartureClimbPath(startLat, startLon, startHdg, sidPoints) {
  if (!sidPoints || sidPoints.length === 0) return [];
  const firstFix = sidPoints[0];
  
  // Calculate initial departure climb vector straight ahead on runway heading
  // (Standard Instrument Departure: maintain runway heading to DER + 2-3 NM until reaching safe altitude)
  const radHdg = (90 - startHdg) * (Math.PI / 180);
  const straightDistDeg = 0.035; // ~2.1 NM
  const derLat = startLat + Math.sin(radHdg) * straightDistDeg;
  const derLon = startLon + Math.cos(radHdg) * straightDistDeg;

  // Build a smooth cubic Bezier turning arc from (derLat, derLon) to first SID fix (CKG VOR)
  // Control point 1: Continuing along runway heading forward
  const ctrl1Dist = 0.045;
  const ctrl1Lat = derLat + Math.sin(radHdg) * ctrl1Dist;
  const ctrl1Lon = derLon + Math.cos(radHdg) * ctrl1Dist;

  // Control point 2: Inbound tangent to first SID fix
  const targetLat = firstFix.lat;
  const targetLon = firstFix.lon;
  const dAngle = Math.atan2(targetLat - ctrl1Lat, targetLon - ctrl1Lon);
  const ctrl2Dist = 0.045;
  const ctrl2Lat = targetLat - Math.sin(dAngle) * ctrl2Dist;
  const ctrl2Lon = targetLon - Math.cos(dAngle) * ctrl2Dist;

  const transitionArc = [];
  // Initial straight climb leg
  transitionArc.push({
    lat: derLat,
    lon: derLon,
    alt: 2200,
    spd: 195,
    desc: "RUNWAY TRACK CLIMB"
  });

  // 6 intermediate smooth curve banking points (realistic standard-rate turn arc)
  const arcSteps = 6;
  for (let i = 1; i <= arcSteps; i++) {
    const t = i / (arcSteps + 1);
    const b0 = Math.pow(1 - t, 3);
    const b1 = 3 * Math.pow(1 - t, 2) * t;
    const b2 = 3 * (1 - t) * Math.pow(t, 2);
    const b3 = Math.pow(t, 3);

    const pLat = b0 * derLat + b1 * ctrl1Lat + b2 * ctrl2Lat + b3 * targetLat;
    const pLon = b0 * derLon + b1 * ctrl1Lon + b2 * ctrl2Lon + b3 * targetLon;
    const pAlt = Math.round(2200 + t * 1800);
    const pSpd = Math.round(195 + t * 35);
    transitionArc.push({
      lat: pLat,
      lon: pLon,
      alt: pAlt,
      spd: pSpd,
      desc: `SID TURNING ARC ${i}`
    });
  }

  // Combine transition arc with the main SID enroute waypoints
  return [...transitionArc, ...sidPoints];
}

function executeClimbEnroute(ac) {
  // Prevent duplicate intervals if called while airborne
  if (ac._climbInterval) return;

  const sidKey = ac.clearedSid || "DOLTA 1C";
  const sidObj = (airportData && airportData.sids)
    ? airportData.sids.find(s => s.id === sidKey)
    : null;

  const rawSidPoints = (sidObj && sidObj.coords)
    ? sidObj.coords.map((c, i) => ({
        lat: c[0],
        lon: c[1],
        alt: 4000 + i * 4000,
        spd: 230 + i * 25,
        desc: sidObj.waypoints[i] || "WAYPOINT"
      }))
    : flightRouteMission.climbWaypoints;

  // Generate realistic smooth departure turning arc (no abrupt 90-degree snap!)
  const points = calculateDepartureClimbPath(ac.lat, ac.lon, ac.heading, rawSidPoints);

  let ptIdx = 0;

  function moveNextClimbLeg() {
    if (ptIdx >= points.length) {
      if (ac._climbInterval) {
        clearInterval(ac._climbInterval);
        ac._climbInterval = null;
      }
      // Arrived at DOLTA COP Gateway!
      ac.state = "HANDOFF";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = "Jakarta Approach, INDONESIA 502, passing flight level one four zero, reaching DOLTA.";
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const leg = points[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;
    const startAlt = ac.altitude;
    const startSpd = ac.groundSpeed;
    const targetAlt = leg.alt;
    const targetSpd = leg.spd;

    // Calculate heading towards target departure fix
    const dLat = leg.lat - startLat;
    const dLon = leg.lon - startLon;
    let targetHdg = (ac.heading !== undefined && !isNaN(ac.heading)) ? ac.heading : 250;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    const legDistNm = calculateDistanceNm(startLat, startLon, leg.lat, leg.lon);
    const avgSpeedKts = Math.max(40, (startSpd + targetSpd) / 2);
    // Real-Time 1:1 Physics Engine (1 real second = 1 simulation second)
    // Time (seconds) = (legDistNm / avgSpeedKts) * 3600
    const SIM_SPEED_MULT = 1.0;
    const legDurationSec = Math.max(0.1, (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT));
    const stepIntervalMs = 50;
    const totalSteps = Math.max(2, Math.round((legDurationSec * 1000) / stepIntervalMs));
    let step = 0;

    ac._climbInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (leg.lat - startLat) * prog;
      ac.lon = startLon + (leg.lon - startLon) * prog;
      ac.altitude = Math.round(startAlt + (targetAlt - startAlt) * prog);
      ac.groundSpeed = Math.round(startSpd + (targetSpd - startSpd) * prog);

      if (ac._tacticalVector !== undefined && ac._tacticalVector !== null) {
        ac.heading = ac._tacticalVector;
      } else {
        const curHdg = (ac.heading !== undefined && !isNaN(ac.heading)) ? ac.heading : targetHdg;
        const angleDelta = ((targetHdg - curHdg + 540) % 360) - 180;
        ac.heading = Math.round((curHdg + angleDelta * 0.08 + 360) % 360);
      }
      if (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) {
        ac.groundSpeed = ac._assignedSpeed;
      }

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._climbInterval);
        ac._climbInterval = null;
        if (ac._tacticalVector === undefined || ac._tacticalVector === null) {
          ac.heading = targetHdg;
        }
        ptIdx++;
        moveNextClimbLeg();
      }
    }, stepIntervalMs);
  }

  moveNextClimbLeg();
}

function executeHandoffComplete(ac) {
  const pttStatus = document.getElementById('ptt-status');
  if (pttStatus) {
    pttStatus.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check"></i> HANDOFF COMPLETE - CRUISE ENROUTE JAKARTA CENTER</span>`;
  }
}

// Inbound Arrival Flight Planning and Smooth STAR Descent Engine
function calculateStarArrivalPath(starCoords, rwyKey) {
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const threshold = mech ? [mech.threshold.lat, mech.threshold.lon] : [-6.108959, 106.669062];
  const rwyHeading = mech ? mech.heading : 250;

  const rad = (90 - rwyHeading) * (Math.PI / 180);
  const fafDist = 0.08; // ~4.8 NM final
  const fafLat = threshold[0] - Math.sin(rad) * fafDist;
  const fafLon = threshold[1] - Math.cos(rad) * fafDist;

  const lastStar = starCoords[starCoords.length - 1];
  const ctrl1Lat = lastStar[0];
  const ctrl1Lon = lastStar[1];
  const ctrl2Lat = fafLat - Math.sin(rad) * 0.035;
  const ctrl2Lon = fafLon - Math.cos(rad) * 0.035;

  const path = [];
  // 0. Pre-STAR feeder leg (from 15 NM outer radius entering the STAR entry fix)
  if (starCoords.length > 1) {
    const wp0 = starCoords[0];
    const wp1 = starCoords[1];
    const dLat = wp0[0] - wp1[0];
    const dLon = wp0[1] - wp1[1];
    const distDeg = Math.hypot(dLat, dLon) || 0.1;
    const feederLat = wp0[0] + (dLat / distDeg) * 0.25;
    const feederLon = wp0[1] + (dLon / distDeg) * 0.25;
    path.push({ lat: feederLat, lon: feederLon, alt: 12000, spd: 260, desc: `FEEDER INBOUND (15NM OUT)` });
  }

  // 1. STAR enroute waypoints
  for (let i = 0; i < starCoords.length; i++) {
    const alt = Math.max(4000, 10000 - i * 3000);
    const spd = Math.max(190, 250 - i * 20);
    path.push({ lat: starCoords[i][0], lon: starCoords[i][1], alt: alt, spd: spd, desc: `STAR WP ${i}` });
  }

  // 2. Smooth cubic Bezier intercept arc onto ILS localizer
  for (let i = 1; i <= 5; i++) {
    const t = i / 6.0;
    const b0 = Math.pow(1 - t, 3);
    const b1 = 3 * Math.pow(1 - t, 2) * t;
    const b2 = 3 * (1 - t) * Math.pow(t, 2);
    const b3 = Math.pow(t, 3);
    const pLat = b0 * lastStar[0] + b1 * ctrl1Lat + b2 * ctrl2Lat + b3 * fafLat;
    const pLon = b0 * lastStar[1] + b1 * ctrl1Lon + b2 * ctrl2Lon + b3 * fafLon;
    const alt = Math.round(4000 - t * 1500);
    const spd = Math.round(190 - t * 25);
    path.push({ lat: pLat, lon: pLon, alt: alt, spd: spd, desc: `ILS INTERCEPT ARC ${i}` });
  }

  // 3. Final Approach Fix (FAF)
  path.push({ lat: fafLat, lon: fafLon, alt: 2500, spd: 160, desc: "FAF ILS GLIDESLOPE" });

  // 4. Glideslope 3-degree descent to threshold
  for (let i = 1; i <= 4; i++) {
    const t = i / 5.0;
    const pLat = fafLat + (threshold[0] - fafLat) * t;
    const pLon = fafLon + (threshold[1] - fafLon) * t;
    const alt = Math.round(2500 * (1 - t) + 50);
    const spd = Math.round(160 - t * 20);
    path.push({ lat: pLat, lon: pLon, alt: alt, spd: spd, desc: `FINAL ${i}` });
  }

  // 5. Touchdown threshold
  path.push({ lat: threshold[0], lon: threshold[1], alt: 0, spd: 135, desc: "TOUCHDOWN" });

  // 6. Realistic Landing Rollout on Runway Centerline to Rapid Exit Taxiway
  const rollPath = mech && mech.takeoff_roll_path ? mech.takeoff_roll_path : [];
  const taxiInData = (airportData && airportData.taxi_in_routes && airportData.taxi_in_routes[rwyKey])
    ? airportData.taxi_in_routes[rwyKey]
    : null;
  const targetExitPoint = taxiInData ? taxiInData.exit_point : null;

  if (rollPath && rollPath.length > 2) {
    // Find the exact roll node closest to the rapid exit taxiway point
    let bestExitIdx = Math.min(rollPath.length - 1, Math.max(3, Math.floor(rollPath.length * 0.65)));
    if (targetExitPoint) {
      let minDistSq = Infinity;
      rollPath.forEach((pt, i) => {
        const dSq = Math.pow(pt[0] - targetExitPoint[0], 2) + Math.pow(pt[1] - targetExitPoint[1], 2);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          bestExitIdx = i;
        }
      });
    }

    const exitNodeCount = Math.max(2, bestExitIdx);
    for (let r = 1; r <= exitNodeCount; r++) {
      const prog = r / exitNodeCount;
      const rollPt = rollPath[r];
      // Decelerate smoothly from 135 knots touchdown to 60 knots taxi exit speed
      const rollSpd = Math.round(135 - (135 - 60) * prog);
      path.push({
        lat: rollPt[0],
        lon: rollPt[1],
        alt: 0,
        spd: rollSpd,
        desc: `LANDING ROLLOUT ${Math.round(prog * 100)}%`
      });
    }
  }

  return path;
}

function spawnInboundArrival() {
  const arrivalCallsigns = [
    { id: "CTV123", callsign: "SUPERGREEN 123", airline: "Citilink", type: "320" },
    { id: "GIA880", callsign: "INDONESIA 880", airline: "Garuda Indonesia", type: "333" },
    { id: "SIA958", callsign: "SINGAPORE 958", airline: "Singapore Airlines", type: "777" },
    { id: "CLX742", callsign: "CARGOLUX 742", airline: "Cargolux", type: "747" },
    { id: "LNI712", callsign: "LION INTER 712", airline: "Lion Air", type: "738" }
  ];
  const arrivalEntryStars = [
    { star: "DOLTA 1A", rwy: "25R", desc: "via DOLTA (South)" },
    { star: "BUNTO 1A", rwy: "25R", desc: "via BUNTO (East)" },
    { star: "GOMBA 1A", rwy: "25R", desc: "via GOMBA (North)" },
    { star: "DOLTA 1A", rwy: "25L", desc: "via DOLTA (South)" }
  ];
  const chosen = arrivalCallsigns[aircraft.length % arrivalCallsigns.length];
  const chosenEntry = arrivalEntryStars[aircraft.length % arrivalEntryStars.length];
  const targetRwy = chosenEntry.rwy;
  const defaultStar = chosenEntry.star;

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === defaultStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  // Calculate pre-entry feeder position: 15 NM before the first STAR fix along the inbound inbound bearing
  const wp0 = starCoords[0];
  const wp1 = starCoords.length > 1 ? starCoords[1] : [wp0[0] + 0.1, wp0[1] + 0.1];
  const feederDLat = wp0[0] - wp1[0];
  const feederDLon = wp0[1] - wp1[1];
  const feederDistDeg = Math.hypot(feederDLat, feederDLon) || 0.1;
  const entryOffsetDeg = 0.25; // ~15 Nautical Miles before waypoint 0
  const spawnLat = wp0[0] + (feederDLat / feederDistDeg) * entryOffsetDeg;
  const spawnLon = wp0[1] + (feederDLon / feederDistDeg) * entryOffsetDeg;

  // Initial heading aligned directly towards the first STAR fix
  const angleRad = Math.atan2(wp0[0] - spawnLat, (wp0[1] - spawnLon) * Math.cos(spawnLat * Math.PI / 180));
  const initialHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);

  const assignedGate = (typeof assignRealisticGate === "function")
    ? assignRealisticGate(chosen.airline, chosen.callsign)
    : { ref: "E1", lat: -6.121757, lon: 106.651077, terminal: "T2" };

  const newAc = {
    id: chosen.id,
    callsign: chosen.callsign,
    airline: chosen.airline,
    type: chosen.type,
    lat: spawnLat,
    lon: spawnLon,
    heading: initialHdg,
    altitude: 12000,
    groundSpeed: 260,
    state: "APPROACH",
    clearedRwy: targetRwy,
    clearedStar: defaultStar,
    assignedGate: assignedGate.ref,
    assignedGateCoord: [assignedGate.lat, assignedGate.lon],
    squawk: String(Math.floor(1000 + Math.random() * 8000)),
    hasCheckedIn: false,
    checkInPhrase: `Jakarta Approach, ${chosen.callsign}, 15 miles before ${starObj.waypoints ? starObj.waypoints[0] : 'entry fix'}, inbound flight level one two zero.`
  };

  aircraft.push(newAc);
  selectedAircraftIndex = aircraft.length - 1;
  renderFlightStrips();
  updateEasyModePrompter();
  renderAllScreens();

  setTimeout(() => {
    triggerPilotCheckIn(newAc);
  }, 1000);

  executeApproachMovement(newAc);
}

function executeApproachMovement(ac) {
  if (ac._approachInterval) {
    clearInterval(ac._approachInterval);
    ac._approachInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const threshold = mech ? [mech.threshold.lat, mech.threshold.lon] : [-6.108959, 106.669062];
  const rwyHeading = mech ? mech.heading : 250;

  const allStars = (airportData && airportData.stars) ? airportData.stars : [];
  const starObj = allStars.find(s => s.id === ac.clearedStar) || allStars[0];
  const starCoords = starObj ? starObj.coords : [[-6.345, 106.72], [-6.18, 106.88], [-6.1, 106.85]];

  const rawFullPath = calculateStarArrivalPath(starCoords, rwyKey);

  // In-flight Dynamic Splice:
  // If aircraft is already airborne, smoothly transition towards the new flight plan:
  // 1. If switching runway/STAR to an entirely different entry corridor (e.g. from East BUNTO to North GOMBA),
  //    join the new route from its first entry/enroute fix (ptIdx = 0 or 1).
  // 2. Only splice forward if the aircraft is already aligned on that corridor's sequence.
  let ptIdx = 0;
  if (ac._forceRouteReset) {
    ac._forceRouteReset = false;
    ptIdx = 0; // Direct aircraft to fly towards the entry waypoint of the new STAR!
  } else if (ac.lat && ac.lon) {
    let closestIdx = 0;
    let minD = Infinity;
    // Only search among enroute/intercept legs (indices 0 to FAF index), never rollout/touchdown legs!
    const maxSearchIdx = Math.max(1, rawFullPath.findIndex(p => p.desc.includes("FAF") || p.desc.includes("TOUCHDOWN")));
    for (let i = 0; i <= maxSearchIdx; i++) {
      const d = calculateDistanceNm(ac.lat, ac.lon, rawFullPath[i].lat, rawFullPath[i].lon);
      if (d < minD) {
        minD = d;
        closestIdx = i;
      }
    }

    // If the closest waypoint is very far (> 18 NM, e.g. switching across opposite side of airport),
    // navigate from the start of the new route (ptIdx = 0) so the aircraft flies through the approach properly
    if (minD > 18) {
      ptIdx = 0;
    } else {
      ptIdx = Math.min(rawFullPath.length - 1, closestIdx + 1);
    }
  }

  const fullPath = rawFullPath;

  function moveNextArrivalLeg() {
    if (ptIdx >= fullPath.length) {
      if (ac._approachInterval) {
        clearInterval(ac._approachInterval);
        ac._approachInterval = null;
      }
      ac.state = "LANDED";
      ac.groundSpeed = 60;
      ac.altitude = 0;
      ac.hasCheckedIn = false;
      const exitName = rwyKey.startsWith("25") ? "November four" : "runway exit";
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, slowed to sixty knots, runway vacated at ${exitName}.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const leg = fullPath[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;
    const startAlt = ac.altitude;
    const startSpd = ac.groundSpeed;
    const targetAlt = leg.alt;
    const targetSpd = leg.spd;

    // Calculate heading towards target fix
    const dLat = leg.lat - startLat;
    const dLon = leg.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // When near final glideslope, trigger tower check-in
    if (leg.desc.includes("FAF") && ac.state !== "FINAL") {
      ac.state = "FINAL";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, established ILS runway ${rwyKey}.`;
      renderFlightStrips();
      updateEasyModePrompter();
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 500);
    }

    const legDistNm = calculateDistanceNm(startLat, startLon, leg.lat, leg.lon);
    const avgSpeedKts = Math.max(40, (startSpd + targetSpd) / 2);
    // Real-Time 1:1 Physics Engine (1 real second = 1 simulation second)
    // Time (seconds) = (legDistNm / avgSpeedKts) * 3600
    const SIM_SPEED_MULT = 1.0;
    const legDurationSec = Math.max(0.1, (legDistNm / avgSpeedKts) * (3600 / SIM_SPEED_MULT));
    const stepIntervalMs = 50;
    const totalSteps = Math.max(2, Math.round((legDurationSec * 1000) / stepIntervalMs));
    let step = 0;

    ac._approachInterval = setInterval(() => {
      if (ac._tacticalVector !== undefined && ac._tacticalVector !== null) {
        // TACTICAL RADAR VECTORING: Fly along assigned heading vector!
        const spd = (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) ? ac._assignedSpeed : ac.groundSpeed;
        ac.heading = ac._tacticalVector;
        ac.groundSpeed = spd;
        // Distance traveled in 50ms (0.05s) at speed kts:
        const distNmStep = (spd / 3600.0) * (stepIntervalMs / 1000.0);
        const radHdg = (ac.heading * Math.PI) / 180.0;
        // 1 deg lat = 60 NM; 1 deg lon = 60 * cos(lat) NM
        ac.lat += (distNmStep * Math.cos(radHdg)) / 60.0;
        ac.lon += (distNmStep * Math.sin(radHdg)) / (60.0 * Math.cos(ac.lat * Math.PI / 180.0));
      } else {
        step++;
        const prog = step / totalSteps;
        ac.lat = startLat + (leg.lat - startLat) * prog;
        ac.lon = startLon + (leg.lon - startLon) * prog;
        ac.altitude = Math.round(startAlt + (targetAlt - startAlt) * prog);
        ac.groundSpeed = Math.round(startSpd + (targetSpd - startSpd) * prog);

        const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
        ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

        if (ac._assignedSpeed !== undefined && ac._assignedSpeed !== null) {
          ac.groundSpeed = ac._assignedSpeed;
        }

        if (step >= totalSteps) {
          clearInterval(ac._approachInterval);
          ac._approachInterval = null;
          ac.lat = leg.lat;
          ac.lon = leg.lon;
          ac.heading = targetHdg;
          ptIdx++;
          moveNextArrivalLeg();
          return;
        }
      }

      renderAllScreens();
    }, stepIntervalMs);
  }

  moveNextArrivalLeg();
}

function executeTaxiInMovement(ac) {
  if (ac._taxiInInterval) return;

  const rwyKey = ac.clearedRwy || "25R";
  const taxiInData = (airportData && airportData.taxi_in_routes && airportData.taxi_in_routes[rwyKey])
    ? airportData.taxi_in_routes[rwyKey]
    : null;

  // Resolve target gate stand
  let targetGate = null;
  if (ac.assignedGate && airportData && airportData.gates) {
    targetGate = airportData.gates.find(g => g.ref === ac.assignedGate);
  }
  if (!targetGate && typeof assignRealisticGate === "function") {
    targetGate = assignRealisticGate(ac.airline, ac.callsign);
    ac.assignedGate = targetGate.ref;
    ac.assignedGateCoord = [targetGate.lat, targetGate.lon];
  }

  // Calculate dynamic authentic taxiway path via Dijkstra to target gate
  let taxiInPoints = null;
  if (targetGate && typeof findTaxiwayPath === "function") {
    const calculated = findTaxiwayPath(ac.lat, ac.lon, targetGate.lat, targetGate.lon);
    if (calculated && calculated.length > 3) {
      taxiInPoints = calculated.map(p => ({ lat: p[0], lon: p[1] }));
    }
  }

  // Fallback to static verified taxi_in_routes if needed
  if (!taxiInPoints) {
    taxiInPoints = (taxiInData && taxiInData.coords)
      ? taxiInData.coords.map(p => ({ lat: p[0], lon: p[1] }))
      : [
          { lat: ac.lat, lon: ac.lon },
          { lat: -6.118502, lon: 106.652425 },
          { lat: -6.121013, lon: 106.650012 },
          { lat: -6.121480, lon: 106.650280 },
          { lat: -6.121757, lon: 106.651077 }
        ];
  }

  let nodeIdx = 0;
  ac.groundSpeed = 15;

  function moveNextTaxiInNode() {
    if (nodeIdx >= taxiInPoints.length) {
      if (ac._taxiInInterval) {
        clearInterval(ac._taxiInInterval);
        ac._taxiInInterval = null;
      }
      ac.state = "PARKED";
      ac.groundSpeed = 0;
      ac.altitude = 0;
      ac.hasCheckedIn = false;
      const gateStr = ac.assignedGate ? `Gate ${ac.assignedGate}` : "Gate Echo 1";
      const termStr = (targetGate && targetGate.terminal) ? `(${targetGate.terminal})` : "";
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, parked at ${gateStr} ${termStr}, engines shutdown, good day.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const targetNode = taxiInPoints[nodeIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const dLat = targetNode.lat - startLat;
    const dLon = targetNode.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // Realistic taxi speed: straight 15 kts, turns 8 kts, stand entry 5 kts
    const hdgDiff = Math.abs((targetHdg - ac.heading + 540) % 360 - 180);
    let targetSpd = hdgDiff > 25 ? 8 : 15;
    if (nodeIdx >= taxiInPoints.length - 3) {
      targetSpd = 5;
    }
    ac.groundSpeed = targetSpd;

    // Use consistent step timing identical to departure taxiway movement
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(12, Math.round(distDeg * 120000));
    let step = 0;

    ac._taxiInInterval = setInterval(() => {
      // Ground collision prevention: if another aircraft is in front, hold brakes!
      if (checkGroundConflictAhead(ac, targetNode.lat, targetNode.lon)) {
        ac.groundSpeed = 0;
        ac.isHoldingForTraffic = true;
        renderAllScreens();
        return; // hold position until path is clear
      }
      ac.isHoldingForTraffic = false;
      ac.groundSpeed = targetSpd;

      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetNode.lat - startLat) * prog;
      ac.lon = startLon + (targetNode.lon - startLon) * prog;

      // Smooth heading turn
      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.15 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._taxiInInterval);
        ac._taxiInInterval = null;
        ac.lat = targetNode.lat;
        ac.lon = targetNode.lon;
        ac.heading = targetHdg;
        nodeIdx++;
        moveNextTaxiInNode();
      }
    }, 75);
  }

  moveNextTaxiInNode();
}

// Push to talk event bindings
