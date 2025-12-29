// ============================================================================
// BLE Tiny Motion Trainer - IMU Sender (9-Axis)
// ============================================================================
// Streams 9-axis IMU data via BLE UART
// - Accelerometer (ax, ay, az)
// - Gyroscope (gx, gy, gz)
// - Magnetometer (mx, my, mz)
// 
// Based on Arduino Nano 33 BLE Sense with LSM9DS1 IMU
// ============================================================================

#include <ArduinoBLE.h>
#include <Arduino_LSM9DS1.h>

// ============================================================================
// Configuration
// ============================================================================

#define DEVICE_NAME "NanoBLE-IMU-9Axis"
#define SAMPLE_RATE_HZ 50
#define SAMPLE_INTERVAL_MS (1000 / SAMPLE_RATE_HZ)

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
// Timing
// ============================================================================

unsigned long lastSampleTime = 0;
bool isConnected = false;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait up to 3 seconds for Serial
  
  Serial.println("BLE Tiny Motion Trainer - IMU Sender (9-Axis)");
  Serial.println("================================================");
  
  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("❌ Failed to initialize IMU!");
    while (1);
  }
  
  Serial.println("✅ IMU initialized");
  Serial.print("   Accelerometer sample rate: ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println(" Hz");
  Serial.print("   Gyroscope sample rate: ");
  Serial.print(IMU.gyroscopeSampleRate());
  Serial.println(" Hz");
  Serial.print("   Magnetometer sample rate: ");
  Serial.print(IMU.magneticFieldSampleRate());
  Serial.println(" Hz");
  
  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1);
  }
  
  Serial.println("✅ BLE initialized");
  
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
      
      // Start magnetometer calibration
      Serial.println("🧭 Calibrating magnetometer...");
      Serial.println("   Keep device still for calibration");
      magnetometerCalibrated = false;
      calibrationSteps = 0;
    }
    
    // Calibrate magnetometer first
    if (!magnetometerCalibrated) {
      calibrateMagnetometer();
      return;
    }
    
    // Send IMU data at specified rate
    unsigned long currentTime = millis();
    if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
      lastSampleTime = currentTime;
      
      if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
        sendIMUData();
      }
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
      Serial.println("📡 Streaming 9-axis IMU data...");
      Serial.println();
    }
  }
}

// ============================================================================
// Read and Send IMU Data
// ============================================================================

void sendIMUData() {
  float ax, ay, az;  // Accelerometer
  float gx, gy, gz;  // Gyroscope
  float mx, my, mz;  // Magnetometer
  
  // Read accelerometer and gyroscope
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
  // Accelerometer: -4g to +4g → normalize to -1 to +1
  ax = ax / 4.0;
  ay = ay / 4.0;
  az = az / 4.0;
  
  // Gyroscope: -2000dps to +2000dps → normalize to -1 to +1
  gx = gx / 2000.0;
  gy = gy / 2000.0;
  gz = gz / 2000.0;
  
  // Magnetometer: typically -50 to +50 µT → normalize to -1 to +1
  mx = mx / 50.0;
  my = my / 50.0;
  mz = mz / 50.0;
  
  // Format as CSV: ax,ay,az,gx,gy,gz,mx,my,mz
  char buffer[128];
  snprintf(buffer, sizeof(buffer), "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f\n",
           ax, ay, az, gx, gy, gz, mx, my, mz);
  
  // Send via BLE
  txCharacteristic.writeValue((uint8_t*)buffer, strlen(buffer));
  
  // Optional: Print to Serial for debugging (comment out for performance)
  // Serial.print(buffer);
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
    info += "IMU: LSM9DS1 (9-axis)\n";
    info += "Sample Rate: " + String(SAMPLE_RATE_HZ) + " Hz\n";
    info += "Format: ax,ay,az,gx,gy,gz,mx,my,mz\n";
    txCharacteristic.writeValue(info.c_str());
    Serial.println("📤 Sent: INFO");
  }
  else if (command == "LED_ON") {
    digitalWrite(LED_BUILTIN, HIGH);
    Serial.println("💡 LED ON");
  }
  else if (command == "LED_OFF") {
    digitalWrite(LED_BUILTIN, LOW);
    Serial.println("💡 LED OFF");
  }
  else if (command == "RECALIBRATE") {
    Serial.println("🧭 Recalibrating magnetometer...");
    magnetometerCalibrated = false;
    calibrationSteps = 0;
    calibratedMagneticFieldHeading[0] = 0;
    calibratedMagneticFieldHeading[1] = 0;
    calibratedMagneticFieldHeading[2] = 0;
  }
  else {
    Serial.println("❓ Unknown command");
  }
}
