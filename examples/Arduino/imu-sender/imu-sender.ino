// ============================================================================
// Arduino Nano 33 BLE Sense - IMU Data Sender
// ============================================================================
// Streams accelerometer and gyroscope data via BLE UART for use with
// BLE Tiny Motion Trainer
//
// Hardware: Arduino Nano 33 BLE Sense (or regular Nano 33 BLE)
// Libraries Required:
// - ArduinoBLE
// - Arduino_LSM9DS1
//
// Data Format: ax,ay,az,gx,gy,gz\n (CSV with newline)
// Example: 0.12,-0.03,0.98,1.45,-0.32,0.87
// ============================================================================

#include <ArduinoBLE.h>
#include <Arduino_LSM9DS1.h>

// ============================================================================
// BLE UART Service Configuration
// ============================================================================
// Using Nordic UART Service (NUS) UUIDs - standard for BLE serial communication

#define BLE_LOCAL_NAME          "NanoBLE-IMU"
#define BLE_DEVICE_NAME         "Nano33BLE"

// Nordic UART Service UUID
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// TX Characteristic (Arduino -> Computer)
// Properties: Notify
BLECharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", 
                                    BLENotify, 
                                    512);  // 512 byte buffer

// RX Characteristic (Computer -> Arduino)
// Properties: Write, Write Without Response
BLECharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", 
                                    BLEWrite | BLEWriteWithoutResponse, 
                                    512);

// ============================================================================
// Configuration
// ============================================================================

const int LED_PIN = LED_BUILTIN;
const int SAMPLE_RATE = 50;           // Hz (samples per second)
const int SAMPLE_DELAY = 1000 / SAMPLE_RATE;  // milliseconds

bool deviceConnected = false;
unsigned long lastSampleTime = 0;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  // Initialize serial for debugging (optional)
  Serial.begin(9600);
  delay(1000);
  
  Serial.println("BLE Tiny Motion Trainer - IMU Sender");
  Serial.println("====================================");

  // Initialize LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("❌ Failed to initialize IMU!");
    Serial.println("   Make sure you're using Arduino Nano 33 BLE Sense");
    while (1) {
      // Blink LED rapidly to indicate error
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      delay(100);
    }
  }

  Serial.println("✅ IMU initialized");
  Serial.print("   Accelerometer sample rate: ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println(" Hz");
  Serial.print("   Gyroscope sample rate: ");
  Serial.print(IMU.gyroscopeSampleRate());
  Serial.println(" Hz");

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1) {
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      delay(200);
    }
  }

  Serial.println("✅ BLE initialized");

  // Set BLE device name and local name
  BLE.setLocalName(BLE_LOCAL_NAME);
  BLE.setDeviceName(BLE_DEVICE_NAME);

  // Add the UART service
  BLE.setAdvertisedService(uartService);
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);
  BLE.addService(uartService);

  // Set up RX characteristic event handler
  rxCharacteristic.setEventHandler(BLEWritten, onRxCharacteristicWritten);

  // Start advertising
  BLE.advertise();

  Serial.println("✅ BLE advertising started");
  Serial.print("   Name: ");
  Serial.println(BLE_LOCAL_NAME);
  Serial.println("\n🔵 Waiting for connection...");
  Serial.println("   Open BLE Tiny Motion Trainer and scan for devices");
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
  // Wait for a BLE central device to connect
  BLEDevice central = BLE.central();

  if (central) {
    // Device connected
    if (!deviceConnected) {
      deviceConnected = true;
      digitalWrite(LED_PIN, HIGH);  // Turn on LED when connected
      
      Serial.println("\n✅ Connected to central: ");
      Serial.print("   Address: ");
      Serial.println(central.address());
      Serial.println("   Streaming IMU data...\n");
    }

    // Stay in this loop while device is connected
    while (central.connected()) {
      unsigned long currentTime = millis();
      
      // Send data at specified sample rate
      if (currentTime - lastSampleTime >= SAMPLE_DELAY) {
        lastSampleTime = currentTime;
        sendIMUData();
      }

      // Check for incoming commands
      if (rxCharacteristic.written()) {
        handleCommand();
      }
    }

    // Device disconnected
    deviceConnected = false;
    digitalWrite(LED_PIN, LOW);
    
    Serial.println("\n❌ Disconnected from central");
    Serial.println("🔵 Waiting for new connection...");
  }
}

// ============================================================================
// Send IMU Data
// ============================================================================

void sendIMUData() {
  float ax, ay, az;  // Accelerometer
  float gx, gy, gz;  // Gyroscope

  // Check if data is available
  if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
    // Read sensor values
    IMU.readAcceleration(ax, ay, az);
    IMU.readGyroscope(gx, gy, gz);

    // Format as CSV: ax,ay,az,gx,gy,gz
    String data = String(ax, 2) + "," +
                  String(ay, 2) + "," +
                  String(az, 2) + "," +
                  String(gx, 2) + "," +
                  String(gy, 2) + "," +
                  String(gz, 2);

    // Send via BLE
    txCharacteristic.writeValue(data.c_str());

    // Debug output to serial (optional - comment out for better performance)
    // Serial.println(data);
  }
}

// ============================================================================
// Handle Incoming Commands
// ============================================================================

void handleCommand() {
  // Read the incoming data
  int len = rxCharacteristic.valueLength();
  
  if (len > 0) {
    byte buffer[512];
    rxCharacteristic.readValue(buffer, len);
    
    // Convert to string
    String command = "";
    for (int i = 0; i < len; i++) {
      command += (char)buffer[i];
    }
    
    command.trim();  // Remove whitespace
    
    Serial.print("📨 Received command: ");
    Serial.println(command);

    // Handle commands
    if (command == "PING") {
      // Respond to ping
      txCharacteristic.writeValue("PONG");
      Serial.println("   Responded: PONG");
      
    } else if (command == "INFO") {
      // Send device info
      String info = "Device:Nano33BLE,Sensors:IMU,Rate:" + String(SAMPLE_RATE) + "Hz";
      txCharacteristic.writeValue(info.c_str());
      Serial.println("   Sent device info");
      
    } else if (command == "LED_ON") {
      digitalWrite(LED_PIN, HIGH);
      txCharacteristic.writeValue("LED:ON");
      Serial.println("   LED turned ON");
      
    } else if (command == "LED_OFF") {
      digitalWrite(LED_PIN, LOW);
      txCharacteristic.writeValue("LED:OFF");
      Serial.println("   LED turned OFF");
      
    } else if (command.startsWith("RATE:")) {
      // Change sample rate (e.g., "RATE:100")
      int newRate = command.substring(5).toInt();
      if (newRate >= 1 && newRate <= 200) {
        // Update sample rate (you'd need to implement this)
        Serial.print("   New sample rate: ");
        Serial.print(newRate);
        Serial.println(" Hz");
        txCharacteristic.writeValue("OK");
      } else {
        txCharacteristic.writeValue("ERROR:Invalid rate");
      }
      
    } else {
      // Unknown command
      txCharacteristic.writeValue("ERROR:Unknown command");
      Serial.println("   ⚠️ Unknown command");
    }
  }
}

// ============================================================================
// Event Handler: RX Characteristic Written
// ============================================================================

void onRxCharacteristicWritten(BLEDevice central, BLECharacteristic characteristic) {
  // This callback is triggered when data is written to RX characteristic
  // Actual handling is done in handleCommand() in main loop
}

// ============================================================================
// Utility Functions (Optional)
// ============================================================================

// Blink LED pattern
void blinkPattern(int times, int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(duration);
    digitalWrite(LED_PIN, LOW);
    delay(duration);
  }
}
