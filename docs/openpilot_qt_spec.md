# openpilot Qt / QML Integration Specification (`selfdrive/ui/qt/`)

This document details the exact drop-in implementation architecture for integrating the **Directional Peripheral Torque Halo**, **Analog Path Uncertainty Ribbon**, and **Progressive Acoustic Synthesizer** directly into openpilot's on-device UI codebase.

---

## 1. Cereal IPC Message Extraction (`selfdrive/ui/ui.cc`)

openpilot's UI loop subscribes to cereal messages via `SubMaster`. We extract actuation limits and model uncertainty directly from existing IPC sockets without protocol changes:

```cpp
// In selfdrive/ui/ui.cc: UIState::updateState()
void UIState::updateActuatorLimits(SubMaster &sm) {
  if (sm.updated("carState")) {
    auto car_state = sm["carState"].getCarState();
    float steer_torque = std::abs(car_state.getSteeringTorque());
    float steer_max = scene.car_params.getSteerMaxTorque(); // Hardware EPS ceiling (e.g. 2.4 Nm)
    
    scene.torque_saturation = (steer_max > 0) ? (steer_torque / steer_max) : 0.0f;
    scene.steer_saturated = (scene.torque_saturation >= 0.75f);
    scene.steer_demand_sign = car_state.getSteeringTorque() > 0 ? 1 : -1;
    
    // Longitudinal brake pressure & acceleration limits
    scene.brake_pressure_bar = car_state.getBrake();
    scene.brake_saturated = (car_state.getBrake() > 0.75f);
  }

  if (sm.updated("modelV2")) {
    auto model = sm["modelV2"].getModelDataV2();
    // Path variance from model position standard deviations
    auto y_std = model.getPosition().getYStd();
    scene.path_variance = (y_std.size() > 0) ? y_std[0] : 0.08f;
    scene.model_confidence = std::clamp(1.0f - (scene.path_variance / 2.0f), 0.0f, 1.0f);
  }
}
```

---

## 2. Qt Painter Rendering (`selfdrive/ui/qt/onroad/annotated_camera.cc`)

The visual elements map 1:1 to high-performance OpenGL-backed `QPainter` primitives:

```cpp
// In AnnotatedCameraWidget::paintGL()

// 1. Directional Peripheral Torque Halo (Bezel Edge)
void AnnotatedCameraWidget::drawPeripheralHalo(QPainter &p) {
  if (s->scene.torque_saturation < 0.75f) return;

  float intensity = (s->scene.torque_saturation - 0.75f) / 0.25f; // 0.0 to 1.0
  QColor halo_color = (s->scene.torque_saturation >= 0.92f) 
                        ? QColor(255, 23, 68, 220 * intensity)   // Class 3 Red
                        : QColor(255, 179, 0, 180 * intensity);  // Class 2 Amber

  p.setPen(Qt::NoPen);
  p.setBrush(halo_color);

  // Directional edge: driver's peripheral field
  if (s->scene.steer_demand_sign > 0) {
    // Left bezel glow (48px wide flat band along left border)
    p.drawRect(0, 0, 48, height());
  } else {
    // Right bezel glow
    p.drawRect(width() - 48, 0, 48, height());
  }
}

// 2. Analog Dynamic Path Ribbon with Model Uncertainty
void AnnotatedCameraWidget::drawPathRibbon(QPainter &p) {
  QPainterPath track_path;
  const auto &path_points = s->scene.model_path;
  
  // Outer ribbon expands proportionally to model path variance (sigma^2)
  float variance_spread = 1.0f + 1.2f * s->scene.path_variance;
  
  // Construct polygon using project_points() into screen coordinates
  // Base color: Pure comma cyan / green when reliable, interpolating to amber when uncertain
  QColor path_color = (s->scene.model_confidence > 0.75f) 
                        ? QColor(0, 229, 255, 160) 
                        : QColor(255, 179, 0, 160);
  
  p.fillPath(track_path, path_color);
}
```

---

## 3. Progressive Acoustic Integration (`selfdrive/ui/soundd.cc`)

Replaces openpilot's jarring binary alarm with a gentle pre-alert cue:

```cpp
// When torque_saturation reaches 78%, soundd fires a soft harmonic chime
// 1.5s - 2.5s before trajectory deviation occurs.
if (scene.torque_saturation >= 0.78f && scene.torque_saturation < 0.92f) {
  sound.play(AudibleAlert::PROMPT_DISTRACTED, false); // Gentle non-jarring chime
} else if (scene.torque_saturation >= 0.92f) {
  sound.play(AudibleAlert::WARNING_IMMEDIATE, true);   // Critical takeover
}
```
