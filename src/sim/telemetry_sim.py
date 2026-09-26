#!/usr/bin/env python3
"""
comma.ai openpilot & comma connect - Vehicle Dynamics and Telemetry Simulator
Models vehicle Electronic Power Steering (EPS) torque limits, lateral acceleration,
openpilot modelV2 path uncertainty, and anticipatory pre-limit awareness alerts.
"""

import sys
import time
import json
import math
import argparse

# Vehicle EPS Specifications derived from openpilot selfdrive/car/*/values.py
VEHICLE_PROFILES = {
    'honda_crv_2020': {
        'name': 'Honda CR-V 2020 (Strict EPS Limit)',
        'max_steer_nm': 2.4,          # Strict factory EPS ceiling (video NhfjTfZpk_k)
        'steer_ratio': 15.6,
        'max_brake_pressure': 75.0,
        'curb_weight_kg': 1610.0,
        'k_steer': 0.85,               # Torque gain per m/s^2 of lat accel
    },
    'toyota_rav4_tss2': {
        'name': 'Toyota RAV4 2021 (TSS2 Moderate)',
        'max_steer_nm': 3.2,
        'steer_ratio': 16.8,
        'max_brake_pressure': 80.0,
        'curb_weight_kg': 1640.0,
        'k_steer': 0.80,
    },
    'kia_ev6_2022': {
        'name': 'Kia EV6 2022 (Generous EPS Limit)',
        'max_steer_nm': 4.0,          # High torque headroom (video SUIZYzxtMQs)
        'steer_ratio': 14.2,
        'max_brake_pressure': 90.0,
        'curb_weight_kg': 2050.0,
        'k_steer': 0.72,
    },
    'comma_body': {
        'name': 'comma body (Experimental Robot)',
        'max_steer_nm': 5.0,
        'steer_ratio': 10.0,
        'max_brake_pressure': 100.0,
        'curb_weight_kg': 30.0,
        'k_steer': 0.50,
    }
}

# 4 Core Driving Scenarios
SCENARIOS = {
    'honda_mountain': {
        'id': 'honda_mountain',
        'title': 'Highway 17 Mountain Sweeper (Torque Limit Challenge)',
        'description': 'Tight radius curves push vehicle EPS to maximum torque ceiling. Demonstrates anticipatory peripheral halo alerting driver before torque saturation.',
        'default_vehicle': 'honda_crv_2020',
        'target_speed_mph': 52.0,
        'duration_sec': 60.0,
    },
    'kia_tacobell': {
        'id': 'kia_tacobell',
        'title': 'A Drive to Taco Bell - 90° Urban Turn (EV6 Navigation)',
        'description': 'Urban intersection turn with high steering angle, navigating cross-traffic and signal stop as seen in the landmark comma demo.',
        'default_vehicle': 'kia_ev6_2022',
        'target_speed_mph': 35.0,
        'duration_sec': 50.0,
    },
    'interstate_5': {
        'id': 'interstate_5',
        'title': 'Interstate 5 Cruising (Class 1 Reliable)',
        'description': 'High-speed highway cruising with gentle curves, clear lane lines, 99% model confidence, and ample torque headroom.',
        'default_vehicle': 'toyota_rav4_tss2',
        'target_speed_mph': 70.0,
        'duration_sec': 45.0,
    },
    'construction_glare': {
        'id': 'construction_glare',
        'title': 'Sun Glare & Faded Lane Lines (Perception Uncertainty)',
        'description': 'Direct sunlight and faded asphalt markings cause model confidence to drop into Class 2 and 3, diffusing the path ribbon dynamically.',
        'default_vehicle': 'honda_crv_2020',
        'target_speed_mph': 45.0,
        'duration_sec': 40.0,
    }
}


def get_scenario_state(scenario_id, t):
    """
    Returns road parameters at time t for the given scenario:
    curvature (1/m, + left, - right), target_speed (mph), model_confidence (0..1), brake_pct (0..100), lead_dist (m)
    """
    if scenario_id == 'honda_mountain':
        cycle_t = t % 50.0
        if cycle_t < 8.0:
            curvature = 0.0005 * math.sin(cycle_t * 0.4)
            speed = 52.0
            confidence = 0.96
            brake = 0.0
            lead_dist = 45.0
        elif cycle_t < 14.0:
            progress = (cycle_t - 8.0) / 6.0
            curvature = 0.001 + progress * 0.0035
            speed = 52.0 - progress * 4.0
            confidence = 0.94
            brake = 0.0
            lead_dist = 40.0
        elif cycle_t < 26.0:
            curve_wobble = 0.0046 + 0.0006 * math.sin((cycle_t - 14.0) * 0.8)
            curvature = curve_wobble
            speed = 48.0
            confidence = 0.92
            brake = 0.0
            lead_dist = 38.0
        elif cycle_t < 34.0:
            progress = (cycle_t - 26.0) / 8.0
            curvature = 0.0046 * (1.0 - progress)
            speed = 48.0 + progress * 4.0
            confidence = 0.95
            brake = 0.0
            lead_dist = 42.0
        elif cycle_t < 46.0:
            progress = (cycle_t - 34.0) / 12.0
            curvature = -0.0042 * math.sin(progress * math.pi)
            speed = 50.0
            confidence = 0.93
            brake = 0.0
            lead_dist = 40.0
        else:
            curvature = 0.0
            speed = 52.0
            confidence = 0.96
            brake = 0.0
            lead_dist = 45.0

    elif scenario_id == 'kia_tacobell':
        cycle_t = t % 45.0
        if cycle_t < 10.0:
            curvature = 0.0
            speed = 35.0
            confidence = 0.95
            brake = 0.0
            lead_dist = 28.0
        elif cycle_t < 18.0:
            progress = (cycle_t - 10.0) / 8.0
            curvature = 0.0002
            speed = 35.0 - progress * 23.0
            brake = progress * 35.0
            lead_dist = 18.0 - progress * 6.0
        elif cycle_t < 28.0:
            progress = (cycle_t - 18.0) / 10.0
            turn_envelope = math.sin(progress * math.pi)
            curvature = -0.038 * turn_envelope
            speed = 13.0 + progress * 6.0
            confidence = 0.91
            brake = 0.0
            lead_dist = 22.0
        else:
            progress = (cycle_t - 28.0) / 17.0
            curvature = 0.0
            speed = 19.0 + progress * 16.0
            confidence = 0.96
            brake = 0.0
            lead_dist = 35.0

    elif scenario_id == 'construction_glare':
        cycle_t = t % 40.0
        if cycle_t < 8.0:
            curvature = 0.0004 * math.sin(cycle_t)
            speed = 48.0
            confidence = 0.92
            brake = 0.0
            lead_dist = 50.0
        elif cycle_t < 22.0:
            progress = (cycle_t - 8.0) / 14.0
            curvature = 0.0012 * math.sin(cycle_t * 0.5)
            speed = 48.0 - progress * 10.0
            confidence = 0.92 - progress * 0.62
            brake = progress * 15.0
            lead_dist = 40.0
        elif cycle_t < 32.0:
            curvature = 0.0008 * math.sin(cycle_t * 0.3)
            speed = 38.0
            confidence = 0.32 + 0.06 * math.sin(cycle_t * 2.0)
            brake = 5.0
            lead_dist = 35.0
        else:
            progress = (cycle_t - 32.0) / 8.0
            curvature = 0.0002
            speed = 38.0 + progress * 10.0
            confidence = 0.35 + progress * 0.60
            brake = 0.0
            lead_dist = 45.0

    else:  # interstate_5
        cycle_t = t % 45.0
        curvature = 0.0006 * math.sin(cycle_t * 0.25)
        speed = 70.0 + 1.5 * math.sin(cycle_t * 0.1)
        confidence = 0.97 + 0.02 * math.cos(cycle_t * 0.3)
        brake = 0.0
        lead_dist = 60.0 + 8.0 * math.sin(cycle_t * 0.15)

    return curvature, speed, confidence, brake, lead_dist


def compute_telemetry_frame(scenario_id, vehicle_id, t_sec):
    veh = VEHICLE_PROFILES.get(vehicle_id, VEHICLE_PROFILES['honda_crv_2020'])
    curvature, speed_mph, model_conf, brake_pct, lead_dist = get_scenario_state(scenario_id, t_sec)

    v_mps = speed_mph * 0.44704
    lat_accel = (v_mps ** 2) * curvature

    wheelbase_m = 2.7
    steer_angle_wheel_deg = math.degrees(math.atan(curvature * wheelbase_m))
    steering_angle_deg = steer_angle_wheel_deg * (veh['steer_ratio'] / 15.0)

    tau_demand = veh['k_steer'] * lat_accel + 0.02 * math.sin(t_sec * 8.0)
    tau_max = veh['max_steer_nm']
    tau_applied = max(-tau_max, min(tau_max, tau_demand))

    tau_abs = abs(tau_demand)
    torque_saturation_pct = min(100.0, (tau_abs / tau_max) * 100.0)
    torque_headroom_pct = max(0.0, 100.0 - torque_saturation_pct)

    if torque_saturation_pct >= 98.0:
        drift_rate = (tau_abs - tau_max) * 0.4
        lateral_error_m = drift_rate
    else:
        lateral_error_m = 0.0

    path_variance = (1.0 - model_conf) * 1.8 + 0.05

    if torque_saturation_pct >= 92.0 or model_conf < 0.42:
        alert_class = 3
        alert_class_label = "Class 3 (Imminent Disengagement)"
    elif torque_saturation_pct >= 75.0 or model_conf < 0.75:
        alert_class = 2
        alert_class_label = "Class 2 (Advisory / Caution)"
    else:
        alert_class = 1
        alert_class_label = "Class 1 (Reliable)"

    halo_active = (torque_saturation_pct >= 75.0)
    if halo_active:
        halo_side = 'left' if tau_demand > 0 else 'right'
        halo_intensity = min(1.0, max(0.0, (torque_saturation_pct - 75.0) / 25.0))
    else:
        halo_side = 'none'
        halo_intensity = 0.0

    if torque_saturation_pct >= 78.0:
        norm_t = (torque_saturation_pct - 78.0) / 22.0
        audio_tone_hz = 220.0 + norm_t * 220.0
        audio_volume = 0.15 + norm_t * 0.45
    else:
        audio_tone_hz = 0.0
        audio_volume = 0.0

    path_points = []
    for x in range(0, 85, 5):
        y_center = 0.5 * curvature * (x ** 2)
        half_width = 1.6 + (x / 80.0) * (path_variance * 1.4)
        path_points.append({
            'x': round(float(x), 1),
            'y': round(float(y_center), 3),
            'half_width': round(float(half_width), 3)
        })

    frame = {
        'timestamp_ms': int(t_sec * 1000),
        'scenario': scenario_id,
        'vehicle': {
            'id': vehicle_id,
            'name': veh['name'],
            'max_steer_nm': veh['max_steer_nm'],
            'steer_ratio': veh['steer_ratio']
        },
        'carState': {
            'vEgo': round(v_mps, 2),
            'vEgoMph': round(speed_mph, 1),
            'steeringAngleDeg': round(steering_angle_deg, 2),
            'steeringTorqueNm': round(tau_applied, 2),
            'steeringTorqueDemandNm': round(tau_demand, 2),
            'torqueSaturationPct': round(torque_saturation_pct, 1),
            'torqueHeadroomPct': round(torque_headroom_pct, 1),
            'lateralAccel': round(lat_accel, 2),
            'brakePct': round(brake_pct, 1),
            'brakePressureBar': round((brake_pct / 100.0) * veh['max_brake_pressure'], 1),
            'brakeSaturationPct': round(brake_pct, 1),
            'gasPct': round(0.0 if brake_pct > 0 else 24.0, 1),
            'accelMps2': round(-((brake_pct / 100.0) * 3.5), 2) if brake_pct > 0 else 0.65,
            'accelSaturationPct': round(0.0 if brake_pct > 0 else 32.5, 1),
            'curvature': round(curvature, 5),
            'lateralErrorM': round(lateral_error_m, 3),
        },
        'modelV2': {
            'confidence': round(model_conf, 3),
            'pathVariance': round(path_variance, 3),
            'leftLaneProb': round(min(1.0, model_conf + 0.02), 2),
            'rightLaneProb': round(min(1.0, model_conf - 0.01), 2),
            'leadDistanceM': round(lead_dist, 1),
            'pathPoints': path_points,
        },
        'confidenceEngine': {
            'alertClass': alert_class,
            'alertClassLabel': alert_class_label,
            'haloActive': halo_active,
            'haloSide': halo_side,
            'haloIntensity': round(halo_intensity, 2),
            'audioToneHz': round(audio_tone_hz, 1),
            'audioVolume': round(audio_volume, 2),
            'preAlertActive': (alert_class == 2 and halo_active),
            'imminentTakeover': (alert_class == 3),
            'actuatorLimits': {
                'steerSaturated': torque_saturation_pct >= 75.0,
                'brakeSaturated': brake_pct >= 75.0,
                'accelSaturated': False
            }
        }
    }
    return frame


def main():
    parser = argparse.ArgumentParser(description="comma.ai Telemetry Simulator")
    parser.add_argument('--scenario', default='honda_mountain', choices=list(SCENARIOS.keys()))
    parser.add_argument('--vehicle', default='honda_crv_2020', choices=list(VEHICLE_PROFILES.keys()))
    parser.add_argument('--fps', type=int, default=20)
    parser.add_argument('--test', action='store_true', help="Run headless 50-frame validation")
    args = parser.parse_args()

    if args.test:
        print("[TEST] Running 50 frames of telemetry simulation...")
        t0 = time.time()
        for i in range(50):
            frame = compute_telemetry_frame(args.scenario, args.vehicle, i * 0.05)
            assert 'carState' in frame
            assert 'modelV2' in frame
            assert 'confidenceEngine' in frame
            assert frame['confidenceEngine']['alertClass'] in [1, 2, 3]
        elapsed = time.time() - t0
        print(f"[TEST PASSED] 50 frames generated successfully in {elapsed*1000:.2f}ms")
        sys.exit(0)

    interval = 1.0 / args.fps
    start_time = time.time()
    current_scenario = args.scenario
    current_vehicle = args.vehicle

    while True:
        t_sec = time.time() - start_time
        frame = compute_telemetry_frame(current_scenario, current_vehicle, t_sec)
        sys.stdout.write(json.dumps(frame) + "\n")
        sys.stdout.flush()
        time.sleep(interval)


if __name__ == '__main__':
    main()
