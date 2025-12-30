# Multi-Sensor BLE Stream

This Arduino sketch streams both **IMU (9-axis)** and **Color (APDS9960)** sensor data from the Arduino Nano 33 BLE Sense to the BLE Tiny Motion Trainer Electron app via Bluetooth Low Energy.

## Hardware Requirements

- **Arduino Nano 33 BLE Sense** (required for all sensors)
- USB cable for programming

## Onboard Sensors Used

### 1. IMU - LSM9DS1 (9-Axis)
- **Accelerometer**: 3-axis acceleration (±4g range)
- **Gyroscope**: 3-axis angular velocity (±2000 dps range)
- **Magnetometer**: 3-axis magnetic field (compass)

### 2. Color Sensor - APDS9960
- **RGB**: Red, Green, Blue color channels (0-255)
- **Clear**: Ambient light intensity (0-255)
- **Proximity**: Distance detection (0-255, where 255 = closest)

## Required Libraries

Install these libraries via Arduino IDE's Library Manager:

1. **ArduinoBLE** (by Arduino)
2. **Arduino_LSM9DS1** (by Arduino)
3. **Arduino_APDS9960** (by Arduino)

## Installation

1. Open Arduino IDE
2. Install required libraries (see above)
3. Connect your Arduino Nano 33 BLE Sense via USB
4. Select **Tools > Board > Arduino Nano 33 BLE**
5. Select the correct port under **Tools > Port**
6. Open `multi-sensor-stream.ino`
7. Click **Upload** (or press Ctrl+U / Cmd+U)

## Features

### Streaming Modes

The sketch supports three streaming modes, switchable via BLE commands:

| Mode | Command | Data Format | Values |
|------|---------|-------------|--------|
| **IMU Only** | `MODE:IMU` | `ax,ay,az,gx,gy,gz,mx,my,mz` | 9 values |
| **Color Only** | `MODE:COLOR` | `r,g,b,c,proximity` | 5 values |
| **All Sensors** (default) | `MODE:ALL` | `ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p` | 14 values |

### Data Normalization

All sensor values are normalized to the range **[-1, 1]** or **[0, 1]**:

**IMU (normalized to -1 to +1):**
- Accelerometer: ±4g → ±1
- Gyroscope: ±2000 dps → ±1
- Magnetometer: ±50 µT → ±1

**Color (normalized to 0 to 1):**
- RGB values: 0-255 → 0-1
- Clear channel: 0-255 → 0-1
- Proximity: 0-255 → 0-1

### Magnetometer Auto-Calibration

On connection, the magnetometer automatically calibrates by:
1. Sampling the magnetic field while the device is still
2. Computing a baseline heading offset
3. Subtracting this offset from all subsequent readings

This compensates for local magnetic interference (metal objects, magnets, etc.).

### Sample Rate

- **Default**: 50 Hz (20ms between samples)
- Configurable via `SAMPLE_RATE_HZ` constant (line 21)

## BLE Commands

Send these commands from the Electron app to control the Arduino:

| Command | Response | Description |
|---------|----------|-------------|
| `PING` | `PONG` | Test connectivity |
| `INFO` | Device info | Get sensor configuration |
| `MODE:IMU` | `OK:MODE_IMU` | Stream IMU data only |
| `MODE:COLOR` | `OK:MODE_COLOR` | Stream color data only |
| `MODE:ALL` | `OK:MODE_ALL` | Stream all sensors (default) |
| `LED_ON` | `OK:LED_ON` | Turn on built-in LED |
| `LED_OFF` | `OK:LED_OFF` | Turn off built-in LED |
| `RECALIBRATE` | `OK:RECALIBRATING` | Recalibrate magnetometer |

## Connection Process

1. **Upload sketch** to Arduino Nano 33 BLE Sense
2. **Open Serial Monitor** (115200 baud) to see connection status
3. **Open BLE Tiny Motion Trainer** Electron app
4. **Scan for devices** - look for `NanoBLE-MultiSensor`
5. **Connect** - LED will turn ON when connected
6. **Wait for calibration** - Magnetometer calibrates automatically (~2 seconds)
7. **Data streaming begins** - All sensor data streams at 50 Hz

## LED Indicators

- **OFF**: Not connected
- **ON (solid)**: Connected and streaming
- **Fast blink (200ms)**: No sensors detected (error)
- **Slow blink (100ms)**: BLE initialization failed (error)

## Troubleshooting

### "Failed to initialize IMU"
- **Cause**: Not using Arduino Nano 33 BLE **Sense** (needs Sense version)
- **Solution**: Verify you have the Sense model with onboard sensors

### "Failed to initialize APDS9960"
- **Cause**: Sensor communication error or incompatible board
- **Solution**: Check library installation, ensure using Nano 33 BLE Sense

### "No sensors available"
- **Cause**: Both IMU and Color sensor initialization failed
- **Solution**: Re-upload sketch, check library versions, verify board selection

### Can't connect via BLE
- **Cause**: BLE not advertising or device name mismatch
- **Solution**:
  - Check Serial Monitor for "BLE advertising started"
  - Ensure device name is `NanoBLE-MultiSensor`
  - Try power cycling the Arduino

### Data looks wrong or frozen
- **Cause**: Magnetometer not calibrated or data parsing error
- **Solution**:
  - Keep device still during initial connection (calibration phase)
  - Send `RECALIBRATE` command to re-calibrate
  - Check Serial Monitor for error messages

## Serial Monitor Output

Example output when running:

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

✅ Connected to: xx:xx:xx:xx:xx:xx
🧭 Calibrating magnetometer...
   Keep device still for calibration
✅ Magnetometer calibrated!
   Heading: [12.34, -5.67, 8.90]
📡 Streaming sensor data...
```

## Data Format Reference

### MODE_ALL (14 values):
```
ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p
```

**Example:**
```
0.0234,-0.0156,0.9821,0.0045,-0.0023,0.0001,0.0234,0.0123,-0.0456,0.3456,0.2345,0.1234,0.4567,0.6789
```

### MODE_IMU (9 values):
```
ax,ay,az,gx,gy,gz,mx,my,mz
```

### MODE_COLOR (5 values):
```
r,g,b,c,proximity
```

## Integration with BLE Tiny Motion Trainer

This sketch is designed to work seamlessly with the Electron app:

1. **IMU Tab**: Use `MODE:IMU` - streams 9-axis IMU for gesture training
2. **Color Tab**: Use `MODE:COLOR` - streams RGB+proximity for color recognition
3. **Testing**: Use `MODE:ALL` - streams everything for debugging

The app automatically switches modes based on which tab is active.

## Customization

### Change Device Name
Edit line 19:
```cpp
#define DEVICE_NAME "NanoBLE-MultiSensor"
```

### Change Sample Rate
Edit line 20:
```cpp
#define SAMPLE_RATE_HZ 50  // Change to 25, 50, 100, etc.
```

**Note**: Higher rates may cause BLE bandwidth issues. 50 Hz is recommended.

### Change Default Mode
Edit line 26:
```cpp
int currentMode = MODE_ALL_SENSORS;  // or MODE_IMU_ONLY, MODE_COLOR_ONLY
```

## License

This code is part of the BLE Tiny Motion Trainer project and follows the same license as the main repository.

## Credits

Based on Google's Tiny Motion Trainer, adapted for offline educational use with Arduino Nano 33 BLE Sense.
