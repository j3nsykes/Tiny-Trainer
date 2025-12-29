// ============================================================================
// Gesture Manager
// ============================================================================
// Manages gestures, samples, and training data
// Based on Tiny Motion Trainer data structure
// ============================================================================

class GestureManager {
  constructor() {
    this.gestures = [];
    this.selectedGesture = null;
    this.samplesPerGesture = 20;
    this.framesPerSample = 100;
    this.listeners = {
      gestureAdded: [],
      gestureRemoved: [],
      gestureRenamed: [],
      sampleAdded: [],
      sampleRemoved: [],
      gestureSelected: [],
    };
  }

  // ========================================================================
  // Event Listening
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
  // Gesture Management
  // ========================================================================

  addGesture(name) {
    // Check if gesture already exists
    if (this.gestures.find(g => g.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Gesture with this name already exists');
    }

    const gesture = {
      name: name,
      samples: [],
      createdAt: Date.now(),
    };

    this.gestures.push(gesture);
    this.emit('gestureAdded', gesture);

    console.log('✅ Gesture added:', name);
    return gesture;
  }

  removeGesture(name) {
    const index = this.gestures.findIndex(g => g.name === name);
    if (index === -1) {
      throw new Error('Gesture not found');
    }

    const gesture = this.gestures[index];
    this.gestures.splice(index, 1);

    if (this.selectedGesture === name) {
      this.selectedGesture = null;
    }

    this.emit('gestureRemoved', gesture);
    console.log('✅ Gesture removed:', name);
  }

  renameGesture(oldName, newName) {
    const gesture = this.gestures.find(g => g.name === oldName);
    if (!gesture) {
      throw new Error('Gesture not found');
    }

    // Check if new name already exists
    if (this.gestures.find(g => g.name.toLowerCase() === newName.toLowerCase() && g.name !== oldName)) {
      throw new Error('Gesture with this name already exists');
    }

    gesture.name = newName;
    if (this.selectedGesture === oldName) {
      this.selectedGesture = newName;
    }

    this.emit('gestureRenamed', { oldName, newName });
    console.log('✅ Gesture renamed:', oldName, '→', newName);
  }

  getGesture(name) {
    return this.gestures.find(g => g.name === name);
  }

  getAllGestures() {
    return this.gestures;
  }

  selectGesture(name) {
    this.selectedGesture = name;
    this.emit('gestureSelected', name);
    console.log('✅ Gesture selected:', name);
  }

  getSelectedGesture() {
    return this.getGesture(this.selectedGesture);
  }

  // ========================================================================
  // Sample Management
  // ========================================================================

  addSample(gestureName, sampleData) {
    const gesture = this.getGesture(gestureName);
    if (!gesture) {
      throw new Error('Gesture not found');
    }

    // Validate sample data
    const expectedLength = this.framesPerSample * 9; // 9-axis IMU (ax, ay, az, gx, gy, gz, mx, my, mz)
    if (sampleData.length !== expectedLength) {
      throw new Error(`Invalid sample length. Expected ${expectedLength}, got ${sampleData.length}`);
    }

    gesture.samples.push({
      data: sampleData,
      timestamp: Date.now(),
    });

    this.emit('sampleAdded', { gestureName, sampleIndex: gesture.samples.length - 1 });
    console.log(`✅ Sample added to "${gestureName}": ${gesture.samples.length}/${this.samplesPerGesture}`);

    return gesture.samples.length;
  }

  removeSample(gestureName, sampleIndex) {
    const gesture = this.getGesture(gestureName);
    if (!gesture) {
      throw new Error('Gesture not found');
    }

    if (sampleIndex < 0 || sampleIndex >= gesture.samples.length) {
      throw new Error('Invalid sample index');
    }

    gesture.samples.splice(sampleIndex, 1);
    this.emit('sampleRemoved', { gestureName, sampleIndex });
    console.log(`✅ Sample removed from "${gestureName}"`);
  }

  getSampleCount(gestureName) {
    const gesture = this.getGesture(gestureName);
    return gesture ? gesture.samples.length : 0;
  }

  isSamplesFull(gestureName) {
    return this.getSampleCount(gestureName) >= this.samplesPerGesture;
  }

  // ========================================================================
  // Training Data Export
  // ========================================================================

  getTrainingData() {
    // Format compatible with TensorFlow.js training
    const data = {
      gestures: this.gestures.map(g => ({
        name: g.name,
        samples: g.samples.map(s => s.data), // Just the data arrays
      })),
      metadata: {
        samplesPerGesture: this.samplesPerGesture,
        framesPerSample: this.framesPerSample,
        dataLength: this.framesPerSample * 9, // 9-axis IMU
        numClasses: this.gestures.length,
        labels: this.gestures.map(g => g.name),
        axes: 9, // 9-axis: ax, ay, az, gx, gy, gz, mx, my, mz
        createdAt: Date.now(),
      },
    };

    return data;
  }

  exportJSON() {
    const data = this.getTrainingData();
    const json = JSON.stringify(data, null, 2);
    return json;
  }

  importJSON(json) {
    try {
      const data = JSON.parse(json);
      
      // Validate structure
      if (!data.gestures || !data.metadata) {
        throw new Error('Invalid training data format');
      }

      // Clear existing data
      this.gestures = [];

      // Import gestures
      data.gestures.forEach(g => {
        const gesture = {
          name: g.name,
          samples: g.samples.map(s => ({
            data: s,
            timestamp: Date.now(),
          })),
          createdAt: Date.now(),
        };
        this.gestures.push(gesture);
      });

      // Import metadata
      this.samplesPerGesture = data.metadata.samplesPerGesture || 20;
      this.framesPerSample = data.metadata.framesPerSample || 100;

      console.log('✅ Training data imported:', this.gestures.length, 'gestures');
      return true;
    } catch (error) {
      console.error('❌ Import failed:', error);
      return false;
    }
  }

  // ========================================================================
  // Validation
  // ========================================================================

  isReadyForTraining() {
    // Need at least 2 gestures with minimum samples
    const minSamplesRequired = Math.floor(this.samplesPerGesture * 0.5); // At least 50%
    
    const validGestures = this.gestures.filter(g => 
      g.samples.length >= minSamplesRequired
    );

    return validGestures.length >= 2;
  }

  getTrainingInfo() {
    const totalSamples = this.gestures.reduce((sum, g) => sum + g.samples.length, 0);
    const targetSamples = this.gestures.length * this.samplesPerGesture;
    const progress = targetSamples > 0 ? (totalSamples / targetSamples) * 100 : 0;

    return {
      numGestures: this.gestures.length,
      totalSamples: totalSamples,
      targetSamples: targetSamples,
      progress: Math.min(progress, 100),
      readyForTraining: this.isReadyForTraining(),
    };
  }

  // ========================================================================
  // Settings
  // ========================================================================

  setSamplesPerGesture(count) {
    this.samplesPerGesture = Math.max(5, Math.min(50, count));
    console.log('✅ Samples per gesture set to:', this.samplesPerGesture);
  }

  setFramesPerSample(count) {
    this.framesPerSample = Math.max(50, Math.min(200, count));
    console.log('✅ Frames per sample set to:', this.framesPerSample);
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getStatistics() {
    const stats = {
      numGestures: this.gestures.length,
      totalSamples: 0,
      averageSamplesPerGesture: 0,
      minSamples: Infinity,
      maxSamples: 0,
      dataPoints: 0,
    };

    this.gestures.forEach(g => {
      const count = g.samples.length;
      stats.totalSamples += count;
      stats.minSamples = Math.min(stats.minSamples, count);
      stats.maxSamples = Math.max(stats.maxSamples, count);
      stats.dataPoints += count * this.framesPerSample * 9; // 9-axis
    });

    if (this.gestures.length > 0) {
      stats.averageSamplesPerGesture = stats.totalSamples / this.gestures.length;
    }

    if (stats.minSamples === Infinity) stats.minSamples = 0;

    return stats;
  }

  // ========================================================================
  // Utility
  // ========================================================================

  clear() {
    this.gestures = [];
    this.selectedGesture = null;
    console.log('✅ All data cleared');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureManager;
}
