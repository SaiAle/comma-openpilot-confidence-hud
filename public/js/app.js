/**
 * comma.ai openpilot & comma connect Suite - Main Frontend Application
 * Coordinates Canvas HUD, Real-time Chart, Audio Harmonic Engine,
 * and handles WebSocket telemetry streams at 20Hz.
 */

// --- Global Application State ---
const state = {
  activeScenario: 'honda_mountain',
  activeVehicle: 'honda_crv_2020',
  vehicles: {},
  scenarios: {},
  telemetryHistory: [],
  maxHistoryLength: 120, // 6 seconds at 20Hz
  audioEnabled: false,
  preventedSavesCount: 0,
  lastAlertClass: 1,
  viewMode: 'hud' // Defaults to pure comma 3X windshield view
};

// Instantiate Subsystems
const audioEngine = new AudioHarmonicEngine();
const roadHUD = new RoadHUDCanvas('roadCanvas');
const telemetryChart = new TelemetryChart('telemetryChart');

// DOM Elements Cache
const elHaloLeft = document.getElementById('haloLeft');
const elHaloRight = document.getElementById('haloRight');
const elHaloTop = document.getElementById('haloTop');

const elSpeedNum = document.getElementById('speedNum');
const elConfidencePill = document.getElementById('confidencePill');
const elConfidenceLabel = document.getElementById('confidenceLabel');
const elBarTorqueFill = document.getElementById('barTorqueFill');
const elValTorque = document.getElementById('valTorque');
const elBarBrakeFill = document.getElementById('barBrakeFill');
const elValBrake = document.getElementById('valBrake');
const elBarAccelFill = document.getElementById('barAccelFill');
const elValAccel = document.getElementById('valAccel');
const elValConf = document.getElementById('valConf');

const elDadBall = document.getElementById('dadBall');
const elDadHeadroomVal = document.getElementById('dadHeadroomVal');

const elPreAlertBanner = document.getElementById('preAlertBanner');
const elAlertHeading = document.getElementById('alertHeading');
const elAlertMessage = document.getElementById('alertMessage');

const elReadoutSat = document.getElementById('readoutSat');
const elReadoutHeadroom = document.getElementById('readoutHeadroom');
const elReadoutLat = document.getElementById('readoutLat');
const elReadoutVar = document.getElementById('readoutVar');
const elSavesCounter = document.getElementById('savesCounter');
const elEventStream = document.getElementById('eventStream');

const elVehicleSelect = document.getElementById('vehicleSelect');
const elCurrentVehBadge = document.getElementById('currentVehBadge');
const elSpecTorque = document.getElementById('specTorque');
const elSpecRatio = document.getElementById('specRatio');
const elSpecBrake = document.getElementById('specBrake');
const elSpecWeight = document.getElementById('specWeight');
const elVehicleNotes = document.getElementById('vehicleNotes');

const elScenarioGrid = document.getElementById('scenarioGrid');

function handleTelemetryFrame(frame) {
  state.telemetryHistory.push(frame);
  if (state.telemetryHistory.length > state.maxHistoryLength) {
    state.telemetryHistory.shift();
  }

  // 1. Render Canvas Road
  roadHUD.render(frame);

  // 2. Render Telemetry Timeseries
  telemetryChart.render(state.telemetryHistory, state.maxHistoryLength);

  // 3. Update Peripheral Torque Halo
  const halo = frame.confidenceEngine;
  if (halo.haloActive) {
    if (halo.haloSide === 'left') {
      elHaloLeft.style.opacity = halo.haloIntensity;
      elHaloRight.style.opacity = '0';
    } else {
      elHaloRight.style.opacity = halo.haloIntensity;
      elHaloLeft.style.opacity = '0';
    }

    if (halo.imminentTakeover) {
      elHaloLeft.classList.add('imminent');
      elHaloRight.classList.add('imminent');
      elHaloTop.style.opacity = '0.9';
    } else {
      elHaloLeft.classList.remove('imminent');
      elHaloRight.classList.remove('imminent');
      elHaloTop.style.opacity = '0';
    }
  } else {
    elHaloLeft.style.opacity = '0';
    elHaloRight.style.opacity = '0';
    elHaloTop.style.opacity = '0';
    elHaloLeft.classList.remove('imminent');
    elHaloRight.classList.remove('imminent');
  }

  // 4. Update Audio Engine
  audioEngine.update(halo.audioToneHz, halo.audioVolume, state.audioEnabled);

  // 5. Update Speed & HUD Pills
  elSpeedNum.textContent = frame.carState.vEgoMph;

  // Confidence Class Pill
  elConfidencePill.className = `confidence-pill class-${halo.alertClass}`;
  elConfidenceLabel.textContent = halo.alertClassLabel.toUpperCase();

  // Actuation Limit Bars (Steering Torque, Brake Pressure, Acceleration Limit)
  const satPct = frame.carState.torqueSaturationPct;
  elBarTorqueFill.style.width = `${satPct}%`;
  if (satPct >= 90) elBarTorqueFill.style.backgroundColor = 'var(--comma-red)';
  else if (satPct >= 75) elBarTorqueFill.style.backgroundColor = 'var(--comma-amber)';
  else elBarTorqueFill.style.backgroundColor = 'var(--comma-cyan)';

  const maxNm = frame.vehicle.max_steer_nm;
  const curNm = Math.abs(frame.carState.steeringTorqueNm);
  elValTorque.textContent = `${curNm} / ${maxNm} Nm [${satPct}%]`;

  // Brake Pressure Limit
  const brakePct = frame.carState.brakePct || 0;
  const brakeBar = frame.carState.brakePressureBar !== undefined ? frame.carState.brakePressureBar : ((brakePct / 100) * 40).toFixed(1);
  elBarBrakeFill.style.width = `${brakePct}%`;
  if (brakePct >= 75) elBarBrakeFill.style.backgroundColor = 'var(--comma-amber)';
  else elBarBrakeFill.style.backgroundColor = 'var(--comma-cyan)';
  elValBrake.textContent = `${brakeBar} bar [${brakePct}%]`;

  // Longitudinal Acceleration Headroom
  const accelMps2 = frame.carState.accelMps2 !== undefined ? frame.carState.accelMps2 : (frame.carState.gasPct ? 0.65 : 0);
  const accelSat = frame.carState.accelSaturationPct !== undefined ? frame.carState.accelSaturationPct : (accelMps2 > 0 ? (accelMps2 / 2.0) * 100 : 0);
  if (elBarAccelFill) {
    elBarAccelFill.style.width = `${Math.min(100, Math.max(0, accelSat))}%`;
    if (accelSat >= 75) elBarAccelFill.style.backgroundColor = 'var(--comma-amber)';
    else elBarAccelFill.style.backgroundColor = 'var(--comma-cyan)';
  }
  if (elValAccel) elValAccel.textContent = `${accelMps2 > 0 ? accelMps2 : 0} / 2.0 m/s²`;

  elValConf.textContent = `${Math.round(frame.modelV2.confidence * 100)}% (σ² ${frame.modelV2.pathVariance})`;

  // Driver Alert Dial (DAD 2.0 Horizon Ball)
  const steerNorm = Math.max(-1, Math.min(1, frame.carState.steeringAngleDeg / 45));
  const ballX = steerNorm * 14;
  const latG = frame.carState.lateralAccel / 9.81;
  const ballY = Math.max(-14, Math.min(14, -latG * 20));
  elDadBall.style.transform = `translate(${ballX}px, ${ballY}px)`;

  if (halo.alertClass === 3) {
    elDadBall.style.backgroundColor = 'var(--comma-red)';
  } else if (halo.alertClass === 2) {
    elDadBall.style.backgroundColor = 'var(--comma-amber)';
  } else {
    elDadBall.style.backgroundColor = 'var(--comma-green)';
  }
  elDadHeadroomVal.textContent = `${frame.carState.torqueHeadroomPct}%`;

  // Anticipatory Alert Banner
  if (halo.alertClass === 3) {
    elPreAlertBanner.classList.add('visible', 'critical');
    elAlertHeading.textContent = 'CRITICAL LIMIT REACHED';
    elAlertMessage.textContent = 'Torque saturation exceeded EPS limits. Manual takeover recommended.';
  } else if (halo.alertClass === 2) {
    elPreAlertBanner.classList.add('visible');
    elPreAlertBanner.classList.remove('critical');
    elAlertHeading.textContent = 'ANTICIPATORY ADVISORY';
    elAlertMessage.textContent = `Approaching EPS torque ceiling (${satPct}%). Peripheral halo active.`;
  } else {
    elPreAlertBanner.classList.remove('visible', 'critical');
  }

  // Right Panel Readouts
  elReadoutSat.textContent = `${satPct}%`;
  elReadoutHeadroom.textContent = `${frame.carState.torqueHeadroomPct}%`;
  elReadoutLat.textContent = `${frame.carState.lateralAccel} m/s²`;
  elReadoutVar.textContent = frame.modelV2.pathVariance;

  // Track Disengagement Prevention Saves
  if (state.lastAlertClass !== halo.alertClass) {
    if (state.lastAlertClass === 2 && halo.alertClass === 1) {
      state.preventedSavesCount++;
      elSavesCounter.textContent = `${state.preventedSavesCount} PREVENTED DISENGAGEMENTS`;
      logEvent('prevented', 'PRE-ALERT SAVE', `Driver smoothly guided through curve. Torque headroom recovered to ${frame.carState.torqueHeadroomPct}%.`);
    } else if (halo.alertClass === 2) {
      logEvent('advisory', 'TORQUE ADVISORY', `Approaching ${satPct}% EPS saturation on ${frame.vehicle.name}.`);
    } else if (halo.alertClass === 3) {
      logEvent('critical', 'IMMINENT OVERRIDE', `Torque ceiling reached. Emergency alert avoided via 4s prior halo notice.`);
    }
    state.lastAlertClass = halo.alertClass;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logEvent(type, tag, msg) {
  const time = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  div.innerHTML = `<span class="log-time">${escapeHtml(time)}</span> <span class="log-tag">[${escapeHtml(tag)}]</span> <span class="log-msg">${escapeHtml(msg)}</span>`;
  elEventStream.prepend(div);
  while (elEventStream.children.length > 20) {
    elEventStream.removeChild(elEventStream.lastChild);
  }
}

// --- WebSocket & Telemetry Stream Manager ---
let ws = null;
let sse = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 10000;

function getNextReconnectDelay() {
  const base = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * Math.pow(1.5, reconnectAttempts));
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return Math.max(1000, base + jitter);
}

function connectStream() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected to live 20Hz telemetry stream');
      reconnectAttempts = 0;
      document.getElementById('connLabel').textContent = '20Hz WEBSOCKET';
      document.getElementById('connStatus').querySelector('.dot').className = 'dot live';
      if (sse) {
        sse.close();
        sse = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        handleTelemetryFrame(frame);
      } catch (e) {
        console.warn('[WS] Malformed telemetry frame received');
      }
    };

    ws.onclose = () => {
      reconnectAttempts++;
      const delay = getNextReconnectDelay();
      console.warn(`[WS] Connection lost. Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts}). Switching to SSE fallback.`);
      document.getElementById('connLabel').textContent = 'FALLBACK SSE';
      startSSEFallback();
      setTimeout(connectStream, delay);
    };

    ws.onerror = (err) => {
      console.error('[WS Error]', err);
      try { ws.close(); } catch (e) {}
    };
  } catch (err) {
    startSSEFallback();
  }
}

function startSSEFallback() {
  if (sse) return;
  sse = new EventSource('/api/stream');
  sse.onmessage = (event) => {
    try {
      const frame = JSON.parse(event.data);
      handleTelemetryFrame(frame);
    } catch (e) {}
  };
}

// --- REST API Data Fetching ---
async function fetchMetadata() {
  try {
    const [vehRes, scenRes] = await Promise.all([
      fetch('/api/vehicles'),
      fetch('/api/scenarios')
    ]);
    state.vehicles = await vehRes.json();
    state.scenarios = await scenRes.json();

    populateScenarios();
    populateVehicles();
  } catch (err) {
    console.error('[API] Failed to fetch metadata:', err);
  }
}

function populateScenarios() {
  elScenarioGrid.innerHTML = '';
  Object.values(state.scenarios).forEach(sc => {
    const btn = document.createElement('div');
    btn.className = `scenario-btn ${sc.id === state.activeScenario ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="sc-title">${escapeHtml(sc.title)}</span>
      <span class="sc-desc">${escapeHtml(sc.description)}</span>
    `;
    btn.onclick = () => selectScenario(sc.id);
    elScenarioGrid.appendChild(btn);
  });
}

function selectScenario(scId) {
  state.activeScenario = scId;
  populateScenarios();
  fetch('/api/control/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scId })
  });
  logEvent('system', 'SCENARIO SWITCH', `Switched to: ${state.scenarios[scId]?.title}`);
}

function populateVehicles() {
  elVehicleSelect.innerHTML = '';
  Object.values(state.vehicles).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    if (v.id === state.activeVehicle) opt.selected = true;
    elVehicleSelect.appendChild(opt);
  });

  updateVehicleUI(state.vehicles[state.activeVehicle]);

  elVehicleSelect.onchange = (e) => {
    const vId = e.target.value;
    state.activeVehicle = vId;
    updateVehicleUI(state.vehicles[vId]);
    fetch('/api/control/vehicle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: vId })
    });
    logEvent('system', 'VEHICLE SWITCH', `Calibrated EPS for: ${state.vehicles[vId]?.name}`);
  };
}

function updateVehicleUI(veh) {
  if (!veh) return;
  elCurrentVehBadge.textContent = veh.model;
  elSpecTorque.textContent = `${veh.max_steer_nm} Nm`;
  elSpecRatio.textContent = `${veh.steer_ratio} : 1`;
  elSpecBrake.textContent = `${veh.max_brake_pressure} bar`;
  elSpecWeight.textContent = `${veh.curb_weight_kg} kg`;
  elVehicleNotes.textContent = veh.notes;
}

// --- View Modes & Event Listeners ---
const mainContainer = document.getElementById('mainContainer');
const tabWindshield = document.getElementById('tabWindshield');
const tabConnect = document.getElementById('tabConnect');
const tabSplit = document.getElementById('tabSplit');

tabWindshield.onclick = () => {
  mainContainer.className = 'main-container hud-only';
  tabWindshield.classList.add('active');
  tabConnect.classList.remove('active');
  tabSplit.classList.remove('active');
};

tabConnect.onclick = () => {
  mainContainer.className = 'main-container connect-only';
  tabConnect.classList.add('active');
  tabWindshield.classList.remove('active');
  tabSplit.classList.remove('active');
};

tabSplit.onclick = () => {
  mainContainer.className = 'main-container split-active';
  tabSplit.classList.add('active');
  tabWindshield.classList.remove('active');
  tabConnect.classList.remove('active');
};

// Audio Toggle
const btnAudioToggle = document.getElementById('btnAudioToggle');
const audioIcon = document.getElementById('audioIcon');
const audioLabel = document.getElementById('audioLabel');

btnAudioToggle.onclick = () => {
  state.audioEnabled = !state.audioEnabled;
  if (state.audioEnabled) {
    audioEngine.init();
    audioIcon.textContent = '🔊';
    audioLabel.textContent = 'audio on';
    btnAudioToggle.style.borderColor = 'var(--comma-green)';
  } else {
    audioEngine.mute();
    audioIcon.textContent = '🔇';
    audioLabel.textContent = 'audio muted';
    btnAudioToggle.style.borderColor = 'var(--border-subtle)';
  }
};

// Boot initialization
window.addEventListener('DOMContentLoaded', () => {
  fetchMetadata();
  connectStream();
});
