// ============================================================================
// BLE_TMT (BLE Tiny Motion Trainer) - Main Process
// ============================================================================
// Electron main process that handles:
// - BLE device connections (Arduino Nano BLE Sense)
// - WebSocket server for real-time data streaming
// - Model training data collection
// - TFLite model export
// ============================================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const noble = require('@abandonware/noble');
const settingsManager = require('./settings-manager');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  serverPort: 2000,          // Default WebSocket server port (changed from 3000 to avoid conflicts)
  maxPortAttempts: 10,       // Try ports 2000-2009 (increased range for multi-app use)
  bleUartService: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
  bleTxCharacteristic: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  bleRxCharacteristic: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow = null;
let expressApp = null;
let httpServer = null;
let io = null;
let serverPort = CONFIG.serverPort;

// BLE Device Management
const bleDevices = new Map(); // deviceId -> { peripheral, connection, profile }
const deviceProfiles = new Map(); // Load from public/profiles/

// Training Data Collection
const trainingData = new Map(); // sessionId -> { gestures: [], samples: [] }

// ============================================================================
// ELECTRON APP LIFECYCLE
// ============================================================================

app.whenReady().then(async () => {
  await initializeServer();
  createWindow();
  setupIPC();
  loadDeviceProfiles();
  initializeBLE();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupBLE();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  cleanupBLE();
});

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'default',
    backgroundColor: '#1e1e1e',
  });

  // Wait for server to start, then load from server
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Development mode: Open DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// EXPRESS & WEBSOCKET SERVER
// ============================================================================

async function initializeServer() {
  expressApp = express();
  httpServer = http.createServer(expressApp);
  io = socketIo(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Serve static files
  const publicPath = path.join(__dirname, 'public');
  console.log('📁 Serving static files from:', publicPath);
  console.log('📁 Public folder exists:', fs.existsSync(publicPath));

  if (fs.existsSync(publicPath)) {
    const files = fs.readdirSync(publicPath);
    console.log('📁 Files in public:', files);
  }

  expressApp.use(express.static(publicPath));
  expressApp.use(express.json({ limit: '50mb' }));

  // API Endpoints
  setupAPIEndpoints();

  // WebSocket Events
  setupWebSocketEvents();

  // Find available port
  serverPort = await findAvailablePort(CONFIG.serverPort);

  return new Promise((resolve) => {
    httpServer.listen(serverPort, () => {
      console.log(`✅ Server running on http://localhost:${serverPort}`);

      // Notify renderer process
      if (mainWindow) {
        mainWindow.webContents.send('server-started', {
          port: serverPort,
          url: `http://localhost:${serverPort}`,
        });
      }
      resolve();
    });
  });
}

async function findAvailablePort(startPort) {
  for (let i = 0; i < CONFIG.maxPortAttempts; i++) {
    const port = startPort + i;
    try {
      await new Promise((resolve, reject) => {
        const testServer = http.createServer();
        testServer.once('error', reject);
        testServer.once('listening', () => {
          testServer.close(resolve);
        });
        testServer.listen(port);
      });
      return port;
    } catch (err) {
      console.log(`Port ${port} in use, trying next...`);
    }
  }
  throw new Error(`No available ports between ${startPort}-${startPort + CONFIG.maxPortAttempts - 1}`);
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

function setupAPIEndpoints() {
  // Get BLE state
  expressApp.get('/api/ble/state', (req, res) => {
    res.json({
      available: noble.state === 'poweredOn',
      state: noble.state,
    });
  });


  // Start BLE scanning
  expressApp.post('/api/ble/scan/start', (req, res) => {
    if (noble.state !== 'poweredOn') {
      return res.status(503).json({ error: 'Bluetooth not ready' });
    }

    try {
      // Scan for UART service devices
      noble.startScanning([CONFIG.bleUartService], false);
      res.json({ success: true, scanning: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop BLE scanning
  expressApp.post('/api/ble/scan/stop', (req, res) => {
    try {
      noble.stopScanning();
      res.json({ success: true, scanning: false });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Connect to BLE device
  expressApp.post('/api/ble/connect', async (req, res) => {
    const { deviceId, peripheralId, profile } = req.body;

    try {
      console.log('🔍 Looking for peripheral:', peripheralId);
      console.log('📋 Available peripherals:', Object.keys(noble._peripherals || {}).length);

      // FIX: Use Object.values() instead of .values()
      const peripheral = Object.values(noble._peripherals || {}).find(
        p => p.id === peripheralId
      );

      if (!peripheral) {
        console.log('❌ Peripheral not found!');
        return res.status(404).json({ error: 'Device not found' });
      }

      console.log('✅ Found peripheral:', peripheral.advertisement.localName);
      await connectBLEDevice(deviceId, peripheral, profile);
      res.json({ success: true, deviceId });
    } catch (error) {
      console.error('❌ Connection error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Disconnect BLE device
  expressApp.post('/api/ble/disconnect', async (req, res) => {
    const { deviceId } = req.body;

    try {
      await disconnectBLEDevice(deviceId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send data to BLE device
  expressApp.post('/api/ble/send', async (req, res) => {
    const { deviceId, data } = req.body;

    try {
      await sendBLEData(deviceId, data);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // TRAINING DATA ENDPOINTS
  // ========================================

  // Create new training session
  expressApp.post('/api/training/session/create', (req, res) => {
    const sessionId = `session_${Date.now()}`;
    trainingData.set(sessionId, {
      gestures: [],
      samples: [],
      metadata: {
        created: new Date().toISOString(),
        deviceId: req.body.deviceId || 'unknown',
      },
    });
    res.json({ sessionId });
  });

  // Add gesture to session
  expressApp.post('/api/training/gesture/add', (req, res) => {
    const { sessionId, gestureName } = req.body;
    const session = trainingData.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.gestures.push({
      name: gestureName,
      samples: [],
      created: new Date().toISOString(),
    });

    res.json({ success: true });
  });

  // Add sample to gesture
  expressApp.post('/api/training/sample/add', (req, res) => {
    const { sessionId, gestureName, data } = req.body;
    const session = trainingData.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const gesture = session.gestures.find(g => g.name === gestureName);
    if (!gesture) {
      return res.status(404).json({ error: 'Gesture not found' });
    }

    gesture.samples.push(data);
    res.json({ success: true, sampleCount: gesture.samples.length });
  });

  // Get training session data
  expressApp.get('/api/training/session/:sessionId', (req, res) => {
    const session = trainingData.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  // Export training data
  expressApp.post('/api/training/export', (req, res) => {
    const { sessionId } = req.body;
    const session = trainingData.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: session,
    });
  });

  // ========================================
  // MODEL EXPORT ENDPOINT
  // ========================================

  expressApp.post('/api/model/export', async (req, res) => {
    try {
      const { modelData, gestures, metadata } = req.body;

      // Generate Arduino code
      const arduinoCode = generateArduinoCode(gestures, metadata);

      // Save model and code to temp directory
      const tempDir = path.join(app.getPath('temp'), 'ble-tmt-export');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Save model.tflite (you'll need to handle conversion from TF.js)
      const modelPath = path.join(tempDir, 'model.tflite');
      // Note: Actual TFLite conversion happens in the renderer process
      // This endpoint just packages the files

      // Save Arduino sketch
      const sketchPath = path.join(tempDir, 'gesture_inference.ino');
      fs.writeFileSync(sketchPath, arduinoCode);

      res.json({
        success: true,
        paths: {
          model: modelPath,
          sketch: sketchPath,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ============================================================================
// WEBSOCKET EVENTS
// ============================================================================

function setupWebSocketEvents() {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Send current connected devices
    socket.emit('devices-list', getConnectedDevices());

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });

    // Real-time data streaming request
    socket.on('start-streaming', (deviceId) => {
      console.log(`📡 Start streaming from ${deviceId}`);
      // Streaming is automatically handled by BLE data events
    });

    socket.on('stop-streaming', (deviceId) => {
      console.log(`⏹️ Stop streaming from ${deviceId}`);
      // Can add logic to pause data forwarding if needed
    });
  });
}

// Broadcast data to all connected clients
function broadcastData(deviceId, data) {
  if (io) {
    io.emit('serial-data', {
      id: deviceId,
      data: data,
      timestamp: Date.now(),
    });
  }
}

// Broadcast device status
function broadcastStatus(deviceId, status) {
  if (io) {
    io.emit('device-status', {
      id: deviceId,
      status: status,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// BLE DEVICE MANAGEMENT
// ============================================================================

function initializeBLE() {
  // Monitor Bluetooth state
  noble.on('stateChange', (state) => {
    console.log(`🔵 Bluetooth state: ${state}`);

    if (mainWindow) {
      mainWindow.webContents.send('ble-state-changed', state);
    }

    if (io) {
      io.emit('ble-state', state);
    }

    if (state !== 'poweredOn') {
      noble.stopScanning();
    }
  });

  // Handle discovered devices
  noble.on('discover', (peripheral) => {
    const deviceInfo = {
      id: peripheral.id,
      name: peripheral.advertisement.localName || 'Unknown Device',
      rssi: peripheral.rssi,
      connectable: peripheral.connectable,
    };

    console.log('🔍 Discovered:', deviceInfo.name);

    if (io) {
      io.emit('ble-device-discovered', deviceInfo);
    }
  });
}

async function connectBLEDevice(deviceId, peripheral, profile = 'generic_uart') {
  try {
    console.log(`🔗 Connecting to ${peripheral.advertisement.localName}...`);

    // Connect to peripheral
    await new Promise((resolve, reject) => {
      peripheral.connect((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log('✅ Connected to peripheral');

    // Discover services and characteristics
    const { services, characteristics } = await new Promise((resolve, reject) => {
      peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
        if (error) reject(error);
        else resolve({ services, characteristics });
      });
    });

    console.log(`📡 Found ${services.length} services, ${characteristics.length} characteristics`);

    // Find UART characteristics
    const txCharacteristic = characteristics.find(
      c => c.uuid.toLowerCase() === CONFIG.bleTxCharacteristic.toLowerCase().replace(/-/g, '')
    );

    const rxCharacteristic = characteristics.find(
      c => c.uuid.toLowerCase() === CONFIG.bleRxCharacteristic.toLowerCase().replace(/-/g, '')
    );

    if (!txCharacteristic) {
      throw new Error('TX characteristic not found');
    }

    console.log('✅ Found UART characteristics');

    // Subscribe to notifications
    await new Promise((resolve, reject) => {
      txCharacteristic.subscribe((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Handle incoming data
    txCharacteristic.on('data', (data) => {
      const stringData = data.toString('utf8');
      console.log(`📥 ${deviceId}: ${stringData}`);
      broadcastData(deviceId, stringData);
    });

    // Store device connection
    bleDevices.set(deviceId, {
      peripheral,
      txCharacteristic,
      rxCharacteristic,
      profile,
      connected: true,
    });

    // Handle disconnection
    peripheral.once('disconnect', () => {
      console.log(`🔌 ${deviceId} disconnected`);
      bleDevices.delete(deviceId);
      broadcastStatus(deviceId, 'disconnected');
    });

    broadcastStatus(deviceId, 'connected');
    return true;

  } catch (error) {
    console.error(`❌ Connection failed:`, error);
    throw error;
  }
}

async function disconnectBLEDevice(deviceId) {
  const device = bleDevices.get(deviceId);
  if (!device) {
    throw new Error('Device not found');
  }

  return new Promise((resolve, reject) => {
    device.peripheral.disconnect((error) => {
      if (error) {
        reject(error);
      } else {
        bleDevices.delete(deviceId);
        broadcastStatus(deviceId, 'disconnected');
        resolve();
      }
    });
  });
}

async function sendBLEData(deviceId, data) {
  const device = bleDevices.get(deviceId);
  if (!device || !device.rxCharacteristic) {
    throw new Error('Device not connected or RX characteristic not available');
  }

  const buffer = Buffer.from(data + '\n', 'utf8');

  return new Promise((resolve, reject) => {
    device.rxCharacteristic.write(buffer, false, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function cleanupBLE() {
  // Disconnect all devices
  for (const [deviceId, device] of bleDevices.entries()) {
    try {
      device.peripheral.disconnect();
    } catch (error) {
      console.error(`Error disconnecting ${deviceId}:`, error);
    }
  }
  bleDevices.clear();

  // Stop scanning
  if (noble.state === 'poweredOn') {
    noble.stopScanning();
  }
}

function getConnectedDevices() {
  const devices = [];
  for (const [deviceId, device] of bleDevices.entries()) {
    devices.push({
      id: deviceId,
      name: device.peripheral.advertisement.localName || 'Unknown',
      connected: device.connected,
      profile: device.profile,
    });
  }
  return devices;
}

// ============================================================================
// DEVICE PROFILES
// ============================================================================

function loadDeviceProfiles() {
  const profilesDir = path.join(__dirname, 'public', 'profiles');

  // Load only the nano-ble profile
  const nanoBleProfile = path.join(profilesDir, 'nano-ble.json');

  if (fs.existsSync(nanoBleProfile)) {
    try {
      const profile = JSON.parse(fs.readFileSync(nanoBleProfile, 'utf8'));
      deviceProfiles.set('nano-ble', profile);
      console.log('✅ Loaded device profile: nano-ble');
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }
}

// ============================================================================
// ARDUINO CODE GENERATION
// ============================================================================

function generateArduinoCode(gestures, metadata) {
  const gestureNames = gestures.map(g => g.name);
  const numGestures = gestureNames.length;

  return `// ============================================================================
// Gesture Recognition Model
// Generated by BLE Tiny Motion Trainer
// ============================================================================
// Gestures: ${gestureNames.join(', ')}
// Created: ${metadata.created || new Date().toISOString()}
// ============================================================================

#include <TensorFlowLite.h>
#include <Arduino_LSM9DS1.h>

// Model data (you'll need to include the actual model array)
#include "model.h"

// TensorFlow Lite for Microcontrollers
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"

// Gesture labels
const char* GESTURES[] = {
${gestureNames.map((name, i) => `  "${name}"`).join(',\n')}
};

#define NUM_GESTURES ${numGestures}
#define SAMPLES_PER_GESTURE 100
#define NUM_FEATURES 6  // ax, ay, az, gx, gy, gz

// TensorFlow Lite globals
tflite::MicroErrorReporter tflErrorReporter;
tflite::AllOpsResolver tflOpsResolver;

const tflite::Model* tflModel = nullptr;
tflite::MicroInterpreter* tflInterpreter = nullptr;
TfLiteTensor* tflInputTensor = nullptr;
TfLiteTensor* tflOutputTensor = nullptr;

// Tensor arena for model
constexpr int tensorArenaSize = 8 * 1024;
byte tensorArena[tensorArenaSize] __attribute__((aligned(16)));

// Sample buffer
float samplesBuffer[SAMPLES_PER_GESTURE * NUM_FEATURES];
int samplesRead = 0;

void setup() {
  Serial.begin(9600);
  while (!Serial);

  Serial.println("BLE Tiny Motion Trainer - Gesture Recognition");
  Serial.println("==============================================");

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1);
  }

  Serial.print("Accelerometer sample rate = ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println(" Hz");

  Serial.print("Gyroscope sample rate = ");
  Serial.print(IMU.gyroscopeSampleRate());
  Serial.println(" Hz");

  // Initialize TensorFlow Lite model
  tflModel = tflite::GetModel(model);
  if (tflModel->version() != TFLITE_SCHEMA_VERSION) {
    Serial.println("Model schema mismatch!");
    while (1);
  }

  tflInterpreter = new tflite::MicroInterpreter(
    tflModel, tflOpsResolver, tensorArena, tensorArenaSize, &tflErrorReporter
  );

  // Allocate memory for model tensors
  tflInterpreter->AllocateTensors();

  // Get input and output tensors
  tflInputTensor = tflInterpreter->input(0);
  tflOutputTensor = tflInterpreter->output(0);

  Serial.println("Ready to classify gestures!");
  Serial.println("Move the device to start...");
}

void loop() {
  float ax, ay, az, gx, gy, gz;

  // Wait for significant motion
  while (samplesRead < SAMPLES_PER_GESTURE) {
    if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
      IMU.readAcceleration(ax, ay, az);
      IMU.readGyroscope(gx, gy, gz);

      // Normalize and store
      int index = samplesRead * NUM_FEATURES;
      samplesBuffer[index + 0] = ax;
      samplesBuffer[index + 1] = ay;
      samplesBuffer[index + 2] = az;
      samplesBuffer[index + 3] = gx;
      samplesBuffer[index + 4] = gy;
      samplesBuffer[index + 5] = gz;

      samplesRead++;

      if (samplesRead == SAMPLES_PER_GESTURE) {
        // Copy data to input tensor
        for (int i = 0; i < SAMPLES_PER_GESTURE * NUM_FEATURES; i++) {
          tflInputTensor->data.f[i] = samplesBuffer[i];
        }

        // Run inference
        TfLiteStatus invokeStatus = tflInterpreter->Invoke();
        if (invokeStatus != kTfLiteOk) {
          Serial.println("Invoke failed!");
          samplesRead = 0;
          return;
        }

        // Read output
        int maxIndex = 0;
        float maxScore = 0;
        for (int i = 0; i < NUM_GESTURES; i++) {
          float score = tflOutputTensor->data.f[i];
          if (score > maxScore) {
            maxScore = score;
            maxIndex = i;
          }
        }

        // Print results
        Serial.print("Gesture: ");
        Serial.print(GESTURES[maxIndex]);
        Serial.print(" (");
        Serial.print(maxScore * 100);
        Serial.println("%)");

        // Reset for next gesture
        samplesRead = 0;
      }
    }
  }
}`;
}


// ============================================================================
// IPC HANDLERS (Electron Main <-> Renderer)
// ============================================================================

function setupIPC() {
  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Get settings
  ipcMain.handle('get-settings', () => {
    return settingsManager.getSettings();
  });

  // Update settings
  ipcMain.handle('update-settings', (event, settings) => {
    settingsManager.updateSettings(settings);
    return settingsManager.getSettings();
  });

  // Open save dialog for model export
  ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  });

  // Open folder in file explorer
  ipcMain.handle('open-folder', (event, folderPath) => {
    require('electron').shell.openPath(folderPath);
  });
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

// ============================================================================
// EXPORTS (for testing)
// ============================================================================

module.exports = {
  connectBLEDevice,
  disconnectBLEDevice,
  sendBLEData,
  generateArduinoCode,
};
