/**
 * In-Process Vehicle Physics Engine & Confidence State Estimator
 * Models lateral acceleration (a_lat = v^2 * kappa), steering torque saturation,
 * brake hydraulics, acceleration limits, and neural network model uncertainty.
 */

const { VEHICLE_PROFILES } = require('./config');

function computeTelemetryFrameJS(scenarioId, vehicleId, tSec) {
  const veh = VEHICLE_PROFILES[vehicleId] || VEHICLE_PROFILES['honda_crv_2020'];

  let curvature = 0;
  let speedMph = 50.0;
  let modelConf = 0.95;
  let brakePct = 0;
  let leadDist = 35.0;

  if (scenarioId === 'honda_mountain') {
    const cycleT = tSec % 50.0;
    if (cycleT < 8.0) {
      curvature = 0.0005 * Math.sin(cycleT * 0.5);
      speedMph = 52.0;
      modelConf = 0.96;
    } else if (cycleT < 26.0) {
      const p = (cycleT - 8.0) / 18.0;
      const turnProfile = Math.sin(p * Math.PI);
      curvature = 0.0052 * turnProfile;
      speedMph = 52.0 - turnProfile * 4.0;
      modelConf = 0.94 - turnProfile * 0.04;
      leadDist = 32.0 - turnProfile * 8.0;
    } else if (cycleT < 34.0) {
      const p = (cycleT - 26.0) / 8.0;
      curvature = 0.0046 * (1.0 - p);
      speedMph = 48.0 + p * 4.0;
      modelConf = 0.95;
    } else if (cycleT < 46.0) {
      const p = (cycleT - 34.0) / 12.0;
      curvature = -0.0042 * Math.sin(p * Math.PI);
      speedMph = 50.0;
      modelConf = 0.93;
    } else {
      curvature = 0;
      speedMph = 52.0;
      modelConf = 0.96;
    }
  } else if (scenarioId === 'kia_tacobell') {
    const cycleT = tSec % 45.0;
    if (cycleT < 10.0) {
      curvature = 0;
      speedMph = 35.0;
      modelConf = 0.95;
    } else if (cycleT < 18.0) {
      const p = (cycleT - 10.0) / 8.0;
      curvature = 0.0002;
      speedMph = 35.0 - p * 23.0;
      brakePct = p * 35.0;
      modelConf = 0.94;
    } else if (cycleT < 28.0) {
      const p = (cycleT - 18.0) / 10.0;
      curvature = -0.038 * Math.sin(p * Math.PI);
      speedMph = 13.0 + p * 6.0;
      modelConf = 0.91;
    } else {
      const p = (cycleT - 28.0) / 17.0;
      curvature = 0;
      speedMph = 19.0 + p * 16.0;
      modelConf = 0.96;
    }
  } else if (scenarioId === 'construction_glare') {
    const cycleT = tSec % 40.0;
    if (cycleT < 8.0) {
      curvature = 0.0004 * Math.sin(cycleT);
      speedMph = 48.0;
      modelConf = 0.92;
    } else if (cycleT < 22.0) {
      const p = (cycleT - 8.0) / 14.0;
      curvature = 0.0012 * Math.sin(cycleT * 0.5);
      speedMph = 48.0 - p * 10.0;
      modelConf = 0.92 - p * 0.62;
      brakePct = p * 15.0;
    } else if (cycleT < 32.0) {
      curvature = 0.0008 * Math.sin(cycleT * 0.3);
      speedMph = 38.0;
      modelConf = 0.32 + 0.06 * Math.sin(cycleT * 2.0);
    } else {
      const p = (cycleT - 32.0) / 8.0;
      curvature = 0.0002;
      speedMph = 38.0 + p * 10.0;
      modelConf = 0.35 + p * 0.60;
    }
  } else {
    // interstate_5
    const cycleT = tSec % 45.0;
    curvature = 0.0006 * Math.sin(cycleT * 0.25);
    speedMph = 70.0 + 1.5 * Math.sin(cycleT * 0.1);
    modelConf = 0.97 + 0.02 * Math.cos(cycleT * 0.3);
  }

  const vMps = speedMph * 0.44704;
  const latAccel = (vMps * vMps) * curvature;
  const steerWheelAngleDeg = (Math.atan(curvature * 2.7) * 180.0 / Math.PI);
  const steerAngleDeg = steerWheelAngleDeg * (veh.steer_ratio / 15.0);

  const tauDemand = (veh.k_steer * latAccel) + 0.02 * Math.sin(tSec * 8.0);
  const tauMax = veh.max_steer_nm;
  const tauApplied = Math.max(-tauMax, Math.min(tauMax, tauDemand));

  const tauAbs = Math.abs(tauDemand);
  const torqueSatPct = Math.min(100.0, (tauAbs / tauMax) * 100.0);
  const torqueHeadroomPct = Math.max(0.0, 100.0 - torqueSatPct);

  const pathVariance = (1.0 - modelConf) * 1.8 + 0.05;

  let alertClass = 1;
  let alertClassLabel = 'Class 1 (Reliable)';
  if (torqueSatPct >= 92.0 || modelConf < 0.42) {
    alertClass = 3;
    alertClassLabel = 'Class 3 (Imminent Disengagement)';
  } else if (torqueSatPct >= 75.0 || modelConf < 0.75) {
    alertClass = 2;
    alertClassLabel = 'Class 2 (Advisory / Caution)';
  }

  const haloActive = (torqueSatPct >= 75.0);
  const haloSide = haloActive ? (tauDemand > 0 ? 'left' : 'right') : 'none';
  const haloIntensity = haloActive ? Math.min(1.0, Math.max(0.0, (torqueSatPct - 75.0) / 25.0)) : 0.0;

  let audioToneHz = 0;
  let audioVolume = 0;
  if (torqueSatPct >= 78.0) {
    const normT = (torqueSatPct - 78.0) / 22.0;
    audioToneHz = 220.0 + normT * 220.0;
    audioVolume = 0.15 + normT * 0.45;
  }

  const pathPoints = [];
  for (let x = 0; x <= 80; x += 5) {
    const yCenter = 0.5 * curvature * (x * x);
    const halfWidth = 1.6 + (x / 80.0) * (pathVariance * 1.4);
    pathPoints.push({
      x: Number(x.toFixed(1)),
      y: Number(yCenter.toFixed(3)),
      half_width: Number(halfWidth.toFixed(3))
    });
  }

  return {
    timestamp_ms: Math.floor(tSec * 1000),
    scenario: scenarioId,
    vehicle: {
      id: vehicleId,
      name: veh.name,
      max_steer_nm: veh.max_steer_nm,
      steer_ratio: veh.steer_ratio
    },
    carState: {
      vEgo: Number(vMps.toFixed(2)),
      vEgoMph: Number(speedMph.toFixed(1)),
      steeringAngleDeg: Number(steerAngleDeg.toFixed(2)),
      steeringTorqueNm: Number(tauApplied.toFixed(2)),
      steeringTorqueDemandNm: Number(tauDemand.toFixed(2)),
      torqueSaturationPct: Number(torqueSatPct.toFixed(1)),
      torqueHeadroomPct: Number(torqueHeadroomPct.toFixed(1)),
      lateralAccel: Number(latAccel.toFixed(2)),
      brakePct: Number(brakePct.toFixed(1)),
      brakePressureBar: Number(((brakePct / 100.0) * veh.max_brake_pressure).toFixed(1)),
      brakeSaturationPct: Number(brakePct.toFixed(1)),
      gasPct: brakePct > 0 ? 0 : 24.0,
      accelMps2: brakePct > 0 ? -Number(((brakePct / 100.0) * 3.5).toFixed(2)) : 0.65,
      accelSaturationPct: brakePct > 0 ? 0 : 32.5,
      curvature: Number(curvature.toFixed(5)),
      lateralErrorM: torqueSatPct >= 98.0 ? Number(((tauAbs - tauMax) * 0.4).toFixed(3)) : 0.0
    },
    modelV2: {
      confidence: Number(modelConf.toFixed(3)),
      pathVariance: Number(pathVariance.toFixed(3)),
      leftLaneProb: Number(Math.min(1.0, modelConf + 0.02).toFixed(2)),
      rightLaneProb: Number(Math.min(1.0, modelConf - 0.01).toFixed(2)),
      leadDistanceM: Number(leadDist.toFixed(1)),
      pathPoints
    },
    confidenceEngine: {
      alertClass,
      alertClassLabel,
      haloActive,
      haloSide,
      haloIntensity: Number(haloIntensity.toFixed(2)),
      audioToneHz: Number(audioToneHz.toFixed(1)),
      audioVolume: Number(audioVolume.toFixed(2)),
      preAlertActive: (alertClass === 2 && haloActive),
      imminentTakeover: (alertClass === 3),
      actuatorLimits: {
        steerSaturated: torqueSatPct >= 75.0,
        brakeSaturated: brakePct >= 75.0,
        accelSaturated: false
      }
    }
  };
}

module.exports = {
  computeTelemetryFrameJS
};
