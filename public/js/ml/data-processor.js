// ============================================================================
// Data Processor
// ============================================================================
// Prepares and normalizes gesture data for TensorFlow.js training
// Based on Tiny Motion Trainer data pipeline
// ============================================================================

class DataProcessor {
  constructor() {
    this.trainingSplit = 0.8; // 80% training, 20% validation
    this.randomSeed = 42;
  }

  // ========================================================================
  // Prepare Training Data
  // ========================================================================

  prepareTrainingData(gestureManager) {
    const gestures = gestureManager.getAllGestures();
    
    if (gestures.length < 2) {
      throw new Error('Need at least 2 gestures to train');
    }

    console.log('📊 Preparing training data...');
    console.log(`   Gestures: ${gestures.length}`);
    
    // Collect all samples and labels
    const allSamples = [];
    const allLabels = [];
    
    gestures.forEach((gesture, gestureIndex) => {
      gesture.samples.forEach(sample => {
        allSamples.push(sample.data);
        allLabels.push(gestureIndex);
      });
    });

    console.log(`   Total samples: ${allSamples.length}`);
    
    // Normalize data
    const normalizedSamples = this.normalizeData(allSamples);
    
    // Split into train/validation
    const split = this.splitData(normalizedSamples, allLabels);
    
    console.log(`   Training samples: ${split.trainX.length}`);
    console.log(`   Validation samples: ${split.valX.length}`);
    
    return {
      trainX: split.trainX,
      trainY: split.trainY,
      valX: split.valX,
      valY: split.valY,
      numClasses: gestures.length,
      labels: gestures.map(g => g.name),
      inputShape: [normalizedSamples[0].length],
    };
  }

  // ========================================================================
  // Data Normalization
  // ========================================================================

  normalizeData(samples) {
    console.log('🔧 Normalizing data...');
    
    // IMU data from Arduino is already normalized to [-1, 1]
    // But we'll ensure consistent range
    
    const normalized = samples.map(sample => {
      return sample.map(value => {
        // Clamp to [-1, 1]
        return Math.max(-1, Math.min(1, value));
      });
    });
    
    console.log('✅ Data normalized');
    return normalized;
  }

  // ========================================================================
  // Train/Validation Split
  // ========================================================================

  splitData(samples, labels) {
    // Create indices array
    const indices = Array.from({ length: samples.length }, (_, i) => i);
    
    // Shuffle with seed for reproducibility
    this.shuffleArray(indices, this.randomSeed);
    
    // Calculate split point
    const splitIndex = Math.floor(samples.length * this.trainingSplit);
    
    // Split indices
    const trainIndices = indices.slice(0, splitIndex);
    const valIndices = indices.slice(splitIndex);
    
    // Split data
    const trainX = trainIndices.map(i => samples[i]);
    const trainY = trainIndices.map(i => labels[i]);
    const valX = valIndices.map(i => samples[i]);
    const valY = valIndices.map(i => labels[i]);
    
    return { trainX, trainY, valX, valY };
  }

  // ========================================================================
  // Shuffle Array (with seed)
  // ========================================================================

  shuffleArray(array, seed) {
    // Seeded random number generator
    let rng = this.seededRandom(seed);
    
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  seededRandom(seed) {
    let s = seed;
    return function() {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  }

  // ========================================================================
  // One-Hot Encoding
  // ========================================================================

  oneHotEncode(labels, numClasses) {
    return labels.map(label => {
      const oneHot = new Array(numClasses).fill(0);
      oneHot[label] = 1;
      return oneHot;
    });
  }

  // ========================================================================
  // Create TensorFlow Tensors
  // ========================================================================

  createTensors(data) {
    console.log('🔧 Creating TensorFlow tensors...');
    
    const trainX = tf.tensor2d(data.trainX);
    const trainY = tf.tensor2d(this.oneHotEncode(data.trainY, data.numClasses));
    const valX = tf.tensor2d(data.valX);
    const valY = tf.tensor2d(this.oneHotEncode(data.valY, data.numClasses));
    
    console.log('✅ Tensors created');
    console.log(`   trainX shape: [${trainX.shape}]`);
    console.log(`   trainY shape: [${trainY.shape}]`);
    console.log(`   valX shape: [${valX.shape}]`);
    console.log(`   valY shape: [${valY.shape}]`);
    
    return { trainX, trainY, valX, valY };
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getDataStats(data) {
    const stats = {
      totalSamples: data.trainX.length + data.valX.length,
      trainingSamples: data.trainX.length,
      validationSamples: data.valX.length,
      numClasses: data.numClasses,
      inputShape: data.inputShape,
      samplesPerClass: [],
    };

    // Count samples per class
    for (let i = 0; i < data.numClasses; i++) {
      const trainCount = data.trainY.filter(label => label === i).length;
      const valCount = data.valY.filter(label => label === i).length;
      stats.samplesPerClass.push({
        label: data.labels[i],
        training: trainCount,
        validation: valCount,
        total: trainCount + valCount,
      });
    }

    return stats;
  }

  // ========================================================================
  // Validation
  // ========================================================================

  validateData(data) {
    const errors = [];

    // Check minimum samples
    if (data.trainX.length < 10) {
      errors.push('Need at least 10 training samples');
    }

    if (data.valX.length < 2) {
      errors.push('Need at least 2 validation samples');
    }

    // Check class balance
    const classCounts = new Array(data.numClasses).fill(0);
    data.trainY.forEach(label => classCounts[label]++);
    
    const minCount = Math.min(...classCounts);
    const maxCount = Math.max(...classCounts);
    
    if (maxCount / minCount > 3) {
      errors.push('Classes are imbalanced (>3x difference)');
    }

    if (minCount < 3) {
      errors.push(`Class "${data.labels[classCounts.indexOf(minCount)]}" has too few samples`);
    }

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataProcessor;
}
