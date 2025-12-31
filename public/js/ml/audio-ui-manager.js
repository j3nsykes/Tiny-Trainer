// ============================================================================
// Audio UI Manager - Sound Classification Interface
// ============================================================================
// Manages the audio tab UI, connects audio data collector, visualizer, and training
// ============================================================================

class AudioUIManager {
    constructor() {
        // Audio components
        this.audioCollector = new AudioDataCollector();
        this.audioVisualizer = null;

        // Sound management
        this.sounds = [];
        this.selectedSound = null;
        this.isRecording = false;
        this.isMicrophoneEnabled = false;

        // Settings
        this.samplesPerClass = 20;
        this.duration = 1.0; // seconds

        // Training data
        this.trainingData = {
            samples: [],
            labels: []
        };

        // DOM elements
        this.elements = {};

        console.log('🎤 AudioUIManager initialized');
    }

    init() {
        try {
            this.cacheElements();
            this.attachEventListeners();
            this.updateUI();

            console.log('✅ Audio UI ready');
        } catch (error) {
            console.error('❌ Error initializing Audio UI:', error);
            // Don't throw - allow rest of page to work
        }
    }

    cacheElements() {
        // Settings
        this.elements.samplesPerClass = document.getElementById('audio-samples-per-class');
        this.elements.duration = document.getElementById('audio-duration');

        // Sound management
        this.elements.addSoundBtn = document.getElementById('add-sound-btn');
        this.elements.soundsGrid = document.getElementById('sounds-grid');
        this.elements.emptyState = document.getElementById('sounds-empty-state');

        // Capture status
        this.elements.captureStatus = document.getElementById('audio-capture-status');
        this.elements.statusText = document.getElementById('audio-status-text');
        this.elements.progressFill = document.getElementById('audio-progress-fill');
        this.elements.frameCount = document.getElementById('audio-frame-count');

        // Preview
        this.elements.previewCanvas = document.getElementById('audio-preview-canvas');
        this.elements.previewOverlay = document.getElementById('audio-preview-overlay');
        this.elements.previewMessage = document.getElementById('audio-preview-message');
        this.elements.enableMicBtn = document.getElementById('enable-mic-btn');

        // Actions
        this.elements.loadDataBtn = document.getElementById('load-audio-data-btn');
        this.elements.exportDataBtn = document.getElementById('export-audio-data-btn');
        this.elements.trainModelBtn = document.getElementById('train-audio-model-btn');
        this.elements.trainingInfoText = document.getElementById('audio-training-info-text');
        this.elements.loadDataInput = document.getElementById('load-audio-data-input');
    }

    attachEventListeners() {
        // Enable microphone
        if (this.elements.enableMicBtn) {
            this.elements.enableMicBtn.addEventListener('click', () => this.enableMicrophone());
        }

        // Add sound button - event listener handled in trainer-ui.js via modal

        // Settings
        if (this.elements.samplesPerClass) {
            this.elements.samplesPerClass.addEventListener('change', (e) => {
                this.samplesPerClass = parseInt(e.target.value);
                this.updateUI();
            });
        }

        if (this.elements.duration) {
            this.elements.duration.addEventListener('change', (e) => {
                this.duration = parseFloat(e.target.value);
                this.audioCollector.setSampleDuration(this.duration);
                this.updateFrameCount();
            });
        }

        // Actions
        if (this.elements.loadDataBtn && this.elements.loadDataInput) {
            this.elements.loadDataBtn.addEventListener('click', () => this.elements.loadDataInput.click());
            this.elements.loadDataInput.addEventListener('change', (e) => this.loadTrainingData(e));
        }

        if (this.elements.exportDataBtn) {
            this.elements.exportDataBtn.addEventListener('click', () => this.exportTrainingData());
        }

        if (this.elements.trainModelBtn) {
            this.elements.trainModelBtn.addEventListener('click', () => this.trainModel());
        }
    }

    // ========================================================================
    // Microphone Setup
    // ========================================================================

    async enableMicrophone() {
        try {
            console.log('🎤 Enabling microphone...');
            await this.audioCollector.enableMicrophone();
            console.log('✅ Microphone enabled successfully');

            this.isMicrophoneEnabled = true;

            // Initialize visualizer
            console.log('📊 Initializing visualizer...');
            this.audioVisualizer = new AudioVisualizer('audio-preview-canvas');
            console.log('✅ Visualizer created');

            this.audioVisualizer.start(this.audioCollector);
            console.log('✅ Visualizer started');

            // Hide overlay
            if (this.elements.previewOverlay) {
                this.elements.previewOverlay.style.display = 'none';
                console.log('✅ Overlay hidden');
            }

            if (typeof toast !== 'undefined') {
                toast.success('Microphone enabled');
            }
            console.log('✅ Microphone enabled for audio training');
        } catch (error) {
            console.error('❌ Failed to enable microphone:', error);
            console.error('❌ Error stack:', error.stack);
            if (typeof toast !== 'undefined') {
                toast.error(`Microphone error: ${error.message}`);
            }
        }
    }

    // ========================================================================
    // Sound Management
    // ========================================================================

    addSound(name) {
        // Check for duplicates
        if (this.sounds.find(s => s.name === name)) {
            if (typeof toast !== 'undefined') {
                toast.error(`Sound "${name}" already exists`);
            }
            return;
        }

        const sound = {
            name: name,
            samples: [],
            id: `sound-${Date.now()}`
        };

        this.sounds.push(sound);
        this.renderSounds();
        this.updateUI();

        console.log(`➕ Added sound: ${name}`);
        if (typeof toast !== 'undefined') {
            toast.success(`Added sound: ${name}`);
        }
    }

    removeSound(soundId) {
        const soundIndex = this.sounds.findIndex(s => s.id === soundId);
        if (soundIndex === -1) return;

        const soundName = this.sounds[soundIndex].name;

        if (confirm(`Delete sound "${soundName}" and all its samples?`)) {
            this.sounds.splice(soundIndex, 1);

            if (this.selectedSound?.id === soundId) {
                this.selectedSound = null;
            }

            this.renderSounds();
            this.updateUI();

            console.log(`🗑️ Removed sound: ${soundName}`);
            if (typeof toast !== 'undefined') {
                toast.success(`Removed sound: ${soundName}`);
            }
        }
    }

    selectSound(soundId) {
        this.selectedSound = this.sounds.find(s => s.id === soundId);

        // Update UI
        document.querySelectorAll('.gesture-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.soundId === soundId);
        });

        console.log(`Selected sound: ${this.selectedSound?.name}`);
    }

    // ========================================================================
    // Sample Recording
    // ========================================================================

    async recordSample(soundId) {
        if (!this.isMicrophoneEnabled) {
            if (typeof toast !== 'undefined') {
                toast.error('Please enable microphone first');
            }
            return;
        }

        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) return;

        if (sound.samples.length >= this.samplesPerClass) {
            if (typeof toast !== 'undefined') {
                toast.warning(`Maximum ${this.samplesPerClass} samples reached`);
            }
            return;
        }

        this.isRecording = true;
        this.selectSound(soundId);

        // Add recording class to card for visual feedback
        const card = document.querySelector(`[data-sound-id="${soundId}"]`);
        if (card) {
            card.classList.add('recording');
        }

        // Update status
        if (this.elements.statusText) {
            this.elements.statusText.textContent = `Recording ${sound.name}...`;
        }
        if (this.elements.captureStatus) {
            this.elements.captureStatus.classList.add('recording');
        }

        console.log(`🔴 Recording sample for: ${sound.name}`);

        // Keep visualizer running during recording to show live spectrogram
        // (No longer needed to stop it since we're using polling instead of scriptProcessor)

        // Start recording
        this.audioCollector.startRecording((event) => {
            if (event.type === 'progress') {
                // Update progress bar
                const progress = event.progress * 100;
                if (this.elements.progressFill) {
                    this.elements.progressFill.style.width = `${progress}%`;
                }
                if (this.elements.frameCount) {
                    this.elements.frameCount.textContent = `${Math.round(progress)}%`;
                }

                // Keep spectrogram visible during recording - don't override with progress overlay
            } else if (event.type === 'complete') {
                // Save sample
                sound.samples.push({
                    features: event.features,
                    numFrames: event.numFrames,
                    numMFCC: event.numMFCC,
                    timestamp: Date.now()
                });

                this.isRecording = false;

                // Remove recording class from card
                const card = document.querySelector(`[data-sound-id="${soundId}"]`);
                if (card) {
                    card.classList.remove('recording');
                }

                if (this.elements.captureStatus) {
                    this.elements.captureStatus.classList.remove('recording');
                }
                if (this.elements.statusText) {
                    this.elements.statusText.textContent = 'Ready';
                }
                if (this.elements.progressFill) {
                    this.elements.progressFill.style.width = '0%';
                }
                if (this.elements.frameCount) {
                    this.elements.frameCount.textContent = `${sound.samples.length} / ${this.samplesPerClass}`;
                }

                this.renderSounds();
                this.updateUI();

                console.log(`✅ Sample recorded (${sound.samples.length}/${this.samplesPerClass})`);
                if (typeof toast !== 'undefined') {
                    toast.success(`Recorded ${sound.name} (${sound.samples.length}/${this.samplesPerClass})`);
                }

                // Visualizer already running - no need to restart
            }
        }, this.duration);
    }

    deleteSample(soundId, sampleIndex) {
        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) return;

        sound.samples.splice(sampleIndex, 1);
        this.renderSounds();
        this.updateUI();

        console.log(`🗑️ Deleted sample from ${sound.name}`);
    }

    // ========================================================================
    // UI Rendering
    // ========================================================================

    renderSounds() {
        if (!this.elements.soundsGrid) return;

        if (this.sounds.length === 0) {
            this.elements.soundsGrid.innerHTML = '<div class="empty-state" id="sounds-empty-state"><p>No sounds yet. Click "+ Add Sound" to get started.</p><p class="hint">🎤 This will use your laptop\'s microphone for training</p></div>';
            return;
        }

        this.elements.soundsGrid.innerHTML = '';

        this.sounds.forEach(sound => {
            const card = this.createSoundCard(sound);
            this.elements.soundsGrid.appendChild(card);
        });
    }

    createSoundCard(sound) {
        const card = document.createElement('div');
        card.className = 'gesture-card';
        card.dataset.soundId = sound.id;

        if (this.selectedSound?.id === sound.id) {
            card.classList.add('selected');
        }

        const progress = (sound.samples.length / this.samplesPerClass) * 100;

        card.innerHTML = `
            <div class="gesture-header">
                <h3 class="gesture-name">${sound.name}</h3>
                <button class="btn-icon delete-sound" data-sound-id="${sound.id}">
                    <span>🗑️</span>
                </button>
            </div>
            <div class="gesture-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="sample-count">${sound.samples.length} / ${this.samplesPerClass}</span>
            </div>
            <div class="gesture-actions">
                <button class="btn-record" data-sound-id="${sound.id}" ${sound.samples.length >= this.samplesPerClass ? 'disabled' : ''}>
                    🎤 Record
                </button>
            </div>
        `;

        // Event listeners
        card.querySelector('.btn-record').addEventListener('click', (e) => {
            e.stopPropagation();
            this.recordSample(sound.id);
        });

        card.querySelector('.delete-sound').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeSound(sound.id);
        });

        card.addEventListener('click', () => {
            this.selectSound(sound.id);
        });

        return card;
    }

    updateUI() {
        // Update frame count display
        this.updateFrameCount();

        // Check if we have enough data to train
        const hasEnoughSounds = this.sounds.length >= 2;
        const allSoundsHaveSamples = this.sounds.every(s => s.samples.length > 0);
        const canTrain = hasEnoughSounds && allSoundsHaveSamples;

        if (this.elements.trainModelBtn) {
            this.elements.trainModelBtn.disabled = !canTrain;
        }

        if (this.elements.exportDataBtn) {
            this.elements.exportDataBtn.disabled = this.sounds.length === 0;
        }

        if (this.elements.trainingInfoText) {
            if (!hasEnoughSounds) {
                this.elements.trainingInfoText.textContent = 'Add at least 2 sounds with samples to train';
            } else if (!allSoundsHaveSamples) {
                this.elements.trainingInfoText.textContent = 'Record samples for all sounds';
            } else {
                const totalSamples = this.sounds.reduce((sum, s) => sum + s.samples.length, 0);
                this.elements.trainingInfoText.textContent = `Ready to train with ${totalSamples} samples`;
            }
        }
    }

    updateFrameCount() {
        if (!this.elements.frameCount) return;
        if (!this.audioCollector) return;

        try {
            const dims = this.audioCollector.getFeatureDimensions();
            this.elements.frameCount.textContent = `0 / ${this.samplesPerClass}`;
            console.log(`Audio dimensions: ${dims.numFrames} frames × ${dims.numMFCC} MFCC = ${dims.totalFeatures} features`);
        } catch (error) {
            console.warn('Could not update frame count:', error);
        }
    }

    // ========================================================================
    // Training Integration
    // ========================================================================

    trainModel() {
        // Prepare training data
        this.trainingData.samples = [];
        this.trainingData.labels = [];

        // Get actual feature length from first sample in the dataset
        const firstSample = this.sounds[0]?.samples[0];
        if (!firstSample) {
            if (typeof toast !== 'undefined') {
                toast.error('No samples available for training');
            }
            return;
        }

        const actualFeatureLength = firstSample.features.length;
        console.log(`Actual sample feature length: ${actualFeatureLength}`);

        // Check if all samples have the same length
        let allSameLength = true;
        let minLength = actualFeatureLength;
        let maxLength = actualFeatureLength;

        this.sounds.forEach(sound => {
            sound.samples.forEach(sample => {
                if (sample.features.length !== actualFeatureLength) {
                    allSameLength = false;
                }
                minLength = Math.min(minLength, sample.features.length);
                maxLength = Math.max(maxLength, sample.features.length);
            });
        });

        console.log(`Feature length range: ${minLength} - ${maxLength}`);

        if (!allSameLength) {
            console.warn('⚠️ Samples have inconsistent feature lengths! Using actual lengths without padding.');
            if (typeof toast !== 'undefined') {
                toast.warning('Samples have different lengths - this may affect accuracy');
            }
        }

        // Use the actual feature length from samples, not the calculated expected length
        // This ensures we don't pad/truncate unnecessarily
        const featureStats = {};

        this.sounds.forEach((sound, soundIndex) => {
            featureStats[sound.name] = {
                samples: 0,
                means: [],
                stds: [],
                mins: [],
                maxs: []
            };

            sound.samples.forEach(sample => {
                let features = sample.features;

                // Only pad/truncate if absolutely necessary (size mismatch)
                if (features.length < actualFeatureLength) {
                    // Pad with zeros
                    const padded = new Array(actualFeatureLength).fill(0);
                    for (let i = 0; i < features.length; i++) {
                        padded[i] = features[i];
                    }
                    features = padded;
                    console.log(`⚠️ Padded sample from ${sample.features.length} to ${actualFeatureLength}`);
                } else if (features.length > actualFeatureLength) {
                    // Truncate
                    features = features.slice(0, actualFeatureLength);
                    console.log(`⚠️ Truncated sample from ${sample.features.length} to ${actualFeatureLength}`);
                }

                // Calculate statistics for this sample
                const mean = features.reduce((a, b) => a + b, 0) / features.length;
                const std = Math.sqrt(features.reduce((a, b) => a + (b - mean) ** 2, 0) / features.length);
                const min = Math.min(...features);
                const max = Math.max(...features);

                featureStats[sound.name].samples++;
                featureStats[sound.name].means.push(mean);
                featureStats[sound.name].stds.push(std);
                featureStats[sound.name].mins.push(min);
                featureStats[sound.name].maxs.push(max);

                this.trainingData.samples.push(features);
                this.trainingData.labels.push(soundIndex);
            });
        });

        // Log feature statistics per class
        console.log('📊 Feature statistics per class:');
        Object.entries(featureStats).forEach(([soundName, stats]) => {
            const avgMean = stats.means.reduce((a, b) => a + b, 0) / stats.samples;
            const avgStd = stats.stds.reduce((a, b) => a + b, 0) / stats.samples;
            const globalMin = Math.min(...stats.mins);
            const globalMax = Math.max(...stats.maxs);
            console.log(`   ${soundName} (${stats.samples} samples):`);
            console.log(`     Avg mean: ${avgMean.toFixed(4)}, Avg std: ${avgStd.toFixed(4)}`);
            console.log(`     Range: [${globalMin.toFixed(4)}, ${globalMax.toFixed(4)}]`);
        });

        const soundLabels = this.sounds.map(s => s.name);

        console.log('🚀 Starting audio model training...');
        console.log(`   Total samples: ${this.trainingData.samples.length}`);
        console.log(`   Feature length: ${this.trainingData.samples[0].length}`);
        console.log(`   Sounds: ${soundLabels.join(', ')}`);

        // Calculate dimensions from actual sample data
        const actualFeatureDims = {
            totalFeatures: actualFeatureLength,
            numFrames: Math.floor(actualFeatureLength / 13), // 13 MFCC coefficients
            numMFCC: 13
        };

        console.log(`   Calculated dimensions:`, actualFeatureDims);

        // Trigger training via global training UI manager
        if (window.trainingUIManager) {
            window.trainingUIManager.startAudioTraining(
                this.trainingData.samples,
                this.trainingData.labels,
                soundLabels,
                actualFeatureDims  // Use actual dimensions from data, not expected from collector
            );
        } else {
            console.error('❌ Training UI manager not found');
            if (typeof toast !== 'undefined') {
                toast.error('Training system not initialized');
            }
        }
    }

    // ========================================================================
    // Data Import/Export
    // ========================================================================

    exportTrainingData() {
        const data = {
            type: 'audio',
            version: '1.0',
            config: this.audioCollector.getConfig(),
            dimensions: this.audioCollector.getFeatureDimensions(),
            samplesPerClass: this.samplesPerClass,
            duration: this.duration,
            sounds: this.sounds.map(sound => ({
                name: sound.name,
                samples: sound.samples
            })),
            timestamp: new Date().toISOString()
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `audio-training-data-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);

        console.log('📥 Training data exported');
        if (typeof toast !== 'undefined') { toast.success('Training data exported'); };
    }

    loadTrainingData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.type !== 'audio') {
                    throw new Error('Invalid file type. Expected audio training data.');
                }

                // Load sounds
                this.sounds = data.sounds.map((sound, index) => ({
                    name: sound.name,
                    samples: sound.samples,
                    id: `sound-${Date.now()}-${index}`
                }));

                // Load settings
                if (data.samplesPerClass) {
                    this.samplesPerClass = data.samplesPerClass;
                    this.elements.samplesPerClass.value = this.samplesPerClass;
                }

                if (data.duration) {
                    this.duration = data.duration;
                    this.elements.duration.value = this.duration;
                    this.audioCollector.setSampleDuration(this.duration);
                }

                this.renderSounds();
                this.updateUI();

                const totalSamples = this.sounds.reduce((sum, s) => sum + s.samples.length, 0);

                console.log('📂 Training data loaded');
                console.log(`   Sounds: ${this.sounds.length}`);
                console.log(`   Samples: ${totalSamples}`);

                if (typeof toast !== 'undefined') {
                    toast.success(`Loaded ${this.sounds.length} sounds, ${totalSamples} samples`);
                }
            } catch (error) {
                console.error('❌ Failed to load data:', error);
                if (typeof toast !== 'undefined') {
                    toast.error('Failed to load training data');
                }
            }
        };

        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    destroy() {
        if (this.audioVisualizer) {
            this.audioVisualizer.destroy();
        }

        if (this.audioCollector) {
            this.audioCollector.disableMicrophone();
        }

        console.log('🗑️ AudioUIManager destroyed');
    }
}
