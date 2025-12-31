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
  // Audio Model (1D CNN for MFCC features)
  // ========================================================================

  buildAudioModel(numFrames, numMFCC, numClasses, config = {}) {
    // 1D CNN optimized for audio classification with MFCC features
    // Based on Edge Impulse architecture
    console.log('🎤 Building audio model (1D CNN)...');
    console.log(`   Input: ${numFrames} frames × ${numMFCC} MFCC coefficients`);
    console.log(`   Output classes: ${numClasses}`);

    const cfg = {
      conv1Filters: 8,
      conv2Filters: 16,
      denseUnits: 32,
      dropoutRate: 0.25,
      learningRate: 0.001,  // Increased from 0.0005
      ...config
    };

    console.log(`   Conv layer 1: ${cfg.conv1Filters} filters`);
    console.log(`   Conv layer 2: ${cfg.conv2Filters} filters`);
    console.log(`   Dense layer: ${cfg.denseUnits} units`);

    const model = tf.sequential();

    // Reshape input to [frames, mfcc, 1] for Conv1D
    model.add(tf.layers.reshape({
      inputShape: [numFrames * numMFCC],
      targetShape: [numFrames, numMFCC],
      name: 'reshape'
    }));

    // CRITICAL: Add batch normalization to normalize the MFCC features
    // MFCC values have very large negative values (-900 to +100) which breaks gradient flow
    model.add(tf.layers.batchNormalization({
      name: 'batch_norm_input'
    }));

    // First Conv1D layer - extract temporal patterns
    model.add(tf.layers.conv1d({
      filters: cfg.conv1Filters,
      kernelSize: 3,
      strides: 1,
      padding: 'same',
      activation: 'relu',
      kernelInitializer: 'varianceScaling',  // Better initialization than heNormal for this data
      biasInitializer: 'zeros',  // Ensure no initial bias
      name: 'conv1d_1'
    }));

    // Max pooling to reduce dimensions
    model.add(tf.layers.maxPooling1d({
      poolSize: 2,
      strides: 2,
      name: 'max_pool_1'
    }));

    // Dropout for regularization
    model.add(tf.layers.dropout({
      rate: cfg.dropoutRate,
      name: 'dropout_1'
    }));

    // Second Conv1D layer - learn higher-level features
    model.add(tf.layers.conv1d({
      filters: cfg.conv2Filters,
      kernelSize: 3,
      strides: 1,
      padding: 'same',
      activation: 'relu',
      kernelInitializer: 'varianceScaling',
      biasInitializer: 'zeros',
      name: 'conv1d_2'
    }));

    // Global average pooling - reduce to fixed size regardless of input length
    model.add(tf.layers.globalAveragePooling1d({
      name: 'global_avg_pool'
    }));

    // Dropout
    model.add(tf.layers.dropout({
      rate: cfg.dropoutRate,
      name: 'dropout_2'
    }));

    // Dense layer for classification
    model.add(tf.layers.dense({
      units: cfg.denseUnits,
      activation: 'relu',
      kernelInitializer: 'varianceScaling',
      biasInitializer: 'zeros',
      name: 'dense_1'
    }));

    // Output layer - CRITICAL: Use zeros for bias to ensure no initial class preference
    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      kernelInitializer: 'glorotUniform',  // Changed from glorotNormal
      biasInitializer: 'zeros',  // CRITICAL: No initial bias
      name: 'output'
    }));

    // Compile with appropriate optimizer for audio
    model.compile({
      optimizer: tf.train.adam(cfg.learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    console.log('✅ Audio model built and compiled');
    model.summary();

    return model;
  }

  // Alternative: Simpler audio model using dense layers only
  buildSimpleAudioModel(totalFeatures, numClasses, config = {}) {
    console.log('🎤 Building simple audio model (Dense)...');
    console.log(`   Input features: ${totalFeatures}`);
    console.log(`   Output classes: ${numClasses}`);

    const cfg = {
      hiddenUnits1: 64,
      hiddenUnits2: 32,
      dropoutRate: 0.3,
      learningRate: 0.001,
      ...config
    };

    const model = tf.sequential();

    // First dense layer
    model.add(tf.layers.dense({
      inputShape: [totalFeatures],
      units: cfg.hiddenUnits1,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'dense_1'
    }));

    model.add(tf.layers.dropout({
      rate: cfg.dropoutRate,
      name: 'dropout_1'
    }));

    // Second dense layer
    model.add(tf.layers.dense({
      units: cfg.hiddenUnits2,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'dense_2'
    }));

    model.add(tf.layers.dropout({
      rate: cfg.dropoutRate,
      name: 'dropout_2'
    }));

    // Output layer
    model.add(tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      kernelInitializer: 'glorotNormal',
      name: 'output'
    }));

    model.compile({
      optimizer: tf.train.adam(cfg.learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    console.log('✅ Simple audio model built');
    model.summary();

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
