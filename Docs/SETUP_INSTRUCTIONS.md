# BLE_TMT Setup Instructions

## Overview
This guide walks you through transforming SerialBridge v2.0 into BLE Tiny Motion Trainer.

**Time Required:** ~30 minutes  
**Difficulty:** Intermediate  
**Prerequisites:** Node.js 16+, Arduino IDE, Arduino Nano BLE Sense

---

## 📋 Step-by-Step Implementation

### Step 1: Backup Your Work
```bash
# Make sure you're in the right directory
cd /path/to/BLE_TMT

# Create a backup (optional)
cp -r ../SerialBridge ../SerialBridge_backup
```

### Step 2: Replace main.js
```bash
# 1. Back up the original
mv main.js main.js.backup

# 2. Copy the new main.js (from the file I provided)
cp /path/to/new/main.js ./main.js

# 3. Verify it copied correctly
head -n 5 main.js
# Should show: "// BLE_TMT (BLE Tiny Motion Trainer) - Main Process"
```

### Step 3: Update Dependencies

**3.1 Remove Old Dependencies**
```bash
npm uninstall serialport @serialport/parser-readline osc
```

**3.2 Install New Dependencies**
```bash
npm install @tensorflow/tfjs-node@4.11.0
npm install archiver@6.0.1
npm install uuid@9.0.1
```

**3.3 Verify Installation**
```bash
npm list --depth=0
```

Expected output:
```
ble-tiny-motion-trainer@1.0.0
├── @abandonware/noble@1.9.2-15
├── @tensorflow/tfjs-node@4.11.0
├── archiver@6.0.1
├── express@4.18.2
├── socket.io@4.6.1
└── uuid@9.0.1
```

### Step 4: Create Device Profile

**4.1 Create Profile Directory (if it doesn't exist)**
```bash
mkdir -p public/profiles
```

**4.2 Add Nano BLE Profile**
```bash
# Copy the nano-ble.json file I provided to:
cp /path/to/nano-ble.json public/profiles/nano-ble.json
```

**4.3 Remove Unused Profiles**
```bash
# Remove Muse and Heart Rate profiles
rm -f public/profiles/muse.json
rm -f public/profiles/heart-rate.json
```

### Step 5: Create Arduino Example

**5.1 Create Examples Directory**
```bash
mkdir -p examples/arduino-nano-ble
```

**5.2 Add IMU Sender Sketch**
```bash
# Copy the imu-sender.ino file I provided to:
cp /path/to/imu-sender.ino examples/arduino-nano-ble/imu-sender.ino
```

**5.3 Create README for Arduino Examples**
```bash
cat > examples/arduino-nano-ble/README.md << 'EOF'
# Arduino Nano BLE Examples

## imu-sender.ino
Streams IMU data via BLE UART.

**Libraries Required:**
- ArduinoBLE
- Arduino_LSM9DS1

**Installation:**
1. Open Arduino IDE
2. Go to Tools > Manage Libraries
3. Install "ArduinoBLE" by Arduino
4. Install "Arduino_LSM9DS1" by Arduino
5. Open imu-sender.ino
6. Select Board: Arduino Nano 33 BLE
7. Upload to your board

**Data Format:**
CSV: ax,ay,az,gx,gy,gz\n
Example: 0.12,-0.03,0.98,1.45,-0.32,0.87
EOF
```

### Step 6: Update Package.json

```bash
# Backup original
cp package.json package.json.backup

# Replace with new package.json (from the file I provided)
cp /path/to/new/package.json ./package.json

# Update the author fields with your info
nano package.json  # or use your preferred editor
```

### Step 7: Clean Up Unused Files

**7.1 Remove USB Serial Examples**
```bash
rm -rf examples/arduino-sketches/basic-sensor.ino
rm -rf examples/arduino-sketches/basic-send-data.ino
rm -rf examples/arduino-sketches/basic-recieve-data.ino
rm -rf examples/arduino-sketches/send-multi-data.ino
rm -rf examples/arduino-sketches/send-multi-array-data.ino
rm -rf examples/arduino-sketches/bidirectional-interactive.ino
```

**7.2 Remove P5.js Examples (we'll replace these later)**
```bash
rm -rf examples/p5js-sketches/*
```

**7.3 Remove TouchDesigner Examples (optional)**
```bash
# Only if you don't need OSC export
rm -rf examples/touchdesigner/
```

### Step 8: Test the Application

**8.1 Rebuild Native Modules**
```bash
npm run rebuild
```

**8.2 Start in Development Mode**
```bash
npm run dev
```

**Expected Console Output:**
```
✅ BLE initialized
✅ Server running on http://localhost:3000
✅ Loaded device profile: nano-ble
🔵 Bluetooth state: poweredOn
```

### Step 9: Upload Arduino Sketch

**9.1 Open Arduino IDE**
- File > Open > `examples/arduino-nano-ble/imu-sender.ino`

**9.2 Install Required Libraries**
- Tools > Manage Libraries
- Search and install: "ArduinoBLE"
- Search and install: "Arduino_LSM9DS1"

**9.3 Select Board**
- Tools > Board > Arduino Mbed OS Nano Boards > Arduino Nano 33 BLE

**9.4 Select Port**
- Tools > Port > (select your Arduino's port)

**9.5 Upload**
- Click Upload button (→)
- Wait for "Upload complete"

**9.6 Verify**
- Tools > Serial Monitor (115200 baud)
- Should see:
  ```
  BLE Tiny Motion Trainer - IMU Sender
  ====================================
  ✅ IMU initialized
  ✅ BLE initialized
  ✅ BLE advertising started
  🔵 Waiting for connection...
  ```

### Step 10: Test Connection

**10.1 In the BLE_TMT App:**
1. Click "+ New Connection"
2. Select Type: **Bluetooth**
3. Select Profile: **Arduino Nano 33 BLE Sense**
4. Click **Scan**
5. Look for "NanoBLE-IMU" in the list
6. Click **Connect**

**10.2 Expected Behavior:**
- Arduino LED turns on
- Arduino Serial Monitor shows: "✅ Connected to central"
- App shows green "Connected" status
- Data starts streaming in app console

**10.3 Verify Data Stream:**
Open browser DevTools (Cmd+Option+I / Ctrl+Shift+I):
```javascript
// In Console, you should see:
📥 device_1: 0.12,-0.03,0.98,1.45,-0.32,0.87
📥 device_1: 0.13,-0.02,0.97,1.46,-0.31,0.88
```

---

## 🔧 Troubleshooting

### Issue 1: "Module not found: @abandonware/noble"
```bash
# Solution:
npm install @abandonware/noble
npm rebuild
```

### Issue 2: "Bluetooth not available"
**macOS:**
```bash
# Give app Bluetooth permissions
sudo xattr -cr /Applications/BLE\ Motion\ Trainer.app
```

**Linux:**
```bash
# Add user to bluetooth group
sudo usermod -a -G bluetooth $USER
# Log out and log back in

# Set capabilities for Noble
sudo setcap cap_net_raw+eip $(eval readlink -f \`which node\`)
```

### Issue 3: "Device not found when scanning"
1. Check Arduino Serial Monitor - should show "BLE advertising started"
2. Reset Arduino (press reset button)
3. Verify BLE service UUID matches:
   ```arduino
   // In Arduino sketch:
   "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
   ```
4. Try moving Arduino closer to computer

### Issue 4: "Connection timeout"
1. Make sure no other app is connected to the Arduino
2. Disconnect from macOS Bluetooth settings if paired there
3. Reset Arduino and try again
4. Check that ArduinoBLE library is latest version

### Issue 5: "gyp ERR! during npm install"
```bash
# Install build tools

# macOS:
xcode-select --install

# Ubuntu/Debian:
sudo apt-get install build-essential

# Windows:
npm install --global windows-build-tools
```

---

## ✅ Verification Checklist

- [ ] App launches without errors
- [ ] No "serialport" errors in console
- [ ] BLE state shows "poweredOn"
- [ ] Scan discovers Arduino device
- [ ] Connection establishes successfully
- [ ] IMU data streams in console
- [ ] Arduino LED turns on when connected
- [ ] Disconnection is clean (no errors)

---

## 🎯 Next Steps

Now that the base BLE connectivity works, you're ready to:

1. **Add Training UI** - Create the gesture capture interface
2. **Integrate TensorFlow.js** - Add model training logic
3. **Implement Model Export** - Convert to TFLite and generate Arduino code
4. **Create Examples** - Build sample training sessions

---

## 📚 Additional Resources

### BLE UART Protocol
- **Service UUID:** 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
- **TX (Notify):** 6E400003-B5A3-F393-E0A9-E50E24DCCA9E
- **RX (Write):** 6E400002-B5A3-F393-E0A9-E50E24DCCA9E

### Arduino Libraries
- [ArduinoBLE Documentation](https://www.arduino.cc/reference/en/libraries/arduinoble/)
- [Arduino_LSM9DS1 Documentation](https://www.arduino.cc/reference/en/libraries/arduino_lsm9ds1/)

### Noble (BLE Library)
- [Noble GitHub](https://github.com/abandonware/noble)
- [Noble API Documentation](https://github.com/abandonware/noble#api)

---

## 🐛 Debug Mode

To enable verbose logging:

**1. In main.js:**
```javascript
// At the top of the file, add:
const DEBUG = true;

// Then use throughout:
if (DEBUG) console.log('Debug info:', data);
```

**2. Run app with debug flags:**
```bash
DEBUG=* npm run dev
```

**3. Check all logs:**
```bash
# macOS/Linux:
tail -f ~/Library/Logs/ble-motion-trainer/main.log

# Windows:
type %USERPROFILE%\AppData\Roaming\ble-motion-trainer\logs\main.log
```

---

## 💾 File Structure After Setup

```
BLE_TMT/
├── main.js                          ✅ NEW VERSION
├── package.json                     ✅ UPDATED
├── package-lock.json                ✅ REGENERATED
├── preload.js                       ✅ KEEP
├── settings-manager.js              ✅ KEEP
├── public/
│   ├── profiles/
│   │   └── nano-ble.json           ✅ NEW
│   ├── index.html                   ⚠️  TO MODIFY
│   ├── client.js                    ⚠️  TO MODIFY
│   └── serial-bridge.js            ⚠️  TO RENAME/MODIFY
└── examples/
    └── arduino-nano-ble/
        ├── imu-sender.ino          ✅ NEW
        └── README.md               ✅ NEW
```

---

## 🚀 Performance Benchmarks

After successful setup, you should see:

- **Memory Usage:** ~100-150MB
- **CPU Usage:** <1% idle, 5-10% during data streaming
- **BLE Latency:** ~50ms (20Hz data rate)
- **Data Rate:** Up to 50 samples/second per device

---

## 📞 Support

If you're stuck:
1. Check the [Migration Guide](./MIGRATION_GUIDE.md)
2. Review [Troubleshooting](#🔧-troubleshooting) section
3. Enable [Debug Mode](#🐛-debug-mode)
4. Check Arduino Serial Monitor for connection status

**Common Success Indicators:**
- ✅ Arduino LED is on = Connected
- ✅ Console shows CSV data = Streaming
- ✅ No red errors in DevTools = App is healthy

---

## 🎓 Learning Path

**You are here:** ✅ Base BLE connectivity working

**Next up:**
1. UI Modifications (remove Serial options)
2. Training Interface (gesture capture)
3. ML Integration (TensorFlow.js)
4. Model Export (TFLite conversion)
5. Arduino Inference (run model on device)

Take it step by step - each milestone builds on the last!
