# Testing Guide: Multi-Sensor Stream

This guide walks you through testing the new multi-sensor Arduino sketch with your existing BLE Tiny Motion Trainer Electron app.

## Quick Start Testing

### Step 1: Upload the Sketch

1. Open `multi-sensor-stream.ino` in Arduino IDE
2. Install required libraries (if not already installed):
   - ArduinoBLE
   - Arduino_LSM9DS1
   - Arduino_APDS9960
3. Select **Board**: Arduino Nano 33 BLE
4. Upload to your Arduino Nano 33 BLE Sense

### Step 2: Verify Serial Output

1. Open Serial Monitor (115200 baud)
2. You should see:

```
BLE Tiny Motion Trainer - Multi-Sensor Stream
==============================================
✅ IMU (LSM9DS1) initialized
   Accelerometer: 119 Hz
   Gyroscope: 119 Hz
   Magnetometer: 20 Hz
✅ Color Sensor (APDS9960) initialized
   RGB, Clear, Proximity enabled
✅ BLE initialized
✅ BLE advertising started
   Name: NanoBLE-MultiSensor
   Streaming mode: All Sensors

🔵 Waiting for connection...
```

3. **If you see errors**, check the README troubleshooting section

### Step 3: Connect from Existing App

Since your existing app expects **9 IMU values**, we need to test in **IMU-only mode** first:

1. Open your BLE Tiny Motion Trainer Electron app
2. Click **"New Connection"** or scan for devices
3. Look for device named **`NanoBLE-MultiSensor`**
4. Connect to the device

### Step 4: Switch to IMU-Only Mode

The app currently expects the old format (9 values). To test without modifying the app yet:

**Option A: Modify Arduino code temporarily**
- In `multi-sensor-stream.ino`, change line 26:
  ```cpp
  int currentMode = MODE_IMU_ONLY;  // Changed from MODE_ALL_SENSORS
  ```
- Re-upload the sketch

**Option B: Send BLE command (if you have a way to send commands)**
- Send command: `MODE:IMU`
- Arduino will respond: `OK:MODE_IMU`

### Step 5: Verify Data Streaming

1. In the Electron app, you should see:
   - Device status: **Connected**
   - IMU data streaming (9 values)
   - Real-time visualization of accelerometer/gyro/magnetometer

2. Wave the Arduino around - you should see data changing

3. In Serial Monitor, you should see:
   ```
   ✅ Connected to: xx:xx:xx:xx:xx:xx
   🧭 Calibrating magnetometer...
   ✅ Magnetometer calibrated!
   📡 Streaming sensor data...
   ```

## Testing Each Mode

### Test 1: IMU Only Mode (Backward Compatible)

**Purpose**: Verify existing app works with new sketch

**Data format**: `ax,ay,az,gx,gy,gz,mx,my,mz` (9 values)

**Test steps**:
1. Set `currentMode = MODE_IMU_ONLY`
2. Upload sketch
3. Connect from app
4. Verify gesture training works exactly as before
5. Try capturing a gesture
6. Verify data visualization shows 9 axes

**Expected result**: App works identically to old `imu-sender-9axis` sketch

---

### Test 2: Color Only Mode (Preparation for Color Tab)

**Purpose**: Test color sensor data streaming

**Data format**: `r,g,b,c,proximity` (5 values)

**Test steps**:
1. Set `currentMode = MODE_COLOR_ONLY`
2. Upload sketch
3. Connect from app
4. **Note**: App will likely show errors since it expects 9 values
5. Check Serial Monitor - verify data is streaming
6. Use Serial Plotter (Tools > Serial Plotter) to visualize:
   - Uncomment line 393 in the sketch: `Serial.print(buffer);`
   - Re-upload
   - Watch color values change as you show different colored objects

**Expected result**: Color data streams, but app doesn't parse it yet (expected)

---

### Test 3: All Sensors Mode (Future Multi-Modal)

**Purpose**: Test simultaneous IMU + Color streaming

**Data format**: `ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p` (14 values)

**Test steps**:
1. Set `currentMode = MODE_ALL_SENSORS`
2. Upload sketch
3. Connect from app
4. **Note**: App will likely parse only first 9 values (expected)
5. Check Serial Monitor
6. Verify both sensors are working

**Expected result**: Both sensors stream, app ignores color data for now

---

## Command Testing

If you can send BLE commands (via Arduino Serial Monitor or custom tool):

### Send Commands via Serial

Add this code to the sketch to test commands without the app:

```cpp
// In loop(), add:
if (Serial.available()) {
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  // Simulate BLE command
  rxCharacteristic.writeValue(cmd.c_str());
}
```

Then in Serial Monitor, type commands:

```
PING           → Should respond: PONG
INFO           → Should respond: Device info
MODE:IMU       → Switches to IMU only
MODE:COLOR     → Switches to Color only
MODE:ALL       → Switches to All sensors
LED_ON         → Turns on LED
LED_OFF        → Turns off LED
RECALIBRATE    → Recalibrates magnetometer
```

---

## Data Validation Tests

### IMU Data Validation

1. **Place Arduino flat on table**:
   - `az` should be ≈ 0.98 to 1.0 (gravity)
   - `ax`, `ay` should be ≈ 0

2. **Rotate 90° on side**:
   - `ax` or `ay` should be ≈ ±1.0
   - `az` should be ≈ 0

3. **Shake rapidly**:
   - `gx`, `gy`, `gz` should show large values
   - All values should return to ≈ 0 when still

4. **Rotate slowly (compass test)**:
   - `mx`, `my`, `mz` should change as orientation changes
   - Note: Magnetometer is sensitive to metal objects nearby

### Color Data Validation

1. **Cover sensor with hand**:
   - All values (`r`, `g`, `b`, `c`) should be ≈ 0
   - `proximity` should be ≈ 1.0 (maximum)

2. **Show red object**:
   - `r` should be > `g` and > `b`
   - `c` (clear) should show ambient light level

3. **Show blue object**:
   - `b` should be > `r` and > `g`

4. **Show white paper**:
   - `r`, `g`, `b` should all be high and roughly equal
   - `c` should be high

5. **Hold object at different distances**:
   - `proximity` should decrease as object moves away
   - `proximity` ≈ 1.0 when very close
   - `proximity` ≈ 0 when far away

---

## Performance Testing

### Bandwidth Test

1. Connect to app
2. Monitor Serial output for dropped packets or delays
3. Verify sample rate stays at 50 Hz

**Indicators of issues**:
- Serial messages like "Buffer overflow"
- Inconsistent timing between samples
- App shows "Disconnected" intermittently

**Solutions**:
- Reduce sample rate to 25 Hz
- Switch to single-sensor mode
- Increase BLE characteristic buffer size (currently 512 bytes)

### Memory Usage

Check Arduino memory usage after compilation:

```
Sketch uses X bytes (X%) of program storage space. Maximum is 983040 bytes.
Global variables use X bytes (X%) of dynamic memory, leaving X bytes for local variables.
```

**Safe ranges**:
- Program storage: < 80%
- Dynamic memory: < 60%

If memory is too high:
- Remove debug Serial.print() statements
- Reduce buffer sizes
- Disable unused sensors

---

## Debugging Tips

### Enable Verbose Logging

Uncomment these lines to see all data:

```cpp
// Line 393: In sendColorData()
Serial.print(buffer);  // Shows color values

// Line 327: In sendIMUData()
Serial.print(buffer);  // Shows IMU values

// Line 393: In sendAllSensorsData()
Serial.print(buffer);  // Shows all sensor values
```

### Monitor Connection Status

Watch for these Serial messages:

- `✅ Connected to: ...` - Connection established
- `❌ Disconnected` - Connection lost
- `📥 Received command: ...` - Command received from app
- `📤 Sent: ...` - Response sent to app

### Common Issues

**Issue**: Magnetometer never calibrates
- **Solution**: Keep device completely still during calibration
- **Alternative**: Increase `CALIBRATION_THRESHOLD` (line 39)

**Issue**: Color values always zero
- **Solution**: Ensure APDS9960 library is installed correctly
- **Check**: Device is Nano 33 BLE **Sense** (not regular BLE)

**Issue**: BLE won't connect
- **Solution**: Power cycle Arduino, restart Electron app
- **Check**: Device name matches what app is scanning for

---

## Next Steps

Once you've verified the Arduino sketch works:

1. ✅ **Phase 0 Complete**: Arduino streams both IMU and Color data
2. **Next**: Modify Electron app to:
   - Parse 14-value format (all sensors)
   - Switch modes based on active tab
   - Add color data visualization
   - Implement color data collection

---

## Test Checklist

Use this checklist to verify everything works:

- [ ] Sketch compiles without errors
- [ ] All three sensor libraries are installed
- [ ] Serial Monitor shows successful initialization
- [ ] BLE advertising starts
- [ ] Device appears in app scan results
- [ ] Connection succeeds from app
- [ ] Magnetometer calibrates automatically
- [ ] IMU data streams (9 values)
- [ ] IMU data looks reasonable (gravity ≈ 1.0)
- [ ] Color data streams (5 values)
- [ ] Color sensor responds to different colored objects
- [ ] Proximity sensor detects nearby objects
- [ ] All sensors work simultaneously (14 values)
- [ ] LED turns ON when connected
- [ ] LED turns OFF when disconnected
- [ ] Can send commands via BLE (PING, INFO, etc.)
- [ ] Can switch modes (IMU, COLOR, ALL)
- [ ] No memory overflow warnings
- [ ] No BLE disconnection issues

---

## Troubleshooting Contact

If you encounter issues not covered here:

1. Check Serial Monitor output for specific error messages
2. Review README.md troubleshooting section
3. Verify library versions match requirements
4. Test with original `imu-sender-9axis` sketch to isolate issue

Happy testing! 🚀
