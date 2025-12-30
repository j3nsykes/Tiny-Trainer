// ============================================================================
// BLE Tiny Motion Trainer - Multi-Sensor Stream
// ============================================================================
// Streams IMU (9-axis) + Color (APDS9960) sensor data via BLE UART
//
// Sensors:
// - IMU: LSM9DS1 (Accelerometer, Gyroscope, Magnetometer)
// - Color: APDS9960 (RGB, Clear, Proximity)
//
// Data Format: ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p
//
// Hardware: Arduino Nano 33 BLE Sense
// Required Libraries:
// - ArduinoBLE
// - Arduino_LSM9DS1
// - Arduino_APDS9960
// ============================================================================

#include <ArduinoBLE.h>
#include <Arduino_LSM9DS1.h>
#include <Arduino_APDS9960.h>

// ============================================================================
// Configuration
// ============================================================================

#define DEVICE_NAME "NanoBLE-MultiSensor"
#define SAMPLE_RATE_HZ 50
#define SAMPLE_INTERVAL_MS (1000 / SAMPLE_RATE_HZ)

// Data modes
#define MODE_IMU_ONLY 0
#define MODE_COLOR_ONLY 1
#define MODE_ALL_SENSORS 2

int currentMode = MODE_ALL_SENSORS;  // Default: stream all sensors

// BLE UART Service (Nordic UART Service UUID)
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// UART Characteristics
BLECharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLENotify, 512);
BLECharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 512);

// ============================================================================
// Magnetometer Calibration
// ============================================================================

float calibratedMagneticFieldHeading[3] = {0.0, 0.0, 0.0};
float lastMagneticFieldReading[3] = {0.0, 0.0, 0.0};
bool magnetometerCalibrated = false;
int calibrationSteps = 0;
const int CALIBRATION_SAMPLES = 40;
const float CALIBRATION_THRESHOLD = 10.0;

// ============================================================================
// Timing & Status
// ============================================================================

unsigned long lastSampleTime = 0;
bool isConnected = false;
bool imuEnabled = false;
bool colorEnabled = false;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait up to 3 seconds for Serial

  Serial.println("BLE Tiny Motion Trainer - Multi-Sensor Stream");
  Serial.println("==============================================");
  Serial.println("VERSION 1.1.0 - FIXED COLOR NORMALIZATION (10000)");

  // Initialize LED
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("❌ Failed to initialize IMU!");
    imuEnabled = false;
  } else {
    imuEnabled = true;
    Serial.println("✅ IMU (LSM9DS1) initialized");
    Serial.print("   Accelerometer: ");
    Serial.print(IMU.accelerationSampleRate());
    Serial.println(" Hz");
    Serial.print("   Gyroscope: ");
    Serial.print(IMU.gyroscopeSampleRate());
    Serial.println(" Hz");
    Serial.print("   Magnetometer: ");
    Serial.print(IMU.magneticFieldSampleRate());
    Serial.println(" Hz");
  }

  // Initialize Color Sensor
  if (!APDS.begin()) {
    Serial.println("❌ Failed to initialize APDS9960!");
    colorEnabled = false;
  } else {
    colorEnabled = true;

    // Boost LED current for better color readings
    // 100% = default, 150% = 1.5x, 200% = 2x, 300% = 3x
    APDS.setLEDBoost(300);  // Maximum boost for best sensitivity

    Serial.println("✅ Color Sensor (APDS9960) initialized");
    Serial.println("   RGB, Clear, Proximity enabled");
    Serial.println("   LED Boost: 300%");
  }

  // Check if at least one sensor is working
  if (!imuEnabled && !colorEnabled) {
    Serial.println("❌ No sensors available!");
    Serial.println("   Cannot continue without sensors");
    while (1) {
      // Blink LED to indicate error
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(200);
    }
  }

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1) {
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(100);
    }
  }

  Serial.println("✅ BLE initialized");

  // IMPORTANT: Add delay before BLE setup to prevent Mac crashes
  Serial.println("⏳ Waiting 3 seconds before starting BLE...");
  Serial.println("   (This prevents potential BLE stack conflicts)");
  delay(3000);

  // Set up BLE
  BLE.setLocalName(DEVICE_NAME);
  BLE.setDeviceName(DEVICE_NAME);
  BLE.setAdvertisedService(uartService);

  // Add characteristics
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);

  // Add service
  BLE.addService(uartService);

  // Set up RX callback
  rxCharacteristic.setEventHandler(BLEWritten, onRxReceived);

  // Start advertising
  BLE.advertise();

  Serial.println("✅ BLE advertising started");
  Serial.print("   Name: ");
  Serial.println(DEVICE_NAME);
  Serial.print("   Streaming mode: ");
  printCurrentMode();
  Serial.println();
  Serial.println("🔵 Waiting for connection...");
  Serial.println();
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
  // Check for BLE connection
  BLEDevice central = BLE.central();

  if (central) {
    if (!isConnected) {
      isConnected = true;
      Serial.print("✅ Connected to: ");
      Serial.println(central.address());

      // Turn on LED to indicate connection
      digitalWrite(LED_BUILTIN, HIGH);

      // Start magnetometer calibration if IMU is enabled
      if (imuEnabled) {
        Serial.println("🧭 Calibrating magnetometer...");
        Serial.println("   Keep device still for calibration");
        magnetometerCalibrated = false;
        calibrationSteps = 0;
      } else {
        magnetometerCalibrated = true; // Skip calibration if no IMU
      }
    }

    // Calibrate magnetometer first (if IMU enabled)
    if (!magnetometerCalibrated && imuEnabled) {
      calibrateMagnetometer();
      return;
    }

    // Send sensor data at specified rate
    unsigned long currentTime = millis();
    if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
      lastSampleTime = currentTime;
      sendSensorData();
    }

  } else {
    if (isConnected) {
      isConnected = false;
      magnetometerCalibrated = false;
      Serial.println("❌ Disconnected");
      Serial.println("🔵 Waiting for connection...");
      Serial.println();

      // Turn off LED
      digitalWrite(LED_BUILTIN, LOW);
    }
  }
}

// ============================================================================
// Magnetometer Calibration
// ============================================================================

void calibrateMagnetometer() {
  if (!IMU.magneticFieldAvailable()) {
    return;
  }

  float mx, my, mz;
  IMU.readMagneticField(mx, my, mz);

  // Running average
  calibratedMagneticFieldHeading[0] += mx;
  calibratedMagneticFieldHeading[1] += my;
  calibratedMagneticFieldHeading[2] += mz;
  calibratedMagneticFieldHeading[0] /= 2.0;
  calibratedMagneticFieldHeading[1] /= 2.0;
  calibratedMagneticFieldHeading[2] /= 2.0;

  calibrationSteps++;

  // Check if stable
  if (calibrationSteps > CALIBRATION_SAMPLES) {
    if (abs(calibratedMagneticFieldHeading[0] - mx) < CALIBRATION_THRESHOLD &&
        abs(calibratedMagneticFieldHeading[1] - my) < CALIBRATION_THRESHOLD &&
        abs(calibratedMagneticFieldHeading[2] - mz) < CALIBRATION_THRESHOLD) {
      magnetometerCalibrated = true;
      Serial.println("✅ Magnetometer calibrated!");
      Serial.print("   Heading: [");
      Serial.print(calibratedMagneticFieldHeading[0]);
      Serial.print(", ");
      Serial.print(calibratedMagneticFieldHeading[1]);
      Serial.print(", ");
      Serial.print(calibratedMagneticFieldHeading[2]);
      Serial.println("]");
      Serial.println("📡 Streaming sensor data...");
      Serial.println();
    }
  }
}

// ============================================================================
// Send Sensor Data
// ============================================================================

void sendSensorData() {
  char buffer[256];

  switch (currentMode) {
    case MODE_IMU_ONLY:
      sendIMUData(buffer);
      break;

    case MODE_COLOR_ONLY:
      sendColorData(buffer);
      break;

    case MODE_ALL_SENSORS:
      sendAllSensorsData(buffer);
      break;
  }
}

// Send IMU data only (9 values)
void sendIMUData(char* buffer) {
  if (!imuEnabled) return;

  float ax, ay, az;  // Accelerometer
  float gx, gy, gz;  // Gyroscope
  float mx, my, mz;  // Magnetometer

  // Read accelerometer and gyroscope
  if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
    IMU.readAcceleration(ax, ay, az);
    IMU.readGyroscope(gx, gy, gz);

    // Read magnetometer (or use last reading if new data not available)
    if (IMU.magneticFieldAvailable()) {
      IMU.readMagneticField(mx, my, mz);
      lastMagneticFieldReading[0] = mx;
      lastMagneticFieldReading[1] = my;
      lastMagneticFieldReading[2] = mz;
    } else {
      mx = lastMagneticFieldReading[0];
      my = lastMagneticFieldReading[1];
      mz = lastMagneticFieldReading[2];
    }

    // Apply calibration to magnetometer
    mx -= calibratedMagneticFieldHeading[0];
    my -= calibratedMagneticFieldHeading[1];
    mz -= calibratedMagneticFieldHeading[2];

    // Normalize values
    ax = ax / 4.0;   // -4g to +4g → -1 to +1
    ay = ay / 4.0;
    az = az / 4.0;

    gx = gx / 2000.0;  // -2000dps to +2000dps → -1 to +1
    gy = gy / 2000.0;
    gz = gz / 2000.0;

    mx = mx / 50.0;  // -50 to +50 µT → -1 to +1
    my = my / 50.0;
    mz = mz / 50.0;

    // Format as CSV: ax,ay,az,gx,gy,gz,mx,my,mz
    snprintf(buffer, 256, "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f\n",
             ax, ay, az, gx, gy, gz, mx, my, mz);

    txCharacteristic.writeValue((uint8_t*)buffer, strlen(buffer));
  }
}

// Send color data only (5 values)
void sendColorData(char* buffer) {
  if (!colorEnabled) return;

  // CRITICAL: Wait for color data to be available
  // The APDS9960 needs time to complete a reading cycle
  if (!APDS.colorAvailable()) {
    return; // Skip this sample if data not ready yet
  }

  int r, g, b, c;
  static bool debugPrinted = false;

  // Read color data
  APDS.readColor(r, g, b, c);

  // Read proximity (0-255)
  int proximity = 0;
  if (APDS.proximityAvailable()) {
    proximity = APDS.readProximity();
  }

  // Debug: Print RAW values once
  if (!debugPrinted) {
    Serial.println("🔍 Color Sensor Reading:");
    Serial.print("   RAW Values: R=");
    Serial.print(r);
    Serial.print(", G=");
    Serial.print(g);
    Serial.print(", B=");
    Serial.print(b);
    Serial.print(", C=");
    Serial.print(c);
    Serial.print(", P=");
    Serial.println(proximity);
    debugPrinted = true;
  }

  // Normalize color values using RELATIVE normalization (like Arduino fruit example)
  // This makes it lighting-independent - only ratios matter, not absolute brightness
  int colorTotal = r + g + b;
  float rNorm, gNorm, bNorm, cNorm, pNorm;

  if (colorTotal > 0) {
    // Relative normalization: each color as fraction of total
    rNorm = (float)r / colorTotal;
    gNorm = (float)g / colorTotal;
    bNorm = (float)b / colorTotal;
    cNorm = (float)c / 255.0;  // Keep clear absolute (for brightness info)
    pNorm = proximity / 255.0;  // Keep proximity absolute
  } else {
    // No light detected
    rNorm = gNorm = bNorm = 0.0;
    cNorm = 0.0;
    pNorm = proximity / 255.0;
  }

  // Format as CSV: r,g,b,c,proximity
  snprintf(buffer, 256, "%.4f,%.4f,%.4f,%.4f,%.4f\n",
           rNorm, gNorm, bNorm, cNorm, pNorm);

  txCharacteristic.writeValue((uint8_t*)buffer, strlen(buffer));
}

// Send all sensor data (14 values)
void sendAllSensorsData(char* buffer) {
  float ax = 0, ay = 0, az = 0;
  float gx = 0, gy = 0, gz = 0;
  float mx = 0, my = 0, mz = 0;
  float rNorm = 0, gNorm = 0, bNorm = 0, cNorm = 0, pNorm = 0;

  // Cache last color reading (APDS9960 updates slower than IMU)
  static float lastColorReading[5] = {0, 0, 0, 0, 0}; // r, g, b, c, p

  // Read IMU data
  if (imuEnabled && IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
    IMU.readAcceleration(ax, ay, az);
    IMU.readGyroscope(gx, gy, gz);

    // Read magnetometer
    if (IMU.magneticFieldAvailable()) {
      IMU.readMagneticField(mx, my, mz);
      lastMagneticFieldReading[0] = mx;
      lastMagneticFieldReading[1] = my;
      lastMagneticFieldReading[2] = mz;
    } else {
      mx = lastMagneticFieldReading[0];
      my = lastMagneticFieldReading[1];
      mz = lastMagneticFieldReading[2];
    }

    // Apply calibration
    mx -= calibratedMagneticFieldHeading[0];
    my -= calibratedMagneticFieldHeading[1];
    mz -= calibratedMagneticFieldHeading[2];

    // Normalize IMU
    ax = ax / 4.0;
    ay = ay / 4.0;
    az = az / 4.0;
    gx = gx / 2000.0;
    gy = gy / 2000.0;
    gz = gz / 2000.0;
    mx = mx / 50.0;
    my = my / 50.0;
    mz = mz / 50.0;
  }

  // Read color data - only if available, otherwise use cached values
  if (colorEnabled && APDS.colorAvailable()) {
    int r, g, b, c;
    APDS.readColor(r, g, b, c);

    int proximity = 0;
    if (APDS.proximityAvailable()) {
      proximity = APDS.readProximity();
    }

    // Normalize color using RELATIVE normalization (lighting-independent)
    int colorTotal = r + g + b;

    if (colorTotal > 0) {
      // Relative normalization: each color as fraction of total
      rNorm = (float)r / colorTotal;
      gNorm = (float)g / colorTotal;
      bNorm = (float)b / colorTotal;
      cNorm = (float)c / 255.0;  // Keep clear absolute (for brightness info)
      pNorm = proximity / 255.0;  // Keep proximity absolute
    } else {
      // No light detected - use last cached values or zeros
      rNorm = lastColorReading[0];
      gNorm = lastColorReading[1];
      bNorm = lastColorReading[2];
      cNorm = 0.0;
      pNorm = proximity / 255.0;
    }

    // Cache the reading
    lastColorReading[0] = rNorm;
    lastColorReading[1] = gNorm;
    lastColorReading[2] = bNorm;
    lastColorReading[3] = cNorm;
    lastColorReading[4] = pNorm;
  } else if (colorEnabled) {
    // Use cached values when new data not available
    rNorm = lastColorReading[0];
    gNorm = lastColorReading[1];
    bNorm = lastColorReading[2];
    cNorm = lastColorReading[3];
    pNorm = lastColorReading[4];
  }

  // Format as CSV: ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p
  snprintf(buffer, 256, "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f\n",
           ax, ay, az, gx, gy, gz, mx, my, mz, rNorm, gNorm, bNorm, cNorm, pNorm);

  txCharacteristic.writeValue((uint8_t*)buffer, strlen(buffer));
}

// ============================================================================
// BLE RX Callback
// ============================================================================

void onRxReceived(BLEDevice central, BLECharacteristic characteristic) {
  int length = rxCharacteristic.valueLength();
  if (length == 0) return;

  // Read command
  uint8_t buffer[256];
  rxCharacteristic.readValue(buffer, length);
  buffer[length] = '\0';

  String command = String((char*)buffer);
  command.trim();

  Serial.print("📥 Received command: ");
  Serial.println(command);

  // Handle commands
  if (command == "PING") {
    txCharacteristic.writeValue("PONG\n");
    Serial.println("📤 Sent: PONG");
  }
  else if (command == "INFO") {
    String info = "Device: " + String(DEVICE_NAME) + "\n";
    info += "IMU: " + String(imuEnabled ? "LSM9DS1 (9-axis)" : "Disabled") + "\n";
    info += "Color: " + String(colorEnabled ? "APDS9960 (RGB+Proximity)" : "Disabled") + "\n";
    info += "Sample Rate: " + String(SAMPLE_RATE_HZ) + " Hz\n";
    info += "Mode: ";

    switch (currentMode) {
      case MODE_IMU_ONLY:
        info += "IMU Only (9 values)\n";
        info += "Format: ax,ay,az,gx,gy,gz,mx,my,mz\n";
        break;
      case MODE_COLOR_ONLY:
        info += "Color Only (5 values)\n";
        info += "Format: r,g,b,c,proximity\n";
        break;
      case MODE_ALL_SENSORS:
        info += "All Sensors (14 values)\n";
        info += "Format: ax,ay,az,gx,gy,gz,mx,my,mz,r,g,b,c,p\n";
        break;
    }

    txCharacteristic.writeValue(info.c_str());
    Serial.println("📤 Sent: INFO");
  }
  else if (command == "MODE:IMU") {
    currentMode = MODE_IMU_ONLY;
    Serial.print("🔄 Mode changed to: ");
    printCurrentMode();
    txCharacteristic.writeValue("OK:MODE_IMU\n");
  }
  else if (command == "MODE:COLOR") {
    currentMode = MODE_COLOR_ONLY;
    Serial.print("🔄 Mode changed to: ");
    printCurrentMode();
    txCharacteristic.writeValue("OK:MODE_COLOR\n");
  }
  else if (command == "MODE:ALL") {
    currentMode = MODE_ALL_SENSORS;
    Serial.print("🔄 Mode changed to: ");
    printCurrentMode();
    txCharacteristic.writeValue("OK:MODE_ALL\n");
  }
  else if (command == "LED_ON") {
    digitalWrite(LED_BUILTIN, HIGH);
    Serial.println("💡 LED ON");
    txCharacteristic.writeValue("OK:LED_ON\n");
  }
  else if (command == "LED_OFF") {
    digitalWrite(LED_BUILTIN, LOW);
    Serial.println("💡 LED OFF");
    txCharacteristic.writeValue("OK:LED_OFF\n");
  }
  else if (command == "RECALIBRATE") {
    if (imuEnabled) {
      Serial.println("🧭 Recalibrating magnetometer...");
      magnetometerCalibrated = false;
      calibrationSteps = 0;
      calibratedMagneticFieldHeading[0] = 0;
      calibratedMagneticFieldHeading[1] = 0;
      calibratedMagneticFieldHeading[2] = 0;
      txCharacteristic.writeValue("OK:RECALIBRATING\n");
    } else {
      txCharacteristic.writeValue("ERROR:NO_IMU\n");
    }
  }
  else {
    Serial.println("❓ Unknown command");
    txCharacteristic.writeValue("ERROR:UNKNOWN_COMMAND\n");
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

void printCurrentMode() {
  switch (currentMode) {
    case MODE_IMU_ONLY:
      Serial.println("IMU Only");
      break;
    case MODE_COLOR_ONLY:
      Serial.println("Color Only");
      break;
    case MODE_ALL_SENSORS:
      Serial.println("All Sensors");
      break;
  }
}
