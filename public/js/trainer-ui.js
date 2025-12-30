// ============================================================================
// Trainer UI - Main Controller
// ============================================================================
// Ties together gesture management, data collection, and visualization
// ============================================================================

let gestureManager;
let dataCollector;
let visualizer;
let bridge;

// ML Training components
let dataProcessor;
let modelBuilder;
let mlTrainer;
let trainingUI;

// Device connection
let connectedDeviceId = null;

// UI State
let currentRecordingGesture = null;

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Trainer UI Loading...');
  
  // Get device ID from URL parameter (passed from main page)
  const params = new URLSearchParams(window.location.search);
  connectedDeviceId = params.get('device') || 'device_1';
  
  // Initialize components
  gestureManager = new GestureManager();
  bridge = new BLEBridge();
  dataCollector = new DataCollector(bridge, gestureManager);
  visualizer = new IMUVisualizer('preview-canvas');
  
  // Initialize ML components
  dataProcessor = new DataProcessor();
  modelBuilder = new ModelBuilder();
  mlTrainer = new MLTrainer(dataProcessor, modelBuilder);
  trainingUI = new TrainingUI(mlTrainer);
  
  // Setup event listeners
  setupEventListeners();
  setupGestureManagerListeners();
  setupDataCollectorListeners();
  setupBridgeListeners();
  
  // Update UI
  updateDeviceStatus();
  updateTrainingInfo();
  
  console.log('✅ Trainer UI Ready');
  console.log('📱 Connected device:', connectedDeviceId);
});

// ============================================================================
// Event Listeners Setup
// ============================================================================

function setupEventListeners() {
  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // Add gesture button
  document.getElementById('add-gesture-btn').addEventListener('click', () => {
    openAddGestureModal();
  });
  
  // Add gesture modal
  document.getElementById('close-gesture-modal').addEventListener('click', closeAddGestureModal);
  document.getElementById('cancel-gesture-btn').addEventListener('click', closeAddGestureModal);
  document.getElementById('create-gesture-btn').addEventListener('click', createGesture);
  
  // Enter key in gesture name input
  document.getElementById('gesture-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createGesture();
    }
  });
  
  // Rename gesture modal
  document.getElementById('close-rename-modal').addEventListener('click', closeRenameModal);
  document.getElementById('cancel-rename-btn').addEventListener('click', closeRenameModal);
  document.getElementById('save-rename-btn').addEventListener('click', saveRename);
  
  // Capture settings
  document.getElementById('samples-per-gesture').addEventListener('change', (e) => {
    gestureManager.setSamplesPerGesture(parseInt(e.target.value));
    updateGestureCards();
  });
  
  document.getElementById('frames-per-sample').addEventListener('change', (e) => {
    gestureManager.setFramesPerSample(parseInt(e.target.value));
  });
  
  // Training actions
  document.getElementById('load-data-btn').addEventListener('click', loadTrainingData);
  document.getElementById('export-data-btn').addEventListener('click', exportTrainingData);
  document.getElementById('train-model-btn').addEventListener('click', startTraining);
  
  // Hidden file input
  document.getElementById('load-data-input').addEventListener('change', handleLoadDataFile);
  
  // Training modal
  document.getElementById('close-training-modal-x').addEventListener('click', closeTrainingModal);
  document.getElementById('close-training-btn').addEventListener('click', closeTrainingModal);
  document.getElementById('stop-training-btn').addEventListener('click', stopTraining);
  document.getElementById('export-model-btn').addEventListener('click', exportModel);
  document.getElementById('download-model-btn').addEventListener('click', downloadModelForArduino);
  
  // Testing controls
  document.getElementById('start-testing-btn').addEventListener('click', startTesting);
  document.getElementById('stop-testing-btn').addEventListener('click', stopTesting);
  
  // Close modals on background click
  document.getElementById('add-gesture-modal').addEventListener('click', (e) => {
    if (e.target.id === 'add-gesture-modal') closeAddGestureModal();
  });
  document.getElementById('rename-gesture-modal').addEventListener('click', (e) => {
    if (e.target.id === 'rename-gesture-modal') closeRenameModal();
  });
}

function setupGestureManagerListeners() {
  gestureManager.on('gestureAdded', (gesture) => {
    addGestureCard(gesture);
    updateTrainingInfo();
  });
  
  gestureManager.on('gestureRemoved', (gesture) => {
    removeGestureCard(gesture.name);
    updateTrainingInfo();
  });
  
  gestureManager.on('allGesturesCleared', () => {
    // Clear all gesture cards from UI
    const container = document.getElementById('gestures-grid');
    if (container) {
      container.innerHTML = '';
    }
    updateTrainingInfo();
  });
  
  gestureManager.on('gestureRenamed', ({ oldName, newName }) => {
    updateGestureCard(newName);
  });
  
  gestureManager.on('sampleAdded', ({ gestureName }) => {
    updateGestureCard(gestureName);
    updateTrainingInfo();
  });
  
  gestureManager.on('gestureSelected', (name) => {
    updateGestureSelection(name);
  });
}

function setupDataCollectorListeners() {
  dataCollector.on('captureStarted', (data) => {
    console.log('🎬 Capture started');
    currentRecordingGesture = data.gesture;
    updateCaptureStatus('recording', 'Recording...', 0);
    visualizer.clearBuffer();
    updateGestureCardRecording(data.gesture, true);
  });
  
  dataCollector.on('frameCollected', (data) => {
    updateCaptureStatus('recording', 'Recording...', data.progress);
    document.getElementById('frame-count').textContent = `${data.frame} / ${data.total} frames`;
    
    // Update visualizer with 9-axis data
    visualizer.addFrame(
      data.data.ax, data.data.ay, data.data.az,
      data.data.gx, data.data.gy, data.data.gz,
      data.data.mx, data.data.my, data.data.mz
    );
  });
  
  dataCollector.on('captureCompleted', (data) => {
    console.log('✅ Sample captured');
    currentRecordingGesture = null;
    updateCaptureStatus('ready', 'Ready', 0);
    updateGestureCardRecording(data.gesture, false);
    
    // Check if gesture is complete
    if (gestureManager.isSamplesFull(data.gesture)) {
      showNotification(`✅ "${data.gesture}" complete! (${data.sampleCount} samples)`, 'success');
    }
  });
  
  dataCollector.on('captureFailed', (data) => {
    console.error('❌ Capture failed:', data.error);
    if (currentRecordingGesture) {
      updateGestureCardRecording(currentRecordingGesture, false);
    }
    currentRecordingGesture = null;
    updateCaptureStatus('ready', 'Ready', 0);
    showNotification(`❌ Capture failed: ${data.error}`, 'error');
  });
}

function setupBridgeListeners() {
  bridge.onStatus('*', (status, port, deviceId) => {
    updateDeviceStatus(status === 'connected');
  });
}

// ============================================================================
// Gesture Card Management
// ============================================================================

function addGestureCard(gesture) {
  const grid = document.getElementById('gestures-grid');
  const emptyState = document.getElementById('gestures-empty-state');
  
  // Hide empty state
  if (emptyState) {
    emptyState.style.display = 'none';
  }
  
  const card = document.createElement('div');
  card.className = 'gesture-card';
  card.id = `gesture-${gesture.name}`;
  card.innerHTML = `
    <div class="gesture-header">
      <div class="gesture-name">${gesture.name}</div>
      <div class="gesture-menu">
        <button class="menu-btn" onclick="toggleGestureMenu('${gesture.name}')">⋮</button>
        <div class="menu-dropdown" id="menu-${gesture.name}">
          <button onclick="renameGesture('${gesture.name}')">Rename</button>
          <button onclick="clearGestureSamples('${gesture.name}')">Clear Samples</button>
          <button class="danger" onclick="deleteGesture('${gesture.name}')">Delete</button>
        </div>
      </div>
    </div>
    
    <div class="gesture-info">
      <div class="info-item">
        <div class="info-label">Samples</div>
        <div class="info-value" id="samples-${gesture.name}">0</div>
      </div>
      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="info-value">${gestureManager.samplesPerGesture}</div>
      </div>
    </div>
    
    <div class="sample-progress">
      <div class="progress-label">
        <span>Progress</span>
        <span id="progress-text-${gesture.name}">0%</span>
      </div>
      <div class="progress-bar-gesture">
        <div class="progress-fill-gesture" id="progress-${gesture.name}" style="width: 0%"></div>
      </div>
    </div>
    
    <div class="gesture-actions">
      <button onclick="recordGesture('${gesture.name}')">
        📹 Record Sample
      </button>
    </div>
  `;
  
  // Click to select
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.gesture-menu') && !e.target.closest('.gesture-actions')) {
      selectGesture(gesture.name);
    }
  });
  
  grid.appendChild(card);
}

function removeGestureCard(name) {
  const card = document.getElementById(`gesture-${name}`);
  if (card) {
    card.remove();
  }
  
  // Show empty state if no gestures
  if (gestureManager.getAllGestures().length === 0) {
    document.getElementById('gestures-empty-state').style.display = 'block';
  }
}

function updateGestureCard(name) {
  const gesture = gestureManager.getGesture(name);
  if (!gesture) return;
  
  const sampleCount = gesture.samples.length;
  const target = gestureManager.samplesPerGesture;
  const progress = (sampleCount / target) * 100;
  
  // Update count
  const countEl = document.getElementById(`samples-${name}`);
  if (countEl) {
    countEl.textContent = sampleCount;
    countEl.className = sampleCount >= target ? 'info-value complete' : 'info-value';
  }
  
  // Update progress bar
  const progressEl = document.getElementById(`progress-${name}`);
  if (progressEl) {
    progressEl.style.width = `${Math.min(progress, 100)}%`;
  }
  
  const progressTextEl = document.getElementById(`progress-text-${name}`);
  if (progressTextEl) {
    progressTextEl.textContent = `${Math.round(progress)}%`;
  }
}

function updateGestureCards() {
  gestureManager.getAllGestures().forEach(g => {
    updateGestureCard(g.name);
  });
}

function rebuildGestureCards() {
  // Clear existing cards
  const container = document.getElementById('gestures-grid');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Add card for each gesture
  gestureManager.getAllGestures().forEach(gesture => {
    addGestureCard(gesture);
    // Update card with current sample count
    updateGestureCard(gesture.name);
  });
}

function updateGestureSelection(name) {
  // Remove selected class from all cards
  document.querySelectorAll('.gesture-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Add selected class to current
  const card = document.getElementById(`gesture-${name}`);
  if (card) {
    card.classList.add('selected');
  }
  
  // Set data collector gesture
  dataCollector.setGesture(name);
}

function updateGestureCardRecording(name, isRecording) {
  const card = document.getElementById(`gesture-${name}`);
  if (card) {
    if (isRecording) {
      card.classList.add('recording');
    } else {
      card.classList.remove('recording');
    }
  }
}

// ============================================================================
// Gesture Actions (called from HTML)
// ============================================================================

window.selectGesture = function(name) {
  gestureManager.selectGesture(name);
};

window.recordGesture = function(name) {
  // Select gesture
  gestureManager.selectGesture(name);
  
  // Check if already full
  if (gestureManager.isSamplesFull(name)) {
    showNotification(`"${name}" already has maximum samples. Delete some samples first.`, 'warning');
    return;
  }
  
  // Trigger capture
  dataCollector.manualTrigger();
};

window.toggleGestureMenu = function(name) {
  const menu = document.getElementById(`menu-${name}`);
  
  // Close all other menus
  document.querySelectorAll('.menu-dropdown').forEach(m => {
    if (m.id !== `menu-${name}`) {
      m.classList.remove('active');
    }
  });
  
  menu.classList.toggle('active');
  
  // Close on click outside
  if (menu.classList.contains('active')) {
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!e.target.closest('.gesture-menu')) {
          menu.classList.remove('active');
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }
};

window.renameGesture = function(oldName) {
  currentRenameGesture = oldName;
  document.getElementById('rename-gesture-input').value = oldName;
  document.getElementById('rename-gesture-modal').classList.add('active');
  document.getElementById('rename-gesture-input').focus();
};

window.clearGestureSamples = function(name) {
  if (confirm(`Clear all samples for "${name}"?`)) {
    const gesture = gestureManager.getGesture(name);
    gesture.samples = [];
    updateGestureCard(name);
    updateTrainingInfo();
    showNotification(`Samples cleared for "${name}"`, 'info');
  }
};

window.deleteGesture = function(name) {
  if (confirm(`Delete gesture "${name}" and all its samples?`)) {
    gestureManager.removeGesture(name);
    showNotification(`Gesture "${name}" deleted`, 'info');
  }
};

// ============================================================================
// Modals
// ============================================================================

function openAddGestureModal() {
  document.getElementById('add-gesture-modal').classList.add('active');
  document.getElementById('gesture-name-input').value = '';
  document.getElementById('gesture-name-input').focus();
}

function closeAddGestureModal() {
  document.getElementById('add-gesture-modal').classList.remove('active');
}

function createGesture() {
  const input = document.getElementById('gesture-name-input');
  const name = input.value.trim();
  
  if (!name) {
    alert('Please enter a gesture name');
    return;
  }
  
  try {
    gestureManager.addGesture(name);
    closeAddGestureModal();
    showNotification(`✅ Gesture "${name}" added`, 'success');
  } catch (error) {
    alert(error.message);
  }
}

let currentRenameGesture = null;

function closeRenameModal() {
  document.getElementById('rename-gesture-modal').classList.remove('active');
  currentRenameGesture = null;
}

function saveRename() {
  const input = document.getElementById('rename-gesture-input');
  const newName = input.value.trim();
  
  if (!newName) {
    alert('Please enter a name');
    return;
  }
  
  try {
    gestureManager.renameGesture(currentRenameGesture, newName);
    updateGestureCard(newName);
    closeRenameModal();
    showNotification(`Renamed to "${newName}"`, 'info');
  } catch (error) {
    alert(error.message);
  }
}

// ============================================================================
// Capture Status
// ============================================================================

function updateCaptureStatus(state, text, progress) {
  const statusEl = document.getElementById('status-text');
  const progressEl = document.getElementById('progress-fill');
  const overlayEl = document.getElementById('preview-overlay');
  
  statusEl.textContent = text;
  statusEl.className = `status-text ${state}`;
  progressEl.style.width = `${progress}%`;
  
  if (state === 'recording') {
    overlayEl.classList.add('hidden');
  } else {
    overlayEl.classList.remove('hidden');
  }
}

// ============================================================================
// Device Status
// ============================================================================

function updateDeviceStatus(isConnected = true) {
  const dot = document.getElementById('device-status-dot');
  const nameEl = document.getElementById('device-name');
  
  if (isConnected) {
    dot.classList.add('connected');
    nameEl.textContent = connectedDeviceId;
  } else {
    dot.classList.remove('connected');
    nameEl.textContent = 'Disconnected';
  }
}

// ============================================================================
// Training Info
// ============================================================================

function updateTrainingInfo() {
  const info = gestureManager.getTrainingInfo();
  const infoEl = document.getElementById('training-info-text');
  const exportBtn = document.getElementById('export-data-btn');
  const trainBtn = document.getElementById('train-model-btn');
  
  if (info.readyForTraining) {
    infoEl.textContent = `Ready to train! ${info.totalSamples} samples across ${info.numGestures} gestures`;
    exportBtn.disabled = false;
    trainBtn.disabled = false;
  } else if (info.numGestures < 2) {
    infoEl.textContent = `Add at least 2 gestures to train`;
    exportBtn.disabled = true;
    trainBtn.disabled = true;
  } else {
    infoEl.textContent = `Collect more samples (${info.totalSamples}/${info.targetSamples})`;
    exportBtn.disabled = true;
    trainBtn.disabled = true;
  }
}

// ============================================================================
// Training Actions
// ============================================================================

// ============================================================================
// Data Import/Export
// ============================================================================

function loadTrainingData() {
  // Trigger the hidden file input
  document.getElementById('load-data-input').click();
}

function handleLoadDataFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const jsonData = JSON.parse(e.target.result);
      
      // Validate JSON structure
      if (!jsonData.gestures || !Array.isArray(jsonData.gestures)) {
        throw new Error('Invalid training data format: missing gestures array');
      }
      
      // Clear existing gestures
      gestureManager.clearAll();
      
      // Load gestures and samples
      let totalSamples = 0;
      jsonData.gestures.forEach(gesture => {
        // Add gesture
        gestureManager.addGesture(gesture.name);
        
        // Add samples
        if (gesture.samples && Array.isArray(gesture.samples)) {
          gesture.samples.forEach(sampleItem => {
            // Handle different formats:
            // Format 1: {data: [...], timestamp: ...} (from gestureManager.exportJSON)
            // Format 2: [...] (raw array)
            let sampleData;
            
            if (Array.isArray(sampleItem)) {
              // Format 2: Raw array
              sampleData = sampleItem;
            } else if (sampleItem && sampleItem.data && Array.isArray(sampleItem.data)) {
              // Format 1: Object with data field
              sampleData = sampleItem.data;
            } else {
              console.warn('⚠️ Skipping invalid sample:', sampleItem);
              return; // Skip this sample
            }
            
            // Validate sample length (should be 900 for 100 frames × 9 axes)
            if (sampleData.length !== 900) {
              console.warn(`⚠️ Skipping sample with invalid length: ${sampleData.length} (expected 900)`);
              return;
            }
            
            // Add sample to gesture manager
            // gestureManager.addSample expects just the data array
            gestureManager.addSample(gesture.name, sampleData);
            totalSamples++;
          });
        }
      });
      
      // Refresh UI
      rebuildGestureCards();
      updateTrainingInfo();
      
      // Show success toast
      toast.success(`Loaded ${jsonData.gestures.length} gestures with ${totalSamples} samples`, {
        title: 'Training Data Loaded',
        duration: 4000
      });
      
      console.log(`✅ Loaded training data: ${jsonData.gestures.length} gestures, ${totalSamples} samples`);
      
    } catch (error) {
      console.error('❌ Failed to load training data:', error);
      toast.error(`Failed to load: ${error.message}`, {
        title: 'Load Error',
        duration: 5000
      });
      alert(`Failed to load training data: ${error.message}`);
    }
    
    // Reset file input
    event.target.value = '';
  };
  
  reader.onerror = function() {
    toast.error('Failed to read file', {
      title: 'File Error',
      duration: 5000
    });
  };
  
  reader.readAsText(file);
}

function exportTrainingData() {
  const data = gestureManager.exportJSON();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-data-${Date.now()}.json`;
  a.click();
  
  // Show toast notification
  toast.success('Training data exported successfully', {
    title: 'Downloaded',
    duration: 3000
  });
  
  showNotification('✅ Training data exported', 'success');
}

// ============================================================================
// Training Actions
// ============================================================================

async function startTraining() {
  try {
    console.log('🚀 Starting training...');
    
    // Validate we have enough data
    if (!gestureManager.isReadyForTraining()) {
      alert('Not enough training data. Need at least 2 gestures with sufficient samples.');
      return;
    }
    
    // Get training configuration (use balanced preset)
    const config = {
      preset: 'balanced',
      epochs: 50,
      batchSize: 16,
      learningRate: 0.001,
    };
    
    // Start training
    await mlTrainer.train(gestureManager, config);
    
  } catch (error) {
    console.error('❌ Training failed:', error);
    alert(`Training failed: ${error.message}`);
  }
}

function stopTraining() {
  mlTrainer.stopTraining();
}

function closeTrainingModal() {
  const modal = document.getElementById('training-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function exportModel() {
  try {
    const modelJSON = await mlTrainer.exportModel();
    const blob = new Blob([modelJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesture-model-${Date.now()}.json`;
    a.click();
    
    // Show toast notification
    toast.success('Model exported as JSON', {
      title: 'Downloaded',
      duration: 3000
    });
    
    showNotification('✅ Model exported', 'success');
  } catch (error) {
    console.error('❌ Export failed:', error);
    toast.error(`Export failed: ${error.message}`, {
      title: 'Export Error',
      duration: 5000
    });
    alert(`Export failed: ${error.message}`);
  }
}

async function downloadModelForArduino() {
  if (!mlTrainer || !mlTrainer.model) {
    toast.error('No trained model available. Train a model first.', {
      title: 'Download Error',
      duration: 4000
    });
    return;
  }
  
  try {
    console.log('🚀 Generating Arduino package...');
    
    // Show loading toast
    toast.info('Generating Arduino code...', {
      title: 'Arduino Download',
      duration: 3000
    });
    
    // Get gesture labels
    const labels = gestureManager.getAllGestures().map(g => g.name);
    
    // Create Arduino generator
    const generator = new ArduinoModelGenerator();
    
    // Convert model (this prepares the model data)
    await generator.convertToTFLite(mlTrainer.model, labels);
    
    // Generate Arduino code files
    const files = generator.generateArduinoCode();
    
    // Create ZIP file
    const zip = new JSZip();
    
    // Add all files to ZIP
    for (const [filename, content] of Object.entries(files)) {
      zip.file(filename, content);
    }
    
    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Download ZIP file
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesture_model_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Downloaded Arduino package with ${Object.keys(files).length} files`, {
      title: 'Arduino Package Ready',
      duration: 5000
    });
    
    console.log('✅ Arduino package downloaded as ZIP');
    
  } catch (error) {
    console.error('❌ Arduino download failed:', error);
    toast.error(`Failed to generate Arduino package: ${error.message}`, {
      title: 'Download Error',
      duration: 5000
    });
  }
}

// Helper function to download text files
function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function trainModel() {
  // This is now replaced by startTraining()
  startTraining();
}

// ============================================================================
// Notifications
// ============================================================================

function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Could add toast notifications here
  // For now, just console log
}

// ============================================================================
// Testing Functionality
// ============================================================================

let isTestingActive = false;
let testingInterval = null;
let testingBuffer = [];
const TESTING_BUFFER_SIZE = 100; // Match training frame size

function startTesting() {
  if (isTestingActive) return;
  
  console.log('🧪 Starting testing mode...');
  isTestingActive = true;
  testingBuffer = [];
  
  // Update UI
  document.getElementById('start-testing-btn').style.display = 'none';
  document.getElementById('stop-testing-btn').style.display = 'block';
  document.getElementById('testing-status').textContent = 'Testing active - perform gestures!';
  document.getElementById('testing-status').classList.add('active');
  
  // Start collecting data and running predictions
  testingInterval = setInterval(runPrediction, 50); // 20Hz prediction rate (faster response)
  
  toast.info('Testing mode active - perform gestures!', {
    title: 'Testing Started',
    duration: 3000
  });
}

function stopTesting() {
  if (!isTestingActive) return;
  
  console.log('🛑 Stopping testing mode...');
  isTestingActive = false;
  
  if (testingInterval) {
    clearInterval(testingInterval);
    testingInterval = null;
  }
  
  // Update UI
  document.getElementById('start-testing-btn').style.display = 'block';
  document.getElementById('stop-testing-btn').style.display = 'none';
  document.getElementById('testing-status').textContent = 'Testing stopped';
  document.getElementById('testing-status').classList.remove('active');
  
  // Reset display
  document.getElementById('predicted-gesture').textContent = '—';
  document.getElementById('prediction-confidence').textContent = '—';
}

async function runPrediction() {
  if (!isTestingActive || !mlTrainer.model) return;
  
  // Get current IMU data from data collector
  const currentData = dataCollector.getCurrentBuffer();
  
  if (!currentData || currentData.length === 0) {
    return; // No data yet
  }
  
  // Use current buffer directly (already maintains 100 frames)
  // Minimum 60 frames required for reasonable prediction (reduced from 100)
  const minFrames = 60;
  const minValues = minFrames * 9; // 540 values
  
  if (currentData.length < minValues) {
    return; // Not enough data yet
  }
  
  // Run prediction with available data
  try {
    // Pad to 900 if needed, or use last 900 if more
    let sample;
    if (currentData.length < TESTING_BUFFER_SIZE * 9) {
      // Pad with zeros to reach 900
      sample = [...currentData];
      while (sample.length < TESTING_BUFFER_SIZE * 9) {
        sample.push(0);
      }
    } else {
      // Use last 900 values
      sample = currentData.slice(-TESTING_BUFFER_SIZE * 9);
    }
    
    const prediction = await mlTrainer.predict(sample);
    
    // Update UI via training UI controller
    trainingUI.updatePrediction(prediction);
    
  } catch (error) {
    console.error('❌ Prediction error:', error);
  }
}

// ============================================================================
// Debug
// ============================================================================

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.TRAINER_DEBUG = {
    gestureManager,
    dataCollector,
    visualizer,
    bridge,
  };
  console.log('🔧 Debug tools available at window.TRAINER_DEBUG');
}
