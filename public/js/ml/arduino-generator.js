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
    for (const layer of model.layers) {
      const layerWeights = layer.getWeights();
      if (layerWeights.length > 0) {
        const w = await layerWeights[0].data();
        const b = layerWeights.length > 1 ? await layerWeights[1].data() : null;

        this.weights.push({
          name: layer.name,
          weights: Array.from(w),
          bias: b ? Array.from(b) : null,
          inputShape: layerWeights[0].shape[0],
          outputShape: layerWeights[0].shape[1]
        });
      }
    }

    return true;
  }

  generateArduinoCode() {
    const isColor = this.dataType === 'color';
    const mainFileName = isColor ? 'color_model.ino' : 'gesture_model.ino';

    const ino = this.generateMainSketch();
    const header = this.generateModelHeader();
    const readme = this.generateReadme();

    return {
      [mainFileName]: ino,
      'model_data.h': header,
      'README.md': readme
    };
  }

  generateMainSketch() {
    if (this.dataType === 'color') {
      return this.generateColorSketch();
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

  generateModelHeader() {
    const isColor = this.dataType === 'color';
    const labelType = isColor ? 'COLORS' : 'GESTURES';
    const countName = isColor ? 'NUM_COLORS' : 'NUM_GESTURES';

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
    this.weights.forEach((layer, idx) => {
      const layerNum = idx + 1;

      // Weights
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
    const modelType = isColor ? 'Color Recognition' : 'Gesture Recognition';
    const classType = isColor ? 'Colors' : 'Gestures';
    const deviceName = isColor ? 'ColorRecognizer' : 'GestureRecognizer';
    const fileName = isColor ? 'color_model.ino' : 'gesture_model.ino';
    const exampleClass = this.labels[0] || (isColor ? 'red' : 'wave');

    return `# ${modelType} Model - Standalone BLE UART

Generated: ${new Date().toISOString()}

## ${classType}
${this.labels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

## Hardware
- Arduino Nano 33 BLE Sense${isColor ? ' Rev2' : ''}

## Installation
1. Open ${fileName} in Arduino IDE
2. Ensure model_data.h is in the same folder
3. Install required libraries (Tools → Manage Libraries):
   - ArduinoBLE${isColor ? '\n   - Arduino_APDS9960' : ''}
4. Select board: Arduino Nano 33 BLE Sense${isColor ? ' Rev2' : ''}
5. Upload

${isColor ? `## Sensor Details
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
**BLE Output:** \`${isColor ? 'color' : 'gesture'}_name,confidence\\n\`
**Example:** \`${exampleClass},92.50\\n\`

This matches the format your serial-bridge expects!

### Serial Monitor (Debug)
Predictions also print to Serial Monitor at 115200 baud:
\`\`\`
Predicted: ${exampleClass} (92.5%)
${this.labels.map(l => `  ${l}: ${l === exampleClass ? '92.5' : '7.5'}%`).join('\n')}
\`\`\`

## Power Options
- USB powered (during development)
- Battery powered (3.7V LiPo via JST connector or 5V via VIN)
- Fully wireless when battery powered!

## Integration with P5.js
1. Serial-Bridge receives BLE predictions: \`${exampleClass},92.50\`
2. Parses ${isColor ? 'color' : 'gesture'} name and confidence
3. Forwards to P5 sketch via WebSocket/OSC
4. Your sketch responds to ${isColor ? 'colors' : 'gestures'}!
`;
  }
}