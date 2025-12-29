// ============================================================================
// Trainer UI - Main Controller
// ============================================================================
// Ties together gesture management, data collection, and visualization
// ============================================================================

let gestureManager;
let dataCollector;
let visualizer;
let bridge;

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
  document.getElementById('export-data-btn').addEventListener('click', exportTrainingData);
  document.getElementById('train-model-btn').addEventListener('click', trainModel);
  
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

function exportTrainingData() {
  const data = gestureManager.exportJSON();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-data-${Date.now()}.json`;
  a.click();
  
  showNotification('✅ Training data exported', 'success');
}

function trainModel() {
  // This will be implemented in Phase 3
  alert('Model training will be implemented in Phase 3!\n\nFor now, you can:\n- Export training data\n- Use it with TensorFlow.js\n- Train custom models');
  showNotification('⚠️ Training not yet implemented', 'warning');
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
