# BLE_TMT Quick Reference

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Remove old dependencies
npm uninstall serialport @serialport/parser-readline osc

# Rebuild native modules
npm run rebuild

# Start development
npm run dev

# Build for production
npm run build
```

---

## 📁 Key File Locations

| File | Purpose | Status |
|------|---------|--------|
| `main.js` | ✅ REPLACE | BLE-only backend |
| `package.json` | ⚠️ UPDATE | New dependencies |
| `public/profiles/nano-ble.json` | ✅ CREATE | Device profile |
| `examples/arduino-nano-ble/imu-sender.ino` | ✅ CREATE | Arduino sketch |
| `public/index.html` | ⚠️ MODIFY | Remove Serial UI |
| `public/client.js` | ⚠️ MODIFY | Remove Serial logic |

---

## 🔌 BLE Configuration

### Service UUIDs (Nordic UART)
```
Service:  6E400001-B5A3-F393-E0A9-E50E24DCCA9E
TX (→):   6E400003-B5A3-F393-E0A9-E50E24DCCA9E  (Notify)
RX (←):   6E400002-B5A3-F393-E0A9-E50E24DCCA9E  (Write)
```

### Arduino BLE Setup
```cpp
#include <ArduinoBLE.h>
#include <Arduino_LSM9DS1.h>

BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLECharacteristic txChar("6E400003-...", BLENotify, 512);
BLECharacteristic rxChar("6E400002-...", BLEWrite, 512);

BLE.setLocalName("NanoBLE-IMU");
BLE.advertise();
```

---

## 📡 API Endpoints

### BLE Endpoints
```
GET  /api/ble/state          - Check Bluetooth availability
POST /api/ble/scan/start     - Start scanning for devices
POST /api/ble/scan/stop      - Stop scanning
POST /api/ble/connect        - Connect to device
POST /api/ble/disconnect     - Disconnect device
POST /api/ble/send           - Send data to device
```

### Training Endpoints (NEW)
```
POST /api/training/session/create  - Create training session
POST /api/training/gesture/add     - Add gesture class
POST /api/training/sample/add      - Add training sample
GET  /api/training/session/:id     - Get session data
POST /api/training/export          - Export training data
```

### Model Export (NEW)
```
POST /api/model/export       - Package model + generate Arduino code
```

---

## 📊 Data Format

### IMU Data Stream (CSV)
```
Format: ax,ay,az,gx,gy,gz\n
Example: 0.12,-0.03,0.98,1.45,-0.32,0.87

Fields:
- ax, ay, az: Acceleration (g)
- gx, gy, gz: Gyroscope (dps)
```

### WebSocket Events
```javascript
// Client → Server
socket.emit('start-streaming', 'device_1');
socket.emit('stop-streaming', 'device_1');

// Server → Client
socket.on('serial-data', (data) => {
  // { id: 'device_1', data: '0.12,-0.03,0.98,...', timestamp: ... }
});

socket.on('device-status', (status) => {
  // { id: 'device_1', status: 'connected', timestamp: ... }
});

socket.on('ble-device-discovered', (device) => {
  // { id: 'abc123', name: 'NanoBLE-IMU', rssi: -45 }
});
```

---

## 🎯 Main.js Key Functions

### Connection Management
```javascript
await connectBLEDevice(deviceId, peripheral, profile)
await disconnectBLEDevice(deviceId)
await sendBLEData(deviceId, data)
```

### Training Data
```javascript
trainingData.set(sessionId, { gestures: [], samples: [] })
```

### Broadcasting
```javascript
broadcastData(deviceId, data)
broadcastStatus(deviceId, status)
```

---

## 🐛 Common Issues

| Problem | Solution |
|---------|----------|
| "Module not found: serialport" | Run `npm uninstall serialport` |
| "Bluetooth not available" | Check system Bluetooth is on |
| "gyp ERR!" during install | Install build tools (see below) |
| Device not found in scan | Reset Arduino, move closer |
| Connection timeout | Check no other app is connected |

### Build Tools Installation

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential
```

**Windows:**
```bash
npm install --global windows-build-tools
```

---

## 🔍 Testing Commands

### Check BLE State
```bash
# Start app, then in browser console:
fetch('http://localhost:3000/api/ble/state')
  .then(r => r.json())
  .then(console.log);
```

### Manual Connection Test
```javascript
// In browser DevTools console:
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('serial-data', (data) => {
  console.log('📥 Data:', data);
});

socket.on('ble-device-discovered', (device) => {
  console.log('🔍 Found:', device);
});
```

### Arduino Serial Monitor
```bash
# Should show:
✅ IMU initialized
✅ BLE initialized
✅ BLE advertising started
🔵 Waiting for connection...

# After connection:
✅ Connected to central
```

---

## 📦 Dependencies Comparison

### SerialBridge v2.0 (OLD)
```json
{
  "serialport": "^10.5.0",
  "@serialport/parser-readline": "^10.5.0",
  "osc": "^2.4.4",
  "@abandonware/noble": "^1.9.2-15",
  "express": "^4.18.2",
  "socket.io": "^4.6.1"
}
```

### BLE_TMT (NEW)
```json
{
  "@abandonware/noble": "^1.9.2-15",
  "@tensorflow/tfjs-node": "^4.11.0",
  "archiver": "^6.0.1",
  "express": "^4.18.2",
  "socket.io": "^4.6.1",
  "uuid": "^9.0.1"
}
```

---

## 🎨 UI Modifications Needed

### Remove from public/index.html
```html
<!-- ❌ DELETE: USB/Serial connection options -->
<option value="serial">USB / Serial</option>

<!-- ❌ DELETE: OSC Settings section -->
<div id="osc-settings">...</div>
```

### Keep from public/index.html
```html
<!-- ✅ KEEP: Bluetooth connection option -->
<option value="bluetooth">Bluetooth</option>

<!-- ✅ KEEP: Device management -->
<div id="device-list">...</div>
```

### Add to public/index.html
```html
<!-- ✅ ADD: Training interface -->
<div id="training-panel">
  <button id="add-gesture">Add Gesture</button>
  <button id="record-sample">Record Sample</button>
  <button id="train-model">Train Model</button>
</div>
```

---

## 🏗️ Next Implementation Steps

1. ✅ **Phase 1: BLE Base** (YOU ARE HERE)
   - Replace main.js
   - Update dependencies
   - Test connection

2. 🔄 **Phase 2: UI Cleanup**
   - Remove Serial options
   - Simplify connection UI
   - Add training tabs

3. ⏭️ **Phase 3: Training Interface**
   - Gesture capture UI
   - Sample collection
   - Live visualization

4. ⏭️ **Phase 4: ML Integration**
   - TensorFlow.js training
   - Model validation
   - Export to TFLite

5. ⏭️ **Phase 5: Arduino Inference**
   - Code generation
   - Model deployment
   - Real-time testing

---

## 📐 Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                      │
│                                                     │
│  ┌─────────────┐         ┌──────────────────┐     │
│  │  Main.js    │◄───────►│  Renderer        │     │
│  │  (Node)     │   IPC   │  (Browser)       │     │
│  │             │         │                  │     │
│  │ • BLE       │         │ • UI             │     │
│  │ • WebSocket │         │ • TensorFlow.js  │     │
│  │ • Training  │         │ • Visualization  │     │
│  └──────┬──────┘         └──────────────────┘     │
│         │                                          │
└─────────┼──────────────────────────────────────────┘
          │
          ▼
    ┌─────────────┐
    │  Arduino    │
    │  Nano BLE   │
    │  (IMU)      │
    └─────────────┘
```

---

## 🎓 Learning Resources

- [ArduinoBLE Library](https://www.arduino.cc/reference/en/libraries/arduinoble/)
- [Arduino LSM9DS1](https://www.arduino.cc/reference/en/libraries/arduino_lsm9ds1/)
- [Noble BLE Library](https://github.com/abandonware/noble)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [TFLite Micro](https://www.tensorflow.org/lite/microcontrollers)

---

## 💡 Tips & Best Practices

✅ **DO:**
- Test each component in isolation
- Log everything during development
- Use Arduino Serial Monitor for debugging
- Keep sample rate at 50Hz for stability
- Version control your changes

❌ **DON'T:**
- Skip the `npm rebuild` step
- Connect to Arduino from multiple apps simultaneously
- Forget to add `\n` to data strings
- Use `Serial.print()` instead of `Serial.println()`
- Modify main.js while app is running

---

## 📝 Code Snippets

### Quick Arduino Test
```cpp
void loop() {
  // Send test data
  if (deviceConnected) {
    String data = "0.1,0.2,0.3,1.0,2.0,3.0";
    txCharacteristic.writeValue(data.c_str());
    delay(50);
  }
}
```

### Quick Client Test (Browser Console)
```javascript
const bridge = new SerialBridge('http://localhost:3000');

bridge.onData('device_1', (data) => {
  console.log('Received:', data);
});

bridge.onStatus('device_1', (status) => {
  console.log('Status:', status);
});
```

### Quick Server Test (Node)
```javascript
// Add to main.js for debugging
console.log('BLE State:', noble.state);
console.log('Connected devices:', bleDevices.size);
console.log('Training sessions:', trainingData.size);
```

---

## 🎯 Success Criteria

✅ App launches without errors  
✅ BLE state shows "poweredOn"  
✅ Scan discovers Arduino device  
✅ Connection establishes (LED turns on)  
✅ Data streams in console  
✅ Disconnection is clean  
✅ Can reconnect after disconnect  

---

**Version:** 1.0.0  
**Last Updated:** December 2025  
**License:** MIT
