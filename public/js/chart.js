/**
 * Real-time CAN Telemetry Timeseries Chart
 * Visualizes 20Hz continuous history of EPS torque saturation and model confidence.
 */

class TelemetryChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
  }

  render(history, maxHistoryLength = 120) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background & Gridlines
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#181c24';
    ctx.lineWidth = 1;
    for (let y = 30; y < H; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    // Draw 90% Torque Saturation Warning Line
    const sat90Y = H - (H * 0.90);
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, sat90Y);
    ctx.lineTo(W, sat90Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 23, 68, 0.8)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('90% SATURATION CEILING', W - 10, sat90Y - 4);

    const stepX = W / (maxHistoryLength - 1);

    // 1. Draw Model Confidence % (Cyan)
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((f, i) => {
      const conf = f.modelV2.confidence;
      const x = i * stepX;
      const y = H - (conf * (H - 20)) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Draw Torque Saturation % (Amber / Red)
    ctx.strokeStyle = '#FFB300';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    history.forEach((f, i) => {
      const sat = f.carState.torqueSaturationPct / 100.0;
      const x = i * stepX;
      const y = H - (sat * (H - 20)) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Legend
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#FFB300';
    ctx.fillRect(10, 10, 8, 8);
    ctx.fillText('EPS Torque Saturation %', 24, 17);

    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(180, 10, 8, 8);
    ctx.fillText('Model Confidence %', 194, 17);
  }
}

window.TelemetryChart = TelemetryChart;
