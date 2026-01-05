// ============================================================================
// Capacitive Sensor Data Visualizer
// ============================================================================
// Visualizes 12-electrode MPR121 capacitive sensor data in real-time
// Grid/matrix layout showing all 12 electrodes
// ============================================================================

class CapacitiveVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Setup high-DPI canvas for crisp rendering
    this.setupHighDPI();

    // Data buffer for 12 electrodes
    this.dataBuffer = {
      e0: [], e1: [], e2: [], e3: [],
      e4: [], e5: [], e6: [], e7: [],
      e8: [], e9: [], e10: [], e11: []
    };

    this.maxBufferSize = 100; // Show last 100 frames
    this.isAnimating = false;
    this.isCapturing = false; // Track if currently capturing samples

    // Layout configuration for 12 electrodes
    // Arrange in 3 rows × 4 columns grid
    this.gridLayout = {
      rows: 3,
      cols: 4,
      cellPadding: 8
    };

    // Colors - Purple theme matching IMU visualizer
    this.colors = {
      grid: '#2a1a4a',
      text: '#a0a0d0',
      background: '#0f0a1f',
      // Electrode colors (gradient from purple to cyan)
      electrodes: [
        '#7c4dff', '#8e59ff', '#a165ff', '#b371ff',
        '#6bb6ff', '#5eaaff', '#519eff', '#4492ff',
        '#4ecdc4', '#42c1b8', '#36b5ac', '#2aa9a0'
      ],
      // Heat map colors for intensity
      heatLow: '#1a0f2e',
      heatMid: '#7c4dff',
      heatHigh: '#ff4081'
    };

    // Start animation loop
    this.startAnimation();
  }

  // ========================================================================
  // High-DPI Canvas Setup
  // ========================================================================

  setupHighDPI() {
    const dpr = window.devicePixelRatio || 1;

    // Fixed dimensions for 280px canvas
    const displayWidth = 800;
    const displayHeight = 280;

    // Set display size (css pixels)
    this.canvas.style.width = displayWidth + 'px';
    this.canvas.style.height = displayHeight + 'px';

    // Set actual size in memory (scaled for DPI)
    this.canvas.width = displayWidth * dpr;
    this.canvas.height = displayHeight * dpr;

    // Scale context to ensure correct drawing operations
    this.ctx.scale(dpr, dpr);

    // Store display dimensions for drawing
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
  }

  // ========================================================================
  // Data Management
  // ========================================================================

  addFrame(e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11) {
    // Add new values to buffers
    const values = [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11];
    values.forEach((val, i) => {
      const key = `e${i}`;
      this.dataBuffer[key].push(val);

      // Limit buffer size
      if (this.dataBuffer[key].length > this.maxBufferSize) {
        this.dataBuffer[key].shift();
      }
    });
  }

  clearBuffer() {
    Object.keys(this.dataBuffer).forEach(key => {
      this.dataBuffer[key] = [];
    });
  }

  // Set capturing state (affects sparkline colors)
  setCapturing(isCapturing) {
    this.isCapturing = isCapturing;
  }

  // ========================================================================
  // Animation Loop
  // ========================================================================

  startAnimation() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.animate();
  }

  stopAnimation() {
    this.isAnimating = false;
  }

  animate() {
    if (!this.isAnimating) return;

    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  // ========================================================================
  // Drawing
  // ========================================================================

  draw() {
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Clear canvas
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, w, h);

    // Draw grid visualization
    this.drawElectrodeGrid(w, h);
  }

  drawElectrodeGrid(canvasWidth, canvasHeight) {
    const { rows, cols, cellPadding } = this.gridLayout;
    const totalElectrodes = 12;

    // Calculate cell dimensions
    const availableWidth = canvasWidth - (cellPadding * 2);
    const availableHeight = canvasHeight - (cellPadding * 2);
    const cellWidth = (availableWidth - ((cols - 1) * cellPadding)) / cols;
    const cellHeight = (availableHeight - ((rows - 1) * cellPadding)) / rows;

    // Draw each electrode cell
    for (let i = 0; i < totalElectrodes; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;

      const x = cellPadding + col * (cellWidth + cellPadding);
      const y = cellPadding + row * (cellHeight + cellPadding);

      this.drawElectrodeCell(x, y, cellWidth, cellHeight, i);
    }
  }

  drawElectrodeCell(x, y, width, height, electrodeIndex) {
    const ctx = this.ctx;
    const key = `e${electrodeIndex}`;
    const buffer = this.dataBuffer[key];

    // Get current value (last in buffer)
    const currentValue = buffer.length > 0 ? buffer[buffer.length - 1] : 0;

    // Draw cell background with heat map color based on current value
    const bgColor = this.getHeatMapColor(currentValue);
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);

    // Draw cell border
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Draw electrode label (no background needed - white text always visible)
    const labelText = `E${electrodeIndex}`;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.fillText(labelText, x + 7, y + 7);

    // Draw current value (lighter font weight)
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const valueText = currentValue.toFixed(3);
    ctx.fillText(valueText, x + width / 2, y + height / 2);

    // Draw mini sparkline (historical data)
    if (buffer.length > 1) {
      this.drawSparkline(x + 6, y + height - 26, width - 12, 20, buffer, electrodeIndex);
    }
  }

  drawSparkline(x, y, width, height, data, electrodeIndex) {
    const ctx = this.ctx;

    if (data.length < 2) return;

    const pointsToShow = Math.min(data.length, 50);
    const startIndex = data.length - pointsToShow;
    const slicedData = data.slice(startIndex);

    // Find min/max for scaling
    const min = Math.min(...slicedData);
    const max = Math.max(...slicedData);
    const range = max - min || 1; // Avoid division by zero

    // Draw sparkline background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x, y, width, height);

    // Choose color based on capturing state
    // When capturing: bright electrode-specific colors
    // When idle: more visible purple (increased opacity)
    let lineColor;
    let lineWidth;

    if (this.isCapturing) {
      // Use bright electrode-specific color from palette
      lineColor = this.colors.electrodes[electrodeIndex];
      lineWidth = 1.5;
    } else {
      // More visible purple when idle
      lineColor = 'rgba(160, 160, 208, 0.7)';
      lineWidth = 1.5;
    }

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;

    slicedData.forEach((value, i) => {
      const px = x + (i / (pointsToShow - 1)) * width;
      const normalizedValue = (value - min) / range;
      const py = y + height - (normalizedValue * height);

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });

    ctx.stroke();
  }

  getHeatMapColor(value) {
    // Value is normalized 0.0 to 1.0
    // Based on actual MPR121 testing:
    // 0.7+ = far away/baseline (should be dark purple)
    // 0.1-0.2 = touch (should be hot pink/magenta)
    // INVERTED from typical: LOWER values = CLOSER proximity

    if (value > 0.70) {
      // High values (0.7+) = far away - dark purple
      return this.colors.heatLow;
    } else if (value > 0.50) {
      // Medium-high (0.5-0.7) = baseline - medium purple
      const t = (0.70 - value) / 0.20;
      return this.interpolateColor('#1a0f2e', '#5a3a8a', t);
    } else if (value > 0.30) {
      // Medium (0.3-0.5) = proximity detected - bright purple
      const t = (0.50 - value) / 0.20;
      return this.interpolateColor('#5a3a8a', '#9c4dff', t);
    } else if (value > 0.15) {
      // Low (0.15-0.3) = close proximity - bright magenta
      const t = (0.30 - value) / 0.15;
      return this.interpolateColor('#9c4dff', '#d946ff', t);
    } else {
      // Very low (0-0.15) = touch - hot pink
      const t = (0.15 - value) / 0.15;
      return this.interpolateColor('#d946ff', '#ff4081', t);
    }
  }

  interpolateColor(color1, color2, t) {
    // Simple hex color interpolation
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgb(${r}, ${g}, ${b})`;
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  resize() {
    this.setupHighDPI();
  }
}
