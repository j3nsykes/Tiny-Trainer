// ============================================================================
// Model Builder
// ============================================================================
// Builds TensorFlow.js models for gesture recognition
// Architecture based on Tiny Motion Trainer
// ============================================================================

class ModelBuilder {
  constructor() {
    this.defaultConfig = {
      // Model architecture
      hiddenUnits1: 50,
      hiddenUnits2: 15,
      dropoutRate: 0.2,
      
      // Training parameters
      learningRate: 0.001,
      batchSize: 16,
      epochs: 50,
      validationSplit: 0.0, // We handle split ourselves
      
      // Optimizer
      optimizer: 'adam',
      
      // Loss & Metrics
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    };
  }

  // ========================================================================
  // Build Model
  // ========================================================================

  buildModel(inputShape, numClasses, config = {}) {
    const cfg = { ...this.defaultConfig, ...config };
    
    console.log('🏗️ Building model...');
    console.log(`   Input shape: [${inputShape}]`);
    console.log(`   Output classes: ${numClasses}`);
    console.log(`   Hidden layer 1: ${cfg.hiddenUnits1} units`);
    console.log(`   Hidden layer 2: ${cfg.hiddenUnits2} units`);
    console.log(`   Dropout rate: ${cfg.dropoutRate}`);
    
    // Create sequential model
    const model = tf.sequential();
    
    // Input layer + First hidden layer
    model.add(tf.layers.dense({
      inputShape: inputShape,
      units: cfg.hiddenUnits1,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'dense_1',
    }));
    
    // Dropout for regularization
    model.add(tf.layers.dropout({
      rate: cfg.dropoutRate,
      name: 'dropout_1',
    }));
    
    // Second hidden layer
    model.add(tf.layers.dense({
      units: cfg.hiddenUnits2,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'dense_2',
    }));
    
    // Output layer
    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      kernelInitializer: 'glorotNormal',
      name: 'output',
    }));
    
    // Compile model
    model.compile({
      optimizer: tf.train.adam(cfg.learningRate),
      loss: cfg.loss,
      metrics: cfg.metrics,
    });
    
    console.log('✅ Model built and compiled');
    
    // Print summary
    model.summary();
    
    return model;
  }

  // ========================================================================
  // Model Architecture Variants
  // ========================================================================

  buildSimpleModel(inputShape, numClasses) {
    // Simple 1-layer model (fast training, less accurate)
    console.log('🏗️ Building simple model...');
    
    const model = tf.sequential();
    
    model.add(tf.layers.dense({
      inputShape: inputShape,
      units: 30,
      activation: 'relu',
      name: 'dense_1',
    }));
    
    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      name: 'output',
    }));
    
    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    
    console.log('✅ Simple model built');
    return model;
  }

  buildDeepModel(inputShape, numClasses) {
    // Deeper model (slower training, potentially more accurate)
    console.log('🏗️ Building deep model...');
    
    const model = tf.sequential();
    
    model.add(tf.layers.dense({
      inputShape: inputShape,
      units: 100,
      activation: 'relu',
      name: 'dense_1',
    }));
    
    model.add(tf.layers.dropout({
      rate: 0.3,
      name: 'dropout_1',
    }));
    
    model.add(tf.layers.dense({
      units: 50,
      activation: 'relu',
      name: 'dense_2',
    }));
    
    model.add(tf.layers.dropout({
      rate: 0.2,
      name: 'dropout_2',
    }));
    
    model.add(tf.layers.dense({
      units: 25,
      activation: 'relu',
      name: 'dense_3',
    }));
    
    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      name: 'output',
    }));
    
    model.compile({
      optimizer: tf.train.adam(0.0005),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    
    console.log('✅ Deep model built');
    return model;
  }

  // ========================================================================
  // Model Configuration Presets
  // ========================================================================

  getPreset(name) {
    const presets = {
      fast: {
        hiddenUnits1: 30,
        hiddenUnits2: 10,
        dropoutRate: 0.1,
        learningRate: 0.002,
        epochs: 30,
        batchSize: 32,
      },
      balanced: {
        hiddenUnits1: 50,
        hiddenUnits2: 15,
        dropoutRate: 0.2,
        learningRate: 0.001,
        epochs: 50,
        batchSize: 16,
      },
      accurate: {
        hiddenUnits1: 100,
        hiddenUnits2: 30,
        dropoutRate: 0.3,
        learningRate: 0.0005,
        epochs: 100,
        batchSize: 8,
      },
    };
    
    return presets[name] || presets.balanced;
  }

  // ========================================================================
  // Model Info
  // ========================================================================

  getModelInfo(model) {
    const info = {
      totalParams: model.countParams(),
      trainableParams: model.countParams(), // All params are trainable
      layers: model.layers.length,
      layerInfo: model.layers.map(layer => ({
        name: layer.name,
        type: layer.getClassName(),
        outputShape: layer.outputShape,
      })),
    };
    
    return info;
  }

  // ========================================================================
  // Model Validation
  // ========================================================================

  validateModel(model, inputShape, numClasses) {
    const errors = [];
    
    // Check input shape matches
    const modelInputShape = model.inputs[0].shape.slice(1);
    if (JSON.stringify(modelInputShape) !== JSON.stringify(inputShape)) {
      errors.push(`Input shape mismatch: expected [${inputShape}], got [${modelInputShape}]`);
    }
    
    // Check output shape matches
    const modelOutputShape = model.outputs[0].shape.slice(1);
    if (modelOutputShape[0] !== numClasses) {
      errors.push(`Output classes mismatch: expected ${numClasses}, got ${modelOutputShape[0]}`);
    }
    
    // Check model is compiled
    if (!model.optimizer) {
      errors.push('Model is not compiled');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  // ========================================================================
  // Utility
  // ========================================================================

  estimateTrainingTime(numSamples, epochs, batchSize) {
    // Rough estimate: ~10ms per batch
    const batchesPerEpoch = Math.ceil(numSamples / batchSize);
    const totalBatches = batchesPerEpoch * epochs;
    const estimatedMs = totalBatches * 10;
    
    return {
      batches: totalBatches,
      estimatedSeconds: Math.ceil(estimatedMs / 1000),
      estimatedMinutes: Math.ceil(estimatedMs / 60000),
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModelBuilder;
}
