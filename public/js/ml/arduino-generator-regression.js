// Arduino Regression Model Generator
// Converts TensorFlow.js regression models to Arduino C++ code with PWM outputs

class ArduinoRegressionGenerator {
  constructor() {
    this.weights = [];
    this.outputLabels = [];
    this.modelConfig = null;
  }

  async convertModel(model, outputLabels) {
    console.log('Converting regression model for Arduino...');

    this.outputLabels = outputLabels;
    this.modelConfig = model.getConfig();

    // Extract all layer weights
    this.weights = [];

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
      }
    }

    console.log(`   Extracted ${this.weights.length} layers`);
    console.log(`   Output labels: ${this.outputLabels.join(', ')}`);

    return true;
  }

  generateArduinoCode() {
    const ino = this.generateMainSketch();
    const header = this.generateModelHeader();
    const readme = this.generateReadme();

    return {
      'regression_model.ino': ino,
      'model_data.h': header,
      'README.md': readme
    };
  }

  generatePinArray(numOutputs) {
    // Generate pin array: {2}, {2, 3}, {2, 3, 4}, etc.
    const pins = [];
    for (let i = 0; i < numOutputs; i++) {
      pins.push(2 + i); // Start at pin 2
    }
    return `{${pins.join(', ')}}`;
  }

  generateMainSketch() {
    const numOutputs = this.outputLabels.length;

    return `// BLE IMU Regression Model
// Generated: ${new Date().toISOString()}
// Outputs: ${this.outputLabels.join(', ')}

#include <Arduino_LSM9DS1.h>
#include <ArduinoBLE.h>
#include "model_data.h"

// Nordic UART Service (NUS) - Compatible with Serial-Bridge
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

// TX Characteristic - Arduino sends predictions to serial-bridge (notify)
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 128);

// RX Characteristic - Arduino receives data (optional)
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

// PWM Output Pins (adjust based on your board)
// Dynamically assign pins 2, 3, 4, ... based on NUM_OUTPUTS
const int OUTPUT_PINS[NUM_OUTPUTS] = ${this.generatePinArray(numOutputs)};

// IMU Data Collection
const int SAMPLE_SIZE = 900; // 100 frames × 9 axes
float sampleBuffer[SAMPLE_SIZE];
int bufferIndex = 0;
unsigned long lastSampleTime = 0;
const int SAMPLE_INTERVAL = 20; // 20ms = 50Hz (matches training rate)

// Prediction timing
unsigned long lastPrediction = 0;
const int PREDICTION_INTERVAL = 100; // Predict every 100ms
bool bufferFilled = false;
int framesCollected = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  Serial.println("🚀 BLE IMU Regression Model");
  Serial.println("   Outputs: " + String(NUM_OUTPUTS));

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("❌ Failed to initialize IMU!");
    while (1);
  }
  Serial.println("✅ IMU initialized");

  // Initialize PWM output pins
  for (int i = 0; i < NUM_OUTPUTS; i++) {
    pinMode(OUTPUT_PINS[i], OUTPUT);
    analogWrite(OUTPUT_PINS[i], 0);
  }
  Serial.println("✅ PWM outputs initialized");

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("❌ Failed to initialize BLE!");
    while (1);
  }

  BLE.setLocalName("Nano33BLE-Regression");
  BLE.setDeviceName("Nano33BLE-Regression");
  BLE.setAdvertisedService(uartService);

  uartService.addCharacteristic(txCharacteristic);
  uartService.addCharacteristic(rxCharacteristic);
  BLE.addService(uartService);

  BLE.advertise();
  Serial.println("✅ BLE advertising started");
  Serial.println("🚦 Collecting data...");
  Serial.println();
}

void loop() {
  // Listen for BLE connections (optional)
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("📱 Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      processContinuous();
    }

    Serial.println("📱 Disconnected");
  } else {
    // Run standalone
    processContinuous();
  }
}

void processContinuous() {
  unsigned long now = millis();

  // Collect IMU data at fixed rate
  if (now - lastSampleTime >= SAMPLE_INTERVAL) {
    lastSampleTime = now;

    float ax, ay, az, gx, gy, gz, mx, my, mz;

    if (IMU.accelerationAvailable() &&
        IMU.gyroscopeAvailable() &&
        IMU.magneticFieldAvailable()) {

      IMU.readAcceleration(ax, ay, az);
      IMU.readGyroscope(gx, gy, gz);
      IMU.readMagneticField(mx, my, mz);

      // Shift buffer left by 9 to make room for new frame
      for (int i = 0; i < SAMPLE_SIZE - 9; i++) {
        sampleBuffer[i] = sampleBuffer[i + 9];
      }

      // Add new frame at the end
      sampleBuffer[SAMPLE_SIZE - 9] = ax;
      sampleBuffer[SAMPLE_SIZE - 8] = ay;
      sampleBuffer[SAMPLE_SIZE - 7] = az;
      sampleBuffer[SAMPLE_SIZE - 6] = gx;
      sampleBuffer[SAMPLE_SIZE - 5] = gy;
      sampleBuffer[SAMPLE_SIZE - 4] = gz;
      sampleBuffer[SAMPLE_SIZE - 3] = mx;
      sampleBuffer[SAMPLE_SIZE - 2] = my;
      sampleBuffer[SAMPLE_SIZE - 1] = mz;

      // Count frames
      framesCollected++;

      // Mark as filled after 100 frames
      if (!bufferFilled && framesCollected >= 100) {
        bufferFilled = true;
        Serial.println("✅ Buffer ready - starting predictions");
      }
    }
  }

  // Run predictions at regular intervals (only after buffer is filled)
  if (bufferFilled && now - lastPrediction >= PREDICTION_INTERVAL) {
    lastPrediction = now;
    predict();
  }
}

void predict() {
  // Normalize input data - just use buffer as-is (most recent 2 seconds)
  float input[SAMPLE_SIZE];
  for (int i = 0; i < SAMPLE_SIZE; i++) {
    input[i] = constrain(sampleBuffer[i], -4.0f, 4.0f) / 4.0f;
  }

  // Layer 1: 900 -> hiddenUnits1
  float h1[HIDDEN_UNITS_1];
  for (int i = 0; i < HIDDEN_UNITS_1; i++) {
    float sum = pgm_read_float_near(&bias_dense_0[i]);
    for (int j = 0; j < SAMPLE_SIZE; j++) {
      sum += input[j] * pgm_read_float_near(&weights_dense_0[j * HIDDEN_UNITS_1 + i]);
    }
    h1[i] = max(0.0f, sum); // ReLU
  }

  // Layer 2: hiddenUnits1 -> hiddenUnits2
  float h2[HIDDEN_UNITS_2];
  for (int i = 0; i < HIDDEN_UNITS_2; i++) {
    float sum = pgm_read_float_near(&bias_dense_1[i]);
    for (int j = 0; j < HIDDEN_UNITS_1; j++) {
      sum += h1[j] * pgm_read_float_near(&weights_dense_1[j * HIDDEN_UNITS_2 + i]);
    }
    h2[i] = max(0.0f, sum); // ReLU
  }

  // Output Layer: hiddenUnits2 -> numOutputs (sigmoid activation)
  float outputs[NUM_OUTPUTS];
  for (int i = 0; i < NUM_OUTPUTS; i++) {
    float sum = pgm_read_float_near(&bias_dense_2[i]);
    for (int j = 0; j < HIDDEN_UNITS_2; j++) {
      sum += h2[j] * pgm_read_float_near(&weights_dense_2[j * NUM_OUTPUTS + i]);
    }
    // Apply sigmoid activation: sigmoid(x) = 1 / (1 + e^(-x))
    // This constrains output to 0-1 range naturally
    outputs[i] = 1.0f / (1.0f + exp(-sum));
  }

  // Update PWM outputs and send
  for (int i = 0; i < NUM_OUTPUTS; i++) {
    // Convert to PWM (outputs already in 0-1 range from sigmoid)
    int pwmValue = (int)(outputs[i] * 255.0f);
    pwmValue = constrain(pwmValue, 0, 255); // Safety clamp for PWM
    analogWrite(OUTPUT_PINS[i], pwmValue);

    // Print to Serial
    Serial.print(OUTPUT_LABELS[i]);
    Serial.print(": ");
    Serial.print(outputs[i], 3);
    Serial.print(" (PWM: ");
    Serial.print(pwmValue);
    Serial.print(")");
    if (i < NUM_OUTPUTS - 1) Serial.print(" | ");
  }
  Serial.println();

  // Send via BLE
  String msg = "R";
  for (int i = 0; i < NUM_OUTPUTS; i++) {
    msg += ",";
    msg += String(outputs[i], 3);
  }
  if (txCharacteristic.subscribed()) {
    txCharacteristic.writeValue(msg);
  }
}

`;
  }

  generateModelHeader() {
    // Extract dimensions from weights
    const layer1 = this.weights[0]; // First dense layer
    const layer2 = this.weights[1]; // Second dense layer
    const layer3 = this.weights[2]; // Output layer

    const hiddenUnits1 = layer1.outputShape;
    const hiddenUnits2 = layer2.outputShape;
    const numOutputs = layer3.outputShape;

    let header = `// Model Weights and Configuration
// Generated: ${new Date().toISOString()}

#ifndef MODEL_DATA_H
#define MODEL_DATA_H

// Model Architecture
#define HIDDEN_UNITS_1 ${hiddenUnits1}
#define HIDDEN_UNITS_2 ${hiddenUnits2}
#define NUM_OUTPUTS ${numOutputs}

// Output Labels
const char* OUTPUT_LABELS[NUM_OUTPUTS] = {
${this.outputLabels.map(label => `  "${label}"`).join(',\n')}
};

`;

    // Add weights for each layer
    this.weights.forEach((layer, idx) => {
      header += `// Layer ${idx}: ${layer.name}\n`;
      header += `const float weights_dense_${idx}[] PROGMEM = {\n`;
      header += this.formatFloatArray(layer.weights);
      header += `};\n\n`;

      if (layer.bias) {
        header += `const float bias_dense_${idx}[] PROGMEM = {\n`;
        header += this.formatFloatArray(layer.bias);
        header += `};\n\n`;
      }
    });

    header += `#endif // MODEL_DATA_H\n`;

    return header;
  }

  formatFloatArray(arr) {
    const valuesPerLine = 10;
    let result = '';

    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && i % valuesPerLine === 0) {
        result += '\n';
      }
      result += `  ${arr[i].toFixed(6)}f`;
      if (i < arr.length - 1) {
        result += ',';
      }
    }

    return result + '\n';
  }

  generateReadme() {
    return `# Regression Model - Arduino Deployment

Generated: ${new Date().toISOString()}

## Overview

This package contains a regression model trained to predict continuous values from IMU sensor data.

## Outputs

The model predicts ${this.outputLabels.length} continuous output values:
${this.outputLabels.map((label, i) => `- **${label}** (Pin ${i + 2}): PWM output 0-255 (0V-5V)`).join('\n')}

## Hardware Requirements

- Arduino Nano 33 BLE Sense (or compatible board with LSM9DS1 IMU)
- ${this.outputLabels.length} PWM-capable output pins
- Power supply for connected devices (if using outputs)

## Installation

1. Open \`regression_model.ino\` in Arduino IDE
2. Install required libraries:
   - Arduino_LSM9DS1
   - ArduinoBLE
3. Select board: **Arduino Nano 33 BLE**
4. Upload to your board

## Pin Configuration

The model uses the following pins for PWM output (0-255 range):

${this.outputLabels.map((label, i) => `- Pin ${i + 2}: ${label}`).join('\n')}

**Note**: You can modify the \`OUTPUT_PINS\` array in the sketch to use different pins.

## Usage

1. Upload the sketch to your Arduino
2. The board will advertise as "Nano33BLE-Regression"
3. Connect via BLE using the Serial Bridge or compatible app
4. The model will:
   - Continuously collect IMU data (100 frames)
   - Run predictions every 100ms
   - Update PWM outputs based on predicted values
   - Send predictions via BLE

## BLE Protocol

The device sends regression predictions in the format:
\`\`\`
R,<output1>,<output2>,...,<outputN>
\`\`\`

Example:
\`\`\`
R,0.847,0.234
\`\`\`

Where:
- \`R\` indicates a regression prediction
- Each value is a float between 0.0 and 1.0 (3 decimal places)

## Output Values

- **Range**: 0.0 to 1.0
- **PWM Mapping**: 0.0 = 0V (PWM 0), 1.0 = 5V (PWM 255)
- **Update Rate**: 10 Hz (every 100ms)

## Connecting External Devices

The PWM outputs can be used to control:
- Servo motors (connect to servo signal pin)
- LED brightness (connect through resistor)
- Motor speed controllers
- Analog devices (through DAC or RC filter)

**Warning**: Always check voltage/current requirements of connected devices!

## Troubleshooting

**IMU Not Found**
- Ensure you're using Arduino Nano 33 BLE Sense (with IMU)
- Check board selection in Arduino IDE

**BLE Not Connecting**
- Reset the board
- Check that BLE is enabled on your device
- Try power cycling both devices

**Outputs Not Working**
- Verify pin connections
- Check OUTPUT_PINS array matches your wiring
- Ensure connected devices are powered correctly

## Model Architecture

- **Input**: 900 values (100 frames × 9 axes)
- **Hidden Layer 1**: ${this.weights[0]?.outputShape || 50} units (ReLU)
- **Hidden Layer 2**: ${this.weights[1]?.outputShape || 15} units (ReLU)
- **Output Layer**: ${this.outputLabels.length} outputs (Sigmoid activation, outputs 0-1 range)

## Modifying the Code

### Change Prediction Rate
\`\`\`cpp
const int PREDICTION_INTERVAL = 100; // Change to desired ms
\`\`\`

### Change Output Pins
\`\`\`cpp
const int OUTPUT_PINS[NUM_OUTPUTS] = {2, 3, 4, 5}; // Your pin numbers
\`\`\`

### Add Serial Debugging
Uncomment the Serial.print statements in \`sendPrediction()\`

## Support

For issues or questions, refer to the Tiny-Trainer documentation.
`;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArduinoRegressionGenerator;
}
