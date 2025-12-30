// ============================================================================
// ML Trainer
// ============================================================================
// Main training pipeline for gesture recognition models
// Handles training loop, callbacks, and progress tracking
// ============================================================================

class MLTrainer {
  constructor(dataProcessor, modelBuilder) {
    this.dataProcessor = dataProcessor;
    this.modelBuilder = modelBuilder;
    
    // Training state
    this.model = null;
    this.trainingData = null;
    this.isTraining = false;
    this.shouldStop = false;
    
    // Training history
    this.history = {
      loss: [],
      accuracy: [],
      valLoss: [],
      valAccuracy: [],
      epochs: [],
    };
    
    // Listeners
    this.listeners = {
      trainingStart: [],
      epochBegin: [],
      epochEnd: [],
      batchEnd: [],
      trainingEnd: [],
      trainingError: [],
    };
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
  // Train Model
  // ========================================================================

  async train(gestureManager, config = {}) {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }

    this.isTraining = true;
    this.shouldStop = false;
    this.history = {
      loss: [],
      accuracy: [],
      valLoss: [],
      valAccuracy: [],
      epochs: [],
    };

    try {
      console.log('🚀 Starting training...');
      
      // Prepare data
      this.trainingData = this.dataProcessor.prepareTrainingData(gestureManager);
      
      // Validate data
      const dataValidation = this.dataProcessor.validateData(this.trainingData);
      if (!dataValidation.valid) {
        throw new Error(`Data validation failed: ${dataValidation.errors.join(', ')}`);
      }
      
      // Get data stats
      const stats = this.dataProcessor.getDataStats(this.trainingData);
      console.log('📊 Data statistics:', stats);
      
      // Create tensors
      const tensors = this.dataProcessor.createTensors(this.trainingData);
      
      // Build model
      const modelConfig = this.modelBuilder.getPreset(config.preset || 'balanced');
      const finalConfig = { ...modelConfig, ...config };
      
      this.model = this.modelBuilder.buildModel(
        this.trainingData.inputShape,
        this.trainingData.numClasses,
        finalConfig
      );
      
      // Validate model
      const modelValidation = this.modelBuilder.validateModel(
        this.model,
        this.trainingData.inputShape,
        this.trainingData.numClasses
      );
      
      if (!modelValidation.valid) {
        throw new Error(`Model validation failed: ${modelValidation.errors.join(', ')}`);
      }
      
      // Get model info
      const modelInfo = this.modelBuilder.getModelInfo(this.model);
      console.log('🏗️ Model info:', modelInfo);
      
      // Estimate training time
      const timeEstimate = this.modelBuilder.estimateTrainingTime(
        this.trainingData.trainX.length,
        finalConfig.epochs,
        finalConfig.batchSize
      );
      console.log(`⏱️ Estimated training time: ~${timeEstimate.estimatedSeconds}s`);
      
      // Emit training start
      this.emit('trainingStart', {
        config: finalConfig,
        stats: stats,
        modelInfo: modelInfo,
        timeEstimate: timeEstimate,
      });
      
      // Train model
      const result = await this.model.fit(tensors.trainX, tensors.trainY, {
        epochs: finalConfig.epochs,
        batchSize: finalConfig.batchSize,
        validationData: [tensors.valX, tensors.valY],
        shuffle: true,
        callbacks: {
          onEpochBegin: async (epoch, logs) => {
            if (this.shouldStop) {
              this.model.stopTraining = true;
            }
            this.emit('epochBegin', { epoch, logs });
          },
          onEpochEnd: async (epoch, logs) => {
            // Store history
            this.history.loss.push(logs.loss);
            this.history.accuracy.push(logs.acc);
            this.history.valLoss.push(logs.val_loss);
            this.history.valAccuracy.push(logs.val_acc);
            this.history.epochs.push(epoch);
            
            console.log(`Epoch ${epoch + 1}/${finalConfig.epochs}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}, val_acc=${logs.val_acc.toFixed(4)}`);
            
            this.emit('epochEnd', {
              epoch: epoch + 1,
              totalEpochs: finalConfig.epochs,
              loss: logs.loss,
              accuracy: logs.acc,
              valLoss: logs.val_loss,
              valAccuracy: logs.val_acc,
              history: this.history,
            });
            
            if (this.shouldStop) {
              this.model.stopTraining = true;
            }
          },
          onBatchEnd: async (batch, logs) => {
            this.emit('batchEnd', { batch, logs });
          },
        },
      });
      
      // Cleanup tensors
      tensors.trainX.dispose();
      tensors.trainY.dispose();
      tensors.valX.dispose();
      tensors.valY.dispose();
      
      console.log('✅ Training completed');
      
      // Final evaluation
      const evaluation = await this.evaluateModel();
      
      this.emit('trainingEnd', {
        history: this.history,
        evaluation: evaluation,
        stopped: this.shouldStop,
      });
      
      return {
        model: this.model,
        history: this.history,
        evaluation: evaluation,
      };
      
    } catch (error) {
      console.error('❌ Training error:', error);
      this.emit('trainingError', { error: error.message });
      throw error;
      
    } finally {
      this.isTraining = false;
    }
  }

  // ========================================================================
  // Stop Training
  // ========================================================================

  stopTraining() {
    if (this.isTraining) {
      console.log('🛑 Stopping training...');
      this.shouldStop = true;
    }
  }

  // ========================================================================
  // Evaluate Model
  // ========================================================================

  async evaluateModel() {
    if (!this.model || !this.trainingData) {
      throw new Error('No trained model available');
    }

    console.log('📊 Evaluating model...');
    
    // Create validation tensors
    const valX = tf.tensor2d(this.trainingData.valX);
    const valY = tf.tensor2d(
      this.dataProcessor.oneHotEncode(this.trainingData.valY, this.trainingData.numClasses)
    );
    
    // Evaluate
    const result = this.model.evaluate(valX, valY);
    const loss = await result[0].data();
    const accuracy = await result[1].data();
    
    // Cleanup
    valX.dispose();
    valY.dispose();
    result[0].dispose();
    result[1].dispose();
    
    // Per-class accuracy
    const perClassAccuracy = await this.calculatePerClassAccuracy();
    
    const evaluation = {
      loss: loss[0],
      accuracy: accuracy[0],
      perClassAccuracy: perClassAccuracy,
    };
    
    console.log('✅ Evaluation complete');
    console.log(`   Loss: ${evaluation.loss.toFixed(4)}`);
    console.log(`   Accuracy: ${(evaluation.accuracy * 100).toFixed(2)}%`);
    
    return evaluation;
  }

  // ========================================================================
  // Calculate Per-Class Accuracy
  // ========================================================================

  async calculatePerClassAccuracy() {
    const valX = tf.tensor2d(this.trainingData.valX);
    const predictions = await this.model.predict(valX).data();
    valX.dispose();
    
    // Get predicted classes
    const predictedClasses = [];
    for (let i = 0; i < this.trainingData.valY.length; i++) {
      const start = i * this.trainingData.numClasses;
      const end = start + this.trainingData.numClasses;
      const classPredictions = Array.from(predictions.slice(start, end));
      predictedClasses.push(classPredictions.indexOf(Math.max(...classPredictions)));
    }
    
    // Calculate accuracy per class
    const perClassStats = [];
    for (let classIdx = 0; classIdx < this.trainingData.numClasses; classIdx++) {
      const truePositives = predictedClasses.filter((pred, i) => 
        pred === classIdx && this.trainingData.valY[i] === classIdx
      ).length;
      
      const totalInClass = this.trainingData.valY.filter(label => label === classIdx).length;
      
      const accuracy = totalInClass > 0 ? truePositives / totalInClass : 0;
      
      perClassStats.push({
        label: this.trainingData.labels[classIdx],
        accuracy: accuracy,
        correct: truePositives,
        total: totalInClass,
      });
    }
    
    return perClassStats;
  }

  // ========================================================================
  // Test Single Sample
  // ========================================================================

  async predict(sample) {
    if (!this.model) {
      throw new Error('No trained model available');
    }

    // Normalize sample
    const normalized = this.dataProcessor.normalizeData([sample]);
    
    // Create tensor
    const input = tf.tensor2d(normalized);
    
    // Predict
    const prediction = this.model.predict(input);
    const probabilities = await prediction.data();
    
    // Cleanup
    input.dispose();
    prediction.dispose();
    
    // Get predicted class
    const predictedClass = probabilities.indexOf(Math.max(...probabilities));
    const confidence = probabilities[predictedClass];
    
    return {
      predictedClass: predictedClass,
      predictedLabel: this.trainingData.labels[predictedClass],
      confidence: confidence,
      probabilities: Array.from(probabilities),
    };
  }

  // ========================================================================
  // Save/Load Model
  // ========================================================================

  async saveModel(path) {
    if (!this.model) {
      throw new Error('No model to save');
    }

    console.log('💾 Saving model...');
    await this.model.save(path);
    console.log('✅ Model saved to:', path);
  }

  async loadModel(path) {
    console.log('📂 Loading model...');
    this.model = await tf.loadLayersModel(path);
    console.log('✅ Model loaded from:', path);
    return this.model;
  }

  // ========================================================================
  // Export Model
  // ========================================================================

  async exportModel() {
    if (!this.model) {
      throw new Error('No model to export');
    }

    const modelJSON = {
      model: this.model.toJSON(),
      trainingData: {
        labels: this.trainingData.labels,
        numClasses: this.trainingData.numClasses,
        inputShape: this.trainingData.inputShape,
      },
      history: this.history,
      metadata: {
        exportedAt: Date.now(),
        tensorflowVersion: tf.version.tfjs,
      },
    };

    return JSON.stringify(modelJSON, null, 2);
  }

  // ========================================================================
  // Get Training Status
  // ========================================================================

  getStatus() {
    return {
      isTraining: this.isTraining,
      hasModel: this.model !== null,
      hasTrainingData: this.trainingData !== null,
      history: this.history,
    };
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.trainingData = null;
    this.history = {
      loss: [],
      accuracy: [],
      valLoss: [],
      valAccuracy: [],
      epochs: [],
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MLTrainer;
}
