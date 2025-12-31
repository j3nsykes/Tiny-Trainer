// ============================================================================
// Audio Visualizer - Waveform and Spectrogram Display
// ============================================================================
// Real-time visualization of audio data and features
// ============================================================================

class AudioVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas with id '${canvasId}' not found`);
        }

        this.ctx = this.canvas.getContext('2d');

        // Get display size
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;

        // Get device pixel ratio for high-DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size to match display size * device pixel ratio
        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        // Scale context to match device pixel ratio
        this.ctx.scale(dpr, dpr);

        // Use display size for all calculations
        this.width = displayWidth;
        this.height = displayHeight;

        // Color scheme
        this.colors = {
            background: '#1a0f2e',
            waveform: '#7c4dff',
            spectrum: '#00ff88',
            grid: '#2a1a4a',
            text: '#e0e0e0',
            textSecondary: '#a0a0d0'
        };

        // Layout
        this.waveformHeight = this.height * 0.4;
        this.spectrogramHeight = this.height * 0.6;

        // Spectrogram buffer (scrolling display)
        this.spectrogramBuffer = [];
        this.maxSpectrogramFrames = 100;

        this.isAnimating = false;
        this.animationFrameId = null;

        // Throttle rendering to reduce CPU usage
        this.targetFPS = 30; // Reduce from 60fps to 30fps
        this.frameInterval = 1000 / this.targetFPS;
        this.lastFrameTime = 0;

        console.log('📊 AudioVisualizer initialized');
    }

    // ========================================================================
    // Main Drawing Loop
    // ========================================================================

    start(audioCollector) {
        if (this.isAnimating) return;

        this.audioCollector = audioCollector;
        this.isAnimating = true;
        this.lastFrameTime = performance.now();

        const draw = (currentTime) => {
            if (!this.isAnimating) return;

            // Throttle to target FPS
            const elapsed = currentTime - this.lastFrameTime;
            if (elapsed < this.frameInterval) {
                this.animationFrameId = requestAnimationFrame(draw);
                return;
            }

            this.lastFrameTime = currentTime - (elapsed % this.frameInterval);

            try {
                this.clear();
                this.drawWaveform();
                this.drawSpectrogram();
                this.drawLabels();
            } catch (error) {
                console.error('❌ Visualization error:', error);
                console.error('Stack:', error.stack);
                this.stop();
                return;
            }

            this.animationFrameId = requestAnimationFrame(draw);
        };

        this.animationFrameId = requestAnimationFrame(draw);
        console.log('▶️ Audio visualization started at', this.targetFPS, 'fps');
    }

    stop() {
        this.isAnimating = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        console.log('⏸️ Audio visualization stopped');
    }

    clear() {
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // ========================================================================
    // Waveform Display (Time Domain)
    // ========================================================================

    drawWaveform() {
        if (!this.audioCollector || !this.audioCollector.isEnabled) {
            this.drawPlaceholder('Waveform', 0, this.waveformHeight);
            return;
        }

        const timeDomainData = this.audioCollector.getTimeDomainData();
        if (timeDomainData.length === 0) return;

        const sliceWidth = this.width / timeDomainData.length;
        const centerY = this.waveformHeight / 2;
        const amplitude = this.waveformHeight / 2 - 10;

        // Draw grid
        this.drawGrid(0, this.waveformHeight, 5);

        // Draw waveform
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.colors.waveform;
        this.ctx.lineWidth = 2;

        for (let i = 0; i < timeDomainData.length; i++) {
            const v = (timeDomainData[i] - 128) / 128.0;
            const y = centerY + v * amplitude;
            const x = i * sliceWidth;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.stroke();

        // Draw center line
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.width, centerY);
        this.ctx.stroke();

        // Draw RMS indicator
        const rms = this.audioCollector.getRMS();
        this.drawRMSMeter(rms);
    }

    drawRMSMeter(rms) {
        const meterX = this.width - 60;
        const meterY = 10;
        const meterWidth = 50;
        const meterHeight = this.waveformHeight - 20;

        // Background
        this.ctx.fillStyle = 'rgba(42, 26, 74, 0.5)';
        this.ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

        // RMS level
        const levelHeight = rms * meterHeight;
        const gradient = this.ctx.createLinearGradient(meterX, meterY + meterHeight, meterX, meterY);
        gradient.addColorStop(0, '#00ff88');
        gradient.addColorStop(0.5, '#7c4dff');
        gradient.addColorStop(1, '#ff4444');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(meterX, meterY + meterHeight - levelHeight, meterWidth, levelHeight);

        // Border
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);

        // Label
        this.ctx.fillStyle = this.colors.textSecondary;
        this.ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Vol', meterX + meterWidth / 2, meterY + meterHeight + 12);
    }

    // ========================================================================
    // Spectrogram Display (Frequency Domain)
    // ========================================================================

    drawSpectrogram() {
        if (!this.audioCollector || !this.audioCollector.isEnabled) {
            this.drawPlaceholder('Spectrogram (Frequency)', this.waveformHeight, this.height);
            return;
        }

        const frequencyData = this.audioCollector.getFrequencyData();
        if (frequencyData.length === 0) return;

        // Add current frame to buffer
        this.spectrogramBuffer.push(new Uint8Array(frequencyData));

        // Limit buffer size (scrolling window)
        if (this.spectrogramBuffer.length > this.maxSpectrogramFrames) {
            this.spectrogramBuffer.shift();
        }

        // Draw grid
        this.drawGrid(this.waveformHeight, this.height, 4);

        // Draw spectrogram with crisp edges
        const frameWidth = this.width / this.maxSpectrogramFrames;
        const binHeight = this.spectrogramHeight / frequencyData.length;

        // Disable image smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;

        for (let i = 0; i < this.spectrogramBuffer.length; i++) {
            const frame = this.spectrogramBuffer[i];
            const x = Math.floor(i * frameWidth);

            for (let j = 0; j < frame.length; j++) {
                const value = frame[j];
                const intensity = value / 255;

                // Original color map: blue (low) -> purple -> red (high)
                let r, g, b;
                if (intensity < 0.5) {
                    r = Math.floor(intensity * 2 * 124);
                    g = Math.floor(intensity * 2 * 77);
                    b = 255;
                } else {
                    r = 255;
                    g = Math.floor((1 - intensity) * 2 * 77);
                    b = Math.floor((1 - intensity) * 2 * 255);
                }

                this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

                // Draw from bottom to top (low freq at bottom) with pixel-perfect alignment
                const y = Math.floor(this.waveformHeight + this.spectrogramHeight - (j * binHeight));
                this.ctx.fillRect(x, y, Math.ceil(frameWidth) + 1, Math.ceil(binHeight) + 1);
            }
        }

        // Re-enable smoothing for other elements
        this.ctx.imageSmoothingEnabled = true;

        // Draw frequency labels
        this.drawFrequencyLabels();
    }

    drawFrequencyLabels() {
        const sampleRate = this.audioCollector?.config?.sampleRate || 16000;
        const freqs = [0, 2000, 4000, 6000, 8000];
        const nyquist = sampleRate / 2;

        this.ctx.fillStyle = this.colors.textSecondary;
        this.ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.ctx.textAlign = 'left';

        freqs.forEach(freq => {
            if (freq > nyquist) return;

            const ratio = freq / nyquist;
            const y = this.waveformHeight + this.spectrogramHeight - (ratio * this.spectrogramHeight);

            // Draw tick mark
            this.ctx.strokeStyle = this.colors.grid;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(10, y);
            this.ctx.stroke();

            // Draw label
            this.ctx.fillText(`${(freq / 1000).toFixed(1)}k`, 12, y + 3);
        });
    }

    // ========================================================================
    // Recording Visualization
    // ========================================================================

    drawRecordingProgress(progress, label) {
        this.clear();

        // Draw progress bar
        const barWidth = this.width - 100;
        const barHeight = 40;
        const barX = 50;
        const barY = this.height / 2 - barHeight / 2;

        // Background
        this.ctx.fillStyle = 'rgba(42, 26, 74, 0.8)';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // Progress
        const gradient = this.ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        gradient.addColorStop(0, '#7c4dff');
        gradient.addColorStop(1, '#00ff88');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);

        // Border
        this.ctx.strokeStyle = this.colors.waveform;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Label
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Recording: ${label}`, this.width / 2, barY - 20);

        // Percentage
        this.ctx.font = '14px monospace';
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.width / 2, barY + barHeight + 25);
    }

    // ========================================================================
    // Utility Drawing
    // ========================================================================

    drawGrid(startY, endY, divisions) {
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);

        const height = endY - startY;
        const step = height / divisions;

        for (let i = 0; i <= divisions; i++) {
            const y = startY + i * step;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);
    }

    drawLabels() {
        this.ctx.fillStyle = this.colors.textSecondary;
        this.ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.ctx.textAlign = 'left';

        // Waveform label
        this.ctx.fillText('Waveform (time domain)', 10, 15);

        // Spectrogram label
        this.ctx.fillText('Spectrogram (frequency domain)', 10, this.waveformHeight + 15);
    }

    drawPlaceholder(label, startY, endY) {
        const centerY = startY + (endY - startY) / 2;

        this.ctx.fillStyle = this.colors.textSecondary;
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, this.width / 2, centerY - 10);
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText('Microphone not enabled', this.width / 2, centerY + 10);
    }

    // ========================================================================
    // MFCC Visualization (for debugging)
    // ========================================================================

    drawMFCCFeatures(mfccFrames) {
        if (!mfccFrames || mfccFrames.length === 0) return;

        this.clear();

        const numFrames = mfccFrames.length;
        const numCoeffs = mfccFrames[0].length;

        const frameWidth = this.width / numFrames;
        const coeffHeight = this.height / numCoeffs;

        // Normalize MFCCs for visualization
        let min = Infinity;
        let max = -Infinity;
        for (const frame of mfccFrames) {
            for (const val of frame) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        }

        // Draw MFCC heatmap
        for (let i = 0; i < numFrames; i++) {
            for (let j = 0; j < numCoeffs; j++) {
                const value = mfccFrames[i][j];
                const normalized = (value - min) / (max - min);

                // Color: blue (low) -> green -> yellow -> red (high)
                const hue = (1 - normalized) * 240; // 240 = blue, 0 = red
                this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

                const x = i * frameWidth;
                const y = j * coeffHeight;

                this.ctx.fillRect(x, y, Math.ceil(frameWidth), Math.ceil(coeffHeight));
            }
        }

        // Labels
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('MFCC Coefficients', 10, 15);

        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${numFrames} frames × ${numCoeffs} coeffs`, this.width - 10, 15);
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    destroy() {
        this.stop();
        this.spectrogramBuffer = [];
        this.audioCollector = null;
        console.log('🗑️ AudioVisualizer destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioVisualizer;
}
