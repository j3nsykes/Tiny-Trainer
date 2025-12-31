// ============================================================================
// Color Data Collector
// ============================================================================
// Captures APDS9960 color sensor samples for color recognition training
// Adapted from DataCollector for 5-channel color data (R, G, B, Clear, Proximity)
// ============================================================================

class ColorDataCollector {
  constructor(bridge, gestureManager) {
    this.bridge = bridge;
    this.gestureManager = gestureManager;  // Reuses GestureManager for color samples

    // Capture state
    this.isCapturing = false;
    this.currentSample = [];
    this.currentColor = null;  // Instead of currentGesture
    this.framesCollected = 0;
    this.framesTarget = 50;  // Default: 50 readings per color sample

    // Pause state for manual testing
    this.isPaused = false;

    // Rolling buffer for testing and real-time predictions (last 100 frames)
    this.currentBuffer = [];
    this.maxBufferSize = 100 * 5; // 100 frames × 5 channels (r,g,b,c,p) = 500 values

    // Latest color values for display
    this.latestValues = {
      r: 0,
      g: 0,
      b: 0,
      c: 0,  // Clear/ambient light
      p: 0   // Proximity
    };

    // Capture settings
    this.proximityThreshold = 0.3; // Auto-trigger when object near sensor
    this.captureDelay = 100; // ms between captures (10 Hz)
    this.lastCaptureTimestamp = 0;
    this.autoTriggerEnabled = false; // Toggle to enable/disable proximity auto-trigger (disabled by default for manual control)

    // Listeners
    this.listeners = {
      captureStarted: [],
      frameCollected: [],
      captureCompleted: [],
      captureFailed: [],
      captureCancelled: [],
      colorUpdate: [],
    };

    // Setup data listener
    this.setupDataListener();
  }

  // ========================================================================
  // Event System
  // ========================================================================

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // ========================================================================
  // Data Listening
  // ========================================================================

  setupDataListener() {
    // Listen to all devices (use wildcard)
    this.bridge.onData('*', (data, deviceId) => {
      this.processColorData(data);
    });
  }

  processColorData(data) {
    // Skip processing if paused
    if (this.isPaused) {
      return;
    }

    // Parse CSV format: "r,g,b,c,p" (5 values)
    // OR "ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p" (14 values - all sensors)
    const values = data.split(',').map(v => parseFloat(v.trim()));

    let r, g, b, c, p;

    if (values.length === 5) {
      // Color only mode
      [r, g, b, c, p] = values;
    } else if (values.length === 14) {
      // All sensors mode - extract color values (last 5)
      [r, g, b, c, p] = values.slice(9);
    } else {
      // Not color data, ignore
      return;
    }

    // Validate color values are in expected range [0, 1]
    if ([r, g, b, c, p].some(v => isNaN(v) || v < 0 || v > 1)) {
      return; // Invalid data
    }

    // Update latest values
    this.latestValues = { r, g, b, c, p };

    // Update rolling buffer for testing (always, not just when capturing)
    this.currentBuffer.push(r, g, b, c, p);

    // Keep only last 100 frames (500 values)
    if (this.currentBuffer.length > this.maxBufferSize) {
      this.currentBuffer = this.currentBuffer.slice(-this.maxBufferSize);
    }

    // Emit color update for real-time visualization
    this.emit('colorUpdate', { r, g, b, c, p });

    // If we're capturing, collect this frame
    if (this.isCapturing) {
      this.collectFrame(r, g, b, c, p);
    } else {
      // Check if object near sensor (auto-trigger)
      this.checkForProximity(r, g, b, c, p);
    }
  }

  // ========================================================================
  // Proximity Detection (Auto-trigger)
  // ========================================================================

  checkForProximity(r, g, b, c, p) {
    // Don't auto-trigger if disabled
    if (!this.autoTriggerEnabled) {
      return;
    }

    // Don't auto-trigger if no color selected
    if (!this.currentColor) {
      return;
    }

    // Honor capture delay (increased to 2 seconds to prevent rapid auto-captures)
    const now = Date.now();
    if (now - this.lastCaptureTimestamp < 2000) {
      return;
    }

    // Check if object is near sensor (proximity > threshold)
    if (p >= this.proximityThreshold) {
      this.startCapture();
    }
  }

  // ========================================================================
  // Sample Capture
  // ========================================================================

  startCapture() {
    if (this.isCapturing) {
      console.warn('⚠️ Color capture already in progress');
      return;
    }

    if (!this.currentColor) {
      console.error('❌ No color selected');
      return;
    }

    this.isCapturing = true;
    this.currentSample = [];
    this.framesCollected = 0;
    this.framesTarget = this.gestureManager.framesPerSample || 50;

    this.emit('captureStarted', {
      color: this.currentColor,
      framesTarget: this.framesTarget,
    });

    console.log('🎨 Color capture started:', this.currentColor);
  }

  collectFrame(r, g, b, c, p) {
    // Add frame to current sample (5 values per frame)
    this.currentSample.push(r, g, b, c, p);
    this.framesCollected++;

    this.emit('frameCollected', {
      frame: this.framesCollected,
      total: this.framesTarget,
      progress: (this.framesCollected / this.framesTarget) * 100,
      data: { r, g, b, c, p },
    });

    // Check if sample complete
    if (this.framesCollected >= this.framesTarget) {
      this.completeCapture();
    }
  }

  completeCapture() {
    if (!this.isCapturing) {
      return;
    }

    try {
      // Add sample to gesture manager (reuses same storage)
      this.gestureManager.addSample(this.currentColor, this.currentSample);

      this.emit('captureCompleted', {
        color: this.currentColor,
        sampleCount: this.gestureManager.getSampleCount(this.currentColor),
        data: this.currentSample,
      });

      console.log('✅ Color capture completed:', this.currentColor);

      // Reset state
      this.isCapturing = false;
      this.currentSample = [];
      this.framesCollected = 0;
      this.lastCaptureTimestamp = Date.now();

    } catch (error) {
      console.error('❌ Color capture failed:', error);
      this.emit('captureFailed', { error: error.message });
      this.cancelCapture();
    }
  }

  cancelCapture() {
    if (!this.isCapturing) {
      return;
    }

    const cancelledColor = this.currentColor;
    console.log('🚫 Color capture cancelled');

    this.isCapturing = false;
    this.currentSample = [];
    this.framesCollected = 0;

    // Emit event so UI can clean up
    this.emit('captureCancelled', { color: cancelledColor });
  }

  stopCapture() {
    this.cancelCapture();
  }

  // ========================================================================
  // Color Selection
  // ========================================================================

  selectColor(colorName) {
    // Cancel any in-progress capture when switching colors
    if (this.isCapturing && this.currentColor !== colorName) {
      console.log('⚠️ Switching color - canceling current capture');
      this.cancelCapture();
    }

    this.currentColor = colorName;
    // Reset timestamp when manually selecting a new color to prevent immediate auto-trigger
    this.lastCaptureTimestamp = Date.now();
    console.log('🎨 Selected color:', colorName);
  }

  deselectColor() {
    this.currentColor = null;
    console.log('🎨 Deselected color');
  }

  getCurrentColor() {
    return this.currentColor;
  }

  // ========================================================================
  // Settings
  // ========================================================================

  setFramesTarget(frames) {
    this.framesTarget = frames;
    console.log('⚙️ Frames target set to:', frames);
  }

  setProximityThreshold(threshold) {
    this.proximityThreshold = threshold;
    console.log('⚙️ Proximity threshold set to:', threshold);
  }

  setCaptureDelay(delayMs) {
    this.captureDelay = delayMs;
    console.log('⚙️ Capture delay set to:', delayMs, 'ms');
  }

  // ========================================================================
  // Getters
  // ========================================================================

  getLatestValues() {
    return { ...this.latestValues };
  }

  getCurrentBuffer() {
    return [...this.currentBuffer];
  }

  getProgress() {
    if (!this.isCapturing) {
      return 0;
    }
    return (this.framesCollected / this.framesTarget) * 100;
  }

  isCurrentlyCapturing() {
    return this.isCapturing;
  }

  // ========================================================================
  // Utility
  // ========================================================================

  // Convert RGB values to hex color for display
  rgbToHex(r, g, b) {
    const toHex = (value) => {
      const scaled = Math.round(value * 255);
      const hex = scaled.toString(16).padStart(2, '0');
      return hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Get current color as hex
  getCurrentColorHex() {
    const { r, g, b } = this.latestValues;
    return this.rgbToHex(r, g, b);
  }

  // Calculate color "brightness" (useful for UI)
  getBrightness() {
    const { r, g, b } = this.latestValues;
    // Perceived brightness formula
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Get dominant color channel
  getDominantChannel() {
    const { r, g, b } = this.latestValues;
    const max = Math.max(r, g, b);

    if (r === max) return 'red';
    if (g === max) return 'green';
    if (b === max) return 'blue';
    return 'none';
  }

  // ========================================================================
  // Pause/Resume for Manual Testing
  // ========================================================================

  pause() {
    this.isPaused = true;
    console.log('⏸️ Color data stream paused');
  }

  resume() {
    this.isPaused = false;
    console.log('▶️ Color data stream resumed');
  }

  isPausedState() {
    return this.isPaused;
  }

  // ========================================================================
  // Auto-Trigger Control
  // ========================================================================

  enableAutoTrigger() {
    this.autoTriggerEnabled = true;
    console.log('✅ Auto-trigger enabled (proximity-based capture)');
  }

  disableAutoTrigger() {
    this.autoTriggerEnabled = false;
    console.log('🚫 Auto-trigger disabled (manual-only capture)');
  }

  isAutoTriggerEnabled() {
    return this.autoTriggerEnabled;
  }
}
