// ============================================================================
// IMU Data Visualizer
// ============================================================================
// Visualizes accelerometer and gyroscope data in real-time
// ============================================================================

class IMUVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Setup high-DPI canvas for crisp rendering
    this.setupHighDPI();
    
    // Data buffers for visualization (9-axis)
    this.dataBuffer = {
      ax: [],
      ay: [],
      az: [],
      gx: [],
      gy: [],
      gz: [],
      mx: [],
      my: [],
      mz: [],
    };
    
    this.maxBufferSize = 100; // Show last 100 frames
    this.isAnimating = false;
    
    // Colors - Modern purple/green theme
    this.colors = {
      ax: '#ff6b6b',  // Red
      ay: '#4ecdc4',  // Cyan
      az: '#45b7d1',  // Blue
      gx: '#feca57',  // Yellow
      gy: '#ff9ff3',  // Pink
      gz: '#48dbfb',  // Light blue
      mx: '#95e1d3',  // Mint
      my: '#f8b195',  // Peach
      mz: '#c7ceea',  // Lavender
      grid: '#2a1a4a',
      text: '#a0a0d0',
      background: '#0f0a1f',
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

  addFrame(ax, ay, az, gx, gy, gz, mx, my, mz) {
    // Add new values to buffers
    this.dataBuffer.ax.push(ax);
    this.dataBuffer.ay.push(ay);
    this.dataBuffer.az.push(az);
    this.dataBuffer.gx.push(gx);
    this.dataBuffer.gy.push(gy);
    this.dataBuffer.gz.push(gz);
    this.dataBuffer.mx.push(mx);
    this.dataBuffer.my.push(my);
    this.dataBuffer.mz.push(mz);

    // Limit buffer size
    Object.keys(this.dataBuffer).forEach(key => {
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

    // Draw grid
    this.drawGrid(w, h);

    // Draw three compact charts
    const chartHeight = h / 3 - 10;
    
    // Accelerometer chart (top)
    this.drawChart(8, 5, w - 16, chartHeight, 
      ['ax', 'ay', 'az'], 
      'Accelerometer (g)', 
      -1, 1);

    // Gyroscope chart (middle)
    this.drawChart(8, h / 3 + 2, w - 16, chartHeight, 
      ['gx', 'gy', 'gz'], 
      'Gyroscope (dps)', 
      -1, 1);

    // Magnetometer chart (bottom)
    this.drawChart(8, 2 * h / 3 - 1, w - 16, chartHeight, 
      ['mx', 'my', 'mz'], 
      'Magnetometer (µT)', 
      -1, 1);
  }

  drawGrid(w, h) {
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.lineWidth = 1;

    // Horizontal lines
    const numHLines = 4;
    for (let i = 0; i <= numHLines; i++) {
      const y = (h / numHLines) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    // Center line (thicker)
    this.ctx.strokeStyle = '#4a4a4a';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, h / 4);
    this.ctx.lineTo(w, h / 4);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(0, 3 * h / 4);
    this.ctx.lineTo(w, 3 * h / 4);
    this.ctx.stroke();
  }

  drawChart(x, y, w, h, axes, title, minVal, maxVal) {
    const ctx = this.ctx;
    
    // Enable text anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Title - smaller, crisper font
    ctx.fillStyle = this.colors.text;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(title, x + 8, y + 12);

    // Legend - compact
    let legendX = x + w - 140;
    axes.forEach((axis, i) => {
      ctx.fillStyle = this.colors[axis];
      ctx.fillRect(legendX, y + 6 + i * 14, 10, 10);
      ctx.fillStyle = this.colors.text;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(axis.toUpperCase(), legendX + 14, y + 14 + i * 14);
    });

    // Chart area
    const chartY = y + 26;
    const chartH = h - 32;
    
    // Draw axes lines
    axes.forEach(axis => {
      const data = this.dataBuffer[axis];
      if (data.length < 2) return;

      ctx.strokeStyle = this.colors[axis];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      data.forEach((value, i) => {
        const px = x + (i / this.maxBufferSize) * w;
        const normalized = (value - minVal) / (maxVal - minVal);
        const py = chartY + chartH - (normalized * chartH);
        
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });

      ctx.stroke();
    });

    // Min/Max labels - smaller
    ctx.fillStyle = this.colors.text;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal.toFixed(1), x - 4, chartY + 8);
    ctx.fillText(minVal.toFixed(1), x - 4, chartY + chartH);
    ctx.textAlign = 'left';
  }

  // ========================================================================
  // Utility
  // ========================================================================

  resize() {
    // Re-setup high-DPI canvas on resize
    this.setupHighDPI();
  }

  drawMessage(message) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, w, h);
    
    this.ctx.fillStyle = this.colors.text;
    this.ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(message, w / 2, h / 2);
    this.ctx.textAlign = 'left';
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IMUVisualizer;
}
