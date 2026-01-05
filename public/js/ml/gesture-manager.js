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

  clearAll() {
    // Remove all gestures
    this.gestures = [];
    this.selectedGesture = null;
    this.emit('allGesturesCleared', {});
    console.log('✅ All gestures cleared');
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

  addSample(gestureName, sampleData, metadata = {}) {
    const gesture = this.getGesture(gestureName);
    if (!gesture) {
      throw new Error('Gesture not found');
    }

    // Validate sample data - accept IMU, Color, and Capacitive samples
    // IMU: 100 frames × 9 axes = 900
    // Color: 50 frames × 5 channels = 250, or 100 frames × 5 channels = 500
    // Capacitive: 100 frames × 12 electrodes = 1200
    const validLengths = [
      this.framesPerSample * 9,  // IMU gestures (900)
      50 * 5,                      // Color samples 50 frames (250)
      100 * 5,                     // Color samples 100 frames (500)
      100 * 12,                    // Capacitive samples 100 frames (1200)
      50 * 12,                     // Capacitive samples 50 frames (600)
      200 * 12,                    // Capacitive samples 200 frames (2400)
    ];

    if (!validLengths.includes(sampleData.length)) {
      console.warn(`⚠️ Unexpected sample length: ${sampleData.length}. Expected ${validLengths.join(', ')}`);
      // Don't throw - allow flexible sample sizes for different sensor types
    }

    // Generate sample preview (first few values for display)
    const preview = this._generateSamplePreview(sampleData, metadata.dataType);

    // Generate unique ID
    const sampleId = `${gestureName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sample = {
      id: sampleId,
      data: sampleData,
      timestamp: Date.now(),
      dataType: metadata.dataType || 'imu',
      preview: preview,
      stats: this._calculateSampleStats(sampleData),
    };

    gesture.samples.push(sample);

    this.emit('sampleAdded', {
      gestureName,
      sampleIndex: gesture.samples.length - 1,
      sample: sample
    });

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
          samples: g.samples.map(s => {
            // Handle both old format (array) and new format (object with data field)
            const sampleData = Array.isArray(s) ? s : s.data;
            const dataType = s.dataType || data.metadata?.dataType || 'imu';

            // Regenerate metadata if importing old format
            return {
              id: s.id || `${g.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              data: sampleData,
              timestamp: s.timestamp || Date.now(),
              dataType: dataType,
              preview: s.preview || this._generateSamplePreview(sampleData, dataType),
              stats: s.stats || this._calculateSampleStats(sampleData),
            };
          }),
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
  // Sample Data Management
  // ========================================================================

  getSample(gestureName, sampleIndex) {
    const gesture = this.getGesture(gestureName);
    if (!gesture) return null;
    return gesture.samples[sampleIndex] || null;
  }

  getSampleById(sampleId) {
    for (const gesture of this.gestures) {
      const sample = gesture.samples.find(s => s.id === sampleId);
      if (sample) {
        return { sample, gestureName: gesture.name };
      }
    }
    return null;
  }

  getAllSamples() {
    // Return all samples with their gesture labels
    const allSamples = [];
    this.gestures.forEach(gesture => {
      gesture.samples.forEach((sample, index) => {
        allSamples.push({
          ...sample,
          gestureName: gesture.name,
          gestureIndex: this.gestures.indexOf(gesture),
          sampleIndex: index,
        });
      });
    });
    return allSamples;
  }

  removeSampleById(sampleId) {
    for (const gesture of this.gestures) {
      const index = gesture.samples.findIndex(s => s.id === sampleId);
      if (index !== -1) {
        this.removeSample(gesture.name, index);
        return true;
      }
    }
    return false;
  }

  // ========================================================================
  // Sample Preview & Statistics
  // ========================================================================

  _generateSamplePreview(sampleData, dataType = 'imu') {
    // Generate human-readable preview of sample data
    const previewLength = 6; // Show first 6 values
    const values = sampleData.slice(0, previewLength);

    if (dataType === 'imu') {
      // IMU data: ax, ay, az, gx, gy, gz, mx, my, mz
      const labels = ['ax', 'ay', 'az', 'gx', 'gy', 'gz', 'mx', 'my', 'mz'];
      return values.map((v, i) => `${labels[i] || 'v' + i}: ${v.toFixed(2)}`).join(', ');
    } else if (dataType === 'color') {
      // Color data: r, g, b, c, lux (or similar)
      const labels = ['r', 'g', 'b', 'c', 'lux'];
      return values.map((v, i) => `${labels[i] || 'c' + i}: ${v.toFixed(3)}`).join(', ');
    } else {
      // Generic preview
      return values.map((v, i) => `${i}: ${v.toFixed(3)}`).join(', ');
    }
  }

  _calculateSampleStats(sampleData) {
    // Calculate basic statistics for quality checking
    const sum = sampleData.reduce((a, b) => a + b, 0);
    const mean = sum / sampleData.length;

    const variance = sampleData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sampleData.length;
    const std = Math.sqrt(variance);

    const min = Math.min(...sampleData);
    const max = Math.max(...sampleData);

    return {
      mean: parseFloat(mean.toFixed(4)),
      std: parseFloat(std.toFixed(4)),
      min: parseFloat(min.toFixed(4)),
      max: parseFloat(max.toFixed(4)),
      range: parseFloat((max - min).toFixed(4)),
    };
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
