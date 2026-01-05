// ============================================================================
// Capacitive Sensor Data Collector
// ============================================================================
// Captures MPR121 12-electrode capacitive sensor samples for pattern training
// Based on ColorDataCollector pattern
// ============================================================================

class CapacitiveDataCollector {
  constructor(bridge, gestureManager) {
    this.bridge = bridge;
    this.gestureManager = gestureManager;  // Reuses GestureManager for capacitive samples

    // Capture state
    this.isCapturing = false;
    this.currentSample = [];
    this.currentLabel = null;  // Current selected label
    this.framesCollected = 0;
    this.framesTarget = 100;  // Default: 100 readings per sample

    // Pause state for manual testing
    this.isPaused = false;

    // Rolling buffer for testing and real-time predictions (last 100 frames)
    this.currentBuffer = [];
    this.maxBufferSize = 100 * 12; // 100 frames × 12 electrodes = 1200 values

    // Latest electrode values for display (0.0 to 1.0, normalized)
    this.latestValues = {
      e0: 0, e1: 0, e2: 0, e3: 0,
      e4: 0, e5: 0, e6: 0, e7: 0,
      e8: 0, e9: 0, e10: 0, e11: 0
    };

    // Capture settings
    this.captureDelay = 20; // ms between captures (50 Hz to match Arduino sample rate)
    this.lastCaptureTimestamp = 0;

    // Listeners
    this.listeners = {
      captureStarted: [],
      frameCollected: [],
      captureCompleted: [],
      captureFailed: [],
      captureCancelled: [],
      dataUpdate: [],
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
      this.processCapacitiveData(data);
    });
  }

  processCapacitiveData(data) {
    // Skip processing if paused
    if (this.isPaused) {
      return;
    }

    // Parse CSV format: "e0,e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11" (12 values)
    const values = data.split(',').map(v => parseFloat(v.trim()));

    // Check if this is capacitive data (12 values)
    if (values.length !== 12) {
      // Not capacitive data, ignore
      return;
    }

    // Validate values are in expected range [0, 1]
    if (values.some(v => isNaN(v) || v < 0 || v > 1)) {
      return; // Invalid data
    }

    // Update latest values
    this.latestValues = {
      e0: values[0], e1: values[1], e2: values[2], e3: values[3],
      e4: values[4], e5: values[5], e6: values[6], e7: values[7],
      e8: values[8], e9: values[9], e10: values[10], e11: values[11]
    };

    // Update rolling buffer for testing (always, not just when capturing)
    this.currentBuffer.push(...values);

    // Keep only last 100 frames (1200 values)
    if (this.currentBuffer.length > this.maxBufferSize) {
      this.currentBuffer = this.currentBuffer.slice(-this.maxBufferSize);
    }

    // Emit data update for real-time visualization
    this.emit('dataUpdate', this.latestValues);

    // If we're capturing, collect this frame
    if (this.isCapturing) {
      this.collectFrame(...values);
    }
  }

  // ========================================================================
  // Capture Control
  // ========================================================================

  selectLabel(labelName) {
    this.currentLabel = labelName;
    console.log('✅ Selected capacitive label:', labelName);
  }

  startCapture() {
    if (!this.currentLabel) {
      const error = 'No label selected';
      console.error('❌', error);
      this.emit('captureFailed', { error });
      return false;
    }

    if (this.isCapturing) {
      console.warn('⚠️ Already capturing');
      return false;
    }

    // Reset capture state
    this.isCapturing = true;
    this.currentSample = [];
    this.framesCollected = 0;
    this.lastCaptureTimestamp = Date.now();

    console.log(`📡 Started capturing capacitive sample for "${this.currentLabel}"`);
    this.emit('captureStarted', {
      label: this.currentLabel,
      framesTarget: this.framesTarget
    });

    return true;
  }

  collectFrame(e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11) {
    // Honor capture delay
    const now = Date.now();
    if (now - this.lastCaptureTimestamp < this.captureDelay) {
      return;
    }
    this.lastCaptureTimestamp = now;

    // Add frame to current sample (12 values per frame)
    this.currentSample.push(e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11);
    this.framesCollected++;

    // Emit progress
    this.emit('frameCollected', {
      framesCollected: this.framesCollected,
      framesTarget: this.framesTarget,
      progress: this.framesCollected / this.framesTarget
    });

    // Check if we've collected enough frames
    if (this.framesCollected >= this.framesTarget) {
      this.completeCapture();
    }
  }

  completeCapture() {
    if (!this.isCapturing) return;

    this.isCapturing = false;

    try {
      // Add sample to gesture manager
      this.gestureManager.addSample(this.currentLabel, this.currentSample);

      console.log(`✅ Completed capacitive sample for "${this.currentLabel}"`);
      console.log(`   Frames: ${this.framesCollected}`);
      console.log(`   Total values: ${this.currentSample.length} (${this.framesCollected} × 12)`);

      this.emit('captureCompleted', {
        label: this.currentLabel,
        framesCollected: this.framesCollected,
        sampleData: this.currentSample
      });

      // Reset state
      this.currentSample = [];
      this.framesCollected = 0;

    } catch (error) {
      console.error('❌ Failed to save capacitive sample:', error);
      this.emit('captureFailed', { error: error.message });
    }
  }

  cancelCapture() {
    if (!this.isCapturing) return;

    this.isCapturing = false;
    this.currentSample = [];
    this.framesCollected = 0;

    console.log('❌ Capacitive capture cancelled');
    this.emit('captureCancelled', {});
  }

  // ========================================================================
  // Settings
  // ========================================================================

  setFramesTarget(frames) {
    this.framesTarget = frames;
    console.log('✅ Frames target set to:', frames);
  }

  // ========================================================================
  // Pause/Resume (for testing mode)
  // ========================================================================

  pause() {
    this.isPaused = true;
    console.log('⏸️ Capacitive data collector paused');
  }

  resume() {
    this.isPaused = false;
    console.log('▶️ Capacitive data collector resumed');
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  getLatestValues() {
    return this.latestValues;
  }

  getCurrentBuffer() {
    return this.currentBuffer;
  }

  isBufferFull() {
    return this.currentBuffer.length >= this.maxBufferSize;
  }
}
