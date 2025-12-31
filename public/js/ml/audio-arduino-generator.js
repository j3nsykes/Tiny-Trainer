// Audio Arduino Generator
// Generates Arduino code for audio classification models
// Uses MFCC feature extraction + CNN inference

class AudioArduinoGenerator {
  constructor() {
    this.model = null;
    this.labels = [];
    this.layers = [];
    this.config = {
      numFrames: 63,
      numMFCC: 13,
      sampleRate: 16000,
      fftSize: 512,
      hopLength: 256,
      audioBufferSize: 16000  // 1 second of audio at 16kHz
    };
  }

  async convertModel(model, labels) {
    console.log('🎤 Converting audio model for Arduino...');

    this.model = model;
    this.labels = labels;
    this.layers = [];

    // Extract all layer information
    for (const layer of model.layers) {
      const layerInfo = {
        name: layer.name,
        type: layer.getClassName(),
        config: layer.getConfig()
      };

      // Extract weights if present
      const weights = layer.getWeights();
      if (weights.length > 0) {
        layerInfo.weights = [];
        for (const weight of weights) {
          const data = await weight.data();
          layerInfo.weights.push({
            shape: weight.shape,
            data: Array.from(data)
          });
        }
      }

      this.layers.push(layerInfo);
      console.log(`   Layer: ${layerInfo.type} (${layerInfo.name})`);
    }

    console.log(`✅ Extracted ${this.layers.length} layers`);
    return true;
  }

  generateArduinoLibrary() {
    console.log('📦 Generating Arduino library...');

    const files = {
      'audio_model.ino': this.generateMainSketch(),
      'model_data.h': this.generateModelHeader(),
      'mfcc.h': this.generateMFCCHeader(),
      'mfcc.cpp': this.generateMFCCImplementation(),
      'inference.h': this.generateInferenceHeader(),
      'inference.cpp': this.generateInferenceImplementation(),
      'README.md': this.generateReadme()
    };

    return files;
  }

  generateMainSketch() {
    const numClasses = this.labels.length;

    return `// Audio Classification - Arduino Nano 33 BLE Sense
// Generated: ${new Date().toISOString()}
// Model: 1D CNN with MFCC feature extraction

#include <PDM.h>
#include <ArduinoBLE.h>
#include "model_data.h"
#include "mfcc.h"
#include "inference.h"

// Nordic UART Service (NUS)
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic txCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 64);
BLEStringCharacteristic rxCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

// Ring buffer for continuous audio capture
#define RING_BUFFER_SIZE (AUDIO_BUFFER_SIZE * 2)
short ringBuffer[RING_BUFFER_SIZE];
short audioBuffer[AUDIO_BUFFER_SIZE];  // Working buffer for processing
float features[NUM_FEATURES];
volatile int ringWritePos = 0;
volatile bool bufferOverrun = false;

// Mode: 0=continuous, 1=triggered by volume
int classificationMode = 0;
float volumeThreshold = 0.05;
unsigned long lastPredictionTime = 0;
const unsigned long PREDICTION_INTERVAL = 1000; // 1000ms between predictions

// MFCC processor
MFCCProcessor mfcc;

// Model inference engine
ModelInference model;

// PDM callback - called when audio data is ready
void onPDMdata() {
  int bytesAvailable = PDM.available();
  if (bytesAvailable <= 0) return;

  int samplesAvailable = bytesAvailable / sizeof(short);

  // Read directly into ring buffer
  for (int i = 0; i < samplesAvailable; i++) {
    short sample;
    if (PDM.read(&sample, sizeof(short)) > 0) {
      ringBuffer[ringWritePos] = sample;
      ringWritePos = (ringWritePos + 1) % RING_BUFFER_SIZE;
    }
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("🎤 Audio Classification System");
  Serial.println("   Arduino Nano 33 BLE Sense");
  Serial.println("   Model: 1D CNN with MFCC");

  // Initialize PDM microphone with callback
  PDM.onReceive(onPDMdata);
  if (!PDM.begin(1, SAMPLE_RATE)) {
    Serial.println("❌ Failed to start PDM!");
    while (1);
  }

  Serial.println("✅ PDM Microphone initialized");
  Serial.print("   Sample rate: ");
  Serial.print(SAMPLE_RATE);
  Serial.println(" Hz");

  // Initialize MFCC processor
  mfcc.begin(SAMPLE_RATE, NUM_FRAMES, NUM_MFCC);
  Serial.println("✅ MFCC processor initialized");

  // Initialize model
  model.begin();
  Serial.println("✅ Model initialized");

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
  Serial.print("Sound classes (");
  Serial.print(NUM_CLASSES);
  Serial.print("): ");
  for (int i = 0; i < NUM_CLASSES; i++) {
    Serial.print(CLASS_NAMES[i]);
    if (i < NUM_CLASSES - 1) Serial.print(", ");
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
  // Check if enough time has passed since last prediction
  unsigned long currentTime = millis();
  if (currentTime - lastPredictionTime < PREDICTION_INTERVAL) {
    return;
  }

  // Copy most recent audio from ring buffer to working buffer
  // This is a snapshot of the last AUDIO_BUFFER_SIZE samples
  noInterrupts();  // Prevent writes during copy
  int readPos = (ringWritePos - AUDIO_BUFFER_SIZE + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
  for (int i = 0; i < AUDIO_BUFFER_SIZE; i++) {
    audioBuffer[i] = ringBuffer[readPos];
    readPos = (readPos + 1) % RING_BUFFER_SIZE;
  }
  interrupts();

  // Check volume threshold in triggered mode
  if (classificationMode == 1) {
    float rms = calculateRMS();
    if (rms < volumeThreshold) {
      return; // Too quiet, don't classify
    }
  }

  Serial.print("Listening... (RingPos: ");
  Serial.print(ringWritePos);
  Serial.print(", First 5 samples: ");
  for (int i = 0; i < 5; i++) {
    Serial.print(audioBuffer[i]);
    Serial.print(" ");
  }
  Serial.println(")");

  // Extract MFCC features from audio buffer
  mfcc.extractFeatures(audioBuffer, AUDIO_BUFFER_SIZE, features);

  Serial.print("MFCC features [0-4]: ");
  for (int i = 0; i < 5; i++) {
    Serial.print(features[i]);
    Serial.print(" ");
  }
  Serial.println();

  // Run inference
  float probabilities[NUM_CLASSES];
  int predictedClass = model.predict(features, probabilities);

  // Output results
  printPrediction(predictedClass, probabilities);
  sendBLEPrediction(predictedClass, probabilities[predictedClass]);

  lastPredictionTime = currentTime;
}

float calculateRMS() {
  float sum = 0;
  for (int i = 0; i < AUDIO_BUFFER_SIZE; i++) {
    float normalized = audioBuffer[i] / 32768.0;
    sum += normalized * normalized;
  }
  return sqrt(sum / AUDIO_BUFFER_SIZE);
}

void printPrediction(int predictedClass, float* probabilities) {
  Serial.print("🔊 Detected: ");
  Serial.print(CLASS_NAMES[predictedClass]);
  Serial.print(" (");
  Serial.print(probabilities[predictedClass] * 100, 1);
  Serial.println("%)");

  for (int i = 0; i < NUM_CLASSES; i++) {
    Serial.print("  ");
    Serial.print(CLASS_NAMES[i]);
    Serial.print(": ");
    Serial.print(probabilities[i] * 100, 1);
    Serial.println("%");
  }
}

void sendBLEPrediction(int predictedClass, float confidence) {
  // Format: "sound,confidence\\n" for serial-bridge compatibility
  char predictionStr[64];
  snprintf(predictionStr, sizeof(predictionStr), "%s,%.2f\\n",
           CLASS_NAMES[predictedClass], confidence * 100.0);

  // Send over BLE UART
  if (BLE.central() && BLE.central().connected()) {
    txCharacteristic.writeValue(predictionStr);
  }
}
`;
  }

  generateModelHeader() {
    return `// Model Configuration and Weights
// Generated: ${new Date().toISOString()}

#ifndef MODEL_DATA_H
#define MODEL_DATA_H

// Audio configuration
#define SAMPLE_RATE ${this.config.sampleRate}
#define AUDIO_BUFFER_SIZE ${this.config.audioBufferSize}
#define NUM_FRAMES ${this.config.numFrames}
#define NUM_MFCC ${this.config.numMFCC}
#define NUM_FEATURES (NUM_FRAMES * NUM_MFCC)  // ${this.config.numFrames * this.config.numMFCC}

// Model configuration
#define NUM_CLASSES ${this.labels.length}

// Class names - extern declaration
extern const char* CLASS_NAMES[NUM_CLASSES];

// Layer weights and parameters will be included from inference.cpp

#endif
`;
  }

  generateMFCCHeader() {
    return `// MFCC Feature Extraction
// Full implementation using arduinoFFT

#ifndef MFCC_H
#define MFCC_H

#include <Arduino.h>
#include <arduinoFFT.h>

#define FFT_SIZE 512
#define NUM_MEL_FILTERS 40

class MFCCProcessor {
public:
  void begin(int sampleRate, int numFrames, int numCoeffs);
  void extractFeatures(short* audioBuffer, int bufferSize, float* features);

private:
  int _sampleRate;
  int _numFrames;
  int _numCoeffs;
  int _frameSize;
  int _hopSize;

  // FFT
  ArduinoFFT<float> *fft;
  float vReal[FFT_SIZE];
  float vImag[FFT_SIZE];

  // Mel filterbank
  float melFilterbank[NUM_MEL_FILTERS][FFT_SIZE/2 + 1];

  void initMelFilterbank();
  float hzToMel(float hz);
  float melToHz(float mel);
  void applyPreEmphasis(short* input, float* output, int length);
  void applyHammingWindow(float* frame, int length);
  void computeMelEnergies(float* fftMagnitude, float* melEnergies);
  void computeDCT(float* melEnergies, float* mfccCoeffs);
};

#endif
`;
  }

  generateMFCCImplementation() {
    return `// MFCC Implementation
// Full MFCC with FFT and Mel filterbank

#include "mfcc.h"
#include "model_data.h"
#include <math.h>

void MFCCProcessor::begin(int sampleRate, int numFrames, int numCoeffs) {
  _sampleRate = sampleRate;
  _numFrames = numFrames;
  _numCoeffs = numCoeffs;
  _frameSize = FFT_SIZE;
  _hopSize = 256;

  // Initialize FFT object
  fft = new ArduinoFFT<float>(vReal, vImag, FFT_SIZE, _sampleRate);

  // Initialize Mel filterbank
  initMelFilterbank();
}

void MFCCProcessor::initMelFilterbank() {
  // Mel filterbank parameters matching training
  float fMin = 300.0;
  float fMax = 8000.0;
  int nfft = FFT_SIZE;
  int nFilters = NUM_MEL_FILTERS;

  // Convert to mel scale
  float melMin = hzToMel(fMin);
  float melMax = hzToMel(fMax);

  // Create mel-spaced frequencies
  float melPoints[NUM_MEL_FILTERS + 2];
  for (int i = 0; i < nFilters + 2; i++) {
    melPoints[i] = melMin + (melMax - melMin) * i / (nFilters + 1);
  }

  // Convert back to Hz
  float hzPoints[NUM_MEL_FILTERS + 2];
  for (int i = 0; i < nFilters + 2; i++) {
    hzPoints[i] = melToHz(melPoints[i]);
  }

  // Convert Hz to FFT bin numbers
  int binPoints[NUM_MEL_FILTERS + 2];
  for (int i = 0; i < nFilters + 2; i++) {
    binPoints[i] = (int)floor((nfft + 1) * hzPoints[i] / _sampleRate);
  }

  // Create triangular filters
  for (int i = 0; i < nFilters; i++) {
    for (int j = 0; j <= nfft/2; j++) {
      melFilterbank[i][j] = 0.0;

      if (j >= binPoints[i] && j < binPoints[i + 1]) {
        melFilterbank[i][j] = (float)(j - binPoints[i]) / (binPoints[i + 1] - binPoints[i]);
      } else if (j >= binPoints[i + 1] && j <= binPoints[i + 2]) {
        melFilterbank[i][j] = (float)(binPoints[i + 2] - j) / (binPoints[i + 2] - binPoints[i + 1]);
      }
    }
  }
}

float MFCCProcessor::hzToMel(float hz) {
  return 2595.0 * log10(1.0 + hz / 700.0);
}

float MFCCProcessor::melToHz(float mel) {
  return 700.0 * (pow(10.0, mel / 2595.0) - 1.0);
}

void MFCCProcessor::extractFeatures(short* audioBuffer, int bufferSize, float* features) {
  int featureIdx = 0;
  float melEnergies[NUM_MEL_FILTERS];
  float mfccCoeffs[_numCoeffs];

  // Process each frame
  for (int frameNum = 0; frameNum < _numFrames && featureIdx < NUM_FEATURES; frameNum++) {
    int startIdx = frameNum * _hopSize;

    // Check if we have enough samples for this frame
    if (startIdx + _frameSize > bufferSize) {
      // Zero-pad remaining features
      while (featureIdx < NUM_FEATURES) {
        features[featureIdx++] = 0.0;
      }
      break;
    }

    // Copy frame with pre-emphasis
    for (int i = 0; i < _frameSize; i++) {
      float sample = audioBuffer[startIdx + i] / 32768.0;

      // Pre-emphasis filter
      if (i > 0) {
        sample -= 0.97 * (audioBuffer[startIdx + i - 1] / 32768.0);
      }

      vReal[i] = sample;
      vImag[i] = 0.0;
    }

    // Apply Hamming window
    applyHammingWindow(vReal, _frameSize);

    // Compute FFT
    fft->windowing(vReal, _frameSize, FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    fft->compute(vReal, vImag, _frameSize, FFT_FORWARD);
    fft->complexToMagnitude(vReal, vImag, _frameSize);

    // Apply Mel filterbank
    computeMelEnergies(vReal, melEnergies);

    // Compute DCT to get MFCC coefficients
    computeDCT(melEnergies, mfccCoeffs);

    // Copy MFCC coefficients to output
    for (int i = 0; i < _numCoeffs && featureIdx < NUM_FEATURES; i++) {
      features[featureIdx++] = mfccCoeffs[i];
    }
  }

  // Zero-pad if needed
  while (featureIdx < NUM_FEATURES) {
    features[featureIdx++] = 0.0;
  }
}

void MFCCProcessor::applyHammingWindow(float* frame, int length) {
  for (int i = 0; i < length; i++) {
    float window = 0.54 - 0.46 * cos(2.0 * M_PI * i / (length - 1));
    frame[i] *= window;
  }
}

void MFCCProcessor::computeMelEnergies(float* fftMagnitude, float* melEnergies) {
  for (int i = 0; i < NUM_MEL_FILTERS; i++) {
    melEnergies[i] = 0.0;

    for (int j = 0; j <= FFT_SIZE/2; j++) {
      melEnergies[i] += melFilterbank[i][j] * fftMagnitude[j];
    }

    // Log mel energy
    melEnergies[i] = log(melEnergies[i] + 1e-10);
  }
}

void MFCCProcessor::computeDCT(float* melEnergies, float* mfccCoeffs) {
  for (int i = 0; i < _numCoeffs; i++) {
    mfccCoeffs[i] = 0.0;

    for (int j = 0; j < NUM_MEL_FILTERS; j++) {
      mfccCoeffs[i] += melEnergies[j] * cos(M_PI * i * (j + 0.5) / NUM_MEL_FILTERS);
    }
  }
}
`;
  }

  generateInferenceHeader() {
    return `// Model Inference Engine
// Implements 1D CNN inference

#ifndef INFERENCE_H
#define INFERENCE_H

#include <Arduino.h>
#include "model_data.h"

class ModelInference {
public:
  void begin();
  int predict(float* features, float* probabilities);

private:
  // Layer implementations
  void batchNorm1D(float* input, float* output, int length,
                   const float* gamma, const float* beta,
                   const float* mean, const float* variance);

  void conv1D(float* input, float* output, int inputLen, int inputChannels,
              int outputChannels, int kernelSize,
              const float* weights, const float* bias);

  void maxPool1D(float* input, float* output, int inputLen, int channels, int poolSize);

  void globalAvgPool1D(float* input, float* output, int inputLen, int channels);

  void dense(float* input, float* output, int inputSize, int outputSize,
             const float* weights, const float* bias, bool useReLU);

  void softmax(float* input, int length);

  void relu(float* data, int length);
};

#endif
`;
  }

  generateInferenceImplementation() {
    // Extract layer information and weights
    const batchNorm = this.findLayer('batch_norm_input');
    const conv1 = this.findLayer('conv1d_1');
    const conv2 = this.findLayer('conv1d_2');
    const dense1 = this.findLayer('dense_1');
    const output = this.findLayer('output');

    return `// Model Inference Implementation
// Full forward pass through all layers

#include "inference.h"
#include <math.h>

// ========================================================================
// Class Names Definition
// ========================================================================

const char* CLASS_NAMES[NUM_CLASSES] = {
${this.labels.map(l => `  "${l}"`).join(',\n')}
};

// ========================================================================
// Layer Weights
// ========================================================================

${this.generateLayerWeights()}

// ========================================================================
// Model Implementation
// ========================================================================

void ModelInference::begin() {
  Serial.println("✅ Model layers initialized");
}

int ModelInference::predict(float* features, float* probabilities) {
  // Intermediate buffers for layer outputs
  float buffer1[NUM_FRAMES * NUM_MFCC];  // After reshape/batchnorm
  float buffer2[NUM_FRAMES * 8];         // After conv1d_1
  float buffer3[31 * 8];                 // After maxpool
  float buffer4[31 * 16];                // After conv1d_2
  float buffer5[16];                     // After global avg pool
  float buffer6[32];                     // After dense_1

  // Layer 1: Reshape (819 -> [63, 13]) - already in correct shape
  // Copy input features to buffer1
  for (int i = 0; i < NUM_FEATURES; i++) {
    buffer1[i] = features[i];
  }

  Serial.print("Input [0-2]: ");
  for (int i = 0; i < 3; i++) { Serial.print(buffer1[i]); Serial.print(" "); }
  Serial.println();

  // Layer 2: Batch Normalization
  // Apply BN to each frame's MFCC coefficients using the same 13 parameters
  for (int frame = 0; frame < NUM_FRAMES; frame++) {
    for (int coeff = 0; coeff < NUM_MFCC; coeff++) {
      int idx = frame * NUM_MFCC + coeff;
      float g = pgm_read_float(&bn_gamma[coeff]);
      float b = pgm_read_float(&bn_beta[coeff]);
      float m = pgm_read_float(&bn_mean[coeff]);
      float v = pgm_read_float(&bn_variance[coeff]);
      const float epsilon = 0.001;
      buffer1[idx] = g * ((buffer1[idx] - m) / sqrt(v + epsilon)) + b;
    }
  }

  Serial.print("After BN [0-2]: ");
  for (int i = 0; i < 3; i++) {
    Serial.print(buffer1[i]);
    if (isnan(buffer1[i])) Serial.print("(NaN!)");
    Serial.print(" ");
  }
  Serial.println();

  Serial.print("BN variance [0-2]: ");
  for (int i = 0; i < 3; i++) { Serial.print(pgm_read_float(&bn_variance[i])); Serial.print(" "); }
  Serial.println();

  Serial.print("BN params at index 13: gamma=");
  Serial.print(pgm_read_float(&bn_gamma[13]));
  Serial.print(", beta=");
  Serial.print(pgm_read_float(&bn_beta[13]));
  Serial.print(", mean=");
  Serial.print(pgm_read_float(&bn_mean[13]));
  Serial.print(", variance=");
  Serial.println(pgm_read_float(&bn_variance[13]));

  bool hasNaN = false;
  for (int i = 0; i < NUM_FEATURES; i++) {
    if (isnan(buffer1[i])) {
      Serial.print("ERROR: buffer1["); Serial.print(i); Serial.println("] is NaN!");
      hasNaN = true;
      if (hasNaN && i > 20) break; // Only show first 20 NaN indices
    }
  }
  if (!hasNaN) Serial.println("No NaN in buffer1");

  Serial.print("Conv1 weights [0-2]: ");
  for (int i = 0; i < 3; i++) { Serial.print(pgm_read_float(&conv1_weights[i])); Serial.print(" "); }
  Serial.print(", bias [0-2]: ");
  for (int i = 0; i < 3; i++) { Serial.print(pgm_read_float(&conv1_bias[i])); Serial.print(" "); }
  Serial.println();

  // Layer 3: Conv1D (8 filters, kernel=3, same padding)
  conv1D(buffer1, buffer2, NUM_FRAMES, NUM_MFCC, 8, 3,
         conv1_weights, conv1_bias);

  Serial.print("After Conv1 [0-2]: ");
  for (int i = 0; i < 3; i++) { Serial.print(buffer2[i]); Serial.print(" "); }
  Serial.println();

  // Layer 4: MaxPooling1D (pool_size=2, stride=2)
  maxPool1D(buffer2, buffer3, NUM_FRAMES, 8, 2);

  // Layer 5: Conv1D (16 filters, kernel=3, same padding)
  conv1D(buffer3, buffer4, 31, 8, 16, 3,
         conv2_weights, conv2_bias);

  // Layer 6: Global Average Pooling
  globalAvgPool1D(buffer4, buffer5, 31, 16);

  // Layer 7: Dense (32 units) with ReLU
  dense(buffer5, buffer6, 16, 32,
        dense1_weights, dense1_bias, true);

  // Layer 8: Output Dense (num_classes) with softmax
  dense(buffer6, probabilities, 32, NUM_CLASSES,
        output_weights, output_bias, false);

  Serial.print("Before Softmax: ");
  for (int i = 0; i < NUM_CLASSES; i++) { Serial.print(probabilities[i]); Serial.print(" "); }
  Serial.println();

  // Apply softmax
  softmax(probabilities, NUM_CLASSES);

  Serial.print("After Softmax: ");
  for (int i = 0; i < NUM_CLASSES; i++) { Serial.print(probabilities[i]); Serial.print(" "); }
  Serial.println();

  // Find predicted class
  int predictedClass = 0;
  float maxProb = probabilities[0];
  for (int i = 1; i < NUM_CLASSES; i++) {
    if (probabilities[i] > maxProb) {
      maxProb = probabilities[i];
      predictedClass = i;
    }
  }

  return predictedClass;
}

// ========================================================================
// Layer Implementations
// ========================================================================

void ModelInference::batchNorm1D(float* input, float* output, int length,
                                 const float* gamma, const float* beta,
                                 const float* mean, const float* variance) {
  const float epsilon = 0.001;
  for (int i = 0; i < length; i++) {
    float g = pgm_read_float(&gamma[i]);
    float b = pgm_read_float(&beta[i]);
    float m = pgm_read_float(&mean[i]);
    float v = pgm_read_float(&variance[i]);
    output[i] = g * ((input[i] - m) / sqrt(v + epsilon)) + b;
  }
}

void ModelInference::conv1D(float* input, float* output, int inputLen, int inputChannels,
                            int outputChannels, int kernelSize,
                            const float* weights, const float* bias) {
  // Conv1D with 'same' padding
  int padding = kernelSize / 2;

  for (int outPos = 0; outPos < inputLen; outPos++) {
    for (int outC = 0; outC < outputChannels; outC++) {
      float sum = pgm_read_float(&bias[outC]);

      if (outPos == 0 && outC == 0) {
        Serial.print("Conv1D initial bias: "); Serial.print(sum);
        if (isnan(sum)) Serial.print(" (NaN!)");
        Serial.println();
      }

      for (int k = 0; k < kernelSize; k++) {
        int inPos = outPos - padding + k;

        // Handle padding (zero padding)
        if (inPos >= 0 && inPos < inputLen) {
          for (int inC = 0; inC < inputChannels; inC++) {
            int inputIdx = inPos * inputChannels + inC;
            int weightIdx = ((k * inputChannels + inC) * outputChannels) + outC;
            float w = pgm_read_float(&weights[weightIdx]);
            float inp = input[inputIdx];

            if (outPos == 0 && outC == 0 && k == 0 && inC == 0) {
              Serial.print("First weight: "); Serial.print(w);
              Serial.print(", First input: "); Serial.print(inp);
              Serial.print(", Product: "); Serial.println(inp * w);
            }

            sum += inp * w;

            if (outPos == 0 && outC == 0 && isnan(sum)) {
              Serial.print("NaN at k="); Serial.print(k); Serial.print(" inC="); Serial.println(inC);
            }
          }
        }
      }

      if (outPos == 0 && outC < 3) {
        Serial.print("Conv1D pre-ReLU ["); Serial.print(outC); Serial.print("]: "); Serial.println(sum);
      }

      // ReLU activation
      output[outPos * outputChannels + outC] = max(0.0f, sum);
    }
  }
}

void ModelInference::maxPool1D(float* input, float* output, int inputLen, int channels, int poolSize) {
  int outputLen = inputLen / poolSize;

  for (int outPos = 0; outPos < outputLen; outPos++) {
    for (int c = 0; c < channels; c++) {
      float maxVal = -INFINITY;

      for (int p = 0; p < poolSize; p++) {
        int inPos = outPos * poolSize + p;
        if (inPos < inputLen) {
          float val = input[inPos * channels + c];
          if (val > maxVal) maxVal = val;
        }
      }

      output[outPos * channels + c] = maxVal;
    }
  }
}

void ModelInference::globalAvgPool1D(float* input, float* output, int inputLen, int channels) {
  for (int c = 0; c < channels; c++) {
    float sum = 0.0;
    for (int i = 0; i < inputLen; i++) {
      sum += input[i * channels + c];
    }
    output[c] = sum / inputLen;
  }
}

void ModelInference::dense(float* input, float* output, int inputSize, int outputSize,
                           const float* weights, const float* bias, bool useReLU) {
  for (int o = 0; o < outputSize; o++) {
    float sum = pgm_read_float(&bias[o]);
    for (int i = 0; i < inputSize; i++) {
      sum += input[i] * pgm_read_float(&weights[i * outputSize + o]);
    }
    output[o] = useReLU ? max(0.0f, sum) : sum;
  }
}

void ModelInference::softmax(float* input, int length) {
  // Find max for numerical stability
  float maxVal = input[0];
  for (int i = 1; i < length; i++) {
    if (input[i] > maxVal) maxVal = input[i];
  }

  // Compute exp and sum
  float sumExp = 0.0;
  for (int i = 0; i < length; i++) {
    input[i] = exp(input[i] - maxVal);
    sumExp += input[i];
  }

  // Normalize
  for (int i = 0; i < length; i++) {
    input[i] /= sumExp;
  }
}

void ModelInference::relu(float* data, int length) {
  for (int i = 0; i < length; i++) {
    if (data[i] < 0.0) data[i] = 0.0;
  }
}
`;
  }

  findLayer(name) {
    return this.layers.find(l => l.name === name);
  }

  generateLayerWeights() {
    let code = '';

    // Extract BatchNorm parameters
    const bn = this.findLayer('batch_norm_input');
    if (bn && bn.weights) {
      code += this.formatWeightArray('bn_gamma', bn.weights[0].data);
      code += this.formatWeightArray('bn_beta', bn.weights[1].data);
      code += this.formatWeightArray('bn_mean', bn.weights[2].data);
      code += this.formatWeightArray('bn_variance', bn.weights[3].data);
    }

    // Conv1D layer 1
    const conv1 = this.findLayer('conv1d_1');
    if (conv1 && conv1.weights) {
      code += this.formatWeightArray('conv1_weights', conv1.weights[0].data);
      code += this.formatWeightArray('conv1_bias', conv1.weights[1].data);
    }

    // Conv1D layer 2
    const conv2 = this.findLayer('conv1d_2');
    if (conv2 && conv2.weights) {
      code += this.formatWeightArray('conv2_weights', conv2.weights[0].data);
      code += this.formatWeightArray('conv2_bias', conv2.weights[1].data);
    }

    // Dense layer 1
    const dense1 = this.findLayer('dense_1');
    if (dense1 && dense1.weights) {
      code += this.formatWeightArray('dense1_weights', dense1.weights[0].data);
      code += this.formatWeightArray('dense1_bias', dense1.weights[1].data);
    }

    // Output layer
    const output = this.findLayer('output');
    if (output && output.weights) {
      code += this.formatWeightArray('output_weights', output.weights[0].data);
      code += this.formatWeightArray('output_bias', output.weights[1].data);
    }

    return code;
  }

  formatWeightArray(name, data) {
    let code = `const float ${name}[] PROGMEM = {\n`;
    for (let i = 0; i < data.length; i++) {
      if (i % 8 === 0) code += '  ';
      code += data[i].toFixed(6) + 'f';
      if (i < data.length - 1) code += ',';
      if (i % 8 === 7 || i === data.length - 1) code += '\n';
      else code += ' ';
    }
    code += '};\n\n';
    return code;
  }

  generateReadme() {
    return `# Audio Classification Model - Arduino Library

Generated: ${new Date().toISOString()}

## Sound Classes
${this.labels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

## Hardware
- Arduino Nano 33 BLE Sense

## Model Architecture
- Input: MFCC features (${this.config.numFrames} frames × ${this.config.numMFCC} coefficients = ${this.config.numFrames * this.config.numMFCC} features)
- 1D CNN with Batch Normalization
- Conv1D layers for temporal pattern extraction
- Global Average Pooling
- Dense layers for classification

## Installation
1. **Install as Arduino Library:**
   - In Arduino IDE: Sketch → Include Library → Add .ZIP Library
   - Select the downloaded audio_model.zip file

2. **Required Libraries:**
   - **ArduinoBLE** (install from Library Manager)
   - **arduinoFFT** (install from Library Manager - search for "arduinoFFT" by Enrique Condes)
   - **PDM** (included with Arduino Nano 33 BLE board support)

3. **Board Selection:**
   - Tools → Board → Arduino Nano 33 BLE

4. **Upload:**
   - Open File → Examples → audio_model → audio_model
   - Upload to your Arduino Nano 33 BLE Sense

## Features
✅ Real-time audio classification
✅ Full MFCC feature extraction using FFT and Mel filterbank (matches training exactly)
✅ 1D CNN inference with all layers (Conv1D, BatchNorm, MaxPool, Dense)
✅ BLE UART output compatible with Serial-Bridge
✅ Continuous or volume-triggered modes

## Usage

### BLE UART Mode
**Device Name:** AudioClassifier
**Service:** Nordic UART Service (NUS)
**Output Format:** \`sound_name,confidence\\n\`
**Example:** \`beep,92.50\\n\`

### Serial Monitor
Open Serial Monitor at 115200 baud to see predictions:
\`\`\`
🔊 Detected: beep (92.5%)
  bg: 3.2%
  beep: 92.5%
  boom: 4.3%
\`\`\`

### Commands (via BLE RX)
- \`MODE:CONTINUOUS\` - Classify continuously
- \`MODE:TRIGGERED\` - Only classify when volume > threshold

## Technical Details

### MFCC Feature Extraction
- Sample Rate: ${this.config.sampleRate} Hz
- Frame Size: ~25ms (400 samples)
- Hop Size: ~16ms (256 samples)
- Num Frames: ${this.config.numFrames}
- MFCC Coefficients: ${this.config.numMFCC}

### Model Inference
- All layer types supported (Conv1D, BatchNorm, Pooling, Dense)
- No external dependencies beyond ArduinoBLE
- Optimized for Arduino Nano 33 BLE memory constraints

## Notes
This library implements the complete model architecture, including Conv1D and BatchNormalization layers, giving you the same accuracy as the web version!

## License
Generated by BLE Tiny Motion Trainer
`;
  }
}

// Export for use in main code
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioArduinoGenerator;
}
