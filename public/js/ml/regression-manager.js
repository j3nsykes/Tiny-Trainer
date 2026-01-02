// ============================================================================
// Regression Manager
// ============================================================================
// Manages regression training samples with continuous output values
// Simpler than GestureManager - stores samples with associated output values
// ============================================================================

class RegressionManager {
  constructor() {
    this.samples = [];
    this.outputCount = 2; // Default: 2 outputs (e.g., tiltX, tiltY)
    this.outputLabels = ['Output 1', 'Output 2'];
    this.minSamples = 20; // Minimum samples needed for training
  }

  // ========================================================================
  // Sample Management
  // ========================================================================

  addSample(sensorData, outputValues) {
    // sensorData: IMU array (900 values)
    // outputValues: array of continuous values, e.g., [tiltX, tiltY]

    if (outputValues.length !== this.outputCount) {
      throw new Error(`Expected ${this.outputCount} output values, got ${outputValues.length}`);
    }

    const sample = {
      id: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data: sensorData,
      outputs: outputValues,
      timestamp: Date.now(),
    };

    this.samples.push(sample);
    console.log(`✅ Regression sample added: ${this.samples.length}/${this.minSamples}`);

    return this.samples.length;
  }

  removeSample(index) {
    if (index < 0 || index >= this.samples.length) {
      throw new Error('Invalid sample index');
    }

    this.samples.splice(index, 1);
    console.log(`✅ Sample removed. Total: ${this.samples.length}`);
  }

  removeSampleById(id) {
    const index = this.samples.findIndex(s => s.id === id);
    if (index !== -1) {
      this.removeSample(index);
      return true;
    }
    return false;
  }

  getSample(index) {
    return this.samples[index] || null;
  }

  getAllSamples() {
    return this.samples;
  }

  getSampleCount() {
    return this.samples.length;
  }

  // ========================================================================
  // Output Configuration
  // ========================================================================

  setOutputCount(count) {
    this.outputCount = Math.max(1, Math.min(4, count)); // 1-4 outputs
    console.log(`✅ Output count set to: ${this.outputCount}`);

    // Update labels array
    while (this.outputLabels.length < this.outputCount) {
      this.outputLabels.push(`Output ${this.outputLabels.length + 1}`);
    }
  }

  setOutputLabels(labels) {
    this.outputLabels = labels.slice(0, this.outputCount);
    console.log(`✅ Output labels set:`, this.outputLabels);
  }

  getOutputLabels() {
    return this.outputLabels.slice(0, this.outputCount);
  }

  // ========================================================================
  // Validation
  // ========================================================================

  isReadyForTraining() {
    return this.samples.length >= this.minSamples;
  }

  getTrainingInfo() {
    return {
      sampleCount: this.samples.length,
      minSamples: this.minSamples,
      progress: Math.min((this.samples.length / this.minSamples) * 100, 100),
      readyForTraining: this.isReadyForTraining(),
      outputCount: this.outputCount,
      outputLabels: this.getOutputLabels(),
    };
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  exportJSON() {
    const data = {
      samples: this.samples,
      metadata: {
        outputCount: this.outputCount,
        outputLabels: this.outputLabels,
        sampleCount: this.samples.length,
        dataType: 'imu-regression',
        createdAt: Date.now(),
      },
    };

    return JSON.stringify(data, null, 2);
  }

  importJSON(json) {
    try {
      const data = JSON.parse(json);

      // Validate structure
      if (!data.samples || !data.metadata) {
        throw new Error('Invalid regression data format');
      }

      // Clear existing data
      this.samples = [];

      // Import samples
      this.samples = data.samples.map(s => ({
        id: s.id || `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: s.data,
        outputs: s.outputs,
        timestamp: s.timestamp || Date.now(),
      }));

      // Import metadata
      this.outputCount = data.metadata.outputCount || 2;
      this.outputLabels = data.metadata.outputLabels || ['Output 1', 'Output 2'];

      console.log(`✅ Regression data imported: ${this.samples.length} samples`);
      return true;
    } catch (error) {
      console.error('❌ Import failed:', error);
      return false;
    }
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getStatistics() {
    if (this.samples.length === 0) {
      return {
        sampleCount: 0,
        outputStats: [],
      };
    }

    // Calculate statistics for each output
    const outputStats = [];
    for (let i = 0; i < this.outputCount; i++) {
      const values = this.samples.map(s => s.outputs[i]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;

      outputStats.push({
        label: this.outputLabels[i],
        min: min.toFixed(3),
        max: max.toFixed(3),
        mean: mean.toFixed(3),
        range: (max - min).toFixed(3),
      });
    }

    return {
      sampleCount: this.samples.length,
      outputStats: outputStats,
    };
  }

  // ========================================================================
  // Utility
  // ========================================================================

  clear() {
    this.samples = [];
    console.log('✅ All regression data cleared');
  }

  setMinSamples(count) {
    this.minSamples = Math.max(10, count);
    console.log(`✅ Minimum samples set to: ${this.minSamples}`);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegressionManager;
}
