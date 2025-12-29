# BLE_TMT File Structure Guide

## Overview
This document outlines which files to KEEP, REMOVE, MODIFY, and ADD when transforming SerialBridge v2.0 into BLE_TMT (BLE Tiny Motion Trainer).

---

## 🟢 FILES TO KEEP (No Changes)

### Root Level
```
BLE_TMT/
├── package.json                    # MODIFY (update dependencies)
├── package-lock.json              # Will regenerate
├── .gitignore                     # Keep as-is
├── .gitattributes                 # Keep as-is
├── entitlements.mac.plist         # Keep for macOS code signing
├── LICENSE                        # MODIFY (update for your project)
└── README.md                      # MODIFY (rewrite for BLE_TMT)
```

### Keep These Electron Files
```
├── preload.js                     # Keep - provides IPC bridge
├── settings-manager.js            # Keep - settings persistence
```

### Keep These Directories (Partial)
```
├── assets/                        # Keep - icons and images
│   ├── icon.icns                  # macOS app icon
│   ├── icon.ico                   # Windows app icon
│   └── icon.png                   # Linux app icon
│
├── .github/                       # Keep - GitHub workflows (if needed)
│   └── workflows/
│       └── build.yml              # MODIFY - update build process
```

---

## 🔴 FILES TO REMOVE (Not Needed)

### Remove Serial Port Functionality
```
BLE_TMT/
├── examples/
│   ├── arduino-sketches/
│   │   ├── basic-sensor.ino       # ❌ DELETE (USB-specific)
│   │   ├── basic-send-data.ino    # ❌ DELETE
│   │   ├── basic-recieve-data.ino # ❌ DELETE
│   │   ├── send-multi-data.ino    # ❌ DELETE
│   │   ├── send-multi-array-data.ino # ❌ DELETE
│   │   └── bidirectional-interactive.ino # ❌ DELETE
│   │
│   └── p5js-sketches/             # ❌ DELETE ALL (replace with ML examples)
│       ├── basic-input-p5js/
│       ├── basic-output-p5js/
│       ├── multi-input-easy-p5js/
│       ├── multi-input-array-p5js/
│       ├── store-input-p5js/
│       ├── store-multi-input-p5js/
│       ├── bidirectional-interactive-p5js/
│       └── test-serial-p5js/
```

### Remove Unused Device Profiles
```
public/
└── profiles/
    ├── muse.json                  # ❌ DELETE
    └── heart-rate.json            # ❌ DELETE
```

### Remove TouchDesigner Examples (Optional)
```
examples/
└── touchdesigner/                 # ❌ DELETE (or keep if you want OSC export)
    ├── SerialBridge_TD.tox
    └── README.md
```

---

## 🟡 FILES TO MODIFY

### 1. main.js - MAJOR MODIFICATIONS
```javascript
// REMOVE: All serialport imports and logic
// REMOVE: OSC functionality (unless you want to keep it)
// KEEP: BLE device management
// KEEP: WebSocket server
// ADD: Model export endpoints
// ADD: TFLite conversion endpoints

Location: /main.js
Changes: ~60% rewrite
```

### 2. package.json - Update Dependencies
```json
{
  "name": "ble-tiny-motion-trainer",
  "productName": "BLE Motion Trainer",
  "version": "1.0.0",
  "description": "Train TensorFlow Lite models for Arduino Nano BLE Sense",
  
  "dependencies": {
    // KEEP:
    "electron": "^28.0.0",
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "@abandonware/noble": "^1.9.2-15",
    
    // REMOVE:
    // "serialport": "...",  ❌ DELETE
    // "osc": "...",         ❌ DELETE (unless keeping OSC)
    
    // ADD:
    "@tensorflow/tfjs-node": "^4.11.0",
    "node-addon-api": "^7.0.0",
    "node-gyp": "^10.0.0"
  }
}
```

### 3. public/index.html - Update UI Structure
```
Location: /public/index.html
Changes:
- Remove "USB / Serial" connection option
- Keep only "Bluetooth" option
- Add "Training" tab/section
- Add "Model Export" section
- Remove OSC settings UI (unless keeping)
```

### 4. public/client.js - Simplify Connection Logic
```javascript
Location: /public/client.js
Changes:
- Remove all serial port connection code
- Keep only BLE connection code
- Add training interface event handlers
- Add model export handlers
```

### 5. public/serial-bridge.js - Rename and Simplify
```javascript
Location: /public/serial-bridge.js → /public/ble-trainer.js
Changes:
- Remove serial-specific methods
- Keep BLE data methods
- Add training data collection methods
- Add model export methods
```

---

## 🆕 FILES TO ADD (From Tiny Motion Trainer)

### New Public Directory Structure
```
public/
├── trainer.html                   # ✅ NEW - Main training interface
├── css/
│   ├── trainer.css               # ✅ NEW - Training UI styles
│   └── gestures.css              # ✅ NEW - Gesture capture styles
│
├── js/
│   ├── ml/
│   │   ├── model-builder.js      # ✅ NEW - TF.js model architecture
│   │   ├── data-processor.js     # ✅ NEW - IMU data preprocessing
│   │   ├── trainer.js            # ✅ NEW - Training loop logic
│   │   └── exporter.js           # ✅ NEW - TFLite export
│   │
│   └── ui/
│       ├── gesture-capture.js    # ✅ NEW - Recording interface
│       ├── training-monitor.js   # ✅ NEW - Live training feedback
│       └── model-tester.js       # ✅ NEW - Real-time inference
│
├── components/                    # ✅ NEW - Svelte/Lit components
│   ├── GestureCard.js            # From TMT
│   ├── TrainingProgress.js       # From TMT
│   └── ModelExport.js            # From TMT
│
└── assets/
    └── sounds/                    # ✅ NEW - Training feedback sounds
        ├── recording-start.mp3
        └── recording-stop.mp3
```

### New Examples Directory
```
examples/
├── arduino-nano-ble/
│   ├── imu-sender.ino            # ✅ NEW - BLE IMU streaming
│   ├── model-inference.ino       # ✅ NEW - Run trained model
│   └── README.md                 # ✅ NEW - Arduino setup guide
│
└── web-examples/
    ├── basic-training/           # ✅ NEW - Simple 2-gesture example
    └── advanced-training/        # ✅ NEW - Multi-gesture with validation
```

### New Backend Utilities
```
src/
├── model-converter.js            # ✅ NEW - TF → TFLite conversion
├── arduino-code-generator.js     # ✅ NEW - Generate .ino from model
└── ble-imu-parser.js             # ✅ NEW - Parse IMU data streams
```

---

## 📋 SUMMARY OF CHANGES

### Statistics
- **Files to Keep**: ~15 files (40%)
- **Files to Delete**: ~20 files (30%)
- **Files to Modify**: ~8 files (20%)
- **Files to Add**: ~20 files (50%)

### Priority Order
1. ✅ **Phase 1**: Remove USB/Serial functionality
2. ✅ **Phase 2**: Modify main.js for BLE-only
3. ✅ **Phase 3**: Update UI to remove Serial options
4. ✅ **Phase 4**: Add TensorFlow.js training files
5. ✅ **Phase 5**: Create Arduino examples

---

## 🎯 Key Dependencies to Update

### Remove
```bash
npm uninstall serialport @serialport/parser-readline osc
```

### Add
```bash
npm install @tensorflow/tfjs-node @tensorflow/tfjs-converter
npm install uuid                    # For session IDs
npm install archiver                # For model export zip files
```

---

## 🔧 Build Configuration

### electron-builder Configuration (package.json)
```json
"build": {
  "appId": "com.yourname.ble-motion-trainer",
  "productName": "BLE Motion Trainer",
  "files": [
    "main.js",
    "preload.js",
    "settings-manager.js",
    "src/**/*",
    "public/**/*",
    "!public/profiles/muse.json",    // Exclude unused profiles
    "!public/profiles/heart-rate.json",
    "node_modules/**/*"
  ],
  "mac": {
    "category": "public.app-category.developer-tools",
    "icon": "assets/icon.icns"
  },
  "win": {
    "icon": "assets/icon.ico"
  }
}
```

---

## 📝 Next Steps

1. **Backup Original**: Keep a copy of SerialBridge v2.0
2. **Remove Files**: Delete all files marked with ❌
3. **Update Dependencies**: Run npm install/uninstall commands
4. **Modify main.js**: Implement BLE-only architecture (see next document)
5. **Add Training UI**: Integrate Tiny Motion Trainer components
6. **Test**: Verify BLE connection works before adding ML

---

## 🎓 Learning Resources

If you need help with specific integrations:
- **BLE UART Protocol**: Already implemented in SerialBridge
- **TensorFlow.js in Node**: https://www.tensorflow.org/js/guide/nodejs
- **TFLite Conversion**: Use tfjs-converter or tflite-micro-compiler
- **Arduino BLE Library**: https://www.arduino.cc/reference/en/libraries/arduinoble/

---

**Ready for the next step?**
Once you've reviewed this structure, I'll provide the complete rewritten `main.js` with:
- BLE-only device management
- WebSocket endpoints for training
- Model export functionality
- No serial port dependencies
