// ============================================================================
// Data Collector
// ============================================================================
// Captures IMU samples from BLE device for gesture training
// Based on Tiny Motion Trainer capture logic
// ============================================================================

class DataCollector {
  constructor(bridge, gestureManager) {
    this.bridge = bridge;
    this.gestureManager = gestureManager;
    
    // Capture state
    this.isCapturing = false;
    this.currentSample = [];
    this.currentGesture = null;
    this.framesCollected = 0;
    this.framesTarget = 100;
    
    // Capture settings (matching TMT defaults)
    this.accelerationThreshold = 0.167; // Minimum movement to trigger
    this.captureDelay = 125; // ms between captures
    this.lastCaptureTimestamp = 0;
    
    // Listeners
    this.listeners = {
      captureStarted: [],
      frameCollected: [],
      captureCompleted: [],
      captureFailed: [],
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
      this.processIMUData(data);
    });
  }

  processIMUData(data) {
    // Parse CSV format: "ax,ay,az,gx,gy,gz,mx,my,mz" (9-axis)
    const values = data.split(',').map(v => parseFloat(v.trim()));
    
    if (values.length !== 9) {
      // Invalid data format (should be 9 values for 9-axis)
      return;
    }

    const [ax, ay, az, gx, gy, gz, mx, my, mz] = values;
    
    // If we're capturing, collect this frame
    if (this.isCapturing) {
      this.collectFrame(ax, ay, az, gx, gy, gz, mx, my, mz);
    } else {
      // Check if motion detected (auto-trigger)
      this.checkForMotion(ax, ay, az, gx, gy, gz, mx, my, mz);
    }
  }

  // ========================================================================
  // Motion Detection (Auto-trigger)
  // ========================================================================

  checkForMotion(ax, ay, az, gx, gy, gz, mx, my, mz) {
    // Don't auto-trigger if no gesture selected
    if (!this.currentGesture) {
      return;
    }

    // Honor capture delay
    const now = Date.now();
    if (now - this.lastCaptureTimestamp < this.captureDelay) {
      return;
    }

    // Calculate average acceleration (including magnetometer for motion detection)
    const aSum = (Math.abs(ax) + Math.abs(ay) + Math.abs(az) + 
                  Math.abs(gx) + Math.abs(gy) + Math.abs(gz)) / 6.0;

    // Check if motion exceeds threshold
    if (aSum >= this.accelerationThreshold) {
      this.startCapture();
    }
  }

  // ========================================================================
  // Sample Capture
  // ========================================================================

  startCapture() {
    if (this.isCapturing) {
      console.warn('⚠️ Capture already in progress');
      return;
    }

    if (!this.currentGesture) {
      console.error('❌ No gesture selected');
      return;
    }

    this.isCapturing = true;
    this.currentSample = [];
    this.framesCollected = 0;
    this.framesTarget = this.gestureManager.framesPerSample;

    this.emit('captureStarted', {
      gesture: this.currentGesture,
      framesTarget: this.framesTarget,
    });

    console.log('🎬 Capture started:', this.currentGesture);
  }

  collectFrame(ax, ay, az, gx, gy, gz, mx, my, mz) {
    // Add frame to current sample (9 values per frame)
    this.currentSample.push(ax, ay, az, gx, gy, gz, mx, my, mz);
    this.framesCollected++;

    this.emit('frameCollected', {
      frame: this.framesCollected,
      total: this.framesTarget,
      progress: (this.framesCollected / this.framesTarget) * 100,
      data: { ax, ay, az, gx, gy, gz, mx, my, mz },
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
      // Add sample to gesture manager
      this.gestureManager.addSample(this.currentGesture, this.currentSample);

      this.emit('captureCompleted', {
        gesture: this.currentGesture,
        sampleCount: this.gestureManager.getSampleCount(this.currentGesture),
        data: this.currentSample,
      });

      console.log('✅ Capture completed:', this.currentGesture);
      
      // Reset state
      this.isCapturing = false;
      this.currentSample = [];
      this.framesCollected = 0;
      this.lastCaptureTimestamp = Date.now();

    } catch (error) {
      console.error('❌ Capture failed:', error);
      this.emit('captureFailed', { error: error.message });
      this.cancelCapture();
    }
  }

  cancelCapture() {
    if (!this.isCapturing) {
      return;
    }

    console.log('🛑 Capture cancelled');
    
    this.isCapturing = false;
    this.currentSample = [];
    this.framesCollected = 0;

    this.emit('captureFailed', { error: 'Capture cancelled' });
  }

  // ========================================================================
  // Manual Control
  // ========================================================================

  setGesture(gestureName) {
    this.currentGesture = gestureName;
    console.log('✅ Capture gesture set to:', gestureName);
  }

  manualTrigger() {
    // Force start capture immediately (ignore threshold)
    this.startCapture();
  }

  // ========================================================================
  // Settings
  // ========================================================================

  setThreshold(value) {
    this.accelerationThreshold = Math.max(0.05, Math.min(1.0, value));
    console.log('✅ Threshold set to:', this.accelerationThreshold);
  }

  setCaptureDelay(ms) {
    this.captureDelay = Math.max(50, Math.min(1000, ms));
    console.log('✅ Capture delay set to:', this.captureDelay, 'ms');
  }

  // ========================================================================
  // Status
  // ========================================================================

  getStatus() {
    return {
      isCapturing: this.isCapturing,
      currentGesture: this.currentGesture,
      framesCollected: this.framesCollected,
      framesTarget: this.framesTarget,
      progress: this.isCapturing ? (this.framesCollected / this.framesTarget) * 100 : 0,
    };
  }

  isReady() {
    return this.currentGesture !== null && !this.isCapturing;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataCollector;
}
