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

    // Prediction smoothing (EMA)
    this.smoothingEnabled = true;
    this.smoothingAlpha = 0.3; // 30% new value, 70% previous (lower = smoother)
    this.previousProbabilities = null;

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

      // Prepare data (pass dataType from config, defaults to 'imu')
      const dataType = config.dataType || 'imu';
      this.trainingData = this.dataProcessor.prepareTrainingData(gestureManager, dataType);

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

    // Check if this is audio data - audio features should NOT be normalized
    const dataType = this.trainingData?.dataType || 'imu';

    console.log(`🔮 Predicting (${dataType})...`);
    console.log(`   Sample length: ${sample.length}`);
    console.log(`   First 5 values:`, sample.slice(0, 5));
    console.log(`   Last 5 values:`, sample.slice(-5));
    console.log(`   Sample min: ${Math.min(...sample)}, max: ${Math.max(...sample)}, mean: ${sample.reduce((a,b)=>a+b,0)/sample.length}`);

    let processedSample;
    if (dataType === 'audio') {
      // Audio MFCC features: use raw values, no normalization
      processedSample = [sample];
    } else {
      // IMU/Color data: normalize using DataProcessor
      processedSample = this.dataProcessor.normalizeData([sample], dataType);
    }

    // Create tensor
    const input = tf.tensor2d(processedSample);
    console.log(`   Input tensor shape: [${input.shape}]`);

    // Predict
    const prediction = this.model.predict(input);
    let probabilities = Array.from(await prediction.data());

    console.log(`   Raw probabilities:`, probabilities);

    // Apply EMA smoothing to reduce jitter in real-time predictions
    if (this.smoothingEnabled && this.previousProbabilities) {
      const alpha = this.smoothingAlpha;
      probabilities = probabilities.map((prob, i) =>
        (alpha * prob) + ((1 - alpha) * this.previousProbabilities[i])
      );
      console.log(`   Smoothed probabilities:`, probabilities);
    }

    // Store for next prediction
    this.previousProbabilities = probabilities;

    // Cleanup
    input.dispose();
    prediction.dispose();

    // Check if this is regression mode
    const isRegression = dataType === 'imu-regression';

    if (isRegression) {
      // Regression mode: return continuous outputs
      console.log(`   Regression outputs:`, probabilities);
      console.log(`   Output labels:`, this.trainingData.outputLabels);

      return {
        outputs: Array.from(probabilities),
        outputLabels: this.trainingData.outputLabels || [],
      };
    } else {
      // Classification mode: return class probabilities
      console.log(`   All class labels:`, this.trainingData.labels);

      // Get predicted class
      const predictedClass = probabilities.indexOf(Math.max(...probabilities));
      const confidence = probabilities[predictedClass];

      console.log(`   Predicted class index: ${predictedClass} (${this.trainingData.labels[predictedClass]})`);
      console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);

      return {
        predictedClass: predictedClass,
        predictedLabel: this.trainingData.labels[predictedClass],
        confidence: confidence,
        probabilities: Array.from(probabilities),
      };
    }
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
      smoothingEnabled: this.smoothingEnabled,
      smoothingAlpha: this.smoothingAlpha,
    };
  }

  // ========================================================================
  // Prediction Smoothing Control
  // ========================================================================

  setSmoothing(enabled, alpha = 0.3) {
    this.smoothingEnabled = enabled;
    this.smoothingAlpha = Math.max(0, Math.min(1, alpha));
    console.log(`✅ Prediction smoothing: ${enabled ? 'enabled' : 'disabled'} (alpha=${this.smoothingAlpha})`);
  }

  resetSmoothing() {
    this.previousProbabilities = null;
    console.log('✅ Smoothing state reset');
  }

  // ========================================================================
  // Train Regression Model
  // ========================================================================

  async trainRegression(regressionSamples, config = {}, outputLabels = []) {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }

    this.isTraining = true;
    this.shouldStop = false;
    this.history = {
      loss: [],
      mae: [],       // Mean Absolute Error instead of accuracy
      valLoss: [],
      valMae: [],
      epochs: [],
    };

    try {
      console.log('🔄 Starting regression model training...');

      // Prepare regression data
      const preparedData = this.dataProcessor.prepareRegressionData(regressionSamples);

      console.log('📊 Training data prepared');
      console.log(`   Input shape: [${preparedData.inputShape}]`);
      console.log(`   Output dimensions: ${preparedData.numOutputs}`);
      console.log(`   Output labels: ${outputLabels.join(', ')}`);

      // Store training data with output labels
      this.trainingData = {
        ...preparedData,
        outputLabels: outputLabels,
      };

      // Build regression model
      const modelConfig = {
        hiddenUnits1: config.hiddenUnits1 || 50,
        hiddenUnits2: config.hiddenUnits2 || 15,
        dropoutRate: config.dropoutRate || 0.2,
        learningRate: config.learningRate || 0.001,
      };

      this.model = this.modelBuilder.buildRegressionModel(
        preparedData.inputShape,
        preparedData.numOutputs,
        modelConfig
      );

      // Create regression tensors
      const tensors = this.dataProcessor.createRegressionTensors(preparedData);

      // Emit training start
      this.emit('trainingStart', {
        mode: 'regression',
        sampleCount: regressionSamples.length,
        outputCount: preparedData.numOutputs,
        trainingSize: tensors.trainX.shape[0],
        validationSize: tensors.valX.shape[0],
        config: {
          epochs: config.epochs || 50,
          batchSize: config.batchSize || 16,
          learningRate: config.learningRate || 0.001,
        },
      });

      // Training configuration
      const trainingConfig = {
        epochs: config.epochs || 50,
        batchSize: config.batchSize || 16,
        validationData: [tensors.valX, tensors.valY],
        shuffle: true,
        callbacks: {
          onEpochBegin: async (epoch) => {
            if (this.shouldStop) {
              this.model.stopTraining = true;
            }
            this.emit('epochBegin', { epoch });
          },
          onEpochEnd: async (epoch, logs) => {
            this.history.epochs.push(epoch);
            this.history.loss.push(logs.loss);
            this.history.mae.push(logs.mae);
            this.history.valLoss.push(logs.val_loss);
            this.history.valMae.push(logs.val_mae);

            console.log(`   Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, mae=${logs.mae.toFixed(4)}, val_mae=${logs.val_mae.toFixed(4)}`);

            this.emit('epochEnd', {
              epoch,
              totalEpochs: config.epochs || 50,
              loss: logs.loss,
              mae: logs.mae,
              valLoss: logs.val_loss,
              valMae: logs.val_mae,
              history: this.history,
            });
          },
          onBatchEnd: async (batch, logs) => {
            this.emit('batchEnd', { batch, logs });
          },
        },
      };

      // Train model
      console.log('🚀 Starting regression training...');
      await this.model.fit(tensors.trainX, tensors.trainY, trainingConfig);

      // Cleanup tensors
      tensors.trainX.dispose();
      tensors.trainY.dispose();
      tensors.valX.dispose();
      tensors.valY.dispose();

      console.log('✅ Regression training complete!');
      console.log(`   Final MAE: ${this.history.mae[this.history.mae.length - 1].toFixed(4)}`);
      console.log(`   Final Val MAE: ${this.history.valMae[this.history.valMae.length - 1].toFixed(4)}`);

      // Create evaluation object compatible with TrainingUI
      const evaluation = {
        mae: this.history.mae[this.history.mae.length - 1],
        valMae: this.history.valMae[this.history.valMae.length - 1],
        loss: this.history.loss[this.history.loss.length - 1],
        valLoss: this.history.valLoss[this.history.valLoss.length - 1],
        isRegression: true,  // Flag to indicate this is regression, not classification
      };

      this.emit('trainingEnd', {
        history: this.history,
        evaluation: evaluation,
        stopped: this.shouldStop,
      });

    } catch (error) {
      console.error('❌ Regression training failed:', error);
      this.emit('trainingError', { error });
      throw error;
    } finally {
      this.isTraining = false;
    }
  }

  // ========================================================================
  // Predict Regression (Continuous Outputs)
  // ========================================================================

  async predictRegression(sampleData) {
    if (!this.model) {
      throw new Error('No model loaded for regression prediction');
    }

    console.log('🔄 Running regression prediction...');

    // Normalize input data
    const processedSample = this.dataProcessor.normalizeData([sampleData], 'imu')[0];

    // Create tensor
    const input = tf.tensor2d([processedSample]);
    console.log(`   Input tensor shape: [${input.shape}]`);

    // Predict
    const prediction = this.model.predict(input);
    let outputs = Array.from(await prediction.data());

    console.log(`   Raw outputs:`, outputs);

    // Apply smoothing if enabled
    if (this.smoothingEnabled && this.previousProbabilities) {
      const alpha = this.smoothingAlpha;
      outputs = outputs.map((val, i) =>
        (alpha * val) + ((1 - alpha) * this.previousProbabilities[i])
      );
      console.log(`   Smoothed outputs:`, outputs);
    }

    // Store for next prediction
    this.previousProbabilities = outputs;

    // Cleanup
    input.dispose();
    prediction.dispose();

    return outputs;
  }

  // ========================================================================
  // Train Audio Model
  // ========================================================================

  async trainAudioModel(samples, labels, soundNames, dimensions, config = {}) {
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
      console.log('🎤 Starting audio model training...');
      console.log(`   Samples shape: ${samples.length} × ${samples[0]?.length}`);
      console.log(`   Labels:`, labels);
      console.log(`   Sound names:`, soundNames);
      console.log(`   Dimensions:`, dimensions);

      const labelCounts = {};
      labels.forEach(label => {
        labelCounts[label] = (labelCounts[label] || 0) + 1;
      });
      console.log(`   Label distribution:`, labelCounts);
      console.log(`   Expected labels: 0="${soundNames[0]}", 1="${soundNames[1]}", 2="${soundNames[2]}"`);

      console.log(`   First 5 labels:`, labels.slice(0, 5));
      console.log(`   Last 5 labels:`, labels.slice(-5));
      console.log(`   First sample (first 10 features):`, samples[0].slice(0, 10));
      console.log(`   Middle sample (first 10 features):`, samples[Math.floor(samples.length/2)].slice(0, 10));
      console.log(`   Last sample (first 10 features):`, samples[samples.length-1].slice(0, 10));

      // CRITICAL FIX: Shuffle data before creating tensors
      // TensorFlow's validationSplit takes the LAST portion without shuffling
      // This causes validation set to only contain the last class if data is ordered by class
      console.log('🔀 Shuffling data before training...');
      const shuffledIndices = Array.from({ length: samples.length }, (_, i) => i);

      // Fisher-Yates shuffle with seed for reproducibility
      let seed = 42;
      const seededRandom = () => {
        seed = Math.sin(seed) * 10000;
        return seed - Math.floor(seed);
      };

      for (let i = shuffledIndices.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
      }

      const shuffledSamples = shuffledIndices.map(i => samples[i]);
      const shuffledLabels = shuffledIndices.map(i => labels[i]);

      console.log(`   After shuffle - First 10 labels:`, shuffledLabels.slice(0, 10));
      console.log(`   After shuffle - Last 10 labels:`, shuffledLabels.slice(-10));

      // Convert to tensors with shuffled data
      const xs = tf.tensor2d(shuffledSamples);
      const ys = tf.oneHot(tf.tensor1d(shuffledLabels, 'int32'), soundNames.length);

      console.log(`   Input tensor shape: [${xs.shape}]`);
      console.log(`   Output tensor shape: [${ys.shape}]`);

      const ysArray = await ys.array();
      console.log(`   First one-hot encoded label:`, ysArray[0]);
      console.log(`   Middle one-hot encoded label:`, ysArray[Math.floor(ysArray.length/2)]);
      console.log(`   Last one-hot encoded label:`, ysArray[ysArray.length-1]);

      // Prepare training data structure
      this.trainingData = {
        labels: soundNames,
        numClasses: soundNames.length,
        inputShape: [dimensions.totalFeatures],
        dataType: 'audio'
      };

      // Build audio model
      this.model = this.modelBuilder.buildAudioModel(
        dimensions.numFrames,
        dimensions.numMFCC,
        soundNames.length,
        config
      );

      // Training config
      const trainingConfig = {
        epochs: config.epochs || 50,
        batchSize: config.batchSize || 16,
        validationSplit: config.validationSplit || 0.2,
        ...config
      };

      console.log(`   Training config:`, trainingConfig);

      // Calculate training/validation split
      const valSplit = trainingConfig.validationSplit || 0.2;
      const totalSamples = samples.length;
      const trainingSamples = Math.floor(totalSamples * (1 - valSplit));
      const validationSamples = totalSamples - trainingSamples;

      // Emit training start with stats
      this.emit('trainingStart', {
        numClasses: soundNames.length,
        labels: soundNames,
        config: trainingConfig,
        totalSamples: totalSamples,
        stats: {
          trainingSamples: trainingSamples,
          validationSamples: validationSamples,
          totalSamples: totalSamples
        }
      });

      console.log('🧪 Testing model on shuffled samples before training...');
      const testPredictions = this.model.predict(xs.slice([0, 0], [5, -1]));
      const testProbs = await testPredictions.array();
      console.log('   First 5 shuffled labels:', shuffledLabels.slice(0, 5));
      console.log('   Model predictions before training:');
      testProbs.forEach((probs, i) => {
        const predicted = probs.indexOf(Math.max(...probs));
        console.log(`     Sample ${i}: true=${shuffledLabels[i]}, predicted=${predicted}, probs=[${probs.map(p => p.toFixed(3)).join(', ')}]`);
      });
      testPredictions.dispose();

      // Train model
      const history = await this.model.fit(xs, ys, {
        epochs: trainingConfig.epochs,
        batchSize: trainingConfig.batchSize,
        validationSplit: trainingConfig.validationSplit,
        shuffle: true,
        callbacks: {
          onEpochBegin: (epoch) => {
            if (this.shouldStop) {
              this.model.stopTraining = true;
              return;
            }

            this.emit('epochBegin', { epoch });
          },
          onEpochEnd: async (epoch, logs) => {
            this.history.epochs.push(epoch);
            this.history.loss.push(logs.loss);
            this.history.accuracy.push(logs.acc);
            this.history.valLoss.push(logs.val_loss);
            this.history.valAccuracy.push(logs.val_acc);

            this.emit('epochEnd', {
              epoch: epoch + 1,
              totalEpochs: trainingConfig.epochs,
              loss: logs.loss,
              accuracy: logs.acc,
              valLoss: logs.val_loss,
              valAccuracy: logs.val_acc,
              history: this.history
            });
          },
          onBatchEnd: (batch, logs) => {
            this.emit('batchEnd', { batch, logs });
          }
        }
      });

      console.log('🧪 Testing model on shuffled samples after training...');
      const testPredictionsAfter = this.model.predict(xs.slice([0, 0], [5, -1]));
      const testProbsAfter = await testPredictionsAfter.array();
      console.log('   First 5 shuffled labels:', shuffledLabels.slice(0, 5));
      console.log('   Model predictions after training:');
      testProbsAfter.forEach((probs, i) => {
        const predicted = probs.indexOf(Math.max(...probs));
        console.log(`     Sample ${i}: true=${shuffledLabels[i]}, predicted=${predicted}, probs=[${probs.map(p => p.toFixed(3)).join(', ')}]`);
      });
      testPredictionsAfter.dispose();

      // Training complete
      const finalMetrics = {
        loss: this.history.loss[this.history.loss.length - 1],
        accuracy: this.history.accuracy[this.history.accuracy.length - 1],
        valLoss: this.history.valLoss[this.history.valLoss.length - 1],
        valAccuracy: this.history.valAccuracy[this.history.valAccuracy.length - 1]
      };

      console.log('✅ Audio training complete');
      console.log(`   Final accuracy: ${(finalMetrics.accuracy * 100).toFixed(1)}%`);
      console.log(`   Final val accuracy: ${(finalMetrics.valAccuracy * 100).toFixed(1)}%`);

      this.emit('trainingEnd', {
        history: this.history,
        evaluation: finalMetrics,
        model: this.model,
        trainingData: this.trainingData
      });

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      return {
        model: this.model,
        history: this.history,
        evaluation: finalMetrics
      };

    } catch (error) {
      console.error('❌ Audio training error:', error);
      this.emit('trainingError', { error: error.message });
      throw error;
    } finally {
      this.isTraining = false;
    }
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
