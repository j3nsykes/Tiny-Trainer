// ============================================================================
// BLE Bridge Client Library
// ============================================================================
// Simple JavaScript client for connecting to BLE Tiny Motion Trainer
// Works with P5.js, vanilla JS, React, Vue, or any web framework
//
// Usage:
//   const bridge = new BLEBridge();
//   bridge.onData('device_1', (data) => {
//     console.log('Received:', data);
//   });
// ============================================================================

class BLEBridge {
    constructor(serverUrl = null) {
        // Auto-detect server URL from socket.io script tag
        if (!serverUrl) {
            const socketScript = document.querySelector('script[src*="socket.io"]');
            if (socketScript) {
                serverUrl = socketScript.src.match(/https?:\/\/[^\/]+/)[0];
            } else {
                serverUrl = 'http://localhost:3000';
            }
        }
        
        this.serverUrl = serverUrl;
        this.socket = null;
        this.dataCallbacks = new Map(); // deviceId -> callbacks[]
        this.statusCallbacks = new Map(); // deviceId -> callbacks[]
        
        // Data smoothing state
        this.smoothState = new Map(); // id -> lastValue
        this.stableState = new Map(); // id -> buffer[]
        this.kalmanState = new Map(); // id -> { x, p }
        
        this.connect();
    }
    
    // ========================================================================
    // Connection
    // ========================================================================
    
    connect() {
        if (typeof io === 'undefined') {
            console.error('❌ Socket.IO not loaded. Include <script src="http://localhost:3000/socket.io/socket.io.js"></script>');
            return;
        }
        
        this.socket = io(this.serverUrl);
        
        this.socket.on('connect', () => {
            console.log('✅ BLE Bridge connected to', this.serverUrl);
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ BLE Bridge disconnected');
        });
        
        this.socket.on('serial-data', (data) => {
            this.handleData(data.id, data.data);
        });
        
        this.socket.on('device-status', (status) => {
            this.handleStatus(status.id, status.status, status.port || '');
        });
    }
    
    // ========================================================================
    // Data Handling
    // ========================================================================
    
    onData(deviceId, callback) {
        if (!this.dataCallbacks.has(deviceId)) {
            this.dataCallbacks.set(deviceId, []);
        }
        this.dataCallbacks.get(deviceId).push(callback);
    }
    
    onStatus(deviceId, callback) {
        if (!this.statusCallbacks.has(deviceId)) {
            this.statusCallbacks.set(deviceId, []);
        }
        this.statusCallbacks.get(deviceId).push(callback);
    }
    
    handleData(deviceId, data) {
        // Handle wildcard listeners (*)
        if (this.dataCallbacks.has('*')) {
            this.dataCallbacks.get('*').forEach(callback => {
                callback(data, deviceId);
            });
        }
        
        // Handle specific device listeners
        if (this.dataCallbacks.has(deviceId)) {
            this.dataCallbacks.get(deviceId).forEach(callback => {
                callback(data);
            });
        }
    }
    
    handleStatus(deviceId, status, port) {
        // Handle wildcard listeners (*)
        if (this.statusCallbacks.has('*')) {
            this.statusCallbacks.get('*').forEach(callback => {
                callback(status, port, deviceId);
            });
        }
        
        // Handle specific device listeners
        if (this.statusCallbacks.has(deviceId)) {
            this.statusCallbacks.get(deviceId).forEach(callback => {
                callback(status, port);
            });
        }
    }
    
    // ========================================================================
    // Send Data
    // ========================================================================
    
    async send(deviceId, data) {
        try {
            const response = await fetch(`${this.serverUrl}/api/ble/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, data })
            });
            
            if (!response.ok) {
                throw new Error('Send failed');
            }
            
            return true;
        } catch (error) {
            console.error('Send error:', error);
            return false;
        }
    }
    
    // ========================================================================
    // Data Smoothing Functions
    // ========================================================================
    
    /**
     * Exponential Moving Average (EMA) - Best for potentiometers, sliders
     * @param {string} id - Unique identifier for this sensor
     * @param {number} value - Current raw value
     * @param {number} factor - Smoothing factor (0.0-1.0). Higher = smoother but slower
     * @returns {number} Smoothed value
     */
    smooth(id, value, factor = 0.8) {
        if (!this.smoothState.has(id)) {
            this.smoothState.set(id, value);
            return value;
        }
        
        const lastValue = this.smoothState.get(id);
        const smoothed = lastValue * factor + value * (1 - factor);
        this.smoothState.set(id, smoothed);
        
        return smoothed;
    }
    
    /**
     * Median Filter - Best for ultrasonic sensors, removes spikes
     * @param {string} id - Unique identifier for this sensor
     * @param {number} value - Current raw value
     * @param {number} frames - Number of frames to consider (default: 5)
     * @returns {number} Stable value (median)
     */
    stable(id, value, frames = 5) {
        if (!this.stableState.has(id)) {
            this.stableState.set(id, []);
        }
        
        const buffer = this.stableState.get(id);
        buffer.push(value);
        
        if (buffer.length > frames) {
            buffer.shift();
        }
        
        // Return median
        const sorted = [...buffer].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    }
    
    /**
     * 1D Kalman Filter - Best for tracking moving objects
     * @param {string} id - Unique identifier for this sensor
     * @param {number} value - Current raw value
     * @param {number} R - Measurement noise (default: 1). Higher = trust sensor less
     * @param {number} Q - Process noise (default: 0.1). Higher = expect more movement
     * @returns {number} Filtered value
     */
    kalman(id, value, R = 1, Q = 0.1) {
        if (!this.kalmanState.has(id)) {
            this.kalmanState.set(id, { x: value, p: 1 });
            return value;
        }
        
        const state = this.kalmanState.get(id);
        
        // Prediction
        const x_pred = state.x;
        const p_pred = state.p + Q;
        
        // Update
        const K = p_pred / (p_pred + R);
        const x_new = x_pred + K * (value - x_pred);
        const p_new = (1 - K) * p_pred;
        
        this.kalmanState.set(id, { x: x_new, p: p_new });
        
        return x_new;
    }
    
    /**
     * Reset smoothing state for a sensor
     * @param {string} id - Sensor identifier
     */
    resetSmoothing(id) {
        this.smoothState.delete(id);
        this.stableState.delete(id);
        this.kalmanState.delete(id);
    }
    
    /**
     * Reset all smoothing state
     */
    resetAllSmoothing() {
        this.smoothState.clear();
        this.stableState.clear();
        this.kalmanState.clear();
    }
    
    // ========================================================================
    // Advanced API (for programmatic control)
    // ========================================================================
    
    async getPorts() {
        // BLE doesn't have "ports" like USB serial
        // This returns available BLE devices
        console.warn('getPorts() not applicable for BLE. Use scan instead.');
        return [];
    }
    
    async startScanning() {
        try {
            const response = await fetch(`${this.serverUrl}/api/ble/scan/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to start scan');
            }
            
            return true;
        } catch (error) {
            console.error('Scan error:', error);
            return false;
        }
    }
    
    async stopScanning() {
        try {
            const response = await fetch(`${this.serverUrl}/api/ble/scan/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to stop scan');
            }
            
            return true;
        } catch (error) {
            console.error('Stop scan error:', error);
            return false;
        }
    }
    
    async connectBLE(deviceId, peripheralId, profile = 'nano-ble') {
        try {
            const response = await fetch(`${this.serverUrl}/api/ble/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, peripheralId, profile })
            });
            
            if (!response.ok) {
                throw new Error('Connection failed');
            }
            
            return true;
        } catch (error) {
            console.error('Connection error:', error);
            return false;
        }
    }
    
    async disconnectBLE(deviceId) {
        try {
            const response = await fetch(`${this.serverUrl}/api/ble/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId })
            });
            
            if (!response.ok) {
                throw new Error('Disconnection failed');
            }
            
            return true;
        } catch (error) {
            console.error('Disconnection error:', error);
            return false;
        }
    }
}

// ============================================================================
// Backwards Compatibility Alias
// ============================================================================

// Allow users to use either BLEBridge or SerialBridge
class SerialBridge extends BLEBridge {
    constructor(serverUrl) {
        super(serverUrl);
        console.warn('⚠️ SerialBridge is deprecated. Please use BLEBridge instead.');
    }
}

// ============================================================================
// Export for different module systems
// ============================================================================

// Browser global
if (typeof window !== 'undefined') {
    window.BLEBridge = BLEBridge;
    window.SerialBridge = SerialBridge; // Backwards compatibility
}

// CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BLEBridge;
}

// ES6 module
if (typeof exports !== 'undefined') {
    exports.BLEBridge = BLEBridge;
    exports.SerialBridge = SerialBridge;
}
