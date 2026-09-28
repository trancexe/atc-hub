function executePushbackMovement(ac) {
  // Clear any existing interval
  if (ac._pushInterval) clearInterval(ac._pushInterval);

  // Discrete, verifiable pushback points:
  // Waypoint 0: Gate E1 Stand (Parked, lat -6.121757, lon 106.651077)
  // Waypoint 1: Apron Taxilane (Clear of concourse building, lat -6.121650, lon 106.650600)
  // Waypoint 2: Apron Alley curve (lat -6.121480, lon 106.650280)
  // Waypoint 3: Intersection into Taxiway NC6 (lat -6.121260, lon 106.650050)
  // Waypoint 4: PUSH RELEASE POINT on Taxiway NC6 centerline (lat -6.121013, lon 106.650012)
  const pushNodes = (airportData && airportData.routes && airportData.routes.pushback_gate_e1)
    ? airportData.routes.pushback_gate_e1.map(p => ({ lat: p[0], lon: p[1] }))
    : [
        { lat: -6.121757, lon: 106.651077 },
        { lat: -6.121650, lon: 106.650600 },
        { lat: -6.121480, lon: 106.650280 },
        { lat: -6.121260, lon: 106.650050 },
        { lat: -6.121013, lon: 106.650012 }
      ];

  let nodeIdx = 1; // start moving to P1
  ac.groundSpeed = 4;

  function moveNextPushNode() {
    if (nodeIdx >= pushNodes.length) {
      // Reached centerline of Taxiway NC6!
      ac.groundSpeed = 0;
      ac.lat = pushNodes[pushNodes.length - 1].lat;
      ac.lon = pushNodes[pushNodes.length - 1].lon;
      ac.heading = 355; // Aligned along Taxiway NC6 facing north
      ac.state = "READY_TAXI";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = "Ground, INDONESIA 502, ready to taxi, request clearance.";
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      // Trigger Pilot Request to Taxi
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 800);
      return;
    }

    const targetPt = pushNodes[nodeIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    // Pushback heading: airplane moves backward (tail first)
    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let pushHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      pushHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 180 + 360) % 360);
    }

    // Full realistic pushback pace: 160m total maneuver (~45 seconds)
    const distM = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
    const durSec = Math.max(6, distM / 3.5);
    const totalSteps = Math.max(25, Math.round(durSec * 15)); // 15 fps
    let step = 0;

    ac._pushInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      // Smooth nose rotation during pushback turn
      const angleDelta = ((pushHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.08 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._pushInterval);
        ac._pushInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        nodeIdx++;
        moveNextPushNode();
      }
    }, 66);
  }

  moveNextPushNode();
}

function executeTaxiMovement(ac) {
  // Read dynamic route according to cleared runway mechanism
  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;
  const hpName = mech && mech.holding_point ? mech.holding_point.name : "N2";

  const dynamicRoutes = airportData && airportData.taxi_routes_by_runway ? airportData.taxi_routes_by_runway[rwyKey] : null;

  const points = (dynamicRoutes && dynamicRoutes.coords)
    ? dynamicRoutes.coords.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.taxi_nc6_to_hp_n2)
        ? airportData.routes.taxi_nc6_to_hp_n2.map(p => ({ lat: p[0], lon: p[1] }))
        : flightRouteMission.taxiwayPoints);

  let ptIdx = (ac._crossSavedIndex !== undefined && ac._crossSavedIndex !== null) ? ac._crossSavedIndex : 0;
  ac._crossSavedIndex = null;

  function moveNextTaxiNode() {
    // Check if crossing runway stop bar (e.g. going south towards 25L or 07R)
    if ((rwyKey === "25L" || rwyKey === "07R") && !ac._runwayCrossCleared && ptIdx === 22) {
      // Reached holding stop bar before crossing North Runway 25R/07L!
      ac.groundSpeed = 0;
      ac.lat = points[ptIdx].lat;
      ac.lon = points[ptIdx].lon;
      ac.state = "HOLD_SHORT_CROSS";
      ac._crossSavedIndex = ptIdx;
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Ground, ${ac.callsign}, holding short runway two five right at November cross.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 800);
      return;
    }

    if (ptIdx >= points.length) {
      // Arrived precisely at designated Runway Holding Point!
      ac.groundSpeed = 0;
      ac.lat = points[points.length - 1].lat;
      ac.lon = points[points.length - 1].lon;
      ac.heading = mech ? mech.heading : 335;
      ac.state = "HOLDING";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, holding point ${hpName} runway ${rwyKey}, ready for departure.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 1000);
      return;
    }

    const targetPt = points[ptIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    // Calculate heading towards next taxiway point
    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    // Realistic taxi speed: straight 15 kts, turns 8 kts
    const hdgDiff = Math.abs((targetHdg - ac.heading + 540) % 360 - 180);
    ac.groundSpeed = hdgDiff > 20 ? 8 : 15;

    // Realistic step timing
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(10, Math.round(distDeg * 110000));
    let step = 0;

    const stepInterval = setInterval(() => {
      // Ground collision prevention: if another aircraft is in front, hold brakes!
      if (checkGroundConflictAhead(ac, targetPt.lat, targetPt.lon)) {
        ac.groundSpeed = 0;
        ac.isHoldingForTraffic = true;
        renderAllScreens();
        return; // hold position until path is clear
      }
      ac.isHoldingForTraffic = false;
      ac.groundSpeed = hdgDiff > 20 ? 8 : 15;

      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      // Smooth heading turn
      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.15 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(stepInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        ac.heading = targetHdg;
        ptIdx++;
        moveNextTaxiNode();
      }
    }, 75);
    ac._activeInterval = stepInterval;
  }

  moveNextTaxiNode();
}

function executeLineUpMovement(ac) {
  // Clear any existing active movement interval to avoid competing position glitches
  if (ac._activeInterval) {
    clearInterval(ac._activeInterval);
    ac._activeInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;

  // Continuous, unbroken lead-in curve into Runway threshold
  const entryNodes = mech && mech.lineup_path
    ? mech.lineup_path.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.runway_25r_entry_lineup)
        ? airportData.routes.runway_25r_entry_lineup.map(p => ({ lat: p[0], lon: p[1] }))
        : [
            { lat: -6.110490, lon: 106.667968 },
            { lat: -6.109798, lon: 106.667797 },
            { lat: -6.109270, lon: 106.668258 },
            { lat: -6.108959, lon: 106.669062 }
          ]);

  const targetHeading = mech ? mech.heading : 250;
  let eIdx = 1;
  ac.state = "LINING_UP";
  ac.groundSpeed = 10;
  renderFlightStrips();
  updateEasyModePrompter();

  function moveNextEntryNode() {
    if (eIdx >= entryNodes.length) {
      // Perfectly lined up on Runway centerline threshold!
      if (ac._activeInterval) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
      }
      const lastPt = entryNodes[entryNodes.length - 1];
      ac.lat = lastPt.lat;
      ac.lon = lastPt.lon;
      ac.heading = targetHeading; // Aligned perfectly down the runway

      if (ac.takeoffQueued) {
        // Clearance was given while lining up; now that alignment is 100% complete at threshold, start takeoff roll!
        ac.takeoffQueued = false;
        ac.state = "TAKEOFF";
        renderFlightStrips();
        updateEasyModePrompter();
        renderAllScreens();
        executeTakeoffMovement(ac);
        return;
      }

      ac.groundSpeed = 0;
      ac.state = "LINE_UP";
      ac.hasCheckedIn = false;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, runway ${rwyKey} lined up and ready for departure.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 700);
      return;
    }

    const targetPt = entryNodes[eIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    let targetHdg = ac.heading;
    if (Math.abs(dLat) > 0.000001 || Math.abs(dLon) > 0.000001) {
      const angleRad = Math.atan2(dLat, dLon * Math.cos(startLat * Math.PI / 180));
      targetHdg = Math.round((90 - (angleRad * 180 / Math.PI) + 360) % 360);
    }

    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const totalSteps = Math.max(12, Math.round(distDeg * 110000));
    let step = 0;

    ac._activeInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;

      const angleDelta = ((targetHdg - ac.heading + 540) % 360) - 180;
      ac.heading = Math.round((ac.heading + angleDelta * 0.18 + 360) % 360);

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        ac.heading = targetHdg;
        eIdx++;
        moveNextEntryNode();
      }
    }, 75);
  }

  moveNextEntryNode();
}

function executeTakeoffMovement(ac) {
  // Clear any active movement interval (such as lineup loop still ticking)
  if (ac._activeInterval) {
    clearInterval(ac._activeInterval);
    ac._activeInterval = null;
  }

  const rwyKey = ac.clearedRwy || "25R";
  const mech = (airportData && airportData.runway_mechanisms && airportData.runway_mechanisms[rwyKey])
    ? airportData.runway_mechanisms[rwyKey]
    : null;

  // Continuous real runway centerline roll along designated Runway direction
  const rollNodes = mech && mech.takeoff_roll_path
    ? mech.takeoff_roll_path.map(p => ({ lat: p[0], lon: p[1] }))
    : ((airportData && airportData.routes && airportData.routes.runway_25r_takeoff_roll)
        ? airportData.routes.runway_25r_takeoff_roll.map(p => ({ lat: p[0], lon: p[1] }))
        : [
            { lat: -6.108959, lon: 106.669062 },
            { lat: -6.113463, lon: 106.657748 },
            { lat: -6.117106, lon: 106.648619 },
            { lat: -6.120986, lon: 106.638883 }
          ]);

  const targetHeading = mech ? mech.heading : 250;
  // Snap smoothly to threshold starting point to prevent any coordinate warp
  if (rollNodes.length > 0) {
    ac.lat = rollNodes[0].lat;
    ac.lon = rollNodes[0].lon;
  }
  ac.heading = targetHeading;

  let rIdx = 1;
  const totalRollPoints = rollNodes.length;

  function moveNextRollNode() {
    if (rIdx >= totalRollPoints) {
      if (ac._activeInterval) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
      }
      ac.state = "AIRBORNE";
      ac.hasCheckedIn = false;
      ac.groundSpeed = 185;
      ac.altitude = 1500;
      ac.checkInPhrase = `Jakarta Tower, ${ac.callsign}, airborne runway ${rwyKey} passing one thousand five hundred feet.`;
      renderFlightStrips();
      updateEasyModePrompter();
      renderAllScreens();

      // Trigger Pilot Airborne Callout
      setTimeout(() => {
        triggerPilotCheckIn(ac);
      }, 700);

      // Seamlessly continue flying and climbing enroute without freezing in midair!
      executeClimbEnroute(ac);
      return;
    }

    const targetPt = rollNodes[rIdx];
    const startLat = ac.lat;
    const startLon = ac.lon;

    const progOverall = rIdx / totalRollPoints;
    ac.groundSpeed = Math.round(15 + Math.pow(progOverall, 1.3) * 145);

    if (progOverall > 0.60) {
      const climbP = (progOverall - 0.60) / 0.40;
      ac.altitude = Math.round(climbP * 1500);
    } else {
      ac.altitude = 0;
    }

    const dLat = targetPt.lat - startLat;
    const dLon = targetPt.lon - startLon;
    const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    // Smooth step interval calculation across segments (minimum 10 steps to avoid jumpy frames)
    const totalSteps = Math.max(10, Math.round(distDeg * 45000));
    let step = 0;

    ac._activeInterval = setInterval(() => {
      step++;
      const prog = step / totalSteps;
      ac.lat = startLat + (targetPt.lat - startLat) * prog;
      ac.lon = startLon + (targetPt.lon - startLon) * prog;
      ac.heading = targetHeading;

      renderAllScreens();

      if (step >= totalSteps) {
        clearInterval(ac._activeInterval);
        ac._activeInterval = null;
        ac.lat = targetPt.lat;
        ac.lon = targetPt.lon;
        rIdx++;
        moveNextRollNode();
      }
    }, 45);
  }

  moveNextRollNode();
}

// Safety Alerts Engine: ICAO Separation, STCA (3 NM / 1000 FT), and MSAW
let lastAlertChirpTime = 0;

