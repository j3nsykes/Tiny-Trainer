// ============================================================================
// Regression UI Manager
// ============================================================================
// Manages the regression mode interface for IMU tab
// Handles parameter cards, sliders, recording, and mode switching
// ============================================================================

class RegressionUI {
  constructor() {
    this.mode = 'classification'; // Default mode
    this.parameters = []; // Array of {id, name, value, samples}
    this.recordingParameter = null; // Currently recording parameter ID
    this.recordingInterval = null;

    // DOM Elements
    this.modeSelect = null;
    this.modeToggleContainer = null;
    this.regressionSection = null;
    this.gesturesSection = null;
    this.parametersContainer = null;
    this.emptyState = null;
    this.addParameterBtn = null;

    // Dependencies
    this.regressionManager = null;
    this.dataCollector = null;

    this.init();
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  init() {
    console.log('🎯 Initializing RegressionUI...');

    // Check feature flag
    if (!window.FeatureFlags?.ENABLE_REGRESSION) {
      console.log('⚠️ Regression mode is disabled via feature flag');
      this.hideRegressionFeature();
      return;
    }

    // Get DOM elements
    this.modeSelect = document.getElementById('imu-mode-select');
    this.modeToggleContainer = document.getElementById('mode-toggle-container');
    this.regressionSection = document.getElementById('regression-section');
    this.gesturesSection = document.getElementById('gestures-section');
    this.parametersContainer = document.getElementById('regression-parameters');
    this.emptyState = document.getElementById('regression-empty-state');
    this.addParameterBtn = document.getElementById('add-parameter-btn');

    if (!this.modeSelect) {
      console.error('❌ Mode select element not found');
      return;
    }

    // Setup event listeners
    this.setupEventListeners();

    // Initialize regression manager
    this.regressionManager = new RegressionManager();

    // Listen for tab changes to show/hide mode toggle
    if (window.tabManager) {
      window.tabManager.onTabChange((tabId) => {
        this.handleTabChange(tabId);
      });
    }

    console.log('✅ RegressionUI initialized');
  }

  hideRegressionFeature() {
    // Hide the mode toggle completely
    const modeToggleContainer = document.getElementById('mode-toggle-container');
    if (modeToggleContainer) {
      modeToggleContainer.style.display = 'none';
    }

    // Hide regression section
    const regressionSection = document.getElementById('regression-section');
    if (regressionSection) {
      regressionSection.style.display = 'none';
    }

    // Ensure gestures section is visible
    const gesturesSection = document.getElementById('gestures-section');
    if (gesturesSection) {
      gesturesSection.style.display = 'block';
    }
  }

  handleTabChange(tabId) {
    // Show mode toggle only on IMU tab
    if (this.modeToggleContainer) {
      if (tabId === 'imu') {
        this.modeToggleContainer.style.display = 'flex';
      } else {
        this.modeToggleContainer.style.display = 'none';
      }
    }
  }

  setDataCollector(dataCollector) {
    this.dataCollector = dataCollector;
  }

  // ========================================================================
  // Event Listeners
  // ========================================================================

  setupEventListeners() {
    // Mode toggle
    this.modeSelect.addEventListener('change', (e) => {
      this.switchMode(e.target.value);
    });

    // Add parameter button
    this.addParameterBtn.addEventListener('click', () => {
      this.addParameter();
    });

    // View samples button
    const viewSamplesBtn = document.getElementById('view-regression-samples-btn');
    if (viewSamplesBtn) {
      viewSamplesBtn.addEventListener('click', () => {
        this.showSampleViewer();
      });
    }
  }

  // ========================================================================
  // Mode Switching
  // ========================================================================

  switchMode(newMode) {
    console.log(`🔄 Switching mode: ${this.mode} → ${newMode}`);

    this.mode = newMode;

    if (newMode === 'regression') {
      // Show regression UI, hide gestures UI
      this.regressionSection.style.display = 'block';
      this.gesturesSection.style.display = 'none';

      // Show regression buttons, hide classification buttons
      document.querySelectorAll('.regression-only').forEach(el => el.style.display = '');
      document.querySelectorAll('.classification-only').forEach(el => el.style.display = 'none');

      // Initialize with one default parameter if empty
      if (this.parameters.length === 0) {
        this.addParameter();
      }

      // Update export button state
      this.updateExportButtonState();

      // Update training info
      if (typeof updateTrainingInfo === 'function') {
        updateTrainingInfo();
      }
    } else {
      // Show gestures UI, hide regression UI
      this.regressionSection.style.display = 'none';
      this.gesturesSection.style.display = 'block';

      // Show classification buttons, hide regression buttons
      document.querySelectorAll('.classification-only').forEach(el => el.style.display = '');
      document.querySelectorAll('.regression-only').forEach(el => el.style.display = 'none');

      // Update training info
      if (typeof updateTrainingInfo === 'function') {
        updateTrainingInfo();
      }
    }

    console.log(`✅ Mode switched to: ${newMode}`);
  }

  getMode() {
    return this.mode;
  }

  // ========================================================================
  // Parameter Management
  // ========================================================================

  addParameter() {
    const id = `param_${Date.now()}`;
    const name = `Parameter ${this.parameters.length + 1}`;

    const parameter = {
      id: id,
      name: name,
      value: 0.5, // Default to middle
      samples: 0,
    };

    this.parameters.push(parameter);

    // Update regression manager
    this.regressionManager.setOutputCount(this.parameters.length);
    const labels = this.parameters.map(p => p.name);
    this.regressionManager.setOutputLabels(labels);

    // Render parameter card
    this.renderParameterCard(parameter);

    // Hide empty state
    this.updateEmptyState();

    console.log(`✅ Added parameter: ${name} (${id})`);
  }

  removeParameter(id) {
    const index = this.parameters.findIndex(p => p.id === id);
    if (index === -1) return;

    const parameter = this.parameters[index];
    this.parameters.splice(index, 1);

    // Update regression manager
    this.regressionManager.setOutputCount(this.parameters.length);
    const labels = this.parameters.map(p => p.name);
    this.regressionManager.setOutputLabels(labels);

    // Remove card from DOM
    const card = document.getElementById(`param-card-${id}`);
    if (card) {
      card.remove();
    }

    // Update empty state
    this.updateEmptyState();

    console.log(`✅ Removed parameter: ${parameter.name} (${id})`);
  }

  renameParameter(id, newName) {
    const parameter = this.parameters.find(p => p.id === id);
    if (!parameter) return;

    parameter.name = newName;

    // Update regression manager
    const labels = this.parameters.map(p => p.name);
    this.regressionManager.setOutputLabels(labels);

    // Update UI
    const nameElement = document.getElementById(`param-name-${id}`);
    if (nameElement) {
      nameElement.textContent = newName;
    }

    console.log(`✅ Renamed parameter: ${id} → ${newName}`);
  }

  updateParameterValue(id, value) {
    const parameter = this.parameters.find(p => p.id === id);
    if (!parameter) return;

    parameter.value = value;

    // Update UI
    const labelElement = document.getElementById(`param-label-${id}`);
    if (labelElement) {
      labelElement.textContent = `TARGET: ${value.toFixed(2)}`;
    }

    const indicatorElement = document.getElementById(`param-indicator-${id}`);
    if (indicatorElement) {
      indicatorElement.style.left = `${value * 100}%`;
    }
  }

  updateEmptyState() {
    if (this.parameters.length === 0) {
      this.emptyState.style.display = 'block';
    } else {
      this.emptyState.style.display = 'none';
    }
  }

  // ========================================================================
  // UI Rendering
  // ========================================================================

  renderParameterCard(parameter) {
    const card = document.createElement('div');
    card.className = 'regression-card';
    card.id = `param-card-${parameter.id}`;

    card.innerHTML = `
      <div class="parameter-header">
        <div class="parameter-name-container">
          <span class="parameter-name" id="param-name-${parameter.id}">${parameter.name}</span>
          <span class="parameter-sample-count" id="param-samples-${parameter.id}">SAMPLES: ${parameter.samples}</span>
        </div>
        <div class="parameter-actions">
          <button class="btn-rename-parameter" data-id="${parameter.id}" title="Rename parameter">
            ✏️
          </button>
          <button class="btn-remove-parameter" data-id="${parameter.id}" title="Remove parameter">
            🗑️
          </button>
        </div>
      </div>

      <div class="slider-container">
        <div class="slider-visualization">
          <div class="target-indicator" id="param-indicator-${parameter.id}" style="left: ${parameter.value * 100}%"></div>
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value="${parameter.value}"
          class="parameter-slider"
          id="param-slider-${parameter.id}"
          data-id="${parameter.id}"
        >

        <div class="slider-labels">
          <span class="slider-label-left">0.0</span>
          <span class="slider-label-center" id="param-label-${parameter.id}">TARGET: ${parameter.value.toFixed(2)}</span>
          <span class="slider-label-right">1.0</span>
        </div>
      </div>

      <button
        class="btn-record-target"
        id="param-record-${parameter.id}"
        data-id="${parameter.id}"
      >
        Record Target
      </button>
    `;

    // Always append to parameters container (empty state is in sidebar now)
    this.parametersContainer.appendChild(card);

    // Setup card event listeners
    this.setupCardEventListeners(parameter.id, card);
  }

  renderParameters() {
    // Clear existing cards
    this.parametersContainer.innerHTML = '';

    // Render all parameters
    this.parameters.forEach(parameter => {
      this.renderParameterCard(parameter);
    });

    // Update empty state
    this.updateEmptyState();
  }

  setupCardEventListeners(id, card) {
    // Slider
    const slider = document.getElementById(`param-slider-${id}`);
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.updateParameterValue(id, parseFloat(e.target.value));
      });
    }

    // Record button
    const recordBtn = document.getElementById(`param-record-${id}`);
    if (recordBtn) {
      recordBtn.addEventListener('mousedown', () => this.startRecording(id));
      recordBtn.addEventListener('mouseup', () => this.stopRecording(id));
      recordBtn.addEventListener('mouseleave', () => this.stopRecording(id));
    }

    // Rename button
    const renameBtn = card.querySelector(`.btn-rename-parameter[data-id="${id}"]`);
    if (renameBtn) {
      renameBtn.addEventListener('click', () => {
        const parameter = this.parameters.find(p => p.id === id);
        if (!parameter) return;

        // Create inline input for renaming
        const nameElement = document.getElementById(`param-name-${id}`);
        if (!nameElement) return;

        const currentName = parameter.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'parameter-name-input';
        input.style.cssText = 'width: 150px; padding: 2px 4px; font-size: 14px; background: #2a1a4a; border: 1px solid #7c4dff; color: #e0e0e0; border-radius: 4px;';

        nameElement.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = () => {
          const newName = input.value.trim();
          const newNameElement = document.createElement('span');
          newNameElement.className = 'parameter-name';
          newNameElement.id = `param-name-${id}`;
          newNameElement.textContent = newName || currentName;
          input.replaceWith(newNameElement);

          if (newName && newName !== currentName) {
            this.renameParameter(id, newName);
          }
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            finishRename();
          } else if (e.key === 'Escape') {
            const nameElement = document.createElement('span');
            nameElement.className = 'parameter-name';
            nameElement.id = `param-name-${id}`;
            nameElement.textContent = currentName;
            input.replaceWith(nameElement);
          }
        });
      });
    }

    // Remove button
    const removeBtn = card.querySelector(`.btn-remove-parameter[data-id="${id}"]`);
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (confirm('Remove this parameter and all its samples?')) {
          this.removeParameter(id);
        }
      });
    }
  }

  // ========================================================================
  // Recording
  // ========================================================================

  startRecording(id) {
    if (this.recordingParameter) return; // Already recording

    if (!this.dataCollector) {
      alert('Device not connected');
      return;
    }

    console.log(`🔴 Started recording parameter: ${id}`);

    this.recordingParameter = id;

    // Update button UI
    const recordBtn = document.getElementById(`param-record-${id}`);
    if (recordBtn) {
      recordBtn.classList.add('recording');
      recordBtn.textContent = 'RECORDING';
    }

    // Start recording interval (capture every 50ms)
    this.recordingInterval = setInterval(() => {
      this.captureFrame(id);
    }, 50);
  }

  stopRecording(id) {
    if (this.recordingParameter !== id) return;

    console.log(`⏹️ Stopped recording parameter: ${id}`);

    // Clear interval
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    this.recordingParameter = null;

    // Update button UI
    const recordBtn = document.getElementById(`param-record-${id}`);
    if (recordBtn) {
      recordBtn.classList.remove('recording');
      recordBtn.textContent = 'Record Target';
    }
  }

  captureFrame(id) {
    const parameter = this.parameters.find(p => p.id === id);
    if (!parameter) {
      console.warn(`⚠️ Cannot capture: parameter ${id} not found. Available:`, this.parameters.map(p => p.id));
      return;
    }
    if (!this.dataCollector) {
      console.warn('⚠️ Cannot capture: data collector not set');
      return;
    }

    // Get current IMU data from data collector
    const sensorData = this.dataCollector.getCurrentBuffer();

    if (sensorData && sensorData.length === 900) {
      // Get all parameter values in order
      const outputValues = this.parameters.map(p => p.value);

      // Add sample to regression manager
      this.regressionManager.addSample(sensorData, outputValues);

      // Update sample count for this parameter
      parameter.samples++;

      // Update UI - parameter sample count
      const samplesElement = document.getElementById(`param-samples-${id}`);
      if (samplesElement) {
        samplesElement.textContent = `SAMPLES: ${parameter.samples}`;
      }

      // Update export button state
      this.updateExportButtonState();

      // Update training info (train button state)
      if (typeof updateTrainingInfo === 'function') {
        updateTrainingInfo();
      }

      console.log(`✅ Sample captured for parameter ${id}. Total: ${this.regressionManager.getSampleCount()}`);
    } else {
      console.warn(`⚠️ Invalid sensor data length: ${sensorData?.length || 0} (expected 900)`);
    }
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  updateExportButtonState() {
    const exportBtn = document.getElementById('export-regression-data-btn');
    const viewSamplesBtn = document.getElementById('view-regression-samples-btn');
    const sampleCountEl = document.getElementById('regression-sample-count');

    const sampleCount = this.regressionManager.getSampleCount();

    if (exportBtn) {
      exportBtn.disabled = sampleCount === 0;
    }
    if (viewSamplesBtn) {
      viewSamplesBtn.disabled = sampleCount === 0;
    }
    if (sampleCountEl) {
      sampleCountEl.textContent = sampleCount;
    }
  }

  exportData() {
    try {
      const jsonData = this.regressionManager.exportJSON();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `regression-data-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);

      // Show toast notification if available
      if (typeof toast !== 'undefined') {
        toast.success('Regression data exported successfully', {
          title: 'Downloaded',
          duration: 3000
        });
      }

      console.log('✅ Regression data exported');
    } catch (error) {
      console.error('❌ Export failed:', error);
      if (typeof toast !== 'undefined') {
        toast.error(`Export failed: ${error.message}`, {
          title: 'Export Error',
          duration: 4000
        });
      }
    }
  }

  importData(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const jsonData = e.target.result;
        const success = this.regressionManager.importJSON(jsonData);

        if (success) {
          // Parse to get metadata
          const data = JSON.parse(jsonData);
          const sampleCount = data.samples.length;
          const outputCount = data.metadata.outputCount;
          const outputLabels = data.metadata.outputLabels;

          // Update parameters to match imported data
          this.parameters = [];
          for (let i = 0; i < outputCount; i++) {
            this.parameters.push({
              id: i + 1,
              name: outputLabels[i] || `Parameter ${i + 1}`,
              value: 0.5,
              samples: sampleCount // All parameters share the same samples
            });
          }

          // Update UI
          this.renderParameters();
          this.updateExportButtonState();

          // Add visual feedback - green outline to show data loaded
          this.parameters.forEach(param => {
            const card = document.getElementById(`param-card-${param.id}`);
            if (card) {
              card.style.border = '2px solid #4caf50';
              card.style.boxShadow = '0 0 8px rgba(76, 175, 80, 0.3)';

              // Remove after 3 seconds
              setTimeout(() => {
                card.style.border = '';
                card.style.boxShadow = '';
              }, 3000);
            }
          });

          // Update training info
          if (typeof updateTrainingInfo === 'function') {
            updateTrainingInfo();
          }

          // Show toast notification
          if (typeof toast !== 'undefined') {
            toast.success(`Loaded ${sampleCount} samples with ${outputCount} outputs`, {
              title: 'Data Loaded',
              duration: 4000
            });
          }

          console.log(`✅ Imported ${sampleCount} regression samples`);
        } else {
          throw new Error('Failed to import data');
        }
      } catch (error) {
        console.error('❌ Import failed:', error);
        if (typeof toast !== 'undefined') {
          toast.error(`Failed to load: ${error.message}`, {
            title: 'Import Error',
            duration: 4000
          });
        }
      }
    };

    reader.onerror = () => {
      console.error('❌ File read error');
      if (typeof toast !== 'undefined') {
        toast.error('Failed to read file', {
          title: 'File Error',
          duration: 3000
        });
      }
    };

    reader.readAsText(file);
  }

  // ========================================================================
  // Sample Viewer
  // ========================================================================

  showSampleViewer() {
    const modal = document.getElementById('sample-viewer-modal');
    const titleEl = document.getElementById('sample-viewer-title');
    const countEl = document.getElementById('sample-viewer-count');
    const listEl = document.getElementById('samples-list');

    if (!modal || !listEl) return;

    const samples = this.regressionManager.getAllSamples();

    // Update title and count
    if (titleEl) titleEl.textContent = 'View Regression Samples';
    if (countEl) countEl.textContent = `${samples.length} sample${samples.length !== 1 ? 's' : ''}`;

    // Clear existing samples
    listEl.innerHTML = '';

    // Render each sample
    samples.forEach((sample, index) => {
      const sampleCard = document.createElement('div');
      sampleCard.className = 'sample-card';
      sampleCard.innerHTML = `
        <div class="sample-header">
          <span class="sample-number">#${index + 1}</span>
          <span class="sample-timestamp">${new Date(sample.timestamp).toLocaleString()}</span>
          <button class="btn-delete-sample" data-index="${index}" title="Delete sample">🗑️</button>
        </div>
        <div class="sample-outputs">
          ${sample.outputs.map((value, i) => `
            <div class="output-value">
              <span class="output-label">${this.parameters[i]?.name || `Output ${i + 1}`}:</span>
              <span class="output-number">${value.toFixed(3)}</span>
            </div>
          `).join('')}
        </div>
      `;

      // Add delete button handler
      const deleteBtn = sampleCard.querySelector('.btn-delete-sample');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Delete sample #${index + 1}?`)) {
            this.deleteSample(index);
            this.showSampleViewer(); // Refresh the view
          }
        });
      }

      listEl.appendChild(sampleCard);
    });

    // Show modal
    modal.style.display = 'flex';

    // Ensure close buttons work
    const closeBtn = document.getElementById('close-sample-viewer');
    const closeBtnX = document.getElementById('close-sample-viewer-x');

    const closeModal = () => {
      modal.style.display = 'none';
    };

    // Remove old listeners and add new ones
    if (closeBtn) {
      closeBtn.replaceWith(closeBtn.cloneNode(true));
      document.getElementById('close-sample-viewer').addEventListener('click', closeModal);
    }
    if (closeBtnX) {
      closeBtnX.replaceWith(closeBtnX.cloneNode(true));
      document.getElementById('close-sample-viewer-x').addEventListener('click', closeModal);
    }

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  deleteSample(index) {
    this.regressionManager.removeSample(index);

    // Update UI
    this.updateExportButtonState();

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.success('Sample deleted', {
        duration: 2000
      });
    }
  }

  // ========================================================================
  // Getters
  // ========================================================================

  getRegressionManager() {
    return this.regressionManager;
  }

  getParameters() {
    return this.parameters;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegressionUI;
}
