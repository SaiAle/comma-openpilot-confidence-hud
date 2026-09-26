/**
 * 60 FPS HTML5 Canvas Road & Analog Path Uncertainty Renderer
 * Projects vanishing perspective road surface, outer lane boundaries,
 * and the continuous analog path ribbon whose width dynamically expands
 * based on neural network model variance (sigma^2).
 */

class RoadHUDCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.roadOffset = 0;
  }

  render(frame) {
    if (!frame) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    const speedMps = frame.carState.vEgo || 20;
    this.roadOffset = (this.roadOffset + speedMps * 0.4) % 40;

    const curvature = frame.carState.curvature || 0;
    const confidence = frame.modelV2.confidence || 0.95;
    const variance = frame.modelV2.pathVariance || 0.08;
    const alertClass = frame.confidenceEngine.alertClass || 1;

    // Vanishing Point
    const horizonY = H * 0.40;
    const curveOffsetPx = curvature * 6500;
    const vpX = W * 0.5 + curveOffsetPx;

    // 1. Draw Sky / Ground gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#040508');
    skyGrad.addColorStop(1, '#0e1118');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizonY);

    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    groundGrad.addColorStop(0, '#11141c');
    groundGrad.addColorStop(1, '#06070a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // 2. Draw Road Surface
    const roadBottomLeft = W * 0.08;
    const roadBottomRight = W * 0.92;
    const roadTopLeft = vpX - 45;
    const roadTopRight = vpX + 45;

    ctx.beginPath();
    ctx.moveTo(roadBottomLeft, H);
    ctx.lineTo(roadTopLeft, horizonY);
    ctx.lineTo(roadTopRight, horizonY);
    ctx.lineTo(roadBottomRight, H);
    ctx.closePath();
    ctx.fillStyle = '#141720';
    ctx.fill();

    // 3. Draw Outer Lane Boundary Lines
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;

    // Left Boundary
    ctx.beginPath();
    ctx.moveTo(roadBottomLeft, H);
    ctx.quadraticCurveTo(W * 0.25 + curveOffsetPx * 0.5, H * 0.65, roadTopLeft, horizonY);
    ctx.stroke();

    // Right Boundary
    ctx.beginPath();
    ctx.moveTo(roadBottomRight, H);
    ctx.quadraticCurveTo(W * 0.75 + curveOffsetPx * 0.5, H * 0.65, roadTopRight, horizonY);
    ctx.stroke();

    // 4. Draw Center Dashed Line (Animated)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -this.roadOffset;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H);
    ctx.quadraticCurveTo(W * 0.5 + curveOffsetPx * 0.6, H * 0.65, vpX, horizonY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw THE ANALOG PATH UNCERTAINTY RIBBON (Core Challenge Feature)
    this.renderPathRibbon(ctx, W, H, horizonY, vpX, curvature, variance, confidence, alertClass);

    // 6. Draw Lead Car Chevron / Distance Tag
    if (frame.modelV2.leadDistanceM) {
      this.renderLeadCar(ctx, W, H, horizonY, vpX, frame.modelV2.leadDistanceM, curveOffsetPx);
    }
  }

  renderPathRibbon(ctx, W, H, horizonY, vpX, curvature, variance, confidence, alertClass) {
    const bottomCenterX = W * 0.5;
    const bottomBaseWidth = 240;
    const uncertaintySpread = variance * 80;
    const bottomWidth = bottomBaseWidth + uncertaintySpread;

    const topCenterX = vpX;
    const topWidth = 22 + (variance * 24);

    let ribbonColor, edgeColor;
    if (alertClass === 1) {
      ribbonColor = 'rgba(0, 229, 255, 0.22)';
      edgeColor = '#00E5FF';
    } else if (alertClass === 2) {
      ribbonColor = 'rgba(255, 179, 0, 0.30)';
      edgeColor = '#FFB300';
    } else {
      ribbonColor = 'rgba(255, 23, 68, 0.40)';
      edgeColor = '#FF1744';
    }

    const cpX = (bottomCenterX + topCenterX) / 2 + (curvature * 3500);
    const cpY = (H + horizonY) / 2;

    // Fill Trajectory Ribbon
    ctx.beginPath();
    ctx.moveTo(bottomCenterX - bottomWidth / 2, H);
    ctx.quadraticCurveTo(cpX - topWidth * 1.5, cpY, topCenterX - topWidth / 2, horizonY);
    ctx.lineTo(topCenterX + topWidth / 2, horizonY);
    ctx.quadraticCurveTo(cpX + topWidth * 1.5, cpY, bottomCenterX + bottomWidth / 2, H);
    ctx.closePath();

    ctx.fillStyle = ribbonColor;
    ctx.fill();

    // High-Contrast Edge Laser Lines
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = edgeColor;

    // Left edge
    ctx.beginPath();
    ctx.moveTo(bottomCenterX - bottomWidth / 2, H);
    ctx.quadraticCurveTo(cpX - topWidth * 1.5, cpY, topCenterX - topWidth / 2, horizonY);
    ctx.stroke();

    // Right edge
    ctx.beginPath();
    ctx.moveTo(bottomCenterX + bottomWidth / 2, H);
    ctx.quadraticCurveTo(cpX + topWidth * 1.5, cpY, topCenterX + topWidth / 2, horizonY);
    ctx.stroke();

    // Uncertainty Chevron Waves
    const numWaves = 4;
    for (let i = 1; i <= numWaves; i++) {
      const prog = (i / (numWaves + 1));
      const waveY = H - (H - horizonY) * (prog * 0.85);
      const waveW = bottomWidth * (1.0 - prog * 0.65);
      const waveCenterX = bottomCenterX + (topCenterX - bottomCenterX) * (prog ** 1.3);

      ctx.beginPath();
      ctx.moveTo(waveCenterX - waveW * 0.35, waveY);
      ctx.lineTo(waveCenterX, waveY - 8);
      ctx.lineTo(waveCenterX + waveW * 0.35, waveY);
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }
  }

  renderLeadCar(ctx, W, H, horizonY, vpX, distMeters, curveOffsetPx) {
    const normDist = Math.max(0, Math.min(1, (distMeters - 10) / 70));
    const carY = H - (H - horizonY) * (1.0 - normDist * 0.65);
    const carX = vpX + (curveOffsetPx * (1.0 - normDist) * 0.05);

    const boxW = Math.max(28, 90 * (1.0 - normDist * 0.7));
    const boxH = boxW * 0.65;

    // Lead car triangular chevron
    ctx.fillStyle = '#FF1744';
    ctx.beginPath();
    ctx.moveTo(carX, carY - boxH - 10);
    ctx.lineTo(carX - 8, carY - boxH - 22);
    ctx.lineTo(carX + 8, carY - boxH - 22);
    ctx.closePath();
    ctx.fill();

    // Distance tag
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.fillRect(carX - 25, carY + 4, 50, 16);
    ctx.strokeRect(carX - 25, carY + 4, 50, 16);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${distMeters.toFixed(1)}m`, carX, carY + 16);
  }
}

window.RoadHUDCanvas = RoadHUDCanvas;
