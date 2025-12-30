// ============================================================================
// Trainer UI - Main Controller
// ============================================================================
// Ties together gesture management, data collection, and visualization
// ============================================================================

let gestureManager;
let dataCollector;
let visualizer;
let bridge;

// Color tab components
let colorDataCollector;
let colorVisualizer;

// ML Training components
let dataProcessor;
let modelBuilder;
let mlTrainer;
let trainingUI;

// Tab management
let tabMgr;

// Device connection
let connectedDeviceId = null;

// UI State
let currentRecordingGesture = null;
let currentRecordingColor = null;
let currentRenameColor = null;

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Trainer UI Loading...');

  // Get device ID from URL parameter (passed from main page)
  const params = new URLSearchParams(window.location.search);
  connectedDeviceId = params.get('device') || 'device_1';

  // Initialize tab manager first
  tabMgr = new TabManager();
  window.tabManager = tabMgr; // Make globally accessible

  // Initialize components
  gestureManager = new GestureManager();
  bridge = new BLEBridge();
  dataCollector = new DataCollector(bridge, gestureManager);
  visualizer = new IMUVisualizer('preview-canvas');

  // Initialize color components
  colorDataCollector = new ColorDataCollector(bridge, gestureManager);
  colorVisualizer = new ColorVisualizer('color-swatch', 'color-values');

  // Connect color data collector to visualizer
  colorDataCollector.on('colorUpdate', (data) => {
    colorVisualizer.updateColor(data.r, data.g, data.b, data.c, data.p);
  });

  // Initialize ML components
  dataProcessor = new DataProcessor();
  modelBuilder = new ModelBuilder();
  mlTrainer = new MLTrainer(dataProcessor, modelBuilder);
  trainingUI = new TrainingUI(mlTrainer);

  // Setup event listeners
  setupEventListeners();
  setupGestureManagerListeners();
  setupDataCollectorListeners();
  setupTabListeners();
  setupBridgeListeners();
  setupColorEventListeners();
  setupAudioEventListeners();

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

    // Determine model type from training data
    const dataType = mlTrainer.trainingData?.dataType || 'gesture';
    const modelType = dataType === 'color' ? 'color' : 'gesture';

    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelType}-model-${Date.now()}.json`;
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
    
    // Get gesture/color labels
    const labels = gestureManager.getAllGestures().map(g => g.name);

    // Detect data type
    const dataType = mlTrainer.trainingData?.dataType || 'imu';

    // Create Arduino generator
    const generator = new ArduinoModelGenerator();

    // Convert model (this prepares the model data)
    await generator.convertToTFLite(mlTrainer.model, labels, dataType);
    
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
    const modelType = dataType === 'color' ? 'color' : 'gesture';

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelType}_model_${Date.now()}.zip`;
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

  // Detect data type from training data
  const dataType = mlTrainer.trainingData?.dataType || 'imu';

  // Use appropriate data collector based on model type
  let currentData;
  if (dataType === 'color') {
    currentData = colorDataCollector.getCurrentBuffer();
  } else if (dataType === 'audio') {
    currentData = audioDataCollector ? audioDataCollector.getCurrentBuffer() : null;
  } else {
    // IMU or default
    currentData = dataCollector.getCurrentBuffer();
  }

  if (!currentData || currentData.length === 0) {
    return; // No data yet
  }

  // Get actual sample size from model's input shape (most reliable)
  let targetSize;
  if (mlTrainer.model) {
    // Get input shape from the model itself
    const inputShape = mlTrainer.model.inputs[0].shape;
    targetSize = inputShape[1]; // [null, inputSize] -> get inputSize
    console.log(`🔍 Model expects input size: ${targetSize}`);
  } else if (mlTrainer.trainingData?.data?.length > 0) {
    // Fallback: use actual sample size from first training sample
    targetSize = mlTrainer.trainingData.data[0].xs.length;
  } else {
    // Last resort: defaults based on data type
    if (dataType === 'color') {
      targetSize = 250; // Color: 50 frames × 5 channels (can be 500 for 100 frames)
    } else if (dataType === 'audio') {
      targetSize = 1024; // Audio: common FFT size (will be overridden by actual data)
    } else {
      targetSize = 900; // IMU: 100 frames × 9 axes
    }
  }

  // Calculate minimum required data (60% of target)
  const minValues = Math.ceil(targetSize * 0.6);

  if (currentData.length < minValues) {
    return; // Not enough data yet
  }

  // Run prediction with available data
  try {
    // Pad to target size if needed, or use last N values if more
    let sample;
    if (currentData.length < targetSize) {
      // Pad with zeros to reach target size
      sample = [...currentData];
      while (sample.length < targetSize) {
        sample.push(0);
      }
    } else {
      // Use last target size values
      sample = currentData.slice(-targetSize);
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

// ============================================================================
// Tab Management Listeners
// ============================================================================

function setupTabListeners() {
  if (!tabMgr) {
    console.error('❌ TabManager not initialized');
    return;
  }

  // Listen to tab changes
  tabMgr.onTabChange((newTab, previousTab) => {
    console.log(`📑 Tab changed: ${previousTab} → ${newTab}`);

    // Stop any ongoing data collection when switching tabs
    if (dataCollector && dataCollector.isCapturing) {
      dataCollector.stopCapture();
    }

    // Update BLE streaming mode (handled in TabManager)
    // Additional tab-specific setup can go here

    // Show toast notification
    const tabNames = {
      'imu': 'IMU Gestures',
      'color': 'Color Recognition',
      'audio': 'Sound Classification'
    };

    if (typeof toast !== 'undefined') {
      toast.info(`Switched to ${tabNames[newTab]}`);
    }
  });

  console.log('✅ Tab listeners configured');
}

// ============================================================================
// Color Tab Event Listeners (Placeholder)
// ============================================================================

function setupColorEventListeners() {
  // Add Color button
  const addColorBtn = document.getElementById('add-color-btn');
  if (addColorBtn) {
    addColorBtn.addEventListener('click', () => {
      openAddColorModal();
    });
  }

  // Add color modal buttons
  document.getElementById('close-color-modal').addEventListener('click', closeAddColorModal);
  document.getElementById('cancel-color-btn').addEventListener('click', closeAddColorModal);
  document.getElementById('create-color-btn').addEventListener('click', createColor);

  // Enter key in color name input
  document.getElementById('color-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createColor();
    }
  });

  // Rename color modal buttons
  document.getElementById('close-rename-color-modal').addEventListener('click', closeRenameColorModal);
  document.getElementById('cancel-rename-color-btn').addEventListener('click', closeRenameColorModal);
  document.getElementById('save-rename-color-btn').addEventListener('click', saveColorRename);

  // Color capture settings
  document.getElementById('color-samples-per-class').addEventListener('change', (e) => {
    gestureManager.setSamplesPerGesture(parseInt(e.target.value));
    updateColorCards();
  });

  document.getElementById('color-frames-per-sample').addEventListener('change', (e) => {
    colorDataCollector.setFramesTarget(parseInt(e.target.value));
  });

  // Setup color data collector event listeners
  setupColorDataCollectorListeners();

  // Close modals on background click
  document.getElementById('add-color-modal').addEventListener('click', (e) => {
    if (e.target.id === 'add-color-modal') closeAddColorModal();
  });
  document.getElementById('rename-color-modal').addEventListener('click', (e) => {
    if (e.target.id === 'rename-color-modal') closeRenameColorModal();
  });

  // Load/Export/Train buttons for color
  const loadColorBtn = document.getElementById('load-color-data-btn');
  if (loadColorBtn) {
    loadColorBtn.addEventListener('click', loadColorTrainingData);
  }

  const exportColorBtn = document.getElementById('export-color-data-btn');
  if (exportColorBtn) {
    exportColorBtn.addEventListener('click', exportColorTrainingData);
  }

  const trainColorBtn = document.getElementById('train-color-model-btn');
  if (trainColorBtn) {
    trainColorBtn.addEventListener('click', startColorTraining);
  }

  // Hidden file input for loading color data
  document.getElementById('load-color-data-input').addEventListener('change', handleLoadColorDataFile);

  console.log('✅ Color event listeners configured');
}

function setupColorDataCollectorListeners() {
  colorDataCollector.on('captureStarted', (data) => {
    console.log('🎨 Color capture started');
    currentRecordingColor = data.color;
    updateColorCaptureStatus('recording', 'Recording...', 0);
    updateColorCardRecording(data.color, true);
  });

  colorDataCollector.on('frameCollected', (data) => {
    updateColorCaptureStatus('recording', 'Recording...', data.progress);
    document.getElementById('color-frame-count').textContent = `${data.frame} / ${data.total}`;
  });

  colorDataCollector.on('captureCompleted', (data) => {
    console.log('✅ Color sample captured');
    currentRecordingColor = null;
    updateColorCaptureStatus('ready', 'Ready', 0);
    updateColorCardRecording(data.color, false);

    // IMPORTANT: Update the card to show new sample count
    updateColorCard(data.color);
    updateColorTrainingInfo();

    // Check if color is complete
    if (gestureManager.isSamplesFull(data.color)) {
      showNotification(`✅ "${data.color}" complete! (${data.sampleCount} samples)`, 'success');
    }
  });

  colorDataCollector.on('captureFailed', (data) => {
    console.error('❌ Color capture failed:', data.error);
    if (currentRecordingColor) {
      updateColorCardRecording(currentRecordingColor, false);
    }
    currentRecordingColor = null;
    updateColorCaptureStatus('ready', 'Ready', 0);
    showNotification(`❌ Capture failed: ${data.error}`, 'error');
  });

  colorDataCollector.on('captureCancelled', (data) => {
    console.log('⚠️ Color capture cancelled');
    if (data.color) {
      updateColorCardRecording(data.color, false);
    }
    if (currentRecordingColor) {
      updateColorCardRecording(currentRecordingColor, false);
    }
    currentRecordingColor = null;
    updateColorCaptureStatus('ready', 'Ready', 0);
  });
}

// ============================================================================
// Audio Tab Event Listeners (Placeholder)
// ============================================================================

function setupAudioEventListeners() {
  // Enable Microphone button
  const enableMicBtn = document.getElementById('enable-mic-btn');
  if (enableMicBtn) {
    enableMicBtn.addEventListener('click', async () => {
      console.log('🎤 Enable Microphone button clicked');

      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('✅ Microphone access granted');

        // Hide overlay, show mic is active
        const overlay = document.getElementById('audio-preview-overlay');
        if (overlay) {
          overlay.style.display = 'none';
        }

        toast.success('Microphone enabled!');

        // TODO: Initialize audio visualization
        // TODO: Setup audio data collector

      } catch (error) {
        console.error('❌ Microphone access denied:', error);
        toast.error('Microphone access denied. Please allow microphone permissions.');
      }
    });
  }

  // Add Sound button
  const addSoundBtn = document.getElementById('add-sound-btn');
  if (addSoundBtn) {
    addSoundBtn.addEventListener('click', () => {
      console.log('🎵 Add Sound button clicked');
      toast.info('Audio tab functionality coming soon!');
      // TODO: Show add sound modal
    });
  }

  // Load/Export/Train buttons for audio
  const loadAudioBtn = document.getElementById('load-audio-data-btn');
  if (loadAudioBtn) {
    loadAudioBtn.addEventListener('click', () => {
      toast.info('Load audio data - coming soon!');
    });
  }

  const exportAudioBtn = document.getElementById('export-audio-data-btn');
  if (exportAudioBtn) {
    exportAudioBtn.addEventListener('click', () => {
      toast.info('Export audio data - coming soon!');
    });
  }

  const trainAudioBtn = document.getElementById('train-audio-model-btn');
  if (trainAudioBtn) {
    trainAudioBtn.addEventListener('click', () => {
      toast.info('Train audio model - coming soon!');
    });
  }

  console.log('✅ Audio event listeners configured');
}

// ============================================================================
// Color Modal Functions
// ============================================================================

function openAddColorModal() {
  document.getElementById('add-color-modal').classList.add('active');
  document.getElementById('color-name-input').value = '';
  document.getElementById('color-name-input').focus();
}

function closeAddColorModal() {
  document.getElementById('add-color-modal').classList.remove('active');
}

function createColor() {
  const input = document.getElementById('color-name-input');
  const name = input.value.trim();

  if (!name) {
    alert('Please enter a color name');
    return;
  }

  try {
    gestureManager.addGesture(name);
    closeAddColorModal();
    addColorCard({ name });
    updateColorTrainingInfo();
    showNotification(`✅ Color "${name}" added`, 'success');
  } catch (error) {
    alert(error.message);
  }
}

function closeRenameColorModal() {
  document.getElementById('rename-color-modal').classList.remove('active');
  currentRenameColor = null;
}

function saveColorRename() {
  const input = document.getElementById('rename-color-input');
  const newName = input.value.trim();

  if (!newName) {
    alert('Please enter a name');
    return;
  }

  try {
    gestureManager.renameGesture(currentRenameColor, newName);
    updateColorCard(newName);
    closeRenameColorModal();
    showNotification(`Renamed to "${newName}"`, 'info');
  } catch (error) {
    alert(error.message);
  }
}

// ============================================================================
// Color Card Management
// ============================================================================

function addColorCard(color) {
  const grid = document.getElementById('colors-grid');
  const emptyState = document.getElementById('colors-empty-state');

  // Hide empty state
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  const card = document.createElement('div');
  card.className = 'gesture-card'; // Reuse gesture card styles
  card.id = `color-${color.name}`;
  card.innerHTML = `
    <div class="gesture-header">
      <div class="gesture-name">${color.name}</div>
      <div class="gesture-menu">
        <button class="menu-btn" onclick="toggleColorMenu('${color.name}')">⋮</button>
        <div class="menu-dropdown" id="color-menu-${color.name}">
          <button onclick="renameColor('${color.name}')">Rename</button>
          <button onclick="clearColorSamples('${color.name}')">Clear Samples</button>
          <button class="danger" onclick="deleteColor('${color.name}')">Delete</button>
        </div>
      </div>
    </div>

    <div class="gesture-info">
      <div class="info-item">
        <div class="info-label">Samples</div>
        <div class="info-value" id="color-samples-${color.name}">0</div>
      </div>
      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="info-value">${gestureManager.samplesPerGesture}</div>
      </div>
    </div>

    <div class="sample-progress">
      <div class="progress-label">
        <span>Progress</span>
        <span id="color-progress-text-${color.name}">0%</span>
      </div>
      <div class="progress-bar-gesture">
        <div class="progress-fill-gesture" id="color-progress-${color.name}" style="width: 0%"></div>
      </div>
    </div>

    <div class="gesture-actions">
      <button onclick="recordColor('${color.name}')">
        📹 Record Sample
      </button>
    </div>
  `;

  // Click to select
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.gesture-menu') && !e.target.closest('.gesture-actions')) {
      selectColor(color.name);
    }
  });

  grid.appendChild(card);
}

function removeColorCard(name) {
  const card = document.getElementById(`color-${name}`);
  if (card) {
    card.remove();
  }

  // Show empty state if no colors
  if (gestureManager.getAllGestures().length === 0) {
    document.getElementById('colors-empty-state').style.display = 'block';
  }
}

function updateColorCard(name) {
  const gesture = gestureManager.getGesture(name);
  if (!gesture) return;

  const sampleCount = gesture.samples.length;
  const target = gestureManager.samplesPerGesture;
  const progress = (sampleCount / target) * 100;

  // Update count
  const countEl = document.getElementById(`color-samples-${name}`);
  if (countEl) {
    countEl.textContent = sampleCount;
    countEl.className = sampleCount >= target ? 'info-value complete' : 'info-value';
  }

  // Update progress bar
  const progressEl = document.getElementById(`color-progress-${name}`);
  if (progressEl) {
    progressEl.style.width = `${Math.min(progress, 100)}%`;
  }

  const progressTextEl = document.getElementById(`color-progress-text-${name}`);
  if (progressTextEl) {
    progressTextEl.textContent = `${Math.round(progress)}%`;
  }
}

function updateColorCards() {
  gestureManager.getAllGestures().forEach(g => {
    updateColorCard(g.name);
  });
}

function rebuildColorCards() {
  // Clear existing cards
  const container = document.getElementById('colors-grid');
  if (!container) return;

  // Remove all color cards (but keep empty state)
  const cards = container.querySelectorAll('.gesture-card');
  cards.forEach(card => card.remove());

  // Add card for each color
  gestureManager.getAllGestures().forEach(color => {
    addColorCard(color);
    // Update card with current sample count
    updateColorCard(color.name);
  });

  // Hide empty state if we have colors
  if (gestureManager.getAllGestures().length > 0) {
    document.getElementById('colors-empty-state').style.display = 'none';
  }
}

function updateColorSelection(name) {
  // Remove selected class from all cards
  document.querySelectorAll('#colors-grid .gesture-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Add selected class to current
  const card = document.getElementById(`color-${name}`);
  if (card) {
    card.classList.add('selected');
  }

  // Set data collector color
  colorDataCollector.selectColor(name);
}

function updateColorCardRecording(name, isRecording) {
  const card = document.getElementById(`color-${name}`);
  if (card) {
    if (isRecording) {
      card.classList.add('recording');
    } else {
      card.classList.remove('recording');
    }
  }
}

// ============================================================================
// Color Actions (called from HTML onclick)
// ============================================================================

window.selectColor = function(name) {
  updateColorSelection(name);
};

window.recordColor = function(name) {
  // Select color
  updateColorSelection(name);

  // Check if already full
  if (gestureManager.isSamplesFull(name)) {
    showNotification(`"${name}" already has maximum samples. Delete some samples first.`, 'warning');
    return;
  }

  // Trigger capture
  colorDataCollector.startCapture();
};

window.toggleColorMenu = function(name) {
  const menu = document.getElementById(`color-menu-${name}`);

  // Close all other menus
  document.querySelectorAll('.menu-dropdown').forEach(m => {
    if (m.id !== `color-menu-${name}`) {
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

window.renameColor = function(oldName) {
  currentRenameColor = oldName;
  document.getElementById('rename-color-input').value = oldName;
  document.getElementById('rename-color-modal').classList.add('active');
  document.getElementById('rename-color-input').focus();
};

window.clearColorSamples = function(name) {
  if (confirm(`Clear all samples for "${name}"?`)) {
    const gesture = gestureManager.getGesture(name);
    gesture.samples = [];
    updateColorCard(name);
    updateColorTrainingInfo();
    showNotification(`Samples cleared for "${name}"`, 'info');
  }
};

window.deleteColor = function(name) {
  if (confirm(`Delete color "${name}" and all its samples?`)) {
    gestureManager.removeGesture(name);
    removeColorCard(name);
    updateColorTrainingInfo();
    showNotification(`Color "${name}" deleted`, 'info');
  }
};

// ============================================================================
// Color Capture Status
// ============================================================================

function updateColorCaptureStatus(state, text, progress) {
  const statusEl = document.getElementById('color-status-text');
  const progressEl = document.getElementById('color-progress-fill');
  const overlayEl = document.getElementById('color-preview-overlay');

  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = `status-text ${state}`;
  }

  if (progressEl) {
    progressEl.style.width = `${progress}%`;
  }

  if (overlayEl) {
    if (state === 'recording') {
      overlayEl.style.display = 'none';
    } else {
      // Don't show overlay for color - we want to see live preview
      overlayEl.style.display = 'none';
    }
  }
}

// ============================================================================
// Color Training Info
// ============================================================================

function updateColorTrainingInfo() {
  const info = gestureManager.getTrainingInfo();
  const infoEl = document.getElementById('color-training-info-text');
  const exportBtn = document.getElementById('export-color-data-btn');
  const trainBtn = document.getElementById('train-color-model-btn');

  if (!infoEl || !exportBtn || !trainBtn) return;

  if (info.readyForTraining) {
    infoEl.textContent = `Ready to train! ${info.totalSamples} samples across ${info.numGestures} colors`;
    exportBtn.disabled = false;
    trainBtn.disabled = false;
  } else if (info.numGestures < 2) {
    infoEl.textContent = `Add at least 2 colors to train`;
    exportBtn.disabled = true;
    trainBtn.disabled = true;
  } else {
    infoEl.textContent = `Collect more samples (${info.totalSamples}/${info.targetSamples})`;
    exportBtn.disabled = true;
    trainBtn.disabled = true;
  }
}

// ============================================================================
// Color Data Load/Export
// ============================================================================

function loadColorTrainingData() {
  // Trigger the hidden file input
  document.getElementById('load-color-data-input').click();
}

function handleLoadColorDataFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const jsonData = JSON.parse(e.target.result);

      // Validate JSON structure
      if (!jsonData.gestures || !Array.isArray(jsonData.gestures)) {
        throw new Error('Invalid color training data format: missing gestures array');
      }

      // Clear existing colors
      const existingGestures = gestureManager.getAllGestures();
      existingGestures.forEach(g => {
        removeColorCard(g.name);
      });
      gestureManager.clearAll();

      // Load colors and samples
      let totalSamples = 0;
      jsonData.gestures.forEach(color => {
        // Add color
        gestureManager.addGesture(color.name);

        // Add samples
        if (color.samples && Array.isArray(color.samples)) {
          color.samples.forEach(sampleItem => {
            // Handle different formats
            let sampleData;

            if (Array.isArray(sampleItem)) {
              sampleData = sampleItem;
            } else if (sampleItem && sampleItem.data && Array.isArray(sampleItem.data)) {
              sampleData = sampleItem.data;
            } else {
              console.warn('⚠️ Skipping invalid sample:', sampleItem);
              return;
            }

            // Validate sample length for color data
            // Accept common color sample sizes: 250 (50 frames × 5), 500 (100 frames × 5)
            // Must be divisible by 5 (color channels: R, G, B, Clear, Proximity)
            if (sampleData.length % 5 !== 0) {
              console.warn(`⚠️ Skipping sample with invalid length: ${sampleData.length} (must be divisible by 5)`);
              return;
            }

            gestureManager.addSample(color.name, sampleData);
            totalSamples++;
          });
        }
      });

      // Rebuild all color cards with sample counts
      rebuildColorCards();

      // Update UI after DOM is ready
      setTimeout(() => {
        gestureManager.getAllGestures().forEach(color => {
          updateColorCard(color.name);
        });
        updateColorTrainingInfo();
      }, 100);

      showNotification(`✅ Loaded ${jsonData.gestures.length} colors with ${totalSamples} total samples`, 'success');
      console.log('✅ Color training data loaded successfully');

    } catch (error) {
      console.error('❌ Failed to load color data:', error);
      showNotification(`❌ Failed to load data: ${error.message}`, 'error');
    }

    // Reset file input
    event.target.value = '';
  };

  reader.onerror = function() {
    showNotification('❌ Failed to read file', 'error');
  };

  reader.readAsText(file);
}

function exportColorTrainingData() {
  try {
    const data = gestureManager.getTrainingData();

    // Update metadata for color data
    data.metadata.dataType = 'color';
    data.metadata.dataLength = 250; // 50 frames × 5 channels
    data.metadata.axes = 5; // R, G, B, Clear, Proximity
    data.metadata.channels = ['red', 'green', 'blue', 'clear', 'proximity'];
    data.metadata.framesPerSample = 50;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `color-training-data-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);

    showNotification('✅ Color training data exported', 'success');
    console.log('✅ Color data exported successfully');

  } catch (error) {
    console.error('❌ Export failed:', error);
    showNotification(`❌ Export failed: ${error.message}`, 'error');
  }
}

// ============================================================================
// Color Model Training
// ============================================================================

async function startColorTraining() {
  try {
    console.log('🚀 Starting color training...');

    // Validate we have enough data
    if (!gestureManager.isReadyForTraining()) {
      showNotification('⚠️ Not enough training data. Need at least 2 colors with sufficient samples.', 'warning');
      return;
    }

    // Get training configuration
    const config = {
      preset: 'balanced',
      epochs: 50,
      batchSize: 16,
      learningRate: 0.001,
      dataType: 'color', // Important: tells the system this is color data
    };

    // Start training using the existing MLTrainer
    await mlTrainer.train(gestureManager, config);

    console.log('✅ Color model training complete');

  } catch (error) {
    console.error('❌ Color training failed:', error);
    showNotification(`❌ Training failed: ${error.message}`, 'error');
  }
}
