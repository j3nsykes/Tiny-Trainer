// ============================================================================
// Training UI Controller
// ============================================================================
// Manages UI updates during model training
// Real-time progress visualization and metrics display
// ============================================================================

class TrainingUI {
  constructor(mlTrainer) {
    this.mlTrainer = mlTrainer;
    this.chartCanvas = null;
    this.chartCtx = null;
    
    // Chart state
    this.chartInitialized = false;
    this.maxEpochsToShow = 50;
    
    // Setup listeners
    this.setupTrainingListeners();
  }

  // ========================================================================
  // Setup Training Listeners
  // ========================================================================

  setupTrainingListeners() {
    this.mlTrainer.on('trainingStart', (data) => this.onTrainingStart(data));
    this.mlTrainer.on('epochBegin', (data) => this.onEpochBegin(data));
    this.mlTrainer.on('epochEnd', (data) => this.onEpochEnd(data));
    this.mlTrainer.on('trainingEnd', (data) => this.onTrainingEnd(data));
    this.mlTrainer.on('trainingError', (data) => this.onTrainingError(data));
  }

  // ========================================================================
  // Training Start
  // ========================================================================

  onTrainingStart(data) {
    console.log('🎨 Training started - updating UI');
    
    // Show training modal
    this.showTrainingModal();
    
    // Update info
    this.updateTrainingInfo(data);
    
    // Initialize charts
    this.initializeCharts();
    
    // Reset progress
    this.updateProgress(0, data.config.epochs);
    
    // Update status
    this.updateStatus('Training in progress...', 'training');
  }

  // ========================================================================
  // Epoch Begin
  // ========================================================================

  onEpochBegin(data) {
    // Update current epoch indicator
    this.updateStatus(`Epoch ${data.epoch + 1}...`, 'training');
  }

  // ========================================================================
  // Epoch End
  // ========================================================================

  onEpochEnd(data) {
    // Update progress bar
    const progress = (data.epoch / data.totalEpochs) * 100;
    this.updateProgress(progress, data.totalEpochs, data.epoch);
    
    // Update metrics
    this.updateMetrics(data);
    
    // Update charts
    this.updateCharts(data.history);
    
    // Update status
    const accuracy = (data.accuracy * 100).toFixed(1);
    const valAccuracy = (data.valAccuracy * 100).toFixed(1);
    this.updateStatus(
      `Epoch ${data.epoch}/${data.totalEpochs} - Acc: ${accuracy}% - Val Acc: ${valAccuracy}%`,
      'training'
    );
  }

  // ========================================================================
  // Training End
  // ========================================================================

  onTrainingEnd(data) {
    console.log('🎉 Training completed - updating UI');
    
    // Update final metrics
    this.displayFinalResults(data);
    
    // Show testing interface
    this.showTestingInterface();
    
    // Update status
    if (data.stopped) {
      this.updateStatus('Training stopped by user', 'stopped');
    } else {
      const accuracy = (data.evaluation.accuracy * 100).toFixed(1);
      this.updateStatus(`Training complete! Accuracy: ${accuracy}%`, 'complete');
    }
    
    // Enable export buttons
    this.enableExportButtons();
    
    // Hide stop button, show close button
    this.updateModalButtons(true);
  }

  // ========================================================================
  // Training Error
  // ========================================================================

  onTrainingError(data) {
    console.error('❌ Training error:', data.error);
    this.updateStatus(`Error: ${data.error}`, 'error');
    this.hideTrainingModal();
  }

  // ========================================================================
  // Modal Management
  // ========================================================================

  showTrainingModal() {
    const modal = document.getElementById('training-modal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  hideTrainingModal() {
    const modal = document.getElementById('training-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  updateModalButtons(trainingComplete) {
    const stopBtn = document.getElementById('stop-training-btn');
    const closeBtn = document.getElementById('close-training-btn');
    
    if (stopBtn) stopBtn.style.display = trainingComplete ? 'none' : 'block';
    if (closeBtn) closeBtn.style.display = trainingComplete ? 'block' : 'none';
  }

  // ========================================================================
  // Progress Updates
  // ========================================================================

  updateProgress(percent, totalEpochs, currentEpoch) {
    const progressBar = document.getElementById('training-progress-fill');
    const progressText = document.getElementById('training-progress-text');
    
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    
    if (progressText && currentEpoch !== undefined) {
      progressText.textContent = `${currentEpoch} / ${totalEpochs} epochs`;
    }
  }

  updateStatus(message, state) {
    const statusEl = document.getElementById('training-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `training-status training-status-${state}`;
    }
  }

  // ========================================================================
  // Metrics Display
  // ========================================================================

  updateMetrics(data) {
    // Loss
    const lossEl = document.getElementById('metric-loss');
    if (lossEl) {
      lossEl.textContent = data.loss.toFixed(4);
    }
    
    // Accuracy
    const accEl = document.getElementById('metric-accuracy');
    if (accEl) {
      accEl.textContent = `${(data.accuracy * 100).toFixed(1)}%`;
    }
    
    // Validation Loss
    const valLossEl = document.getElementById('metric-val-loss');
    if (valLossEl) {
      valLossEl.textContent = data.valLoss.toFixed(4);
    }
    
    // Validation Accuracy
    const valAccEl = document.getElementById('metric-val-accuracy');
    if (valAccEl) {
      valAccEl.textContent = `${(data.valAccuracy * 100).toFixed(1)}%`;
    }
  }

  updateTrainingInfo(data) {
    // Training samples
    const trainSamplesEl = document.getElementById('info-train-samples');
    if (trainSamplesEl) {
      trainSamplesEl.textContent = data.stats.trainingSamples;
    }
    
    // Validation samples
    const valSamplesEl = document.getElementById('info-val-samples');
    if (valSamplesEl) {
      valSamplesEl.textContent = data.stats.validationSamples;
    }
    
    // Epochs
    const epochsEl = document.getElementById('info-epochs');
    if (epochsEl) {
      epochsEl.textContent = data.config.epochs;
    }
    
    // Batch size
    const batchEl = document.getElementById('info-batch-size');
    if (batchEl) {
      batchEl.textContent = data.config.batchSize;
    }
  }

  // ========================================================================
  // Charts
  // ========================================================================

  initializeCharts() {
    this.chartCanvas = document.getElementById('training-chart');
    if (!this.chartCanvas) {
      console.warn('Chart canvas not found');
      return;
    }
    
    this.chartCtx = this.chartCanvas.getContext('2d');
    this.chartInitialized = true;
    
    // Setup high-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = this.chartCanvas.getBoundingClientRect();
    this.chartCanvas.width = rect.width * dpr;
    this.chartCanvas.height = rect.height * dpr;
    this.chartCtx.scale(dpr, dpr);
    
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  updateCharts(history) {
    if (!this.chartInitialized || !this.chartCtx) {
      return;
    }

    const ctx = this.chartCtx;
    const w = this.displayWidth;
    const h = this.displayHeight;
    
    // Clear canvas
    ctx.fillStyle = '#0f0a1f';
    ctx.fillRect(0, 0, w, h);
    
    // Draw grid
    this.drawGrid(ctx, w, h);
    
    // Draw two charts: Accuracy (top) and Loss (bottom)
    const chartHeight = h / 2 - 20;
    
    // Accuracy chart
    this.drawMetricChart(ctx, 10, 10, w - 20, chartHeight, 
      history, ['accuracy', 'valAccuracy'], 
      'Accuracy', 0, 1, ['#4a9eff', '#00ff88']);
    
    // Loss chart
    this.drawMetricChart(ctx, 10, h / 2 + 10, w - 20, chartHeight,
      history, ['loss', 'valLoss'],
      'Loss', 0, null, ['#ff6b6b', '#feca57']);
  }

  drawGrid(ctx, w, h) {
    ctx.strokeStyle = '#2a1a4a';
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  drawMetricChart(ctx, x, y, w, h, history, metrics, title, minVal, maxVal, colors) {
    // Title
    ctx.fillStyle = '#a0a0d0';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(title, x + 10, y + 15);
    
    // Legend
    let legendX = x + w - 150;
    metrics.forEach((metric, i) => {
      ctx.fillStyle = colors[i];
      ctx.fillRect(legendX, y + 8 + i * 16, 10, 10);
      ctx.fillStyle = '#a0a0d0';
      ctx.font = '11px -apple-system, sans-serif';
      const label = metric === 'valAccuracy' ? 'Val Acc' :
                    metric === 'valLoss' ? 'Val Loss' :
                    metric.charAt(0).toUpperCase() + metric.slice(1);
      ctx.fillText(label, legendX + 14, y + 16 + i * 16);
    });
    
    // Chart area
    const chartY = y + 30;
    const chartH = h - 40;
    
    // Calculate max value if not provided
    if (maxVal === null) {
      maxVal = 0;
      metrics.forEach(metric => {
        const values = history[metric];
        maxVal = Math.max(maxVal, ...values);
      });
      maxVal = Math.ceil(maxVal * 10) / 10;
    }
    
    // Draw lines
    metrics.forEach((metric, metricIdx) => {
      const values = history[metric];
      if (values.length < 2) return;
      
      ctx.strokeStyle = colors[metricIdx];
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      values.forEach((value, i) => {
        const px = x + (i / Math.max(values.length - 1, 1)) * w;
        const normalized = (value - minVal) / (maxVal - minVal);
        const py = chartY + chartH - (normalized * chartH);
        
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      
      ctx.stroke();
    });
    
    // Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal.toFixed(2), x - 5, chartY + 10);
    ctx.fillText(minVal.toFixed(2), x - 5, chartY + chartH);
    ctx.textAlign = 'left';
  }

  // ========================================================================
  // Final Results
  // ========================================================================

  displayFinalResults(data) {
    const resultsDiv = document.getElementById('final-results');
    if (!resultsDiv) return;
    
    const accuracy = (data.evaluation.accuracy * 100).toFixed(1);
    const loss = data.evaluation.loss.toFixed(4);
    
    let html = `
      <div class="result-summary">
        <h3>Training Complete!</h3>
        <div class="result-metrics">
          <div class="result-metric">
            <div class="result-label">Final Accuracy</div>
            <div class="result-value">${accuracy}%</div>
          </div>
          <div class="result-metric">
            <div class="result-label">Final Loss</div>
            <div class="result-value">${loss}</div>
          </div>
        </div>
      </div>
    `;
    
    // Per-class accuracy
    if (data.evaluation.perClassAccuracy) {
      html += '<div class="per-class-results"><h4>Per-Class Accuracy:</h4>';
      data.evaluation.perClassAccuracy.forEach(stat => {
        const acc = (stat.accuracy * 100).toFixed(1);
        html += `
          <div class="class-result">
            <span class="class-label">${stat.label}:</span>
            <span class="class-accuracy">${acc}%</span>
            <span class="class-count">(${stat.correct}/${stat.total})</span>
          </div>
        `;
      });
      html += '</div>';
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
  }

  // ========================================================================
  // Testing Interface
  // ========================================================================

  showTestingInterface() {
    const testingInterface = document.getElementById('testing-interface');
    if (!testingInterface) return;

    // Check if this is an audio model
    const dataType = this.mlTrainer.trainingData?.dataType || 'imu';

    // Setup probability bars for each class
    this.setupProbabilityBars();

    // Show interface
    testingInterface.style.display = 'block';

    console.log('🧪 Testing interface ready');
    console.log(`   Data type: ${dataType}`);
  }

  setupProbabilityBars() {
    const container = document.getElementById('probability-bars');
    if (!container || !this.mlTrainer.trainingData) return;
    
    const labels = this.mlTrainer.trainingData.labels;
    
    let html = '';
    labels.forEach((label, index) => {
      html += `
        <div class="probability-bar" data-class-index="${index}">
          <div class="prob-label" id="prob-label-${index}">${label}</div>
          <div class="prob-bar-container">
            <div class="prob-bar-fill" id="prob-bar-${index}" style="width: 0%"></div>
          </div>
          <div class="prob-value" id="prob-value-${index}">0%</div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  updatePrediction(prediction) {
    // Update predicted gesture
    const gestureEl = document.getElementById('predicted-gesture');
    const confidenceEl = document.getElementById('prediction-confidence');
    
    if (gestureEl) {
      gestureEl.textContent = prediction.predictedLabel;
      
      // Update class based on confidence
      gestureEl.classList.remove('low-confidence', 'no-prediction');
      if (prediction.confidence < 0.6) {
        gestureEl.classList.add('low-confidence');
      }
    }
    
    if (confidenceEl) {
      const percent = (prediction.confidence * 100).toFixed(1);
      confidenceEl.textContent = `${percent}% confident`;
    }
    
    // Update probability bars
    prediction.probabilities.forEach((prob, index) => {
      const barEl = document.getElementById(`prob-bar-${index}`);
      const valueEl = document.getElementById(`prob-value-${index}`);
      const labelEl = document.getElementById(`prob-label-${index}`);
      
      if (barEl) {
        const percent = (prob * 100).toFixed(1);
        barEl.style.width = `${percent}%`;
        
        // Highlight if this is the predicted class
        if (index === prediction.predictedClass) {
          barEl.classList.add('active');
        } else {
          barEl.classList.remove('active');
        }
      }
      
      if (valueEl) {
        const percent = (prob * 100).toFixed(1);
        valueEl.textContent = `${percent}%`;
        
        if (index === prediction.predictedClass) {
          valueEl.classList.add('active');
        } else {
          valueEl.classList.remove('active');
        }
      }
      
      if (labelEl) {
        if (index === prediction.predictedClass) {
          labelEl.classList.add('active');
        } else {
          labelEl.classList.remove('active');
        }
      }
    });
  }

  // ========================================================================
  // Export Buttons
  // ========================================================================

  enableExportButtons() {
    const exportModelBtn = document.getElementById('export-model-btn');
    const downloadModelBtn = document.getElementById('download-model-btn');

    if (exportModelBtn) exportModelBtn.disabled = false;
    if (downloadModelBtn) downloadModelBtn.disabled = false;
  }

  // ========================================================================
  // Audio Training Initiation
  // ========================================================================

  startAudioTraining(samples, labels, soundNames, dimensions) {
    console.log('🎤 Starting audio training...');
    console.log(`   Samples: ${samples.length}`);
    console.log(`   Sounds: ${soundNames.join(', ')}`);
    console.log(`   Feature dimensions: ${dimensions.totalFeatures}`);

    // Configure for audio training
    const config = {
      epochs: 50,
      batchSize: 16,
      validationSplit: 0.2
    };

    // Start training with audio-specific model
    this.mlTrainer.trainAudioModel(samples, labels, soundNames, dimensions, config);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrainingUI;
}
