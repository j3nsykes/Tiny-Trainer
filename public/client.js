// ============================================================================
// BLE Tiny Motion Trainer - Client UI
// ============================================================================
// Manages the UI for BLE device connections and data visualization
// ============================================================================

let socket = null;
let connectedDevices = new Map(); // deviceId -> { name, status, profile, peripheral }
let discoveredDevices = new Map(); // peripheralId -> { name, id, rssi }
let isScanning = false;

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 BLE Motion Trainer Client Starting...');

    // Show server info only in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const serverInfo = document.getElementById('server-info');
        if (serverInfo) serverInfo.style.display = 'block';
    }

    // Initialize Socket.IO connection
    initializeSocket();

    // Setup UI event listeners
    setupEventListeners();

    // Check BLE state
    checkBLEState();
});

// ============================================================================
// Socket.IO Connection
// ============================================================================

function initializeSocket() {
    // Extract server URL from the socket.io script tag
    const socketScript = document.querySelector('script[src*="socket.io"]');
    const serverUrl = socketScript ? socketScript.src.match(/https?:\/\/[^\/]+/)[0] : 'http://localhost:3000';

    console.log('🔌 Connecting to:', serverUrl);

    socket = io(serverUrl);

    socket.on('connect', () => {
        console.log('✅ Connected to server');
        updateServerURL(serverUrl);
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });

    socket.on('ble-state', (state) => {
        console.log('🔵 BLE State:', state);
        updateBLEStatus(state);
    });

    socket.on('ble-device-discovered', (device) => {
        console.log('🔍 Discovered:', device);
        addDiscoveredDevice(device);
    });

    socket.on('device-status', (data) => {
        console.log('📡 Device Status:', data);
        updateDeviceStatus(data.id, data.status);
    });

    socket.on('serial-data', (data) => {
        // Note: Event name kept as 'serial-data' for compatibility
        console.log('📥 Data from', data.id + ':', data.data);
        displayDeviceData(data.id, data.data);
    });

    socket.on('server-started', (info) => {
        console.log('🚀 Server info:', info);
        updateServerURL(info.url);
    });

    // Receive list of currently connected devices from backend
    socket.on('devices-list', (devices) => {
        console.log('📱 Received connected devices from backend:', devices);

        // Restore connected devices in UI
        devices.forEach(device => {
            if (device.connected) {
                // Only show if actually connected and streaming
                addDeviceCard(
                    device.id,
                    device.name,
                    'connected',
                    device.profile,
                    null
                );

                console.log(`✅ Restored device in UI: ${device.name} (${device.id})`);
            }
        });
    });
}

// ============================================================================
// UI Event Listeners
// ============================================================================

function setupEventListeners() {
    // Add Device Button
    document.getElementById('add-device-btn').addEventListener('click', () => {
        openScanModal();
    });

    // Skip to Audio Training Button
    document.getElementById('skip-to-audio-btn').addEventListener('click', () => {
        // Open trainer.html directly without needing BLE connection
        window.location.href = 'trainer.html';
    });

    // Close Scan Modal
    document.getElementById('close-scan-modal').addEventListener('click', () => {
        closeScanModal();
    });

    // Start Scan Button
    document.getElementById('start-scan-btn').addEventListener('click', () => {
        startScan();
    });

    // Usage Guide Button
    document.getElementById('usage-guide-btn').addEventListener('click', () => {
        showUsageGuide();
    });

    // Getting Started Button (in empty state)
    const gettingStartedBtn = document.getElementById('getting-started-btn');
    if (gettingStartedBtn) {
        gettingStartedBtn.addEventListener('click', () => {
            showUsageGuide();
        });
    }

    // Close modal on background click
    document.getElementById('scan-modal').addEventListener('click', (e) => {
        if (e.target.id === 'scan-modal') {
            closeScanModal();
        }
    });
}

// ============================================================================
// BLE State Management
// ============================================================================

async function checkBLEState() {
    try {
        const response = await fetch('/api/ble/state');
        const data = await response.json();
        updateBLEStatus(data.state);
    } catch (error) {
        console.error('Error checking BLE state:', error);
        updateBLEStatus('unknown');
    }
}

function updateBLEStatus(state) {
    const statusElement = document.getElementById('ble-status');
    const textElement = document.getElementById('ble-state-text');

    statusElement.className = 'ble-status';

    switch (state) {
        case 'poweredOn':
            statusElement.classList.add('powered-on');
            textElement.textContent = 'Bluetooth Ready';
            break;
        case 'poweredOff':
            statusElement.classList.add('powered-off');
            textElement.textContent = 'Bluetooth Off';
            break;
        case 'unsupported':
            statusElement.classList.add('powered-off');
            textElement.textContent = 'Bluetooth Unsupported';
            break;
        default:
            textElement.textContent = 'Checking Bluetooth...';
    }
}

function updateServerURL(url) {
    document.getElementById('server-url').textContent = url;
}

// ============================================================================
// Scan Modal
// ============================================================================

function openScanModal() {
    discoveredDevices.clear();
    document.getElementById('discovered-devices').innerHTML = '';
    document.getElementById('scan-modal').classList.add('active');
    document.getElementById('device-name-input').value = `device_${connectedDevices.size + 1}`;
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.remove('active');
    if (isScanning) {
        stopScan();
    }
}

async function startScan() {
    const scanBtn = document.getElementById('start-scan-btn');
    const scanIndicator = document.getElementById('scanning-indicator');
    const discoveredContainer = document.getElementById('discovered-devices');

    try {
        scanBtn.disabled = true;
        scanBtn.textContent = '⏹️ Stop Scanning';
        scanIndicator.style.display = 'block';
        discoveredContainer.innerHTML = '';
        isScanning = true;

        const response = await fetch('/api/ble/scan/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to start scan');
        }

        // Stop scanning after 10 seconds
        setTimeout(() => {
            if (isScanning) {
                stopScan();
            }
        }, 10000);

        scanBtn.onclick = stopScan;
        scanBtn.disabled = false;

    } catch (error) {
        console.error('Error starting scan:', error);
        alert('Failed to start scanning. Make sure Bluetooth is enabled.');
        scanBtn.disabled = false;
        scanBtn.textContent = '🔍 Start Scanning';
        scanIndicator.style.display = 'none';
        isScanning = false;
    }
}

async function stopScan() {
    const scanBtn = document.getElementById('start-scan-btn');
    const scanIndicator = document.getElementById('scanning-indicator');

    try {
        await fetch('/api/ble/scan/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        scanBtn.textContent = '🔍 Start Scanning';
        scanBtn.onclick = startScan;
        scanIndicator.style.display = 'none';
        isScanning = false;

    } catch (error) {
        console.error('Error stopping scan:', error);
    }
}

function addDiscoveredDevice(device) {
    if (discoveredDevices.has(device.id)) {
        return; // Already added
    }

    discoveredDevices.set(device.id, device);

    const container = document.getElementById('discovered-devices');
    const deviceElement = document.createElement('div');
    deviceElement.className = 'discovered-device';
    deviceElement.innerHTML = `
        <div class="name">${device.name || 'Unknown Device'}</div>
        <div class="id">${device.id}</div>
        <div class="rssi">RSSI: ${device.rssi} dBm</div>
    `;

    deviceElement.onclick = () => connectToDevice(device);
    container.appendChild(deviceElement);
}

// ============================================================================
// Device Connection
// ============================================================================

async function connectToDevice(peripheral) {
    const deviceName = document.getElementById('device-name-input').value || `device_${connectedDevices.size + 1}`;
    const profile = document.getElementById('device-profile-select').value;

    try {
        console.log(`🔗 Connecting to ${peripheral.name}...`);

        // Add device card immediately with "connecting" status
        const deviceId = deviceName;
        addDeviceCard(deviceId, peripheral.name || 'Unknown Device', 'connecting', profile, peripheral.id);

        const response = await fetch('/api/ble/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                peripheralId: peripheral.id,
                profile: profile
            })
        });

        if (!response.ok) {
            throw new Error('Connection failed');
        }

        console.log('✅ Connected successfully');
        updateDeviceStatus(deviceId, 'connected');
        closeScanModal();

    } catch (error) {
        console.error('Connection error:', error);
        alert(`Failed to connect: ${error.message}`);
        removeDeviceCard(deviceName);
    }
}

async function disconnectDevice(deviceId) {
    try {
        const response = await fetch('/api/ble/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });

        if (!response.ok) {
            throw new Error('Disconnection failed');
        }

        console.log('✅ Disconnected successfully');
        removeDeviceCard(deviceId);

    } catch (error) {
        console.error('Disconnection error:', error);
        alert(`Failed to disconnect: ${error.message}`);
    }
}

async function sendToDevice(deviceId, data) {
    try {
        const response = await fetch('/api/ble/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, data })
        });

        if (!response.ok) {
            throw new Error('Send failed');
        }

        console.log('✅ Data sent successfully');

    } catch (error) {
        console.error('Send error:', error);
        alert(`Failed to send data: ${error.message}`);
    }
}

// ============================================================================
// Device Card Management
// ============================================================================

function addDeviceCard(deviceId, deviceName, status, profile, peripheralId) {
    // Check if card already exists (prevent duplicates)
    const existingCard = document.getElementById(`device-${deviceId}`);
    if (existingCard) {
        console.log(`⚠️ Device card already exists for ${deviceId}, updating status instead`);
        updateDeviceStatus(deviceId, status);
        return;
    }

    connectedDevices.set(deviceId, {
        name: deviceName,
        status: status,
        profile: profile,
        peripheralId: peripheralId,
        dataBuffer: []
    });

    // Hide empty state
    document.getElementById('empty-state').style.display = 'none';

    // Create device card
    const deviceList = document.getElementById('device-list');
    const card = document.createElement('div');
    card.className = 'device-card';
    card.id = `device-${deviceId}`;
    card.innerHTML = `
        <div class="device-header">
            <div>
                <div class="device-name">${deviceName}</div>
                <div class="device-id">${deviceId}</div>
            </div>
            <div class="status-badge ${status}">${status}</div>
        </div>

        <div class="device-controls">
            <div class="button-row">
                <button class="btn btn-secondary" onclick="disconnectDevice('${deviceId}')">
                    Disconnect
                </button>
                <button class="btn btn-secondary" onclick="testDevice('${deviceId}')">
                    Test Connection
                </button>
            </div>
            <button class="btn btn-primary btn-full-width" onclick="openTrainer('${deviceId}')">
                🎓 Start Training
            </button>
        </div>

        <div class="form-group">
            <label>Live Data Monitor</label>
            <div class="data-monitor" id="data-${deviceId}">
                <div style="color: #666; font-style: italic;">Waiting for data...</div>
            </div>
        </div>
    `;

    deviceList.appendChild(card);
    updateDeviceCount();
}

function removeDeviceCard(deviceId) {
    const card = document.getElementById(`device-${deviceId}`);
    if (card) {
        card.remove();
    }

    connectedDevices.delete(deviceId);
    updateDeviceCount();

    // Show empty state if no devices
    if (connectedDevices.size === 0) {
        document.getElementById('empty-state').style.display = 'block';
    }
}

function updateDeviceStatus(deviceId, status) {
    const card = document.getElementById(`device-${deviceId}`);
    if (!card) return;

    const statusBadge = card.querySelector('.status-badge');
    statusBadge.className = `status-badge ${status}`;
    statusBadge.textContent = status;

    // Update stored status
    const device = connectedDevices.get(deviceId);
    if (device) {
        device.status = status;
    }

    // If disconnected, remove after a delay
    if (status === 'disconnected') {
        setTimeout(() => removeDeviceCard(deviceId), 2000);
    }
}

function displayDeviceData(deviceId, data) {
    const monitor = document.getElementById(`data-${deviceId}`);
    if (!monitor) return;

    // Store data in buffer
    const device = connectedDevices.get(deviceId);
    if (device) {
        device.dataBuffer.push(data);
        if (device.dataBuffer.length > 50) {
            device.dataBuffer.shift();
        }
    }

    // Create timestamp
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    // Add to monitor (keep last 20 lines)
    const lines = monitor.querySelectorAll('.data-line');
    if (lines.length >= 20) {
        monitor.removeChild(lines[0]);
    }

    // Remove "Waiting for data..." message
    const placeholder = monitor.querySelector('div[style*="italic"]');
    if (placeholder) {
        monitor.removeChild(placeholder);
    }

    const line = document.createElement('div');
    line.className = 'data-line';
    line.innerHTML = `<span class="timestamp">${timestamp}</span>${escapeHtml(data)}`;
    monitor.appendChild(line);

    // Auto-scroll to bottom
    monitor.scrollTop = monitor.scrollHeight;
}

function updateDeviceCount() {
    document.getElementById('device-count').textContent = connectedDevices.size;
}

// ============================================================================
// Utility Functions
// ============================================================================

function testDevice(deviceId) {
    console.log('🧪 Testing device:', deviceId);
    sendToDevice(deviceId, 'PING');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showUsageGuide() {
    alert(`BLE Tiny Motion Trainer - Getting Started

📱 STEP 1: CONNECT YOUR DEVICE
   • Upload the multi-sensor-stream.ino sketch to your Arduino Nano 33 BLE Sense
   • Click "+ New Connection" button
   • Click "Start Scanning" and select your Arduino
   • Click "Open Trainer" to begin

📊 STEP 2: COLLECT DATA
   IMU Mode (Motion/Gestures):
   • Create gestures (e.g., "punch", "wave", "shake")
   • Capture 20-30 samples per gesture

   Color Mode:
   • Create colors (e.g., "red", "blue", "green")
   • Hold color samples to the sensor
   • Capture 20-30 samples per color

🧠 STEP 3: TRAIN YOUR MODEL
   • Click "Start Training"
   • Wait for training to complete (shows accuracy)
   • Test your model in real-time

💾 STEP 4: EXPORT
   • Export Training Data: Save your samples as JSON
   • Export Model: Download TensorFlow.js model
   • Download Arduino Code: Get code for on-board inference

🎯 TIP: Start with 2-3 classes and 20 samples each for best results!`);
}

// ============================================================================
// Global Functions (for inline onclick handlers)
// ============================================================================

window.disconnectDevice = disconnectDevice;
window.testDevice = testDevice;
window.openTrainer = function (deviceId) {
    window.location.href = `/trainer.html?device=${deviceId}`;
};

// ============================================================================
// Debug: Expose to window for console access
// ============================================================================

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.BLE_DEBUG = {
        socket,
        connectedDevices,
        discoveredDevices,
        checkBLEState,
        startScan,
        stopScan
    };
    console.log('🔧 Debug tools available at window.BLE_DEBUG');
}