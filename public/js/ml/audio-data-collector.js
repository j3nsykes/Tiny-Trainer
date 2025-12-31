// ============================================================================
// Audio Data Collector - Laptop Microphone Capture & MFCC Feature Extraction
// ============================================================================
// Captures audio using laptop mic, extracts MFCC features for training
// Compatible with Arduino PDM mic feature extraction for inference
// ============================================================================

class AudioDataCollector {
    constructor() {
        this.audioContext = null;
        this.microphone = null;
        this.analyser = null;
        this.scriptProcessor = null;
        this.isRecording = false;
        this.isEnabled = false;

        // Recording state
        this.currentSample = [];
        this.recordingCallback = null;
        this.sampleDuration = 1.0; // seconds
        this.sampleRate = 16000; // Match Arduino PDM mic sample rate

        // MFCC Configuration (Edge Impulse compatible)
        this.config = {
            sampleRate: 16000,
            fftSize: 512,
            hopLength: 256,
            numMFCC: 13,
            numMelFilters: 40,
            fMin: 300,
            fMax: 8000,
            windowFunction: 'hamming'
        };

        // Feature storage
        this.features = [];
        this.rawAudio = [];

        // Volume threshold for auto-trigger
        this.volumeThreshold = 0.01;
        this.useVolumeThreshold = false;

        console.log('🎤 AudioDataCollector initialized');
    }

    // ========================================================================
    // Microphone Setup
    // ========================================================================

    async enableMicrophone() {
        try {
            console.log('🎤 Requesting microphone access...');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.config.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            });

            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.sampleRate
            });

            // Create nodes
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.config.fftSize;
            this.analyser.smoothingTimeConstant = 0;

            // Connect audio graph (don't connect to destination to avoid feedback)
            this.microphone.connect(this.analyser);

            // Note: We don't need scriptProcessor for visualization
            // The analyser provides all the data we need via getByteTimeDomainData and getByteFrequencyData

            this.isEnabled = true;
            console.log('✅ Microphone enabled');
            console.log(`   Sample rate: ${this.audioContext.sampleRate} Hz`);
            console.log(`   FFT size: ${this.config.fftSize}`);

            return true;
        } catch (error) {
            console.error('❌ Microphone access denied:', error);
            throw new Error('Microphone access denied. Please grant permission and try again.');
        }
    }

    disableMicrophone() {
        if (this.audioContext) {
            this.stopRecording();

            if (this.scriptProcessor) {
                this.scriptProcessor.disconnect();
                this.scriptProcessor = null;
            }

            if (this.silentGain) {
                this.silentGain.disconnect();
                this.silentGain = null;
            }

            if (this.analyser) {
                this.analyser.disconnect();
                this.analyser = null;
            }

            if (this.microphone) {
                this.microphone.disconnect();
                this.microphone.mediaStream.getTracks().forEach(track => track.stop());
                this.microphone = null;
            }

            this.audioContext.close();
            this.audioContext = null;
            this.isEnabled = false;

            console.log('🎤 Microphone disabled');
        }
    }

    // ========================================================================
    // Recording Control
    // ========================================================================

    startRecording(callback, duration = 1.0) {
        if (!this.isEnabled) {
            throw new Error('Microphone not enabled. Call enableMicrophone() first.');
        }

        if (this.isRecording) {
            console.warn('Already recording');
            return;
        }

        this.sampleDuration = duration;
        this.recordingCallback = callback;
        this.currentSample = [];
        this.rawAudio = [];
        this.features = [];
        this.isRecording = true;

        const expectedSamples = Math.ceil(this.sampleDuration * this.config.sampleRate);

        console.log(`🔴 Recording started (${this.sampleDuration}s, ${expectedSamples} samples expected)`);

        // Use setTimeout-based polling instead of scriptProcessor to avoid crashes
        console.log('🔧 Starting polling-based recording...');

        const recordingStartTime = Date.now();
        const pollInterval = 20; // Poll every 20ms (faster to collect more data)

        this.recordingIntervalId = setInterval(() => {
            if (!this.isRecording) {
                clearInterval(this.recordingIntervalId);
                return;
            }

            try {
                // Get current audio data from analyser
                const bufferLength = this.analyser.fftSize;
                const dataArray = new Float32Array(bufferLength);
                this.analyser.getFloatTimeDomainData(dataArray);

                // Add to raw audio buffer
                for (let i = 0; i < dataArray.length; i++) {
                    this.rawAudio.push(dataArray[i]);
                }

                console.log('📊 Polled audio data, buffer length:', this.rawAudio.length);

                // Check if we have enough data
                if (this.rawAudio.length >= expectedSamples) {
                    console.log('✅ Reached expected samples, stopping recording');
                    clearInterval(this.recordingIntervalId);
                    this.stopRecording();
                    return;
                }

                // Also check time-based completion (fallback with 10% buffer)
                const elapsed = (Date.now() - recordingStartTime) / 1000;
                if (elapsed >= this.sampleDuration * 1.1) {
                    console.log('✅ Reached expected duration (with buffer), stopping recording');
                    clearInterval(this.recordingIntervalId);
                    this.stopRecording();
                    return;
                }

                // Callback with progress
                if (this.recordingCallback) {
                    const progress = Math.min(this.rawAudio.length / expectedSamples, 1.0);
                    this.recordingCallback({
                        type: 'progress',
                        progress: progress,
                        samples: this.rawAudio.length
                    });
                }
            } catch (error) {
                console.error('❌ Error in polling loop:', error);
                console.error('Stack:', error.stack);
                clearInterval(this.recordingIntervalId);
                this.stopRecording();
            }
        }, pollInterval);

        console.log('✅ Polling started');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;

        // Clean up interval
        if (this.recordingIntervalId) {
            clearInterval(this.recordingIntervalId);
            this.recordingIntervalId = null;
        }

        console.log(`⏹️ Recording stopped (${this.rawAudio.length} samples collected)`);

        try {
            // Extract MFCC features from the recorded audio
            console.log('🔬 Extracting MFCC features from recorded audio...');
            const features = this.extractMFCCFromRecording(this.rawAudio);
            console.log(`✅ Extracted ${features.length} MFCC frames`);

            // Flatten features into single array for TensorFlow
            const flattenedFeatures = this.flattenFeatures(features);

            // Callback with final result
            if (this.recordingCallback) {
                this.recordingCallback({
                    type: 'complete',
                    features: flattenedFeatures,
                    numFrames: features.length,
                    numMFCC: this.config.numMFCC,
                    sampleRate: this.config.sampleRate,
                    duration: this.sampleDuration
                });
            }

            return flattenedFeatures;
        } catch (error) {
            console.error('❌ Error extracting features:', error);
            console.error('Stack:', error.stack);
            if (this.recordingCallback) {
                this.recordingCallback({
                    type: 'error',
                    error: error.message
                });
            }
        }
    }

    extractMFCCFromRecording(audioData) {
        // Extract MFCC features from complete recording using sliding window
        const frames = [];
        const hopLength = this.config.hopLength;
        const fftSize = this.config.fftSize;

        for (let i = 0; i + fftSize <= audioData.length; i += hopLength) {
            const frame = audioData.slice(i, i + fftSize);
            const mfcc = this.extractMFCCFromBuffer(frame);
            frames.push(mfcc);
        }

        return frames;
    }

    // ========================================================================
    // MFCC Feature Extraction
    // ========================================================================

    extractMFCCFromBuffer(audioBuffer) {
        // Apply window function
        const windowedBuffer = this.applyWindow(audioBuffer);

        // Compute FFT
        const fft = this.computeFFT(windowedBuffer);

        // Compute power spectrum
        const powerSpectrum = this.computePowerSpectrum(fft);

        // Apply mel filterbank
        const melSpectrum = this.applyMelFilterbank(powerSpectrum);

        // Compute DCT to get MFCCs
        const mfcc = this.computeDCT(melSpectrum);

        return mfcc.slice(0, this.config.numMFCC);
    }

    applyWindow(buffer) {
        const windowed = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            // Hamming window
            const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (buffer.length - 1));
            windowed[i] = buffer[i] * w;
        }
        return windowed;
    }

    computeFFT(buffer) {
        // Simple DFT implementation (for educational purposes)
        // In production, you'd use a library like FFT.js
        const fftSize = this.config.fftSize;
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);

        // Zero-pad if needed
        const paddedBuffer = new Float32Array(fftSize);
        paddedBuffer.set(buffer.slice(0, Math.min(buffer.length, fftSize)));

        // Compute DFT
        for (let k = 0; k < fftSize / 2; k++) {
            let realSum = 0;
            let imagSum = 0;

            for (let n = 0; n < fftSize; n++) {
                const angle = -2 * Math.PI * k * n / fftSize;
                realSum += paddedBuffer[n] * Math.cos(angle);
                imagSum += paddedBuffer[n] * Math.sin(angle);
            }

            real[k] = realSum;
            imag[k] = imagSum;
        }

        return { real, imag };
    }

    computePowerSpectrum(fft) {
        const fftSize = this.config.fftSize;
        const power = new Float32Array(fftSize / 2);

        for (let i = 0; i < fftSize / 2; i++) {
            power[i] = (fft.real[i] ** 2 + fft.imag[i] ** 2) / fftSize;
        }

        return power;
    }

    applyMelFilterbank(powerSpectrum) {
        const melFilters = this.createMelFilterbank();
        const melSpectrum = new Float32Array(this.config.numMelFilters);

        for (let i = 0; i < this.config.numMelFilters; i++) {
            let sum = 0;
            for (let j = 0; j < powerSpectrum.length; j++) {
                sum += powerSpectrum[j] * melFilters[i][j];
            }
            melSpectrum[i] = Math.log(Math.max(sum, 1e-10)); // Log mel spectrum
        }

        return melSpectrum;
    }

    createMelFilterbank() {
        // Cache filterbank if already created
        if (this.melFilterbank) {
            return this.melFilterbank;
        }

        const numFilters = this.config.numMelFilters;
        const fftSize = this.config.fftSize;
        const sampleRate = this.config.sampleRate;
        const fMin = this.config.fMin;
        const fMax = this.config.fMax;

        // Helper: Hz to Mel
        const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
        const melToHz = (mel) => 700 * (Math.pow(10, mel / 2595) - 1);

        // Create mel-spaced frequencies
        const melMin = hzToMel(fMin);
        const melMax = hzToMel(fMax);
        const melPoints = new Float32Array(numFilters + 2);

        for (let i = 0; i < numFilters + 2; i++) {
            melPoints[i] = melToHz(melMin + (melMax - melMin) * i / (numFilters + 1));
        }

        // Convert to FFT bin numbers
        const bins = melPoints.map(f => Math.floor((fftSize + 1) * f / sampleRate));

        // Create triangular filters
        this.melFilterbank = [];
        for (let i = 0; i < numFilters; i++) {
            const filter = new Float32Array(fftSize / 2);
            const leftBin = bins[i];
            const centerBin = bins[i + 1];
            const rightBin = bins[i + 2];

            // Rising slope
            for (let j = leftBin; j < centerBin; j++) {
                filter[j] = (j - leftBin) / (centerBin - leftBin);
            }

            // Falling slope
            for (let j = centerBin; j < rightBin; j++) {
                filter[j] = (rightBin - j) / (rightBin - centerBin);
            }

            this.melFilterbank.push(filter);
        }

        return this.melFilterbank;
    }

    computeDCT(melSpectrum) {
        const numCoeffs = this.config.numMFCC;
        const numFilters = melSpectrum.length;
        const mfcc = new Float32Array(numCoeffs);

        for (let i = 0; i < numCoeffs; i++) {
            let sum = 0;
            for (let j = 0; j < numFilters; j++) {
                sum += melSpectrum[j] * Math.cos(Math.PI * i * (j + 0.5) / numFilters);
            }
            mfcc[i] = sum;
        }

        return mfcc;
    }

    flattenFeatures(features) {
        // Flatten 2D array [frames][mfcc] into 1D array for TensorFlow
        const flattened = [];
        for (const frame of features) {
            flattened.push(...frame);
        }
        return flattened;
    }

    // ========================================================================
    // Real-time Audio Analysis (for visualization)
    // ========================================================================

    getTimeDomainData() {
        if (!this.analyser) return new Uint8Array(0);

        const bufferLength = this.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }

    getFrequencyData() {
        if (!this.analyser) return new Uint8Array(0);

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    getRMS() {
        const timeDomain = this.getTimeDomainData();
        let sum = 0;
        for (let i = 0; i < timeDomain.length; i++) {
            const normalized = (timeDomain[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / timeDomain.length);
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    setSampleDuration(duration) {
        this.sampleDuration = duration;
    }

    setVolumeThreshold(threshold) {
        this.volumeThreshold = threshold;
    }

    enableVolumeThreshold(enabled) {
        this.useVolumeThreshold = enabled;
    }

    getConfig() {
        return { ...this.config };
    }

    // Get feature dimensions for model input shape
    getFeatureDimensions() {
        const framesPerSecond = this.config.sampleRate / this.config.hopLength;
        const numFrames = Math.ceil(this.sampleDuration * framesPerSecond);
        const totalFeatures = numFrames * this.config.numMFCC;

        return {
            numFrames: numFrames,
            numMFCC: this.config.numMFCC,
            totalFeatures: totalFeatures
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioDataCollector;
}
