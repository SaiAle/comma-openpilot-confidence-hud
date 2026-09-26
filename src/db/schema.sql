-- comma.ai openpilot & comma connect Database Schema
-- Compatible with MySQL 8.x and SQLite 3.x

CREATE TABLE IF NOT EXISTS vehicle_profiles (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  make VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  year INTEGER NOT NULL,
  max_steer_nm REAL NOT NULL,          -- Maximum EPS torque ceiling in Nm
  steer_ratio REAL NOT NULL,           -- Steering gear ratio
  max_steer_rate_deg_s REAL NOT NULL,  -- Maximum steering wheel angular rate (deg/s)
  max_brake_pressure_bar REAL NOT NULL,-- Maximum brake line pressure (bar)
  max_accel_m_s2 REAL NOT NULL,        -- Max longitudinal acceleration (m/s^2)
  min_accel_m_s2 REAL NOT NULL,        -- Max braking deceleration (m/s^2, negative)
  curb_weight_kg REAL NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS drive_routes (
  id VARCHAR(128) PRIMARY KEY,
  vehicle_id VARCHAR(64) NOT NULL,
  scenario_name VARCHAR(128) NOT NULL,
  start_time VARCHAR(64) NOT NULL,
  end_time VARCHAR(64),
  duration_seconds REAL DEFAULT 0,
  distance_miles REAL DEFAULT 0,
  max_torque_nm REAL DEFAULT 0,
  avg_confidence REAL DEFAULT 1.0,
  disengagement_count INTEGER DEFAULT 0,
  pre_alert_saves_count INTEGER DEFAULT 0,
  FOREIGN KEY (vehicle_id) REFERENCES vehicle_profiles(id)
);

CREATE TABLE IF NOT EXISTS telemetry_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id VARCHAR(128) NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  speed_mph REAL NOT NULL,
  steering_angle_deg REAL NOT NULL,
  steering_torque_nm REAL NOT NULL,
  torque_saturation_pct REAL NOT NULL,
  torque_headroom_pct REAL NOT NULL,
  brake_pct REAL NOT NULL,
  gas_pct REAL NOT NULL,
  model_confidence REAL NOT NULL,
  path_variance REAL NOT NULL,
  alert_class INTEGER NOT NULL,        -- 1: Reliable, 2: Advisory, 3: Imminent Disengagement
  halo_active INTEGER NOT NULL,        -- 0: Inactive, 1: Active
  audio_tone_hz REAL DEFAULT 0,
  FOREIGN KEY (route_id) REFERENCES drive_routes(id)
);

CREATE TABLE IF NOT EXISTS disengagement_prevention_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id VARCHAR(128) NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  event_type VARCHAR(64) NOT NULL,     -- TORQUE_SATURATION_PRE_ALERT, VISION_DEGRADATION, BRAKE_LIMIT
  severity VARCHAR(32) NOT NULL,       -- ADVISORY, WARNING
  driver_reaction_ms INTEGER,
  resolved_without_disengagement INTEGER DEFAULT 1,
  description TEXT,
  FOREIGN KEY (route_id) REFERENCES drive_routes(id)
);

-- Seed Vehicle Profiles
-- Data derived from openpilot vehicle definitions (selfdrive/car/*/values.py)
INSERT OR REPLACE INTO vehicle_profiles 
  (id, name, make, model, year, max_steer_nm, steer_ratio, max_steer_rate_deg_s, max_brake_pressure_bar, max_accel_m_s2, min_accel_m_s2, curb_weight_kg, notes)
VALUES
  ('honda_crv_2020', 'Honda CR-V 2020 (Strict EPS Limit)', 'Honda', 'CR-V', 2020, 2.4, 15.6, 250.0, 75.0, 1.8, -3.2, 1610.0, 'Strict factory EPS torque limit. Subject of video NhfjTfZpk_k. Prone to early torque saturation on winding curves.'),
  ('toyota_rav4_tss2', 'Toyota RAV4 2021 (TSS2 Moderate)', 'Toyota', 'RAV4', 2021, 3.2, 16.8, 300.0, 80.0, 2.0, -3.5, 1640.0, 'Toyota Safety Sense 2.0. Balanced torque margin for highway cruising and moderate sweepers.'),
  ('kia_ev6_2022', 'Kia EV6 2022 (Generous EPS Limit)', 'Kia', 'EV6', 2022, 4.0, 14.2, 400.0, 90.0, 2.4, -4.0, 2050.0, 'High torque headroom. Handled tight 90-degree intersection turns in A Drive to Taco Bell video (SUIZYzxtMQs).'),
  ('comma_body', 'comma body (Experimental Robot)', 'comma', 'body', 2024, 5.0, 10.0, 500.0, 100.0, 3.0, -4.5, 30.0, 'High agility reference platform with full motor actuation.');
