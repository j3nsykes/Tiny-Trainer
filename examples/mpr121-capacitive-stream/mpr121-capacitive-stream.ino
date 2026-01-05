// ============================================================================
// BLE Tiny Motion Trainer - MPR121 Capacitive Sensor Stream
// ============================================================================
// Streams MPR121 capacitive sensor filtered data (proximity) via BLE UART
//
// Sensor:
// - MPR121: 12-electrode capacitive touch/proximity sensor
//
// Data Format: e0,e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11
// (12 filtered/proximity values, one per electrode)
//
// Hardware:
// - Arduino Nano 33 BLE Sense
// - MPR121 Capacitive Touch Sensor (I2C)
//
// Required Libraries:
// - ArduinoBLE
// - Adafruit_MPR121
// ============================================================================

#include <ArduinoBLE.h>
#include <Wire.h>
#include "Adafruit_MPR121.h"
#include "MPR121_Helper.h"

// ============================================================================
// Configuration
// ============================================================================

#define DEVICE_NAME "NanoBLE-MPR121"
#define SAMPLE_RATE_HZ 50
#define SAMPLE_INTERVAL_MS (1000 / SAMPLE_RATE_HZ)
#define NUM_ELECTRODES 12

// MPR121 I2C address (default is 0x5A)
#define MPR121_I2C_ADDR 0x5A

// Touch/Release thresholds for the sensor
#define TOUCH_THRESHOLD 40
#define RELEASE_THRESHOLD 20

// BLE UART Service (Nordic UART Service UUID)
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// UART Characteristics
BLECharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLENotify, 512);
BLECharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 512);

// ============================================================================
// Sensor Objects
// ============================================================================

Adafruit_MPR121 cap = Adafruit_MPR121();
MPR121_Helper touch(&cap);

// ============================================================================
// Timing & Status
// ============================================================================

unsigned long lastSampleTime = 0;
bool isConnected = false;
bool sensorEnabled = false;

// Normalization constants for filtered data
// MPR121 filtered data typically ranges from ~200-1000+
// Higher values = closer proximity
const float FILTERED_DATA_MIN = 0.0;
const float FILTERED_DATA_MAX = 1000.0;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait up to 3 seconds for Serial

  Serial.println("BLE Tiny Motion Trainer - MPR121 Capacitive Stream");
  Serial.println("===================================================");
  Serial.println("VERSION 1.0.0");

  // Initialize LED
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  // Initialize I2C
  Wire.begin();

  // Initialize MPR121
  if (!cap.begin(MPR121_I2C_ADDR)) {
    Serial.println("❌ Failed to initialize MPR121!");
    Serial.println("   Check wiring and I2C address (0x5A)");
    sensorEnabled = false;

    // Blink LED to indicate error
    while (1) {
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(200);
    }
  } else {
    sensorEnabled = true;
    Serial.println("✅ MPR121 Capacitive Sensor initialized");
    Serial.print("   I2C Address: 0x");
    Serial.println(MPR121_I2C_ADDR, HEX);
    Serial.print("   Electrodes: ");
    Serial.println(NUM_ELECTRODES);
    Serial.print("   Touch Threshold: ");
    Serial.println(TOUCH_THRESHOLD);
    Serial.print("   Release Threshold: ");
    Serial.println(RELEASE_THRESHOLD);

    // Configure sensor thresholds
    touch.setThresholds(TOUCH_THRESHOLD, RELEASE_THRESHOLD);

    // Enable auto-configuration for best performance
    cap.setAutoconfig(true);
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
  Serial.print("   Sample Rate: ");
  Serial.print(SAMPLE_RATE_HZ);
  Serial.println(" Hz");
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
      Serial.println("📡 Streaming capacitive sensor data...");
      Serial.println();

      // Turn on LED to indicate connection
      digitalWrite(LED_BUILTIN, HIGH);
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
      Serial.println("❌ Disconnected");
      Serial.println("🔵 Waiting for connection...");
      Serial.println();

      // Turn off LED
      digitalWrite(LED_BUILTIN, LOW);
    }
  }
}

// ============================================================================
// Send Sensor Data
// ============================================================================

void sendSensorData() {
  if (!sensorEnabled) return;

  char buffer[256];

  // Update filtered data from sensor
  touch.updateFilteredData();

  // Build CSV string with all 12 electrode values
  String dataStr = "";

  for (uint8_t i = 0; i < NUM_ELECTRODES; i++) {
    uint16_t rawFiltered = touch.getFilteredData(i);

    // Normalize to 0.0-1.0 range
    // Based on actual testing: sensor already outputs inverted values
    // Higher normalized values = closer proximity (no manual inversion needed)
    float normalized = (float)rawFiltered / FILTERED_DATA_MAX;

    // Clamp to valid range
    if (normalized > 1.0) normalized = 1.0;
    if (normalized < 0.0) normalized = 0.0;

    // Format to 4 decimal places using String
    dataStr += String(normalized, 4);

    // Add comma separator (except for last value)
    if (i < NUM_ELECTRODES - 1) {
      dataStr += ",";
    }
  }

  // Add newline
  dataStr += "\n";

  // Send via BLE
  txCharacteristic.writeValue((uint8_t*)dataStr.c_str(), dataStr.length());
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
    info += "Sensor: MPR121 (12-electrode capacitive)\n";
    info += "Electrodes: " + String(NUM_ELECTRODES) + "\n";
    info += "Sample Rate: " + String(SAMPLE_RATE_HZ) + " Hz\n";
    info += "Data Type: Filtered (proximity)\n";
    info += "Format: e0,e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11\n";
    info += "Values: 0.0-1.0 (normalized, higher = closer)\n";

    txCharacteristic.writeValue(info.c_str());
    Serial.println("📤 Sent: INFO");
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
  else if (command.startsWith("THRESHOLD:")) {
    // Parse threshold command: THRESHOLD:touch,release
    // Example: THRESHOLD:40,20
    int commaIndex = command.indexOf(',', 10);
    if (commaIndex > 0) {
      String touchStr = command.substring(10, commaIndex);
      String releaseStr = command.substring(commaIndex + 1);

      uint8_t touchThresh = touchStr.toInt();
      uint8_t releaseThresh = releaseStr.toInt();

      if (touchThresh > 0 && releaseThresh > 0) {
        touch.setThresholds(touchThresh, releaseThresh);
        Serial.print("🎚️ Thresholds updated: Touch=");
        Serial.print(touchThresh);
        Serial.print(", Release=");
        Serial.println(releaseThresh);
        txCharacteristic.writeValue("OK:THRESHOLD_SET\n");
      } else {
        txCharacteristic.writeValue("ERROR:INVALID_THRESHOLD\n");
      }
    } else {
      txCharacteristic.writeValue("ERROR:INVALID_FORMAT\n");
    }
  }
  else if (command == "DEBUG") {
    // Print raw filtered values for debugging
    Serial.println("🔍 Debug: Raw Filtered Values");
    touch.updateFilteredData();
    for (uint8_t i = 0; i < NUM_ELECTRODES; i++) {
      Serial.print("   E");
      Serial.print(i);
      Serial.print(": ");
      Serial.println(touch.getFilteredData(i));
    }
    txCharacteristic.writeValue("OK:DEBUG_PRINTED\n");
  }
  else {
    Serial.println("❓ Unknown command");
    txCharacteristic.writeValue("ERROR:UNKNOWN_COMMAND\n");
  }
}
