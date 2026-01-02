// Feature Flags Configuration
// Toggle features on/off without deleting code

const FeatureFlags = {
    // Audio classification is experimental and requires Python for TFLite conversion
    // Recommend using Teachable Machine or Edge Impulse for audio projects
    ENABLE_AUDIO: false,

    // IMU (accelerometer/gyroscope) classification - STABLE
    ENABLE_IMU: true,

    // Color classification - STABLE
    ENABLE_COLOR: true,

    // IMU Regression mode - EXPERIMENTAL
    // Allows continuous value prediction (0-1 range) instead of classification
    // Uses sigmoid output activation for proper 0-1 range constraint
    ENABLE_REGRESSION: false,

    // Future: Generic sensor input classification
    ENABLE_CUSTOM_SENSORS: false,

    // Development/debug features
    DEBUG_MODE: false
};

// Make available globally
if (typeof window !== 'undefined') {
    window.FeatureFlags = FeatureFlags;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureFlags;
}
