// Arduino Model Generator
// Converts TensorFlow.js models to Arduino C++ code

class ArduinoModelGenerator {
  constructor() {
    this.weights = [];
    this.labels = [];
    this.modelConfig = null;
  }

  async convertToTFLite(model, labels, dataType = 'imu') {
    console.log('Converting model for Arduino...');

    this.labels = labels;
    this.modelConfig = model.getConfig();
    this.dataType = dataType; // 'imu', 'color', or 'audio'

    // Extract all layer weights
    this.weights = [];
    this.denseWeights = [];  // Track only Dense layers for audio model

    for (const layer of model.layers) {
      const layerWeights = layer.getWeights();
      if (layerWeights.length > 0) {
        const w = await layerWeights[0].data();
        const b = layerWeights.length > 1 ? await layerWeights[1].data() : null;

        const weightInfo = {
          name: layer.name,
          layerType: layer.getClassName(),
          weights: Array.from(w),
          bias: b ? Array.from(b) : null,
          inputShape: layerWeights[0].shape[0],
          outputShape: layerWeights[0].shape.length > 1 ? layerWeights[0].shape[1] : null
        };

        this.weights.push(weightInfo);

        // For audio models, track only Dense layers
        if (layer.getClassName() === 'Dense') {
          this.denseWeights.push(weightInfo);
        }
      }
    }

    console.log(`   Extracted ${this.weights.length} layers`);
    console.log(`   Dense layers: ${this.denseWeights.length}`);

    return true;
  }

  generateArduinoCode() {
    let mainFileName;
    if (this.dataType === 'color') {
      mainFileName = 'color_model.ino';
    } else if (this.dataType === 'capacitive') {
      mainFileName = 'capacitive_model.ino';
    } else if (this.dataType === 'audio') {
      mainFileName = 'audio_model.ino';
    } else {
      mainFileName = 'gesture_model.ino';
    }

    const ino = this.generateMainSketch();
    const header = this.generateModelHeader();
    const readme = this.generateReadme();

    const files = {
      [mainFileName]: ino,
      'model_data.h': header,
      'README.md': readme
    };

    // Add MPR121_Helper.h for capacitive models
    if (this.dataType === 'capacitive') {
      files['MPR121_Helper.h'] = this.generateMPR121Helper();
    }

    return files;
  }

  generateMainSketch() {
    if (this.dataType === 'color') {
      return this.generateColorSketch();
    } else if (this.dataType === 'capacitive') {
      return this.generateCapacitiveSketch();
    } else if (this.dataType === 'audio') {
      return this.generateAudioSketch();
    } else {
      return this.generateIMUSketch();
    }
  }

  generateIMUSketch() {
    const numGestures = this.labels.length;

    return `// BLE Gesture Recognition
// Generated: ${new Date().toISOString()}

#include <Arduino_LSM9DS1.h>
#include <ArduinoBLE.h>
#include "model_data.h"

// Nordic UART Service (NUS) - Compatible with Serial-Bridge
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// TX Characteristic - Arduino sends predictions to serial-bridge (notify)
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 64);

// RX Characteristic - Arduino receives data (optional)
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

float sampleBuffer[900];
int bufferIndex = 0;
bool isCapturing = false;

const float ACCEL_THRESHOLD = 0.167;
const int CAPTURE_DELAY = 125;
unsigned long lastCapture = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1);
  }

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("Failed to initialize BLE!");
    while (1);
  }

  // Set BLE local name - will appear in serial-bridge device list
  BLE.setLocalName("GestureRecognizer");

  // Advertise the UART service
  BLE.setAdvertisedService(uartService);

  // Add characteristics to service
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);

  // Add service
  BLE.addService(uartService);

  // Set initial value
  txCharacteristic.writeValue("");

  // Start advertising
  BLE.advertise();

  Serial.println("✅ Gesture Recognition Ready");
  Serial.println("✅ BLE UART Active - Device: GestureRecognizer");
  Serial.print("Classes: ");
  for (int i = 0; i < NUM_GESTURES; i++) {
    Serial.print(GESTURES[i]);
    if (i < NUM_GESTURES - 1) Serial.print(", ");
  }
  Serial.println();
  Serial.println("Waiting for BLE connection...");
}

void loop() {
  // Listen for BLE connections
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      processGesture();
    }

    Serial.print("Disconnected from: ");
    Serial.println(central.address());
  } else {
    // Even without BLE connection, still process (for Serial output)
    processGesture();
  }
}

void processGesture() {
  float ax, ay, az, gx, gy, gz, mx, my, mz;

  if (IMU.accelerationAvailable() &&
      IMU.gyroscopeAvailable() &&
      IMU.magneticFieldAvailable()) {

    IMU.readAcceleration(ax, ay, az);
    IMU.readGyroscope(gx, gy, gz);
    IMU.readMagneticField(mx, my, mz);

    if (!isCapturing) {
      float avgAccel = (abs(ax) + abs(ay) + abs(az) + abs(gx) + abs(gy) + abs(gz)) / 6.0;
      unsigned long now = millis();

      if (avgAccel >= ACCEL_THRESHOLD && (now - lastCapture) >= CAPTURE_DELAY) {
        isCapturing = true;
        bufferIndex = 0;
        lastCapture = now;
        Serial.println("Capturing...");
      }
    }

    if (isCapturing) {
      sampleBuffer[bufferIndex++] = ax;
      sampleBuffer[bufferIndex++] = ay;
      sampleBuffer[bufferIndex++] = az;
      sampleBuffer[bufferIndex++] = gx;
      sampleBuffer[bufferIndex++] = gy;
      sampleBuffer[bufferIndex++] = gz;
      sampleBuffer[bufferIndex++] = mx;
      sampleBuffer[bufferIndex++] = my;
      sampleBuffer[bufferIndex++] = mz;

      if (bufferIndex >= 900) {
        predict();
        isCapturing = false;
      }
    }
  }

  delay(10);
}

void predict() {
  // Normalize input
  float input[900];
  for (int i = 0; i < 900; i++) {
    input[i] = constrain(sampleBuffer[i], -4.0, 4.0) / 4.0;
  }

  // Layer 1: 900 -> 50
  float h1[50];
  for (int i = 0; i < 50; i++) {
    float sum = layer1_bias[i];
    for (int j = 0; j < 900; j++) {
      sum += input[j] * layer1_weights[j * 50 + i];
    }
    h1[i] = max(0.0f, sum);
  }

  // Layer 2: 50 -> 15
  float h2[15];
  for (int i = 0; i < 15; i++) {
    float sum = layer2_bias[i];
    for (int j = 0; j < 50; j++) {
      sum += h1[j] * layer2_weights[j * 15 + i];
    }
    h2[i] = max(0.0f, sum);
  }

  // Layer 3: 15 -> ${numGestures}
  float output[${numGestures}];
  float maxVal = -1000000.0f;
  for (int i = 0; i < ${numGestures}; i++) {
    float sum = layer3_bias[i];
    for (int j = 0; j < 15; j++) {
      sum += h2[j] * layer3_weights[j * ${numGestures} + i];
    }
    output[i] = sum;
    if (sum > maxVal) maxVal = sum;
  }

  // Softmax
  float sumExp = 0.0f;
  for (int i = 0; i < ${numGestures}; i++) {
    output[i] = exp(output[i] - maxVal);
    sumExp += output[i];
  }
  for (int i = 0; i < ${numGestures}; i++) {
    output[i] /= sumExp;
  }

  // Find max
  int pred = 0;
  float maxConf = output[0];
  for (int i = 1; i < ${numGestures}; i++) {
    if (output[i] > maxConf) {
      maxConf = output[i];
      pred = i;
    }
  }

  // Format: "gesture,confidence" - compatible with serial-bridge parsing
  char predictionStr[64];
  snprintf(predictionStr, sizeof(predictionStr), "%s,%.2f\\n", GESTURES[pred], maxConf * 100.0);

  // Output to Serial
  Serial.print("Predicted: ");
  Serial.print(GESTURES[pred]);
  Serial.print(" (");
  Serial.print(maxConf * 100, 1);
  Serial.println("%)");

  for (int i = 0; i < ${numGestures}; i++) {
    Serial.print("  ");
    Serial.print(GESTURES[i]);
    Serial.print(": ");
    Serial.print(output[i] * 100, 1);
    Serial.println("%");
  }

  // Send over BLE UART (TX characteristic)
  txCharacteristic.writeValue(predictionStr);
}
`;
  }

  generateColorSketch() {
    const numColors = this.labels.length;
    const inputSize = this.weights[0].inputShape;
    const numFrames = inputSize / 5; // e.g., 500 / 5 = 100 frames

    return `// BLE Color Recognition
// Generated: ${new Date().toISOString()}

#include <Arduino_APDS9960.h>
#include <ArduinoBLE.h>
#include "model_data.h"

// Nordic UART Service (NUS) - Compatible with Serial-Bridge
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// TX Characteristic - Arduino sends predictions to serial-bridge (notify)
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 64);

// RX Characteristic - Arduino receives data (optional)
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

float sampleBuffer[${inputSize}];
int bufferIndex = 0;
bool isCapturing = false;

const int PROXIMITY_THRESHOLD = 77; // 0-255, trigger when object near (30%)
const int CAPTURE_DELAY = 100; // ms between captures (10 Hz)
unsigned long lastCapture = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // Initialize APDS9960 color sensor
  if (!APDS.begin()) {
    Serial.println("Failed to initialize APDS9960!");
    while (1);
  }

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("Failed to initialize BLE!");
    while (1);
  }

  // Set BLE local name - will appear in serial-bridge device list
  BLE.setLocalName("ColorRecognizer");

  // Advertise the UART service
  BLE.setAdvertisedService(uartService);

  // Add characteristics to service
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);

  // Add service
  BLE.addService(uartService);

  // Set initial value
  txCharacteristic.writeValue("");

  // Start advertising
  BLE.advertise();

  Serial.println("✅ Color Recognition Ready");
  Serial.println("✅ BLE UART Active - Device: ColorRecognizer");
  Serial.print("Classes: ");
  for (int i = 0; i < NUM_COLORS; i++) {
    Serial.print(COLORS[i]);
    if (i < NUM_COLORS - 1) Serial.print(", ");
  }
  Serial.println();
  Serial.println("Waiting for BLE connection...");
}

void loop() {
  // Listen for BLE connections
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      processColor();
    }

    Serial.print("Disconnected from: ");
    Serial.println(central.address());
  } else {
    // Even without BLE connection, still process (for Serial output)
    processColor();
  }
}

void processColor() {
  int r, g, b, c, p;

  if (APDS.colorAvailable()) {
    APDS.readColor(r, g, b, c);

    // Read proximity (0-255)
    p = APDS.proximityAvailable() ? APDS.readProximity() : 0;

    if (!isCapturing) {
      unsigned long now = millis();

      // Auto-trigger when object near sensor
      if (p >= PROXIMITY_THRESHOLD && (now - lastCapture) >= CAPTURE_DELAY) {
        isCapturing = true;
        bufferIndex = 0;
        lastCapture = now;
        Serial.println("Capturing...");
      }
    }

    if (isCapturing) {
      // Normalize using RELATIVE normalization (lighting-independent)
      // This matches the training data from the web app
      int colorTotal = r + g + b;
      float rNorm, gNorm, bNorm, cNorm, pNorm;

      if (colorTotal > 0) {
        // Relative normalization: each color as fraction of total
        rNorm = (float)r / colorTotal;
        gNorm = (float)g / colorTotal;
        bNorm = (float)b / colorTotal;
        cNorm = (float)c / 255.0;  // Keep clear absolute (for brightness info)
        pNorm = (float)p / 255.0;   // Keep proximity absolute
      } else {
        // No light detected
        rNorm = gNorm = bNorm = 0.0;
        cNorm = 0.0;
        pNorm = (float)p / 255.0;
      }

      sampleBuffer[bufferIndex++] = rNorm;
      sampleBuffer[bufferIndex++] = gNorm;
      sampleBuffer[bufferIndex++] = bNorm;
      sampleBuffer[bufferIndex++] = cNorm;
      sampleBuffer[bufferIndex++] = pNorm;

      if (bufferIndex >= ${inputSize}) {
        predict();
        isCapturing = false;
      }
    }
  }

  delay(10);
}

void predict() {
  // Input already normalized during capture (0-1 range)
  float input[${inputSize}];
  for (int i = 0; i < ${inputSize}; i++) {
    input[i] = sampleBuffer[i];
  }

  // Layer 1: ${inputSize} -> ${this.weights[0].outputShape}
  float h1[${this.weights[0].outputShape}];
  for (int i = 0; i < ${this.weights[0].outputShape}; i++) {
    float sum = layer1_bias[i];
    for (int j = 0; j < ${inputSize}; j++) {
      sum += input[j] * layer1_weights[j * ${this.weights[0].outputShape} + i];
    }
    h1[i] = max(0.0f, sum);
  }

  // Layer 2: ${this.weights[0].outputShape} -> ${this.weights[1].outputShape}
  float h2[${this.weights[1].outputShape}];
  for (int i = 0; i < ${this.weights[1].outputShape}; i++) {
    float sum = layer2_bias[i];
    for (int j = 0; j < ${this.weights[0].outputShape}; j++) {
      sum += h1[j] * layer2_weights[j * ${this.weights[1].outputShape} + i];
    }
    h2[i] = max(0.0f, sum);
  }

  // Layer 3: ${this.weights[1].outputShape} -> ${numColors}
  float output[${numColors}];
  float maxVal = -1000000.0f;
  for (int i = 0; i < ${numColors}; i++) {
    float sum = layer3_bias[i];
    for (int j = 0; j < ${this.weights[1].outputShape}; j++) {
      sum += h2[j] * layer3_weights[j * ${numColors} + i];
    }
    output[i] = sum;
    if (sum > maxVal) maxVal = sum;
  }

  // Softmax
  float sumExp = 0.0f;
  for (int i = 0; i < ${numColors}; i++) {
    output[i] = exp(output[i] - maxVal);
    sumExp += output[i];
  }
  for (int i = 0; i < ${numColors}; i++) {
    output[i] /= sumExp;
  }

  // Find max
  int pred = 0;
  float maxConf = output[0];
  for (int i = 1; i < ${numColors}; i++) {
    if (output[i] > maxConf) {
      maxConf = output[i];
      pred = i;
    }
  }

  // Format: "color,confidence" - compatible with serial-bridge parsing
  char predictionStr[64];
  snprintf(predictionStr, sizeof(predictionStr), "%s,%.2f\\n", COLORS[pred], maxConf * 100.0);

  // Output to Serial
  Serial.print("Predicted: ");
  Serial.print(COLORS[pred]);
  Serial.print(" (");
  Serial.print(maxConf * 100, 1);
  Serial.println("%)");

  for (int i = 0; i < ${numColors}; i++) {
    Serial.print("  ");
    Serial.print(COLORS[i]);
    Serial.print(": ");
    Serial.print(output[i] * 100, 1);
    Serial.println("%");
  }

  // Send over BLE UART (TX characteristic)
  txCharacteristic.writeValue(predictionStr);
}
`;
  }

  generateCapacitiveSketch() {
    const numPatterns = this.labels.length;
    const inputSize = this.weights[0].inputShape;
    const numFrames = inputSize / 12; // e.g., 1200 / 12 = 100 frames

    return `// BLE Capacitive Pattern Recognition
// Generated: ${new Date().toISOString()}

#include <ArduinoBLE.h>
#include <Wire.h>
#include "Adafruit_MPR121.h"
#include "MPR121_Helper.h"
#include "model_data.h"

// Nordic UART Service (NUS) - Compatible with Serial-Bridge
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// TX Characteristic - Arduino sends predictions to serial-bridge (notify)
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 64);

// RX Characteristic - Arduino receives data (optional)
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

// MPR121 sensor (12-electrode capacitive touch/proximity sensor)
Adafruit_MPR121 cap = Adafruit_MPR121();
MPR121_Helper touch(&cap);

float sampleBuffer[${inputSize}];
int bufferIndex = 0;
bool isCapturing = false;
bool bleConnected = false;

// Normalization constants (MPR121 filtered data range)
const float FILTERED_DATA_MIN = 0.0;
const float FILTERED_DATA_MAX = 1000.0;

// Auto-trigger settings
// IMPORTANT: Set to false if you have a "no touch" or "baseline" pattern class
// When false, continuously captures and predicts (like IMU gesture mode)
const bool USE_AUTO_TRIGGER = true;

// Auto-trigger threshold (proximity detection)
// Trigger when any electrode drops below this threshold (after /4 normalization: 0.0-0.25 range)
// Lower values = closer proximity (sensor outputs inverted values)
const float PROXIMITY_THRESHOLD = 0.15; // Trigger when proximity detected (0.15 or less, which is 0.60 before /4)
const int CAPTURE_DELAY = 20; // ms between captures (50 Hz to match training data)
unsigned long lastCapture = 0;
unsigned long lastPrediction = 0;
const int PREDICTION_INTERVAL = 500; // ms between predictions in continuous mode

// MPR121 I2C address (default is 0x5A)
#define MPR121_I2C_ADDR 0x5A

// Touch/Release thresholds for the sensor
#define TOUCH_THRESHOLD 40
#define RELEASE_THRESHOLD 20

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait up to 3 seconds for Serial

  Serial.println("BLE Capacitive Pattern Recognition");
  Serial.println("===================================");
  Serial.println("VERSION 1.0.0");

  // Initialize I2C
  Wire.begin();

  // Initialize MPR121
  if (!cap.begin(MPR121_I2C_ADDR)) {
    Serial.println("❌ Failed to initialize MPR121!");
    Serial.println("   Check wiring and I2C address (0x5A)");
    while (1) {
      delay(200);
    }
  }

  Serial.println("✅ MPR121 Capacitive Sensor initialized");
  Serial.print("   I2C Address: 0x");
  Serial.println(MPR121_I2C_ADDR, HEX);
  Serial.print("   Electrodes: 12");
  Serial.println();

  // Configure sensor thresholds
  touch.setThresholds(TOUCH_THRESHOLD, RELEASE_THRESHOLD);

  // Enable auto-configuration for best performance
  cap.setAutoconfig(true);

  // IMPORTANT: Add delay before BLE setup to prevent Mac crashes
  Serial.println("⏳ Waiting 3 seconds before starting BLE...");
  delay(3000);

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1) {
      delay(100);
    }
  }

  // Set BLE local name - will appear in serial-bridge device list
  BLE.setLocalName("CapacitiveRecognizer");

  // Advertise the UART service
  BLE.setAdvertisedService(uartService);

  // Add characteristics to service
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);

  // Add service
  BLE.addService(uartService);

  // Set initial value
  txCharacteristic.writeValue("");

  // Start advertising
  BLE.advertise();

  Serial.println("✅ Capacitive Pattern Recognition Ready");
  Serial.println("✅ BLE UART Active - Device: CapacitiveRecognizer");

  // Validate model data
  if (NUM_PATTERNS == 0) {
    Serial.println("❌ ERROR: No patterns defined in model_data.h!");
    Serial.println("   The PATTERNS array is empty. Check your model export.");
    while(1) { delay(1000); } // Halt execution
  }

  Serial.print("Number of patterns: ");
  Serial.println(NUM_PATTERNS);
  Serial.print("Patterns: ");
  for (int i = 0; i < NUM_PATTERNS; i++) {
    Serial.print(PATTERNS[i]);
    if (i < NUM_PATTERNS - 1) Serial.print(", ");
  }
  Serial.println();
  Serial.print("Model input size: ");
  Serial.print(${inputSize});
  Serial.print(" (");
  Serial.print(${numFrames});
  Serial.println(" frames × 12 electrodes)");
  Serial.println("Standalone mode active - BLE optional");
}

void loop() {
  // Listen for BLE connections
  BLEDevice central = BLE.central();

  if (central) {
    if (!bleConnected) {
      Serial.print("Connected to: ");
      Serial.println(central.address());
      bleConnected = true;
    }

    while (central.connected()) {
      processPattern();
    }

    Serial.print("Disconnected from: ");
    Serial.println(central.address());
    bleConnected = false;
  } else {
    // Always process patterns - standalone mode works without BLE
    processPattern();
  }
}

void processPattern() {
  // Update filtered data from sensor
  touch.updateFilteredData();

  // Read all 12 electrode values
  float electrodeValues[12];
  bool proximityDetected = false;

  for (uint8_t i = 0; i < 12; i++) {
    uint16_t rawFiltered = touch.getFilteredData(i);

    // Normalize to 0.0-1.0 range first
    // Based on actual testing: sensor already outputs inverted values
    // Higher normalized values = closer proximity (no manual inversion needed)
    float normalized = (float)rawFiltered / FILTERED_DATA_MAX;

    // Clamp to valid range
    if (normalized > 1.0) normalized = 1.0;
    if (normalized < 0.0) normalized = 0.0;

    // IMPORTANT: Match training normalization
    // Training divides by 4 to normalize to [-1, 1] range (like IMU data)
    // So we must do the same here for the model to work correctly
    normalized = normalized / 4.0;

    electrodeValues[i] = normalized;

    // Check if any electrode detects proximity (for auto-trigger mode)
    // Lower values = closer (sensor inverted)
    if (USE_AUTO_TRIGGER && normalized <= PROXIMITY_THRESHOLD) {
      proximityDetected = true;
    }
  }

  unsigned long now = millis();

  if (!isCapturing) {
    // Auto-trigger mode: start capture when proximity detected
    if (USE_AUTO_TRIGGER) {
      if (proximityDetected) {
        isCapturing = true;
        bufferIndex = 0;
        lastCapture = now - CAPTURE_DELAY; // Allow immediate first frame
        Serial.println("Capturing pattern...");
      }
    } else {
      // Continuous mode: always capturing
      // Start new capture if enough time has passed since last prediction
      if (now - lastPrediction >= PREDICTION_INTERVAL) {
        isCapturing = true;
        bufferIndex = 0;
        lastCapture = now - CAPTURE_DELAY; // Allow immediate first frame
      }
    }
  }

  if (isCapturing && (now - lastCapture >= CAPTURE_DELAY)) {
    lastCapture = now;

    // Add all 12 electrode values to buffer
    for (uint8_t i = 0; i < 12; i++) {
      sampleBuffer[bufferIndex++] = electrodeValues[i];
    }

    // Debug: print frame number every 10 frames
    int frameNum = bufferIndex / 12;
    if (frameNum % 10 == 0) {
      Serial.print("Frame ");
      Serial.print(frameNum);
      Serial.print("/");
      Serial.println(${numFrames});
    }

    // Check if we've collected enough frames
    if (bufferIndex >= ${inputSize}) {
      Serial.println("Buffer full, predicting...");
      predict();
      isCapturing = false;
      lastPrediction = now;
    }
  }
}

void predict() {
  // Debug: Print sample statistics
  float sampleMin = sampleBuffer[0];
  float sampleMax = sampleBuffer[0];
  float sampleAvg = 0.0;
  for (int i = 0; i < ${inputSize}; i++) {
    if (sampleBuffer[i] < sampleMin) sampleMin = sampleBuffer[i];
    if (sampleBuffer[i] > sampleMax) sampleMax = sampleBuffer[i];
    sampleAvg += sampleBuffer[i];
  }
  sampleAvg /= ${inputSize};

  Serial.print("Sample stats - Min: ");
  Serial.print(sampleMin, 3);
  Serial.print(", Max: ");
  Serial.print(sampleMax, 3);
  Serial.print(", Avg: ");
  Serial.println(sampleAvg, 3);

  // Input already normalized during capture (0-1 range)
  float input[${inputSize}];
  for (int i = 0; i < ${inputSize}; i++) {
    input[i] = sampleBuffer[i];
  }

  // Layer 1: ${inputSize} -> ${this.weights[0].outputShape}
  float h1[${this.weights[0].outputShape}];
  for (int i = 0; i < ${this.weights[0].outputShape}; i++) {
    float sum = layer1_bias[i];
    for (int j = 0; j < ${inputSize}; j++) {
      sum += input[j] * layer1_weights[j * ${this.weights[0].outputShape} + i];
    }
    h1[i] = max(0.0f, sum);
  }

  // Layer 2: ${this.weights[0].outputShape} -> ${this.weights[1].outputShape}
  float h2[${this.weights[1].outputShape}];
  for (int i = 0; i < ${this.weights[1].outputShape}; i++) {
    float sum = layer2_bias[i];
    for (int j = 0; j < ${this.weights[0].outputShape}; j++) {
      sum += h1[j] * layer2_weights[j * ${this.weights[1].outputShape} + i];
    }
    h2[i] = max(0.0f, sum);
  }

  // Layer 3: ${this.weights[1].outputShape} -> ${numPatterns}
  float output[${numPatterns}];
  float maxVal = -1000000.0f;
  for (int i = 0; i < ${numPatterns}; i++) {
    float sum = layer3_bias[i];
    for (int j = 0; j < ${this.weights[1].outputShape}; j++) {
      sum += h2[j] * layer3_weights[j * ${numPatterns} + i];
    }
    output[i] = sum;
    if (sum > maxVal) maxVal = sum;
  }

  // Softmax
  float sumExp = 0.0f;
  for (int i = 0; i < ${numPatterns}; i++) {
    output[i] = exp(output[i] - maxVal);
    sumExp += output[i];
  }
  for (int i = 0; i < ${numPatterns}; i++) {
    output[i] /= sumExp;
  }

  // Find max
  int pred = 0;
  float maxConf = output[0];
  for (int i = 1; i < ${numPatterns}; i++) {
    if (output[i] > maxConf) {
      maxConf = output[i];
      pred = i;
    }
  }

  // Output to Serial
  Serial.print("Predicted: ");
  Serial.print(PATTERNS[pred]);
  Serial.print(" (");
  Serial.print(maxConf * 100.0, 1);
  Serial.println("%)");

  // Print all probabilities
  for (int i = 0; i < ${numPatterns}; i++) {
    Serial.print("  ");
    Serial.print(PATTERNS[i]);
    Serial.print(": ");
    Serial.print(output[i] * 100.0, 1);
    Serial.println("%");
  }

  // Send over BLE UART only if connected
  if (bleConnected) {
    // Format: "pattern,confidence" - compatible with serial-bridge parsing
    char predictionStr[64];
    snprintf(predictionStr, sizeof(predictionStr), "%s,%.2f\\n", PATTERNS[pred], maxConf * 100.0);
    txCharacteristic.writeValue(predictionStr);
  }
}
`;
  }

  generateAudioSketch() {
    const numSounds = this.labels.length;

    // For audio models, find the first Dense layer to get input size
    // Audio models have Conv1D + BatchNorm layers before Dense layers
    let inputSize = 819; // Default MFCC feature size (63 frames × 13 coefficients)

    // Try to find actual input size from model
    if (this.weights.length > 0 && this.weights[0].inputShape) {
      inputSize = this.weights[0].inputShape;
    }

    // Extract Dense layer shapes
    // Audio model typically has: Conv layers -> GlobalAvgPool -> Dense -> Dense(output)
    const dense1Size = this.denseWeights.length > 0 ? this.denseWeights[0].outputShape : 32;
    const outputSize = this.denseWeights.length > 1 ? this.denseWeights[1].outputShape : numSounds;

    console.log(`   Audio model - Input: ${inputSize}, Dense1: ${dense1Size}, Output: ${outputSize}`);

    return `// BLE Audio Classification
// Generated: ${new Date().toISOString()}
// Uses Arduino Nano 33 BLE Sense onboard PDM microphone (MP34DT05)

#include <PDM.h>
#include <ArduinoBLE.h>
#include "model_data.h"

// Audio Configuration
#define SAMPLE_RATE 16000        // Match training sample rate
#define AUDIO_BUFFER_SIZE 512    // FFT size
#define NUM_MFCC 13              // Number of MFCC coefficients
#define AUDIO_DURATION_MS 1000   // 1 second audio capture
#define NUM_FRAMES ${Math.ceil((16000 * 1.0) / 256)}  // ~62 frames for 1 second

// Nordic UART Service (NUS)
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 64);
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

// Audio buffers
short audioBuffer[AUDIO_BUFFER_SIZE];
float features[${inputSize}];
volatile int samplesRead = 0;
volatile bool audioReady = false;

// Mode: 0=continuous, 1=triggered by volume
int classificationMode = 0;
float volumeThreshold = 0.05;
unsigned long lastPredictionTime = 0;
const unsigned long PREDICTION_INTERVAL = 500; // 500ms between predictions

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("🎤 Audio Classification System");
  Serial.println("   Arduino Nano 33 BLE Sense");

  // Initialize PDM microphone
  if (!PDM.begin(1, SAMPLE_RATE)) {
    Serial.println("❌ Failed to start PDM!");
    while (1);
  }

  Serial.println("✅ PDM Microphone initialized");
  Serial.print("   Sample rate: ");
  Serial.print(SAMPLE_RATE);
  Serial.println(" Hz");

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1);
  }

  BLE.setLocalName("AudioClassifier");
  BLE.setAdvertisedService(uartService);
  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);
  BLE.addService(uartService);
  txCharacteristic.writeValue("");
  BLE.advertise();

  Serial.println("✅ BLE UART Active - Device: AudioClassifier");
  Serial.print("Sound classes: ");
  for (int i = 0; i < NUM_SOUNDS; i++) {
    Serial.print(SOUNDS[i]);
    if (i < NUM_SOUNDS - 1) Serial.print(", ");
  }
  Serial.println();
  Serial.println("Listening...");
}

void loop() {
  // Listen for BLE connections
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      // Check for commands from central
      if (rxCharacteristic.written()) {
        String command = rxCharacteristic.value();
        handleCommand(command);
      }

      processAudio();
    }

    Serial.print("Disconnected from: ");
    Serial.println(central.address());
  } else {
    // Even without BLE, still classify audio
    processAudio();
  }
}

void handleCommand(String command) {
  command.trim();

  if (command == "MODE:CONTINUOUS") {
    classificationMode = 0;
    Serial.println("Mode: Continuous");
  } else if (command == "MODE:TRIGGERED") {
    classificationMode = 1;
    Serial.println("Mode: Volume Triggered");
  }
}

void processAudio() {
  // Read audio samples
  if (PDM.available()) {
    int bytesRead = PDM.read(audioBuffer, AUDIO_BUFFER_SIZE * sizeof(short));
    samplesRead = bytesRead / sizeof(short);

    if (samplesRead > 0) {
      audioReady = true;
    }
  }

  // Process and classify when ready
  if (audioReady) {
    audioReady = false;

    // Check if enough time has passed since last prediction
    unsigned long currentTime = millis();
    if (currentTime - lastPredictionTime < PREDICTION_INTERVAL) {
      return;
    }

    // Check volume threshold in triggered mode
    if (classificationMode == 1) {
      float rms = calculateRMS();
      if (rms < volumeThreshold) {
        return; // Too quiet, don't classify
      }
    }

    // Extract features and classify
    extractFeatures();
    predict();

    lastPredictionTime = currentTime;
  }
}

float calculateRMS() {
  float sum = 0;
  for (int i = 0; i < samplesRead; i++) {
    float normalized = audioBuffer[i] / 32768.0;
    sum += normalized * normalized;
  }
  return sqrt(sum / samplesRead);
}

void extractFeatures() {
  // Simplified spectral feature extraction
  // In production, use full MFCC pipeline

  // For now, extract simplified spectral features
  // This is a placeholder - you may need to add arduinoFFT library for full MFCC

  int featureIdx = 0;

  // Extract energy in frequency bands as simplified features
  for (int frame = 0; frame < NUM_FRAMES && featureIdx < ${inputSize}; frame++) {
    // Compute basic spectral features for this frame
    for (int mfcc = 0; mfcc < NUM_MFCC && featureIdx < ${inputSize}; mfcc++) {
      // Simplified feature calculation
      // Real implementation would use FFT + Mel filterbank + DCT

      int sampleIdx = (frame * AUDIO_BUFFER_SIZE) / NUM_FRAMES;
      if (sampleIdx < samplesRead) {
        // Normalize audio sample
        float sample = audioBuffer[sampleIdx] / 32768.0;

        // Simple spectral approximation
        features[featureIdx] = sample * (1.0 + (mfcc * 0.1));
      } else {
        features[featureIdx] = 0.0;
      }

      featureIdx++;
    }
  }

  // Zero-pad remaining features if needed
  while (featureIdx < ${inputSize}) {
    features[featureIdx++] = 0.0;
  }
}

void predict() {
  // WARNING: This is a simplified implementation
  // The full model uses 1D CNN + BatchNorm which cannot be easily converted to Arduino
  // For production use, consider TensorFlow Lite Micro

  // For now, we approximate with the Dense layers only
  // Input features are MFCC coefficients extracted from audio

  // NOTE: Audio features should NOT be normalized (already processed by MFCC)
  // Dense Layer: ${inputSize} -> ${dense1Size}
  float h1[${dense1Size}];
  for (int i = 0; i < ${dense1Size}; i++) {
    float sum = layer1_bias[i];
    for (int j = 0; j < ${inputSize}; j++) {
      sum += features[j] * layer1_weights[j * ${dense1Size} + i];
    }
    h1[i] = max(0.0f, sum);  // ReLU activation
  }

  // Output Layer: ${dense1Size} -> ${numSounds}
  float output[${numSounds}];
  float maxVal = -1000000.0f;
  for (int i = 0; i < ${numSounds}; i++) {
    float sum = layer2_bias[i];
    for (int j = 0; j < ${dense1Size}; j++) {
      sum += h1[j] * layer2_weights[j * ${numSounds} + i];
    }
    output[i] = sum;
    if (sum > maxVal) maxVal = sum;
  }

  // Softmax
  float sumExp = 0.0f;
  for (int i = 0; i < ${numSounds}; i++) {
    output[i] = exp(output[i] - maxVal);
    sumExp += output[i];
  }
  for (int i = 0; i < ${numSounds}; i++) {
    output[i] /= sumExp;
  }

  // Find max
  int pred = 0;
  float maxConf = output[0];
  for (int i = 1; i < ${numSounds}; i++) {
    if (output[i] > maxConf) {
      maxConf = output[i];
      pred = i;
    }
  }

  // Format: "sound,confidence" for serial-bridge compatibility
  char predictionStr[64];
  snprintf(predictionStr, sizeof(predictionStr), "%s,%.2f\\n", SOUNDS[pred], maxConf * 100.0);

  // Output to Serial
  Serial.print("🔊 Detected: ");
  Serial.print(SOUNDS[pred]);
  Serial.print(" (");
  Serial.print(maxConf * 100, 1);
  Serial.println("%)");

  for (int i = 0; i < ${numSounds}; i++) {
    Serial.print("  ");
    Serial.print(SOUNDS[i]);
    Serial.print(": ");
    Serial.print(output[i] * 100, 1);
    Serial.println("%");
  }

  // Send over BLE UART
  txCharacteristic.writeValue(predictionStr);
}
`;
  }

  generateModelHeader() {
    let labelType, countName;

    if (this.dataType === 'color') {
      labelType = 'COLORS';
      countName = 'NUM_COLORS';
    } else if (this.dataType === 'capacitive') {
      labelType = 'PATTERNS';
      countName = 'NUM_PATTERNS';
    } else if (this.dataType === 'audio') {
      labelType = 'SOUNDS';
      countName = 'NUM_SOUNDS';
    } else {
      labelType = 'GESTURES';
      countName = 'NUM_GESTURES';
    }

    let code = `// Model Data
// Generated: ${new Date().toISOString()}

#ifndef MODEL_DATA_H
#define MODEL_DATA_H

const int ${countName} = ${this.labels.length};
const char* ${labelType}[] = {
${this.labels.map(l => `  "${l}"`).join(',\n')}
};

`;

    // Add weights for each layer
    // For audio models, only export Dense layers (skip Conv1D, BatchNorm, etc.)
    const layersToExport = this.dataType === 'audio' ? this.denseWeights : this.weights;

    if (this.dataType === 'audio' && layersToExport.length === 0) {
      code += `// WARNING: No Dense layers found in audio model!\n`;
      code += `// The model may use unsupported layer types for Arduino.\n\n`;
    }

    layersToExport.forEach((layer, idx) => {
      const layerNum = idx + 1;

      // Weights
      code += `// Layer ${layerNum}: ${layer.name} (${layer.layerType})\n`;
      code += `const float layer${layerNum}_weights[] PROGMEM = {\n`;
      code += this.formatArray(layer.weights);
      code += `};\n\n`;

      // Bias
      if (layer.bias) {
        code += `const float layer${layerNum}_bias[] PROGMEM = {\n`;
        code += this.formatArray(layer.bias);
        code += `};\n\n`;
      }
    });

    code += `#endif\n`;
    return code;
  }

  formatArray(arr) {
    let result = '';
    for (let i = 0; i < arr.length; i++) {
      if (i % 8 === 0) result += '  ';
      result += arr[i].toFixed(6) + 'f';
      if (i < arr.length - 1) result += ',';
      if (i % 8 === 7 || i === arr.length - 1) result += '\n';
      else result += ' ';
    }
    return result;
  }

  generateReadme() {
    const isColor = this.dataType === 'color';
    const isCapacitive = this.dataType === 'capacitive';
    const isAudio = this.dataType === 'audio';

    let modelType, classType, deviceName, fileName, exampleClass;

    if (isAudio) {
      modelType = 'Audio Classification';
      classType = 'Sound Classes';
      deviceName = 'AudioClassifier';
      fileName = 'audio_model.ino';
      exampleClass = this.labels[0] || 'beep';
    } else if (isCapacitive) {
      modelType = 'Capacitive Pattern Recognition';
      classType = 'Patterns';
      deviceName = 'CapacitiveRecognizer';
      fileName = 'capacitive_model.ino';
      exampleClass = this.labels[0] || 'touch';
    } else if (isColor) {
      modelType = 'Color Recognition';
      classType = 'Colors';
      deviceName = 'ColorRecognizer';
      fileName = 'color_model.ino';
      exampleClass = this.labels[0] || 'red';
    } else {
      modelType = 'Gesture Recognition';
      classType = 'Gestures';
      deviceName = 'GestureRecognizer';
      fileName = 'gesture_model.ino';
      exampleClass = this.labels[0] || 'wave';
    }

    return `# ${modelType} Model - Standalone BLE UART

Generated: ${new Date().toISOString()}

## ${classType}
${this.labels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

## Hardware
- Arduino Nano 33 BLE Sense${isColor ? ' Rev2' : ''}${isCapacitive ? '\n- MPR121 Capacitive Touch Sensor (12-electrode breakout board)' : ''}

## Installation
1. Open ${fileName} in Arduino IDE
2. Ensure model_data.h is in the same folder${isCapacitive ? '\n3. Ensure MPR121_Helper.h is in the same folder' : ''}
${isCapacitive ? '4' : '3'}. Install required libraries (Tools → Manage Libraries):
   - ArduinoBLE${isColor ? '\n   - Arduino_APDS9960' : ''}${isCapacitive ? '\n   - Adafruit_MPR121' : ''}${isAudio ? '\n   - PDM (included with Arduino Nano 33 BLE)' : ''}
${isCapacitive ? '5' : '4'}. Select board: Arduino Nano 33 BLE Sense${isColor ? ' Rev2' : ''}
${isCapacitive ? '6' : '5'}. Upload${isCapacitive ? '\n\n## MPR121 Wiring\nConnect the MPR121 to Arduino using I2C:\n- VCC → 3.3V\n- GND → GND\n- SCL → SCL (A5)\n- SDA → SDA (A4)\n- IRQ → Not connected (optional)\n- I2C Address: 0x5A (default)' : ''}

${isAudio ? `## IMPORTANT: Simplified Audio Model

⚠️ **WARNING**: This is a simplified implementation. The full model uses 1D CNN with Batch Normalization layers that cannot be directly converted to Arduino C++ code.

**Current Implementation:**
- Uses only the Dense (fully-connected) layers from your model
- Skips Conv1D and BatchNormalization layers
- Accuracy will be LOWER than web version

**For Production:**
Consider using TensorFlow Lite Micro for full model support with all layers.

## Audio Details
The PDM microphone (MP34DT05) on Arduino Nano 33 BLE Sense captures audio at 16kHz.

**Feature Extraction:**
- Currently uses simplified spectral features
- For better accuracy, implement full MFCC pipeline
- Consider using arduinoFFT library for proper FFT

**Modes:**
- Continuous: Classifies audio continuously
- Triggered: Only classifies when volume exceeds threshold

` : ''}${isCapacitive ? `## Sensor Details
The MPR121 capacitive sensor features:
- **12 Electrodes**: Separate touch/proximity sensing channels (E0-E11)
- **Filtered Data**: Proximity values (0-1000) - normalized to 0.0-1.0
- **I2C Interface**: Simple 2-wire communication at address 0x5A
- **Two Operating Modes**: Auto-trigger or Continuous prediction

The model captures ${this.weights[0].inputShape / 12} frames (${this.weights[0].inputShape} values total = ${this.weights[0].inputShape / 12} frames × 12 electrodes).

**Note:** The sensor outputs inverted proximity values - higher normalized values indicate closer proximity.

### Auto-Trigger vs Continuous Mode

**Auto-Trigger Mode (default):**
\`const bool USE_AUTO_TRIGGER = true;\`
- Starts capturing only when proximity is detected (normalized value ≤ 0.60)
- Best for distinct gestures/touches with clear start/end points
- Saves power and reduces unnecessary predictions

**Continuous Mode:**
\`const bool USE_AUTO_TRIGGER = false;\`
- Continuously captures and predicts every 500ms
- Required if you have a "no touch" or "baseline" pattern class
- Allows classification of ambient/resting states
- Set this if patterns include states between 0.6-0.7 range

To change modes, edit the \`USE_AUTO_TRIGGER\` constant at the top of the sketch.

` : ''}${isColor ? `## Sensor Details
The APDS9960 color sensor captures:
- **R, G, B**: RGB color values (0-4096)
- **C**: Clear/ambient light intensity (0-4096)
- **P**: Proximity (0-255) - used for auto-trigger

The model captures ${this.weights[0].inputShape / 5} frames (${this.weights[0].inputShape} values total) when an object is detected near the sensor.

` : ''}## Usage

### BLE UART Mode (Wireless)
The Arduino uses **Nordic UART Service (NUS)** protocol - compatible with Serial-Bridge!

**Device Name:** ${deviceName}
**Service UUID:** 6E400001-B5A3-F393-E0A9-E50E24DCCA9E (Nordic UART)
**TX Characteristic:** 6E400003-B5A3-F393-E0A9-E50E24DCCA9E (Arduino sends data)
**RX Characteristic:** 6E400002-B5A3-F393-E0A9-E50E24DCCA9E (Arduino receives data)

### Connecting from Serial-Bridge
Your serial-bridge Electron app will automatically recognize this as a UART device:
1. Scan for BLE devices
2. Look for "${deviceName}"
3. Connect
4. Receive predictions on TX characteristic

### Data Format
**BLE Output:** \`${isAudio ? 'sound' : isCapacitive ? 'pattern' : isColor ? 'color' : 'gesture'}_name,confidence\\n\`
**Example:** \`${exampleClass},92.50\\n\`

This matches the format your serial-bridge expects!

### Serial Monitor (Debug)
Predictions also print to Serial Monitor at 115200 baud:
\`\`\`
${isAudio ? '🔊 Detected' : 'Predicted'}: ${exampleClass} (92.5%)
${this.labels.map(l => `  ${l}: ${l === exampleClass ? '92.5' : '7.5'}%`).join('\n')}
\`\`\`

## Power Options
- USB powered (during development)
- Battery powered (3.7V LiPo via JST connector or 5V via VIN)
- Fully wireless when battery powered!

## Integration with P5.js
1. Serial-Bridge receives BLE predictions: \`${exampleClass},92.50\`
2. Parses ${isCapacitive ? 'pattern' : isColor ? 'color' : 'gesture'} name and confidence
3. Forwards to P5 sketch via WebSocket/OSC
4. Your sketch responds to ${isCapacitive ? 'patterns' : isColor ? 'colors' : 'gestures'}!
`;
  }

  generateMPR121Helper() {
    return `#ifndef MPR121_HELPER_H
#define MPR121_HELPER_H

#include "Adafruit_MPR121.h"

// Beginner-friendly wrapper for Adafruit MPR121 to align with the old Bare Conductive library
// Hides the need to show Bit manipulation to beginners.
class MPR121_Helper {
private:
  Adafruit_MPR121* sensor;
  uint16_t currentTouchData;
  uint16_t lastTouchData;
  uint16_t filteredDataCache[12];  // Cache for filtered data

public:
  MPR121_Helper(Adafruit_MPR121* cap) {
    sensor = cap;
    currentTouchData = 0;
    lastTouchData = 0;
    // Initialise filtered data cache
    for (uint8_t i = 0; i < 12; i++) {
      filteredDataCache[i] = 0;
    }
  }

  // Update touch data from the sensor. Call this once per loop
  void updateTouchData() {
    lastTouchData = currentTouchData;
    currentTouchData = sensor->touched();
  }

  // Update filtered data for all electrodes. Call once per loop for proximity sensing
  void updateFilteredData() {
    for (uint8_t i = 0; i < 12; i++) {
      filteredDataCache[i] = sensor->filteredData(i);
    }
  }

    // Check if a specific sensor is currently touched
  bool getTouchData(uint8_t electrode) {
    if (electrode > 11) return false;
    return (currentTouchData & (1 << electrode)) != 0;
  }

  // Check if a specific sensor is currently touched
  bool isTouched(uint8_t electrode) {
    if (electrode > 11) return false;
    return (currentTouchData & (1 << electrode)) != 0;
  }

  // Check if a sensor was touched in the last reading
  bool wasTouched(uint8_t electrode) {
    if (electrode > 11) return false;
    return (lastTouchData & (1 << electrode)) != 0;
  }

  // Check if there is a new touch event
  bool isNewTouch(uint8_t electrode) {
    return isTouched(electrode) && !wasTouched(electrode);
  }

  // Check if there was a new release event
  bool isNewRelease(uint8_t electrode) {
    return !isTouched(electrode) && wasTouched(electrode);
  }

  // Get the total number of sensors currently touched
  uint8_t getNumTouches() {
    uint8_t count = 0;
    for (uint8_t i = 0; i < 12; i++) {
      if (isTouched(i)) count++;
    }
    return count;
  }

  // Get filtered data for proximity sensing
  // Higher values = closer to electrode
  // Returns cached value. Call updateFilteredData() first
  uint16_t getFilteredData(uint8_t electrode) {
    if (electrode > 11) return 0;
    return filteredDataCache[electrode];
  }

  // Set touch and release thresholds for all electrodes
  void setThresholds(uint8_t touchThreshold, uint8_t releaseThreshold) {
    sensor->setThresholds(touchThreshold, releaseThreshold);
  }

  // Separate methods for setting thresholds individually
  void setTouchThreshold(uint8_t threshold) {
    sensor->setThresholds(threshold, 20); // Use default release of 20
  }

  void setReleaseThreshold(uint8_t threshold) {
    sensor->setThresholds(40, threshold); // Use default touch of 40
  }
};

#endif
`;
  }
}