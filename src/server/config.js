/**
 * Server Configuration & Vehicle/Scenario Calibrations
 * Defines hardware EPS torque ceilings, brake limits, and scenarios.
 */

const PORT = process.env.PORT || 3000;

const VEHICLE_PROFILES = {
  honda_crv_2020: {
    id: 'honda_crv_2020',
    name: 'Honda CR-V 2020 (Strict EPS Limit)',
    make: 'Honda',
    model: 'CR-V',
    year: 2020,
    max_steer_nm: 2.4,          // Strict factory EPS ceiling (YouTube: NhfjTfZpk_k)
    steer_ratio: 15.6,
    max_brake_pressure: 75.0,   // bar
    curb_weight_kg: 1610.0,
    k_steer: 0.85,
    notes: 'Prone to early EPS torque saturation on curves. Demonstrates peripheral halo warning.'
  },
  toyota_rav4_tss2: {
    id: 'toyota_rav4_tss2',
    name: 'Toyota RAV4 2021 (TSS2 Moderate)',
    make: 'Toyota',
    model: 'RAV4',
    year: 2021,
    max_steer_nm: 3.2,
    steer_ratio: 16.8,
    max_brake_pressure: 80.0,
    curb_weight_kg: 1640.0,
    k_steer: 0.80,
    notes: 'Balanced torque margin for highway cruising and moderate curves.'
  },
  kia_ev6_2022: {
    id: 'kia_ev6_2022',
    name: 'Kia EV6 2022 (Generous EPS Limit)',
    make: 'Kia',
    model: 'EV6',
    year: 2022,
    max_steer_nm: 4.0,          // Generous torque headroom (YouTube: SUIZYzxtMQs)
    steer_ratio: 14.2,
    max_brake_pressure: 90.0,
    curb_weight_kg: 2050.0,
    k_steer: 0.72,
    notes: 'High torque headroom handles 90-degree intersection turns effortlessly.'
  },
  comma_body: {
    id: 'comma_body',
    name: 'comma body (Experimental Robot)',
    make: 'comma',
    model: 'body',
    year: 2024,
    max_steer_nm: 5.0,
    steer_ratio: 10.0,
    max_brake_pressure: 100.0,
    curb_weight_kg: 30.0,
    k_steer: 0.50,
    notes: 'Robotics platform reference model.'
  }
};

const SCENARIOS = {
  honda_mountain: {
    id: 'honda_mountain',
    title: 'Highway 17 Mountain Sweeper (Torque Limit Challenge)',
    description: 'Tight radius curves push vehicle EPS to maximum torque ceiling. Demonstrates anticipatory peripheral halo alerting driver before torque saturation.',
    default_vehicle: 'honda_crv_2020',
    target_speed_mph: 52.0
  },
  kia_tacobell: {
    id: 'kia_tacobell',
    title: 'A Drive to Taco Bell - 90° Urban Turn (EV6 Navigation)',
    description: 'Urban intersection turn with high steering angle, navigating cross-traffic and signal stop as seen in the landmark comma demo.',
    default_vehicle: 'kia_ev6_2022',
    target_speed_mph: 35.0
  },
  interstate_5: {
    id: 'interstate_5',
    title: 'Interstate 5 Cruising (Class 1 Reliable)',
    description: 'High-speed highway cruising with gentle curves, clear lane lines, 99% model confidence, and ample torque headroom.',
    default_vehicle: 'toyota_rav4_tss2',
    target_speed_mph: 70.0
  },
  construction_glare: {
    id: 'construction_glare',
    title: 'Sun Glare & Faded Lane Lines (Perception Uncertainty)',
    description: 'Direct sunlight and faded markings cause model confidence to drop into Class 2 and 3, diffusing the path ribbon dynamically.',
    default_vehicle: 'honda_crv_2020',
    target_speed_mph: 45.0
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:;"
};

module.exports = {
  PORT,
  VEHICLE_PROFILES,
  SCENARIOS,
  MIME_TYPES,
  SECURITY_HEADERS
};
