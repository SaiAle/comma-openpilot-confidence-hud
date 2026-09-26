/**
 * Native Node.js HTTP & WebSocket Server (Zero-Dependency)
 * Serves comma connect REST APIs, 20Hz RFC-6455 WebSocket stream, SSE fallback,
 * and hardened static asset delivery with OWASP security headers.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const { PORT, VEHICLE_PROFILES, SCENARIOS, MIME_TYPES, SECURITY_HEADERS } = require('./config');
const { computeTelemetryFrameJS } = require('./physics');

const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const DB_DIR = path.resolve(__dirname, '../db');
const DB_FILE = path.join(DB_DIR, 'database.json');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Database state
let db = {
  vehicles: VEHICLE_PROFILES,
  routes: [
    {
      id: 'route_honda_mountain_demo',
      vehicle_id: 'honda_crv_2020',
      scenario_name: 'Highway 17 Mountain Sweeper',
      start_time: new Date(Date.now() - 3600000).toISOString(),
      end_time: new Date(Date.now() - 1800000).toISOString(),
      duration_seconds: 1800,
      distance_miles: 24.5,
      max_torque_nm: 2.38,
      avg_confidence: 0.93,
      disengagement_count: 0,
      pre_alert_saves_count: 4
    }
  ],
  saved_events: []
};

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
  } catch (e) {
    console.warn('[DB] Using default initial database');
  }
}

function persistDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Persist error:', err.message);
  }
}

// Telemetry state
let activeScenario = 'honda_mountain';
let activeVehicle = 'honda_crv_2020';
let simulationStartTime = Date.now();
let isPaused = false;
let currentFrame = null;
const sseClients = new Set();
const wsClients = new Set();

// 20Hz Telemetry Broadcast Loop (50ms interval)
setInterval(() => {
  if (isPaused) return;
  const tSec = (Date.now() - simulationStartTime) / 1000.0;
  currentFrame = computeTelemetryFrameJS(activeScenario, activeVehicle, tSec);
  const payload = JSON.stringify(currentFrame);

  // Broadcast to Server-Sent Event clients
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }

  // Broadcast to WebSocket clients
  for (const client of wsClients) {
    if (!client.destroyed && client.writable) {
      sendWsText(client, payload);
    }
  }
}, 50);

// --- Native RFC 6455 WebSocket Implementation ---
function handleWsUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const digest = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${digest}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');
  wsClients.add(socket);

  if (currentFrame) {
    sendWsText(socket, JSON.stringify(currentFrame));
  }

  socket.on('data', (buffer) => {
    const opcode = buffer[0] & 0x0f;
    if (opcode === 0x08) {
      // Close frame
      wsClients.delete(socket);
      socket.end();
    } else if (opcode === 0x09) {
      // Ping -> Pong
      const pongFrame = Buffer.from([0x8a, 0x00]);
      socket.write(pongFrame);
    }
  });

  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => {
    wsClients.delete(socket);
    socket.destroy();
  });
}

function sendWsText(socket, text) {
  const payloadBuf = Buffer.from(text, 'utf8');
  const length = payloadBuf.length;

  let headerBuf;
  if (length <= 125) {
    headerBuf = Buffer.alloc(2);
    headerBuf[0] = 0x81;
    headerBuf[1] = length;
  } else if (length <= 65535) {
    headerBuf = Buffer.alloc(4);
    headerBuf[0] = 0x81;
    headerBuf[1] = 126;
    headerBuf.writeUInt16BE(length, 2);
  } else {
    headerBuf = Buffer.alloc(10);
    headerBuf[0] = 0x81;
    headerBuf[1] = 127;
    headerBuf.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([headerBuf, payloadBuf]));
}

// --- HTTP Request Handler ---
const server = http.createServer((req, res) => {
  const host = req.headers.host || 'localhost:3000';
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${host}`);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Apply OWASP Security Headers
  for (const [key, val] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, val);
  }

  // --- API Routes ---
  if (pathname === '/api/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      version: '1.0.0',
      uptime_sec: Math.floor(process.uptime()),
      active_connections: { sse: sseClients.size, ws: wsClients.size },
      activeScenario,
      activeVehicle
    }));
    return;
  }

  if (pathname === '/api/vehicles' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.vehicles));
    return;
  }

  if (pathname === '/api/scenarios' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SCENARIOS));
    return;
  }

  if (pathname === '/api/routes' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.routes));
    return;
  }

  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.saved_events));
    return;
  }

  if (pathname === '/api/events' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        eventData.id = 'event_' + Date.now();
        eventData.recorded_at = new Date().toISOString();
        db.saved_events.unshift(eventData);
        persistDb();
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(eventData));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname === '/api/control/scenario' && method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { scenario_id, vehicle_id } = JSON.parse(body);
        if (SCENARIOS[scenario_id]) {
          activeScenario = scenario_id;
          if (vehicle_id && db.vehicles[vehicle_id]) {
            activeVehicle = vehicle_id;
          } else {
            activeVehicle = SCENARIOS[scenario_id].default_vehicle;
          }
          simulationStartTime = Date.now();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, activeScenario, activeVehicle }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Scenario not found' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  if (pathname === '/api/control/vehicle' && method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { vehicle_id } = JSON.parse(body);
        if (db.vehicles[vehicle_id]) {
          activeVehicle = vehicle_id;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, activeVehicle }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Vehicle profile not found' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname === '/api/control/pause' && method === 'POST') {
    isPaused = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, isPaused: true }));
    return;
  }

  if (pathname === '/api/control/resume' && method === 'POST') {
    isPaused = false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, isPaused: false }));
    return;
  }

  if (pathname === '/api/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (pathname === '/api/routes' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const newRoute = JSON.parse(body);
        if (!newRoute.vehicle_id || typeof newRoute.vehicle_id !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid vehicle_id' }));
          return;
        }
        newRoute.id = 'route_' + Date.now();
        newRoute.start_time = newRoute.start_time ? String(newRoute.start_time).slice(0, 64) : new Date().toISOString();
        db.routes.unshift(newRoute);
        persistDb();
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newRoute));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // Unmatched API endpoint handler
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
    return;
  }

  // --- Static File Serving from PUBLIC_DIR with Traversal Defense ---
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  if (decodedPath.includes('..') || pathname.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Path traversal detected');
    return;
  }

  const cleanRelative = decodedPath.replace(/^[/\\]+/, '');
  const targetRelative = cleanRelative === '' ? 'index.html' : cleanRelative;
  const filePath = path.resolve(PUBLIC_DIR, targetRelative);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

// Upgrade handling for WebSockets
server.on('upgrade', (req, socket) => {
  if (req.url === '/ws/telemetry') {
    handleWsUpgrade(req, socket);
  } else {
    socket.destroy();
  }
});

function gracefulShutdown() {
  console.log('\n[SERVER] Graceful shutdown initiated...');
  persistDb();
  for (const client of wsClients) {
    try { client.destroy(); } catch (e) {}
  }
  for (const client of sseClients) {
    try { client.end(); } catch (e) {}
  }
  server.close(() => {
    console.log('[SERVER] Server closed cleanly.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

function startServer(port = PORT, host = '0.0.0.0') {
  return server.listen(port, host, () => {
    console.log(`================================================================`);
    console.log(`comma.ai openpilot & comma connect Telemetry Suite`);
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket Stream at ws://localhost:${port}/ws/telemetry`);
    console.log(`SSE Fallback at http://localhost:${port}/api/stream`);
    console.log(`Active Scenario: ${activeScenario} | Active Vehicle: ${activeVehicle}`);
    console.log(`================================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  server,
  startServer,
  db
};
